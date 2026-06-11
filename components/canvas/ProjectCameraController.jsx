'use client'

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import { useStore } from '@/store/useStore'
import { BUILDING_WORLD_X, BUILDING_WORLD_Z } from './BaytAlUmmaCloud'

const GROUND_Y     = 0.22
const HALF_H       = 13               // BaytAlUmmaCloud TARGET_HEIGHT / 2
const BUILDING_CY  = GROUND_Y + HALF_H   // vertical center of cloud in world

// Camera keyframes for the fly-in / fly-out.
// The facade faces +X (toward the road), so the dive approaches from the
// road and the orbit view opens from the +X side, framing the full length.
const BUILDING_CENTER = new THREE.Vector3(BUILDING_WORLD_X, BUILDING_CY, BUILDING_WORLD_Z)
const CAM_SIDE  = new THREE.Vector3(  5,  6, -40)  // road side, turned toward building
const CAM_CLOSE = new THREE.Vector3(-12, 10, BUILDING_WORLD_Z) // right at the facade face
const CAM_ORBIT = new THREE.Vector3( 30, 17, BUILDING_WORLD_Z + 5)

const SCENE_DARK = 0x060608
const SCENE_FOG  = 0x151515

export default function ProjectCameraController() {
  const { camera, scene } = useThree()
  const projectState     = useStore(s => s.projectState)
  const onProjectShowing = useStore(s => s.onProjectShowing)
  const onProjectClosed  = useStore(s => s.onProjectClosed)

  const orbitRef = useRef()
  const proxy    = useRef({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 })
  const driving  = useRef(false)
  const savedPos  = useRef(new THREE.Vector3())
  const savedLook = useRef(new THREE.Vector3())
  const tl = useRef(null)

  useEffect(() => {
    if (projectState === 'entering') {
      // Remember where the road camera was
      savedPos.current.copy(camera.position)
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      savedLook.current.copy(camera.position).addScaledVector(dir, 15)

      // Seed the proxy at the current camera pose
      const p = proxy.current
      p.px = camera.position.x; p.py = camera.position.y; p.pz = camera.position.z
      p.lx = savedLook.current.x; p.ly = savedLook.current.y; p.lz = savedLook.current.z
      driving.current = true

      tl.current?.kill()
      tl.current = gsap.timeline()
        // Phase 1 (1.6 s): swing to the side of the road, lock gaze on building
        .to(p, {
          px: CAM_SIDE.x, py: CAM_SIDE.y, pz: CAM_SIDE.z,
          lx: BUILDING_CENTER.x, ly: BUILDING_CENTER.y, lz: BUILDING_CENTER.z,
          duration: 1.6, ease: 'power2.inOut',
        })
        // Phase 2 (1.1 s): fly straight into the building
        .to(p, {
          px: CAM_CLOSE.x, py: CAM_CLOSE.y, pz: CAM_CLOSE.z,
          duration: 1.1, ease: 'power2.in',
          onComplete: () => {
            // Overlay is fully black here — set up orbit view behind the curtain
            scene.background = new THREE.Color(SCENE_DARK)
            if (scene.fog) scene.fog.color.setHex(SCENE_DARK)

            camera.position.copy(CAM_ORBIT)
            camera.lookAt(BUILDING_CENTER)

            if (orbitRef.current) {
              orbitRef.current.target.copy(BUILDING_CENTER)
              orbitRef.current.update()
            }

            driving.current = false
            onProjectShowing()  // state → 'showing', overlay fades from black
          },
        })
    }

    if (projectState === 'exiting') {
      // Restore world behind the black overlay, snap camera to flying-out start
      scene.background = null
      if (scene.fog) scene.fog.color.setHex(SCENE_FOG)

      camera.position.copy(CAM_CLOSE)
      camera.lookAt(BUILDING_CENTER)

      const p = proxy.current
      p.px = CAM_CLOSE.x; p.py = CAM_CLOSE.y; p.pz = CAM_CLOSE.z
      p.lx = BUILDING_CENTER.x; p.ly = BUILDING_CENTER.y; p.lz = BUILDING_CENTER.z
      driving.current = true

      tl.current?.kill()
      tl.current = gsap.timeline({ delay: 0.5 }) // let overlay fade from black first
        // Phase 1 (1.0 s): pull back out of building
        .to(p, {
          px: CAM_SIDE.x, py: CAM_SIDE.y, pz: CAM_SIDE.z,
          duration: 1.0, ease: 'power2.out',
        })
        // Phase 2 (1.6 s): glide back to road position
        .to(p, {
          px: savedPos.current.x, py: savedPos.current.y, pz: savedPos.current.z,
          lx: savedLook.current.x, ly: savedLook.current.y, lz: savedLook.current.z,
          duration: 1.6, ease: 'power2.inOut',
          onComplete: () => {
            driving.current = false
            onProjectClosed()  // state → 'idle', ScrollCamera resumes
          },
        })
    }

    return () => tl.current?.kill()
  }, [projectState])

  useFrame(() => {
    if (!driving.current) return
    const p = proxy.current
    camera.position.set(p.px, p.py, p.pz)
    camera.lookAt(p.lx, p.ly, p.lz)
  })

  return (
    <OrbitControls
      ref={orbitRef}
      enabled={projectState === 'showing'}
      makeDefault={projectState === 'showing'}
      enableDamping
      dampingFactor={0.06}
      minDistance={12}
      maxDistance={170}
      minPolarAngle={0.15}
      maxPolarAngle={1.52}          /* never dive below ground level */
      autoRotate={projectState === 'showing'}
      autoRotateSpeed={0.5}
    />
  )
}
