'use client'

import { useMemo, useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { injectCurvature, WORLD_CURVE } from './curveWorld'
import { sweepArrivalTime } from './scanTiming'

/*
 * BaytAlUmmaCloud — the heritage hero: a real scan of the House of the
 * Nation, standing on the LEFT side of the avenue (rotated 90° so its
 * facade faces the road — the camera glides past it, then arcs around to
 * face it in the Heritage beat).
 *
 * Data hygiene: like any real scan, the raw cloud contains stray points far
 * outside the building (a scanner-origin cluster plus scattered noise; the
 * villa itself is 257×126×58 model units inside an 800×490×58 bounding box).
 * Two crops (median ± k·MAD cluster isolation, then a building-core box
 * that trims the fuzzy garden vegetation), then surface-aware densification:
 * each echo is interpolated along a segment to a neighboring point, so new
 * points land on the actual walls and cornices rather than blurring out.
 *
 * Dot style intentionally matches CityBlocks (plain unsprited points, same
 * size, same gentle per-point drift) so the hero sits in the same visual
 * family as the rest of the skyline — just denser and a touch brighter.
 *
 * Interactions
 *   · hover  — the cloud warms toward laser-amber + cursor becomes pointer
 *   · click  — opens the project orbit view (ProjectCameraController)
 *
 * Reveal: grows bottom-up starting the moment the opening laser sweep
 * passes z = −55, like every other building in the city.
 *
 * Curvature: injected like the rest of the world, but smoothly disabled in
 * orbit mode so the building inspects true. Distance fade is pushed out
 * beyond orbit range (the hero never dissolves while being examined).
 */
const TARGET_HEIGHT = 20     // hero scale — facade detail readable from the road
const DATA_URL      = '/bayt-al-umma-points.bin'
const GROW_DUR      = 2.4
const ECHOES        = 9      // interpolated points added per source point (~56k total)
const NEIGHBOR_R    = 14     // model units — neighbor search radius for interpolation
const JITTER        = 0.05   // world units — residual scan-noise on echoes
const MAD_K         = 8      // crop radius in median-absolute-deviations

/* Stage-2 crop (model units): isolates the villa BUILDING from the estate.
 * The full cluster includes the garden + boundary wall — fuzzy vegetation
 * points that read as noise from the street. Derived from the data's
 * density histograms: building core lives at X −800…−678, Y 393…491. */
const CORE = { x0: -800, x1: -678, y0: 393, y1: 491 }

function median(values) {
  const s = Float32Array.from(values).sort()
  return s[s.length >> 1]
}

export const BUILDING_WORLD_X = -28
export const BUILDING_WORLD_Z = -55

const HOVER_COLOR = new THREE.Color(1.45, 1.05, 0.62)  // amber push (HDR-ish via additive)
const IDLE_COLOR  = new THREE.Color(1, 1, 1)

export default function BaytAlUmmaCloud() {
  const { gl } = useThree()
  const openProject  = useStore(s => s.openProject)
  const projectState = useStore(s => s.projectState)
  const isExploring  = useStore(s => s.isExploring)
  const [geo, setGeo] = useState(null)
  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)
  hoveredRef.current = hovered
  const revealStart = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch(DATA_URL)
      .then(r => r.arrayBuffer())
      .then((buffer) => {
        if (cancelled) return

        // Layout: [count u32][bounds 6×f32][positions ×f32][colors ×u8]
        const head   = new DataView(buffer)
        const count  = head.getUint32(0, true)
        const rawPos = new Float32Array(buffer, 28, count * 3)
        const rawCol = new Uint8Array(buffer, 28 + count * 12, count * 3)

        // Isolate the dominant cluster (the building) via median ± k·MAD —
        // robust against the scanner-origin cluster and stray noise points
        const axes = [[], [], []]
        for (let i = 0; i < count; i++) {
          axes[0].push(rawPos[i * 3]); axes[1].push(rawPos[i * 3 + 1]); axes[2].push(rawPos[i * 3 + 2])
        }
        const med = axes.map(median)
        const rad = axes.map((v, a) => Math.max(1, median(v.map(x => Math.abs(x - med[a])))) * MAD_K)

        const kept = []
        const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
        for (let i = 0; i < count; i++) {
          let ok = true
          for (let a = 0; a < 3; a++) {
            if (Math.abs(rawPos[i * 3 + a] - med[a]) > rad[a]) { ok = false; break }
          }
          if (!ok) continue
          // Stage 2: building core only (garden vegetation trimmed)
          const x = rawPos[i * 3], y = rawPos[i * 3 + 1]
          if (x < CORE.x0 || x > CORE.x1 || y < CORE.y0 || y > CORE.y1) continue
          kept.push(i)
          for (let a = 0; a < 3; a++) {
            const v = rawPos[i * 3 + a]
            if (v < lo[a]) lo[a] = v
            if (v > hi[a]) hi[a] = v
          }
        }

        // The scan is exported Z-up (like the city-block FBX): the density
        // histogram shows the ground slab at minZ and floor bands above it.
        // True shape: 257 long (X) × 126 deep (Y) × 58 tall (Z).
        // Stand it upright: world-up ← data Z, base on the ground.
        const cx  = (lo[0] + hi[0]) / 2
        const cy  = (lo[1] + hi[1]) / 2
        const loZ = lo[2]
        const s   = TARGET_HEIGHT / Math.max(0.001, hi[2] - lo[2])

        // ── Surface-aware densification ─────────────────────────────────
        // The core scan is only ~5.6k points — far too sparse for a hero
        // at this scale. Random jitter would blur it into fog; instead,
        // every echo is interpolated along the segment to a nearby point,
        // so new points land ON the walls, cornices and window reveals the
        // originals describe. A spatial hash makes the neighbor search O(n).
        const CELL = NEIGHBOR_R
        const grid = new Map()
        const keyOf = (x, y, z) =>
          `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`
        kept.forEach((i) => {
          const k = keyOf(rawPos[i * 3], rawPos[i * 3 + 1], rawPos[i * 3 + 2])
          if (!grid.has(k)) grid.set(k, [])
          grid.get(k).push(i)
        })
        const neighborsOf = (i) => {
          const x = rawPos[i * 3], y = rawPos[i * 3 + 1], z = rawPos[i * 3 + 2]
          const out = []
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const bucket = grid.get(`${Math.floor(x / CELL) + dx},${Math.floor(y / CELL) + dy},${Math.floor(z / CELL) + dz}`)
            if (!bucket) continue
            for (const j of bucket) {
              if (j === i) continue
              const ddx = rawPos[j * 3] - x, ddy = rawPos[j * 3 + 1] - y, ddz = rawPos[j * 3 + 2] - z
              if (ddx * ddx + ddy * ddy + ddz * ddz < NEIGHBOR_R * NEIGHBOR_R) out.push(j)
            }
          }
          return out
        }

        const total = kept.length * (1 + ECHOES)
        const pos = new Float32Array(total * 3)
        const col = new Float32Array(total * 3)
        const rnd = new Float32Array(total * 3)

        // Model → world transform (Z-up → Y-up, base at ground, centred)
        const toWorld = (i, t, j, out) => {
          // lerp between source point i and neighbor j at parameter t
          const mx = rawPos[i * 3]     + (rawPos[j * 3]     - rawPos[i * 3])     * t
          const my = rawPos[i * 3 + 1] + (rawPos[j * 3 + 1] - rawPos[i * 3 + 1]) * t
          const mz = rawPos[i * 3 + 2] + (rawPos[j * 3 + 2] - rawPos[i * 3 + 2]) * t
          out[0] = (mx - cx)  * s
          out[1] = (mz - loZ) * s
          out[2] = (my - cy)  * s
        }

        let w = 0
        const p = [0, 0, 0]
        for (const i of kept) {
          const nbrs = neighborsOf(i)
          const r = rawCol[i * 3] / 255, gc = rawCol[i * 3 + 1] / 255, b = rawCol[i * 3 + 2] / 255

          for (let m = 0; m <= ECHOES; m++) {
            if (m === 0 || nbrs.length === 0) {
              toWorld(i, 0, i, p)
            } else {
              const j = nbrs[(Math.random() * nbrs.length) | 0]
              toWorld(i, Math.random(), j, p)
            }
            const jit = m === 0 ? 0 : JITTER
            pos[w * 3]     = p[0] + (Math.random() - 0.5) * 2 * jit
            pos[w * 3 + 1] = p[1] + (Math.random() - 0.5) * 2 * jit
            pos[w * 3 + 2] = p[2] + (Math.random() - 0.5) * 2 * jit
            // Per-echo dimming keeps the dense additive cloud from
            // saturating — lands near the city blocks' tone, hero-bright
            const dim = 0.42 + Math.random() * 0.26
            col[w * 3] = r * dim; col[w * 3 + 1] = gc * dim; col[w * 3 + 2] = b * dim
            rnd[w * 3] = Math.random(); rnd[w * 3 + 1] = Math.random(); rnd[w * 3 + 2] = Math.random()
            w++
          }
        }

        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        g.setAttribute('color',    new THREE.BufferAttribute(col, 3))
        g.setAttribute('aRandVec', new THREE.BufferAttribute(rnd, 3))
        g.computeBoundingSphere()
        setGeo(g)
      })
    return () => { cancelled = true }
  }, [])

  const material = useMemo(() => {
    /* Same dot recipe as BuildingCloud: plain unsprited points, size 0.18 */
    const mat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime    = { value: 0 }
      shader.uniforms.uRevealY = { value: -1.5 }

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3 aRandVec;
uniform float uTime;
varying float vLocalY;
void main() {`
      )
      /* Identical gentle per-point drift to the city blocks */
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phX = aRandVec.x * 6.2832;
        float spX = 0.10 + aRandVec.x * 0.15;
        float amX = 0.015 + aRandVec.x * 0.025;
        transformed.x += sin(uTime * spX          + phX) * amX
                       + sin(uTime * spX * 1.6180 + phX * 1.7) * amX * 0.5;

        float phY = aRandVec.y * 6.2832;
        float spY = 0.10 + aRandVec.y * 0.15;
        float amY = 0.015 + aRandVec.y * 0.025;
        transformed.y += sin(uTime * spY          + phY) * amY
                       + sin(uTime * spY * 1.6180 + phY * 1.7) * amY * 0.5;

        float phZ = aRandVec.z * 6.2832;
        float spZ = 0.10 + aRandVec.z * 0.15;
        float amZ = 0.015 + aRandVec.z * 0.025;
        transformed.z += sin(uTime * spZ          + phZ) * amZ
                       + sin(uTime * spZ * 1.6180 + phZ * 1.7) * amZ * 0.5;

        vLocalY = transformed.y;`
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vLocalY;
uniform float uRevealY;
void main() {`
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `diffuseColor.a *= 1.0 - smoothstep(uRevealY - 1.5, uRevealY + 1.5, vLocalY);
        #include <alphatest_fragment>`
      )

      // Hero-specific fade range: far beyond orbit distance, so the
      // building never dissolves while being inspected.
      injectCurvature(shader, { fadeNear: 200, fadeFar: 420 })
      mat.userData.shader = shader
    }

    return mat
  }, [])

  useEffect(() => () => geo?.dispose(), [geo])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const canHover = projectState === 'idle'
    gl.domElement.style.cursor = (hovered && canHover) ? 'pointer' : 'auto'
    return () => { gl.domElement.style.cursor = 'auto' }
  }, [hovered, projectState, gl])

  useFrame(({ clock }, delta) => {
    const shdr = material.userData.shader
    if (shdr) shdr.uniforms.uTime.value = clock.elapsedTime

    // Bottom-up growth, synced to the opening laser sweep
    if (isExploring && revealStart.current === null) {
      revealStart.current = clock.elapsedTime + sweepArrivalTime(BUILDING_WORLD_Z)
    }
    if (shdr && revealStart.current !== null) {
      const t = THREE.MathUtils.clamp((clock.elapsedTime - revealStart.current) / GROW_DUR, 0, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      shdr.uniforms.uRevealY.value = -1.5 + eased * (TARGET_HEIGHT + 3)
    }

    // Flatten the world bend while orbiting so the scan inspects true
    if (shdr) {
      const targetCurve = useStore.getState().projectState === 'idle' ? WORLD_CURVE : 0
      const cur = shdr.uniforms.uCurve.value
      shdr.uniforms.uCurve.value += (targetCurve - cur) * Math.min(1, delta * 4)
    }

    // Hover feedback: warm toward laser-amber
    const wantHover = hoveredRef.current && useStore.getState().projectState === 'idle'
    material.color.lerp(wantHover ? HOVER_COLOR : IDLE_COLOR, Math.min(1, delta * 7))
    material.opacity += ((wantHover ? 1.0 : 0.9) - material.opacity) * Math.min(1, delta * 7)
  })

  if (!geo) return null

  return (
    /* Rotated 90°: the villa's length runs along the street (block ≈ z −24…−49,
       garden wall trailing to −86), its face turned toward the road. */
    <group
      position={[BUILDING_WORLD_X, 0.22, BUILDING_WORLD_Z]}
      rotation={[0, Math.PI / 2, 0]}
      onClick={() => { if (useStore.getState().projectState === 'idle') openProject('bayt-al-umma') }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <points geometry={geo} material={material} frustumCulled={false} />
    </group>
  )
}
