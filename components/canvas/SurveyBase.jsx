'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

/*
 * SurveyBase — scanner base stations marked on the ground.
 *
 * A terrestrial laser scanner sweeps in circles around its tripod; these
 * stations leave that signature behind: concentric amber rings pulsing
 * gently on the sand, with a station label. One opens the journey in the
 * desert (the scan's origin), one closes it at the shoreline — the first
 * and last marks the survey crew left behind.
 */

const STATIONS = [
  { position: [11, 0.25,  16], label: 'BASE 01 · 30.0444 N · 31.2357 E' },   // Cairo
  { position: [-9, 0.25, -178], label: 'BASE 02 · 31.2001 N · 29.9187 E' },  // Alexandria
]

const RINGS = [3.2, 5.8, 8.6]
const SEGMENTS = 72

function ringGeometry(radius) {
  const pts = []
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2
    pts.push(Math.cos(a) * radius, 0, Math.sin(a) * radius)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
  return geo
}

function Station({ position, label }) {
  const matRefs = useRef([])
  const geometries = useMemo(() => RINGS.map(ringGeometry), [])

  /* Slow radar-style pulse travelling outward through the rings */
  useFrame(({ clock }) => {
    matRefs.current.forEach((m, i) => {
      if (!m) return
      const phase = clock.elapsedTime * 0.7 - i * 0.9
      m.opacity = 0.14 + Math.max(0, Math.sin(phase)) * 0.28
    })
  })

  return (
    <group position={position}>
      {geometries.map((geo, i) => (
        <line key={i} geometry={geo}>
          <lineBasicMaterial
            ref={(m) => { matRefs.current[i] = m }}
            color="#f5a623" transparent opacity={0.2} fog={false}
          />
        </line>
      ))}
      {/* Centre dot — the tripod position */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.35, 24]} />
        <meshBasicMaterial color="#f5a623" transparent opacity={0.8} fog={false} />
      </mesh>
      <Text
        font="/fonts/space-grotesk-500.woff"
        fontSize={0.55}
        color="#f5a623"
        fillOpacity={0.6}
        letterSpacing={0.12}
        anchorX="center"
        anchorY="middle"
        position={[0, 0.06, RINGS[2] + 1.6]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {label}
      </Text>
    </group>
  )
}

export default function SurveyBase() {
  return (
    <>
      {STATIONS.map(s => <Station key={s.label} {...s} />)}
    </>
  )
}
