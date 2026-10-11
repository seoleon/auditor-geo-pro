// Prueba de punta a punta del Mundo 1 en un Chromium real (WebGL por software).
// Uso: (con el servidor de desarrollo en marcha)  node tests/e2e-park.mjs [url]
// Verifica: menú → partida, movimiento y salto, colisiones, recogida de premios, olfato y
// excavación, cajas rompibles, misiones (ardillas, pelota, campanas), checkpoints,
// reaparición tras caer al agua, puerta final, pantalla de victoria, guardado y reinicio.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:5173/?lowfx'
const SHOTS = process.env.SHOTS ?? '/tmp/claude-0/shots'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 640, height: 400 } })
await page.addInitScript(() => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.clear()
    localStorage.setItem('rocky-adventures.save', JSON.stringify({ version: 2, settings: { quality: 'low', musicMuted: true, sfxMuted: true } }))
    sessionStorage.setItem('seeded', '1')
  }
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) failures++ }
const G = (fn, arg) => page.evaluate(fn, arg)
const state = () => G(() => window.__game?.state() ?? { screen: "boot", progress: { bones: [], missions: [], cookies: [], secrets: [] }, unlocked: [] })
const player = () => G(() => window.__game.player())
const wait = (ms) => page.waitForTimeout(ms)
const until = async (fn, timeout = 30000, step = 250) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) { if (await fn()) return true; await wait(step) }
  return false
}
// esperas en "tiempo de juego": el renderizado por software es muy lento y variable
const steps = () => G(() => window.__game.steps())
const gameTime = () => G(() => window.__game.time())
const waitSteps = async (n) => { const s0 = await steps(); await until(async () => (await steps()) >= s0 + n, 60000, 100) }
const waitGame = async (sec) => { const t0 = await gameTime(); await until(async () => (await gameTime()) >= t0 + sec, 120000, 150) }
const teleport = async (x, y, z, yaw = Math.PI) => { await G(([x, y, z, yaw]) => window.__game.teleport(x, y, z, yaw), [x, y, z, yaw]); await waitSteps(3) }
const key = async (code) => { await page.keyboard.down(code); await waitSteps(2); await page.keyboard.up(code); await waitSteps(2) }
const hold = async (codes, sec) => { for (const c of codes) await page.keyboard.down(c); await waitGame(sec); for (const c of codes) await page.keyboard.up(c) }
const shot = async (name) => {
  const data = await G(() => document.querySelector('canvas')?.toDataURL('image/jpeg', 0.8))
  if (data) writeFileSync(`${SHOTS}/e2e-${name}.jpg`, Buffer.from(data.split(',')[1], 'base64'))
}
const layout = () => G(() => window.__layout)
const bones = async () => (await state()).progress.bones

// ---------------------------------------------------------------------------- arranque
await page.goto(url)
ok(await until(async () => (await state())?.ready === true, 180000, 1000), 'La escena del parque carga y queda lista')
const L = await layout()
ok(!!L && L.bones.length === 10, 'El nivel define 10 huesos dorados')
await G(() => document.querySelector('[data-testid=btn-play]').click())
ok(await until(async () => (await state()).screen === 'playing', 30000), 'JUGAR inicia la partida')
await waitGame(0.8)

// ---------------------------------------------------------------------------- movimiento
const p0 = await player()
await hold(['KeyW'], 1.5)
const p1 = await player()
ok(p1.pos[2] < p0.pos[2] - 1, `Rocky camina hacia delante (z ${p0.pos[2].toFixed(2)} → ${p1.pos[2].toFixed(2)})`)
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await waitGame(1.5)
const vRun = Math.hypot(...(await player()).vel.filter((_, i) => i !== 1))
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft')
ok(vRun > 4.5, `Correr con SHIFT es más rápido (${vRun.toFixed(2)} m/s)`)
await waitGame(1)

// salto: altura máxima alcanzada
const yBase = (await player()).pos[1]
await page.keyboard.down('Space')
let maxY = yBase
const tj = await gameTime()
while ((await gameTime()) < tj + 1.0) { await wait(60); maxY = Math.max(maxY, (await player()).pos[1]) }
await page.keyboard.up('Space')
ok(maxY - yBase > 0.9, `Rocky salta (altura ${(maxY - yBase).toFixed(2)} m)`)
ok(await until(async () => (await player()).grounded, 8000), 'Rocky aterriza tras el salto')
await shot('jump')

// colisión: no atraviesa el borde de la fuente
await teleport(0, L.fountainY + 1.0, 8, Math.PI)
await waitGame(0.5)
await hold(['KeyW'], 2)
const pf = await player()
ok(pf.pos[2] > 4.3 || pf.pos[1] > L.fountainY + 0.6, `El borde de la fuente bloquea o se sube encima (z=${pf.pos[2].toFixed(2)}, y=${pf.pos[1].toFixed(2)})`)

// ---------------------------------------------------------------------------- checkpoint y caída al agua
const cp = L.checkpoints.find((c) => c.id === 'cp-island')
const hBefore = (await state()).health
await teleport(cp.pos[0], cp.pos[1] + 1, cp.pos[2])
ok(await until(async () => (await state()).progress.checkpoint === 'cp-island', 8000), 'Se activa el checkpoint de la isla')
await teleport(L.lake.cx + 2, 0.5, L.lake.cz - 3) // centro del lago (agua profunda)
ok(await until(async () => {
  const p = await player()
  return Math.hypot(p.pos[0] - cp.pos[0], p.pos[2] - cp.pos[2]) < 2.5
}, 15000), 'Al caer al agua profunda reaparece en el checkpoint')
ok((await state()).health === 2, `Caer al agua quita un corazón (antes ${hBefore}, checkpoint cura a 3, ahora ${(await state()).health})`)

// ---------------------------------------------------------------------------- huesos visibles
const visible = ['p-bone-bench', 'p-bone-fountain', 'p-bone-island', 'p-bone-tunnel', 'p-bone-treehouse', 'p-bone-terrace']
for (const id of visible) {
  const b = L.bones.find((x) => x.id === id)
  await teleport(b.pos[0], b.pos[1] - 0.25, b.pos[2])
  ok(await until(async () => (await bones()).includes(id), 15000), `Recoge el hueso ${id}`)
}
await shot('after-visible')

// ---------------------------------------------------------------------------- caja rompible (ladrido)
const crate = L.crates.find((c) => c.id === 'crate-1')
await teleport(crate.pos[0] + 2, crate.pos[1] + 0.6, crate.pos[2], -Math.PI / 2)
await key('KeyF')
ok(await until(async () => G(() => window.__game.level.getState().broken.has('crate-1')), 6000), 'Ladrar rompe la caja')
const bc = L.bones.find((x) => x.id === 'p-bone-crate')
await teleport(bc.pos[0], bc.pos[1] - 0.2, bc.pos[2])
ok(await until(async () => (await bones()).includes('p-bone-crate'), 6000), 'Recoge el hueso escondido en la caja')

// ---------------------------------------------------------------------------- olfato + excavación
const bw = L.bones.find((x) => x.id === 'p-bone-willow')
await teleport(bw.pos[0] + 0.7, bw.pos[1], bw.pos[2] + 0.5)
await waitGame(0.5)
await hold(['KeyC'], 1.5)
ok(await until(async () => G(() => window.__game.level.getState().revealed.has('dig-p-bone-willow')), 6000), 'Olfatear (C) revela el hueso enterrado')
ok(await until(async () => ((await state()).hint ?? '').includes('Excavar'), 4000), 'Aparece la indicación contextual "E · Excavar"')
await key('KeyE')
ok(await until(async () => G(() => window.__game.level.getState().dug.has('dig-p-bone-willow')), 4000), 'E excava el agujero')
await teleport(bw.pos[0], bw.pos[1] - 0.2, bw.pos[2])
ok(await until(async () => (await bones()).includes('p-bone-willow'), 6000), 'Recoge el hueso desenterrado')

// ---------------------------------------------------------------------------- misión: ardillas
for (const sq of L.squirrels) {
  await teleport(sq.pos[0] + 2.5, sq.pos[1] + 0.6, sq.pos[2], -Math.PI / 2)
  await key('KeyF')
  await waitGame(0.6)
}
ok(await until(async () => (await state()).progress.missions.includes('park-squirrels'), 6000), 'Misión "Ardillas traviesas" completada ladrando')
const ck = L.cookies.find((c) => c.id === 'p-ck-squirrels')
await teleport(ck.pos[0], ck.pos[1] - 0.2, ck.pos[2])
ok(await until(async () => (await state()).progress.cookies.includes('p-ck-squirrels'), 6000), 'La galleta de recompensa aparece y se recoge')

// ---------------------------------------------------------------------------- misión: campanas (orden correcto)
for (const o of L.bells.offsets) {
  await teleport(L.bells.pos[0] + o, L.bells.pos[1] + 0.6, L.bells.pos[2] + 1.3, Math.PI)
  await waitGame(0.3)
  await key('KeyF')
  await waitGame(0.6)
}
ok(await until(async () => (await state()).progress.missions.includes('park-bells'), 6000), 'Misión "Las campanas del jardín" completada')
ok(await until(async () => G(() => !!window.__game.level.getState().flags.gardenOpen), 3000), 'La verja del jardín secreto se abre')
// entrar caminando por la verja abierta
await waitGame(2.5) // la verja tarda en bajar
await teleport(-7.5, L.gardenGateY + 0.7, -26.1, -Math.PI / 2)
await hold(['KeyW'], 2.2)
const pg = await player()
ok(pg.pos[0] < -10.5, `Rocky entra caminando en el jardín secreto (x=${pg.pos[0].toFixed(2)})`)
const bg = L.bones.find((x) => x.id === 'p-bone-garden')
await teleport(bg.pos[0], bg.pos[1] - 0.2, bg.pos[2])
ok(await until(async () => (await bones()).includes('p-bone-garden'), 6000), 'Recoge el hueso del jardín secreto')
ok((await state()).progress.secrets.includes('sec-garden'), 'Se registra el lugar secreto del jardín')

// ---------------------------------------------------------------------------- misión: pelota a la portería
const goal = L.goal
for (let attempt = 0; attempt < 6 && !(await state()).progress.missions.includes('park-ball'); attempt++) {
  const ball = await G(() => window.__game.runtime.lookTargets.get('ball')?.toArray())
  // colocarse detrás de la pelota respecto a la portería y empujar
  const dx = goal[0] + 0.6 - ball[0], dz = goal[2] - ball[2]
  const d = Math.hypot(dx, dz)
  const yaw = Math.atan2(dx, dz)
  await teleport(ball[0] - (dx / d) * 1.3, ball[1] + 0.2, ball[2] - (dz / d) * 1.3, yaw)
  await G((yaw) => { window.__game.runtime.camera.yaw = yaw + Math.PI }, yaw)
  await waitGame(0.3)
  await hold(['KeyW'], 2.0)
  await waitGame(1.0)
}
ok((await state()).progress.missions.includes('park-ball'), 'Misión "¡Gol de Rocky!" completada empujando la pelota')
const bb = L.bones.find((x) => x.id === 'p-bone-ball')
await teleport(bb.pos[0] - 0.4, bb.pos[1] - 0.2, bb.pos[2])
ok(await until(async () => (await bones()).includes('p-bone-ball'), 6000), 'Recoge el hueso de recompensa de la portería')
await shot('ball')

// ---------------------------------------------------------------------------- guardado y recarga
const before = await bones()
ok(before.length === 10, `Tiene los 10 huesos (${before.length})`)
await page.reload()
ok(await until(async () => (await state())?.ready === true, 180000, 1000), 'Recarga: la escena vuelve a cargar')
const after = (await state()).progress.bones
ok(after.length === before.length, `El progreso se guarda en localStorage (${after.length} huesos tras recargar)`)
await G(() => document.querySelector('[data-testid=btn-play]').click())
ok(await until(async () => (await state()).screen === 'playing', 30000), 'Continuar partida tras recargar')
await waitGame(0.5)

// ---------------------------------------------------------------------------- pausa
await key('Escape')
ok(await until(async () => (await state()).screen === 'paused', 5000), 'ESC pausa el juego')
await G(() => document.querySelector('[data-testid=btn-resume]').click())
ok(await until(async () => (await state()).screen === 'playing', 5000), 'Continuar desde la pausa')

// ---------------------------------------------------------------------------- puerta final
await teleport(L.gate[0], L.gate[1] + 0.7, L.gate[2] + 2.3, Math.PI)
await waitGame(0.5)
ok(await until(async () => ((await state()).hint ?? '').includes('Puerta'), 6000), 'La puerta muestra la interacción para abrirla')
await key('KeyE')
ok(await until(async () => (await state()).screen === 'victory', 60000), 'Abrir la Puerta de las Huellas lleva a la pantalla de victoria')
ok((await state()).unlocked.includes('city'), 'Se desbloquea el Mundo 2 (la ciudad)')
await page.screenshot({ path: `${SHOTS}/e2e-victory.png` }).catch(() => {})

// ---------------------------------------------------------------------------- reiniciar nivel
await G(() => window.__game.store.getState().setScreen('paused'))
await wait(500)
await G(() => document.querySelector('[data-testid=btn-restart]').click())
ok(await until(async () => (await state()).screen === 'playing' && (await state()).progress.bones.length === 0, 180000, 1000), 'Reiniciar nivel vuelve a empezar el parque desde cero')

const real = errors.filter((e) => !/DevTools|deprecated/i.test(e))
ok(real.length === 0, `Sin errores en la consola${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`)
console.log(failures === 0 ? '\nTODAS LAS PRUEBAS DEL PARQUE SUPERADAS' : `\n${failures} PRUEBA(S) FALLIDA(S)`)
await browser.close()
process.exit(failures ? 1 : 0)
