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
 * The loader isolates the dominant cluster with a median ± k·MAD crop, then
 * densifies the kept points 4× with millimetre-scale jitter — reads as scan
 * noise up close, and keeps the hero visible from across the street.
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
const TARGET_HEIGHT = 14     // two-storey villa — broad presence, honest scale
const DATA_URL      = '/bayt-al-umma-points.bin'
const GROW_DUR      = 2.4
const DENSIFY       = 4      // extra jittered copies per source point
const JITTER        = 0.11   // world units — scan-noise scale
const MAD_K         = 8      // crop radius in median-absolute-deviations

function median(values) {
  const s = Float32Array.from(values).sort()
  return s[s.length >> 1]
}

export const BUILDING_WORLD_X = -22.5
export const BUILDING_WORLD_Z = -55

const HOVER_COLOR = new THREE.Color(1.45, 1.05, 0.62)  // amber push (HDR-ish via additive)
const IDLE_COLOR  = new THREE.Color(1, 1, 1)

function makeSprite() {
  const s = 32
  const canvas = document.createElement('canvas')
  canvas.width = s; canvas.height = s
  const ctx = canvas.getContext('2d'), half = s / 2
  const g = ctx.createRadialGradient(half, half, 0, half, half, half)
  g.addColorStop(0.00, 'rgba(255,255,252,1.0)')
  g.addColorStop(0.20, 'rgba(248,244,235,0.78)')
  g.addColorStop(0.50, 'rgba(220,215,200,0.18)')
  g.addColorStop(1.00, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s)
  return new THREE.CanvasTexture(canvas)
}

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

        // Densified output: each kept point + DENSIFY jittered echoes.
        // Base sits at local Y = 0 (ground), centred on X/Z.
        const total = kept.length * (1 + DENSIFY)
        const pos = new Float32Array(total * 3)
        const col = new Float32Array(total * 3)
        const glo = new Float32Array(total)
        let w = 0
        for (const i of kept) {
          const bx = (rawPos[i * 3]     - cx)  * s   // length ← data X
          const by = (rawPos[i * 3 + 2] - loZ) * s   // height ← data Z, base at 0
          const bz = (rawPos[i * 3 + 1] - cy)  * s   // depth  ← data Y
          const r = rawCol[i * 3] / 255, gc = rawCol[i * 3 + 1] / 255, b = rawCol[i * 3 + 2] / 255

          for (let m = 0; m <= DENSIFY; m++) {
            const j = m === 0 ? 0 : JITTER
            pos[w * 3]     = bx + (Math.random() - 0.5) * 2 * j
            pos[w * 3 + 1] = by + (Math.random() - 0.5) * 2 * j
            pos[w * 3 + 2] = bz + (Math.random() - 0.5) * 2 * j
            // Per-echo dimming keeps the densified cloud from saturating
            // under additive blending; rare bright "stars" via aGlow
            const dim = 0.5 + Math.random() * 0.3
            col[w * 3] = r * dim; col[w * 3 + 1] = gc * dim; col[w * 3 + 2] = b * dim
            glo[w] = Math.pow(Math.random(), 2.6)
            w++
          }
        }

        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        g.setAttribute('color',    new THREE.BufferAttribute(col, 3))
        g.setAttribute('aGlow',    new THREE.BufferAttribute(glo, 1))
        g.computeBoundingSphere()
        setGeo(g)
      })
    return () => { cancelled = true }
  }, [])

  const sprite = useMemo(() => makeSprite(), [])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      map: sprite,
      size: 0.21,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      alphaTest: 0.004,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRevealY = { value: -1.5 }

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute float aGlow;
varying float vLocalY;
void main() {`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLocalY = transformed.y;`
      )
      /* Mostly small points with rare bright stars — the laser-scan sparkle */
      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * (0.45 + aGlow * aGlow * 2.6);'
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
  }, [sprite])

  useEffect(() => () => geo?.dispose(), [geo])
  useEffect(() => () => { sprite.dispose(); material.dispose() }, [sprite, material])

  useEffect(() => {
    const canHover = projectState === 'idle'
    gl.domElement.style.cursor = (hovered && canHover) ? 'pointer' : 'auto'
    return () => { gl.domElement.style.cursor = 'auto' }
  }, [hovered, projectState, gl])

  useFrame(({ clock }, delta) => {
    const shdr = material.userData.shader

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
    /* Rotated 90°: the facade's 65-unit length runs along the street (z −22…−88),
       its face turned toward the road. */
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
