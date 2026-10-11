// Recorrido visual: teletransporta a Rocky a varias zonas y guarda capturas del lienzo.
// Uso: node tests/tour.mjs [mundo] [calidad]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const world = process.argv[2] ?? 'park'
const q = process.argv[3] ?? 'medium'
const SHOTS = process.env.SHOTS ?? '/tmp/claude-0/shots'
const spots = JSON.parse(process.env.SPOTS ?? '[]')
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 960), height: Number(process.env.H ?? 540) } })
await page.addInitScript(([q, world]) => {
  localStorage.setItem('rocky-adventures.save', JSON.stringify({ version: 2, unlocked: ['park', 'city', 'beach'], settings: { quality: q, musicMuted: true, sfxMuted: true } }))
}, [q, world])
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const G = (fn, a) => page.evaluate(fn, a)
const until = async (fn, t = 300000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { if (await fn()) return true; await page.waitForTimeout(500) } return false }
await page.goto('http://localhost:5173/' + (process.env.LOWFX ? '?lowfx' : ''))
await until(async () => (await G(() => window.__game?.state().ready)) === true)
if (process.env.MENU) {
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/tour-${world}-menu.png`, timeout: 300000 })
}
await G((w) => window.__game.store.getState().startWorld(w), world)
await until(async () => (await G(() => window.__game.state().screen)) === 'playing')
await page.waitForTimeout(2000)
for (let i = 0; i < spots.length; i++) {
  const [x, y, z, yaw, camYaw, camPitch, dist] = spots[i]
  await G(([x, y, z, yaw]) => window.__game.teleport(x, y, z, yaw), [x, y, z, yaw])
  await page.waitForTimeout(1500)
  await G(([cy, cp]) => { const c = window.__game.runtime.camera; c.yaw = cy; c.pitch = cp }, [camYaw ?? yaw + Math.PI, camPitch ?? 0.3])
  if (dist) await G((d) => { window.__game.input.zoom += d }, dist)
  await page.waitForTimeout(Number(process.env.WAIT ?? 6000))
  const data = await G(() => document.querySelector('canvas').toDataURL('image/jpeg', 0.85))
  writeFileSync(`${SHOTS}/tour-${world}-${i}.jpg`, Buffer.from(data.split(',')[1], 'base64'))
  console.log('shot', i)
}
console.log('errors:', errors.filter((e) => !/DevTools|deprecated/.test(e)).slice(0, 5).join(' | ') || 'ninguno')
await browser.close()
