'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '@/store/useStore'
import styles from './IntroScreen.module.css'

export default function IntroScreen() {
  const overlayRef   = useRef()
  const logoRef      = useRef()
  const hintRef      = useRef()
  const setExploring = useStore(s => s.setExploring)

  useEffect(() => {
    gsap.set(hintRef.current, {
      x: window.innerWidth  / 2,
      y: window.innerHeight / 2 + 160,
    })

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

  const handleClick = () => {
    // Fly THROUGH the logo into the world; setExploring fires the laser sweep
    const tl = gsap.timeline({ onComplete: setExploring })

    tl.to(logoRef.current, {
      scale: 9, opacity: 0, filter: 'blur(16px)',
      duration: 2.2, ease: 'power2.in',
    })

    tl.to(hintRef.current,
      { opacity: 0, duration: 0.4, ease: 'power2.in' }, '<'
    )

    tl.to(overlayRef.current,
      { opacity: 0, duration: 1.5, ease: 'power1.inOut' }, '-=1.0'
    )
  }

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleClick}>

      {/* Logo at z-index 1 */}
      <div ref={logoRef} className={styles.logoWrap}>
        <img src="/logo-white.svg" alt="X-Dimension" className={styles.logoImg} />
      </div>

      {/* Cursor-following text at z-index 2 */}
      <p ref={hintRef} className={styles.hint}>Click to initiate scan</p>

    </div>
  )
}
