// Primitivas de campo de distancia con signo (SDF) para esculpir a Rocky.
// Todo es matemática pura (sin DOM ni Three.js) para poder ejecutarse en un Web Worker y en Node.

export type Vec3 = [number, number, number]

/** Matriz de rotación 3x3 en orden fila-mayor. */
export type Mat3 = [number, number, number, number, number, number, number, number, number]

export function rotEuler(x: number, y: number, z: number): Mat3 {
  // R = Rz * Ry * Rx  (aplicado a vectores columna)
  const cx = Math.cos(x), sx = Math.sin(x)
  const cy = Math.cos(y), sy = Math.sin(y)
  const cz = Math.cos(z), sz = Math.sin(z)
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ]
}

/** Aplica la transpuesta (inversa de una rotación) a un vector. */
export function mulT(m: Mat3, x: number, y: number, z: number, out: Vec3): Vec3 {
  out[0] = m[0] * x + m[3] * y + m[6] * z
  out[1] = m[1] * x + m[4] * y + m[7] * z
  out[2] = m[2] * x + m[5] * y + m[8] * z
  return out
}

export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k)
}

/** Elipsoide (aproximación de Íñigo Quílez, con límite inferior correcto). */
export function sdEllipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number): number {
  const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2)
  const k1 = Math.sqrt((px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2)
  if (k1 < 1e-9) return -Math.min(rx, ry, rz)
  return (k0 * (k0 - 1)) / k1
}

/** Cono redondeado entre a y b con radios r1, r2 (cápsula de radio variable). */
export function sdRoundCone(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2: number,
): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az
  const l2 = bax * bax + bay * bay + baz * baz
  const rr = r1 - r2
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  const pax = px - ax, pay = py - ay, paz = pz - az
  const y = pax * bax + pay * bay + paz * baz
  const z = y - l2
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y
  const x2 = qx * qx + qy * qy + qz * qz
  const y2 = y * y * l2
  const z2 = z * z * l2
  const k = Math.sign(rr) * rr * rr * x2
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
}

// ---------------------------------------------------------------------------
// Descripción declarativa de una pieza anatómica
// ---------------------------------------------------------------------------

export type PrimitiveKind = 'ellipsoid' | 'roundcone' | 'shell'

export type Masks = {
  /** Máscara oscura (hocico negro). */
  dark?: number
  /** Mancha blanca del pecho. */
  white?: number
  /** Trufa (nariz). */
  nose?: number
  /** Uñas. */
  nail?: number
  /** Interior rosado de la oreja. */
  innerEar?: number
  /** Vientre más claro. */
  belly?: number
  /** Interior de la boca / encías. */
  mouth?: number
}

export interface Primitive {
  name: string
  kind: PrimitiveKind
  bone: string
  /** 'add' = unión suave, 'sub' = resta suave. */
  op: 'add' | 'sub'
  /** Radio de mezcla de la unión/resta suave. */
  k: number
  center: Vec3
  rot?: Mat3
  /** elipsoide/shell: radios; roundcone: [r1, r2, _] */
  radii: Vec3
  /** roundcone: segundo extremo. */
  end?: Vec3
  /** shell: grosor de la concha y plano de corte en z local. */
  thickness?: number
  cut?: number
  masks?: Masks
  /** Radio de la esfera envolvente (calculado). */
  bound?: number
}

const tmp: Vec3 = [0, 0, 0]

export function evalPrimitive(p: Primitive, x: number, y: number, z: number): number {
  const c = p.center
  let lx = x - c[0], ly = y - c[1], lz = z - c[2]
  if (p.kind === 'roundcone') {
    const e = p.end!
    return sdRoundCone(x, y, z, c[0], c[1], c[2], e[0], e[1], e[2], p.radii[0], p.radii[1])
  }
  if (p.rot) {
    mulT(p.rot, lx, ly, lz, tmp)
    lx = tmp[0]; ly = tmp[1]; lz = tmp[2]
  }
  if (p.kind === 'ellipsoid') return sdEllipsoid(lx, ly, lz, p.radii[0], p.radii[1], p.radii[2])
  // shell: concha de elipsoide abierta hacia +z local (oreja de murciélago)
  const d = sdEllipsoid(lx, ly, lz, p.radii[0], p.radii[1], p.radii[2])
  const shell = Math.abs(d + (p.thickness ?? 0.005)) - (p.thickness ?? 0.005)
  return smax(shell, lz - (p.cut ?? 0), 0.004)
}

export function computeBound(p: Primitive): number {
  if (p.kind === 'roundcone') {
    const e = p.end!, c = p.center
    return Math.hypot(e[0] - c[0], e[1] - c[1], e[2] - c[2]) / 2 + Math.max(p.radii[0], p.radii[1])
  }
  return Math.max(p.radii[0], p.radii[1], p.radii[2])
}

export function boundCenter(p: Primitive): Vec3 {
  if (p.kind === 'roundcone') {
    const e = p.end!, c = p.center
    return [(c[0] + e[0]) / 2, (c[1] + e[1]) / 2, (c[2] + e[2]) / 2]
  }
  return p.center
}

/** Evalúa el SDF completo (uniones y restas en orden). */
export function evalModel(prims: Primitive[], x: number, y: number, z: number): number {
  let d = 1e9
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i]
    const di = evalPrimitive(p, x, y, z)
    d = p.op === 'add' ? smin(d, di, p.k) : smax(d, -di, p.k)
  }
  return d
}
