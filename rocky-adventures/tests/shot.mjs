// Utilidad: captura del visor o del juego con Chromium (WebGL por software, SwiftShader).
// Uso: node tests/shot.mjs <url> <salida.png> [espera_ms] [ancho] [alto]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const [, , url, out, wait = '4000', w = '800', h = '600'] = process.argv
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } })
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
await page.goto(url)
await page.waitForFunction(() => window.__rockyReady === true, null, { timeout: 90000 }).catch(() => logs.push('timeout waiting ready'))
await page.waitForTimeout(Number(wait))
const data = await page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png'))
if (data) writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'))
else logs.push('no canvas')
const fps = await page.evaluate(() => window.__fps ?? null)
console.log('fps', fps, logs.filter(l => !l.includes('React DevTools')).slice(0, 20).join('\n'))
await browser.close()
