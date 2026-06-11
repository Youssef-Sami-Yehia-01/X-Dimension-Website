/* check-bin.mjs — sanity-check the packed point cloud binaries */
import { readFileSync } from 'node:fs'

for (const file of ['public/bayt-al-umma-points.bin', 'public/building-points.bin']) {
  const buf = readFileSync(file)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const count = new DataView(ab).getUint32(0, true)
  const bounds = new Float32Array(ab, 4, 6)
  const pos = new Float32Array(ab, 28, count * 3)
  const col = new Uint8Array(ab, 28 + count * 12, count * 3)

  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
  let cmin = 255, cmax = 0, csum = 0
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      const v = pos[i * 3 + a]
      if (v < mn[a]) mn[a] = v
      if (v > mx[a]) mx[a] = v
      const c = col[i * 3 + a]
      if (c < cmin) cmin = c
      if (c > cmax) cmax = c
      csum += c
    }
  }
  console.log(file)
  console.log('  count', count, '| header bounds', [...bounds].map(v => v.toFixed(1)).join(', '))
  console.log('  actual pos min', mn.map(v => v.toFixed(1)).join(', '), '| max', mx.map(v => v.toFixed(1)).join(', '))
  console.log('  colors u8 min/max/mean', cmin, cmax, (csum / (count * 3)).toFixed(1))
}
