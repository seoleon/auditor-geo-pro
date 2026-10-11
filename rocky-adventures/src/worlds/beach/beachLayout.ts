// Diseño de La Playa del Tesoro: playa con dunas al sur, mar al norte, muelle con barcas,
// islotes unidos por puentes (faro en el islote mayor), barco naufragado al este
// y la cueva del tesoro en los acantilados del oeste.
import { lerp, makeNoise2D, mulberry32, smoothstep } from '../../utils/random.ts'
import type { BoneDef, CheckpointDef, CookieDef, CrateDef, EnemyDef, PlatformDef, V3 } from '../../gameplay/levelTypes'
import type { Surface } from '../../systems/events'
import type { RockItem, TreeInstance } from '../common/Vegetation'

const noise = makeNoise2D(7)
export const BEACH = { half: 78, waterY: 0 }

export const ISLANDS = [
  { x: 14, z: -34, r: 5.5, h: 1.3 },
  { x: 34, z: -46, r: 7.5, h: 2.0 }, // faro
  { x: -12, z: -40, r: 4.5, h: 1.1 },
  { x: -30, z: -30, r: 4.0, h: 1.2 },
]
export const CAVE = { x: -46, z: 6 }

export function beachHeight(x: number, z: number) {
  // pendiente de la playa hacia el mar (norte)
  let h = lerp(-4, 2.2, smoothstep(-30, 18, z))
  // dunas
  h += smoothstep(8, 30, z) * (noise.fbm(x * 0.05, z * 0.05, 3) * 2.4 + 1.2)
  h += noise.noise(x * 0.15, z * 0.15) * 0.12
  // acantilados del oeste y del sur
  const cliffW = smoothstep(-40, -54, x)
  h = lerp(h, 9 + noise.fbm(x * 0.08, z * 0.08) * 2, cliffW)
  const edge = Math.max(Math.abs(x), z > 0 ? z : 0)
  if (edge > 62) h += Math.pow(edge - 62, 1.3) * 0.6
  // islotes
  for (const is of ISLANDS) {
    const d = Math.hypot(x - is.x, z - is.z)
    if (d < is.r + 4) h = Math.max(h, lerp(is.h, -3.5, smoothstep(is.r * 0.55, is.r + 3.5, d)))
  }
  return h
}

export function beachSplat(x: number, z: number, h: number, ny: number): [number, number, number, number] {
  // capas: arena seca, arena húmeda, roca, hierba de duna
  const wet = 1 - smoothstep(-0.2, 0.9, h)
  const rock = smoothstep(0.82, 0.62, ny) + smoothstep(-42, -48, x) * 0.8
  const grass = smoothstep(2.6, 4, h) * smoothstep(0.85, 0.95, ny) * (0.5 + 0.5 * noise.noise(x * 0.1, z * 0.1)) * (x > -38 ? 1 : 0)
  const sand = Math.max(0.02, 1 - wet - rock - grass)
  return [sand, wet, rock, grass]
}

export const beachSurface = (x: number, z: number): Surface => (beachHeight(x, z) < 0.05 ? 'water' : x < -42 ? 'stone' : 'sand')

export function beachDeepWater(x: number, z: number) {
  return beachHeight(x, z) < -1.4
}

const H = beachHeight
const g = (x: number, z: number, up = 0): V3 => [x, H(x, z) + up, z]

export const SPAWN: V3 = g(4, 30, 0.75)
export const SPAWN_YAW = Math.PI

export const PIER = { from: [0, 1.25, -2] as V3, to: [0, 1.25, -27] as V3 }
export const BRIDGES: { from: V3; to: V3 }[] = [
  { from: [1.2, 1.25, -27], to: [9.2, ISLANDS[0].h + 0.05, -33] },
  { from: [18.8, ISLANDS[0].h + 0.05, -36.5], to: [28.2, ISLANDS[1].h + 0.05, -43.5] },
]
export const LIGHTHOUSE = { x: 36, z: -48, base: ISLANDS[1].h, height: 13 }
export const SHIP = { x: 34, z: -4, rot: -0.5 }
export const SANDCASTLE = g(-14, 14)
/** Convierte coordenadas locales del barco a coordenadas del mundo. */
export function shipLocal(lx: number, ly: number, lz: number): V3 {
  const c = Math.cos(SHIP.rot), s = Math.sin(SHIP.rot)
  return [SHIP.x + lx * c + lz * s, H(SHIP.x, SHIP.z) + ly, SHIP.z - lx * s + lz * c]
}

export const BONES: BoneDef[] = [
  { id: 'b-bone-ship', pos: shipLocal(0.4, 1.05, 0.5), hint: 'En la bodega del barco naufragado' },
  { id: 'b-bone-mast', pos: shipLocal(0.3, 6.4 + 0.85, -3.2), hint: 'En la cofa del mástil' },
  { id: 'b-bone-dune', pos: g(22, 26, 0.7), mode: 'buried', hint: 'Enterrado en las dunas' },
  { id: 'b-bone-islet', pos: [ISLANDS[3].x, ISLANDS[3].h + 0.85, ISLANDS[3].z], hint: 'En el islote del oeste' },
  { id: 'b-bone-castle', pos: [SANDCASTLE[0], SANDCASTLE[1] + 0.75, SANDCASTLE[2]], hint: 'Dentro del castillo de arena' },
  { id: 'b-bone-cliff', pos: [-42, H(-42, 17.5) - 0.3 + 4.7 + 0.8, 17.5], hint: 'En lo alto de las rocas del acantilado' },
  { id: 'b-bone-crabs', pos: g(8, 6, 0.8), mode: 'reward', mission: 'beach-crabs' },
  { id: 'b-bone-lighthouse', pos: [LIGHTHOUSE.x - 3.5, LIGHTHOUSE.base + 0.85, LIGHTHOUSE.z + 2.5], mode: 'reward', mission: 'beach-lighthouse' },
]

export const CRATES: CrateDef[] = [
  { id: 'castle', pos: SANDCASTLE, contains: { type: 'bone', id: 'b-bone-castle' }, look: 'sandcastle' },
  { id: 'b-crate-pier', pos: [-1.0, 1.25, -20], contains: { type: 'cookie', id: 'b-sh-crate' } },
]

export const COOKIES: CookieDef[] = [
  { id: 'b-sh-1', pos: g(-4, 22, 0.5) },
  { id: 'b-sh-2', pos: g(12, 12, 0.5) },
  { id: 'b-sh-3', pos: g(-22, 4, 0.5) },
  { id: 'b-sh-4', pos: g(26, 14, 0.5) },
  { id: 'b-sh-5', pos: [0, 2.0, -12] },
  { id: 'b-sh-6', pos: [ISLANDS[0].x, ISLANDS[0].h + 0.6, ISLANDS[0].z] },
  { id: 'b-sh-7', pos: [ISLANDS[2].x, ISLANDS[2].h + 0.6, ISLANDS[2].z] },
  { id: 'b-sh-8', pos: g(-36, -2, 0.5) },
  { id: 'b-sh-crate', pos: [-1.0, 1.95, -20] },
  { id: 'b-sh-cave', pos: [CAVE.x + 3, H(CAVE.x + 3, CAVE.z) + 0.6, CAVE.z + 2.5] },
  { id: 'b-sh-buried', pos: g(-6, 34, 0.45), mode: 'buried' },
  { id: 'b-sh-ship', pos: shipLocal(0, 2.4 + 0.7, 4.2) },
]

export const CHECKPOINTS: CheckpointDef[] = [
  { id: 'cp-b-start', pos: g(7, 28, 0), yaw: Math.PI },
  { id: 'cp-b-pier', pos: g(3.5, 0, 0), yaw: Math.PI },
  { id: 'cp-b-islet', pos: [ISLANDS[0].x + 1.5, ISLANDS[0].h, ISLANDS[0].z + 2], yaw: Math.PI },
  { id: 'cp-b-cave', pos: g(-36, 8, 0), yaw: -Math.PI / 2 },
]

export const ENEMIES: EnemyDef[] = [
  { id: 'crab-1', kind: 'crab', path: [g(-8, 8), g(4, 4)], speed: 1.8 },
  { id: 'crab-2', kind: 'crab', path: [g(14, 2), g(24, 8)], speed: 2.0 },
  { id: 'crab-3', kind: 'crab', path: [g(-26, 14), g(-30, 0)], speed: 1.6 },
  { id: 'crab-4', kind: 'crab', path: [[ISLANDS[1].x - 4, ISLANDS[1].h, ISLANDS[1].z + 1], [ISLANDS[1].x - 4, ISLANDS[1].h, ISLANDS[1].z - 4]], speed: 1.4 },
  { id: 'crab-5', kind: 'crab', path: [g(30, 20), g(38, 14)], speed: 1.7 },
]

export const PLATFORMS: PlatformDef[] = [
  // balsa de barriles: islote central → islote del oeste
  { id: 'raft', from: [ISLANDS[2].x - 4.6, 0.1, ISLANDS[2].z + 2], to: [ISLANDS[3].x + 4.4, 0.1, ISLANDS[3].z - 1.5], size: [2.6, 0.3, 2.2], period: 9, kind: 'log' },
  // del muelle al islote central
  { id: 'raft-2', from: [-2.2, 0.1, -27], to: [ISLANDS[2].x + 4.4, 0.1, ISLANDS[2].z + 1.5], size: [2.6, 0.3, 2.2], period: 8, kind: 'wood', phase: 0.5 },
]

export function generatePalms(): TreeInstance[] {
  const rnd = mulberry32(31)
  const out: TreeInstance[] = []
  let tries = 0
  while (out.length < 46 && tries < 2000) {
    tries++
    const x = (rnd() * 2 - 1) * 60, z = -6 + rnd() * 60
    const h = H(x, z)
    if (h < 0.6 || x < -38) continue
    if (Math.abs(x) < 3 && z < 4) continue
    if (Math.hypot(x - SHIP.x, z - SHIP.z) < 9 || Math.hypot(x - SANDCASTLE[0], z - SANDCASTLE[2]) < 4) continue
    if (Math.hypot(x - SPAWN[0], z - SPAWN[2]) < 4) continue
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 4.5)) continue
    out.push({ x, y: h - 0.1, z, rot: rnd() * 6.28, scale: 0.9 + rnd() * 0.5, kind: 'palm' })
  }
  for (const is of ISLANDS.slice(0, 1)) out.push({ x: is.x - 2.5, y: is.h, z: is.z + 1.5, rot: 1, scale: 1, kind: 'palm' })
  out.push({ x: ISLANDS[1].x - 4.5, y: ISLANDS[1].h, z: ISLANDS[1].z + 4.5, rot: 2, scale: 1.1, kind: 'palm' })
  return out
}

export function generateBeachRocks(): RockItem[] {
  const rnd = mulberry32(13)
  const out: RockItem[] = []
  // cueva: cúpula de grandes rocas con entrada hacia el este
  const cx = CAVE.x, cz = CAVE.z
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.42) continue // hueco de entrada (este)
    out.push({ x: cx + Math.cos(a) * 6.4, y: H(cx + Math.cos(a) * 6.4, cz + Math.sin(a) * 6.4) - 0.5, z: cz + Math.sin(a) * 6.4, s: 2.6 + rnd() * 0.8, rot: rnd() * 6, variant: i, sy: 1.6, tint: '#b8a894' })
  }
  out.push({ x: cx, y: H(cx, cz) + 4.6, z: cz, s: 6.4, sy: 0.45, rot: 0.5, variant: 1, tint: '#a89a88' })
  // rocas de la orilla y de los islotes
  for (let i = 0; i < 40; i++) {
    const x = (rnd() * 2 - 1) * 62, z = -30 + rnd() * 50
    const h = H(x, z)
    if (h < -1.5 || h > 3 || (Math.abs(x) < 4 && z < 2)) continue
    if (Math.hypot(x - SHIP.x, z - SHIP.z) < 8) continue
    out.push({ x, y: h - 0.2, z, s: 0.5 + rnd() * 1.4, rot: rnd() * 6, variant: i, tint: '#c9bba6' })
  }
  for (const is of ISLANDS) {
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2
      out.push({ x: is.x + Math.cos(a) * (is.r + 0.5), y: -0.4, z: is.z + Math.sin(a) * (is.r + 0.5), s: 0.8 + rnd() * 1.2, rot: rnd() * 6, variant: k, tint: '#9a8c7a' })
    }
  }
  return out
}
