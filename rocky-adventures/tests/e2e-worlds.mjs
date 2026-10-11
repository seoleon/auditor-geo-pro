// Prueba de punta a punta de los Mundos 2 y 3 (con el servidor de desarrollo en marcha).
// Ciudad: misiones (periódico de Lola, cachorros, bandera de la torre), callejón con cajas, medalla.
// Playa: faro, cangrejos (pisotón), cofre del tesoro y Collar Legendario.
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173/?lowfx'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 640, height: 400 } })
await page.addInitScript(() => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.clear()
    localStorage.setItem('rocky-adventures.save', JSON.stringify({ version: 2, unlocked: ['park', 'city'], worlds: { park: { completed: true } }, settings: { quality: 'low', musicMuted: true, sfxMuted: true } }))
    sessionStorage.setItem('seeded', '1')
  }
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) failures++ }
const G = (fn, arg) => page.evaluate(fn, arg)
const wait = (ms) => page.waitForTimeout(ms)
const until = async (fn, timeout = 30000, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await fn()) return true; await wait(step) } return false }
const state = () => G(() => window.__game?.state() ?? { screen: 'boot', progress: { bones: [], missions: [], cookies: [], secrets: [] }, unlocked: [] })
const steps = () => G(() => window.__game.steps())
const simTime = () => G(() => window.__game.time())
const waitSteps = async (n) => { const s0 = await steps(); await until(async () => (await steps()) >= s0 + n, 60000, 100) }
const waitGame = async (sec) => { const t0 = await simTime(); await until(async () => (await simTime()) >= t0 + sec, 120000, 150) }
const teleport = async (x, y, z, yaw = Math.PI) => { await G(([x, y, z, yaw]) => window.__game.teleport(x, y, z, yaw), [x, y, z, yaw]); await waitSteps(3) }
const key = async (code) => { await page.keyboard.down(code); await waitSteps(2); await page.keyboard.up(code); await waitSteps(2) }
const bones = async () => (await state()).progress.bones
const missions = async () => (await state()).progress.missions
const collect = async (b) => { await teleport(b.pos[0], b.pos[1] - 0.25, b.pos[2]); return until(async () => (await bones()).includes(b.id), 15000) }
const startWorld = async (w) => {
  await G((w) => window.__game.store.getState().startWorld(w), w)
  return until(async () => (await state()).screen === 'playing' && (await state()).world === w, 240000, 1000)
}
const interact = async (pos, label) => {
  await teleport(pos[0], pos[1] + 0.7, pos[2])
  await waitGame(0.3)
  const hinted = await until(async () => ((await state()).hint ?? '').includes(label), 8000)
  await key('KeyE')
  return hinted
}

await page.goto(url)
ok(await until(async () => (await state()).ready === true, 240000, 1000), 'Carga inicial')

// =============================================================== CIUDAD
ok(await startWorld('city'), 'La Ciudad de los Perros carga y se puede jugar')
await waitGame(0.5)
const C = await G(() => window.__layout)
ok(C.world === 'city' && C.bones.length === 8, 'La ciudad define 8 huesos')

// periódico → Lola
ok(await interact(C.kiosk, 'periódico'), 'El quiosco ofrece coger el periódico')
ok(await until(async () => G(() => !!window.__game.level.getState().flags.newspaper), 5000), 'Rocky lleva el periódico')
ok(await interact(C.lola, 'Lola'), 'Lola ofrece la entrega')
ok(await until(async () => (await missions()).includes('city-delivery'), 6000), 'Misión "El periódico de Lola" completada')

// callejón con cajas → patio secreto
await teleport(C.alley[0] + 2.2, C.alley[1] + 0.6, C.alley[2], -Math.PI / 2)
await key('KeyF')
ok(await until(async () => G(() => window.__game.level.getState().broken.has('c-alley-1') && window.__game.level.getState().broken.has('c-alley-2')), 6000), 'Ladrar abre el callejón tapado con cajas')

// cachorros
for (const p of C.puppies) {
  await teleport(p.pos[0] + 1.2, p.pos[1] + 0.7, p.pos[2] + 0.6)
  await waitGame(0.3)
  await until(async () => ((await state()).hint ?? '').includes('cachorro'), 6000)
  await key('KeyE')
  await waitGame(0.3)
}
ok(await until(async () => (await missions()).includes('city-puppies'), 6000), 'Misión "Cachorros perdidos" completada')

// bandera de la torre
ok(await interact(C.flag, 'bandera'), 'La bandera de la torre se puede izar')
ok(await until(async () => (await missions()).includes('city-rooftops'), 6000), 'Misión "Rey de las azoteas" completada')

// todos los huesos (los de recompensa ya están visibles)
for (const b of C.bones) {
  if (b.mode === 'buried') {
    await teleport(b.pos[0] + 0.6, b.pos[1], b.pos[2] + 0.4)
    await page.keyboard.down('KeyC'); await waitGame(1.4); await page.keyboard.up('KeyC')
    await until(async () => ((await state()).hint ?? '').includes('Excavar'), 6000)
    await key('KeyE')
    await waitGame(0.3)
  }
  ok(await collect(b), `Ciudad: recoge ${b.id}`)
}
ok(await interact(C.goal, 'Medalla'), 'La medalla se puede recoger con 8 huesos')
ok(await until(async () => (await state()).screen === 'victory', 60000), 'Victoria en la ciudad')
ok((await state()).unlocked.includes('beach'), 'Se desbloquea la Playa del Tesoro')

// =============================================================== PLAYA
ok(await startWorld('beach'), 'La Playa del Tesoro carga y se puede jugar')
await waitGame(0.5)
const B = await G(() => window.__layout)
ok(B.world === 'beach' && B.bones.length === 8, 'La playa define 8 huesos')

// faro
ok(await interact(B.lighthouseTop, 'faro'), 'Desde lo alto del faro se puede encender')
ok(await until(async () => (await missions()).includes('beach-lighthouse'), 6000), 'Misión "Enciende el faro" completada')

// cangrejos: caer encima
let stomped = 0
for (const id of B.crabs) {
  const pos = await G((id) => {
    // posición actual del cangrejo: el enemigo más cercano a su ruta (publicada por el propio enemigo)
    return window.__enemies?.[id] ?? null
  }, id)
  if (!pos) continue
  await teleport(pos[0], pos[1] + 1.6, pos[2])
  if (await until(async () => G((id) => window.__game.level.getState().defeated.has(id), id), 6000)) stomped++
  await waitGame(0.6)
}
ok(stomped >= 4, `Pisotón a los cangrejos (${stomped})`)
ok(await until(async () => (await missions()).includes('beach-crabs'), 6000), 'Misión "Cangrejos gruñones" completada')

// castillo de arena (rompible) y huesos
const castle = B.crates.find((c) => c.id === 'castle')
await teleport(castle.pos[0] + 2.2, castle.pos[1] + 0.7, castle.pos[2], -Math.PI / 2)
await key('KeyF')
ok(await until(async () => G(() => window.__game.level.getState().broken.has('castle')), 6000), 'Ladrar derrumba el castillo de arena')
for (const b of B.bones) {
  if (b.mode === 'buried') {
    await teleport(b.pos[0] + 0.6, b.pos[1], b.pos[2] + 0.4)
    await page.keyboard.down('KeyC'); await waitGame(1.4); await page.keyboard.up('KeyC')
    await until(async () => ((await state()).hint ?? '').includes('Excavar'), 6000)
    await key('KeyE')
    await waitGame(0.3)
  }
  ok(await collect(b), `Playa: recoge ${b.id}`)
}
ok(await interact(B.chest, 'cofre'), 'El cofre del tesoro se puede abrir con 8 huesos')
ok(await until(async () => (await state()).screen === 'victory', 60000), 'Victoria final en la playa')
ok(await G(() => window.__game.store.getState().save.legendaryCollar), 'Rocky consigue el Collar Legendario')

const real = errors.filter((e) => !/DevTools|deprecated/i.test(e))
ok(real.length === 0, `Sin errores en la consola${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`)
console.log(failures === 0 ? '\nTODAS LAS PRUEBAS DE CIUDAD Y PLAYA SUPERADAS' : `\n${failures} PRUEBA(S) FALLIDA(S)`)
await browser.close()
process.exit(failures ? 1 : 0)
