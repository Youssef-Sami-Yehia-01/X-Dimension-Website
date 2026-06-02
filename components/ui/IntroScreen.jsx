'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '@/store/useStore'
import styles from './IntroScreen.module.css'

export default function IntroScreen() {
  const overlayRef = useRef()
  const logoRef    = useRef()
  const hintRef    = useRef()
  const setExploring = useStore(s => s.setExploring)

  useEffect(() => {
    /* Place hint at viewport centre-bottom initially so it has a home
       before the user moves their mouse */
    gsap.set(hintRef.current, {
      x: window.innerWidth  / 2,
      y: window.innerHeight / 2 + 160,
    })

    /* Entrance timeline */
    const tl = gsap.timeline({ delay: 0.3 })

    tl.fromTo(logoRef.current,
      { opacity: 0, scale: 1.08, filter: 'blur(28px)' },
      { opacity: 1, scale: 1,    filter: 'blur(0px)',  duration: 1.6, ease: 'power3.out' }
    )

    tl.fromTo(hintRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.8, ease: 'power2.out' },
      '-=0.4'
    )

    /* Text follows the cursor — slight lag for smoothness */
    const onMove = ({ clientX, clientY }) => {
      gsap.to(hintRef.current, {
        x: clientX + 18,
        y: clientY + 14,
        duration: 0.14,
        ease: 'power3.out',
        overwrite: 'auto',
      })
    }
    window.addEventListener('mousemove', onMove)

    return () => {
      tl.kill()
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  /* Click — 3 s zoom-in, then 2 s fade-out revealing the 3D scene */
  const handleClick = () => {
    const tl = gsap.timeline({ onComplete: setExploring })

    /* Logo rushes toward viewer over 3 s */
    tl.to(logoRef.current, {
      scale: 9,
      opacity: 0,
      filter: 'blur(16px)',
      duration: 3.0,
      ease: 'power2.in',
    })

    /* Hint fades quickly on click */
    tl.to(hintRef.current,
      { opacity: 0, duration: 0.4, ease: 'power2.in' },
      '<'
    )

    /* Overlay fades out over 2 s, starting near the end of the zoom */
    tl.to(overlayRef.current,
      { opacity: 0, duration: 2.0, ease: 'power1.inOut' },
      '-=1.2'
    )
  }

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleClick}>

      {/* Logo */}
      <div ref={logoRef} className={styles.logoWrap}>
        <img src="/logo-white.svg" alt="X-Dimension" className={styles.logoImg} />
      </div>

      {/* "Click to explore" — follows the mouse cursor */}
      <p ref={hintRef} className={styles.hint}>Click to explore</p>

    </div>
  )
}
