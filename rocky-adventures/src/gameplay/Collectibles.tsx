// Coleccionables: huesos dorados, galletas especiales y conchas; agujeros para excavar
// (descubiertos con el olfato) y el sistema de rastro olfativo.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGame } from '../stores/gameStore'
import { useLevel } from '../stores/levelStore'
import { runtime } from '../systems/runtime'
import { emit, on } from '../systems/events'
import { celebrate } from '../characters/Player'
import { particles } from '../components/Particles'
import { softDotTexture } from '../worlds/common/textures'
import type { BoneDef, CookieDef, CrateDef } from './levelTypes'

// ----------------------------------------------------------------------------- geometrías y materiales compartidos
let shared: {
  bone: THREE.BufferGeometry; gold: THREE.Material
  cookie: THREE.BufferGeometry; cookieMat: THREE.Material
  shell: THREE.BufferGeometry; shellMat: THREE.Material
  glow: THREE.SpriteMaterial
} | null = null

function getShared() {
  if (shared) return shared
  const shaft = new THREE.CylinderGeometry(0.075, 0.075, 0.55, 16)
  shaft.rotateZ(Math.PI / 2)
  const knobs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
    const k = new THREE.SphereGeometry(0.1, 16, 12)
    k.translate(sx * 0.3, sz * 0.065, 0)
    return k
  }))
  const bone = mergeGeometries([shaft, ...knobs].map((g) => g.toNonIndexed()))!
  bone.computeVertexNormals()
  const gold = new THREE.MeshPhysicalMaterial({ color: '#ffc93c', metalness: 1, roughness: 0.18, clearcoat: 0.6, emissive: '#ff9d00', emissiveIntensity: 0.55 })
  // galleta para perro con huellas marcadas
  const disc = new THREE.CylinderGeometry(0.2, 0.2, 0.07, 28, 1)
  const pads = [[0, 0.03, 0.06], [-0.07, 0.03, -0.035], [0.07, 0.03, -0.035], [-0.03, 0.03, -0.085], [0.03, 0.03, -0.085]].map(([x, y, z], i) => {
    const g = new THREE.CylinderGeometry(i === 0 ? 0.055 : 0.026, i === 0 ? 0.055 : 0.026, 0.02, 14)
    g.translate(x, y + 0.01, z)
    return g
  })
  const cookie = mergeGeometries([disc, ...pads].map((g) => g.toNonIndexed()))!
  cookie.rotateX(Math.PI / 2)
  const cookieMat = new THREE.MeshStandardMaterial({ color: '#c98a4b', roughness: 0.7, emissive: '#5a2d00', emissiveIntensity: 0.25 })
  // concha de vieira con costillas radiales
  const fan = new THREE.CircleGeometry(0.22, 24, 0, Math.PI)
  const pa = fan.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i)
    const a = Math.atan2(y, x)
    pa.setZ(i, Math.abs(Math.sin(a * 9)) * 0.025 * Math.hypot(x, y) / 0.22 + Math.hypot(x, y) * 0.15)
  }
  fan.computeVertexNormals()
  const shellMat = new THREE.MeshPhysicalMaterial({ color: '#ffc8d2', roughness: 0.35, clearcoat: 1, iridescence: 0.6, side: THREE.DoubleSide, emissive: '#552030', emissiveIntensity: 0.3 })
  const glow = new THREE.SpriteMaterial({ map: softDotTexture(), color: '#ffd76a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 })
  shared = { bone, gold, cookie, cookieMat, shell: fan, shellMat, glow }
  return shared
}

// ----------------------------------------------------------------------------- un premio flotante
function Pickup({ id, pos, kind, onCollect }: { id: string; pos: THREE.Vector3; kind: 'bone' | 'cookie' | 'shell'; onCollect: () => void }) {
  const g = useRef<THREE.Group>(null)
  const done = useRef(false)
  const pop = useRef(0)
  const sh = getShared()
  useEffect(() => {
    if (kind === 'bone') runtime.lookTargets.set('pk-' + id, pos)
    return () => { runtime.lookTargets.delete('pk-' + id) }
  }, [id, pos, kind])
  useFrame((_, dt) => {
    const o = g.current
    if (!o || done.current) return
    const t = runtime.time
    pop.current = Math.min(1, pop.current + dt * 3)
    o.position.set(pos.x, pos.y + Math.sin(t * 2 + pos.x) * 0.12, pos.z)
    o.rotation.y += dt * (kind === 'bone' ? 1.6 : 2.2)
    o.scale.setScalar(pop.current * (kind === 'bone' ? 1.25 : 1))
    if (Math.random() < dt * 4) particles.spawn({ x: pos.x + (Math.random() - 0.5) * 0.6, y: pos.y + (Math.random() - 0.3) * 0.5, z: pos.z + (Math.random() - 0.5) * 0.6, vy: 0.4, max: 0.9, size: 0.08, r: 1, g: kind === 'shell' ? 0.85 : 0.8, b: kind === 'shell' ? 0.95 : 0.3, drag: 0.5 })
    const p = runtime.player.pos
    const d = Math.hypot(p.x - pos.x, (p.y - pos.y) * 0.8, p.z - pos.z)
    if (d < (kind === 'bone' ? 1.05 : 0.95) && useGame.getState().screen === 'playing') {
      done.current = true
      o.visible = false
      emit({ type: 'collect', kind, x: pos.x, y: pos.y, z: pos.z })
      onCollect()
    }
  })
  return (
    <group ref={g} position={pos}>
      <mesh geometry={kind === 'bone' ? sh.bone : kind === 'cookie' ? sh.cookie : sh.shell} material={kind === 'bone' ? sh.gold : kind === 'cookie' ? sh.cookieMat : sh.shellMat} castShadow rotation={kind === 'shell' ? [-0.3, 0, 0] : [0, 0, 0.25]} />
      <sprite material={sh.glow} scale={kind === 'bone' ? 1.5 : 0.9} />
    </group>
  )
}

// ----------------------------------------------------------------------------- montículo para excavar
function DigSpot({ id, pos, onDug }: { id: string; pos: THREE.Vector3; onDug: () => void }) {
  const revealed = useLevel((s) => s.revealed.has(id))
  const dug = useLevel((s) => s.dug.has(id))
  const mound = useRef<THREE.Mesh>(null)
  useEffect(() => {
    runtime.scents.set(id, { id, pos, active: () => !useLevel.getState().dug.has(id) })
    runtime.interactables.set(id, {
      id, pos, radius: 1.6, label: 'Excavar',
      enabled: () => useLevel.getState().revealed.has(id) && !useLevel.getState().dug.has(id),
      onInteract: () => {
        useLevel.getState().dig(id)
        emit({ type: 'dig', x: pos.x, y: pos.y, z: pos.z })
        onDug()
      },
    })
    return () => { runtime.scents.delete(id); runtime.interactables.delete(id) }
  }, [id, pos, onDug])
  useFrame(() => {
    const m = mound.current
    if (!m) return
    const mat = m.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = revealed && !dug ? 0.35 + Math.sin(runtime.time * 5) * 0.25 : 0
  })
  if (dug) return (
    <mesh position={[pos.x, pos.y + 0.02, pos.z]} rotation-x={-Math.PI / 2}>
      <circleGeometry args={[0.45, 16]} />
      <meshStandardMaterial color="#3b2a1a" roughness={1} />
    </mesh>
  )
  return (
    <mesh ref={mound} position={[pos.x, pos.y - 0.05, pos.z]} scale={[1, 0.35, 1]} receiveShadow>
      <sphereGeometry args={[0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#6b4f33" roughness={1} emissive="#ffb000" emissiveIntensity={0} />
    </mesh>
  )
}

// ----------------------------------------------------------------------------- conjunto de premios del nivel
export function Collectibles({ bones, cookies, crates = [], cookieKind = 'cookie' }: { bones: BoneDef[]; cookies: CookieDef[]; crates?: CrateDef[]; cookieKind?: 'cookie' | 'shell' }) {
  const world = useGame((s) => s.world)
  const progress = useGame((s) => s.save.worlds[s.world])
  const dug = useLevel((s) => s.dug)
  const broken = useLevel((s) => s.broken)
  const crateOf = useMemo(() => new Map(crates.filter((c) => c.contains).map((c) => [c.contains!.id, c.id])), [crates])
  const vecs = useMemo(() => new Map([...bones, ...cookies].map((b) => [b.id, new THREE.Vector3(...b.pos)])), [bones, cookies])

  const visibleNow = (item: BoneDef | CookieDef) => {
    if (item.mode === 'buried') return dug.has('dig-' + item.id)
    if (item.mode === 'reward') return !!item.mission && progress.missions.includes(item.mission)
    const crate = crateOf.get(item.id)
    return crate ? broken.has(crate) : true
  }

  return (
    <>
      {bones.map((b) => {
        if (progress.bones.includes(b.id)) return null
        const v = vecs.get(b.id)!
        return (
          <group key={b.id + world}>
            {b.mode === 'buried' && <DigSpot id={'dig-' + b.id} pos={new THREE.Vector3(v.x, v.y - 0.55, v.z)} onDug={() => {}} />}
            {visibleNow(b) && <Pickup id={b.id} pos={v} kind="bone" onCollect={() => { if (useGame.getState().collectBone(b.id)) celebrate() }} />}
          </group>
        )
      })}
      {cookies.map((c) => {
        if (progress.cookies.includes(c.id)) return null
        const v = vecs.get(c.id)!
        return (
          <group key={c.id + world}>
            {c.mode === 'buried' && <DigSpot id={'dig-' + c.id} pos={new THREE.Vector3(v.x, v.y - 0.45, v.z)} onDug={() => {}} />}
            {visibleNow(c) && <Pickup id={c.id} pos={v} kind={cookieKind} onCollect={() => useGame.getState().collectCookie(c.id)} />}
          </group>
        )
      })}
    </>
  )
}

// ----------------------------------------------------------------------------- olfato: rastro hacia la pista más cercana
export function ScentSystem() {
  useEffect(() => on((e) => {
    if (e.type !== 'sniff') return
    let best: { pos: THREE.Vector3; id: string } | null = null
    let bd = 24
    runtime.scents.forEach((s) => {
      if (!s.active()) return
      const d = s.pos.distanceTo(runtime.player.pos)
      if (d < bd) { bd = d; best = s }
    })
    // pista para premios visibles cercanos que el jugador aún no ve
    if (!best) {
      runtime.lookTargets.forEach((p, id) => {
        if (!id.startsWith('pk-')) return
        const d = p.distanceTo(runtime.player.pos)
        if (d < bd) { bd = d; best = { pos: p, id } }
      })
    }
    if (!best) return
    const target = (best as { pos: THREE.Vector3; id: string })
    if (bd < 6 && target.id.startsWith('dig-')) {
      if (!useLevel.getState().revealed.has(target.id)) {
        useLevel.getState().reveal(target.id)
        useGame.getState().toast('¡Rocky ha olido algo enterrado! Pulsa E para excavar.', 'secret')
        emit({ type: 'secret' })
      }
    }
    // partículas doradas que flotan desde la nariz hacia la pista
    const from = new THREE.Vector3(e.x, e.y, e.z)
    const dir = target.pos.clone().sub(from)
    const len = Math.min(dir.length(), 9)
    dir.normalize()
    for (let i = 0; i < 18; i++) {
      const k = (i / 18) * len
      particles.spawn({
        x: from.x + dir.x * k + (Math.random() - 0.5) * 0.3,
        y: from.y + 0.15 + Math.sin(k * 1.5) * 0.25 + Math.random() * 0.1,
        z: from.z + dir.z * k + (Math.random() - 0.5) * 0.3,
        vx: dir.x * 0.6, vz: dir.z * 0.6, vy: 0.15,
        max: 0.9 + (i / 18) * 0.9, size: 0.13, r: 1, g: 0.85, b: 0.35, drag: 0.3,
      })
    }
  }), [])
  return null
}
