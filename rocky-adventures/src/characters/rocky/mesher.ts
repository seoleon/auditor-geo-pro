// Generador de malla para Rocky: "Surface Nets" sobre el SDF anatómico, con banda estrecha,
// proyección de vértices sobre la superficie, normales analíticas, pesos de skinning por hueso
// y máscaras de color por región. Código puro: se ejecuta en un Web Worker.

import { BONES, BONE_INDEX, MODEL_BOUNDS, buildAnatomy } from './anatomy.ts'
import { boundCenter, computeBound, evalPrimitive, smax, smin, type Primitive, type Vec3 } from './sdf.ts'

export interface RockyMeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  skinIndex: Uint16Array
  skinWeight: Float32Array
  /** x: máscara oscura, y: blanco pecho, z: trufa, w: uñas */
  mask: Float32Array
  /** x: interior oreja, y: vientre claro, z: boca, w: libre */
  mask2: Float32Array
  vertexCount: number
  triangleCount: number
  millis: number
}

interface Compiled {
  prims: Primitive[]
  bc: Float64Array // centros envolventes
  br: Float64Array // radios envolventes
  boneOf: Int32Array
}

function compile(prims: Primitive[]): Compiled {
  const bc = new Float64Array(prims.length * 3)
  const br = new Float64Array(prims.length)
  const boneOf = new Int32Array(prims.length)
  prims.forEach((p, i) => {
    const c = boundCenter(p)
    bc[i * 3] = c[0]; bc[i * 3 + 1] = c[1]; bc[i * 3 + 2] = c[2]
    br[i] = computeBound(p) + 0.002
    boneOf[i] = BONE_INDEX[p.bone] ?? 0
  })
  return { prims, bc, br, boneOf }
}

/** SDF con descarte por esfera envolvente (una primitiva lejana no puede alterar la mezcla). */
function evalFast(m: Compiled, x: number, y: number, z: number): number {
  let d = 1e9
  const { prims, bc, br } = m
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i]
    const dx = x - bc[i * 3], dy = y - bc[i * 3 + 1], dz = z - bc[i * 3 + 2]
    const lower = Math.sqrt(dx * dx + dy * dy + dz * dz) - br[i]
    if (p.op === 'add') {
      if (lower > d + p.k) continue
      d = smin(d, evalPrimitive(p, x, y, z), p.k)
    } else {
      if (lower > Math.abs(d) + p.k) continue
      d = smax(d, -evalPrimitive(p, x, y, z), p.k)
    }
  }
  return d
}

export function generateRockyMesh(cellSize = 0.006): RockyMeshData {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const model = compile(buildAnatomy())
  const h = cellSize
  const [x0, y0, z0] = MODEL_BOUNDS.min
  const [x1, y1, z1] = MODEL_BOUNDS.max
  const nx = Math.ceil((x1 - x0) / h) + 1
  const ny = Math.ceil((y1 - y0) / h) + 1
  const nz = Math.ceil((z1 - z0) / h) + 1
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k)

  // --- 1. Rejilla gruesa para la banda estrecha ---
  const S = 4
  const cnx = Math.ceil((nx - 1) / S) + 1, cny = Math.ceil((ny - 1) / S) + 1, cnz = Math.ceil((nz - 1) / S) + 1
  const coarse = new Float32Array(cnx * cny * cnz)
  for (let k = 0; k < cnz; k++)
    for (let j = 0; j < cny; j++)
      for (let i = 0; i < cnx; i++)
        coarse[i + cnx * (j + cny * k)] = evalFast(model, x0 + i * S * h, y0 + j * S * h, z0 + k * S * h)

  // Solo se evalúa con precisión el SDF en las celdas gruesas cercanas a la superficie.
  const field = new Float32Array(nx * ny * nz).fill(1)
  const done = new Uint8Array(nx * ny * nz)
  const safe = S * h * Math.sqrt(3) * 0.75
  for (let ck = 0; ck < cnz - 1; ck++)
    for (let cj = 0; cj < cny - 1; cj++)
      for (let ci = 0; ci < cnx - 1; ci++) {
        let pos = 0, neg = 0, minAbs = 1e9
        for (let c = 0; c < 8; c++) {
          const v = coarse[ci + (c & 1) + cnx * (cj + ((c >> 1) & 1) + cny * (ck + ((c >> 2) & 1)))]
          if (v < 0) neg++; else pos++
          const a = Math.abs(v)
          if (a < minAbs) minAbs = a
        }
        const i0 = ci * S, j0 = cj * S, k0 = ck * S
        const i1 = Math.min(i0 + S, nx - 1), j1 = Math.min(j0 + S, ny - 1), k1 = Math.min(k0 + S, nz - 1)
        if ((pos === 8 || neg === 8) && minAbs > safe) {
          const fill = neg === 8 ? -1 : 1
          for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const id = idx(i, j, k)
            if (!done[id]) field[id] = fill
          }
          continue
        }
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const id = idx(i, j, k)
          if (done[id]) continue
          done[id] = 1
          field[id] = evalFast(model, x0 + i * h, y0 + j * h, z0 + k * h)
        }
      }

  // --- 2. Surface Nets: un vértice por celda que cruza la superficie ---
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k)
  const pos: number[] = []
  const corner = new Float32Array(8)
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0
        for (let c = 0; c < 8; c++) {
          const v = field[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]
          corner[c] = v
          if (v < 0) inside++
        }
        if (inside === 0 || inside === 8) continue
        let sx = 0, sy = 0, sz = 0, n = 0
        for (const [a, b] of EDGES) {
          const va = corner[a], vb = corner[b]
          if ((va < 0) === (vb < 0)) continue
          const t = va / (va - vb)
          const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
          const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1
          sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t
          n++
        }
        cellVert[cidx(i, j, k)] = pos.length / 3
        pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h)
      }

  const tris: number[] = []
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) tris.push(a, d, c, a, c, b)
    else tris.push(a, b, c, a, c, d)
  }
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = field[idx(i, j, k)] < 0
        // arista en X
        if (v0 !== field[idx(i + 1, j, k)] < 0)
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !v0)
        // arista en Y
        if (v0 !== field[idx(i, j + 1, k)] < 0)
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !v0)
        // arista en Z
        if (v0 !== field[idx(i, j, k + 1)] < 0)
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !v0)
      }

  const vcount = pos.length / 3
  const positions = new Float32Array(pos)
  const normals = new Float32Array(vcount * 3)

  // --- 3. Proyección sobre la superficie real y normales por gradiente ---
  const e = h * 0.25
  const grad = (x: number, y: number, z: number, out: Vec3) => {
    out[0] = evalFast(model, x + e, y, z) - evalFast(model, x - e, y, z)
    out[1] = evalFast(model, x, y + e, z) - evalFast(model, x, y - e, z)
    out[2] = evalFast(model, x, y, z + e) - evalFast(model, x, y, z - e)
    const l = Math.hypot(out[0], out[1], out[2]) || 1
    out[0] /= l; out[1] /= l; out[2] /= l
    return out
  }
  const g: Vec3 = [0, 0, 0]
  for (let v = 0; v < vcount; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2]
    // un paso de Newton con diferencias hacia delante (4 evaluaciones)
    const d = evalFast(model, x, y, z)
    let gx = evalFast(model, x + e, y, z) - d
    let gy = evalFast(model, x, y + e, z) - d
    let gz = evalFast(model, x, y, z + e) - d
    const gl = Math.hypot(gx, gy, gz) || 1
    gx /= gl; gy /= gl; gz /= gl
    const step = Math.max(-h, Math.min(h, d))
    x -= gx * step; y -= gy * step; z -= gz * step
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z
    grad(x, y, z, g)
    normals[v * 3] = g[0]; normals[v * 3 + 1] = g[1]; normals[v * 3 + 2] = g[2]
  }

  // --- 4. Pesos de skinning y máscaras de región ---
  const nb = BONES.length
  const boneDist = new Float64Array(nb)
  const skinIndex = new Uint16Array(vcount * 4)
  const skinWeight = new Float32Array(vcount * 4)
  const mask = new Float32Array(vcount * 4)
  const mask2 = new Float32Array(vcount * 4)
  const { prims, boneOf } = model
  const SOFT = 0.011
  const MSOFT = 0.006
  const order: number[] = BONES.map((_, i) => i)
  const ws = new Float64Array(nb)
  for (let v = 0; v < vcount; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2]
    boneDist.fill(1e9)
    let mSum = 0
    const mk = [0, 0, 0, 0, 0, 0, 0]
    let earSide = 0
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i]
      const raw = evalPrimitive(p, x, y, z)
      const d = p.op === 'add' ? raw : -raw
      if (p.op === 'add' && raw < boneDist[boneOf[i]]) boneDist[boneOf[i]] = raw
      // influencia de la máscara por cercanía a la superficie de cada pieza
      const w = Math.exp(-Math.max(0, Math.abs(d)) / MSOFT)
      if (w < 1e-4) continue
      mSum += w
      const m = p.masks
      if (m) {
        mk[0] += w * (m.dark ?? 0); mk[1] += w * (m.white ?? 0); mk[2] += w * (m.nose ?? 0)
        mk[3] += w * (m.nail ?? 0); mk[5] += w * (m.belly ?? 0); mk[6] += w * (m.mouth ?? 0)
      }
      if (p.kind === 'shell' && Math.abs(raw) < 0.006) earSide = p.center[0] > 0 ? 1 : -1
    }
    if (mSum > 0) for (let c = 0; c < 7; c++) mk[c] /= mSum
    // interior de la oreja: cara cóncava (normal hacia delante y hacia el centro)
    if (earSide !== 0) {
      const nxv = normals[v * 3], nzv = normals[v * 3 + 2]
      const facing = nzv * 0.85 - nxv * earSide * 0.5
      mk[4] = Math.max(0, Math.min(1, facing * 2.2))
    }
    mask.set([mk[0], mk[1], mk[2], mk[3]], v * 4)
    mask2.set([mk[4], mk[5], mk[6], 0], v * 4)

    // pesos: exp(-(d_b - d_min)/SOFT), 4 mayores
    let dmin = 1e9
    for (let b = 0; b < nb; b++) if (boneDist[b] < dmin) dmin = boneDist[b]
    for (let b = 0; b < nb; b++) ws[b] = boneDist[b] > 1e8 ? 0 : Math.exp(-(boneDist[b] - dmin) / SOFT)
    const sorted = order.sort((a, b) => ws[b] - ws[a]).slice(0, 4)
    let tot = 0
    for (const b of sorted) tot += ws[b]
    for (let c = 0; c < 4; c++) {
      const b = sorted[c]
      skinIndex[v * 4 + c] = b
      skinWeight[v * 4 + c] = tot > 0 ? ws[b] / tot : c === 0 ? 1 : 0
    }
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return {
    positions, normals, indices: new Uint32Array(tris), skinIndex, skinWeight, mask, mask2,
    vertexCount: vcount, triangleCount: tris.length / 3, millis: t1 - t0,
  }
}
