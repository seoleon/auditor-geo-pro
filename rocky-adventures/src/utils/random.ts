// Generadores pseudoaleatorios deterministas (mismo mundo en cada partida).

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ruido de valor 2D suave y determinista. */
export function makeNoise2D(seed = 1) {
  const perm = new Uint8Array(512)
  const rnd = mulberry32(seed)
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const vals = new Float32Array(256).map(() => rnd() * 2 - 1)
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const v = (ix: number, iy: number) => vals[perm[(perm[ix & 255] + iy) & 255]]
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const u = fade(fx), w = fade(fy)
    const a = v(ix, iy), b = v(ix + 1, iy), c = v(ix, iy + 1), d = v(ix + 1, iy + 1)
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w
  }
  const fbm = (x: number, y: number, oct = 4) => {
    let s = 0, amp = 0.5, f = 1
    for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5 }
    return s
  }
  return { noise, fbm }
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/** Distancia de un punto a un segmento 2D. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az
  const l2 = dx * dx + dz * dz
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

/** Distancia mínima a una polilínea. */
export function distToPolyline(px: number, pz: number, pts: [number, number][]) {
  let d = Infinity
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]))
  return d
}
