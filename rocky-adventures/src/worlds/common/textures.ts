// Texturas procedurales generadas en tiempo de carga (originales, sin licencias externas).
// Cada material tiene color + mapa de normales derivado de su mapa de alturas (relieve visual).
import * as THREE from 'three'
import { mulberry32 } from '../../utils/random'

type Tex = { map: THREE.Texture; normal: THREE.Texture }
const cache = new Map<string, Tex | THREE.Texture>()
let SIZE = 512

export function setTextureSize(q: 'low' | 'medium' | 'high') {
  SIZE = q === 'low' ? 256 : 512
}

/** Ruido de valor periódico (tileable) en [0,1]. */
function periodicNoise(seed: number, period: number) {
  const rnd = mulberry32(seed)
  const g = new Float32Array(period * period).map(() => rnd())
  const at = (x: number, y: number) => g[((y % period) + period) % period * period + (((x % period) + period) % period)]
  return (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

function fbmTile(seed: number, base: number, oct: number) {
  const ns = Array.from({ length: oct }, (_, i) => periodicNoise(seed + i * 17, base << i))
  return (u: number, v: number) => {
    let s = 0, a = 0.5, n = 0
    for (let i = 0; i < oct; i++) { s += a * ns[i](u * (base << i), v * (base << i)); n += a; a *= 0.5 }
    return s / n
  }
}

function canvas(size = SIZE) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

/** Mapa de normales a partir de un campo de alturas (tileable). */
function normalFromHeight(h: Float32Array, size: number, strength: number): THREE.Texture {
  const c = canvas(size)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const H = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength
      const l = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

type PixelFn = (u: number, v: number, x: number, y: number) => [number, number, number, number]

function generate(key: string, pixel: PixelFn, normalStrength: number, size = SIZE): Tex {
  const hit = cache.get(key) as Tex | undefined
  if (hit) return hit
  const c = canvas(size)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b, height] = pixel(x / size, y / size, x, y)
      const i = (y * size + x) * 4
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
      h[y * size + x] = height
    }
  ctx.putImageData(img, 0, 0)
  const tex = { map: finish(c), normal: normalFromHeight(h, size, normalStrength * (size / 512)) }
  cache.set(key, tex)
  return tex
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

// ----------------------------------------------------------------------------- terreno
export function grassTexture(): Tex {
  const n1 = fbmTile(11, 4, 5)
  const n2 = periodicNoise(12, 128)
  return generate('grass', (u, v) => {
    const big = n1(u, v)
    const blade = n2(u * 128, v * 128 * 0.35)
    const fine = n2(u * 128 + 50, v * 128)
    const t = big * 0.7 + blade * 0.3
    const r = mix(52, 104, t) + fine * 12
    const g = mix(96, 152, t) + fine * 18
    const b = mix(32, 58, t)
    return [r, g, b, blade * 0.6 + big * 0.4]
  }, 3)
}

export function dirtTexture(): Tex {
  const n1 = fbmTile(21, 4, 5)
  const rnd = mulberry32(22)
  const pebbles = Array.from({ length: 140 }, () => [rnd(), rnd(), 0.004 + rnd() * 0.012, rnd()])
  return generate('dirt', (u, v) => {
    let t = n1(u, v)
    let peb = 0
    for (const [px, py, r, c] of pebbles) {
      let dx = Math.abs(u - px), dy = Math.abs(v - py)
      dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy)
      const d = Math.hypot(dx, dy * 1.3)
      if (d < r) { peb = Math.max(peb, 1 - d / r); t = mix(t, 0.4 + c * 0.6, 0.8) }
    }
    return [mix(118, 176, t), mix(86, 134, t), mix(56, 92, t), t * 0.5 + peb * 0.8]
  }, 4)
}

export function cobbleTexture(): Tex {
  // adoquines: celdas de Voronoi periódicas con juntas
  const rnd = mulberry32(31)
  const N = 7
  const pts: [number, number, number][] = []
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) pts.push([(i + 0.2 + rnd() * 0.6) / N, (j + 0.2 + rnd() * 0.6) / N, rnd()])
  const n1 = fbmTile(32, 8, 4)
  return generate('cobble', (u, v) => {
    let d1 = 9, d2 = 9, col = 0
    const ci = Math.floor(u * N), cj = Math.floor(v * N)
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const ii = ci + di, jj = cj + dj
      const wi = ((ii % N) + N) % N, wj = ((jj % N) + N) % N
      const [px, py, c] = pts[wi * N + wj]
      const d = Math.hypot(u - (px + (ii - wi) / N), v - (py + (jj - wj) / N))
      if (d < d1) { d2 = d1; d1 = d; col = c } else if (d < d2) d2 = d
    }
    const edge = Math.min(1, (d2 - d1) * 28)
    const n = n1(u, v)
    const base = mix(120, 175, col) * (0.85 + n * 0.3)
    const grout = 1 - edge
    return [mix(base, 70, grout) * 1.0, mix(base * 0.95, 66, grout), mix(base * 0.88, 58, grout), edge * 0.8 + n * 0.2]
  }, 6)
}

export function rockTexture(): Tex {
  const n1 = fbmTile(41, 4, 6)
  const n2 = fbmTile(42, 16, 3)
  return generate('rock', (u, v) => {
    const t = n1(u, v)
    const crack = Math.abs(n2(u, v) - 0.5) < 0.025 ? 1 : 0
    const strata = Math.sin(v * 40 + t * 8) * 0.5 + 0.5
    const g = mix(92, 160, t * 0.8 + strata * 0.2) * (1 - crack * 0.45)
    return [g * 1.02, g, g * 0.94, t - crack * 0.3]
  }, 5)
}

export function sandTexture(): Tex {
  const n1 = fbmTile(51, 4, 4)
  const n2 = periodicNoise(52, 256)
  return generate('sand', (u, v) => {
    const t = n1(u, v)
    const grain = n2(u * 256, v * 256)
    const ripple = Math.sin((v + t * 0.3) * Math.PI * 2 * 14) * 0.5 + 0.5
    const k = t * 0.5 + grain * 0.3 + ripple * 0.2
    return [mix(206, 238, k), mix(178, 214, k), mix(132, 168, k), ripple * 0.6 + grain * 0.4]
  }, 2.5)
}

export function barkTexture(): Tex {
  const n1 = fbmTile(61, 4, 5)
  return generate('bark', (u, v) => {
    const t = n1(u * 1, v * 0.25)
    const groove = Math.pow(Math.abs(Math.sin((u * 12 + t * 3) * Math.PI)), 0.5)
    const k = groove * 0.7 + t * 0.3
    return [mix(48, 112, k), mix(36, 84, k), mix(26, 58, k), groove]
  }, 7)
}

export function woodTexture(): Tex {
  const n1 = fbmTile(71, 4, 4)
  return generate('wood', (u, v) => {
    const plank = Math.floor(v * 6)
    const pv = v * 6 - plank
    const gap = pv < 0.05 || pv > 0.95 ? 1 : 0
    const t = n1(u * 0.5 + plank * 0.37, pv * 0.2)
    const grain = Math.sin((u * 30 + t * 6 + plank * 3) * Math.PI) * 0.5 + 0.5
    const k = grain * 0.4 + t * 0.6 + ((plank * 7919) % 5) * 0.04
    return [gap ? 50 : mix(140, 196, k), gap ? 36 : mix(98, 142, k), gap ? 24 : mix(62, 92, k), gap ? 0 : 0.5 + grain * 0.3]
  }, 4)
}

export function plasterTexture(): Tex {
  const n1 = fbmTile(81, 8, 4)
  return generate('plaster', (u, v) => {
    const t = n1(u, v)
    const g = 215 + t * 40
    return [g, g, g, t]
  }, 1.5)
}

export function asphaltTexture(): Tex {
  const n1 = fbmTile(111, 8, 5)
  const n2 = periodicNoise(112, 256)
  return generate('asphalt', (u, v) => {
    const t = n1(u, v)
    const grit = n2(u * 256, v * 256)
    const g = 58 + t * 30 + (grit > 0.8 ? 40 : grit < 0.15 ? -15 : 0)
    return [g, g * 1.0, g * 1.04, grit * 0.5 + t * 0.5]
  }, 3)
}

export function tileTexture(): Tex {
  const n1 = fbmTile(121, 8, 3)
  return generate('tiles', (u, v) => {
    const tu = (u * 8) % 1, tv = (v * 8) % 1
    const edge = tu < 0.04 || tv < 0.04 ? 1 : 0
    const cell = (Math.floor(u * 8) + Math.floor(v * 8)) % 2
    const t = n1(u, v)
    const base = cell ? 196 : 176
    const g = edge ? 120 : base + t * 25
    return [g * 1.02, g * 0.97, g * 0.9, edge ? 0 : 0.6 + t * 0.2]
  }, 3)
}

// ----------------------------------------------------------------------------- recortes con alfa
/** Racimo de hojas con alfa (para copas de árboles y arbustos). */
export function leafCardTexture(kind: 'broad' | 'needle' | 'palm' = 'broad'): THREE.Texture {
  const key = 'leaf-' + kind
  const hit = cache.get(key) as THREE.Texture | undefined
  if (hit) return hit
  const size = 256
  const c = canvas(size)
  const g = c.getContext('2d')!
  const rnd = mulberry32(kind === 'broad' ? 91 : kind === 'needle' ? 92 : 93)
  g.clearRect(0, 0, size, size)
  const leaves = kind === 'broad' ? 46 : kind === 'needle' ? 120 : 1
  if (kind === 'palm') {
    // fronda de palmera: nervio central con foliolos
    g.translate(size / 2, size - 6)
    for (let i = 0; i < 44; i++) {
      const y = -i * 5.6
      const len = 70 * Math.sin((i / 44) * Math.PI) + 8
      for (const side of [-1, 1]) {
        g.strokeStyle = `hsl(${95 + rnd() * 20}, ${45 + rnd() * 15}%, ${26 + rnd() * 14}%)`
        g.lineWidth = 4
        g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(side * len * 0.5, y - 10, side * len, y + 14); g.stroke()
      }
    }
    g.strokeStyle = '#5b6b2a'; g.lineWidth = 4
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -size + 12); g.stroke()
    g.setTransform(1, 0, 0, 1, 0, 0)
  } else {
    for (let i = 0; i < leaves; i++) {
      const x = 20 + rnd() * (size - 40), y = 20 + rnd() * (size - 40)
      const a = rnd() * Math.PI * 2
      const L = kind === 'broad' ? 22 + rnd() * 16 : 18 + rnd() * 10
      const W = kind === 'broad' ? L * 0.48 : 2.2
      const hue = kind === 'broad' ? 88 + rnd() * 30 : 120 + rnd() * 20
      const light = 24 + rnd() * 24
      g.save()
      g.translate(x, y); g.rotate(a)
      g.fillStyle = `hsl(${hue}, ${50 + rnd() * 20}%, ${light}%)`
      g.beginPath()
      g.moveTo(0, -L / 2)
      g.quadraticCurveTo(W, 0, 0, L / 2)
      g.quadraticCurveTo(-W, 0, 0, -L / 2)
      g.fill()
      if (kind === 'broad') {
        g.strokeStyle = `hsla(${hue}, 40%, ${light + 15}%, 0.6)`
        g.lineWidth = 1
        g.beginPath(); g.moveTo(0, -L / 2); g.lineTo(0, L / 2); g.stroke()
      }
      g.restore()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  cache.set(key, t)
  return t
}

/** Pétalos de flor en blanco (se tiñen por instancia). */
export function flowerTexture(): THREE.Texture {
  const hit = cache.get('flower') as THREE.Texture | undefined
  if (hit) return hit
  const size = 128
  const c = canvas(size)
  const g = c.getContext('2d')!
  g.translate(size / 2, size / 2)
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3)
    const grad = g.createLinearGradient(0, 0, 0, -52)
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#f2f2f2')
    g.fillStyle = grad
    g.beginPath(); g.ellipse(0, -30, 15, 28, 0, 0, Math.PI * 2); g.fill()
  }
  g.fillStyle = '#ffd23f'
  g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  cache.set('flower', t)
  return t
}

/** Nube suave para los "sprites" del cielo. */
export function cloudTexture(): THREE.Texture {
  const hit = cache.get('cloud') as THREE.Texture | undefined
  if (hit) return hit
  const size = 256
  const c = canvas(size)
  const g = c.getContext('2d')!
  const rnd = mulberry32(101)
  for (let i = 0; i < 26; i++) {
    const x = size * (0.2 + rnd() * 0.6), y = size * (0.35 + rnd() * 0.35)
    const r = size * (0.08 + rnd() * 0.16)
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    const shade = 225 + rnd() * 30
    grad.addColorStop(0, `rgba(${shade},${shade},${shade + 5},0.55)`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  cache.set('cloud', t)
  return t
}

/** Partícula redonda suave. */
export function softDotTexture(): THREE.Texture {
  const hit = cache.get('dot') as THREE.Texture | undefined
  if (hit) return hit
  const c = canvas(64)
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  cache.set('dot', t)
  return t
}

/** Fachada de edificio con ventanas (ciudad). */
export function facadeTexture(seed: number, wall: string, trim: string): Tex {
  const key = `facade-${seed}-${wall}-${trim}`
  const hit = cache.get(key) as Tex | undefined
  if (hit) return hit
  const size = 512
  const c = canvas(size)
  const g = c.getContext('2d')!
  const hc = canvas(size)
  const hg = hc.getContext('2d')!
  const rnd = mulberry32(seed)
  g.fillStyle = wall
  g.fillRect(0, 0, size, size)
  hg.fillStyle = '#808080'
  hg.fillRect(0, 0, size, size)
  // textura de ladrillo/estuco
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.05})`
    g.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 6, 2 + rnd() * 3)
  }
  // ventana centrada en el "piso" (la textura cubre 1 piso x 2 vanos)
  for (let k = 0; k < 2; k++) {
    const x0 = k * 256 + 64, y0 = 120, w = 128, h = 230
    hg.fillStyle = '#404040'; hg.fillRect(x0 - 10, y0 - 10, w + 20, h + 20)
    hg.fillStyle = '#c0c0c0'; hg.fillRect(x0 - 16, y0 + h + 4, w + 32, 18)
    g.fillStyle = trim
    g.fillRect(x0 - 14, y0 - 14, w + 28, h + 28)
    g.fillRect(x0 - 22, y0 + h + 6, w + 44, 20)
    const lit = rnd() < 0.35
    const grad = g.createLinearGradient(x0, y0, x0 + w, y0 + h)
    grad.addColorStop(0, lit ? '#ffe6a8' : '#2c4a66')
    grad.addColorStop(1, lit ? '#f2b45c' : '#7fb0d6')
    g.fillStyle = grad
    g.fillRect(x0, y0, w, h)
    g.fillStyle = trim
    g.fillRect(x0 + w / 2 - 4, y0, 8, h)
    g.fillRect(x0, y0 + h * 0.45, w, 7)
    // contraventanas
    g.fillStyle = `hsl(${Math.floor(rnd() * 360)}, 45%, 38%)`
    g.fillRect(x0 - 48, y0, 30, h); g.fillRect(x0 + w + 18, y0, 30, h)
    // macetas en el alféizar
    if (rnd() < 0.6) {
      for (let f = 0; f < 6; f++) {
        g.fillStyle = `hsl(${[0, 30, 320, 50, 280][f % 5]}, 80%, ${55 + rnd() * 15}%)`
        g.beginPath(); g.arc(x0 - 10 + f * 26, y0 + h - 2, 9, 0, Math.PI * 2); g.fill()
      }
    }
  }
  const t = finish(c)
  // altura → normales
  const hd = hg.getImageData(0, 0, size, size).data
  const h = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) h[i] = hd[i * 4] / 255
  const tex = { map: t, normal: normalFromHeight(h, size, 6) }
  cache.set(key, tex)
  return tex
}

export function disposeTextureCache() {
  cache.forEach((t) => {
    if ((t as Tex).map) { (t as Tex).map.dispose(); (t as Tex).normal.dispose() }
    else (t as THREE.Texture).dispose()
  })
  cache.clear()
}
