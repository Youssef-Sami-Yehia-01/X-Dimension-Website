/*
 * prefersReducedMotion — honored by the optional motion layers (cursor
 * force field, camera sway, HUD pulses). The core journey still moves —
 * it IS the site — but nothing extra fidgets for users who opted out.
 */
export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
