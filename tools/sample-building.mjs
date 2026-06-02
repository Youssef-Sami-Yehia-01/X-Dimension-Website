/**
 * sample-building.mjs
 *
 * Reads the FBX, triangulates the mesh, samples N points uniformly across all
 * surfaces (weighted by triangle area), samples the UV-mapped texture at each
 * point for its colour, and writes public/building-points.json.
 *
 * Run once: node tools/sample-building.mjs
 */

import { parseBinary } from 'fbx-parser'
import Jimp from 'jimp'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, '..')

const FBX_PATH  = 'C:/Users/youss/Downloads/old-japanese-store-lowpoly/source/extracted/japanese store.fbx'
const TEX_PATHS = [
  'C:/Users/youss/Downloads/old-japanese-store-lowpoly/textures/Building 1.png',
  'C:/Users/youss/Downloads/old-japanese-store-lowpoly/textures/Building 1 (side).png',
]
const OUT_PATH  = path.join(ROOT, 'public', 'building-points.json')
const N_POINTS  = 30_000   // total sampled particles

/* ── helpers ─────────────────────────────────────────────────────────────── */

function vec3(ax, i) { return [ax[i*3], ax[i*3+1], ax[i*3+2]] }
function sub(a, b)   { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]] }
function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ]
}
function len(v) { return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) }
function triArea(v0, v1, v2) { return 0.5 * len(cross(sub(v1,v0), sub(v2,v0))) }

/* Sample pixel from a Jimp image given a UV coordinate.
   FBX UVs: U left→right, V bottom→top (flip V to get image row). */
function sampleTexture(img, u, v) {
  const w = img.bitmap.width
  const h = img.bitmap.height
  const px = Math.max(0, Math.min(w - 1, Math.floor(((u % 1) + 1) % 1 * w)))
  const py = Math.max(0, Math.min(h - 1, Math.floor((1 - ((v % 1) + 1) % 1) * h)))
  const idx = (py * w + px) * 4
  const d   = img.bitmap.data
  return [d[idx] / 255, d[idx+1] / 255, d[idx+2] / 255]
}

/* ── parse FBX ───────────────────────────────────────────────────────────── */

console.log('Parsing FBX…')
const buf     = readFileSync(FBX_PATH)
const raw     = parseBinary(buf)
const nodes   = raw.nodes || raw
const objects = nodes.find(n => n.name === 'Objects')
const geo     = objects.nodes.find(n => n.name === 'Geometry')

const rawVerts  = geo.nodes.find(n => n.name === 'Vertices').props[0]        // Float64
const polyIdx   = geo.nodes.find(n => n.name === 'PolygonVertexIndex').props[0] // Int32

const uvLayer   = geo.nodes.find(n => n.name === 'LayerElementUV')
const rawUVs    = uvLayer.nodes.find(n => n.name === 'UV').props[0]
const rawUVIdx  = uvLayer.nodes.find(n => n.name === 'UVIndex').props[0]

const matLayer  = geo.nodes.find(n => n.name === 'LayerElementMaterial')
const rawMats   = matLayer.nodes.find(n => n.name === 'Materials').props[0]
const matMap    = matLayer.nodes.find(n => n.name === 'MappingInformationType').props[0]  // ByPolygon

// Convert flat vertex array → [[x,y,z], ...]
const vertices = []
for (let i = 0; i < rawVerts.length; i += 3) {
  vertices.push([rawVerts[i], rawVerts[i+1], rawVerts[i+2]])
}

// Convert flat UV array → [[u,v], ...]
const uvCoords = []
for (let i = 0; i < rawUVs.length; i += 2) {
  uvCoords.push([rawUVs[i], rawUVs[i+1]])
}

/* ── triangulate ─────────────────────────────────────────────────────────── */

console.log('Triangulating…')

// FBX convention: negative index = last vertex of polygon; actual = ~value
const triangles = []   // each: { vi:[i0,i1,i2], uvi:[ui0,ui1,ui2], matId }

let polyVerts = [], polyUVs = [], polyCount = 0, pvCursor = 0

for (let i = 0; i < polyIdx.length; i++) {
  const raw_i = polyIdx[i]
  const vi    = raw_i < 0 ? ~raw_i : raw_i    // ~n = -(n+1)
  const uvi   = rawUVIdx[i]
  polyVerts.push(vi)
  polyUVs.push(uvi)

  if (raw_i < 0) {
    // end of polygon — fan-triangulate
    const matId = matMap === 'ByPolygon' ? rawMats[polyCount] : 0
    for (let k = 1; k < polyVerts.length - 1; k++) {
      triangles.push({
        vi:  [polyVerts[0],   polyVerts[k],   polyVerts[k+1]],
        uvi: [polyUVs[0],     polyUVs[k],     polyUVs[k+1]],
        matId,
      })
    }
    polyVerts = []; polyUVs = []
    polyCount++
  }
}

console.log(`  ${vertices.length} verts, ${triangles.length} triangles`)

/* ── load textures ───────────────────────────────────────────────────────── */

console.log('Loading textures…')
const textures = await Promise.all(TEX_PATHS.map(p => Jimp.read(p)))
console.log(`  Loaded: ${textures.map(t => t.bitmap.width + 'x' + t.bitmap.height).join(', ')}`)

/* ── weighted random sampling ────────────────────────────────────────────── */

console.log(`Sampling ${N_POINTS} points…`)

// Compute cumulative area weights
const areas   = triangles.map(t => triArea(vertices[t.vi[0]], vertices[t.vi[1]], vertices[t.vi[2]]))
const total   = areas.reduce((s, a) => s + a, 0)
const cumul   = []
let   running = 0
for (const a of areas) { running += a; cumul.push(running) }

// Binary search for a cumulative weight
function pickTri(r) {
  const target = r * total
  let lo = 0, hi = cumul.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumul[mid] < target) lo = mid + 1; else hi = mid
  }
  return lo
}

const positions = []
const colors    = []

for (let s = 0; s < N_POINTS; s++) {
  const tri  = triangles[pickTri(Math.random())]
  const [i0, i1, i2] = tri.vi
  const v0 = vertices[i0], v1 = vertices[i1], v2 = vertices[i2]

  // Uniform barycentric sample: sqrt avoids clustering near v0
  const r1  = Math.sqrt(Math.random())
  const r2  = Math.random()
  const b0  = 1 - r1
  const b1  = r1 * (1 - r2)
  const b2  = r1 * r2

  const px  = b0*v0[0] + b1*v1[0] + b2*v2[0]
  const py  = b0*v0[1] + b1*v1[1] + b2*v2[1]
  const pz  = b0*v0[2] + b1*v1[2] + b2*v2[2]

  // Interpolate UV
  const uv0 = uvCoords[tri.uvi[0]]
  const uv1 = uvCoords[tri.uvi[1]]
  const uv2 = uvCoords[tri.uvi[2]]
  const u   = b0*uv0[0] + b1*uv1[0] + b2*uv2[0]
  const v   = b0*uv0[1] + b1*uv1[1] + b2*uv2[1]

  // Sample the right texture for this polygon's material
  const img = textures[Math.min(tri.matId, textures.length - 1)]
  const [r, g, b] = sampleTexture(img, u, v)

  positions.push(px, py, pz)
  colors.push(r, g, b)
}

/* ── write output ────────────────────────────────────────────────────────── */

// Compute bounding box so the caller can centre/scale the model
let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity
for (let i = 0; i < positions.length; i+=3) {
  minX = Math.min(minX, positions[i]);   maxX = Math.max(maxX, positions[i])
  minY = Math.min(minY, positions[i+1]); maxY = Math.max(maxY, positions[i+1])
  minZ = Math.min(minZ, positions[i+2]); maxZ = Math.max(maxZ, positions[i+2])
}

const out = {
  count:     N_POINTS,
  bounds:    { minX, maxX, minY, maxY, minZ, maxZ },
  positions: Array.from(positions),
  colors:    Array.from(colors),
}

writeFileSync(OUT_PATH, JSON.stringify(out))
const kb = (JSON.stringify(out).length / 1024).toFixed(1)
console.log(`Done — wrote ${OUT_PATH} (${kb} KB)`)
console.log(`Bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}] Z[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`)
