'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '@/store/useStore'
import styles from './ProjectTransitionOverlay.module.css'

/*
 * Timing contract (must match ProjectCameraController animation durations):
 *
 *   entering → fade to black starts at t=2.2 s (just before camera reaches building),
 *              takes 0.5 s → fully black at t=2.7 s, which is when onProjectShowing fires.
 *
 *   showing  → immediately fade from black (0.8 s).
 *
 *   exiting  → immediately fade to black (0.4 s), hold briefly,
 *              then fade from black (0.5 s) — camera snaps and animates behind curtain.
 */
export default function ProjectTransitionOverlay() {
  const projectState = useStore(s => s.projectState)
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    gsap.killTweensOf(el)

    if (projectState === 'entering') {
      // Camera fly-in lasts 2.7 s total — go black just before it ends
      gsap.to(el, { opacity: 1, duration: 0.5, delay: 2.2, ease: 'power2.in' })
    }

    if (projectState === 'showing') {
      // onProjectShowing called → scene is already dark → reveal project view
      gsap.to(el, { opacity: 0, duration: 0.8, delay: 0.1, ease: 'power2.out' })
    }

    if (projectState === 'exiting') {
      // Briefly go black so camera can snap back, then reveal the road animation
      gsap.timeline()
        .to(el, { opacity: 1, duration: 0.4, ease: 'power2.in' })
        .to(el, { opacity: 0, duration: 0.5, delay: 0.15, ease: 'power2.out' })
    }

    if (projectState === 'idle') {
      gsap.set(el, { opacity: 0 })
    }
  }, [projectState])

  return <div ref={ref} className={styles.overlay} />
}
