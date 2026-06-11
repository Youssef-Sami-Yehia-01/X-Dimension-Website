'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { SECTIONS } from '@/config/journey'
import { flyTo } from '@/components/ui/ScrollDriver'

/*
 * ScanPanels3D — the storytelling copy, rendered as crisp SDF text that
 * LIVES IN THE WORLD instead of a flat DOM overlay.
 *
 * Each narrative beat owns one floating annotation: kicker, headline, body,
 * and any interactive elements (case-study CTA, mailto links, restart),
 * framed by thin amber corner brackets like a surveyor's target. Panels are
 * positioned along the camera path and oriented toward the camera's pose at
 * the beat's focus moment — then left fixed in space, so they feel like
 * annotations pinned into the scan rather than UI glued to the screen.
 *
 * All copy and poses come from config/journey.js.
 */

const FONT_700 = '/fonts/space-grotesk-700.woff'
const FONT_500 = '/fonts/space-grotesk-500.woff'
const FONT_400 = '/fonts/space-grotesk-400.woff'

const AMBER = '#f5a623'
const AMBER_HOVER = '#ffd27a'
const WHITE = '#f2f0ec'
const GREY  = '#a8a49d'
const DIM   = '#7b7872'

const INTRO_HOLD = 3.0   // seconds after explore-start before any panel shows

/* Rough glyph-width factor for Space Grotesk — used for underlines/boxes */
const CHAR_W = 0.55

/* Panels must always read: drawn after the additive point clouds and
 * without depth-testing, so glowing particles can never wash them out. */
const TEXT_PROPS = { renderOrder: 30, 'material-depthTest': false, 'material-depthWrite': false }
const LINE_ORDER = 30

/* ── Shared per-panel plumbing ──────────────────────────────────────────
 * Registers troika Text instances + line materials so a single opacity
 * value can drive the whole panel every frame without React re-renders.
 */
function usePanel(section) {
  const groupRef = useRef()
  const texts    = useRef(new Set())
  const lineMats = useRef(new Set())
  const opacity  = useRef(0)
  const exploreClock = useRef(null)

  /* ref-callback factory: register a Text with a base alpha multiplier */
  const reg = (baseAlpha = 1) => (t) => {
    if (t) { t.userData.baseAlpha = baseAlpha; texts.current.add(t) }
  }
  const regLine = (m) => { if (m) lineMats.current.add(m) }

  useEffect(() => {
    groupRef.current?.lookAt(...section.panel.facing)
  }, [section])

  useFrame(({ clock }, delta) => {
    const { isExploring, projectState, scrollProgress: p } = useStore.getState()

    if (isExploring && exploreClock.current === null) exploreClock.current = clock.elapsedTime
    const held = exploreClock.current === null ||
                 clock.elapsedTime - exploreClock.current < INTRO_HOLD

    const inWindow = p >= section.start && p < section.end
    const target = (isExploring && projectState === 'idle' && inWindow && !held) ? 1 : 0

    const o = opacity.current + (target - opacity.current) * Math.min(1, delta * (target > opacity.current ? 2.4 : 5))
    opacity.current = o

    const g = groupRef.current
    if (!g) return
    g.visible = o > 0.015
    if (!g.visible) return

    // Gentle rise while fading in
    g.position.y = section.panel.position[1] - (1 - o) * 1.2

    texts.current.forEach(t => { t.fillOpacity = o * t.userData.baseAlpha })
    lineMats.current.forEach(m => { m.opacity = o * m.userData.baseAlpha })
  })

  return { groupRef, reg, regLine, opacity }
}

/* ── Decorative primitives ─────────────────────────────────────────────── */

/** Thin amber corner brackets framing a w×h content area (top-left at x0,0). */
function CornerBrackets({ w, h, regLine, x0 = -w / 2, pad = 0.7, arm = 0.85 }) {
  const geometry = useMemo(() => {
    const L = x0 - pad, R = x0 + w + pad, T = pad, B = -h - pad
    const pts = []
    const corner = (cx, cy, dx, dy) => {
      pts.push(cx, cy, 0, cx + arm * dx, cy, 0)
      pts.push(cx, cy, 0, cx, cy + arm * dy, 0)
    }
    corner(L, T,  1, -1); corner(R, T, -1, -1)
    corner(L, B,  1,  1); corner(R, B, -1,  1)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
    return g
  }, [w, h, x0, pad, arm])

  return (
    <lineSegments geometry={geometry} renderOrder={LINE_ORDER}>
      <lineBasicMaterial
        ref={(m) => { if (m) { m.userData.baseAlpha = 0.8; regLine(m) } }}
        color={AMBER} transparent opacity={0} fog={false} depthTest={false}
      />
    </lineSegments>
  )
}

/** Simple horizontal rule. */
function Rule({ x0, x1, y, color = WHITE, alpha = 0.16, regLine }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x0, y, 0, x1, y, 0]), 3))
    return g
  }, [x0, x1, y])
  return (
    <lineSegments geometry={geometry} renderOrder={LINE_ORDER}>
      <lineBasicMaterial
        ref={(m) => { if (m) { m.userData.baseAlpha = alpha; regLine(m) } }}
        color={color} transparent opacity={0} fog={false} depthTest={false}
      />
    </lineSegments>
  )
}

/** Boxed text button: amber outline + label, hover brightens, cursor pointer. */
function CtaBox({ x, y, label, onActivate, reg, regLine, opacity, fontSize = 0.4 }) {
  const w = label.length * fontSize * CHAR_W + 1.7
  const h = fontSize + 0.85
  const textRef = useRef()
  const boxMat  = useRef()

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, 0,  w, 0, 0,   w, 0, 0,  w, -h, 0,
      w, -h, 0, 0, -h, 0,  0, -h, 0, 0, 0, 0,
    ]), 3))
    return g
  }, [w, h])

  const hover = (on) => {
    if (opacity.current < 0.5) return
    document.body.style.cursor = on ? 'pointer' : 'auto'
    if (textRef.current) textRef.current.color = on ? AMBER_HOVER : AMBER
    if (boxMat.current) boxMat.current.color.set(on ? AMBER_HOVER : AMBER)
  }

  return (
    <group position={[x, y, 0]}>
      <lineSegments geometry={geometry} renderOrder={LINE_ORDER}>
        <lineBasicMaterial
          ref={(m) => { if (m) { boxMat.current = m; m.userData.baseAlpha = 0.75; regLine(m) } }}
          color={AMBER} transparent opacity={0} fog={false} depthTest={false}
        />
      </lineSegments>
      <Text
        ref={(t) => { textRef.current = t; reg(1)(t) }}
        {...TEXT_PROPS} font={FONT_500} fontSize={fontSize} color={AMBER}
        letterSpacing={0.18} anchorX="center" anchorY="middle"
        position={[w / 2, -h / 2, 0.01]} fillOpacity={0}
      >
        {label}
      </Text>
      {/* Invisible hit plane — generous click target */}
      <mesh
        position={[w / 2, -h / 2, 0.02]}
        onClick={() => { if (opacity.current > 0.5) onActivate() }}
        onPointerOver={() => hover(true)}
        onPointerOut={() => hover(false)}
      >
        <planeGeometry args={[w + 0.4, h + 0.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ── Per-type layouts ──────────────────────────────────────────────────── */

const titleHeight = (title) => title.split('\n').length * 1.05 * 1.12

/** Hand-off line: each beat closes by passing the story to the next one. */
function Handoff({ s, y, reg, regLine, centered = false }) {
  if (!s.handoff) return null
  const x = centered ? 0 : -s.panel.width / 2
  return (
    <>
      <Rule x0={x} x1={x + 2.2} y={y + 0.45} color={AMBER} alpha={0.55} regLine={regLine} />
      <Text ref={reg(0.8)} {...TEXT_PROPS} font={FONT_500} fontSize={0.28} color={DIM}
        letterSpacing={0.22} anchorX={centered ? 'center' : 'left'} anchorY="top"
        position={[x, y, 0]} fillOpacity={0}>
        {s.handoff.toUpperCase()}
      </Text>
    </>
  )
}

function TextBlocks({ s, reg, x0, w }) {
  const tH = titleHeight(s.title)
  const bodyY = -0.85 - tH - 0.5
  return (
    <>
      <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_500} fontSize={0.34} color={AMBER} letterSpacing={0.3}
        anchorX="left" anchorY="top" position={[x0, 0, 0]} fillOpacity={0}>
        {s.kicker.toUpperCase()}
      </Text>
      <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_700} fontSize={1.05} color={WHITE} lineHeight={1.1}
        letterSpacing={-0.01} anchorX="left" anchorY="top" position={[x0, -0.85, 0]}
        maxWidth={w} fillOpacity={0}>
        {s.title}
      </Text>
      {s.body && (
        <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_400} fontSize={0.42} color={GREY} lineHeight={1.55}
          anchorX="left" anchorY="top" position={[x0, bodyY, 0]} maxWidth={w - 0.5} fillOpacity={0}>
          {s.body}
        </Text>
      )}
    </>
  )
}

function PanelText({ s }) {
  const { groupRef, reg, regLine } = usePanel(s)
  const w = s.panel.width
  const x0 = -w / 2
  const tH = titleHeight(s.title)
  const bodyLines = Math.ceil((s.body?.length ?? 0) / 52)
  const h = 0.85 + tH + 0.5 + bodyLines * 0.42 * 1.55

  return (
    <group ref={groupRef} position={s.panel.position} visible={false}>
      <CornerBrackets w={w} h={h} regLine={regLine} />
      <TextBlocks s={s} reg={reg} x0={x0} w={w} />
      <Handoff s={s} y={-h - 1.4} reg={reg} regLine={regLine} />
    </group>
  )
}

function PanelCaseStudy({ s }) {
  const { groupRef, reg, regLine, opacity } = usePanel(s)
  const openProject = useStore(st => st.openProject)
  const w = s.panel.width
  const x0 = -w / 2
  const tH = titleHeight(s.title)
  const bodyLines = Math.ceil(s.body.length / 52)
  const bodyEnd = 0.85 + tH + 0.5 + bodyLines * 0.42 * 1.55
  const h = bodyEnd + 0.85 + 1.9

  return (
    <group ref={groupRef} position={s.panel.position} visible={false}>
      <CornerBrackets w={w} h={h} regLine={regLine} />
      <TextBlocks s={s} reg={reg} x0={x0} w={w} />
      <Text ref={reg(0.85)} {...TEXT_PROPS} font={FONT_500} fontSize={0.28} color={DIM} letterSpacing={0.16}
        anchorX="left" anchorY="top" position={[x0, -bodyEnd - 0.1, 0]} fillOpacity={0}>
        {s.meta.toUpperCase()}
      </Text>
      <CtaBox
        x={x0} y={-bodyEnd - 0.85} label={s.cta}
        onActivate={() => openProject('bayt-al-umma')}
        reg={reg} regLine={regLine} opacity={opacity}
      />
      <Handoff s={s} y={-h - 1.4} reg={reg} regLine={regLine} />
    </group>
  )
}

function PanelServices({ s }) {
  const { groupRef, reg, regLine } = usePanel(s)
  const w = s.panel.width
  const x0 = -w / 2
  const tH = titleHeight(s.title)
  const listY = -0.85 - tH - 0.7
  const pitch = 1.78
  const h = -listY + s.services.length * pitch + 0.2

  return (
    <group ref={groupRef} position={s.panel.position} visible={false}>
      <CornerBrackets w={w} h={h} regLine={regLine} />
      <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_500} fontSize={0.34} color={AMBER} letterSpacing={0.3}
        anchorX="left" anchorY="top" position={[x0, 0, 0]} fillOpacity={0}>
        {s.kicker.toUpperCase()}
      </Text>
      <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_700} fontSize={1.05} color={WHITE} lineHeight={1.1}
        letterSpacing={-0.01} anchorX="left" anchorY="top" position={[x0, -0.85, 0]}
        maxWidth={w} fillOpacity={0}>
        {s.title}
      </Text>

      {s.services.map((svc, i) => {
        const y = listY - i * pitch
        return (
          <group key={svc.name}>
            <Rule x0={x0} x1={x0 + w} y={y + 0.35} regLine={regLine} />
            <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_500} fontSize={0.5} color={WHITE}
              anchorX="left" anchorY="top" position={[x0, y, 0]} fillOpacity={0}>
              {svc.name}
            </Text>
            <Text ref={reg(0.9)} {...TEXT_PROPS} font={FONT_400} fontSize={0.36} color={GREY}
              anchorX="left" anchorY="top" position={[x0, y - 0.68, 0]} maxWidth={w} fillOpacity={0}>
              {svc.desc}
            </Text>
          </group>
        )
      })}
      <Handoff s={s} y={-h - 1.4} reg={reg} regLine={regLine} />
    </group>
  )
}

function PanelStats({ s }) {
  const { groupRef, reg, regLine, opacity } = usePanel(s)
  const w = s.panel.width
  const numRefs = useRef([])
  const countStart = useRef(null)
  const h = 5.4

  useFrame(({ clock }) => {
    if (opacity.current > 0.55 && countStart.current === null) {
      countStart.current = clock.elapsedTime
    }
    if (countStart.current === null) return
    s.stats.forEach((st, i) => {
      const t = numRefs.current[i]
      if (!t) return
      const u = THREE.MathUtils.clamp((clock.elapsedTime - countStart.current - i * 0.15) / 1.3, 0, 1)
      const v = Math.round(st.value * (1 - Math.pow(1 - u, 3)))
      const str = String(v)
      if (t.text !== str) t.text = str
    })
  })

  return (
    <group ref={groupRef} position={s.panel.position} visible={false}>
      <CornerBrackets w={w} h={h} regLine={regLine} />
      <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_500} fontSize={0.34} color={AMBER} letterSpacing={0.3}
        anchorX="center" anchorY="top" position={[0, 0, 0]} fillOpacity={0}>
        {s.kicker.toUpperCase()}
      </Text>
      <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_700} fontSize={0.9} color={WHITE}
        anchorX="center" anchorY="top" position={[0, -0.75, 0]} fillOpacity={0}>
        {s.title}
      </Text>

      {s.stats.map((st, i) => {
        const cx = (i - 1) * (w / 3)
        return (
          <group key={st.label}>
            <Text
              ref={(t) => { numRefs.current[i] = t; reg(1)(t) }}
              {...TEXT_PROPS} font={FONT_700} fontSize={1.85} color={WHITE}
              anchorX="right" anchorY="top" position={[cx + 0.25, -2.2, 0]} fillOpacity={0}>
              0
            </Text>
            <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_700} fontSize={1.0} color={AMBER}
              anchorX="left" anchorY="top" position={[cx + 0.4, -2.32, 0]} fillOpacity={0}>
              {st.suffix}
            </Text>
            <Text ref={reg(0.9)} {...TEXT_PROPS} font={FONT_500} fontSize={0.3} color={GREY} letterSpacing={0.24}
              anchorX="center" anchorY="top" position={[cx, -4.5, 0]} fillOpacity={0}>
              {st.label}
            </Text>
          </group>
        )
      })}
      <Handoff s={s} y={-h - 1.4} reg={reg} regLine={regLine} centered />
    </group>
  )
}

function PanelCareers({ s }) {
  const { groupRef, reg, regLine, opacity } = usePanel(s)
  const w = s.panel.width
  const x0 = -w / 2
  const tH = titleHeight(s.title)
  const bodyLines = Math.ceil(s.body.length / 52)
  const bodyEnd = 0.85 + tH + 0.5 + bodyLines * 0.42 * 1.55
  const h = bodyEnd + 2.2

  return (
    <group ref={groupRef} position={s.panel.position} visible={false}>
      <CornerBrackets w={w} h={h} regLine={regLine} />
      <TextBlocks s={s} reg={reg} x0={x0} w={w} />
      <CtaBox
        x={x0} y={-bodyEnd - 0.5} label={s.cta.toUpperCase()} fontSize={0.34}
        onActivate={() => { window.location.href = `mailto:${s.cta}` }}
        reg={reg} regLine={regLine} opacity={opacity}
      />
      <Handoff s={s} y={-h - 1.4} reg={reg} regLine={regLine} />
    </group>
  )
}

function PanelContact({ s }) {
  const { groupRef, reg, regLine, opacity } = usePanel(s)
  const w = s.panel.width
  const emailRef = useRef()
  const emailW = s.email.length * 0.72 * CHAR_W
  const h = 6.6

  const hoverEmail = (on) => {
    if (opacity.current < 0.5) return
    document.body.style.cursor = on ? 'pointer' : 'auto'
    if (emailRef.current) emailRef.current.color = on ? AMBER_HOVER : WHITE
  }

  return (
    <group ref={groupRef} position={s.panel.position} visible={false}>
      <CornerBrackets w={w} h={h} regLine={regLine} />
      <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_500} fontSize={0.34} color={AMBER} letterSpacing={0.3}
        anchorX="center" anchorY="top" position={[0, 0, 0]} fillOpacity={0}>
        {s.kicker.toUpperCase()}
      </Text>
      <Text ref={reg(1)} {...TEXT_PROPS} font={FONT_700} fontSize={1.1} color={WHITE}
        anchorX="center" anchorY="top" position={[0, -0.8, 0]} fillOpacity={0}>
        {s.title}
      </Text>

      <Text
        ref={(t) => { emailRef.current = t; reg(1)(t) }}
        {...TEXT_PROPS} font={FONT_500} fontSize={0.72} color={WHITE}
        anchorX="center" anchorY="top" position={[0, -2.5, 0]} fillOpacity={0}>
        {s.email}
      </Text>
      <Rule x0={-emailW / 2} x1={emailW / 2} y={-3.45} color={AMBER} alpha={0.6} regLine={regLine} />
      <mesh
        position={[0, -2.9, 0.02]}
        onClick={() => { if (opacity.current > 0.5) window.location.href = `mailto:${s.email}` }}
        onPointerOver={() => hoverEmail(true)}
        onPointerOut={() => hoverEmail(false)}
      >
        <planeGeometry args={[emailW + 0.6, 1.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <Text ref={reg(0.85)} {...TEXT_PROPS} font={FONT_500} fontSize={0.3} color={DIM} letterSpacing={0.26}
        anchorX="center" anchorY="top" position={[0, -4.0, 0]} fillOpacity={0}>
        {s.location}
      </Text>

      <CtaBox
        x={-2.5} y={-4.9} label="SCAN AGAIN" fontSize={0.32}
        onActivate={() => flyTo(0)}
        reg={reg} regLine={regLine} opacity={opacity}
      />
    </group>
  )
}

/* ── Root ──────────────────────────────────────────────────────────────── */

const PANEL_BY_TYPE = {
  text: PanelText,
  caseStudy: PanelCaseStudy,
  services: PanelServices,
  stats: PanelStats,
  careers: PanelCareers,
  contact: PanelContact,
}

export default function ScanPanels3D() {
  return (
    <>
      {SECTIONS.map((s) => {
        const Panel = PANEL_BY_TYPE[s.type]
        return Panel ? <Panel key={s.id} s={s} /> : null
      })}
    </>
  )
}
