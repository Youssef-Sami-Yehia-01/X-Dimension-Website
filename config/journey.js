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
  { t: 0.00, pos: [   0, 44,   38], look: [  0,  0,  -26] }, // high over open desert — the scan begins
  { t: 0.07, pos: [ 2.5, 22,   14], look: [ -1,  4,  -38] }, // descending as the street forms below
  { t: 0.14, pos: [   0, 3.2,  -6], look: [  0, 2.4, -50] }, // touchdown — street level
  { t: 0.22, pos: [ 1.5, 2.8, -24], look: [ -1, 2.6, -68] }, // gliding down the avenue
  { t: 0.30, pos: [ 3.5, 3.2, -34], look: [-16,  5,  -42] }, // turning toward Bayt Al-Umma
  { t: 0.38, pos: [  -3, 5.0, -62], look: [-22,  6,  -40] }, // arcing in front of the villa
  { t: 0.46, pos: [  -8, 7.0, -74], look: [-23,  7,  -38] }, // close three-quarter view
  { t: 0.54, pos: [   2, 10,  -92], look: [ -2,  4, -130] }, // leaving the city, rising
  { t: 0.64, pos: [   8, 26, -112], look: [-12,  0, -150] }, // crane shot — desert + pyramids ahead left
  { t: 0.74, pos: [   0, 56, -130], look: [ -6, -6, -190] }, // top-down aerial — the dataset
  { t: 0.84, pos: [  -8, 11, -174], look: [  5,  2, -206] }, // sweeping across the shoreline
  { t: 0.92, pos: [   0, 4.5,-192], look: [  0,  6, -228] }, // skimming the beach to the finale
  { t: 1.00, pos: [   0, 3.2,-204], look: [  0,  8, -232] }, // settled — over the water, facing the monument
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
 * Each section drives: the HUD rail, an in-world 3D text panel (layout
 * chosen by `type`, see ScanPanels3D), and nav fly-to targets.
 *
 * `panel.position` is where the floating annotation lives in the world;
 * `panel.facing` is the camera position at the beat's focus moment — the
 * panel is oriented toward it once, then sits fixed in space like a real
 * survey annotation the camera happens to fly past.
 */
export const SECTIONS = [
  {
    id: 'arrival',
    label: 'Arrival',
    start: 0.0, end: 0.13, focus: 0.0,
    type: 'text',
    kicker: '01 · The Scan',
    title: 'Reality,\ncaptured.',
    body: 'You are watching a laser scan in progress. X-Dimension turns Egypt’s built world — every façade, every street, every monument — into millimetre-accurate living data.',
    panel: { position: [-13.5, 22, -2], facing: [0, 42, 30], width: 13 },
  },
  {
    id: 'about',
    label: 'Who we are',
    start: 0.13, end: 0.28, focus: 0.20,
    type: 'text',
    kicker: '02 · Who we are',
    title: 'We measure\nwhat matters.',
    body: 'X-Dimension is a Cairo-based reality-capture studio for architects, engineers and conservators. We scan buildings, infrastructure and heritage sites — then hand you data you can build on.',
    panel: { position: [2.5, 10.5, -48], facing: [1.1, 2.9, -19.5], width: 13 },
  },
  {
    id: 'heritage',
    label: 'Heritage',
    start: 0.28, end: 0.50, focus: 0.40,
    type: 'caseStudy',
    kicker: '03 · Heritage',
    title: 'Bayt Al-Umma',
    body: 'The House of the Nation — home of Saad Zaghloul and a landmark of Egypt’s 1919 revolution. We documented it stone by stone in a single survey-grade point cloud, so its memory can outlast its masonry.',
    meta: 'Full documentation · survey-grade accuracy',
    cta: 'ENTER THE SCAN',
    panel: { position: [-16, 19.5, -44], facing: [-4.7, 5.6, -73.9], width: 13 },
  },
  {
    id: 'services',
    label: 'What we do',
    start: 0.50, end: 0.68, focus: 0.62,
    type: 'services',
    kicker: '04 · What we do',
    title: 'From points\nto intelligence.',
    services: [
      { name: '3D Laser Scanning',      desc: 'Survey-grade capture of as-built conditions.' },
      { name: 'Scan to BIM',            desc: 'Point clouds modelled into intelligent Revit models.' },
      { name: 'Heritage Documentation', desc: 'Digital twins of monuments, archived for restoration.' },
      { name: 'As-Built Drawings',      desc: 'Plans, sections and elevations, straight from the cloud.' },
    ],
    panel: { position: [-7, 15, -126], facing: [6.8, 22.8, -108], width: 14 },
  },
  {
    id: 'scale',
    label: 'In numbers',
    start: 0.68, end: 0.80, focus: 0.74,
    type: 'stats',
    kicker: '05 · In numbers',
    title: 'From Cairo to the coast.',
    stats: [
      { value: 60,  suffix: '+',  label: 'PROJECTS DELIVERED' },
      { value: 9,   suffix: 'B+', label: 'POINTS CAPTURED' },
      { value: 2,   suffix: 'MM', label: 'SURVEY ACCURACY' },
    ],
    panel: { position: [-2.5, 33, -153], facing: [0, 56, -130], width: 22 },
  },
  {
    id: 'careers',
    label: 'Join us',
    start: 0.80, end: 0.88, focus: 0.84,
    type: 'careers',
    kicker: '06 · Join us',
    title: 'See Egypt\ndifferently.',
    body: 'Surveyors, BIM modellers, point-cloud wranglers — if you want your work to outlast you, we want to hear from you.',
    cta: 'careers@xdimension.co',
    panel: { position: [1, 8.5, -193], facing: [-8, 11, -174], width: 13 },
  },
  {
    id: 'contact',
    label: 'Contact',
    start: 0.88, end: 1.001, focus: 1.0,
    type: 'contact',
    kicker: '07 · Contact',
    title: 'Map what matters.',
    email: 'info@xdimension.co',
    location: 'CAIRO, EGYPT',
    panel: { position: [0, 4.6, -222], facing: [0, 3.2, -204], width: 14 },
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

/* ── Solid 3D headline monuments ─────────────────────────────────────────
 * Two hero moments rendered as solid extruded type with amber wire edges —
 * crisp "blueprint" lettering standing in the world:
 *
 *   gate      — floats mid-air; the descending camera flies past it
 *   monument  — the finale: the company name standing IN the sea,
 *               with a faint reflection on the water
 */
export const SOLID_TEXTS = [
  {
    id: 'gate',
    start: -0.01, end: 0.135,
    revealDelay: 2.8,                    // let the laser sweep pass first
    position: [0, 13, -24],
    rotation: [0.30, 0, 0],              // tilted up toward the descending camera
    size: 2.5, depth: 0.55, lineGap: 1.1,
    lines: ['REALITY,', 'CAPTURED.'],
  },
  {
    id: 'monument',
    start: 0.79, end: 1.001,
    position: [0, 9.5, -234],
    rotation: [0, 0, 0],                 // faces the settling camera head-on
    size: 2.6, depth: 0.8, lineGap: 1.2,
    lines: ['X-DIMENSION'],
    reflection: true,                    // mirrored on the water below
  },
]

/* ── Survey road markings ────────────────────────────────────────────────
 * Tiny amber chainage stamps painted flat on the asphalt every ~45 m —
 * the kind of stationing marks a real survey crew leaves behind.
 */
export const ROAD_MARKINGS = [
  { position: [-5.4, 0.06,  -18], text: 'CH 0+048 · SCAN OK' },
  { position: [ 5.2, 0.06,  -62], text: 'CH 0+092 · SECTOR 02' },
  { position: [-5.6, 0.06, -108], text: 'CH 0+138 · SCAN OK' },
  { position: [ 5.4, 0.06, -148], text: 'CH 0+178 · SECTOR 04' },
  { position: [-5.2, 0.06, -188], text: 'CH 0+218 · END OF SURVEY' },
]
