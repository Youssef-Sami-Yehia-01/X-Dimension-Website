/*
 * scanTiming — shared choreography for the opening laser sweep.
 *
 * When the visitor clicks through the intro, a single scan front travels
 * from the near edge of the world to the far edge, and EVERYTHING reveals
 * in its wake: the street fades in behind it, the scan beam rides on it,
 * and each building starts growing the moment the front passes its Z.
 *
 * One module owns the math so every element stays perfectly in sync.
 */

export const SWEEP_START_Z = 42      // world Z where the front begins — far enough behind
                                     // the world's nearest points (z 36) that NOTHING is
                                     // visible through the intro before the sweep fires
export const SWEEP_END_Z   = -247    // world Z where it finishes (past the monument)
export const SWEEP_DUR     = 4.6     // seconds for the full sweep

const SPAN = SWEEP_END_Z - SWEEP_START_Z

/** Position of the scan front `t` seconds after the sweep begins (ease-out cubic). */
export function sweepFrontZ(t) {
  const x = Math.min(Math.max(t / SWEEP_DUR, 0), 1)
  const eased = 1 - Math.pow(1 - x, 3)
  return SWEEP_START_Z + SPAN * eased
}

/** Seconds until the front reaches world position `z` (inverse of sweepFrontZ). */
export function sweepArrivalTime(z) {
  const u = Math.min(Math.max((z - SWEEP_START_Z) / SPAN, 0), 1)
  return (1 - Math.cbrt(1 - u)) * SWEEP_DUR
}
