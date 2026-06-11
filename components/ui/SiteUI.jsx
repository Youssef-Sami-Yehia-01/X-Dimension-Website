'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { FaFacebook, FaInstagram, FaLinkedin } from 'react-icons/fa6'
import { MdEmail } from 'react-icons/md'
import { useStore } from '@/store/useStore'
import { SECTIONS, sectionAt } from '@/config/journey'
import { flyTo } from './ScrollDriver'
import styles from './SiteUI.module.css'

/*
 * SiteUI — the persistent HUD chrome around the journey.
 *
 *   top-left      logo (click = fly home)
 *   right edge    journey rail: one tick per narrative beat, with a live
 *                 progress fill; clicking a tick flies the camera there
 *                 along the road (see ScrollDriver.flyTo)
 *   bottom-right  social links
 *   bottom-center scroll hint, fades out after the first real scroll
 */

const SOCIAL = [
  { icon: FaFacebook,  label: 'Facebook',  href: '#' },
  { icon: FaInstagram, label: 'Instagram', href: '#' },
  { icon: FaLinkedin,  label: 'LinkedIn',  href: '#' },
  { icon: MdEmail,     label: 'Email',     href: 'mailto:info@xdimension.co' },
]

/* The fictional running total — pays off at the "9B+ points" stat */
const TOTAL_POINTS = 9_412_337_204

export default function SiteUI({ hidden = false }) {
  const logoRef   = useRef()
  const railRef   = useRef()
  const socialRef = useRef()
  const hintRef   = useRef()
  const fillRef   = useRef()
  const odoRef    = useRef()

  // Re-render only when the active beat changes
  const activeId = useStore(s => sectionAt(s.scrollProgress).id)
  const [hintDismissed, setHintDismissed] = useState(false)

  /* Entrance animation — HUD assembles from the edges */
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 })

    tl.fromTo(logoRef.current,
      { opacity: 0, x: -20 },
      { opacity: 1, x: 0, duration: 0.7, ease: 'power2.out' }
    )
    tl.fromTo(railRef.current.querySelectorAll('button'),
      { opacity: 0, x: 14 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06 },
      '-=0.3'
    )
    tl.fromTo(socialRef.current.querySelectorAll('a'),
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.07 },
      '<'
    )
    tl.fromTo(hintRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.8 },
      '-=0.2'
    )

    return () => tl.kill()
  }, [])

  /* Progress fill + odometer + hint dismissal — direct DOM writes, no re-renders */
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleY(${state.scrollProgress})`
      }
      if (odoRef.current) {
        // The journey "captures" points as you travel — eased so the count
        // races early and lands exactly on the total at the end
        const eased = 1 - Math.pow(1 - state.scrollProgress, 1.6)
        odoRef.current.textContent = Math.round(TOTAL_POINTS * eased).toLocaleString('en-US')
      }
      if (!hintDismissed && state.scrollProgress > 0.03) {
        setHintDismissed(true)
      }
    })
    return unsub
  }, [hintDismissed])

  useEffect(() => {
    if (hintDismissed && hintRef.current) {
      gsap.to(hintRef.current, { opacity: 0, duration: 0.6, ease: 'power2.out' })
    }
  }, [hintDismissed])

  return (
    /* Chrome stays mounted across project open/close (entrance plays once);
       it just fades + ignores the pointer while a project is open. */
    <div className={`${styles.chrome} ${hidden ? styles.chromeHidden : ''}`}>
      {/* ── Top-left: logo (fly home) ─────────────────────────────── */}
      <div ref={logoRef} className={styles.topLeft}>
        <button className={styles.logoBtn} onClick={() => flyTo(0)} aria-label="Back to start">
          <img src="/logo-white.svg" alt="X-Dimension" width={54} height={54} className={styles.topLogo} />
        </button>
      </div>

      {/* ── Right edge: journey rail ──────────────────────────────── */}
      <nav ref={railRef} className={styles.rail} aria-label="Journey sections">
        <div className={styles.railTrack}>
          <div ref={fillRef} className={styles.railFill} />
        </div>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            className={`${styles.railItem} ${section.id === activeId ? styles.railActive : ''}`}
            onClick={() => flyTo(section.focus)}
          >
            <span className={styles.railLabel}>{section.label}</span>
            <span className={styles.railTick} />
          </button>
        ))}
      </nav>

      {/* ── Bottom-right: social icons ────────────────────────────── */}
      <div ref={socialRef} className={styles.bottomRight}>
        {SOCIAL.map(({ icon: Icon, label, href }) => (
          <a
            key={label}
            href={href}
            aria-label={label}
            className={styles.socialIcon}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          >
            <Icon size={18} />
          </a>
        ))}
      </div>

      {/* ── Bottom-center: scroll hint ────────────────────────────── */}
      <div ref={hintRef} className={styles.hint}>
        <span className={styles.hintMouse}><span className={styles.hintWheel} /></span>
        Scroll to travel the scan
      </div>

      {/* ── Bottom-left: live capture odometer ────────────────────── */}
      <div className={styles.odometer} aria-hidden="true">
        <span className={styles.odoLabel}>Points captured</span>
        <span ref={odoRef} className={styles.odoValue}>0</span>
      </div>
    </div>
  )
}
