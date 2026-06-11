'use client'

import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { injectCurvature } from './curveWorld'
import { injectMouseForce } from './mouseForce'
import { makeGlowSprite } from './pointSprite'

/*
 * OceanCloud — the coastline finale (z −186 … −268).
 *
 * The journey's color script ends cool: after the cream city and the golden
 * desert, the road dissolves into a sea of blue points. Waves are computed
 * on the GPU (two crossing sine fields per point), crests brighten, and
 * rare glints sparkle like moonlight. The shoreline fades in over ~12 units
 * so sand and water interleave instead of meeting at a hard edge.
 *
 * The contact monument stands IN the water — the scan ends at the sea.
 */

const COUNT   = 15000
const Z_SHORE = -186
const Z_FAR   = -268
const X_SPAN  = 96

function buildGeometry() {
  const pos = [], col = [], glo = [], rnd = []

  for (let i = 0; i < COUNT; i++) {
    const x = (Math.random() - 0.5) * X_SPAN * 2
    const z = Z_SHORE - Math.random() * (Z_SHORE - Z_FAR)
    pos.push(x, 0, z)

    // Deep-to-light blue variation + rare bright glints
    const g = Math.pow(Math.random(), 2.7)
    const depth = 0.6 + Math.random() * 0.4
    const b = Math.min(1, depth * (0.38 + g * g * 2.6))
    col.push(b * 0.45, b * 0.62, b * 0.80)
    glo.push(g)
    rnd.push(Math.random(), Math.random(), Math.random())
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(col), 3))
  geo.setAttribute('aGlow',    new THREE.BufferAttribute(new Float32Array(glo), 1))
  geo.setAttribute('aRandVec', new THREE.BufferAttribute(new Float32Array(rnd), 3))
  return geo
}

export default function OceanCloud() {
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
      shader.uniforms.uTime = { value: 0 }

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3  aRandVec;
attribute float aGlow;
uniform float   uTime;
varying float   vShoreZ;
varying float   vCrest;
void main() {`
      )

      /* Two crossing wave fields + a long swell; crest passed to frag.
         Amplitudes match StreetCloud's shoreline morph so the road points
         and the sea points ride the same water. */
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = aRandVec.x * 6.2832;
        float w1 = sin(position.x * 0.20 + uTime * 0.85 + ph * 0.25);
        float w2 = sin(position.z * 0.15 - uTime * 0.62 + ph * 0.15);
        float w3 = sin((position.x + position.z) * 0.07 + uTime * 0.38);
        transformed.y += w1 * 0.45 + w2 * 0.50 + w3 * 0.55;
        vCrest  = (w1 + w2 + w3) / 3.0;
        vShoreZ = position.z;`
      )

      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * (0.30 + aGlow * aGlow * 2.4);'
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vShoreZ;
varying float vCrest;
void main() {`
      )

      /* Shoreline fade-in + crest brightening */
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `diffuseColor.a   *= smoothstep(${-Z_SHORE}.0, ${-Z_SHORE + 12}.0, -vShoreZ);
        diffuseColor.rgb *= 1.0 + max(vCrest, 0.0) * 0.55;
        #include <alphatest_fragment>`
      )

      injectMouseForce(shader)
      injectCurvature(shader)
      mat.userData.shader = shader
    }

    return mat
  }, [])

  useFrame(({ clock }) => {
    const shdr = material.userData.shader
    if (shdr) shdr.uniforms.uTime.value = clock.elapsedTime
  })

  return <points geometry={geometry} material={material} />
}
