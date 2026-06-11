'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import { useStore } from '@/store/useStore'
import { injectCurvature } from './curveWorld'

/*
 * TextMesh3D — particle text that assembles from scattered points.
 *
 * Each line is sampled from extruded glyph surfaces; particles fly in along
 * individual bezier arcs (bottom-up reveal) when the section first scrolls
 * into view, then float gently forever — leaving the words standing in the
 * world like scan annotations the visitor has left behind.
 *
 * Props (all authored in config/journey.js):
 *   lines          [{ text, size, depth, count }]
 *   position       world position of the text block centre
 *   rotation       XYZ euler — e.g. [-PI/2,0,0] paints the text on the ground
 *   pointSize      base particle size
 *   scrollStart/End  progress window that triggers assembly
 *   assembleDelay  seconds to wait after the window is entered
 *
 * Performance: once assembled, per-frame CPU work is skipped entirely when
 * the camera is beyond UPDATE_RANGE (the curvature shader has already faded
 * the points to invisible by then).
 */

const LINE_GAP      = 0.34
const TINT          = [1.0, 0.97, 0.93]   // warm cream — matches the street
const ASSEMBLE_SECS = 1.4
const OPACITY_RAMP  = 0.05
const UPDATE_RANGE  = 160                  // matches curveWorld FADE_FAR + margin

function buildLineGeometry(font, { text, size, depth }) {
  const geo = new TextGeometry(text, {
    font, size, depth,
    curveSegments: 8,
    bevelEnabled: false,
  })
  geo.computeBoundingBox()
  const box = geo.boundingBox
  geo.translate(
    -(box.min.x + box.max.x) * 0.5,
    -(box.min.y + box.max.y) * 0.5,
    -(box.min.z + box.max.z) * 0.5
  )
  geo.computeBoundingBox()
  return geo
}

function makeGlowSprite() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const half = size / 2
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0.00, 'rgba(255,255,252,1.0)')
  grad.addColorStop(0.20, 'rgba(248,244,235,0.78)')
  grad.addColorStop(0.50, 'rgba(220,215,200,0.18)')
  grad.addColorStop(1.00, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

/* Sample glyph surfaces → target positions, spawn origins, bezier controls,
 * per-particle delay/duration (bottom-up), colors and glow. */
function sampleParticles(geometry, count) {
  const sampler  = new MeshSurfaceSampler(new THREE.Mesh(geometry)).build()
  const target   = new Float32Array(count * 3)
  const origin   = new Float32Array(count * 3)
  const ctrlA    = new Float32Array(count * 3)
  const ctrlB    = new Float32Array(count * 3)
  const delay    = new Float32Array(count)
  const duration = new Float32Array(count)
  const colors   = new Float32Array(count * 3)
  const glow     = new Float32Array(count)
  const randoms  = new Float32Array(count * 2)
  const p        = new THREE.Vector3()

  const yMin   = geometry.boundingBox.min.y
  const yRange = Math.max(0.001, geometry.boundingBox.max.y - yMin)

  for (let i = 0; i < count; i++) {
    sampler.sample(p)
    target[i * 3] = p.x; target[i * 3 + 1] = p.y; target[i * 3 + 2] = p.z

    // Spawn scattered through the air around the text volume
    const ox = p.x + (Math.random() - 0.5) * 14
    const oy = p.y + (Math.random() - 0.5) * 8
    const oz = p.z + (Math.random() - 0.5) * 6
    origin[i * 3] = ox; origin[i * 3 + 1] = oy; origin[i * 3 + 2] = oz

    // Bezier controls: arc from spawn toward the letter
    ctrlA[i * 3]     = ox * 0.6 + p.x * 0.4 + (Math.random() - 0.5)
    ctrlA[i * 3 + 1] = oy * 0.6 + p.y * 0.4 + (Math.random() - 0.5)
    ctrlA[i * 3 + 2] = oz * 0.6 + p.z * 0.4
    ctrlB[i * 3]     = p.x + (Math.random() - 0.5) * 0.5
    ctrlB[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.5
    ctrlB[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.5

    // Bottom of the glyph lands first
    const yNorm = (p.y - yMin) / yRange
    delay[i]    = yNorm * 0.36 + Math.random() * 0.06
    duration[i] = 0.34 + Math.random() * 0.26

    const g = Math.min(1, 0.14 + Math.pow(Math.random(), 2.3) * 0.86)
    const b = 0.34 + g * g * 2.2
    colors[i * 3]     = Math.min(1, b * TINT[0])
    colors[i * 3 + 1] = Math.min(1, b * TINT[1])
    colors[i * 3 + 2] = Math.min(1, b * TINT[2])
    glow[i] = g
    randoms[i * 2]     = Math.random()
    randoms[i * 2 + 1] = Math.random()
  }

  return { target, origin, ctrlA, ctrlB, delay, duration, colors, glow, randoms }
}

export default function TextMesh3D({
  id,
  lines,
  position,
  rotation = [0, 0, 0],
  billboard = false,        // Y-axis billboard: always turns toward the camera
  pointSize = 0.23,
  scrollStart,
  scrollEnd,
  assembleDelay = 0,
}) {
  const isExploring = useStore(s => s.isExploring)
  const font = useLoader(FontLoader, '/fonts/helvetiker_bold.typeface.json')

  const groupRef         = useRef()
  const pointsRefs       = useRef([])
  const assembleStartRef = useRef(null)   // clock time the assembly begins
  const assembledRef     = useRef(false)  // sticky — words stay in the world
  const opacityRef       = useRef(0)
  const sprite = useMemo(() => makeGlowSprite(), [])

  // Build glyph geometry + particle data for each line, stacked vertically
  const lineData = useMemo(() => {
    const items = lines.map((line) => {
      const geometry = buildLineGeometry(font, line)
      const height = geometry.boundingBox.max.y - geometry.boundingBox.min.y
      return { ...line, geometry, height }
    })

    const totalHeight =
      items.reduce((s, it) => s + it.height, 0) + LINE_GAP * Math.max(0, items.length - 1)

    let yTop = totalHeight * 0.5
    return items.map((item) => {
      const y = yTop - item.height * 0.5
      yTop -= item.height + LINE_GAP

      const sampled = sampleParticles(item.geometry, item.count)
      const particleGeometry = new THREE.BufferGeometry()
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(sampled.origin.slice(), 3))
      particleGeometry.setAttribute('color',    new THREE.BufferAttribute(sampled.colors, 3))
      particleGeometry.setAttribute('aGlow',    new THREE.BufferAttribute(sampled.glow, 1))
      return { ...item, y, particleGeometry, ...sampled }
    })
  }, [font, lines])

  useEffect(() => () => {
    lineData.forEach(it => { it.geometry.dispose(); it.particleGeometry.dispose() })
  }, [lineData])
  useEffect(() => () => sprite.dispose(), [sprite])

  const worldPos = useMemo(() => new THREE.Vector3(...position), [position])

  useFrame(({ clock, camera }) => {
    // Once assembled and far behind/ahead of the camera, freeze entirely —
    // the distance fade has hidden the points, so animation would be wasted.
    if (assembledRef.current && camera.position.distanceTo(worldPos) > UPDATE_RANGE) return

    // Y-axis billboard: smoothly track the camera around the vertical axis
    if (billboard && groupRef.current) {
      const targetY = Math.atan2(
        camera.position.x - worldPos.x,
        camera.position.z - worldPos.z
      )
      const g = groupRef.current
      let dy = targetY - g.rotation.y
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))   // shortest arc
      g.rotation.y += dy * 0.06
    }

    const t = useStore.getState().scrollProgress
    const inSection = isExploring && t >= scrollStart && t < scrollEnd
    const elapsed = clock.elapsedTime

    if (inSection && assembleStartRef.current === null) {
      assembleStartRef.current = elapsed + assembleDelay
    }
    if (!inSection && !assembledRef.current) {
      assembleStartRef.current = null
    }

    let assembleProgress = 0
    if (assembleStartRef.current !== null) {
      const raw = THREE.MathUtils.clamp((elapsed - assembleStartRef.current) / ASSEMBLE_SECS, 0, 1)
      assembleProgress = raw * raw * (3 - 2 * raw)
      if (raw >= 1) assembledRef.current = true
    }

    // Fade toward full opacity while assembling; stay visible forever after
    const targetOpacity = (assembledRef.current || assembleProgress > 0) ? 1 : 0
    opacityRef.current += (targetOpacity - opacityRef.current) * OPACITY_RAMP

    if (opacityRef.current < 0.01 && !assembledRef.current && assembleProgress === 0) return

    lineData.forEach((item, index) => {
      const points = pointsRefs.current[index]
      if (!points?.material) return

      points.material.opacity = opacityRef.current * Math.min(1, assembleProgress / 0.30 + (assembledRef.current ? 1 : 0))

      const dst = item.particleGeometry.getAttribute('position').array
      const { origin: from, ctrlA, ctrlB, target: to, delay, duration, randoms } = item

      for (let i = 0; i < dst.length; i += 3) {
        const p  = i / 3
        const u  = THREE.MathUtils.clamp((assembleProgress - delay[p]) / duration[p], 0, 1)
        const s  = u * u * (3 - 2 * u)
        const is = 1 - s

        // Cubic bezier flight from spawn → letter surface
        const bx = is*is*is * from[i]   + 3*is*is*s * ctrlA[i]   + 3*is*s*s * ctrlB[i]   + s*s*s * to[i]
        const by = is*is*is * from[i+1] + 3*is*is*s * ctrlA[i+1] + 3*is*s*s * ctrlB[i+1] + s*s*s * to[i+1]
        const bz = is*is*is * from[i+2] + 3*is*is*s * ctrlA[i+2] + 3*is*s*s * ctrlB[i+2] + s*s*s * to[i+2]

        // Gentle idle float, fading in with assembly so it never fights the flight
        const ph = randoms[p * 2] * 6.2832
        const sp = 0.22 + randoms[p * 2 + 1] * 0.25

        dst[i]     = bx + Math.sin(elapsed * sp * 0.70 + ph * 1.4) * 0.013 * s
        dst[i + 1] = by + Math.sin(elapsed * sp        + ph       ) * 0.024 * s
        dst[i + 2] = bz + Math.sin(elapsed * sp * 0.50 + ph * 0.9) * 0.009 * s
      }

      item.particleGeometry.getAttribute('position').needsUpdate = true
    })
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation} renderOrder={1000}>
      {lineData.map((item, index) => (
        <group key={`${id}-${index}`} position={[0, item.y, 0]}>
          <points
            ref={(node) => { pointsRefs.current[index] = node }}
            geometry={item.particleGeometry}
            renderOrder={1000}
            frustumCulled={false}
          >
            <pointsMaterial
              map={sprite}
              size={pointSize}
              vertexColors
              transparent
              opacity={0}
              alphaTest={0.004}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
              fog={false}
              depthTest={false}
              depthWrite={false}
              sizeAttenuation
              onBeforeCompile={(shader) => {
                shader.vertexShader = shader.vertexShader.replace(
                  'void main() {',
                  `attribute float aGlow;
void main() {`
                )
                shader.vertexShader = shader.vertexShader.replace(
                  'gl_PointSize = size;',
                  'gl_PointSize = size * (0.28 + aGlow * aGlow * 2.2);'
                )
                injectCurvature(shader)
              }}
            />
          </points>
        </group>
      ))}
    </group>
  )
}
