'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { SECTIONS, sectionAt } from '@/config/journey'
import { flyTo } from './ScrollDriver'
import styles from './SectionPanels.module.css'

/*
 * SectionPanels — the readable half of the storytelling.
 *
 * 3D particle text carries the big emotional words; these DOM panels carry
 * the crisp copy: kickers, body text, service lists, stats and CTAs. Every
 * panel is authored in config/journey.js and rendered here by `type`.
 *
 * All panels stay mounted; CSS transitions crossfade them as the journey
 * progresses. Panels are hidden while a project is open.
 */

const INTRO_HOLD_MS = 2600   // let the laser sweep finish before the first panel

/** Count-up number that animates the first time it becomes visible. */
function Stat({ value, suffix, label, active, delay }) {
  const [display, setDisplay] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (!active || started.current) return
    started.current = true
    let raf
    const t0 = performance.now() + delay
    const DUR = 1400
    const tick = (now) => {
      const u = Math.min(1, Math.max(0, (now - t0) / DUR))
      setDisplay(Math.round(value * (1 - Math.pow(1 - u, 3))))
      if (u < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, value, delay])

  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{display}<em>{suffix}</em></span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

function PanelBody({ section, active }) {
  const openProject = useStore(s => s.openProject)

  switch (section.type) {
    case 'caseStudy':
      return (
        <>
          <p className={styles.kicker}>{section.kicker}</p>
          <h2 className={styles.title}>{section.title}</h2>
          <p className={styles.body}>{section.body}</p>
          <p className={styles.meta}>{section.meta}</p>
          <button
            className={styles.cta}
            onClick={() => openProject('bayt-al-umma')}
          >
            {section.cta} <span className={styles.ctaArrow}>→</span>
          </button>
        </>
      )

    case 'services':
      return (
        <>
          <p className={styles.kicker}>{section.kicker}</p>
          <h2 className={styles.title}>{section.title}</h2>
          <ul className={styles.services}>
            {section.services.map((s, i) => (
              <li key={s.name} style={{ transitionDelay: active ? `${0.15 + i * 0.12}s` : '0s' }}>
                <span className={styles.serviceName}>{s.name}</span>
                <span className={styles.serviceDesc}>{s.desc}</span>
              </li>
            ))}
          </ul>
        </>
      )

    case 'stats':
      return (
        <>
          <p className={styles.kicker}>{section.kicker}</p>
          <div className={styles.stats}>
            {section.stats.map((s, i) => (
              <Stat key={s.label} {...s} active={active} delay={i * 180} />
            ))}
          </div>
        </>
      )

    case 'careers':
      return (
        <>
          <p className={styles.kicker}>{section.kicker}</p>
          <h2 className={styles.title}>{section.title}</h2>
          <p className={styles.body}>{section.body}</p>
          <a className={styles.cta} href={`mailto:${section.cta}`}>
            {section.cta} <span className={styles.ctaArrow}>→</span>
          </a>
        </>
      )

    case 'contact':
      return (
        <>
          <p className={styles.kicker}>{section.kicker}</p>
          <h2 className={styles.title}>{section.title}</h2>
          <a className={styles.email} href={`mailto:${section.email}`}>{section.email}</a>
          <p className={styles.meta}>{section.location}</p>
          <button className={styles.restart} onClick={() => flyTo(0)}>
            ↺&nbsp; Scan again
          </button>
        </>
      )

    default:  // 'intro' | 'text'
      return (
        <>
          <p className={styles.kicker}>{section.kicker}</p>
          <h2 className={styles.title}>{section.title}</h2>
          <p className={styles.body}>{section.body}</p>
        </>
      )
  }
}

export default function SectionPanels() {
  const isExploring  = useStore(s => s.isExploring)
  const projectState = useStore(s => s.projectState)
  // Select only the section id — re-renders on beat change, not at 60 fps
  const currentId = useStore(s => sectionAt(s.scrollProgress).id)
  const [introDone, setIntroDone] = useState(false)

  useEffect(() => {
    if (!isExploring) return
    const id = setTimeout(() => setIntroDone(true), INTRO_HOLD_MS)
    return () => clearTimeout(id)
  }, [isExploring])

  if (!isExploring) return null

  const uiVisible = projectState === 'idle' && introDone

  return (
    <div className={styles.layer}>
      {SECTIONS.map((section) => {
        const active = uiVisible && section.id === currentId
        return (
          <section
            key={section.id}
            className={`${styles.panel} ${styles[section.anchor]} ${active ? styles.active : ''}`}
            aria-hidden={!active}
          >
            <PanelBody section={section} active={active} />
          </section>
        )
      })}
    </div>
  )
}
