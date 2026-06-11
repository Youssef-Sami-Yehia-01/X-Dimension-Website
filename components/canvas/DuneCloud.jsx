'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'
import { useStore } from '@/store/useStore'
import { injectCurvature } from './curveWorld'
import { injectMouseForce } from './mouseForce'
import { makeGlowSprite } from './pointSprite'
import { sweepFrontZ, SWEEP_START_Z } from './scanTiming'

/*
 * DuneCloud — the desert. TWO bands of it:
 *
 *   · the OPENING desert (z +36 … −6): the journey begins over open sand;
 *     near the start the dunes wash right across where the road will be,
 *     clearing as the street condenses out of the desert (see the matching
 *     morph in StreetCloud)
 *   · the MID-journey desert (z −96 … −196) between the city and the coast
 *
 * Simplex dunes: low and flat near the road shoulder, ridges further out.
 * Density ramps at every zone edge so transitions read as morphs, not seams.
 */

const X_INNER = 8      // dunes begin just past the road shoulder
const X_OUTER = 92
const AMP     = 5.2    // ridge height

const BANDS = [
  { z0:  36, z1:   -6, count:  8000, opening: true },
  { z0: -96, z1: -196, count: 16000, opening: false },
]

function buildGeometry() {
  const noise  = createNoise2D(() => 0.4213)   // deterministic — stable dunes
  const noise2 = createNoise2D(() => 0.8731)

  const pos = [], col = [], glo = [], rnd = []

  for (const band of BANDS) {
    for (let i = 0; i < band.count; i++) {
      const z = band.z0 - Math.random() * (band.z0 - band.z1)
      let x

      if (band.opening) {
        x = (Math.random() - 0.5) * X_OUTER * 2
        // Over the road corridor, sand only persists far back where the
        // street hasn't formed yet (StreetCloud's morph zone is z 4…26)
        if (Math.abs(x) < 7 && (z < 8 || Math.random() > (z - 8) / 28)) continue
      } else {
        const side = Math.random() < 0.5 ? -1 : 1
        x = side * (X_INNER + Math.pow(Math.random(), 1.25) * (X_OUTER - X_INNER))
        // Soft density ramp into the city zone
        if (z > band.z0 - 10 && Math.random() > (band.z0 - z) / 10) continue
      }

      // Both bands fade out softly at their city-side edge
      if (z < band.z1 + 8 && Math.random() > (z - band.z1) / 8) continue

      // Dunes flatten toward the road, rise away from it
      let lift = THREE.MathUtils.smoothstep(Math.abs(x), X_INNER, 34)
      if (band.opening) lift = Math.max(lift, 0.14)   // low sand wash everywhere
      const ridge = (noise(x * 0.022, z * 0.022) * 0.5 + 0.5) * AMP
      const grain = noise2(x * 0.14, z * 0.14) * 0.5
      const y = 0.1 + lift * ridge + grain * lift

      pos.push(x, y, z)

      // Warm sand, brighter on ridge crests; rare glinting grains
      const g = Math.pow(Math.random(), 2.6)
      const crest = 0.55 + (y / AMP) * 0.45
      const b = Math.min(1, crest * (0.35 + g * g * 2.4))
      col.push(b * 0.86, b * 0.72, b * 0.52)
      glo.push(g)
      rnd.push(Math.random(), Math.random(), Math.random())
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(col), 3))
  geo.setAttribute('aGlow',    new THREE.BufferAttribute(new Float32Array(glo), 1))
  geo.setAttribute('aRandVec', new THREE.BufferAttribute(new Float32Array(rnd), 3))
  return geo
}

export default function DuneCloud() {
  const geometry = useMemo(() => buildGeometry(), [])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: 0.34,
      sizeAttenuation: true,
      map: makeGlowSprite(),
      vertexColors: true,
      transparent: true,
      alphaTest: 0.004,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime    = { value: 0 }
      shader.uniforms.uRevealZ = { value: SWEEP_START_Z }

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3  aRandVec;
attribute float aGlow;
uniform float   uTime;
varying float   vWPosZ;
void main() {`
      )

      /* Barely-there shimmer — terrain breathes but doesn't blow around */
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = aRandVec.x * 6.2832;
        transformed.y += sin(uTime * (0.10 + aRandVec.y * 0.12) + ph) * 0.03;
        vWPosZ = transformed.z;`
      )

      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * (0.30 + aGlow * aGlow * 2.2);'
      )

      /* Sand reveals in the laser sweep's wake, like the street */
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vWPosZ;
uniform float uRevealZ;
void main() {`
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `diffuseColor.a *= smoothstep(uRevealZ - 3.0, uRevealZ + 3.0, vWPosZ);
        #include <alphatest_fragment>`
      )

      injectMouseForce(shader)
      injectCurvature(shader)
      mat.userData.shader = shader
    }

    return mat
  }, [])

  const revealStart = useRef(null)
  const isExploring = useStore(s => s.isExploring)

  useFrame(({ clock }) => {
    const shdr = material.userData.shader
    if (!shdr) return
    shdr.uniforms.uTime.value = clock.elapsedTime

    if (isExploring && revealStart.current === null) revealStart.current = clock.elapsedTime
    if (revealStart.current !== null) {
      shdr.uniforms.uRevealZ.value = sweepFrontZ(clock.elapsedTime - revealStart.current)
    }
  })

  return <points geometry={geometry} material={material} />
}
