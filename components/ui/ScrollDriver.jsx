'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '@/store/useStore'

/*
 * ScrollDriver — translates user input into the 0–1 journey progress.
 *
 * No DOM scroll tricks: wheel, touch-drag and keyboard all accumulate into
 * the Zustand progress value; the camera and panels react to that number.
 *
 * Nav jumps use flyTo(): instead of teleporting, the progress value itself
 * is tweened, so the camera physically travels the authored path through
 * the city to reach the section. Any manual input cancels the flight.
 */

const WHEEL_SENSITIVITY = 0.00028  // ~36 mouse-wheel notches = full journey
const TOUCH_SENSITIVITY = 0.0011   // drag a screen-height ≈ 0.8 progress
const KEY_STEP          = 0.035

let flightTween = null

/** Tween the journey to a target progress, travelling through the world. */
export function flyTo(target) {
  const store = useStore.getState()
  if (store.projectState !== 'idle') return

  const from = store.scrollProgress
  const distance = Math.abs(target - from)
  if (distance < 0.001) return

  flightTween?.kill()
  const proxy = { t: from }
  flightTween = gsap.to(proxy, {
    t: target,
    duration: 0.9 + distance * 3.2,      // longer flights take longer — feels physical
    ease: 'power2.inOut',
    onUpdate: () => useStore.getState().setScrollProgress(proxy.t),
    onComplete: () => { flightTween = null },
  })
}

function cancelFlight() {
  flightTween?.kill()
  flightTween = null
}

export default function ScrollDriver() {
  const isExploring = useStore(s => s.isExploring)
  const touchY = useRef(null)

  useEffect(() => {
    if (!isExploring) return
    const setProgress = useStore.getState().setScrollProgress

    const nudge = (delta) => {
      if (useStore.getState().projectState !== 'idle') return
      cancelFlight()
      const current = useStore.getState().scrollProgress
      setProgress(Math.max(0, Math.min(1, current + delta)))
    }

    const onWheel = (e) => {
      if (useStore.getState().projectState !== 'idle') return  // orbit mode zooms instead
      e.preventDefault()
      nudge(e.deltaY * WHEEL_SENSITIVITY)
    }

    const onTouchStart = (e) => { touchY.current = e.touches[0].clientY }
    const onTouchMove = (e) => {
      if (touchY.current === null) return
      if (useStore.getState().projectState !== 'idle') return
      const y = e.touches[0].clientY
      nudge((touchY.current - y) * TOUCH_SENSITIVITY)
      touchY.current = y
    }
    const onTouchEnd = () => { touchY.current = null }

    const onKey = (e) => {
      switch (e.key) {
        case 'ArrowDown': case 'PageDown': case ' ': nudge(KEY_STEP);  break
        case 'ArrowUp':   case 'PageUp':             nudge(-KEY_STEP); break
        case 'Home': cancelFlight(); flyTo(0); break
        case 'End':  cancelFlight(); flyTo(1); break
        default: return
      }
      e.preventDefault()
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKey)
      cancelFlight()
    }
  }, [isExploring])

  return null
}
