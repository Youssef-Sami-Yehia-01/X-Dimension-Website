'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { injectCurvature } from './curveWorld'

/*
 * SandCloud — desert sand particles replacing the neutral dust atmosphere.
 *
 * Visual identity:
 *  · Warm sandy tan (#d4b896) vs. the cool cream of generic dust
 *  · Bimodal Y: 70 % of particles within 0–6 units of ground (blowing sand),
 *    30 % up to 18 units (airborne haze, depth fill)
 *  · Stronger X-axis drift — suggests a persistent desert crosswind
 *  · Weaker Y-axis drift  — sand stays low, not buoyant like smoke
 *  · Semi-granular particle shape: less lumpy than dust, more uniform grain
 *
 * Everything else (curvature injection, horizon fade, reveal fade-in,
 * additive blending) mirrors DustCloud so the scene stays consistent.
 */

const COUNT    = 3400
const X_SPAN   = 110
const Z_NEAR   = 30
const Z_FAR    = -185   // the dusty air ends at the shoreline — sea air is clear
const FADE_DUR = 2.8

function buildGeometry() {
  const pos = new Float32Array(COUNT * 3)
  const glo = new Float32Array(COUNT)
  const rnd = new Float32Array(COUNT * 3)

  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * X_SPAN * 2

    // Bimodal altitude: most sand near the ground
    pos[i * 3 + 1] = Math.random() < 0.70
      ? Math.random() * 6
      : 6 + Math.random() * 12

    pos[i * 3 + 2] = Z_NEAR - Math.random() * (Z_NEAR - Z_FAR)

    glo[i] = Math.pow(Math.random(), 2.0)  // rare bright sparkles

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

export default function SandCloud() {
  const fadeStart   = useRef(null)
  const isExploring = useStore(s => s.isExploring)

  const geometry = useMemo(() => buildGeometry(), [])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: 0.42,               // kept subtle — atmosphere, never noise
      sizeAttenuation: true,
      color: 0xd4b896,          // warm sandy tan
      transparent: true,
      alphaTest: 0.002,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }

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

        // Desert crosswind: dominant X drift, light Y float, gentle Z carry
        float phX = aRandVec.x * 6.2832;
        float spX = 0.06 + aRandVec.x * 0.10;
        transformed.x += sin(uTime * spX + phX) * (1.3 + aRandVec.x * 1.6);

        float phY = aRandVec.y * 6.2832;
        float spY = 0.025 + aRandVec.y * 0.035;
        transformed.y += sin(uTime * spY + phY) * (0.15 + aRandVec.y * 0.35);

        float phZ = aRandVec.z * 6.2832;
        float spZ = 0.04 + aRandVec.z * 0.06;
        transformed.z += sin(uTime * spZ + phZ) * (0.5 + aRandVec.z * 0.7);`
      )

      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * (0.4 + aRandVec.z * 0.8 + aGlow * 0.4);'
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vSeed;
void main() {`
      )

      // Slightly rounder grain shape than dust — less organic wobble
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `vec2  pc  = gl_PointCoord - 0.5;
        float ang = atan(pc.y, pc.x);
        float rr  = length(pc) * 2.0;
        float wob = 0.72
                  + 0.14 * sin(ang * 3.0 + vSeed * 6.2832)
                  + 0.07 * sin(ang * 5.0 - vSeed * 9.0);
        float mask = smoothstep(wob, wob * 0.48, rr);
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
      material.opacity = t * 0.28
    }
  })

  return <points geometry={geometry} material={material} />
}
