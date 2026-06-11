/*
 * audio — the journey's opt-in sound layer, synthesized entirely in
 * WebAudio (no assets, nothing to load):
 *
 *   bed     a low filtered-noise wind that deepens toward the coast
 *   whoosh  the laser sweep, heard once when the scan fires
 *   tick    a soft sonar blip on every beat change
 *
 * OFF by default. The AudioContext is only created inside a user gesture
 * (the toggle click), which satisfies autoplay policies everywhere.
 */

let ctx = null
let master = null
let bedFilter = null
let enabled = false

function ensureContext() {
  if (ctx) return
  const AC = window.AudioContext || window.webkitAudioContext
  ctx = new AC()

  master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  /* ── Wind bed: looped brown noise → lowpass with a slow LFO drift ── */
  const seconds = 4
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.2
  }

  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true

  bedFilter = ctx.createBiquadFilter()
  bedFilter.type = 'lowpass'
  bedFilter.frequency.value = 300
  bedFilter.Q.value = 0.4

  const bedGain = ctx.createGain()
  bedGain.gain.value = 0.5

  src.connect(bedFilter).connect(bedGain).connect(master)
  src.start()

  // Slow breathing on the filter so the wind never sits still
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.06
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 80
  lfo.connect(lfoGain).connect(bedFilter.frequency)
  lfo.start()
}

export function audioEnabled() {
  return enabled
}

/** Toggle the sound layer. MUST be called from a user gesture. */
export function toggleAudio() {
  ensureContext()
  ctx.resume()
  enabled = !enabled
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.linearRampToValueAtTime(enabled ? 0.55 : 0, ctx.currentTime + 0.8)
  return enabled
}

/** The wind deepens/brightens with the journey (city → desert → sea). */
export function setAudioProgress(p) {
  if (!ctx || !enabled) return
  const clamped = Math.min(Math.max(p, 0), 1)
  bedFilter.frequency.setTargetAtTime(240 + clamped * 360, ctx.currentTime, 0.6)
}

/** Soft sonar blip on beat changes. */
export function beatTick() {
  if (!ctx || !enabled) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(960, t)
  osc.frequency.exponentialRampToValueAtTime(640, t + 0.18)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.35)
}

/** The laser sweep — a rising-falling filtered noise pass (~3s). */
export function sweepWhoosh() {
  if (!ctx || !enabled) return
  const t = ctx.currentTime
  const seconds = 3
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const src = ctx.createBufferSource()
  src.buffer = buffer

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.4
  bp.frequency.setValueAtTime(160, t)
  bp.frequency.exponentialRampToValueAtTime(2200, t + 1.4)
  bp.frequency.exponentialRampToValueAtTime(280, t + seconds)

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds)

  src.connect(bp).connect(g).connect(master)
  src.start(t)
  src.stop(t + seconds)
}
