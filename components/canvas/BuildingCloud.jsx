'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { injectCurvature } from './curveWorld'

/*
 * BuildingCloud — one instance of the pre-sampled generic building cloud.
 *
 * The binary point data (/building-points.bin) is fetched, parsed and built
 * into a BufferGeometry exactly ONCE at module level; every instance shares
 * it. Each instance gets its own cheap material so reveals stay independent.
 *
 * Reveal: each building "grows" bottom-up out of the pavement the first time
 * the camera comes within range — beyond that range the distance fade hides
 * it anyway. The effect: the city keeps constructing itself just-in-time in
 * front of the visitor, for the entire journey, like an ongoing scan.
 *
 * Coordinate note: the source FBX is Z-up; converted on load to Y-up with
 * the base at local Y=0 and a height of 22 world units (before `scale`).
 */
const MODEL_HEIGHT = 22
const GROW_DUR     = 1.8     // seconds for one building to grow
const GROW_RANGE   = 115     // camera distance that triggers growth (≲ fade-out range)

let sharedGeometryPromise = null

function buildGeometry(buffer) {
  // Layout: [count u32][bounds 6×f32][positions count×3×f32][colors count×3×u8]
  const head   = new DataView(buffer)
  const count  = head.getUint32(0, true)
  const bounds = new Float32Array(buffer, 4, 6)            // minX,minY,minZ,maxX,maxY,maxZ
  const rawPos = new Float32Array(buffer, 28, count * 3)
  const rawCol = new Uint8Array(buffer, 28 + count * 12, count * 3)

  const [minX, minY, minZ, maxX, maxY, maxZ] = bounds
  const cx     = (minX + maxX) / 2
  const cy     = minZ                       // FBX Z-up: Z is height
  const cz     = -(minY + maxY) / 2
  const scale  = MODEL_HEIGHT / (maxZ - minZ)

  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const rnd = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const fx = rawPos[i * 3], fy = rawPos[i * 3 + 1], fz = rawPos[i * 3 + 2]
    pos[i * 3]     = (fx  - cx) * scale
    pos[i * 3 + 1] = (fz  - cy) * scale
    pos[i * 3 + 2] = (-fy - cz) * scale

    col[i * 3]     = (rawCol[i * 3]     / 255) * 0.65
    col[i * 3 + 1] = (rawCol[i * 3 + 1] / 255) * 0.65
    col[i * 3 + 2] = (rawCol[i * 3 + 2] / 255) * 0.65

    rnd[i * 3] = Math.random(); rnd[i * 3 + 1] = Math.random(); rnd[i * 3 + 2] = Math.random()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aRandVec', new THREE.BufferAttribute(rnd, 3))
  return geo
}

function loadBuildingGeometry() {
  if (!sharedGeometryPromise) {
    sharedGeometryPromise = fetch('/building-points.bin')
      .then(r => r.arrayBuffer())
      .then(buildGeometry)
  }
  return sharedGeometryPromise
}

export default function BuildingCloud({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  brightness = 1,
}) {
  const [geometry, setGeometry] = useState(null)
  const revealStart = useRef(null)
  const isExploring = useStore(s => s.isExploring)

  useEffect(() => {
    let alive = true
    loadBuildingGeometry().then(geo => { if (alive) setGeometry(geo) })
    return () => { alive = false }
  }, [])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: 0.18,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    mat.color.setScalar(brightness)

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime    = { value: 0 }
      shader.uniforms.uRevealY = { value: -1.5 }

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3 aRandVec;
uniform float uTime;
varying float vLocalY;
void main() {`
      )

      /* Tiny independent per-point drift — keeps the cloud alive while the
       * silhouette stays crisp. vLocalY drives the bottom-up growth. */
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phX = aRandVec.x * 6.2832;
        float spX = 0.10 + aRandVec.x * 0.15;
        float amX = 0.015 + aRandVec.x * 0.025;
        transformed.x += sin(uTime * spX          + phX) * amX
                       + sin(uTime * spX * 1.6180 + phX * 1.7) * amX * 0.5;

        float phY = aRandVec.y * 6.2832;
        float spY = 0.10 + aRandVec.y * 0.15;
        float amY = 0.015 + aRandVec.y * 0.025;
        transformed.y += sin(uTime * spY          + phY) * amY
                       + sin(uTime * spY * 1.6180 + phY * 1.7) * amY * 0.5;

        float phZ = aRandVec.z * 6.2832;
        float spZ = 0.10 + aRandVec.z * 0.15;
        float amZ = 0.015 + aRandVec.z * 0.025;
        transformed.z += sin(uTime * spZ          + phZ) * amZ
                       + sin(uTime * spZ * 1.6180 + phZ * 1.7) * amZ * 0.5;

        vLocalY = transformed.y;`
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vLocalY;
uniform float uRevealY;
void main() {`
      )

      /* Bottom-up growth: visible below the rising reveal line */
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `float revealFactor = 1.0 - smoothstep(uRevealY - 1.5, uRevealY + 1.5, vLocalY);
        diffuseColor.a    *= revealFactor;
        #include <alphatest_fragment>`
      )

      injectCurvature(shader)
      mat.userData.shader = shader
    }

    return mat
  }, [brightness])

  useFrame(({ clock, camera }) => {
    const shdr = material.userData.shader
    if (!shdr) return

    // Growth begins the first time the camera comes within range
    if (isExploring && revealStart.current === null) {
      const dx = camera.position.x - position[0]
      const dz = camera.position.z - position[2]
      if (dx * dx + dz * dz < GROW_RANGE * GROW_RANGE) {
        revealStart.current = clock.elapsedTime + 0.1
      }
    }

    if (revealStart.current !== null) {
      const t = THREE.MathUtils.clamp((clock.elapsedTime - revealStart.current) / GROW_DUR, 0, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      shdr.uniforms.uRevealY.value = -1.5 + eased * (MODEL_HEIGHT + 3)
    }

    shdr.uniforms.uTime.value = clock.elapsedTime
  })

  if (!geometry) return null

  return (
    <points
      geometry={geometry}
      material={material}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={scale}
    />
  )
}
