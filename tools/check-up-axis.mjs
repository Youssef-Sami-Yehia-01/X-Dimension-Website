/* check-up-axis — which axis is vertical? Floors/roof = density spikes along height. */
import { readFileSync } from 'node:fs'

const buf = readFileSync('public/bayt-al-umma-points.bin')
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const count = new DataView(ab).getUint32(0, true)
const pos = new Float32Array(ab, 28, count * 3)

// dominant cluster (matches loader crop)
const inCluster = (i) => {
  const x = pos[i * 3], y = pos[i * 3 + 1]
  return x > -1050 && x < -280 && y > 225 && y < 645
}

const BINS = 20
for (const [name, off] of [['X(257)', 0], ['Y(126)', 1], ['Z(58)', 2]]) {
  let mn = 1e9, mx = -1e9
  for (let i = 0; i < count; i++) {
    if (!inCluster(i)) continue
    const v = pos[i * 3 + off]
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const hist = new Array(BINS).fill(0)
  let n = 0
  for (let i = 0; i < count; i++) {
    if (!inCluster(i)) continue
    const v = pos[i * 3 + off]
    hist[Math.min(BINS - 1, Math.floor(((v - mn) / (mx - mn)) * BINS))]++
    n++
  }
  console.log(`\n${name}  range ${mn.toFixed(0)}…${mx.toFixed(0)}  (${n} pts)`)
  hist.forEach((c, b) => console.log(`  ${(mn + (b / BINS) * (mx - mn)).toFixed(0).padStart(6)}: ${'#'.repeat(Math.round(c / n * 150))}`))
}
