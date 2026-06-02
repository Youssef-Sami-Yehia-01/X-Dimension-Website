'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import TerrainCloud from './TerrainCloud'
import BuildingCloud from './BuildingCloud'
import styles from './Scene.module.css'

/*
 * Scene — root R3F Canvas.
 *
 * Fog: FogExp2 with density 0.018.
 *   - Points within ~20 units: nearly clear
 *   - Points at ~60 units: ~75 % fogged → visibly dimming
 *   - Points at ~90 units: ~95 % fogged → vanishing into black
 * This replicates the Minecraft "render distance" fade without any hard cutoff.
 *
 * Background: solid black so fogged points blend seamlessly into the void.
 *
 * Camera: positioned above-and-behind, looking across the terrain at a slight
 * downward angle — gives the cinematic horizon effect.
 */
export default function Scene() {
  return (
    <div className={styles.root}>
      <Canvas
        camera={{ position: [0, 14, 42], fov: 55, near: 0.5, far: 400 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color(0x151515)
          /* Exponential fog — same colour as background so far points dissolve seamlessly */
          scene.fog = new THREE.FogExp2(0x151515, 0.018)
        }}
      >
        {/* OrbitControls for dev — lets you inspect the terrain freely */}
        <OrbitControls makeDefault dampingFactor={0.06} enablePan={false} />

        <TerrainCloud />
        <BuildingCloud />
      </Canvas>
    </div>
  )
}
