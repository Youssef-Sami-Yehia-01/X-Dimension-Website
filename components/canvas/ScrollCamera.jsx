'use client'

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { sampleCamera, CAMERA_KEYFRAMES } from '@/config/journey'
import { prefersReducedMotion } from './reducedMotion'

/*
 * ScrollCamera — drives the camera along the journey's choreography.
 *
 * Two-stage smoothing:
 *   1. The raw scroll progress is lerped (exponential decay) into a smoothed
 *      progress value, THEN the camera path is sampled at that value. This
 *      keeps the camera exactly ON the authored path — lerping positions
 *      directly would cut corners on the arcs around Bayt Al-Umma.
 *   2. A subtle mouse-parallax sway is layered on top (position + gaze),
 *      so the frame always feels hand-held alive, never locked.
 *
 * While a project is open, ProjectCameraController owns the camera and this
 * component idles.
 */

const SWAY_POS  = prefersReducedMotion ? 0 : 0.55  // camera drift toward the cursor
const SWAY_LOOK = prefersReducedMotion ? 0 : 2.2   // gaze drift toward the cursor

export const START_POS  = new THREE.Vector3(...CAMERA_KEYFRAMES[0].pos)
export const START_LOOK = new THREE.Vector3(...CAMERA_KEYFRAMES[0].look)

export default function ScrollCamera() {
  const { camera } = useThree()
  const isExploring = useStore(s => s.isExploring)

  const smoothT  = useRef(0)
  const pos      = useRef(START_POS.clone())
  const look     = useRef(START_LOOK.clone())
  const mouse    = useRef({ x: 0, y: 0 })       // -1..1, smoothed
  const mouseRaw = useRef({ x: 0, y: 0 })

  // Scratch vectors — allocated once, reused every frame
  const right = useRef(new THREE.Vector3())
  const fwd   = useRef(new THREE.Vector3())
  const up    = useRef(new THREE.Vector3(0, 1, 0))
  const camP  = useRef(new THREE.Vector3())
  const lookP = useRef(new THREE.Vector3())

  useEffect(() => {
    const onMove = (e) => {
      mouseRaw.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseRaw.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useFrame((_, delta) => {
    if (!isExploring) return
    if (useStore.getState().projectState !== 'idle') return  // project controller owns camera

    // 1 — smooth the progress, then sample the authored path
    const targetT = THREE.MathUtils.clamp(useStore.getState().scrollProgress, 0, 1)
    const lf = 1 - Math.pow(0.004, delta)   // ≈0.58/frame @60fps: cinematic but responsive
    smoothT.current += (targetT - smoothT.current) * lf
    sampleCamera(smoothT.current, pos.current, look.current)

    // 2 — mouse sway in the camera's own frame (heavily smoothed)
    const ms = 1 - Math.pow(0.02, delta)
    mouse.current.x += (mouseRaw.current.x - mouse.current.x) * ms
    mouse.current.y += (mouseRaw.current.y - mouse.current.y) * ms

    fwd.current.subVectors(look.current, pos.current).normalize()
    right.current.crossVectors(fwd.current, up.current).normalize()

    camP.current.copy(pos.current)
      .addScaledVector(right.current, mouse.current.x * SWAY_POS)
      .addScaledVector(up.current,   -mouse.current.y * SWAY_POS * 0.6)

    lookP.current.copy(look.current)
      .addScaledVector(right.current, mouse.current.x * SWAY_LOOK)
      .addScaledVector(up.current,   -mouse.current.y * SWAY_LOOK * 0.6)

    camera.position.copy(camP.current)
    camera.lookAt(lookP.current)
  })

  return null
}
