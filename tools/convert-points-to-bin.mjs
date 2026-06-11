/*
 * convert-points-to-bin.mjs — pack point-cloud JSON into a compact binary.
 *
 * Output layout (little-endian), consumed by BuildingCloud / BaytAlUmmaCloud:
 *   [count        u32 ]
 *   [bounds   6 × f32 ]  minX, minY, minZ, maxX, maxY, maxZ
 *   [positions count×3 × f32]
 *   [colors    count×3 × u8 ]
 *
 * vs. the source JSON this is ~7× smaller and parses with zero work
 * (typed-array views straight over the fetched ArrayBuffer).
 *
 * Usage:  node tools/convert-points-to-bin.mjs
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const CONVERSIONS = [
  { src: 'tools/data/building-points.json',     dst: 'public/building-points.bin' },
  { src: 'tools/data/bayt-al-umma-points.json', dst: 'public/bayt-al-umma-points.bin' },
]

for (const { src, dst } of CONVERSIONS) {
  const { count, bounds, positions, colors } = JSON.parse(readFileSync(resolve(src), 'utf8'))

  const headerBytes = 4 + 6 * 4
  const posBytes    = count * 3 * 4
  const colBytes    = count * 3
  const buffer      = Buffer.alloc(headerBytes + posBytes + colBytes)

  buffer.writeUInt32LE(count, 0)
  const boundsArr = [bounds.minX, bounds.minY, bounds.minZ, bounds.maxX, bounds.maxY, bounds.maxZ]
  boundsArr.forEach((v, i) => buffer.writeFloatLE(v, 4 + i * 4))

  for (let i = 0; i < count * 3; i++) {
    buffer.writeFloatLE(positions[i], headerBytes + i * 4)
  }
  for (let i = 0; i < count * 3; i++) {
    // colors arrive as 0–1 floats; store as u8
    buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(colors[i] * 255))), headerBytes + posBytes + i)
  }

  writeFileSync(resolve(dst), buffer)
  const srcKB = (statSync(resolve(src)).size / 1024).toFixed(0)
  const dstKB = (buffer.length / 1024).toFixed(0)
  console.log(`${src} (${srcKB} KB) → ${dst} (${dstKB} KB)`)
}
