/* perf-probe — measure fps at the journey's heaviest moments */
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(4000)
await page.mouse.click(800, 450)
await page.waitForTimeout(6000)

const measure = () => page.evaluate(() => new Promise((resolve) => {
  let frames = 0
  const t0 = performance.now()
  const loop = () => {
    frames++
    const dt = performance.now() - t0
    if (dt < 3000) requestAnimationFrame(loop)
    else resolve(+(frames / (dt / 1000)).toFixed(1))
  }
  requestAnimationFrame(loop)
}))

for (const [name, t] of [['street (0.20)', 0.20], ['heritage (0.40)', 0.40], ['aerial (0.74)', 0.74], ['contact (1.0)', 1.0]]) {
  await page.evaluate((p) => window.__xdStore.getState().setScrollProgress(p), t)
  await page.waitForTimeout(2500)
  console.log(name, await measure(), 'fps')
}

await page.evaluate(() => window.__xdStore.getState().openProject('bayt-al-umma'))
await page.waitForTimeout(4000)
console.log('orbit', await measure(), 'fps')

await browser.close()
