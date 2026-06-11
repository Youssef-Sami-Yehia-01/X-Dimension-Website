'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '@/store/useStore'
import { SECTIONS, LOOP_END } from '@/config/journey'

/*
 * ScrollDriver — translates user input into the 0–1 journey progress.
 *
 * No DOM scroll tricks: wheel, touch-drag and keyboard all accumulate into
 * the Zustand progress value; the camera and panels react to that number.
 *
 * Nav jumps use flyTo(): instead of teleporting, the progress value itself
 * is tweened, so the camera physically travels the authored path through
 * the city to reach the section. Any manual input cancels the flight.
 *
 * Beat magnetism: when input rests near a beat's focus moment, the journey
 * drifts gently onto it — every pause becomes a composed shot, but the
 * pull radius is small enough that free-roaming never feels hijacked.
 */

const WHEEL_SENSITIVITY = 0.00028  // ~36 mouse-wheel notches = full journey
const TOUCH_SENSITIVITY = 0.0011   // drag a screen-height ≈ 0.8 progress
const KEY_STEP          = 0.035
const SNAP_DELAY_MS     = 750      // input quiet time before magnetism engages
const SNAP_RADIUS       = 0.035    // max progress distance the magnet reaches

let flightTween = null

/** Tween the journey to a target progress, travelling through the world.
 *  Takes the SHORT way around the loop — "Scan again" from the monument
 *  flies forward through the return leg, not backward through Egypt. */
export function flyTo(target) {
  const store = useStore.getState()
  if (store.projectState !== 'idle') return

  const from = store.scrollProgress
  let delta = target - from
  if (delta >  LOOP_END / 2) delta -= LOOP_END
  if (delta < -LOOP_END / 2) delta += LOOP_END
  const distance = Math.abs(delta)
  if (distance < 0.001) return

  flightTween?.kill()
  const proxy = { t: from }
  flightTween = gsap.to(proxy, {
    t: from + delta,
    duration: 0.9 + distance * 3.2,      // longer flights take longer — feels physical
    ease: 'power2.inOut',
    onUpdate: () => {
      let v = proxy.t
      if (v >= LOOP_END) v -= LOOP_END
      if (v < 0)         v += LOOP_END
      useStore.getState().setScrollProgress(v)
    },
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
  const snapTimer = useRef(null)

  useEffect(() => {
    if (!isExploring) return
    const setProgress = useStore.getState().setScrollProgress

    /* Beat magnetism: settle onto the nearest focus if input rests near one */
    const armSnap = () => {
      clearTimeout(snapTimer.current)
      snapTimer.current = setTimeout(() => {
        if (useStore.getState().projectState !== 'idle' || flightTween) return
        const p = useStore.getState().scrollProgress
        let best = null
        for (const s of SECTIONS) {
          const d = Math.abs(s.focus - p)
          if (d > 0.0015 && d < SNAP_RADIUS && (!best || d < best.d)) best = { d, t: s.focus }
        }
        if (best) flyTo(best.t)
      }, SNAP_DELAY_MS)
    }

    const nudge = (delta) => {
      if (useStore.getState().projectState !== 'idle') return
      cancelFlight()
      // The journey is a cycle: scrolling past the end (or back past the
      // start) carries you through the return flight, modulo LOOP_END
      let next = useStore.getState().scrollProgress + delta
      if (next >= LOOP_END) next -= LOOP_END
      if (next < 0) next += LOOP_END
      setProgress(next)
      armSnap()
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
      clearTimeout(snapTimer.current)
      cancelFlight()
    }
  }, [isExploring])

  return null
}
