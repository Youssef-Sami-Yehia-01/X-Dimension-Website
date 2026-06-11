'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { BUILDING_WORLD_Z } from './BaytAlUmmaCloud'

/*
 * InteractReticle — discoverability for the heritage case study.
 *
 * A small pulsing survey-target (corner brackets + centre dot) hovers over
 * the villa during the Heritage beat, billboarded at the camera. It IS the
 * affordance and the control: hovering brightens it, clicking enters the
 * scan — no lucky hover over the building required.
 */

const POSITION = new THREE.Vector3(-24, 23, BUILDING_WORLD_Z - 4)
const WINDOW = { start: 0.28, end: 0.50 }
const SIZE = 1.6
const ARM  = 0.65

export default function InteractReticle() {
  const groupRef = useRef()
  const matRef   = useRef()
  const dotRef   = useRef()
  const opacity  = useRef(0)
  const hovered  = useRef(false)
  const openProject = useStore(s => s.openProject)

  const geometry = useMemo(() => {
    const v = []
    const corner = (cx, cy, dx, dy) => {
      v.push(cx, cy, 0, cx + ARM * dx, cy, 0)
      v.push(cx, cy, 0, cx, cy + ARM * dy, 0)
    }
    corner(-SIZE,  SIZE,  1, -1); corner( SIZE,  SIZE, -1, -1)
    corner(-SIZE, -SIZE,  1,  1); corner( SIZE, -SIZE, -1,  1)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3))
    return g
  }, [])

  useFrame(({ clock, camera }, delta) => {
    const { isExploring, projectState, scrollProgress: p } = useStore.getState()
    const active = isExploring && projectState === 'idle' &&
                   p >= WINDOW.start && p < WINDOW.end

    const target = active ? 1 : 0
    opacity.current += (target - opacity.current) * Math.min(1, delta * 4)

    const g = groupRef.current
    if (!g) return
    g.visible = opacity.current > 0.02
    if (!g.visible) {
      if (!active) document.body.style.cursor = ''
      return
    }

    g.lookAt(camera.position)
    const pulse = 1 + Math.sin(clock.elapsedTime * 2.6) * 0.07
    g.scale.setScalar(pulse * (hovered.current ? 1.25 : 1))

    const base = hovered.current ? 1.0 : 0.55 + Math.sin(clock.elapsedTime * 2.6) * 0.18
    if (matRef.current) matRef.current.opacity = opacity.current * base
    if (dotRef.current) dotRef.current.opacity = opacity.current * base
  })

  const enter = () => {
    if (useStore.getState().projectState === 'idle' && opacity.current > 0.4) {
      openProject('bayt-al-umma')
    }
  }

  return (
    <group ref={groupRef} position={POSITION} visible={false} renderOrder={40}>
      <lineSegments geometry={geometry} renderOrder={40}>
        <lineBasicMaterial ref={matRef} color="#f5a623" transparent opacity={0}
          fog={false} depthTest={false} />
      </lineSegments>
      <mesh renderOrder={40}>
        <circleGeometry args={[0.16, 16]} />
        <meshBasicMaterial ref={dotRef} color="#f5a623" transparent opacity={0}
          fog={false} depthTest={false} />
      </mesh>
      {/* Generous invisible hit target */}
      <mesh
        onClick={enter}
        onPointerOver={() => { hovered.current = true; document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { hovered.current = false; document.body.style.cursor = '' }}
      >
        <planeGeometry args={[SIZE * 3.4, SIZE * 3.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
