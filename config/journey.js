import * as THREE from 'three'

/*
 * journey.js — the storyboard. Single source of truth for the entire
 * scroll experience: camera choreography, narrative beats, copy, and
 * 3D particle-text placements.
 *
 * THE SCAN — narrative arc
 * ────────────────────────
 * The visitor pilots a reality-capture mission over Cairo:
 *
 *   0  ARRIVAL    aerial view · an amber laser sweep scans the city into
 *                 existence beneath you, then the camera banks down
 *   1  CAPTURE    street-level glide · who X-Dimension is
 *   2  HERITAGE   the camera leaves the road and arcs around Bayt Al-Umma —
 *                 the interactive case study (click to enter the scan)
 *   3  SERVICES   crane shot above the rooftops · the street becomes a
 *                 dataset · text painted flat on the asphalt like survey marks
 *   4  SCALE      full aerial over the curved world · the numbers
 *   5  CAREERS    swoop back down through the buildings
 *   6  CONTACT    the camera settles at the end of the avenue where the
 *                 company name assembles itself from particles
 *
 * Everything below is data. To re-cut the film, edit this file only.
 */

/* ── Camera choreography ─────────────────────────────────────────────────
 * Keyframes: { t, pos, look }. Sampled with a Catmull-Rom/Hermite blend so
 * the camera flows through (not between) the poses. `t` is scroll progress.
 */
export const CAMERA_KEYFRAMES = [
  { t: 0.00, pos: [   0, 42,   30], look: [  0,  0,  -28] }, // high aerial — the scan begins
  { t: 0.07, pos: [ 2.5, 22,   12], look: [ -1,  4,  -38] }, // descending
  { t: 0.14, pos: [   0, 3.2,  -6], look: [  0, 2.4, -50] }, // touchdown — street level
  { t: 0.22, pos: [ 1.5, 2.8, -24], look: [ -1, 2.6, -68] }, // gliding down the avenue
  { t: 0.30, pos: [ 3.5, 3.2, -40], look: [-14,  6,  -56] }, // turning toward Bayt Al-Umma
  { t: 0.38, pos: [  -3, 5.0, -70], look: [-22,  8,  -56] }, // arcing in front of the facade
  { t: 0.46, pos: [  -8, 7.5, -80], look: [-22,  9,  -58] }, // close three-quarter view
  { t: 0.54, pos: [   2, 10,  -92], look: [ -2,  4, -130] }, // swinging back to the avenue, rising
  { t: 0.64, pos: [   8, 26, -112], look: [ -2,  1, -148] }, // crane shot above the rooftops
  { t: 0.74, pos: [   0, 56, -130], look: [  0, -6, -190] }, // top-down aerial — the dataset
  { t: 0.84, pos: [  -1, 14, -172], look: [  2,  4, -208] }, // swooping back down
  { t: 0.92, pos: [   0, 4.5,-192], look: [  0,  6, -228] }, // approach to the finale
  { t: 1.00, pos: [   0, 3.2,-204], look: [  0,  8, -232] }, // settled — facing the monument
]

/* Pre-built Vector3s (built once at module load — no per-frame allocation) */
const KEYS = CAMERA_KEYFRAMES.map(k => ({
  t: k.t,
  pos: new THREE.Vector3(...k.pos),
  look: new THREE.Vector3(...k.look),
}))

/* Hermite basis with uniform Catmull-Rom tangents.
 * Tolerant of non-uniform key spacing; tiny velocity steps at the knots are
 * invisible after the scroll-progress smoothing applied in ScrollCamera. */
function sampleTrack(keys, field, t, out) {
  const n = keys.length
  if (t <= keys[0].t)     return out.copy(keys[0][field])
  if (t >= keys[n - 1].t) return out.copy(keys[n - 1][field])

  let i = 0
  while (i < n - 2 && t > keys[i + 1].t) i++

  const k0 = keys[Math.max(0, i - 1)][field]
  const k1 = keys[i][field]
  const k2 = keys[i + 1][field]
  const k3 = keys[Math.min(n - 1, i + 2)][field]

  const span = keys[i + 1].t - keys[i].t
  const u  = (t - keys[i].t) / span
  const u2 = u * u
  const u3 = u2 * u

  // Hermite blend weights
  const h00 =  2 * u3 - 3 * u2 + 1
  const h10 =      u3 - 2 * u2 + u
  const h01 = -2 * u3 + 3 * u2
  const h11 =      u3 -     u2

  // Catmull-Rom tangents
  const m1x = (k2.x - k0.x) * 0.5, m1y = (k2.y - k0.y) * 0.5, m1z = (k2.z - k0.z) * 0.5
  const m2x = (k3.x - k1.x) * 0.5, m2y = (k3.y - k1.y) * 0.5, m2z = (k3.z - k1.z) * 0.5

  out.set(
    h00 * k1.x + h10 * m1x + h01 * k2.x + h11 * m2x,
    h00 * k1.y + h10 * m1y + h01 * k2.y + h11 * m2y,
    h00 * k1.z + h10 * m1z + h01 * k2.z + h11 * m2z
  )
  return out
}

/** Sample the camera path at scroll progress t (0–1). Writes into outPos/outLook. */
export function sampleCamera(t, outPos, outLook) {
  sampleTrack(KEYS, 'pos',  t, outPos)
  sampleTrack(KEYS, 'look', t, outLook)
}

/* ── Narrative beats ─────────────────────────────────────────────────────
 * Each section drives: the HUD rail, the DOM panel (layout chosen by
 * `type`), and nav fly-to targets (`focus` = the most photogenic moment).
 */
export const SECTIONS = [
  {
    id: 'arrival',
    label: 'Arrival',
    start: 0.0, end: 0.13, focus: 0.0,
    type: 'intro',
    anchor: 'bottomLeft',
    kicker: '01 · The Scan',
    title: 'Reality, captured.',
    body: 'You are watching a laser scan in progress. X-Dimension turns Egypt’s built world — every façade, every street, every monument — into millimetre-accurate living data.',
  },
  {
    id: 'about',
    label: 'Who we are',
    start: 0.13, end: 0.28, focus: 0.20,
    type: 'text',
    anchor: 'left',
    kicker: '02 · Who we are',
    title: 'We measure what matters.',
    body: 'X-Dimension is a Cairo-based reality-capture studio for architects, engineers and conservators. We scan buildings, infrastructure and heritage sites — then hand you data you can build on.',
  },
  {
    id: 'heritage',
    label: 'Heritage',
    start: 0.28, end: 0.50, focus: 0.40,
    type: 'caseStudy',
    anchor: 'right',
    kicker: '03 · Heritage',
    title: 'Bayt Al-Umma',
    body: 'The House of the Nation — home of Saad Zaghloul and a landmark of Egypt’s 1919 revolution. We documented it stone by stone in a single survey-grade point cloud, so its memory can outlast its masonry.',
    meta: 'Full exterior documentation · survey-grade accuracy',
    cta: 'Enter the scan',
  },
  {
    id: 'services',
    label: 'What we do',
    start: 0.50, end: 0.68, focus: 0.62,
    type: 'services',
    anchor: 'left',
    kicker: '04 · What we do',
    title: 'From points to intelligence.',
    services: [
      { name: '3D Laser Scanning',      desc: 'Survey-grade capture of as-built conditions, inside and out.' },
      { name: 'Scan to BIM',            desc: 'Point clouds modelled into structured, intelligent Revit models.' },
      { name: 'Heritage Documentation', desc: 'Digital twins of monuments, archived for restoration.' },
      { name: 'As-Built Drawings',      desc: 'Plans, sections and elevations, straight from the cloud.' },
    ],
  },
  {
    id: 'scale',
    label: 'In numbers',
    start: 0.68, end: 0.80, focus: 0.74,
    type: 'stats',
    anchor: 'bottomCenter',
    kicker: '05 · In numbers',
    stats: [
      { value: 60,  suffix: '+',  label: 'Projects delivered' },
      { value: 9,   suffix: 'B+', label: 'Points captured' },
      { value: 2,   suffix: 'mm', label: 'Survey accuracy' },
    ],
  },
  {
    id: 'careers',
    label: 'Join us',
    start: 0.80, end: 0.88, focus: 0.84,
    type: 'careers',
    anchor: 'right',
    kicker: '06 · Join us',
    title: 'See Egypt differently.',
    body: 'Surveyors, BIM modellers, point-cloud wranglers — if you want your work to outlast you, we want to hear from you.',
    cta: 'careers@xdimension.co',
  },
  {
    id: 'contact',
    label: 'Contact',
    start: 0.88, end: 1.001, focus: 1.0,
    type: 'contact',
    anchor: 'bottomCenter',
    kicker: '07 · Contact',
    title: 'Map what matters.',
    email: 'info@xdimension.co',
    location: 'Cairo, Egypt',
  },
]

/** Section lookup for a progress value (used by panels + HUD rail). */
export function sectionAt(t) {
  return SECTIONS.find(s => t >= s.start && t < s.end) ?? SECTIONS[SECTIONS.length - 1]
}

/* ── Project case studies ────────────────────────────────────────────────
 * Shown in the orbit view's info panel (ProjectUI).
 */
export const PROJECTS = {
  'bayt-al-umma': {
    name: 'Bayt Al-Umma',
    subtitle: 'The House of the Nation · Downtown Cairo',
    description:
      'Saad Zaghloul’s residence and the beating heart of the 1919 revolution, today a museum. ' +
      'You are orbiting the actual point cloud from our scan — every shutter, cornice and balcony ' +
      'captured exactly as it stands.',
    facts: [
      { label: 'Era',          value: 'Early 1900s' },
      { label: 'Capture',      value: 'Terrestrial laser scanning' },
      { label: 'Accuracy',     value: 'Survey-grade · mm level' },
      { label: 'Deliverables', value: 'Point cloud · BIM · drawings' },
    ],
  },
}

/* ── 3D particle headlines ───────────────────────────────────────────────
 * Five placements, each staged differently so no two beats feel alike:
 *
 *   gate      — floats mid-air; the descending camera flies THROUGH it
 *   street    — classic street-side billboard during the ground glide
 *   landmark  — name hovering beside Bayt Al-Umma, angled at the arc
 *   asphalt   — painted flat on the road, read from the crane shot
 *   monument  — the finale: company name assembling at the road's end
 *
 * `lines` entries: { text, size, depth, count }. `rotation` is XYZ euler.
 */
export const TEXTS_3D = [
  {
    id: 'gate',
    scrollStart: -0.01, scrollEnd: 0.13,
    assembleDelay: 2.6,                  // wait for the scan sweep to pass
    position: [0.5, 12, -22],
    rotation: [0.30, 0, 0],              // tilted up toward the descending camera
    pointSize: 0.32,
    lines: [
      { text: 'REALITY,',  size: 2.6, depth: 0.6, count: 4400 },
      { text: 'CAPTURED.', size: 2.6, depth: 0.6, count: 4400 },
    ],
  },
  {
    id: 'street',
    scrollStart: 0.12, scrollEnd: 0.30,
    position: [2, 12, -56],              // banner floating in the sky over the avenue
    rotation: [0, 0, 0],
    pointSize: 0.24,
    lines: [
      { text: 'EVERY POINT',   size: 1.6, depth: 0.45, count: 3200 },
      { text: 'TELLS A STORY', size: 0.9, depth: 0.22, count: 1900 },
    ],
  },
  {
    id: 'landmark',
    scrollStart: 0.27, scrollEnd: 0.52,
    position: [-17, 18, -36],            // hovers off the villa's near corner
    billboard: true,                     // always turns to face the arcing camera
    pointSize: 0.24,
    lines: [
      { text: 'BAYT AL-UMMA',         size: 1.5,  depth: 0.45, count: 3000 },
      { text: 'THE HOUSE OF THE NATION', size: 0.6, depth: 0.18, count: 1500 },
    ],
  },
  {
    id: 'asphalt',
    scrollStart: 0.48, scrollEnd: 0.70,
    position: [0, 0.4, -130],
    rotation: [-Math.PI / 2, 0, 0],      // lying flat on the road like survey markings
    pointSize: 0.30,
    lines: [
      { text: 'FROM POINTS', size: 2.1, depth: 0.10, count: 3600 },
      { text: 'TO INSIGHT',  size: 2.1, depth: 0.10, count: 3600 },
    ],
  },
  {
    id: 'monument',
    scrollStart: 0.80, scrollEnd: 1.001,
    position: [0, 11.5, -234],
    rotation: [0, 0, 0],                 // faces the settling camera head-on
    pointSize: 0.30,
    lines: [
      { text: 'X-DIMENSION', size: 2.3, depth: 0.6, count: 5200 },
      { text: 'REALITY, CAPTURED. FUTURE, BUILT.', size: 0.62, depth: 0.16, count: 1900 },
    ],
  },
]
