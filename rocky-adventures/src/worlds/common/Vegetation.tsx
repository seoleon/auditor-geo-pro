// Árboles procedurales (roble, abedul, pino, sauce, palmera), arbustos, flores y rocas.
// Geometría generada una vez por especie e instanciada; hojas con tarjetas alfa y normales
// esféricas (volumen suave), viento en copas y troncos con colisionadores cilíndricos.
import { useEffect, useMemo } from 'react'
import { RigidBody, CylinderCollider, ConvexHullCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../../utils/random'
import { barkTexture, flowerTexture, leafCardTexture, rockTexture } from './textures'
import { applyWind } from './Grass'
import { LOW_FX } from '../../utils/flags'

export type TreeKind = 'oak' | 'birch' | 'pine' | 'willow' | 'palm' | 'cypress'

export interface TreeInstance {
  x: number
  y: number
  z: number
  rot: number
  scale: number
  kind: TreeKind
}

interface TreeGeo {
  trunk: THREE.BufferGeometry
  leaves: THREE.BufferGeometry
  trunkRadius: number
}

// ----------------------------------------------------------------------------- generación
function branch(
  out: THREE.BufferGeometry[], tips: THREE.Vector3[], start: THREE.Vector3, dir: THREE.Vector3,
  len: number, r0: number, depth: number, rnd: () => number, kind: TreeKind,
) {
  const end = start.clone().addScaledVector(dir, len)
  const r1 = r0 * (depth === 0 ? 0.55 : 0.45)
  const geo = new THREE.CylinderGeometry(r1, r0, len, depth === 0 ? 10 : 6, depth === 0 ? 6 : 2, false)
  // pequeñas irregularidades en el tronco
  const p = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const wob = 1 + Math.sin(y * 7 + i) * 0.04
    p.setX(i, p.getX(i) * wob); p.setZ(i, p.getZ(i) * wob)
  }
  geo.translate(0, len / 2, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  geo.applyQuaternion(q)
  geo.translate(start.x, start.y, start.z)
  out.push(geo)
  if (depth >= (kind === 'oak' ? 2 : kind === 'willow' ? 2 : 1)) { tips.push(end); return }
  const n = kind === 'oak' ? 3 + Math.floor(rnd() * 2) : kind === 'willow' ? 4 : 3
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.8
    const spread = kind === 'birch' ? 0.45 : kind === 'willow' ? 0.9 : 0.75
    const nd = dir.clone().multiplyScalar(0.8)
      .add(new THREE.Vector3(Math.cos(a) * spread, 0.35 + rnd() * 0.3, Math.sin(a) * spread)).normalize()
    const from = start.clone().lerp(end, depth === 0 ? 0.6 + rnd() * 0.4 : 0.7 + rnd() * 0.3)
    branch(out, tips, from, nd, len * (0.55 + rnd() * 0.15), r1 * 0.9, depth + 1, rnd, kind)
  }
  if (depth > 0) tips.push(end)
}

/** Racimo de tarjetas de hojas alrededor de un punto con normales esféricas. */
function leafCluster(out: THREE.BufferGeometry[], c: THREE.Vector3, radius: number, cards: number, rnd: () => number, droop = 0, cardSize = 1.4, centerOfCanopy?: THREE.Vector3) {
  for (let i = 0; i < cards; i++) {
    const s = cardSize * (0.75 + rnd() * 0.5)
    const g = new THREE.PlaneGeometry(s, s * (droop > 0 ? 2.2 : 1))
    if (droop > 0) g.translate(0, -s * 0.9, 0)
    const e = new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI)
    if (droop > 0) e.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4)
    g.applyQuaternion(new THREE.Quaternion().setFromEuler(e))
    const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1)
    const rr = radius * Math.cbrt(rnd())
    const off = new THREE.Vector3(Math.sin(v) * Math.cos(u) * rr, Math.cos(v) * rr * 0.75, Math.sin(v) * Math.sin(u) * rr)
    g.translate(c.x + off.x, c.y + off.y, c.z + off.z)
    // normales esféricas desde el centro de la copa: iluminación volumétrica suave
    const cc = centerOfCanopy ?? c
    const pa = g.attributes.position as THREE.BufferAttribute
    const na = g.attributes.normal as THREE.BufferAttribute
    for (let k = 0; k < pa.count; k++) {
      const n = new THREE.Vector3(pa.getX(k) - cc.x, (pa.getY(k) - cc.y) * 1.3, pa.getZ(k) - cc.z).normalize()
      na.setXYZ(k, n.x, n.y, n.z)
    }
    out.push(g)
  }
}

const geoCache = new Map<string, TreeGeo>()

export function getTreeGeometry(kind: TreeKind, variant = 0): TreeGeo {
  const key = `${kind}-${variant}`
  const hit = geoCache.get(key)
  if (hit) return hit
  const rnd = mulberry32(1000 + variant * 31 + kind.length * 7)
  const trunks: THREE.BufferGeometry[] = []
  const leaves: THREE.BufferGeometry[] = []
  const tips: THREE.Vector3[] = []
  let trunkRadius = 0.3
  if (kind === 'palm') {
    // tronco curvado de palmera con anillos y abanico de frondas
    const segs = 9
    let p = new THREE.Vector3()
    const lean = new THREE.Vector3(0.18 + rnd() * 0.15, 1, 0).normalize()
    for (let i = 0; i < segs; i++) {
      const d = lean.clone().lerp(new THREE.Vector3(0, 1, 0), i / segs * 0.6).normalize()
      const g = new THREE.CylinderGeometry(0.17 - i * 0.008, 0.2 - i * 0.008, 0.85, 8, 1)
      g.translate(0, 0.42, 0)
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d))
      g.translate(p.x, p.y, p.z)
      trunks.push(g)
      p = p.clone().addScaledVector(d, 0.8)
    }
    trunkRadius = 0.2
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.3
      const g = new THREE.PlaneGeometry(1.4, 3.4, 1, 6)
      g.translate(0, 1.7, 0)
      const pa = g.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < pa.count; k++) {
        const y = pa.getY(k)
        pa.setZ(k, -Math.pow(y / 3.4, 2) * 1.5)
      }
      g.rotateX(Math.PI / 2 - 0.5 - rnd() * 0.3)
      g.rotateY(a)
      g.translate(p.x, p.y, p.z)
      const na = g.attributes.normal as THREE.BufferAttribute
      for (let k = 0; k < na.count; k++) na.setXYZ(k, Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4)
      leaves.push(g)
    }
  } else if (kind === 'pine' || kind === 'cypress') {
    const h = kind === 'pine' ? 7.5 + rnd() * 2 : 6 + rnd() * 1.5
    const g = new THREE.CylinderGeometry(0.12, 0.32, h, 8, 4)
    g.translate(0, h / 2, 0)
    trunks.push(g)
    trunkRadius = 0.32
    const layers = kind === 'pine' ? 8 : 10
    for (let i = 0; i < layers; i++) {
      const t = i / layers
      const y = 1.6 + t * (h - 1.4)
      const r = kind === 'pine' ? (1 - t) * 2.4 + 0.3 : (Math.sin((1 - t) * Math.PI * 0.9) * 0.9 + 0.25)
      leafCluster(leaves, new THREE.Vector3(0, y, 0), r, kind === 'pine' ? 13 : 10, rnd, 0, kind === 'pine' ? 1.8 : 1.35, new THREE.Vector3(0, h * 0.5, 0))
    }
  } else {
    const h = kind === 'birch' ? 3.2 : kind === 'willow' ? 2.4 : 2.6
    const r0 = kind === 'birch' ? 0.18 : kind === 'willow' ? 0.36 : 0.4
    trunkRadius = r0
    const dir = new THREE.Vector3((rnd() - 0.5) * 0.15, 1, (rnd() - 0.5) * 0.15).normalize()
    branch(trunks, tips, new THREE.Vector3(0, -0.3, 0), dir, h + 0.3, r0, 0, rnd, kind)
    // raíces visibles en la base
    if (kind !== 'birch') for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd()
      const g = new THREE.CylinderGeometry(0.03, r0 * 0.45, 1.1, 5)
      g.translate(0, 0.55, 0)
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize()))
      g.translate(Math.cos(a) * r0 * 0.4, 0.45, Math.sin(a) * r0 * 0.4)
      trunks.push(g)
    }
    const canopy = new THREE.Vector3()
    tips.forEach((t) => canopy.add(t))
    canopy.divideScalar(Math.max(1, tips.length))
    for (const t of tips) {
      if (kind === 'willow') leafCluster(leaves, t.clone().add(new THREE.Vector3(0, 0.6, 0)), 1.1, 10, rnd, 1, 1.0, canopy)
      else leafCluster(leaves, t, kind === 'birch' ? 1.2 : 1.65, kind === 'birch' ? 9 : 12, rnd, 0, kind === 'birch' ? 1.3 : 1.75, canopy)
    }
  }
  const trunk = mergeGeometries(trunks.map((g) => g.toNonIndexed()), false)!
  const leaf = mergeGeometries(leaves.map((g) => g.toNonIndexed()), false)!
  trunks.forEach((g) => g.dispose()); leaves.forEach((g) => g.dispose())
  trunk.computeVertexNormals()
  trunk.computeBoundingSphere(); leaf.computeBoundingSphere()
  const res = { trunk, leaves: leaf, trunkRadius }
  geoCache.set(key, res)
  return res
}

const LEAF_TINT: Record<TreeKind, string> = {
  oak: '#9fd06a', birch: '#c9e07a', pine: '#5f8f4a', willow: '#a9d470', palm: '#b5d36a', cypress: '#4f7a3e',
}
const BARK_TINT: Record<TreeKind, string> = {
  oak: '#c9b49a', birch: '#f4f1ea', pine: '#b59a80', willow: '#bba78f', palm: '#d6c09a', cypress: '#a68f78',
}

// ----------------------------------------------------------------------------- bosque instanciado
export function Forest({ trees, colliders = true, shadows = true }: { trees: TreeInstance[]; colliders?: boolean; shadows?: boolean }) {
  const groups = useMemo(() => {
    const byKind = new Map<string, TreeInstance[]>()
    trees.forEach((t, i) => {
      const k = `${t.kind}-${i % (t.kind === 'palm' ? 2 : 3)}`
      if (!byKind.has(k)) byKind.set(k, [])
      byKind.get(k)!.push(t)
    })
    const bark = barkTexture()
    const out: { trunk: THREE.InstancedMesh; leaves: THREE.InstancedMesh }[] = []
    byKind.forEach((list, key) => {
      const [kind, variant] = key.split('-') as [TreeKind, string]
      const g = getTreeGeometry(kind, Number(variant))
      const tm = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, color: BARK_TINT[kind], roughness: 0.9 })
      if (kind === 'birch') {
        // corteza de abedul: blanca con marcas oscuras horizontales
        tm.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor.rgb = mix(vec3(0.92, 0.9, 0.86), vec3(0.12), step(0.82, fract(vMapUv.y * 9.0 + sin(vMapUv.x * 20.0) * 0.1)) * step(0.4, fract(vMapUv.x * 3.0 + vMapUv.y)));`)
        }
      }
      const lm = new THREE.MeshStandardMaterial({
        map: leafCardTexture(kind === 'pine' || kind === 'cypress' ? 'needle' : kind === 'palm' ? 'palm' : 'broad'),
        color: LEAF_TINT[kind], alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75,
      })
      applyWind(lm, { strength: kind === 'palm' ? 0.35 : 0.22, push: false, heightVar: 'y' })
      applyWind(tm, { strength: 0.05, push: false, heightVar: 'y' })
      const trunk = new THREE.InstancedMesh(g.trunk, tm, list.length)
      const leaves = new THREE.InstancedMesh(g.leaves, lm, list.length)
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
      const col = new THREE.Color()
      const rnd = mulberry32(list.length * 17)
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot)
        s.setScalar(t.scale)
        p.set(t.x, t.y, t.z)
        m.compose(p, q, s)
        trunk.setMatrixAt(i, m)
        leaves.setMatrixAt(i, m)
        col.setHSL(0.25 + (rnd() - 0.5) * 0.06, 0.5, 0.45 + rnd() * 0.12)
        leaves.setColorAt(i, col.clone().lerp(new THREE.Color('#ffffff'), 0.55))
      })
      trunk.castShadow = shadows; trunk.receiveShadow = true
      leaves.castShadow = shadows; leaves.receiveShadow = true
      trunk.computeBoundingSphere(); leaves.computeBoundingSphere()
      out.push({ trunk, leaves })
    })
    return out
  }, [trees, shadows])

  useEffect(() => () => groups.forEach((g) => { g.trunk.dispose(); g.leaves.dispose() }), [groups])

  return (
    <>
      {!LOW_FX && groups.map((g, i) => (
        <group key={i}>
          <primitive object={g.trunk} />
          <primitive object={g.leaves} />
        </group>
      ))}
      {colliders && (
        <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}>
          {trees.map((t, i) => {
            const r = (t.kind === 'palm' ? 0.22 : getTreeGeometry(t.kind, 0).trunkRadius) * t.scale * 0.9
            return <CylinderCollider key={i} args={[2.2 * t.scale, r]} position={[t.x, t.y + 2.2 * t.scale - 0.3, t.z]} />
          })}
        </RigidBody>
      )}
    </>
  )
}

// ----------------------------------------------------------------------------- flores y arbustos
export interface ScatterItem { x: number; y: number; z: number; s: number; color?: string; rot?: number }

export function Flowers({ items }: { items: ScatterItem[] }) {
  const mesh = useMemo(() => {
    // dos quads cruzados por flor + tallo
    const petal = new THREE.PlaneGeometry(0.22, 0.22)
    petal.rotateX(-Math.PI / 2 + 0.35)
    petal.translate(0, 0.32, 0.02)
    const petal2 = petal.clone().rotateY(Math.PI * 0.66)
    const petal3 = petal.clone().rotateY(-Math.PI * 0.66)
    const geo = mergeGeometries([petal, petal2, petal3])!
    const mat = new THREE.MeshStandardMaterial({ map: flowerTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 })
    applyWind(mat, { strength: 0.25, push: true, heightVar: 'y' })
    const im = new THREE.InstancedMesh(geo, mat, items.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
    items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot ?? i * 2.39)
      s.setScalar(it.s)
      p.set(it.x, it.y, it.z)
      im.setMatrixAt(i, m.compose(p, q, s))
      im.setColorAt(i, new THREE.Color(it.color ?? '#ff6b9a'))
    })
    im.computeBoundingSphere()
    return im
  }, [items])
  const stems = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.008, 0.012, 0.32, 3)
    geo.translate(0, 0.16, 0)
    const mat = new THREE.MeshStandardMaterial({ color: '#3f7a2a', roughness: 0.8 })
    applyWind(mat, { strength: 0.25, push: true, heightVar: 'y' })
    const im = new THREE.InstancedMesh(geo, mat, items.length)
    const m = new THREE.Matrix4()
    items.forEach((it, i) => im.setMatrixAt(i, m.makeScale(it.s, it.s, it.s).setPosition(it.x, it.y, it.z)))
    im.computeBoundingSphere()
    return im
  }, [items])
  useEffect(() => () => { mesh.dispose(); stems.dispose() }, [mesh, stems])
  if (LOW_FX) return null
  return <><primitive object={mesh} /><primitive object={stems} /></>
}

export function Bushes({ items, tint = '#8cc860' }: { items: ScatterItem[]; tint?: string }) {
  const mesh = useMemo(() => {
    const rnd = mulberry32(77)
    const parts: THREE.BufferGeometry[] = []
    leafCluster(parts, new THREE.Vector3(0, 0.55, 0), 0.6, 14, rnd, 0, 0.9, new THREE.Vector3(0, 0.2, 0))
    const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()))!
    const mat = new THREE.MeshStandardMaterial({ map: leafCardTexture('broad'), color: tint, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 })
    applyWind(mat, { strength: 0.08, push: true, heightVar: 'y' })
    const im = new THREE.InstancedMesh(geo, mat, items.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
    items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot ?? i)
      s.set(it.s, it.s * 0.85, it.s)
      p.set(it.x, it.y, it.z)
      im.setMatrixAt(i, m.compose(p, q, s))
      if (it.color) im.setColorAt(i, new THREE.Color(it.color))
    })
    im.castShadow = true
    im.receiveShadow = true
    im.computeBoundingSphere()
    return im
  }, [items, tint])
  useEffect(() => () => mesh.dispose(), [mesh])
  if (LOW_FX) return null
  return <primitive object={mesh} />
}

// ----------------------------------------------------------------------------- rocas
const rockGeoCache = new Map<number, THREE.BufferGeometry>()
export function rockGeometry(variant: number) {
  const hit = rockGeoCache.get(variant)
  if (hit) return hit
  const geo = new THREE.IcosahedronGeometry(1, 3)
  const rnd = mulberry32(500 + variant)
  const pa = geo.attributes.position as THREE.BufferAttribute
  const blobs = Array.from({ length: 7 }, () => [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, 0.2 + rnd() * 0.35])
  const v = new THREE.Vector3()
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i)
    let d = 1
    for (const [bx, by, bz, a] of blobs) d += Math.max(0, v.x * bx + v.y * by + v.z * bz) * a * 0.35
    d += Math.sin(v.x * 7 + variant) * 0.03 + Math.sin(v.z * 9) * 0.03
    // facetas planas tipo roca tallada
    v.multiplyScalar(d)
    v.y *= 0.62
    pa.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  rockGeoCache.set(variant, geo)
  return geo
}

export interface RockItem { x: number; y: number; z: number; s: number; rot: number; variant: number; tint?: string; sy?: number }

export function Rocks({ items, colliders = true }: { items: RockItem[]; colliders?: boolean }) {
  const meshes = useMemo(() => {
    const tex = rockTexture()
    const out: THREE.InstancedMesh[] = []
    for (let v = 0; v < 3; v++) {
      const list = items.filter((r) => r.variant % 3 === v)
      if (!list.length) continue
      const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normal, roughness: 0.88, color: '#d8d2c8' })
      const im = new THREE.InstancedMesh(rockGeometry(v), mat, list.length)
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
      list.forEach((r, i) => {
        q.setFromEuler(new THREE.Euler(0, r.rot, 0))
        s.set(r.s, r.s * (r.sy ?? 1), r.s)
        p.set(r.x, r.y, r.z)
        im.setMatrixAt(i, m.compose(p, q, s))
        if (r.tint) im.setColorAt(i, new THREE.Color(r.tint))
      })
      im.castShadow = true
      im.receiveShadow = true
      im.computeBoundingSphere()
      out.push(im)
    }
    return out
  }, [items])
  const hulls = useMemo(() => {
    if (!colliders) return []
    return items.map((r) => {
      const g = rockGeometry(r.variant % 3)
      const pa = g.attributes.position as THREE.BufferAttribute
      const pts: number[] = []
      const v = new THREE.Vector3()
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.rot, 0))
      for (let i = 0; i < pa.count; i += 3) {
        v.fromBufferAttribute(pa, i)
        v.set(v.x * r.s, v.y * r.s * (r.sy ?? 1), v.z * r.s).applyQuaternion(q)
        pts.push(v.x, v.y, v.z)
      }
      return { pos: [r.x, r.y, r.z] as [number, number, number], pts: new Float32Array(pts) }
    })
  }, [items, colliders])
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes])
  return (
    <>
      {!LOW_FX && meshes.map((m, i) => <primitive key={i} object={m} />)}
      {colliders && (
        <RigidBody type="fixed" colliders={false} userData={{ surface: 'stone' }}>
          {hulls.map((h, i) => <ConvexHullCollider key={i} args={[h.pts]} position={h.pos} />)}
        </RigidBody>
      )}
    </>
  )
}
