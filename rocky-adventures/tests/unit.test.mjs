// Pruebas unitarias (Node, sin navegador):  npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitize, defaultSave, SAVE_VERSION } from '../src/systems/save.ts'
import { generateRockyMesh } from '../src/characters/rocky/mesher.ts'
import { BONES as ROCKY_BONES } from '../src/characters/rocky/anatomy.ts'
import * as Park from '../src/worlds/park/parkLayout.ts'
import * as City from '../src/worlds/city/cityLayout.ts'
import * as Beach from '../src/worlds/beach/beachLayout.ts'

test('guardado: datos válidos se conservan', () => {
  const d = defaultSave()
  d.worlds.park.bones.push('a', 'b')
  d.unlocked.push('city')
  const s = sanitize(JSON.parse(JSON.stringify(d)))
  assert.deepEqual(s.worlds.park.bones, ['a', 'b'])
  assert.deepEqual(s.unlocked, ['park', 'city'])
  assert.equal(s.version, SAVE_VERSION)
})

test('guardado: datos corruptos o con tipos erróneos se reparan', () => {
  const s = sanitize({ version: 99, unlocked: ['luna', 3], worlds: { park: { bones: 'nope', bestScore: -5 } }, settings: { quality: 'ultra', musicVolume: 7, sensitivity: 'x' } })
  assert.deepEqual(s.unlocked, ['park'])
  assert.deepEqual(s.worlds.park.bones, [])
  assert.equal(s.worlds.park.bestScore, 0)
  assert.equal(s.settings.quality, 'medium')
  assert.equal(s.settings.musicVolume, 1)
  assert.equal(s.settings.sensitivity, 1)
  assert.throws(() => sanitize(null))
  assert.throws(() => sanitize('texto'))
})

test('guardado: migración desde la versión 1', () => {
  const s = sanitize({ version: 1, bones: ['p-bone-bench'] })
  assert.deepEqual(s.worlds.park.bones, ['p-bone-bench'])
})

test('Rocky: la malla esculpida es cerrada, orientada y con pesos de skinning válidos', () => {
  const m = generateRockyMesh(0.011)
  assert.ok(m.vertexCount > 3000, 'demasiados pocos vértices')
  // orientación de triángulos coherente con las normales
  const P = m.positions, N = m.normals, I = m.indices
  let agree = 0
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    if ((uy * vz - uz * vy) * N[a] + (uz * vx - ux * vz) * N[a + 1] + (ux * vy - uy * vx) * N[a + 2] > 0) agree++
  }
  assert.ok(agree / (I.length / 3) > 0.97)
  // los pesos suman 1 y los índices son huesos existentes
  for (let v = 0; v < m.vertexCount; v++) {
    let s = 0
    for (let k = 0; k < 4; k++) { s += m.skinWeight[v * 4 + k]; assert.ok(m.skinIndex[v * 4 + k] < ROCKY_BONES.length) }
    assert.ok(Math.abs(s - 1) < 1e-3)
  }
  // proporciones de bulldog francés: más largo que alto, orejas por encima de la cabeza
  let minY = 1, maxY = -1, minZ = 1, maxZ = -1
  for (let v = 0; v < m.vertexCount; v++) { minY = Math.min(minY, P[v * 3 + 1]); maxY = Math.max(maxY, P[v * 3 + 1]); minZ = Math.min(minZ, P[v * 3 + 2]); maxZ = Math.max(maxZ, P[v * 3 + 2]) }
  assert.ok(minY > -0.01 && minY < 0.01, 'las patas apoyan en el suelo')
  assert.ok(maxY > 0.55 && maxY < 0.62, 'altura total con orejas')
  assert.ok(maxZ - minZ > 0.55 && maxZ - minZ < 0.7, 'longitud del cuerpo')
})

test('parque: 10 huesos únicos, por encima del terreno y fuera del agua profunda', () => {
  assert.equal(Park.BONES.length, 10)
  assert.equal(new Set(Park.BONES.map((b) => b.id)).size, 10)
  for (const b of Park.BONES) {
    const ground = Park.parkHeight(b.pos[0], b.pos[2])
    assert.ok(b.pos[1] > ground + 0.3, `${b.id} enterrado en el terreno`)
    if (b.mode !== 'buried') assert.ok(!Park.parkDeepWater(b.pos[0], b.pos[2]) || b.pos[1] > 0.5, `${b.id} en agua profunda`)
  }
  for (const c of Park.CHECKPOINTS) assert.ok(!Park.parkDeepWater(c.pos[0], c.pos[2]), `${c.id} en agua profunda`)
  assert.ok(!Park.parkDeepWater(Park.SPAWN[0], Park.SPAWN[2]))
})

test('parque: las terrazas suben de 1 en 1 m (saltables) y la meseta está a ~9 m', () => {
  const tops = Park.TERRACES.map((t) => t.pos[1] + t.size[1])
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] <= 2.05)
  assert.ok(Park.PLATEAU_Y > 8 && Park.PLATEAU_Y < 10.5)
  // la última terraza conecta con la meseta
  assert.ok(Math.abs(tops[tops.length - 1] - Park.PLATEAU_Y) < 1.6)
  // la pasarela de la casa del árbol termina en la meseta
  assert.ok(Math.abs(Park.WALKWAY.to[1] - Park.parkHeight(Park.WALKWAY.to[0], Park.WALKWAY.to[2])) < 0.6)
  // las rampas del oeste no superan los 52° de pendiente escalable
  for (const r of Park.WEST_RAMPS) {
    const d = Math.hypot(r.to[0] - r.from[0], r.to[2] - r.from[2])
    assert.ok(Math.atan2(r.to[1] - r.from[1], d) < (52 * Math.PI) / 180)
  }
})

test('ciudad y playa: ids únicos y premios coherentes', () => {
  for (const L of [City, Beach]) {
    const ids = [...L.BONES.map((b) => b.id), ...L.COOKIES.map((c) => c.id)]
    assert.equal(new Set(ids).size, ids.length)
    assert.equal(L.BONES.length, 8)
    for (const c of L.CRATES) if (c.contains) assert.ok(ids.includes(c.contains.id), `${c.id} contiene un premio inexistente`)
  }
  for (const b of Beach.BONES) assert.ok(b.pos[1] > Beach.beachHeight(b.pos[0], b.pos[2]) + 0.3, `${b.id} enterrado`)
})
