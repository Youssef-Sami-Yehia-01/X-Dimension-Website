'use client'

/**
 * ModelCloud — generic particle-cloud renderer for any JSON produced by
 * tools/sample-fbx.mjs.
 *
 * Props:
 *   src         {string}  Path to the JSON file in /public  (e.g. "/bayt-al-umma.json")
 *   targetHeight{number}  World-space height to scale the model to (default 22)
 *   position    {array}   [x, y, z] world position (default [0, 0, 0])
 *   pointSize   {number}  Base point size (default 0.18)
 *   zUp         {boolean} If true, converts Z-up FBX coords to Y-up (default false)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'

const REVEAL_DUR = 3.8

export default function ModelCloud({
  src,
  targetHeight = 22,
  position     = [0, 0, 0],
  pointSize    = 0.18,
  zUp          = false,
}) {
  const [data, setData]   = useState(null)
  const meshRef           = useRef()
  const revealStart       = useRef(null)
  const isExploring       = useStore(s => s.isExploring)

  /* Derive reveal start Y from targetHeight so it always sits above the model */
  const REVEAL_START = targetHeight + 8
  const REVEAL_END   = -8

  useEffect(() => {
    fetch(src).then(r => r.json()).then(setData)
  }, [src])

  const geometry = useMemo(() => {
    if (!data) return null
    const { positions: rawPos, colors: rawCol, bounds, count } = data

    const cx = (bounds.minX + bounds.maxX) / 2
    const cz = (bounds.minZ + bounds.maxZ) / 2

    /* Z-up → Y-up conversion or straight Y-up */
    let modelH, cy
    if (zUp) {
      modelH = bounds.maxZ - bounds.minZ   // FBX Z was height
      cy     = bounds.minZ
    } else {
      modelH = bounds.maxY - bounds.minY
      cy     = bounds.minY
    }

    const scale = targetHeight / (modelH || 1)

    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const rnd = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const fx = rawPos[i * 3]
      const fy = rawPos[i * 3 + 1]
      const fz = rawPos[i * 3 + 2]

      if (zUp) {
        pos[i * 3]     = (fx - cx)  * scale
        pos[i * 3 + 1] = (fz - cy)  * scale
        pos[i * 3 + 2] = (-fy - (-(bounds.minY + bounds.maxY) / 2)) * scale
      } else {
        pos[i * 3]     = (fx - cx)  * scale
        pos[i * 3 + 1] = (fy - cy)  * scale
        pos[i * 3 + 2] = (fz - cz)  * scale
      }

      col[i * 3]     = rawCol[i * 3]     * 0.65
      col[i * 3 + 1] = rawCol[i * 3 + 1] * 0.65
      col[i * 3 + 2] = rawCol[i * 3 + 2] * 0.65

      rnd[i * 3]     = Math.random()
      rnd[i * 3 + 1] = Math.random()
      rnd[i * 3 + 2] = Math.random()
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
    geo.setAttribute('aRandVec', new THREE.BufferAttribute(rnd, 3))
    return geo
  }, [data, targetHeight, zUp])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: pointSize,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime    = { value: 0 }
      shader.uniforms.uRevealY = { value: REVEAL_START }

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute vec3 aRandVec;
uniform float uTime;
varying float vWPosY;
void main() {`
      )

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phX = aRandVec.x * 6.2832; float spX = 0.10 + aRandVec.x * 0.15; float amX = 0.015 + aRandVec.x * 0.025;
        transformed.x += sin(uTime*spX+phX)*amX + sin(uTime*spX*1.618+phX*1.7)*amX*0.5;
        float phY = aRandVec.y * 6.2832; float spY = 0.10 + aRandVec.y * 0.15; float amY = 0.015 + aRandVec.y * 0.025;
        transformed.y += sin(uTime*spY+phY)*amY + sin(uTime*spY*1.618+phY*1.7)*amY*0.5;
        float phZ = aRandVec.z * 6.2832; float spZ = 0.10 + aRandVec.z * 0.15; float amZ = 0.015 + aRandVec.z * 0.025;
        transformed.z += sin(uTime*spZ+phZ)*amZ + sin(uTime*spZ*1.618+phZ*1.7)*amZ*0.5;
        vWPosY = transformed.y;`
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vWPosY;
uniform float uRevealY;
void main() {`
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `float revealFactor = smoothstep(uRevealY - 2.0, uRevealY + 2.0, vWPosY);
        diffuseColor.a *= revealFactor;
        #include <alphatest_fragment>`
      )

      mat.userData.shader = shader
    }

    return mat
  }, [pointSize, REVEAL_START])

  useFrame(({ clock }) => {
    const shdr = material.userData.shader
    if (!shdr) return

    if (isExploring && revealStart.current === null) {
      revealStart.current = clock.elapsedTime
    }

    if (revealStart.current !== null) {
      const t       = clock.elapsedTime - revealStart.current
      const eased   = 1 - Math.pow(1 - Math.min(t / REVEAL_DUR, 1), 3)
      shdr.uniforms.uRevealY.value = REVEAL_START + (REVEAL_END - REVEAL_START) * eased
    }

    shdr.uniforms.uTime.value = clock.elapsedTime
  })

  if (!geometry) return null

  return (
    <points
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={position}
    />
  )
}
