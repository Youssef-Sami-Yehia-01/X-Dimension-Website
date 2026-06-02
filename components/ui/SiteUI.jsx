'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
} from 'react-icons/fa6'
import { MdEmail } from 'react-icons/md'
import styles from './SiteUI.module.css'

const NAV_ITEMS = ['About', 'Services', 'Projects', 'Careers']

const SOCIAL = [
  { icon: FaFacebook,  label: 'Facebook',  href: '#' },
  { icon: FaInstagram, label: 'Instagram', href: '#' },
  { icon: FaLinkedin,  label: 'LinkedIn',  href: '#' },
  { icon: MdEmail,     label: 'Email',     href: 'mailto:info@xdimension.co' },
]

export default function SiteUI() {
  const logoRef   = useRef()
  const navRef    = useRef()
  const socialRef = useRef()

  /* Entrance animation — staggered fade-in from each edge */
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.1 })

    tl.fromTo(logoRef.current,
      { opacity: 0, x: -20 },
      { opacity: 1, x: 0, duration: 0.7, ease: 'power2.out' }
    )

    tl.fromTo(navRef.current.querySelectorAll('a'),
      { opacity: 0, x: -16 },
      { opacity: 1, x: 0,  duration: 0.5, ease: 'power2.out', stagger: 0.08 },
      '-=0.3'
    )

    tl.fromTo(socialRef.current.querySelectorAll('a'),
      { opacity: 0, x: 16 },
      { opacity: 1, x: 0,  duration: 0.5, ease: 'power2.out', stagger: 0.07 },
      '<'
    )

    return () => tl.kill()
  }, [])

  return (
    <>
      {/* ── Top-left: logo only ───────────────────────────────────── */}
      <div ref={logoRef} className={styles.topLeft}>
        <img src="/logo-white.svg" alt="X-Dimension" width={54} height={54} className={styles.topLogo} />
      </div>

      {/* ── Bottom-left: navigation ────────────────────────────────── */}
      <nav ref={navRef} className={styles.bottomLeft}>
        {NAV_ITEMS.map(item => (
          <a key={item} href="#" className={styles.navItem}>
            <span className={styles.navLine} />
            {item}
          </a>
        ))}
      </nav>

      {/* ── Bottom-right: social icons ─────────────────────────────── */}
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
    </>
  )
}
