// Prueba manual guiada: abre el juego, captura el menú, empieza a jugar y mueve a Rocky.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const url = process.argv[2] ?? 'http://localhost:5173/?lowfx'
const out = process.argv[3] ?? '/tmp/claude-0/shots/game'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 800), height: Number(process.env.H ?? 500) } })
const quality = process.env.Q ?? 'low'
await page.addInitScript((q) => {
  if (!localStorage.getItem('rocky-adventures.save')) localStorage.setItem('rocky-adventures.save', JSON.stringify({ version: 2, settings: { quality: q } }))
}, quality)
const logs = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`) })
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
const snap = async (name) => {
  const data = await page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/jpeg', 0.85))
  if (data) writeFileSync(`${out}-${name}.jpg`, Buffer.from(data.split(',')[1], 'base64'))
  if (process.env.UI) await page.screenshot({ path: `${out}-${name}-ui.png`, timeout: 120000 }).catch((e) => logs.push('ui shot failed ' + e.message))
}
const t0 = Date.now()
await page.goto(url)
await page.waitForFunction(() => window.__game?.state().ready === true, null, { timeout: 240000 }).catch(() => logs.push('timeout ready'))
console.log('ready after', (Date.now() - t0) / 1000, 's', JSON.stringify(await page.evaluate(() => window.__game?.state())))
await page.waitForTimeout(1500)
await snap('menu')
await page.evaluate(() => document.querySelector('[data-testid=btn-play]').click())
await page.waitForFunction(() => window.__game.state().screen === 'playing', null, { timeout: 120000 }).catch(() => logs.push('timeout playing'))
await page.waitForTimeout(1500)
console.log('playing', JSON.stringify(await page.evaluate(() => window.__game.player())))
await snap('start')
await page.keyboard.down('KeyW')
await page.waitForTimeout(2500)
await page.keyboard.up('KeyW')
console.log('after walk', JSON.stringify(await page.evaluate(() => window.__game.player())), 'fps', await page.evaluate(() => window.__fps))
await snap('walk')
console.log(logs.slice(0, 30).join('\n'))
await browser.close()
