'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { injectCurvature } from './curveWorld'

/*
 * DustCloud — slow-drifting dust motes filling the air above and around the
 * street. Fills the empty background with atmosphere and depth.
 *
 * Shape: each mote is shaped procedurally in the fragment shader from a
 * per-particle seed, giving an IRREGULAR organic splotch (not a circle or
 * square). No sprite texture — the seed wobbles the silhouette so every mote
 * looks different.
 *
 * Each mote floats independently (large, slow 3-axis drift) and shares the
 * scene's spherical curvature + horizon fade. Fades in once the user enters.
 */

const COUNT  = 2600
const X_SPAN = 110
const Y_MIN  = 0.5
const Y_MAX  = 42
const Z_NEAR = 30
const Z_FAR  = -200

const FADE_DUR = 2.6

function buildDustGeometry() {
  const pos = new Float32Array(COUNT * 3)
  const glo = new Float32Array(COUNT)
  const rnd = new Float32Array(COUNT * 3)

  for (let i = 0; i < COUNT; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * X_SPAN * 2
    pos[i * 3 + 1] = Y_MIN + Math.random() * (Y_MAX - Y_MIN)
    pos[i * 3 + 2] = Z_NEAR - Math.random() * (Z_NEAR - Z_FAR)

    glo[i] = Math.pow(Math.random(), 2.2)   // most dim, a few bright

    rnd[i * 3]     = Math.random()
    rnd[i * 3 + 1] = Math.random()
    rnd[i * 3 + 2] = Math.random()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aGlow',    new THREE.BufferAttribute(glo, 1))
  geo.setAttribute('aRandVec', new THREE.BufferAttribute(rnd, 3))
  return geo
}

export default function DustCloud() {
  const fadeStart   = useRef(null)
  const isExploring = useStore(s => s.isExploring)

  const geometry = useMemo(() => buildDustGeometry(), [])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: 0.5,                  // small motes (slightly bigger than before)
      sizeAttenuation: true,
      color: 0xece8df,
      transparent: true,
      alphaTest: 0.002,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }

      /* ── Vertex ──────────────────────────────────────────────────── */
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3  aRandVec;
attribute float aGlow;
uniform float   uTime;
varying float   vSeed;
void main() {`
      )

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSeed = aRandVec.x;
        float phX = aRandVec.x * 6.2832;
        float spX = 0.05 + aRandVec.x * 0.08;
        transformed.x += sin(uTime * spX + phX) * (0.8 + aRandVec.x * 1.2);

        float phY = aRandVec.y * 6.2832;
        float spY = 0.04 + aRandVec.y * 0.06;
        transformed.y += sin(uTime * spY + phY) * (0.5 + aRandVec.y * 0.8);

        float phZ = aRandVec.z * 6.2832;
        float spZ = 0.05 + aRandVec.z * 0.08;
        transformed.z += sin(uTime * spZ + phZ) * (0.8 + aRandVec.z * 1.2);`
      )

      /* Strong, even per-mote size variation. aRandVec.z is a uniform random
         so sizes spread evenly across the whole range (not clustered small);
         aGlow adds a little extra to the bright motes. */
      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * (0.4 + aRandVec.z * 1.4 + aGlow * 0.4);'
      )

      /* ── Fragment: irregular procedural silhouette ───────────────── */
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vSeed;
void main() {`
      )

      /*
       * Build an irregular blob from gl_PointCoord. The edge radius wobbles
       * with angle using three sine harmonics offset by the per-point seed,
       * so each mote has a unique lumpy outline with a soft fuzzy edge.
       */
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `vec2  pc  = gl_PointCoord - 0.5;
        float ang = atan(pc.y, pc.x);
        float rr  = length(pc) * 2.0;
        float wob = 0.60
                  + 0.22 * sin(ang * 3.0 + vSeed * 6.2832)
                  + 0.14 * sin(ang * 5.0 - vSeed * 11.0)
                  + 0.09 * sin(ang * 7.0 + vSeed * 19.0);
        float mask = smoothstep(wob, wob * 0.40, rr);
        diffuseColor.a *= mask;
        #include <alphatest_fragment>`
      )

      injectCurvature(shader)

      mat.userData.shader = shader
    }

    return mat
  }, [])

  useFrame(({ clock }) => {
    const shdr = material.userData.shader
    if (shdr) shdr.uniforms.uTime.value = clock.elapsedTime

    if (isExploring && fadeStart.current === null) fadeStart.current = clock.elapsedTime
    if (fadeStart.current !== null) {
      const t = Math.min((clock.elapsedTime - fadeStart.current) / FADE_DUR, 1)
      material.opacity = t * 0.32   // subtle
    }
  })

  return <points geometry={geometry} material={material} />
}
