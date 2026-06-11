'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './CustomCursor.module.css'

/*
 * CustomCursor — amber dot + trailing ring replacing the native cursor.
 * The ring flares whenever the hovered element wants a pointer cursor
 * (links, buttons, the villa, the reticle), making every interactive
 * thing on the site self-announcing.
 *
 * Mouse-only: touch devices and prefers-reduced-motion users keep the
 * native experience untouched.
 */
export default function CustomCursor() {
  const dotRef  = useRef()
  const ringRef = useRef()
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const fine    = window.matchMedia('(pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduced) return

    setEnabled(true)
    document.documentElement.classList.add('nativeCursorHidden')

    const pos    = { x: -100, y: -100 }
    const ring   = { x: -100, y: -100 }
    let hot      = false
    let visible  = false
    let raf

    const onMove = (e) => {
      pos.x = e.clientX; pos.y = e.clientY
      visible = true
      // Anything that asks for a pointer cursor is "hot"
      hot = e.target instanceof Element &&
            getComputedStyle(e.target).cursor === 'pointer'
    }
    const onLeave = () => { visible = false }

    const tick = () => {
      ring.x += (pos.x - ring.x) * 0.18
      ring.y += (pos.y - ring.y) * 0.18

      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.x}px, ${pos.y}px)`
        dotRef.current.style.opacity = visible ? 1 : 0
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${ring.x}px, ${ring.y}px)`
        ringRef.current.style.opacity = visible ? 1 : 0
        ringRef.current.classList.toggle(styles.hot, hot)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()

    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.documentElement.classList.remove('nativeCursorHidden')
    }
  }, [])

  if (!enabled) return null

  return (
    <>
      <div ref={dotRef} className={styles.dot} aria-hidden="true" />
      <div ref={ringRef} className={styles.ring} aria-hidden="true" />
    </>
  )
}
