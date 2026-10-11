// Diseño del Parque Encantado: relieve, caminos, lago, colina y colocación de todo el contenido.
//
//                         N (-z)
//              ┌───────── Colina (meseta 9 m) ─────────┐
//              │   Puerta de las Huellas · cenador      │
//   Rampas de  │                                        │  Pasarela desde
//   tablones ──┤        Terrazas de piedra (centro)     ├── la casa del árbol
//   (oeste)    └────────────────────────────────────────┘
//   Lago + isla + puente roto     Jardín + campanas      Bosque + casa del árbol
//   Túnel de piedra               FUENTE (plaza)         Parque infantil · claro secreto
//                                 Camino principal
//                                 Entrada (sur, +z)

import { distToPolyline, lerp, makeNoise2D, mulberry32, smoothstep } from '../../utils/random.ts'
import type { Surface } from '../../systems/events'
import type { BoneDef, CheckpointDef, CookieDef, CrateDef, EnemyDef, PlatformDef, V3 } from '../../gameplay/levelTypes'
import type { RockItem, ScatterItem, TreeInstance, TreeKind } from '../common/Vegetation'

const noise = makeNoise2D(42)

export const PARK = {
  half: 84,
  waterY: -0.35,
  lake: { cx: -36, cz: 4, rx: 13, rz: 10 },
  island: { x: -40, z: 4, r: 3.4 },
  hill: { x: 0, z: -64, top: 15, base: 21, h: 9 },
  plaza: { x: 0, z: 0, r: 12 },
}

export const PATHS: [number, number][][] = [
  [[0, 74], [0, 44], [0, 12]], // principal
  [[-11, 2], [-17, 3], [-22, 4]], // hacia el puente
  [[-7, 9], [-20, 17], [-36, 18.5], [-50, 14], [-54, 0], [-53, -14], [-47, -28], [-40, -44], [-38, -58]], // orilla y ruta oeste
  [[11, 2], [22, 0], [34, -8], [37, -22], [33, -33]], // ruta este (bosque)
  [[9, 7], [19, 11]], // parque infantil
  [[0, -12], [0, -31]], // ruta central (jardín y terrazas)
  [[-1, -28], [-8, -24], [-10, -26]], // al jardín secreto
  [[0, -50], [0, -68]], // meseta
]

const lakeE = (x: number, z: number) => Math.hypot((x - PARK.lake.cx) / PARK.lake.rx, (z - PARK.lake.cz) / PARK.lake.rz)

export function pathDist(x: number, z: number) {
  let d = Infinity
  for (const p of PATHS) d = Math.min(d, distToPolyline(x, z, p))
  return d
}

export function parkHeight(x: number, z: number): number {
  let h = noise.fbm(x * 0.025, z * 0.025, 4) * 1.5 + noise.noise(x * 0.11, z * 0.11) * 0.12
  // caminos y plaza más llanos
  const dp = pathDist(x, z)
  const dPlaza = Math.hypot(x - PARK.plaza.x, z - PARK.plaza.z)
  const dPlay = Math.hypot(x - 23, z - 13)
  const flat = Math.min(smoothstep(1.5, 7, dp), smoothstep(PARK.plaza.r, PARK.plaza.r + 6, dPlaza))
  h *= 0.25 + 0.75 * flat
  // parque infantil totalmente llano (la pelota no debe rodar sola)
  const play = smoothstep(9, 13, dPlay)
  h = h * play + 0.05 * (1 - play)
  // lago
  const e = lakeE(x, z)
  if (e < 1.4) h = lerp(h, -2.6, smoothstep(1.35, 0.78, e))
  // isla
  const di = Math.hypot(x - PARK.island.x, z - PARK.island.z)
  if (di < PARK.island.r + 3) h = Math.max(h, lerp(0.55, -2.6, smoothstep(PARK.island.r * 0.55, PARK.island.r + 2.6, di)))
  // colina con meseta y acantilado
  const dh = Math.hypot(x - PARK.hill.x, z - PARK.hill.z)
  const hk = 1 - smoothstep(PARK.hill.top, PARK.hill.base, dh)
  h += hk * PARK.hill.h + hk * noise.noise(x * 0.3, z * 0.3) * 0.15
  // colinas de los límites del mapa
  const b = Math.max(Math.abs(x), Math.abs(z))
  if (b > 64) h += Math.pow(b - 64, 1.15) * 0.3
  return h
}

export function parkSplat(x: number, z: number, h: number, ny: number): [number, number, number, number] {
  const dp = pathDist(x, z)
  const dPlaza = Math.hypot(x, z)
  const e = lakeE(x, z)
  let dirt = 1 - smoothstep(1.3, 2.4, dp)
  dirt = Math.max(dirt, smoothstep(1.12, 0.95, e)) // orillas y fondo del lago
  let cobble = 1 - smoothstep(PARK.plaza.r - 1, PARK.plaza.r + 0.5, dPlaza)
  cobble = Math.max(cobble, 1 - smoothstep(3.5, 5, Math.hypot(x, z - 58))) // plaza de la entrada
  const edge = Math.max(Math.abs(x), Math.abs(z)) > 63
  const rock = edge ? smoothstep(0.6, 0.45, ny) : smoothstep(0.86, 0.7, ny) + (h > 8.5 && ny < 0.9 ? 0.3 : 0)
  const grass = Math.max(0, 1 - dirt - cobble - rock) + 0.02
  return [grass, dirt * (1 - cobble), rock, cobble]
}

export function parkSurface(x: number, z: number): Surface {
  if (Math.hypot(x, z) < PARK.plaza.r || Math.hypot(x, z - 58) < 4.5) return 'stone'
  if (pathDist(x, z) < 1.8) return 'sand'
  return 'grass'
}

export function parkDeepWater(x: number, z: number) {
  return lakeE(x, z) < 0.82 && Math.hypot(x - PARK.island.x, z - PARK.island.z) > PARK.island.r + 1
}

export function parkGrassDensity(x: number, z: number) {
  const dp = pathDist(x, z)
  if (dp < 2.0) return 0
  if (Math.hypot(x, z) < PARK.plaza.r + 0.5) return 0
  if (Math.hypot(x, z - 58) < 5) return 0
  if (lakeE(x, z) < 1.04 && Math.hypot(x - PARK.island.x, z - PARK.island.z) > PARK.island.r - 0.5) return 0
  // acantilado de la colina
  const dh = Math.hypot(x - PARK.hill.x, z - PARK.hill.z)
  if (dh > PARK.hill.top - 0.5 && dh < PARK.hill.base) return 0
  return smoothstep(2.0, 3.5, dp) * (0.75 + 0.25 * noise.noise(x * 0.2, z * 0.2))
}

const H = parkHeight
const g = (x: number, z: number, up = 0): V3 => [x, H(x, z) + up, z]

// ----------------------------------------------------------------------------- estructuras
export const SPAWN: V3 = g(0, 63, 0.75)
export const SPAWN_YAW = Math.PI

export const TREEHOUSE = { x: 30, z: -38, ground: H(30, -38) }
export const TREEHOUSE_TOP = TREEHOUSE.ground + 9.2
export const PLATEAU_Y = H(0, -60)

export const BRIDGE = {
  a: [-21.0, H(-21, 4) + 0.15, 4] as V3,
  b: [-27.2, 1.05, 4] as V3,
  c: [-29.8, 1.05, 4] as V3,
  d: [-38, H(-38, 4) + 0.1, 4] as V3,
}

export const T0 = H(0, -31)
export const TERRACES: { pos: V3; size: V3 }[] = Array.from({ length: 9 }, (_, i) => {
  const top = 1.0 * (i + 1)
  const z = -32 - i * 2
  const base = Math.min(H(-1, z), H(1, z)) - 0.5
  return { pos: [0, base, z] as V3, size: [3.2, top - base + T0, 2.0] as V3 }
}).filter((_, i) => i !== 5)

export const WEST_RAMPS: { from: V3; to: V3 }[] = [
  { from: g(-38, -60, 0.05), to: [-27, 3.2, -60] },
  { from: [-25.5, 3.2, -61.6], to: [-25.5, 6.2, -72] },
  { from: [-24, 6.2, -73.6], to: [-11, PLATEAU_Y + 0.05, -70] },
]
export const WEST_DECKS: { pos: V3; size: V3 }[] = [
  { pos: [-25.5, 3.0, -60], size: [3.2, 0.25, 3.2] },
  { pos: [-25.5, 6.0, -73.6], size: [3.2, 0.25, 3.2] },
]

export const TREE_DECKS: { pos: V3; size: V3 }[] = Array.from({ length: 8 }, (_, i) => {
  const a = i * 0.95 + 2.2
  return { pos: [TREEHOUSE.x + Math.cos(a) * 3.3, TREEHOUSE.ground + 1.05 * (i + 1) - 0.25, TREEHOUSE.z + Math.sin(a) * 3.3] as V3, size: [2.1, 0.25, 2.1] as V3 }
})
export const WALKWAY = { from: [TREEHOUSE.x - 3.2, TREEHOUSE_TOP + 0.02, TREEHOUSE.z - 3.0] as V3, to: [11.5, PLATEAU_Y + 0.05, -57.5] as V3 }

export const GATE_POS: V3 = [0, PLATEAU_Y - 0.05, -68]
export const GAZEBO_POS: V3 = [-8, PLATEAU_Y - 0.05, -60]
export const FOUNTAIN_POS: V3 = [0, H(0, 0) - 0.02, 0]
export const GOAL_POS: V3 = g(27, 14, 0)
export const BALL_START: V3 = g(18, 10, 0.8)
export const TUNNEL = { pos: g(-61, -8, -0.05), rot: 0, length: 10 }
export const BELLS = { pos: g(-6, -18, 0), offsets: [-1.3, 0, 1.3] }
export const SECRET_GARDEN = { min: [-21, -32] as [number, number], max: [-10, -21] as [number, number] }
export const GLADE = { log: g(54, -40, 0), center: g(57, -51, 0) }

// ----------------------------------------------------------------------------- premios
export const BONES: BoneDef[] = [
  { id: 'p-bone-bench', pos: [3.6, H(3.6, 40) + 1.25, 40], hint: 'Encima de un banco del camino principal' },
  { id: 'p-bone-fountain', pos: [0, FOUNTAIN_POS[1] + 3.85, 0], hint: 'En lo alto de la fuente' },
  { id: 'p-bone-island', pos: [PARK.island.x - 0.6, H(PARK.island.x - 0.6, 4.6) + 0.8, 4.6], hint: 'En la isla del lago' },
  { id: 'p-bone-tunnel', pos: [TUNNEL.pos[0], TUNNEL.pos[1] + 0.75, -8], hint: 'Dentro del túnel de piedra' },
  { id: 'p-bone-willow', pos: g(-21.5, 15, 0.7), mode: 'buried', hint: 'Enterrado junto al sauce' },
  { id: 'p-bone-treehouse', pos: [TREEHOUSE.x + 2.2, TREEHOUSE_TOP + 0.8, TREEHOUSE.z + 2.2], hint: 'En la casa del árbol' },
  { id: 'p-bone-crate', pos: g(45, -6, 0.75), hint: 'Dentro de una caja del bosque' },
  { id: 'p-bone-ball', pos: [GOAL_POS[0] + 0.6, GOAL_POS[1] + 0.8, GOAL_POS[2]], mode: 'reward', mission: 'park-ball', hint: 'Mete la pelota en la portería' },
  { id: 'p-bone-garden', pos: g(-15.5, -26.5, 0.75), hint: 'En el jardín secreto' },
  { id: 'p-bone-terrace', pos: [0, 7.4 + T0, -42], hint: 'Sobre la plataforma móvil de las terrazas' },
]

export const CRATES: CrateDef[] = [
  { id: 'crate-1', pos: g(45, -6, 0), contains: { type: 'bone', id: 'p-bone-crate' } },
  { id: 'crate-2', pos: g(47.5, -4, 0), contains: { type: 'cookie', id: 'p-ck-crate' } },
  { id: 'crate-3', pos: g(43, -8.5, 0) },
  { id: 'crate-4', pos: g(-4, 27, 0) },
  { id: 'crate-5', pos: g(-5, 26, 0), contains: { type: 'cookie', id: 'p-ck-path' } },
]

export const COOKIES: CookieDef[] = [
  { id: 'p-ck-start', pos: g(0, 52, 0.7) },
  { id: 'p-ck-path', pos: g(-5, 26, 0.7) },
  { id: 'p-ck-rim', pos: [0, FOUNTAIN_POS[1] + 1.5, 4.25] },
  { id: 'p-ck-bridge', pos: [-25, 1.9, 4] },
  { id: 'p-ck-lily', pos: [-46.2, 0.5, 4] },
  { id: 'p-ck-tunnel', pos: [TUNNEL.pos[0], TUNNEL.pos[1] + 0.7, -11.5] },
  { id: 'p-ck-crate', pos: g(47.5, -4, 0.7) },
  { id: 'p-ck-treedeck', pos: [TREE_DECKS[4].pos[0], TREE_DECKS[4].pos[1] + 0.9, TREE_DECKS[4].pos[2]] },
  { id: 'p-ck-walkway', pos: [(WALKWAY.from[0] + WALKWAY.to[0]) / 2, (WALKWAY.from[1] + WALKWAY.to[1]) / 2 + 0.8, (WALKWAY.from[2] + WALKWAY.to[2]) / 2] },
  { id: 'p-ck-glade1', pos: g(56, -48, 0.7) },
  { id: 'p-ck-glade2', pos: g(59, -52, 0.7) },
  { id: 'p-ck-glade3', pos: g(55, -55, 0.7) },
  { id: 'p-ck-garden', pos: g(-18, -23.5, 0.7) },
  { id: 'p-ck-buried', pos: g(24, 18, 0.6), mode: 'buried' },
  { id: 'p-ck-gazebo', pos: [GAZEBO_POS[0], GAZEBO_POS[1] + 0.9, GAZEBO_POS[2]] },
  { id: 'p-ck-squirrels', pos: g(5, -7, 0.8), mode: 'reward', mission: 'park-squirrels' },
]

export const CHECKPOINTS: CheckpointDef[] = [
  { id: 'cp-entrance', pos: g(3, 56, 0), yaw: Math.PI, label: 'Entrada' },
  { id: 'cp-plaza', pos: g(8, 8, 0), yaw: Math.PI },
  { id: 'cp-island', pos: g(PARK.island.x + 0.8, 2.5, 0), yaw: -Math.PI / 2 },
  { id: 'cp-forest', pos: g(34, -12, 0), yaw: Math.PI },
  { id: 'cp-plateau', pos: [3, PLATEAU_Y, -53], yaw: Math.PI },
]

export const ENEMIES: EnemyDef[] = [
  { id: 'e-plaza', kind: 'chestnut', path: [g(14, -1), g(24, 1)], speed: 1.6 },
  { id: 'e-forest1', kind: 'chestnut', path: [g(40, -2), g(50, -2), g(50, -11), g(40, -11)], speed: 1.8 },
  { id: 'e-forest2', kind: 'chestnut', path: [g(49, -12), g(41, -12), g(41, -1)], speed: 1.4 },
  { id: 'e-west', kind: 'chestnut', path: [g(-53.5, -4), g(-52, -20)], speed: 1.7 },
  { id: 'e-garden', kind: 'chestnut', path: [g(1.5, -16), g(1.5, -28)], speed: 1.5 },
]

export const PLATFORMS: PlatformDef[] = [
  { id: 'pl-lily', from: [-44.4, PARK.waterY + 0.05, 4], to: [-50.4, PARK.waterY + 0.05, 4], size: [2.4, 0.18, 2.4], period: 7, kind: 'lily' },
  { id: 'pl-terrace', from: [0, 4.4 + T0, -42], to: [0, 6.6 + T0, -42], size: [3.0, 0.4, 2.0], period: 4.5, kind: 'stone' },
  { id: 'pl-treelift', from: [TREEHOUSE.x - 3.6, TREEHOUSE.ground + 0.25, TREEHOUSE.z + 1.5], to: [TREEHOUSE.x - 3.6, TREEHOUSE.ground + 3.6, TREEHOUSE.z + 1.5], size: [1.8, 0.25, 1.8], period: 6, kind: 'wood' },
]

export const SQUIRRELS: { id: string; pos: V3; tree: V3 }[] = [
  { id: 'sq-1', pos: g(13, 30.5), tree: g(15.5, 32) },
  { id: 'sq-2', pos: g(-17, -37), tree: g(-19.5, -39.5) },
  { id: 'sq-3', pos: g(49, -16), tree: g(51.5, -18.5) },
]

// ----------------------------------------------------------------------------- vegetación generada
type Excl = { x: number; z: number; r: number }
const EXCLUSIONS: Excl[] = [
  { x: 0, z: 0, r: 15 }, { x: 0, z: 58, r: 6 }, { x: TREEHOUSE.x, z: TREEHOUSE.z, r: 6 },
  { x: 22, z: 12, r: 7 }, { x: -6, z: -18, r: 4 }, { x: GLADE.log[0], z: GLADE.log[2], r: 4 },
  { x: TUNNEL.pos[0], z: TUNNEL.pos[2], r: 7 }, { x: -15.5, z: -26.5, r: 7 }, { x: 0, z: -40, r: 5 },
  { x: -26, z: -66, r: 9 }, { x: -32, z: -60, r: 5 },
]

function freeSpot(x: number, z: number, margin: number) {
  if (pathDist(x, z) < 3 + margin) return false
  if (lakeE(x, z) < 1.12 + margin * 0.05) return false
  for (const e of EXCLUSIONS) if (Math.hypot(x - e.x, z - e.z) < e.r + margin) return false
  const dh = Math.hypot(x - PARK.hill.x, z - PARK.hill.z)
  if (dh > PARK.hill.top - 2 && dh < PARK.hill.base + 1.5) return false
  // la pasarela de la casa del árbol
  if (distToPolyline(x, z, [[WALKWAY.from[0], WALKWAY.from[2]], [WALKWAY.to[0], WALKWAY.to[2]]]) < 3) return false
  return true
}

export function generateTrees(count: number): TreeInstance[] {
  const rnd = mulberry32(2024)
  const out: TreeInstance[] = []
  const add = (x: number, z: number, kind: TreeKind, scale: number) =>
    out.push({ x, z, y: H(x, z), rot: rnd() * Math.PI * 2, scale, kind })
  // árboles con significado
  add(TREEHOUSE.x, TREEHOUSE.z, 'oak', 2.3)
  add(-24, 18.5, 'willow', 1.5)
  add(-34, -6.5, 'willow', 1.3)
  for (const s of SQUIRRELS) add(s.tree[0], s.tree[2], s.id === 'sq-3' ? 'pine' : 'oak', 1.25)
  let tries = 0
  while (out.length < count && tries < count * 40) {
    tries++
    const x = (rnd() * 2 - 1) * 78, z = (rnd() * 2 - 1) * 78
    const edge = Math.max(Math.abs(x), Math.abs(z))
    const inForest = x > 28 && z < 22 && z > -70
    const inGlade = Math.hypot(x - GLADE.center[0], z - GLADE.center[2]) < 7
    if (inGlade) continue
    const p = edge > 62 ? 0.95 : inForest ? 0.6 : 0.16
    if (rnd() > p) continue
    if (!freeSpot(x, z, 1)) continue
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < (edge > 62 ? 3.2 : 4.2))) continue
    const r = rnd()
    const kind: TreeKind = inForest ? (r < 0.45 ? 'pine' : r < 0.8 ? 'oak' : 'birch') : edge > 62 ? (r < 0.5 ? 'pine' : r < 0.75 ? 'cypress' : 'oak') : r < 0.5 ? 'oak' : r < 0.75 ? 'birch' : r < 0.9 ? 'cypress' : 'pine'
    add(x, z, kind, 0.8 + rnd() * 0.55)
  }
  return out
}

export function generateRocks(): RockItem[] {
  const rnd = mulberry32(77)
  const out: RockItem[] = []
  // montículo de rocas sobre el túnel
  for (let i = 0; i < 9; i++) {
    const z = TUNNEL.pos[2] - 5 + (i / 8) * 10
    for (const side of [-1, 1]) out.push({ x: TUNNEL.pos[0] + side * (3.1 + rnd()), y: TUNNEL.pos[1] + 0.3, z, s: 1.6 + rnd() * 0.8, rot: rnd() * 6, variant: i })
  }
  out.push({ x: TUNNEL.pos[0], y: TUNNEL.pos[1] + 3.3, z: TUNNEL.pos[2], s: 3.2, sy: 0.55, rot: 1, variant: 2 })
  // orilla del lago
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2
    const x = PARK.lake.cx + Math.cos(a) * PARK.lake.rx * 1.05, z = PARK.lake.cz + Math.sin(a) * PARK.lake.rz * 1.05
    if (pathDist(x, z) < 2.5 || Math.abs(z - 4) < 2.5 && x > -38) continue
    out.push({ x, y: H(x, z) - 0.1, z, s: 0.5 + rnd() * 0.7, rot: rnd() * 6, variant: i })
  }
  // base del acantilado
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2
    const r = PARK.hill.base - 1.5 + rnd() * 2
    const x = PARK.hill.x + Math.cos(a) * r, z = PARK.hill.z + Math.sin(a) * r
    if (Math.abs(x) < 3.5 && z > -50) continue // terrazas
    if (x < -18 && z < -55 && z > -76) continue // rampas
    if (Math.hypot(x - WALKWAY.to[0], z - WALKWAY.to[2]) < 4) continue
    out.push({ x, y: H(x, z) - 0.3, z, s: 1.2 + rnd() * 1.6, rot: rnd() * 6, variant: i, sy: 1.2 })
  }
  // dispersas por el parque
  for (let i = 0; i < 26; i++) {
    const x = (rnd() * 2 - 1) * 60, z = (rnd() * 2 - 1) * 60
    if (!freeSpot(x, z, 1.5)) continue
    out.push({ x, y: H(x, z) - 0.15, z, s: 0.4 + rnd() * 0.9, rot: rnd() * 6, variant: i })
  }
  return out
}

export function generateFlowers(): ScatterItem[] {
  const rnd = mulberry32(5)
  const cols = ['#ff6b9a', '#ffd23f', '#ffffff', '#b388eb', '#ff9f43', '#5ec8ff', '#ff4d6d']
  const out: ScatterItem[] = []
  const bed = (cx: number, cz: number, r: number, n: number, palette: string[]) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr
      out.push({ x, y: H(x, z), z, s: 0.8 + rnd() * 0.6, color: palette[Math.floor(rnd() * palette.length)] })
    }
  }
  // parterres alrededor de la plaza
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.39
    bed(Math.cos(a) * 15, Math.sin(a) * 15, 2.2, 40, [cols[k % cols.length], cols[(k + 2) % cols.length]])
  }
  bed(-15.5, -26.5, 4.5, 120, cols) // jardín secreto
  bed(GLADE.center[0], GLADE.center[2], 5, 90, ['#ffd23f', '#ffffff', '#ff9f43'])
  bed(-6, PLATEAU_Y > 0 ? -58 : -58, 3, 0, cols)
  // prados con flores silvestres
  for (let i = 0; i < 700; i++) {
    const x = (rnd() * 2 - 1) * 62, z = (rnd() * 2 - 1) * 62
    if (noise.noise(x * 0.06, z * 0.06) < 0.15) continue
    if (!freeSpot(x, z, -1)) continue
    out.push({ x, y: H(x, z), z, s: 0.6 + rnd() * 0.5, color: cols[Math.floor(rnd() * cols.length)] })
  }
  // cima de la colina
  for (let i = 0; i < 120; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 12
    const x = PARK.hill.x + Math.cos(a) * r, z = PARK.hill.z + Math.sin(a) * r
    if (Math.abs(x) < 2.5 || Math.hypot(x - GAZEBO_POS[0], z - GAZEBO_POS[2]) < 4) continue
    out.push({ x, y: H(x, z), z, s: 0.7 + rnd() * 0.5, color: cols[Math.floor(rnd() * cols.length)] })
  }
  return out
}

export function generateBushes(): ScatterItem[] {
  const rnd = mulberry32(9)
  const out: ScatterItem[] = []
  // a lo largo de los caminos
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      for (let t = 2; t < len; t += 5 + rnd() * 5) {
        const k = t / len
        const nx = -(bz - az) / len, nz = (bx - ax) / len
        const side = rnd() < 0.5 ? -1 : 1
        const x = ax + (bx - ax) * k + nx * side * (3.2 + rnd()), z = az + (bz - az) * k + nz * side * (3.2 + rnd())
        if (!freeSpot(x, z, -1.2) || lakeE(x, z) < 1.15) continue
        out.push({ x, y: H(x, z), z, s: 0.9 + rnd() * 0.7 })
      }
    }
  }
  // espesura que oculta el tronco hueco y el túnel
  for (let i = 0; i < 16; i++) out.push({ x: 44 + i * 1.3, y: H(44 + i * 1.3, -39.5), z: -39.5 + (rnd() - 0.5), s: 1.4 + rnd() * 0.4 })
  return out.filter((b) => Math.hypot(b.x - GLADE.log[0], b.z - GLADE.log[2]) > 2)
}
