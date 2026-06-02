'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'
import { useStore } from '@/store/useStore'

/* --- config ---------------------------------------------------------------- */
const GRID_X      = 360           // 360×360 = ~130k points
const GRID_Z      = 360
const SPREAD      = 160
const HEIGHT      = 4.5
const NOISE_FREQ  = 0.018
const WAVE_AMP    = 0.5

const REVEAL_START = 22
const REVEAL_END   = -8
const REVEAL_DUR   = 3.8

/* -------------------------------------------------------------------------- */

function makeGlowSprite() {
  const SIZE = 128
  const canvas = document.createElement('canvas')
  canvas.width  = SIZE
  canvas.height = SIZE
  const ctx  = canvas.getContext('2d')
  const half = SIZE / 2
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)')
  grad.addColorStop(0.18, 'rgba(220, 238, 255, 0.85)')
  grad.addColorStop(0.45, 'rgba(150, 200, 255, 0.28)')
  grad.addColorStop(1.00, 'rgba(  0,   0,   0, 0.00)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SIZE, SIZE)
  return new THREE.CanvasTexture(canvas)
}

function buildTerrainGeometry() {
  const noise2D = createNoise2D()
  const count   = GRID_X * GRID_Z
  const pos     = new Float32Array(count * 3)
  const col     = new Float32Array(count * 3)
  const rnd     = new Float32Array(count * 3)  // per-axis animation seeds
  const glo     = new Float32Array(count)       // per-point glow intensity [0..1]
  const cellW   = SPREAD / GRID_X

  let i = 0
  for (let xi = 0; xi < GRID_X; xi++) {
    for (let zi = 0; zi < GRID_Z; zi++) {
      const bx = (xi / (GRID_X - 1) - 0.5) * SPREAD
      const bz = (zi / (GRID_Z - 1) - 0.5) * SPREAD
      const x  = bx + (Math.random() - 0.5) * cellW * 1.4
      const z  = bz + (Math.random() - 0.5) * cellW * 1.4

      const n0 = noise2D(xi * NOISE_FREQ,       zi * NOISE_FREQ)
      const n1 = noise2D(xi * NOISE_FREQ * 2.6, zi * NOISE_FREQ * 2.6) * 0.20
      const y  = (n0 + n1) * HEIGHT

      pos[i * 3]     = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z

      /* Base brightness from terrain height (peaks brighter than valleys) */
      const base = 0.55 + 0.45 * ((n0 + 1) * 0.5)

      /*
       * Per-point random glow factor — completely independent of terrain shape.
       * Range [0..1] where 0 = dim background sparkle, 1 = bright glowing star.
       * This is baked in once so the glow pattern never pulses uniformly.
       */
      const glowVal = Math.random()
      glo[i] = glowVal

      /* Colour brightness = base × glow multiplier (0.38 → 1.0) */
      const mult = 0.38 + glowVal * 0.62
      col[i * 3]     = Math.min(1.0, base * mult)
      col[i * 3 + 1] = Math.min(1.0, base * mult)
      col[i * 3 + 2] = Math.min(1.0, base * mult + 0.07)  /* faint cool tint */

      rnd[i * 3]     = Math.random()
      rnd[i * 3 + 1] = Math.random()
      rnd[i * 3 + 2] = Math.random()

      i++
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aRandVec', new THREE.BufferAttribute(rnd, 3))
  geo.setAttribute('aGlow',    new THREE.BufferAttribute(glo, 1))
  return geo
}

/* -------------------------------------------------------------------------- */

export default function TerrainCloud() {
  const meshRef     = useRef()
  const revealStart = useRef(null)
  const isExploring = useStore(s => s.isExploring)

  const geometry = useMemo(() => buildTerrainGeometry(), [])
  const sprite   = useMemo(() => makeGlowSprite(),       [])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: 0.44,
      sizeAttenuation: true,
      map: sprite,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.004,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime    = { value: 0 }
      shader.uniforms.uRevealY = { value: REVEAL_START }

      /* ── Vertex shader ──────────────────────────────────────────────── */
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3  aRandVec;
attribute float aGlow;      /* per-point glow intensity [0..1] */
uniform float   uTime;
varying float   vWPosY;
void main() {`
      )

      /* Independent 3-axis drift animation */
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phX = aRandVec.x * 6.2832;
        float spX = 0.11 + aRandVec.x * 0.18;
        float amX = 0.05 + aRandVec.x * 0.10;
        transformed.x += sin(uTime * spX         + phX) * amX
                       + sin(uTime * spX * 1.618 + phX * 1.7) * amX * 0.5;

        float phY = aRandVec.y * 6.2832;
        float spY = 0.11 + aRandVec.y * 0.18;
        float amY = 0.05 + aRandVec.y * 0.10;
        transformed.y += sin(uTime * spY         + phY) * amY
                       + sin(uTime * spY * 1.618 + phY * 1.7) * amY * 0.5;

        float phZ = aRandVec.z * 6.2832;
        float spZ = 0.11 + aRandVec.z * 0.18;
        float amZ = 0.05 + aRandVec.z * 0.10;
        transformed.z += sin(uTime * spZ         + phZ) * amZ
                       + sin(uTime * spZ * 1.618 + phZ * 1.7) * amZ * 0.5;

        vWPosY = transformed.y;`
      )

      /*
       * Per-point size variation using aGlow.
       * Bright points (aGlow ≈ 1) are 1.7× the base size → bigger halo.
       * Dim points  (aGlow ≈ 0) are 0.35× the base size → subtle sparkle.
       * Applied after size-attenuation so perspective scaling still works.
       */
      shader.vertexShader = shader.vertexShader.replace(
        '#include <sizeattenuation_vertex>',
        `#include <sizeattenuation_vertex>
        gl_PointSize *= (0.35 + aGlow * 1.35);`
      )

      /* ── Fragment shader ────────────────────────────────────────────── */
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vWPosY;
uniform float uRevealY;
void main() {`
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `float revealEdge   = 2.0;
        float revealFactor = smoothstep(uRevealY - revealEdge, uRevealY + revealEdge, vWPosY);
        diffuseColor.a    *= revealFactor;
        #include <alphatest_fragment>`
      )

      mat.userData.shader = shader
    }

    return mat
  }, [sprite])

  useFrame(({ clock }) => {
    const shdr = material.userData.shader
    if (!shdr) return

    if (isExploring && revealStart.current === null) {
      revealStart.current = clock.elapsedTime
    }

    if (revealStart.current !== null) {
      const t        = clock.elapsedTime - revealStart.current
      const progress = Math.min(t / REVEAL_DUR, 1.0)
      const eased    = 1 - Math.pow(1 - progress, 3)
      shdr.uniforms.uRevealY.value = REVEAL_START + (REVEAL_END - REVEAL_START) * eased
    }

    shdr.uniforms.uTime.value = clock.elapsedTime
  })

  return <points ref={meshRef} geometry={geometry} material={material} />
}
