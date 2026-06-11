'use client'

import BuildingCloud from './BuildingCloud'

/*
 * CityBlocks — the avenue's skyline, CITY ZONE ONLY (z ≥ −100).
 *
 * Beyond −100 the city gives way to desert dunes and the pyramids — see
 * DuneCloud / PyramidsCloud / OceanCloud for the rest of the journey.
 *
 * Instances share one geometry (one draw call each), with varied rotation /
 * scale / brightness so the skyline reads as a real block, not copy-paste.
 * The left side stays clear between z −20 and −90: that stretch belongs to
 * the Bayt Al-Umma villa and the heritage camera arc.
 */
const BLOCKS = [
  // ── Left side (framing the heritage villa) ──────────────────────────
  // The journey now OPENS over desert (z +36…−6), so the first buildings
  // stand at the urban fringe where the street has fully formed.
  { position: [-15.5, 0.22,  -18], rotationY:  0.08, scale: 0.95, brightness: 1.00 },
  { position: [-17.0, 0.22,  -94], rotationY: -0.04, scale: 1.10, brightness: 0.90 },

  // ── Right side ──────────────────────────────────────────────────────
  { position: [ 15.5, 0.22,  -20], rotationY:  0.05, scale: 0.90, brightness: 1.00 },
  { position: [ 15.0, 0.22,  -42], rotationY:  0.05, scale: 0.95, brightness: 1.00 },
  { position: [ 16.5, 0.22,  -68], rotationY: -0.08, scale: 1.20, brightness: 0.80 },
  { position: [ 14.5, 0.22,  -96], rotationY:  0.03, scale: 1.00, brightness: 1.05 },
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
