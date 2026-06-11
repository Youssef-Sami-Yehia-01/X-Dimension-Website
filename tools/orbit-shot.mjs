/* orbit-shot — single screenshot of the project orbit view (QA) */
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', e => console.log('[pageerror]', e.message))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.mouse.click(800, 450)
await page.waitForTimeout(4000)
await page.evaluate(() => window.__xdStore.getState().setScrollProgress(0.4))
await page.waitForTimeout(3000)
await page.screenshot({ path: 'tools/shots/qa-heritage.png' })
await page.evaluate(() => window.__xdStore.getState().openProject('bayt-al-umma'))
await page.waitForTimeout(4500)
await page.screenshot({ path: 'tools/shots/qa-orbit.png' })
await browser.close()
console.log('done')
