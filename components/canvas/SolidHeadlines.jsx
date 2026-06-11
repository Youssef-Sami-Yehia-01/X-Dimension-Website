'use client'

import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { useStore } from '@/store/useStore'
import { SOLID_TEXTS } from '@/config/journey'

/*
 * SolidHeadlines — the two hero word-monuments (see SOLID_TEXTS).
 *
 * Solid extruded glyphs with warm-white faces and amber wireframe edges:
 * crisp "blueprint lettering" standing in the scanned world. Each headline
 * reveals once (rise + fade) when its scroll window is first entered, then
 * stays. The finale monument casts a faint mirrored reflection on the sea.
 */

const FACE_COLOR = 0xe9e5dc
const EDGE_COLOR = 0xf5a623
const REVEAL_SECS = 2.2
const RISE = 3.2   // units the text rises while revealing

function Headline({ cfg }) {
  const font = useLoader(FontLoader, '/fonts/helvetiker_bold.typeface.json')
  const isExploring = useStore(s => s.isExploring)

  const groupRef    = useRef()
  const mirrorRef   = useRef()
  const triggeredAt = useRef(null)   // clock time the reveal starts
  const windowFade  = useRef(0)      // fades out when the beat is left
                                     // (solid type read backwards is gibberish)

  const { lines, materials } = useMemo(() => {
    const faceMat = new THREE.MeshBasicMaterial({
      color: FACE_COLOR, transparent: true, opacity: 0, fog: false,
    })
    const edgeMat = new THREE.LineBasicMaterial({
      color: EDGE_COLOR, transparent: true, opacity: 0, fog: false,
    })
    const mirrorFaceMat = faceMat.clone()
    const mirrorEdgeMat = edgeMat.clone()

    const built = cfg.lines.map((text, i) => {
      const geo = new TextGeometry(text, {
        font, size: cfg.size, depth: cfg.depth,
        curveSegments: 10, bevelEnabled: false,
      })
      geo.computeBoundingBox()
      const bb = geo.boundingBox
      geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2)
      const edges = new THREE.EdgesGeometry(geo, 24)

      // Stack lines downward from the top
      const y = ((cfg.lines.length - 1) / 2 - i) * (cfg.size + cfg.lineGap)
      return { geo, edges, y }
    })

    return { lines: built, materials: { faceMat, edgeMat, mirrorFaceMat, mirrorEdgeMat } }
  }, [font, cfg])

  useFrame(({ clock }, delta) => {
    const t = useStore.getState().scrollProgress
    const inWindow = isExploring && t >= cfg.start && t < cfg.end

    if (inWindow && triggeredAt.current === null) {
      triggeredAt.current = clock.elapsedTime + (cfg.revealDelay ?? 0)
    }
    if (triggeredAt.current === null) return

    const raw = THREE.MathUtils.clamp((clock.elapsedTime - triggeredAt.current) / REVEAL_SECS, 0, 1)
    const p = 1 - Math.pow(1 - raw, 3)

    // Fade away once the visitor moves past the beat
    const wTarget = inWindow ? 1 : 0
    windowFade.current += (wTarget - windowFade.current) * Math.min(1, delta * 2.5)
    const o = p * windowFade.current

    materials.faceMat.opacity = o * 0.92
    materials.edgeMat.opacity = o * 0.85
    materials.mirrorFaceMat.opacity = o * 0.10
    materials.mirrorEdgeMat.opacity = o * 0.14

    if (groupRef.current) {
      groupRef.current.position.y = cfg.position[1] - RISE * (1 - p)
      groupRef.current.visible = o > 0.004
    }
    if (mirrorRef.current) {
      // Mirror image below the water plane (y = 0)
      mirrorRef.current.position.y = -(cfg.position[1] - RISE * (1 - p))
      mirrorRef.current.visible = o > 0.004
    }
  })

  const renderLines = (faceMat, edgeMat) => lines.map((line, i) => (
    <group key={i} position={[0, line.y, 0]}>
      <mesh geometry={line.geo} material={faceMat} />
      <lineSegments geometry={line.edges} material={edgeMat} />
    </group>
  ))

  return (
    <>
      <group
        ref={groupRef}
        position={cfg.position}
        rotation={cfg.rotation}
        visible={false}
      >
        {renderLines(materials.faceMat, materials.edgeMat)}
      </group>

      {cfg.reflection && (
        <group
          ref={mirrorRef}
          position={[cfg.position[0], -cfg.position[1], cfg.position[2]]}
          rotation={cfg.rotation}
          scale={[1, -1, 1]}
          visible={false}
        >
          {renderLines(materials.mirrorFaceMat, materials.mirrorEdgeMat)}
        </group>
      )}
    </>
  )
}

export default function SolidHeadlines() {
  return (
    <>
      {SOLID_TEXTS.map(cfg => <Headline key={cfg.id} cfg={cfg} />)}
    </>
  )
}
