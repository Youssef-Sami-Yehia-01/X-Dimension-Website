/**
 * sample-fbx.mjs  —  Generic FBX → particle-cloud JSON converter
 *
 * Usage:
 *   node tools/sample-fbx.mjs --input <file.fbx> [options]
 *
 * Options:
 *   --input    <path>   FBX file to convert (required)
 *   --output   <path>   Output JSON path (default: public/<stem>.json)
 *   --points   <n>      Number of sample points (default: 30000)
 *   --tex-dir  <path>   Folder containing texture images for UV colour lookup
 *                       (optional — falls back to height-based colour if omitted)
 *
 * Output JSON shape:
 *   { count, bounds: {minX,maxX,minY,maxY,minZ,maxZ}, positions[], colors[] }
 *   positions and colors are flat Float32 arrays encoded as regular JS arrays.
 *
 * Colour modes (auto-detected):
 *   UV     — when the model has UV data and --tex-dir textures are found
 *   Height — otherwise; top = bright white, base = dim grey
 */

import { parseBinary } from 'fbx-parser'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* ── CLI argument parsing ─────────────────────────────────────────────── */
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1] ?? true
      i++
    }
  }
  return args
}

const args    = parseArgs(process.argv.slice(2))
const fbxPath = args.input

if (!fbxPath) {
  console.error('Usage: node tools/sample-fbx.mjs --input <file.fbx> [--output <out.json>] [--points N] [--tex-dir <dir>]')
  process.exit(1)
}

const stem      = path.basename(fbxPath, path.extname(fbxPath)).replace(/\s+/g, '-').toLowerCase()
const outPath   = args.output  ?? path.join(__dirname, '..', 'public', `${stem}.json`)
const N_POINTS  = parseInt(args.points ?? '30000', 10)
const TEX_DIR   = args['tex-dir'] ?? null

/* ── Geometry helpers ─────────────────────────────────────────────────── */
function triArea(v0, v1, v2) {
  const ax = v1[0]-v0[0], ay = v1[1]-v0[1], az = v1[2]-v0[2]
  const bx = v2[0]-v0[0], by = v2[1]-v0[1], bz = v2[2]-v0[2]
  const cx = ay*bz - az*by
  const cy = az*bx - ax*bz
  const cz = ax*by - ay*bx
  return 0.5 * Math.sqrt(cx*cx + cy*cy + cz*cz)
}

/* UV texture sampler (only used when tex-dir is supplied) */
let Jimp = null
async function loadJimp() {
  if (!Jimp) Jimp = (await import('jimp')).default
  return Jimp
}
async function loadTex(filePath) {
  const j = await loadJimp()
  return j.read(filePath)
}
function sampleTex(img, u, v) {
  const w  = img.bitmap.width, h = img.bitmap.height
  const px = Math.max(0, Math.min(w-1, Math.floor(((u%1)+1)%1 * w)))
  const py = Math.max(0, Math.min(h-1, Math.floor((1-((v%1)+1)%1) * h)))
  const d  = img.bitmap.data
  const i  = (py * w + px) * 4
  return [d[i]/255, d[i+1]/255, d[i+2]/255]
}

/* ── Parse FBX ────────────────────────────────────────────────────────── */
console.log(`Parsing FBX: ${fbxPath}`)
const buf   = readFileSync(fbxPath)
const raw   = parseBinary(buf)
const nodes = raw.nodes ?? raw
const objs  = nodes.find(n => n.name === 'Objects')

const allGeos = objs.nodes.filter(n => n.name === 'Geometry')
console.log(`  ${allGeos.length} geometry mesh(es) found`)

/* ── Optionally resolve textures via Connections ──────────────────────── */
let texMap = {}   // materialId → Jimp image (loaded lazily)
let matTex = {}   // materialIndex-in-array → tex filename

if (TEX_DIR) {
  const conns = nodes.find(n => n.name === 'Connections')
  const texNodes = objs.nodes.filter(n => n.name === 'Texture')
  const matNodes = objs.nodes.filter(n => n.name === 'Material')

  // Build id → tex filename map
  const texById = {}
  texNodes.forEach(t => {
    const id  = t.props[0]
    const rel = t.nodes.find(n => n.name === 'RelativeFilename') ??
                t.nodes.find(n => n.name === 'FileName')
    if (rel) texById[id] = path.basename(String(rel.props[0]))
  })

  // Walk OO connections: texture → material
  if (conns) {
    conns.nodes.filter(c => c.props[0] === 'OP' || c.props[0] === 'OO').forEach(c => {
      const [, childId, parentId] = c.props
      if (texById[childId]) {
        // parentId is likely a material id
        matNodes.forEach((m, idx) => {
          if (m.props[0] === parentId) matTex[idx] = texById[childId]
        })
      }
    })
  }
  console.log(`  Texture map entries: ${Object.keys(matTex).length}`)
}

/* ── Triangulate all geometries ───────────────────────────────────────── */
console.log('Triangulating all meshes…')

const triangles = []   // { v:[3×[x,y,z]], uv:[3×[u,v]]|null, matIdx, geoIdx }
let totalTris = 0

allGeos.forEach((geo, geoIdx) => {
  const rawV  = geo.nodes.find(n => n.name === 'Vertices')?.props[0]
  const rawPI = geo.nodes.find(n => n.name === 'PolygonVertexIndex')?.props[0]
  if (!rawV || !rawPI) return

  /* Build vertex array */
  const verts = []
  for (let i = 0; i < rawV.length; i += 3) verts.push([rawV[i], rawV[i+1], rawV[i+2]])

  /* UV data (optional) */
  const uvLayer  = geo.nodes.find(n => n.name === 'LayerElementUV')
  const rawUV    = uvLayer?.nodes.find(n => n.name === 'UV')?.props[0]
  const rawUVI   = uvLayer?.nodes.find(n => n.name === 'UVIndex')?.props[0]
  const uvCoords = rawUV ? (() => { const a=[]; for(let i=0;i<rawUV.length;i+=2) a.push([rawUV[i],rawUV[i+1]]); return a })() : null

  /* Material-per-polygon */
  const matLayer  = geo.nodes.find(n => n.name === 'LayerElementMaterial')
  const rawMats   = matLayer?.nodes.find(n => n.name === 'Materials')?.props[0]
  const matMode   = matLayer?.nodes.find(n => n.name === 'MappingInformationType')?.props[0] ?? 'AllSame'

  /* Fan-triangulate polygons */
  let polyVerts = [], polyUVs = [], polyCount = 0

  for (let i = 0; i < rawPI.length; i++) {
    const raw_i = rawPI[i]
    const vi    = raw_i < 0 ? ~raw_i : raw_i
    polyVerts.push(vi)
    if (uvCoords && rawUVI) polyUVs.push(rawUVI[i])

    if (raw_i < 0) {
      const matIdx = (matMode === 'ByPolygon' && rawMats) ? rawMats[polyCount] : 0
      for (let k = 1; k < polyVerts.length - 1; k++) {
        const v0 = verts[polyVerts[0]]
        const v1 = verts[polyVerts[k]]
        const v2 = verts[polyVerts[k+1]]
        if (!v0 || !v1 || !v2) { polyVerts=[]; polyUVs=[]; polyCount++; continue }

        let uv = null
        if (uvCoords && polyUVs.length > k+1) {
          uv = [uvCoords[polyUVs[0]], uvCoords[polyUVs[k]], uvCoords[polyUVs[k+1]]]
        }

        triangles.push({ v: [v0, v1, v2], uv, matIdx, geoIdx })
        totalTris++
      }
      polyVerts = []; polyUVs = []; polyCount++
    }
  }
})
console.log(`  ${totalTris.toLocaleString()} triangles total`)

/* ── Compute global bounding box for colour normalisation ─────────────── */
let minY = Infinity, maxY = -Infinity
let minX = Infinity, maxX = -Infinity
let minZ = Infinity, maxZ = -Infinity
triangles.forEach(({ v }) => v.forEach(([x,y,z]) => {
  if (x < minX) minX = x; if (x > maxX) maxX = x
  if (y < minY) minY = y; if (y > maxY) maxY = y
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
}))
const rangeY = maxY - minY || 1

/* ── Load textures if needed ──────────────────────────────────────────── */
const texCache = {}
if (TEX_DIR && Object.keys(matTex).length > 0) {
  console.log('Loading textures…')
  for (const [idx, fname] of Object.entries(matTex)) {
    const full = path.join(TEX_DIR, fname)
    if (existsSync(full) && !texCache[fname]) {
      try { texCache[fname] = await loadTex(full); console.log(`  Loaded: ${fname}`) }
      catch(e) { console.warn(`  Skipped ${fname}: ${e.message}`) }
    }
  }
}
const hasUVColor = Object.keys(texCache).length > 0

/* ── Weighted random sampling ─────────────────────────────────────────── */
console.log(`Sampling ${N_POINTS.toLocaleString()} points… (colour mode: ${hasUVColor ? 'UV texture' : 'height'})`)

const areas = triangles.map(({ v: [v0,v1,v2] }) => triArea(v0,v1,v2))
const total = areas.reduce((s,a) => s+a, 0)
const cumul = []; let run = 0
areas.forEach(a => { run += a; cumul.push(run) })

function pickTri(r) {
  const t = r * total; let lo = 0, hi = cumul.length - 1
  while (lo < hi) { const m = (lo+hi)>>1; if (cumul[m] < t) lo=m+1; else hi=m }
  return lo
}

const positions = new Float32Array(N_POINTS * 3)
const colors    = new Float32Array(N_POINTS * 3)

for (let s = 0; s < N_POINTS; s++) {
  const tri = triangles[pickTri(Math.random())]
  const [v0, v1, v2] = tri.v

  const r1 = Math.sqrt(Math.random()), r2 = Math.random()
  const b0 = 1-r1, b1 = r1*(1-r2), b2 = r1*r2

  const px = b0*v0[0] + b1*v1[0] + b2*v2[0]
  const py = b0*v0[1] + b1*v1[1] + b2*v2[1]
  const pz = b0*v0[2] + b1*v1[2] + b2*v2[2]

  positions[s*3]   = px
  positions[s*3+1] = py
  positions[s*3+2] = pz

  let r = 1, g = 1, b = 1

  if (hasUVColor && tri.uv) {
    const texFile = matTex[tri.matIdx]
    const img     = texFile && texCache[texFile]
    if (img) {
      const [u0,u1,u2] = [tri.uv[0][0], tri.uv[1][0], tri.uv[2][0]]
      const [vv0,vv1,vv2] = [tri.uv[0][1], tri.uv[1][1], tri.uv[2][1]]
      const u = b0*u0 + b1*u1 + b2*u2
      const v = b0*vv0 + b1*vv1 + b2*vv2;
      [r, g, b] = sampleTex(img, u, v)
    }
  } else {
    /* Height-based colour: top = bright, base = dimmer */
    const t  = (py - minY) / rangeY          // 0 at ground, 1 at top
    const br = 0.45 + t * 0.55               // 0.45 → 1.00
    r = br; g = br; b = Math.min(1, br + 0.05)
  }

  colors[s*3]   = r
  colors[s*3+1] = g
  colors[s*3+2] = b
}

/* ── Write output ─────────────────────────────────────────────────────── */
const out = {
  count:     N_POINTS,
  bounds:    { minX, maxX, minY, maxY, minZ, maxZ },
  positions: Array.from(positions),
  colors:    Array.from(colors),
}
writeFileSync(outPath, JSON.stringify(out))
const kb = (JSON.stringify(out).length / 1024).toFixed(0)
console.log(`\nDone → ${outPath}  (${kb} KB)`)
console.log(`Bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}] Z[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`)
