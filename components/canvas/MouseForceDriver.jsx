'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mouseRay, updateMouseUniforms } from './mouseForce'

/*
 * MouseForceDriver — updates the shared cursor ray + strength every frame.
 *
 * Strength swells with mouse speed (pushing through the points feels like
 * stirring water) and relaxes to a soft ambient bubble when the cursor
 * rests. All opted-in shaders get their uniforms refreshed here, once.
 */

const AMBIENT = 0.15  // resting bubble strength
const MAX     = 0.85  // ceiling while the mouse is flying

export default function MouseForceDriver() {
  const raycaster = useRef(new THREE.Raycaster())
  const lastPointer = useRef(new THREE.Vector2(99, 99))

  useFrame(({ camera, pointer }, delta) => {
    // Cursor ray in world space
    raycaster.current.setFromCamera(pointer, camera)
    mouseRay.origin.copy(raycaster.current.ray.origin)
    mouseRay.dir.copy(raycaster.current.ray.direction)

    // Speed-driven strength with smooth decay
    const speed = lastPointer.current.distanceTo(pointer) / Math.max(delta, 1e-4)
    lastPointer.current.copy(pointer)

    const target = THREE.MathUtils.clamp(AMBIENT + speed * 0.9, AMBIENT, MAX)
    const rate = target > mouseRay.strength ? 10 : 2.2   // swell fast, settle slow
    mouseRay.strength += (target - mouseRay.strength) * Math.min(1, delta * rate)

    updateMouseUniforms()
  })

  return null
}
