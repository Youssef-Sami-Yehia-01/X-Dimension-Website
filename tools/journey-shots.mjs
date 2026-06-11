/*
 * journey-shots.mjs — drive the journey in a headless browser and capture
 * a screenshot at every narrative beat. Dev/QA tool.
 *
 * Usage: node tools/journey-shots.mjs   (dev server must be on :3000)
 * Output: tools/shots/*.png
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'tools/shots'
mkdirSync(OUT, { recursive: true })

const BEATS = [
  { name: '1-arrival',  t: 0.0,  settle: 6500 },  // sweep + gate text need time
  { name: '2-about',    t: 0.20, settle: 4000 },
  { name: '3-heritage', t: 0.40, settle: 4500 },
  { name: '4-services', t: 0.62, settle: 4500 },
  { name: '5-scale',    t: 0.74, settle: 4000 },
  { name: '6-careers',  t: 0.84, settle: 3500 },
  { name: '7-contact',  t: 1.0,  settle: 5000 },
]

// SwiftShader via ANGLE keeps rAF at 60fps in headless (default soft-GL crawls at ~4fps)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()) })
page.on('pageerror', e => console.log('[pageerror]', e.message))

await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(4500)
await page.screenshot({ path: `${OUT}/0-intro.png` })

// Click through the intro
await page.mouse.click(800, 450)
await page.waitForTimeout(2600)   // logo zoom (2.2s) + start of sweep

for (const beat of BEATS) {
  await page.evaluate((t) => window.__xdStore.getState().setScrollProgress(t), beat.t)
  await page.waitForTimeout(beat.settle)
  await page.screenshot({ path: `${OUT}/${beat.name}.png` })
  console.log('captured', beat.name)
}

// Heritage orbit mode: fly back, then click the CTA
await page.evaluate(() => window.__xdStore.getState().setScrollProgress(0.4))
await page.waitForTimeout(3500)
await page.evaluate(() => window.__xdStore.getState().openProject('bayt-al-umma'))
await page.waitForTimeout(4500)
await page.screenshot({ path: `${OUT}/8-orbit.png` })
console.log('captured 8-orbit')

await browser.close()
console.log('done')
