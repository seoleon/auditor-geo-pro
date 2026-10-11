// Diseño de La Ciudad de los Perros: cuadrícula de 3x3 manzanas con plaza central,
// ruta de azoteas (sureste → torre), pasadizo secreto (oeste), parque canino (suroeste)
// y obra con andamios (noreste).
import type { BoneDef, CheckpointDef, CookieDef, CrateDef, EnemyDef, PlatformDef, V3 } from '../../gameplay/levelTypes'
import type { BuildingDef } from './CityProps'
import type { Surface } from '../../systems/events'

export const CITY = { half: 54, curb: 0.18 }
const C = CITY.curb

/** Las manzanas (aceras elevadas) ocupan centro ± 11. */
export const BLOCK_CENTERS: [number, number][] = [-30, 0, 30].flatMap((x) => [-30, 0, 30].map((z) => [x, z] as [number, number]))

export function cityHeight(x: number, z: number) {
  for (const [cx, cz] of BLOCK_CENTERS) if (Math.abs(x - cx) <= 11 && Math.abs(z - cz) <= 11) return C
  return 0
}
export const citySurface = (): Surface => 'stone'

export const SPAWN: V3 = [0, 0.45, 46]
export const SPAWN_YAW = Math.PI

export const BUILDINGS: BuildingDef[] = [
  // Sur: tiendas frente a la plaza
  { id: 's-bakery', pos: [-5, C, 25.5], size: [9, 7.5, 7], wall: '#f4d9b0', trim: '#8a5a3a', seed: 11, shop: { name: 'PANADERÍA', color: '#d9534f', face: 'n' } },
  { id: 's-pets', pos: [5.5, C, 25.5], size: [8, 9, 7], wall: '#cfe3f2', trim: '#2b5fae', seed: 12, shop: { name: 'MASCOTAS', color: '#2b8fd6', face: 'n' } },
  { id: 's-back', pos: [0, C, 35.5], size: [20, 12, 7], wall: '#e9c2a0', trim: '#7a4a2a', seed: 13 },
  // Sureste: cadena de azoteas
  { id: 'se-d', pos: [25, C, 24.5], size: [8, 3, 9], wall: '#d9d0c4', trim: '#6b5a4a', seed: 21 },
  { id: 'se-a', pos: [24.5, C, 35.5], size: [9, 4.5, 9], wall: '#f2b8a2', trim: '#8a3f2a', seed: 22 },
  { id: 'se-b', pos: [35.5, C, 35.5], size: [9, 7.5, 9], wall: '#bfe0c8', trim: '#2f6b48', seed: 23 },
  { id: 'se-c', pos: [35.5, C, 24.5], size: [9, 10.5, 9], wall: '#f6e3a2', trim: '#8a6a1a', seed: 24 },
  // Este: torre y vecinos
  { id: 'e-1', pos: [35.5, C, 4.5], size: [9, 12, 9], wall: '#d4c7f0', trim: '#4b3a8a', seed: 31 },
  { id: 'e-tower', pos: [24.5, C, -4.5], size: [9, 16.5, 9], wall: '#f0d2d8', trim: '#8a2f4a', seed: 32 },
  { id: 'e-2', pos: [35.5, C, -5.5], size: [9, 6, 7], wall: '#c8e4ef', trim: '#2a6a8a', seed: 33 },
  { id: 'e-salon', pos: [24.5, C, 6], size: [9, 7.5, 7], wall: '#ffe0f0', trim: '#c23b7a', seed: 34, shop: { name: 'PELUQUERÍA', color: '#e0559b', face: 'w' } },
  // Oeste: pasadizo y patio secreto
  { id: 'w-1', pos: [-27, C, -5.1], size: [14, 9, 7.8], wall: '#e7d3b8', trim: '#5a4630', seed: 41, shop: { name: 'LIBRERÍA', color: '#6a8f3a', face: 'e' } },
  { id: 'w-2', pos: [-27, C, 5.1], size: [14, 7.5, 7.8], wall: '#cfd8e8', trim: '#3a4a6a', seed: 42 },
  // Noroeste: residencial, heladería con azotea baja
  { id: 'nw-1', pos: [-35.5, C, -24.5], size: [9, 4.5, 9], wall: '#ffe9c2', trim: '#c27a1a', seed: 51, shop: { name: 'HELADOS', color: '#ff7aa8', face: 'e' } },
  { id: 'nw-2', pos: [-24.5, C, -35.5], size: [9, 12, 9], wall: '#d8c0a8', trim: '#5a3a2a', seed: 52 },
  { id: 'nw-3', pos: [-35.5, C, -35.5], size: [9, 7.5, 9], wall: '#c4d8c0', trim: '#3a5a32', seed: 53 },
  // Norte
  { id: 'n-1', pos: [-5, C, -25.5], size: [9, 6, 7], wall: '#fff2d8', trim: '#d08a2a', seed: 61, shop: { name: 'JUGUETES', color: '#f2a900', face: 's' } },
  { id: 'n-2', pos: [5.5, C, -25.5], size: [8, 9, 7], wall: '#e0f0d0', trim: '#4a7a2a', seed: 62, shop: { name: 'CAFÉ', color: '#7a4a2a', face: 's' } },
  { id: 'n-3', pos: [0, C, -35.5], size: [20, 13.5, 7], wall: '#d9d2f0', trim: '#4a3a7a', seed: 63 },
  // Noreste: obra
  { id: 'ne-1', pos: [24.5, C, -35.5], size: [9, 9, 9], wall: '#f2d4b0', trim: '#7a4a1a', seed: 71 },
  { id: 'ne-2', pos: [35.5, C, -35.5], size: [9, 12, 9], wall: '#c0d0e0', trim: '#2a4a6a', seed: 72 },
  { id: 'ne-3', pos: [35.5, C, -24.5], size: [9, 6, 9], wall: '#e8e0c8', trim: '#6a5a2a', seed: 73 },
  // Fondo: edificios altos que cierran la ciudad
  ...[-36, -18, 0, 18, 36].map((x, i) => ({ id: 'far-n' + i, pos: [x, 0, -53] as V3, size: [16, 18 + (i % 3) * 5, 6] as V3, wall: ['#c9b8a8', '#b8c4d0', '#d0c0b0'][i % 3], trim: '#5a4a3a', seed: 80 + i, rooftop: false })),
  ...[-36, -18, 18, 36].map((x, i) => ({ id: 'far-s' + i, pos: [x, 0, 53] as V3, size: [16, 16 + (i % 2) * 6, 6] as V3, wall: ['#d8c8b0', '#c0ccd8'][i % 2], trim: '#5a4a3a', seed: 90 + i, rooftop: false })),
  ...[-36, -18, 0, 18, 36].map((z, i) => ({ id: 'far-w' + i, pos: [-53, 0, z] as V3, size: [6, 17 + (i % 3) * 4, 16] as V3, wall: ['#d0b8a8', '#c8d0c0', '#b8b0c8'][i % 3], trim: '#5a4a3a', seed: 100 + i, rooftop: false })),
  ...[-36, -18, 0, 18, 36].map((z, i) => ({ id: 'far-e' + i, pos: [53, 0, z] as V3, size: [6, 15 + (i % 3) * 5, 16] as V3, wall: ['#c8c0b0', '#d8c8c0', '#b8c8c8'][i % 3], trim: '#5a4a3a', seed: 110 + i, rooftop: false })),
]

export const ROOF = (id: string) => {
  const b = BUILDINGS.find((x) => x.id === id)!
  return b.pos[1] + b.size[1]
}

// escaleras, pasarelas y peldaños de la ruta de azoteas
export const ROOF_RAMPS: { from: V3; to: V3; width: number }[] = [
  { from: [19.9, C + 0.02, 29], to: [19.9, ROOF('se-d') + 0.05, 20.6], width: 1.6 }, // escalera de incendios
  { from: [35.5, ROOF('se-c') + 0.02, 20.2], to: [35.5, ROOF('e-1') + 0.02, 8.8], width: 2.2 }, // pasarela sobre la calle
  { from: [37.5, ROOF('e-1') + 0.02, 1.5], to: [28.7, ROOF('e-tower') + 0.02, -1.2], width: 2.0 }, // rampa a la torre
]
export const ROOF_STEPS: { pos: V3; size: V3 }[] = [
  { pos: [27.6, ROOF('se-a'), 37.5], size: [1.6, 1.2, 1.6] },
  { pos: [28.3, ROOF('se-a'), 34.2], size: [1.3, 2.3, 1.3] },
  { pos: [36, ROOF('se-b'), 32.2], size: [1.6, 1.5, 1.6] },
]

export const WALLS: { pos: V3; size: V3 }[] = [
  { pos: [-40.6, C, 0], size: [0.6, 3.2, 19] },
  { pos: [-37.3, C, -9.3], size: [6.4, 3.2, 0.6] },
  { pos: [-37.3, C, 9.3], size: [6.4, 3.2, 0.6] },
]

export const BONES: BoneDef[] = [
  { id: 'c-bone-awning', pos: [-5, C + 2.55 + 1.0, 21.4], hint: 'Sobre el toldo de la panadería' },
  { id: 'c-bone-busstop', pos: [-9.5, C + 2.68 + 0.85, 19.6], hint: 'Encima de la marquesina' },
  { id: 'c-bone-park', pos: [-26, C + 0.7, 36], mode: 'buried', hint: 'Enterrado en el parque canino' },
  { id: 'c-bone-courtyard', pos: [-37.5, C + 0.75, 4], hint: 'En el patio secreto' },
  { id: 'c-bone-scaffold', pos: [24.5 + 0.8, C + 7.5 + 0.9, -24.5], hint: 'En lo alto del andamio' },
  { id: 'c-bone-puppies', pos: [-6, C + 0.85, 7], mode: 'reward', mission: 'city-puppies' },
  { id: 'c-bone-roof', pos: [22.5, ROOF('e-tower') + 0.8, -6.5], mode: 'reward', mission: 'city-rooftops' },
  { id: 'c-bone-delivery', pos: [-2.5, C + 0.85, 19.8], mode: 'reward', mission: 'city-delivery' },
]

export const CRATES: CrateDef[] = [
  { id: 'c-alley-1', pos: [-20.6, C, -0.6] },
  { id: 'c-alley-2', pos: [-20.6, C, 0.6] },
  { id: 'c-bakery', pos: [-1.6, C, 20.8], contains: { type: 'cookie', id: 'c-ck-crate' } },
  { id: 'c-ne', pos: [21, C, -21], contains: { type: 'cookie', id: 'c-ck-site' } },
]

export const COOKIES: CookieDef[] = [
  { id: 'c-ck-start', pos: [0, 0.9, 40] },
  { id: 'c-ck-crate', pos: [-1.6, C + 0.7, 20.8] },
  { id: 'c-ck-courtyard', pos: [-38, C + 0.7, -4] },
  { id: 'c-ck-alley', pos: [-27, C + 0.7, 0] },
  { id: 'c-ck-droof', pos: [25, ROOF('se-d') + 0.8, 24.5] },
  { id: 'c-ck-aroof', pos: [23, ROOF('se-a') + 0.8, 37] },
  { id: 'c-ck-broof', pos: [37.5, ROOF('se-b') + 0.8, 37] },
  { id: 'c-ck-bridge', pos: [35.5, (ROOF('se-c') + ROOF('e-1')) / 2 + 0.9, 14.5] },
  { id: 'c-ck-e1roof', pos: [37, ROOF('e-1') + 0.8, 6] },
  { id: 'c-ck-icecream', pos: [-30.6, C + 2.55 + 1.0, -24.5] },
  { id: 'c-ck-park', pos: [-34, C + 0.7, 34] },
  { id: 'c-ck-buried', pos: [-23, C + 0.6, 24], mode: 'buried' },
  { id: 'c-ck-site', pos: [21, C + 0.7, -21] },
  { id: 'c-ck-nwroof', pos: [-37, ROOF('nw-1') + 0.8, -27] },
]

export const CHECKPOINTS: CheckpointDef[] = [
  { id: 'cp-c-start', pos: [4, 0, 45], yaw: Math.PI },
  { id: 'cp-c-plaza', pos: [7, C, 9], yaw: Math.PI },
  { id: 'cp-c-roof', pos: [33.5, ROOF('se-c'), 27], yaw: Math.PI },
  { id: 'cp-c-park', pos: [-22, C, 22.5], yaw: Math.PI / 2 },
]

export const ENEMIES: EnemyDef[] = [
  { id: 'b-1', kind: 'broom', path: [[-8, 0, 15], [8, 0, 15]], speed: 2 },
  { id: 'b-2', kind: 'broom', path: [[15, 0, -8], [15, 0, 8]], speed: 2 },
  { id: 'b-3', kind: 'broom', path: [[20, 0, -15], [40, 0, -15]], speed: 2.2 },
  { id: 'b-4', kind: 'broom', path: [[-15, 0, 22], [-15, 0, 38]], speed: 1.8 },
]

export const PLATFORMS: PlatformDef[] = [
  { id: 'c-lift', from: [30, C + 0.3, 24.5], to: [30, ROOF('se-c') - 0.1, 24.5], size: [1.8, 0.25, 2.2], period: 10, kind: 'wood' },
]

export const PUPPIES: { id: string; pos: V3; yaw: number; coat: 'fawn' | 'cream' | 'black' | 'blue' | 'pied' | 'red' }[] = [
  { id: 'pup-1', pos: [-38, C, 0.5], yaw: Math.PI / 2, coat: 'cream' },
  { id: 'pup-2', pos: [-36.5, ROOF('nw-1'), -22], yaw: Math.PI / 2, coat: 'pied' },
  { id: 'pup-3', pos: [-35, C, 26], yaw: 0.6, coat: 'blue' },
]

export const CARS: { pos: V3; rot: number; color: string }[] = [
  { pos: [17.8, 0, 27], rot: 0, color: '#e8343f' },
  { pos: [12.2, 0, -27], rot: Math.PI, color: '#2b8fd6' },
  { pos: [-12.2, 0, 31], rot: Math.PI, color: '#ffcb3d' },
  { pos: [-17.8, 0, -31], rot: 0, color: '#3ddc84' },
  { pos: [27, 0, 12.2], rot: Math.PI / 2, color: '#f5f5f5' },
  { pos: [-28, 0, 17.8], rot: -Math.PI / 2, color: '#b388eb' },
  { pos: [31, 0, -17.8], rot: -Math.PI / 2, color: '#ff8a3d' },
  { pos: [-31, 0, -12.2], rot: Math.PI / 2, color: '#4a4f5a' },
  { pos: [44.8, 0, 6], rot: 0, color: '#2e7d5b' },
  { pos: [-44.8, 0, -24], rot: Math.PI, color: '#d9534f' },
]

export const LAMPS: V3[] = [
  ...[-30, 0, 30].flatMap((cx) => [-30, 0, 30].flatMap((cz) => [[cx - 10.3, C, cz - 10.3], [cx + 10.3, C, cz + 10.3]] as V3[])),
]
