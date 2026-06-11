'use client'

import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { CAMERA_KEYFRAMES } from '@/config/journey'
import StreetCloud from './StreetCloud'
import CityBlocks from './CityBlocks'
import DuneCloud from './DuneCloud'
import PyramidsCloud from './PyramidsCloud'
import OceanCloud from './OceanCloud'
import SandCloud from './SandCloud'
import ScanSweep from './ScanSweep'
import ScrollCamera from './ScrollCamera'
import MouseForceDriver from './MouseForceDriver'
import ScanPanels3D from './ScanPanels3D'
import SolidHeadlines from './SolidHeadlines'
import RoadMarkings from './RoadMarkings'
import BaytAlUmmaCloud from './BaytAlUmmaCloud'
import ProjectCameraController from './ProjectCameraController'
import styles from './Scene.module.css'

const START = CAMERA_KEYFRAMES[0]

/* Wider lens on portrait screens — keeps the world-anchored panels and the
 * road in frame when the viewport is tall and narrow. */
function ResponsiveFov() {
  const camera = useThree(s => s.camera)
  const size   = useThree(s => s.size)

  useEffect(() => {
    const fov = size.width / size.height < 0.8 ? 78 : 62
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }, [camera, size])

  return null
}

export default function Scene() {
  // Hide the world while inside a project — only the hero building stays.
  // Both swaps happen behind the black overlay so there's no visible pop.
  const projectState = useStore(s => s.projectState)
  const showWorld = projectState !== 'showing'

  return (
    <div className={styles.root}>
      <Canvas
        className={styles.canvas}
        camera={{ position: START.pos, fov: 62, near: 0.1, far: 500 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ scene, camera }) => {
          scene.background = null
          scene.fog = new THREE.FogExp2(0x151515, 0.02)
          camera.lookAt(...START.look)
          if (process.env.NODE_ENV !== 'production') window.__r3f = { scene, camera }
        }}
      >
        <ScrollCamera />
        <ProjectCameraController />
        <MouseForceDriver />
        <ResponsiveFov />

        {/* Everything below is hidden while orbiting a project */}
        {showWorld && <SandCloud />}
        {showWorld && <ScanSweep />}

        {/* In-world typography: section panels, hero headlines, survey marks */}
        {showWorld && (
          <Suspense fallback={null}>
            <ScanPanels3D />
            <SolidHeadlines />
            <RoadMarkings />
          </Suspense>
        )}

        {/* Bayt Al-Umma — always mounted so the fly-in animation works */}
        <BaytAlUmmaCloud />

        {/* Environment zones: city → desert → coast */}
        {showWorld && <StreetCloud />}
        {showWorld && <CityBlocks />}
        {showWorld && <DuneCloud />}
        {showWorld && <PyramidsCloud />}
        {showWorld && <OceanCloud />}
      </Canvas>
    </div>
  )
}
