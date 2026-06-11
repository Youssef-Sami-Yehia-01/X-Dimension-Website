'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { injectCurvature } from './curveWorld'

/*
 * PyramidsCloud — a Giza-style trio rising from the desert, far off the
 * left side of the road. Unmistakably Egypt, visible from the crane shot
 * and the top-down aerial.
 *
 * Procedural: points are sampled uniformly across the four triangular
 * faces of each pyramid, with subtle course-banding so the masonry reads.
 * All three pyramids share one geometry → a single draw call.
 */

const PYRAMIDS = [
  { x: -60, z: -148, h: 24, base: 19, rotY: 0.5, count: 3400 },
  { x: -84, z: -170, h: 31, base: 25, rotY: 0.2, count: 4400 },
  { x: -46, z: -167, h: 12, base: 9.5, rotY: 0.8, count: 1500 },
]

function buildGeometry() {
  const pos = [], col = [], glo = []

  for (const p of PYRAMIDS) {
    const cosR = Math.cos(p.rotY), sinR = Math.sin(p.rotY)
    const apex = [0, p.h, 0]
    const c = [
      [-p.base, 0, -p.base], [p.base, 0, -p.base],
      [p.base, 0,  p.base], [-p.base, 0,  p.base],
    ]
    const faces = [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]]

    for (let i = 0; i < p.count; i++) {
      const [a, b] = faces[(Math.random() * 4) | 0]
      let u = Math.random(), v = Math.random()
      if (u + v > 1) { u = 1 - u; v = 1 - v }
      const w = 1 - u - v

      let x = a[0] * u + b[0] * v + apex[0] * w
      const y = a[1] * u + b[1] * v + apex[1] * w
      let z = a[2] * u + b[2] * v + apex[2] * w

      // Per-pyramid yaw, then world placement
      const rx = x * cosR - z * sinR
      const rz = x * sinR + z * cosR
      pos.push(p.x + rx, y + 0.1, p.z + rz)

      // Stone courses: alternating bands up the face + rare glints
      const band = Math.floor((y / p.h) * 16) % 2 === 0 ? 1.0 : 0.82
      const g = Math.pow(Math.random(), 2.8)
      const brightness = Math.min(1, (0.42 + (y / p.h) * 0.34) * band * (0.55 + g * g * 2.6))
      col.push(brightness * 0.84, brightness * 0.74, brightness * 0.58)
      glo.push(g)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(col), 3))
  geo.setAttribute('aGlow',    new THREE.BufferAttribute(new Float32Array(glo), 1))
  return geo
}

const FADE_DUR = 3.0

export default function PyramidsCloud() {
  const geometry = useMemo(() => buildGeometry(), [])
  const fadeStart   = useRef(null)
  const isExploring = useStore(s => s.isExploring)

  const material = useMemo(() => {
    // No glow sprite here: these are always 60+ units away, where sprite
    // mip-sampling makes 1–2px points nearly invisible. Plain points keep
    // the silhouettes reading at distance.
    const mat = new THREE.PointsMaterial({
      size: 0.34,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,            // revealed by the scan — never visible behind the intro
      alphaTest: 0.004,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute float aGlow;
void main() {`
      )
      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * (0.32 + aGlow * aGlow * 2.2);'
      )
      // Monuments read from further away than street furniture
      injectCurvature(shader, { fadeNear: 110, fadeFar: 230 })
      mat.userData.shader = shader
    }

    return mat
  }, [])

  useFrame(({ clock }) => {
    if (isExploring && fadeStart.current === null) fadeStart.current = clock.elapsedTime
    if (fadeStart.current !== null) {
      material.opacity = Math.min((clock.elapsedTime - fadeStart.current) / FADE_DUR, 1)
    }
  })

  return <points geometry={geometry} material={material} />
}
