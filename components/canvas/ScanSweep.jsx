'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { WORLD_CURVE } from './curveWorld'
import { sweepFrontZ, SWEEP_DUR, SWEEP_START_Z } from './scanTiming'

/*
 * ScanSweep — the visible laser line of the opening scan.
 *
 * A wide, thin curtain of amber light that travels down the avenue exactly
 * on the reveal front (see scanTiming.js), scanning the city into existence.
 * It is the ONLY amber element in the 3D world — the brand accent is
 * reserved for the laser itself.
 *
 * The curtain is subdivided and bent by the same spherical-world curvature
 * as the particles, so the line hugs the ground all the way to the horizon.
 */

const WIDTH    = 150
const HEIGHT   = 9
const FADE_IN  = 0.4   // seconds
const FADE_OUT = 0.8   // seconds at the end of the sweep

export default function ScanSweep() {
  const meshRef     = useRef()
  const matRef      = useRef()
  const startRef    = useRef(null)
  const isExploring = useStore(s => s.isExploring)

  const geometry = useMemo(() => new THREE.PlaneGeometry(WIDTH, HEIGHT, 96, 4), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uCurve:   { value: WORLD_CURVE },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */`
      uniform float uCurve;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // Same spherical-world bend as the point clouds
        mvPosition.y -= uCurve * (mvPosition.z * mvPosition.z
                                + mvPosition.x * mvPosition.x * 0.5);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        // Blazing core at the bottom edge, fading curtain rising above it
        float core    = exp(-vUv.y * 26.0);          // the laser line itself
        float curtain = exp(-vUv.y * 4.5) * 0.16;    // soft light wall above
        // Soften the left/right extremes
        float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);

        vec3 amber = vec3(1.0, 0.62, 0.13);
        vec3 hot   = vec3(1.0, 0.85, 0.55);          // whiter at the very core
        vec3 col   = mix(amber, hot, core);

        float a = (core + curtain) * edge * uOpacity;
        gl_FragColor = vec4(col, a);
      }
    `,
  }), [])

  useFrame(({ clock }) => {
    if (!isExploring) return
    if (startRef.current === null) startRef.current = clock.elapsedTime

    const t = clock.elapsedTime - startRef.current
    if (t > SWEEP_DUR + FADE_OUT) {
      if (meshRef.current) meshRef.current.visible = false
      return
    }

    const fadeIn  = Math.min(1, t / FADE_IN)
    const fadeOut = 1 - Math.min(1, Math.max(0, t - (SWEEP_DUR - FADE_OUT)) / FADE_OUT)
    material.uniforms.uOpacity.value = fadeIn * fadeOut

    if (meshRef.current) {
      meshRef.current.position.z = sweepFrontZ(t)
    }
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, HEIGHT / 2 + 0.05, SWEEP_START_Z]}
      renderOrder={999}
    />
  )
}
