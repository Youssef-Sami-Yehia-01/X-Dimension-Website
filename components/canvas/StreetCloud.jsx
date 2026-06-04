'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { injectCurvature } from './curveWorld'

/* ── Street dimensions ──────────────────────────────────────────────────── */
const HALF_ROAD  = 3.5    // half road width → total road = 7 units (2 lanes)
const CURB_H     = 0.22
const CURB_W     = 0.18
const SWALK_W    = 60.0   // very wide pavements
const SWALK_Y    = 0.22
const Z_NEAR     = 30
const Z_FAR      = -200
const Z_RANGE    = Z_NEAR - Z_FAR   // 230 units

/* ── Warm off-white tint ─────────────────────────────────────────────────
 * R:G:B = 1 : 0.93 : 0.84  →  pure white becomes a warm cream/beige.
 * Applied to every particle so the whole scene feels consistent.          */
const TINT_R = 1.00
const TINT_G = 0.97
const TINT_B = 0.93

/* ── Reveal ─────────────────────────────────────────────────────────────── */
const REVEAL_START = Z_NEAR + 2
const REVEAL_END   = Z_FAR  - 2
const REVEAL_DUR   = 3.5

/* -------------------------------------------------------------------------- */

function makeGlowSprite() {
  const SIZE = 64
  const canvas = document.createElement('canvas')
  canvas.width = SIZE; canvas.height = SIZE
  const ctx = canvas.getContext('2d'), half = SIZE / 2
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0.00, 'rgba(255,255,252,1.0)')   /* near-white core */
  grad.addColorStop(0.20, 'rgba(248,244,235,0.78)')  /* very faint warm halo */
  grad.addColorStop(0.50, 'rgba(220,215,200,0.18)')  /* subtle beige fade */
  grad.addColorStop(1.00, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SIZE, SIZE)
  return new THREE.CanvasTexture(canvas)
}

function buildStreetGeometry() {
  const pos = [], col = [], glo = [], rnd = []

  /*
   * Add one particle.
   * jitterX / jitterZ control how far from the nominal grid position
   * the point can land — large values break up the grid pattern.
   */
  function pt(x, y, z,  brightness, brightVar,  glowMin,  jx = 0.25, jz = 0.45) {
    pos.push(
      x + (Math.random() - 0.5) * jx * 2,
      y + (Math.random() - 0.5) * 0.04,
      z + (Math.random() - 0.5) * jz * 2
    )

    /*
     * Glow value drives BOTH colour-brightness and point size (re-coupled,
     * like the terrain). A power curve (^2.5) keeps most points dim while a
     * rare few spike toward 1.0 — those become the bright "stars" that give
     * the laser-scan sparkle. glowMin lifts the floor for elements that
     * should read uniformly bright (kerbs, lane dashes).
     */
    const g = Math.min(1, glowMin + Math.pow(Math.random(), 2.5) * (1 - glowMin))

    /* Brightness coupled to glow: dim base, bright stars pop hard */
    const b = Math.max(0, Math.min(1,
      brightness * (0.5 + g * g * 3.0) + (Math.random() - 0.5) * brightVar
    ))

    col.push(
      Math.min(1, b * TINT_R),
      Math.min(1, b * TINT_G),
      Math.min(1, b * TINT_B)
    )
    glo.push(g)
    rnd.push(Math.random(), Math.random(), Math.random())
  }

  /*
   * Road + pavements use randomised row spacing so there is no visible
   * Z-rhythm. Each "row" picks a random Z within its allocated slice.
   */
  const Z_ROWS   = 500          // more rows = denser street
  const interval = Z_RANGE / Z_ROWS

  for (let row = 0; row < Z_ROWS; row++) {
    /* Random Z inside the row's slice — removes the regular Z-rhythm */
    const z = Z_NEAR - row * interval - Math.random() * interval

    /* ── Road surface (2 lanes) ──────────────────────────────────── */
    const ROAD_COLS = 42
    for (let c = 0; c < ROAD_COLS; c++) {
      const x = -HALF_ROAD + (c / (ROAD_COLS - 1)) * HALF_ROAD * 2
      pt(x, 0, z,  0.20, 0.08,  0.05)
    }

    /* ── Extra random scatter on road ────────────────────────────── */
    const scatter = Math.floor(5 + Math.random() * 6)   // 5–10 random pts
    for (let s = 0; s < scatter; s++) {
      const x = -HALF_ROAD + Math.random() * HALF_ROAD * 2
      pt(x, 0, z,  0.18, 0.06,  0.04,  0.04, 0.10)
    }

    /* ── Kerb — left & right ─────────────────────────────────────── */
    const CURB_STEPS = 8
    for (let s = 0; s < CURB_STEPS; s++) {
      const cy = (s / (CURB_STEPS - 1)) * CURB_H
      const cx = CURB_W * (s / CURB_STEPS)
      pt(-HALF_ROAD - cx, cy, z,  0.45, 0.10,  0.35,  0.06, 0.30)
      pt( HALF_ROAD + cx, cy, z,  0.45, 0.10,  0.35,  0.06, 0.30)
    }

    /* ── Wide pavements ──────────────────────────────────────────── */
    const SWALK_COLS = 160       // 160 cols × 60 units ≈ one point every 0.375 units
    const swalkBase  = HALF_ROAD + CURB_W
    for (let c = 0; c < SWALK_COLS; c++) {
      const t  = c / (SWALK_COLS - 1)
      pt(-(swalkBase + t * SWALK_W), SWALK_Y, z,  0.26, 0.08,  0.12)
      pt( (swalkBase + t * SWALK_W), SWALK_Y, z,  0.26, 0.08,  0.12)
    }

    /* Extra scatter on pavements */
    for (let s = 0; s < 20; s++) {
      pt(-(swalkBase + Math.random() * SWALK_W), SWALK_Y, z,  0.22, 0.06,  0.08,  0.08, 0.12)
      pt( (swalkBase + Math.random() * SWALK_W), SWALK_Y, z,  0.22, 0.06,  0.08,  0.08, 0.12)
    }
  }

  /* ── Centre lane dashes ──────────────────────────────────────────────── */
  const DASH_LEN = 3.0, GAP_LEN = 2.5, DASH_PTS = 10
  let z = Z_NEAR
  while (z > Z_FAR) {
    for (let j = 0; j < DASH_PTS; j++) {
      pt(0, 0.02, z - (j / (DASH_PTS - 1)) * DASH_LEN,  0.72, 0.14,  0.55,  0.06, 0.08)
    }
    z -= DASH_LEN + GAP_LEN
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(col), 3))
  geo.setAttribute('aGlow',    new THREE.BufferAttribute(new Float32Array(glo), 1))
  geo.setAttribute('aRandVec', new THREE.BufferAttribute(new Float32Array(rnd), 3))
  return geo
}

/* -------------------------------------------------------------------------- */

export default function StreetCloud() {
  const meshRef     = useRef()
  const revealStart = useRef(null)
  const isExploring = useStore(s => s.isExploring)

  const geometry = useMemo(() => buildStreetGeometry(), [])
  const sprite   = useMemo(() => makeGlowSprite(),      [])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: 0.32,
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
      shader.uniforms.uRevealZ = { value: REVEAL_START }

      /* ── Vertex ──────────────────────────────────────────────────── */
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3  aRandVec;
attribute float aGlow;
uniform float   uTime;
varying float   vWPosZ;
void main() {`
      )

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        /* Full independent 3-axis animation — same as terrain */
        float phX = aRandVec.x * 6.2832;
        float spX = 0.11 + aRandVec.x * 0.18;
        float amX = 0.05 + aRandVec.x * 0.10;
        transformed.x += sin(uTime * spX          + phX) * amX
                       + sin(uTime * spX * 1.618   + phX * 1.7) * amX * 0.5;

        float phY = aRandVec.y * 6.2832;
        float spY = 0.11 + aRandVec.y * 0.18;
        float amY = 0.05 + aRandVec.y * 0.10;
        transformed.y += sin(uTime * spY          + phY) * amY
                       + sin(uTime * spY * 1.618   + phY * 1.7) * amY * 0.5;

        float phZ = aRandVec.z * 6.2832;
        float spZ = 0.11 + aRandVec.z * 0.18;
        float amZ = 0.05 + aRandVec.z * 0.10;
        transformed.z += sin(uTime * spZ          + phZ) * amZ
                       + sin(uTime * spZ * 1.618   + phZ * 1.7) * amZ * 0.5;

        vWPosZ = transformed.z;`
      )

      /*
       * Per-point size variation — quadratic so bright stars are clearly
       * bigger. NOTE: this version of three has no <sizeattenuation_vertex>
       * chunk; size is set via `gl_PointSize = size;`, so we scale that
       * directly. Perspective attenuation runs afterward and still applies.
       */
      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * (0.30 + aGlow * aGlow * 2.4);'
      )

      /* ── Fragment ────────────────────────────────────────────────── */
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vWPosZ;
uniform float uRevealZ;
void main() {`
      )

      /* Near-to-far reveal */
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `float revealFactor = smoothstep(uRevealZ - 8.0, uRevealZ + 8.0, vWPosZ);
        diffuseColor.a *= revealFactor;
        #include <alphatest_fragment>`
      )

      /* Spherical-world bend (must come after the edits above) */
      injectCurvature(shader)

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
      const eased = 1 - Math.pow(1 - Math.min((clock.elapsedTime - revealStart.current) / REVEAL_DUR, 1), 3)
      shdr.uniforms.uRevealZ.value = REVEAL_START + (REVEAL_END - REVEAL_START) * eased
    }

    shdr.uniforms.uTime.value = clock.elapsedTime
  })

  return <points ref={meshRef} geometry={geometry} material={material} />
}
