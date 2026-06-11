'use client'

import BuildingCloud from './BuildingCloud'

/*
 * CityBlocks — the avenue's skyline.
 *
 * Eleven instances of the shared building cloud line both sides of the
 * street with varied rotation / scale / brightness so the skyline reads as
 * a real city block, not copy-paste. Geometry is loaded once and shared;
 * each entry costs one draw call.
 *
 * The left side stays clear between z −20 and −90: that stretch belongs to
 * the Bayt Al-Umma facade and the heritage camera arc.
 */
const BLOCKS = [
  // ── Left side (beyond the heritage facade) ──────────────────────────
  { position: [-15.0, 0.22,  -98], rotationY:  0.06, scale: 1.00, brightness: 1.00 },
  { position: [-17.0, 0.22, -124], rotationY: -0.04, scale: 1.15, brightness: 0.85 },
  { position: [-14.5, 0.22, -150], rotationY:  0.10, scale: 0.90, brightness: 1.10 },
  { position: [-16.0, 0.22, -177], rotationY:  0.00, scale: 1.05, brightness: 0.90 },
  { position: [-15.0, 0.22, -205], rotationY:  0.08, scale: 0.95, brightness: 1.00 },

  // ── Right side ──────────────────────────────────────────────────────
  { position: [ 15.0, 0.22,  -38], rotationY:  0.05, scale: 0.95, brightness: 1.00 },
  { position: [ 16.5, 0.22,  -66], rotationY: -0.08, scale: 1.20, brightness: 0.80 },
  { position: [ 14.5, 0.22,  -96], rotationY:  0.03, scale: 1.00, brightness: 1.05 },
  { position: [ 16.0, 0.22, -126], rotationY: -0.05, scale: 0.90, brightness: 0.95 },
  { position: [ 15.0, 0.22, -158], rotationY:  0.07, scale: 1.10, brightness: 0.85 },
  { position: [ 15.5, 0.22, -190], rotationY:  0.00, scale: 1.00, brightness: 1.00 },
]

export default function CityBlocks() {
  return (
    <>
      {BLOCKS.map((block, i) => (
        <BuildingCloud key={i} {...block} />
      ))}
    </>
  )
}
