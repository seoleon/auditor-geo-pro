// Anatomía de Rocky, bulldog francés atigrado.
// Unidades en metros (un bulldog francés real mide ~30 cm a la cruz). El modelo mira hacia +Z.
// Cada pieza está ligada a un hueso del esqueleto: de ahí salen los pesos de skinning.

import { rotEuler, type Primitive, type Vec3 } from './sdf.ts'

export interface BoneDef {
  name: string
  parent: string | null
  /** Posición del pivote del hueso en espacio de modelo (pose de reposo). */
  head: Vec3
}

export const BONES: BoneDef[] = [
  { name: 'root', parent: null, head: [0, 0, 0] },
  { name: 'pelvis', parent: 'root', head: [0, 0.265, -0.105] },
  { name: 'spine', parent: 'pelvis', head: [0, 0.27, -0.03] },
  { name: 'chest', parent: 'spine', head: [0, 0.27, 0.07] },
  { name: 'neck', parent: 'chest', head: [0, 0.31, 0.15] },
  { name: 'head', parent: 'neck', head: [0, 0.39, 0.215] },
  { name: 'jaw', parent: 'head', head: [0, 0.355, 0.262] },
  { name: 'earL', parent: 'head', head: [0.066, 0.462, 0.215] },
  { name: 'earR', parent: 'head', head: [-0.066, 0.462, 0.215] },
  { name: 'tail', parent: 'pelvis', head: [0, 0.285, -0.205] },
  { name: 'upperArmL', parent: 'chest', head: [0.072, 0.235, 0.115] },
  { name: 'forearmL', parent: 'upperArmL', head: [0.084, 0.148, 0.102] },
  { name: 'handL', parent: 'forearmL', head: [0.086, 0.048, 0.118] },
  { name: 'upperArmR', parent: 'chest', head: [-0.072, 0.235, 0.115] },
  { name: 'forearmR', parent: 'upperArmR', head: [-0.084, 0.148, 0.102] },
  { name: 'handR', parent: 'forearmR', head: [-0.086, 0.048, 0.118] },
  { name: 'thighL', parent: 'pelvis', head: [0.064, 0.235, -0.137] },
  { name: 'shinL', parent: 'thighL', head: [0.07, 0.148, -0.092] },
  { name: 'footL', parent: 'shinL', head: [0.07, 0.075, -0.172] },
  { name: 'thighR', parent: 'pelvis', head: [-0.064, 0.235, -0.137] },
  { name: 'shinR', parent: 'thighR', head: [-0.07, 0.148, -0.092] },
  { name: 'footR', parent: 'shinR', head: [-0.07, 0.075, -0.172] },
]

export const BONE_INDEX: Record<string, number> = Object.fromEntries(BONES.map((b, i) => [b.name, i]))

/** Puntos de anclaje para piezas no esculpidas (ojos, párpados, lengua, collar). */
export const ANCHORS = {
  eyeL: [0.047, 0.414, 0.306] as Vec3,
  eyeR: [-0.047, 0.414, 0.306] as Vec3,
  eyeRadius: 0.025,
  tongue: [0, 0.343, 0.312] as Vec3,
  collar: [0, 0.325, 0.165] as Vec3,
  noseTip: [0, 0.392, 0.357] as Vec3,
}

const E = (
  name: string, bone: string, center: Vec3, radii: Vec3, k: number,
  masks?: Primitive['masks'], rot?: Vec3, op: 'add' | 'sub' = 'add',
): Primitive => ({
  name, kind: 'ellipsoid', bone, op, k, center, radii, masks,
  rot: rot ? rotEuler(rot[0], rot[1], rot[2]) : undefined,
})

const C = (
  name: string, bone: string, a: Vec3, b: Vec3, r1: number, r2: number, k: number, masks?: Primitive['masks'],
): Primitive => ({ name, kind: 'roundcone', bone, op: 'add', k, center: a, end: b, radii: [r1, r2, 0], masks })

function mirror(v: Vec3): Vec3 {
  return [-v[0], v[1], v[2]]
}

/** Construye una pata (dedos con uñas incluidos) con lado +1 (izquierda) o -1 (derecha). */
function paw(side: 1 | -1, bone: string, cx: number, cy: number, cz: number, front: boolean): Primitive[] {
  const s = side
  const out: Primitive[] = []
  const len = front ? 0.036 : 0.034
  out.push(E(`paw${s}${front}`, bone, [cx, cy, cz], [0.03, 0.021, len], 0.02))
  // Cuatro dedos redondeados, el par central más adelantado (pie de gato, típico de la raza)
  const toes: [number, number][] = [[-0.019, 0.0], [-0.0065, 0.008], [0.0065, 0.008], [0.019, 0.0]]
  for (let i = 0; i < 4; i++) {
    const [ox, oz] = toes[i]
    const tx = cx + ox * s
    const tz = cz + len * 0.78 + oz
    out.push(E(`toe${s}${front}${i}`, bone, [tx, 0.014, tz], [0.0105, 0.0125, 0.013], 0.008))
    // Uña oscura que asoma bajo el pelo
    out.push(E(`nail${s}${front}${i}`, bone, [tx, 0.0085, tz + 0.0115], [0.0042, 0.0045, 0.0075], 0.004, { nail: 1 }, [0.5, 0, 0]))
  }
  // Almohadilla trasera (carpo/metatarso)
  out.push(E(`pad${s}${front}`, bone, [cx, 0.016, cz - len * 0.6], [0.018, 0.012, 0.016], 0.012, { nail: 0.6 }))
  return out
}

function frontLeg(side: 1 | -1): Primitive[] {
  const s = side
  const L = s === 1 ? 'L' : 'R'
  const m = (v: Vec3): Vec3 => (s === 1 ? v : mirror(v))
  return [
    // Hombro y brazo musculoso
    E(`shoulder${L}`, 'chest', m([0.066, 0.262, 0.118]), [0.058, 0.078, 0.07], 0.035, undefined, [0, 0, -0.15 * s]),
    C(`upperArm${L}`, `upperArm${L}`, m([0.074, 0.232, 0.118]), m([0.086, 0.15, 0.1]), 0.048, 0.036, 0.03),
    // Antebrazo corto y robusto, ligeramente abierto (codos hacia fuera)
    C(`forearm${L}`, `forearm${L}`, m([0.086, 0.15, 0.1]), m([0.086, 0.052, 0.116]), 0.033, 0.027, 0.016),
    E(`wrist${L}`, `hand${L}`, m([0.086, 0.045, 0.12]), [0.024, 0.022, 0.024], 0.012),
    ...paw(s, `hand${L}`, 0.087 * s, 0.022, 0.137, true),
  ]
}

function hindLeg(side: 1 | -1): Primitive[] {
  const s = side
  const L = s === 1 ? 'L' : 'R'
  const m = (v: Vec3): Vec3 => { const w: Vec3 = [v[0], v[1], v[2] + 0.028]; return s === 1 ? w : mirror(w) }
  return [
    // Muslo potente
    E(`haunch${L}`, `thigh${L}`, m([0.062, 0.218, -0.155]), [0.054, 0.085, 0.076], 0.04, undefined, [0.35, 0, 0]),
    C(`thigh${L}`, `thigh${L}`, m([0.066, 0.225, -0.16]), m([0.072, 0.148, -0.118]), 0.05, 0.033, 0.03),
    // Pierna hacia el corvejón (ángulo marcado)
    C(`shin${L}`, `shin${L}`, m([0.072, 0.148, -0.118]), m([0.071, 0.077, -0.198]), 0.031, 0.022, 0.016),
    C(`hock${L}`, `foot${L}`, m([0.071, 0.077, -0.198]), m([0.071, 0.03, -0.182]), 0.02, 0.02, 0.012),
    ...paw(s, `foot${L}`, 0.071 * s, 0.021, -0.134, false),
  ]
}

function ear(side: 1 | -1): Primitive {
  const s = side
  const L = s === 1 ? 'L' : 'R'
  return {
    name: `ear${L}`,
    kind: 'shell',
    bone: `ear${L}`,
    op: 'add',
    k: 0.014,
    // Orejas de murciélago: grandes, erguidas, con la punta redondeada y abiertas hacia delante
    center: [0.089 * s, 0.522, 0.215],
    radii: [0.053, 0.076, 0.035],
    thickness: 0.0058,
    cut: 0.004,
    rot: rotEuler(-0.1, 0.45 * s, -0.42 * s),
    masks: { innerEar: 0 },
  }
}

/** Lista ordenada de primitivas. El orden importa: las restas se aplican sobre lo anterior. */
export function buildAnatomy(): Primitive[] {
  const P: Primitive[] = [
    // ---------------- Tronco: pecho ancho, cintura recogida ("forma de pera") ----------------
    E('chest', 'chest', [0, 0.252, 0.085], [0.124, 0.124, 0.125], 0.0),
    E('ribs', 'spine', [0, 0.268, 0.0], [0.113, 0.108, 0.115], 0.05),
    E('waist', 'spine', [0, 0.279, -0.078], [0.092, 0.088, 0.088], 0.05, { belly: 0.4 }),
    E('rump', 'pelvis', [0, 0.27, -0.135], [0.093, 0.09, 0.08], 0.05),
    E('brisket', 'chest', [0, 0.198, 0.14], [0.094, 0.07, 0.07], 0.05, { white: 0.9 }),
    E('belly', 'spine', [0, 0.198, 0.01], [0.082, 0.05, 0.1], 0.06, { belly: 1 }),
    // ---------------- Cuello corto, grueso y arqueado ----------------
    C('neck', 'neck', [0, 0.29, 0.13], [0, 0.37, 0.205], 0.092, 0.084, 0.05),
    E('dewlap', 'neck', [0, 0.3, 0.2], [0.07, 0.06, 0.05], 0.04),
    // ---------------- Cabeza grande y cuadrada ----------------
    E('cranium', 'head', [0, 0.423, 0.232], [0.11, 0.084, 0.085], 0.045),
    E('skullTop', 'head', [0, 0.452, 0.23], [0.09, 0.03, 0.075], 0.04),
    E('forehead', 'head', [0, 0.438, 0.282], [0.078, 0.05, 0.045], 0.03),
    E('cheekL', 'head', [0.064, 0.374, 0.26], [0.064, 0.054, 0.058], 0.03),
    E('cheekR', 'head', [-0.064, 0.374, 0.26], [0.064, 0.054, 0.058], 0.03),
    // Cejas marcadas sobre los ojos
    E('browL', 'head', [0.047, 0.44, 0.297], [0.03, 0.012, 0.017], 0.014),
    E('browR', 'head', [-0.047, 0.44, 0.297], [0.03, 0.012, 0.017], 0.014),
    // Hocico corto y ancho con máscara negra
    E('muzzle', 'head', [0, 0.38, 0.314], [0.06, 0.038, 0.034], 0.024, { dark: 1 }),
    E('flewL', 'head', [0.031, 0.36, 0.312], [0.036, 0.032, 0.032], 0.016, { dark: 1 }),
    E('flewR', 'head', [-0.031, 0.36, 0.312], [0.036, 0.032, 0.032], 0.016, { dark: 1 }),
    // Arruga en forma de cuerda sobre la nariz
    C('noseRope', 'head', [-0.044, 0.398, 0.322], [0.044, 0.398, 0.322], 0.0105, 0.0105, 0.012, { dark: 1 }),
    E('ropeMid', 'head', [0, 0.403, 0.33], [0.03, 0.011, 0.012], 0.01, { dark: 1 }),
    // Mandíbula inferior (ligero prognatismo, típico de la raza)
    E('chin', 'jaw', [0, 0.333, 0.298], [0.045, 0.021, 0.04], 0.016, { dark: 1 }),
    // Trufa ancha
    E('nose', 'head', [0, 0.391, 0.342], [0.029, 0.019, 0.015], 0.007, { nose: 1 }),
    // ---------------- Orejas ----------------
    ear(1),
    ear(-1),
    // ---------------- Patas ----------------
    ...frontLeg(1),
    ...frontLeg(-1),
    ...hindLeg(1),
    ...hindLeg(-1),
    // ---------------- Cola en tirabuzón, muy corta ----------------
    E('tailBase', 'tail', [0, 0.282, -0.218], [0.022, 0.022, 0.024], 0.016),
    E('tailTip', 'tail', [0.006, 0.292, -0.235], [0.014, 0.016, 0.014], 0.01),
    // ---------------- Restas: cuencas de los ojos, boca, fosas nasales ----------------
    E('socketL', 'head', [0.047, 0.414, 0.3], [0.0225, 0.0225, 0.022], 0.012, undefined, undefined, 'sub'),
    E('socketR', 'head', [-0.047, 0.414, 0.3], [0.0225, 0.0225, 0.022], 0.012, undefined, undefined, 'sub'),
    E('mouthSlit', 'jaw', [0, 0.347, 0.305], [0.05, 0.0045, 0.04], 0.006, { mouth: 1, dark: 1 }, undefined, 'sub'),
    E('nostrilL', 'head', [0.012, 0.388, 0.356], [0.0075, 0.0042, 0.006], 0.003, { nose: 1 }, [0, 0, 0.5], 'sub'),
    E('nostrilR', 'head', [-0.012, 0.388, 0.356], [0.0075, 0.0042, 0.006], 0.003, { nose: 1 }, [0, 0, -0.5], 'sub'),
    E('noseCleft', 'head', [0, 0.382, 0.357], [0.0018, 0.008, 0.004], 0.002, { nose: 1 }, undefined, 'sub'),
  ]
  return P
}

/** Caja envolvente del modelo (con margen). */
export const MODEL_BOUNDS = {
  min: [-0.15, -0.012, -0.31] as Vec3,
  max: [0.15, 0.62, 0.41] as Vec3,
}
