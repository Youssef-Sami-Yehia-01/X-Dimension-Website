'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import StreetCloud from './StreetCloud'
import BuildingCloud from './BuildingCloud'
import DustCloud from './DustCloud'
import styles from './Scene.module.css'

/*
 * Scene — street view.
 *
 * The camera sits at street level looking down the road (Z axis).
 * Street runs from Z = +30 (behind camera) to Z = -200 (horizon).
 *
 * Left side:  building placeholder (will become proper models later).
 * Right side: empty — reserved for 3D text sections.
 *
 * Fog colour matches #151515 background so distant particles dissolve
 * seamlessly into the scene background.
 */
export default function Scene() {
  return (
    <div className={styles.root}>
      <Canvas
        className={styles.canvas}
        camera={{ position: [0, 2.5, 20], fov: 62, near: 0.1, far: 500 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ scene, camera }) => {
          /* Transparent canvas so the smoke layer shows through where the
             scene fades out. Fog still tints particles toward the bg colour. */
          scene.background = null
          scene.fog = new THREE.FogExp2(0x151515, 0.02)
          camera.lookAt(0, 1.5, -80)
        }}
      >
        <OrbitControls
          makeDefault
          target={[0, 1.5, -20]}
          dampingFactor={0.06}
          enablePan={true}
        />

        {/* Floating dust/atmosphere filling the air */}
        <DustCloud />

        {/* The street: 2-lane road + kerbs + pavements */}
        <StreetCloud />

        {/*
         * Left-side building placeholders — repeated down the road.
         * x ≈ −(3.5 road + 0.18 kerb + 6 pavement + gap) ≈ −13
         * Slight X variation per instance so they don't look cloned.
         */}
        <BuildingCloud position={[-13,   0.22,  -30]} />
        <BuildingCloud position={[-13.5, 0.22,  -80]} />
        <BuildingCloud position={[-12.5, 0.22, -130]} />
        <BuildingCloud position={[-13,   0.22, -175]} />
      </Canvas>
    </div>
  )
}
