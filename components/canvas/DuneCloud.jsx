'use client'

import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'
import { injectCurvature } from './curveWorld'
import { makeGlowSprite } from './pointSprite'

/*
 * DuneCloud — the desert zone (z −96 … −196).
 *
 * As the city falls away, simplex-noise dunes roll out on both sides of the
 * road: low and flat near the shoulder, building to ridges further out.
 * Density ramps in over the first few metres so the transition from
 * pavement to sand is seamless rather than a hard line.
 */

const COUNT     = 16000
const Z_START   = -96
const Z_END     = -196
const X_INNER   = 8      // desert begins just past the road shoulder
const X_OUTER   = 92
const AMP       = 5.2    // ridge height

function buildGeometry() {
  const noise  = createNoise2D(() => 0.4213)   // deterministic — stable dunes
  const noise2 = createNoise2D(() => 0.8731)

  const pos = [], col = [], glo = [], rnd = []

  for (let i = 0; i < COUNT; i++) {
    const side = Math.random() < 0.5 ? -1 : 1
    const x = side * (X_INNER + Math.pow(Math.random(), 1.25) * (X_OUTER - X_INNER))
    const z = Z_START - Math.random() * (Z_START - Z_END)

    // Soft density ramp into the city zone
    if (z > Z_START - 10 && Math.random() > (Z_START - z) / 10) continue

    // Dunes flatten toward the road, rise away from it
    const lift  = THREE.MathUtils.smoothstep(Math.abs(x), X_INNER, 34)
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
      shader.uniforms.uTime = { value: 0 }

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3  aRandVec;
attribute float aGlow;
uniform float   uTime;
void main() {`
      )

      /* Barely-there shimmer — terrain breathes but doesn't blow around */
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = aRandVec.x * 6.2832;
        transformed.y += sin(uTime * (0.10 + aRandVec.y * 0.12) + ph) * 0.03;`
      )

      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * (0.30 + aGlow * aGlow * 2.2);'
      )

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
