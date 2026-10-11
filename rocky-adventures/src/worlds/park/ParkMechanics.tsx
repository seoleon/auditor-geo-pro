// Mecánicas propias del parque: ardillas traviesas, pelota y portería, campanas del jardín
// y la verja de seto que se abre al resolver el puzle.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGame } from '../../stores/gameStore'
import { useLevel } from '../../stores/levelStore'
import { runtime } from '../../systems/runtime'
import { emit, on } from '../../systems/events'
import { particles } from '../../components/Particles'
import type { V3 } from '../../gameplay/levelTypes'
import { Hedge } from '../common/Props'

// ----------------------------------------------------------------------------- ardilla
function SquirrelModel() {
  const fur = '#b8642c'
  return (
    <group scale={0.9}>
      <mesh position={[0, 0.2, 0]} scale={[0.75, 0.9, 1.1]} castShadow><sphereGeometry args={[0.15, 14, 10]} /><meshStandardMaterial color={fur} roughness={0.8} /></mesh>
      <mesh position={[0, 0.18, 0.08]} scale={[0.6, 0.7, 0.6]}><sphereGeometry args={[0.15, 12, 8]} /><meshStandardMaterial color="#f1d3a8" roughness={0.9} /></mesh>
      <mesh position={[0, 0.36, 0.12]} castShadow><sphereGeometry args={[0.1, 14, 10]} /><meshStandardMaterial color={fur} roughness={0.8} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.055, 0.46, 0.1]} rotation-z={s * -0.3}><coneGeometry args={[0.03, 0.08, 6]} /><meshStandardMaterial color={fur} /></mesh>
          <mesh position={[s * 0.045, 0.38, 0.2]}><sphereGeometry args={[0.022, 8, 6]} /><meshStandardMaterial color="#111" roughness={0.1} /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.34, 0.22]}><sphereGeometry args={[0.015, 6, 4]} /><meshStandardMaterial color="#331" /></mesh>
      {/* cola esponjosa en forma de S */}
      {Array.from({ length: 7 }, (_, i) => {
        const t = i / 6
        return <mesh key={i} position={[0, 0.15 + t * 0.42, -0.16 - Math.sin(t * Math.PI) * 0.16 + t * 0.06]} castShadow><sphereGeometry args={[0.07 + Math.sin(t * Math.PI) * 0.05, 10, 8]} /><meshStandardMaterial color={i % 2 ? '#c9743a' : fur} roughness={0.95} /></mesh>
      })}
      {/* bellota */}
      <mesh position={[0, 0.26, 0.24]}><sphereGeometry args={[0.035, 8, 6]} /><meshStandardMaterial color="#8a5a2b" /></mesh>
    </group>
  )
}

export function Squirrels({ list }: { list: { id: string; pos: V3; tree: V3 }[] }) {
  const done = useGame((s) => s.save.worlds[s.world].missions.includes('park-squirrels'))
  const [scared, setScared] = useState<Set<string>>(new Set())
  useEffect(() => {
    useGame.getState().setMissionProgress('park-squirrels', done ? 3 : scared.size)
  }, [scared, done])
  useEffect(() => on((e) => {
    if (e.type !== 'bark' || done) return
    for (const s of list) {
      if (Math.hypot(e.x - s.pos[0], e.z - s.pos[2]) < 7 && !scared.has(s.id)) {
        const n = new Set(scared).add(s.id)
        setScared(n)
        emit({ type: 'squirrel' })
        useGame.getState().toast(`¡Ardilla asustada! ${n.size}/3 — ha soltado las bellotas.`, 'info')
        if (n.size >= 3) useGame.getState().completeMission('park-squirrels')
      }
    }
  }), [list, scared, done])
  return <>{list.map((s) => <Squirrel key={s.id} pos={s.pos} tree={s.tree} fled={done || scared.has(s.id)} />)}</>
}

function Squirrel({ pos, tree, fled }: { pos: V3; tree: V3; fled: boolean }) {
  const g = useRef<THREE.Group>(null)
  const st = useRef({ t: 0, x: pos[0], y: pos[1], z: pos[2], phase: Math.random() * 10 })
  const look = useMemo(() => new THREE.Vector3(...pos), [pos])
  useEffect(() => {
    const key = 'sq-' + pos.join(',')
    if (!fled) runtime.lookTargets.set(key, look)
    return () => { runtime.lookTargets.delete(key) }
  }, [fled, look, pos])
  useFrame((_, dt) => {
    const o = g.current
    if (!o) return
    const s = st.current
    s.t += dt
    if (fled) {
      // corre hasta el árbol y trepa por el tronco
      const tx = tree[0] + 0.45, tz = tree[2]
      const d = Math.hypot(tx - s.x, tz - s.z)
      if (d > 0.2) {
        s.x += ((tx - s.x) / d) * Math.min(d, dt * 6)
        s.z += ((tz - s.z) / d) * Math.min(d, dt * 6)
        o.rotation.set(0, Math.atan2(tx - s.x, tz - s.z), 0)
        s.y = pos[1] + Math.abs(Math.sin(s.t * 18)) * 0.15
      } else {
        s.y = Math.min(tree[1] + 4.2, s.y + dt * 3)
        o.rotation.set(-Math.PI / 2, -Math.PI / 2, 0)
      }
    } else {
      // mordisquea y da saltitos
      s.y = pos[1] + Math.max(0, Math.sin(s.t * 2.2 + s.phase)) * 0.12
      o.rotation.y = Math.sin(s.t * 0.7 + s.phase) * 1.2
    }
    o.position.set(s.x, s.y, s.z)
    look.set(s.x, s.y + 0.3, s.z)
  })
  return <group ref={g} position={pos}><SquirrelModel /></group>
}

// ----------------------------------------------------------------------------- pelota y portería
export function BallGame({ start, goal }: { start: V3; goal: V3 }) {
  const body = useRef<RapierRigidBody>(null)
  const done = useGame((s) => s.save.worlds[s.world].missions.includes('park-ball'))
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 128
    const g2 = c.getContext('2d')!
    g2.fillStyle = '#e8343f'; g2.fillRect(0, 0, 256, 128)
    g2.fillStyle = '#ffffff'; g2.fillRect(0, 54, 256, 20)
    g2.fillStyle = '#ffd23f'
    for (let i = 0; i < 6; i++) { g2.beginPath(); g2.arc(20 + i * 44, 25, 9, 0, Math.PI * 2); g2.fill(); g2.beginPath(); g2.arc(42 + i * 44, 103, 9, 0, Math.PI * 2); g2.fill() }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const look = useMemo(() => new THREE.Vector3(...start), [start])
  useEffect(() => {
    runtime.lookTargets.set('ball', look)
    const off = on((e) => {
      const b = body.current
      if (e.type !== 'bark' || !b) return
      const p = b.translation()
      const dx = p.x - runtime.player.pos.x, dz = p.z - runtime.player.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 3.2) b.applyImpulse({ x: (dx / d) * 3.2, y: 1.6, z: (dz / d) * 3.2 }, true)
    })
    return () => { off(); runtime.lookTargets.delete('ball') }
  }, [look])
  // regate: si Rocky toca la pelota avanzando hacia ella, la pelota sale rodando por delante
  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b) return
    const p = b.translation()
    const pl = runtime.player
    const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z
    const d = Math.hypot(dx, dz)
    const sp = Math.hypot(pl.vel.x, pl.vel.z)
    if (d < 1.05 && sp > 0.5 && Math.abs(p.y - pl.pos.y) < 0.9) {
      const toward = (pl.vel.x * dx + pl.vel.z * dz) / (d * sp)
      if (toward > 0.35) {
        const v = b.linvel()
        const kick = sp * 1.35 + 0.6
        // mezcla de la dirección de Rocky y de la línea Rocky→pelota (golpeo natural)
        const ux = (pl.vel.x / sp) * 0.7 + (dx / d) * 0.3, uz = (pl.vel.z / sp) * 0.7 + (dz / d) * 0.3
        const ul = Math.hypot(ux, uz) || 1
        const tx = (ux / ul) * kick, tz = (uz / ul) * kick
        if (v.x * ux + v.z * uz < kick * 0.9) b.setLinvel({ x: tx, y: Math.max(v.y, 0.4), z: tz }, true)
      }
    }
  })

  useFrame(() => {
    const b = body.current
    if (!b) return
    const p = b.translation()
    look.set(p.x, p.y, p.z)
    // ¡gol!
    if (!done && p.x > goal[0] + 0.1 && p.x < goal[0] + 1.25 && Math.abs(p.z - goal[2]) < 1.5 && p.y < goal[1] + 1.8) {
      useGame.getState().completeMission('park-ball')
      emit({ type: 'stomp', x: p.x, y: p.y + 0.5, z: p.z })
      for (let i = 0; i < 50; i++) particles.spawn({ x: p.x, y: p.y + 0.5, z: p.z, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, max: 1.6, size: 0.18, r: [1, 1, 0.3][i % 3], g: [0.3, 0.85, 0.8][i % 3], b: [0.4, 0.2, 1][i % 3], grav: 6 })
    }
    // la pelota vuelve si se pierde
    if (p.y < -4 || Math.hypot(p.x - start[0], p.z - start[2]) > 45) {
      b.setTranslation({ x: start[0], y: start[1] + 1, z: start[2] }, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }
  })
  return (
    <RigidBody ref={body} colliders={false} position={start} ccd restitution={0.5} friction={0.9} linearDamping={0.7} angularDamping={1.1} canSleep={false}>
      <BallCollider args={[0.45]} density={0.35} />
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.45, 28, 20]} />
        <meshPhysicalMaterial map={tex} roughness={0.35} clearcoat={0.8} />
      </mesh>
    </RigidBody>
  )
}

// ----------------------------------------------------------------------------- campanas
const BELL_SIZES = [0.22, 0.3, 0.4]

export function Bells({ pos, offsets }: { pos: V3; offsets: number[] }) {
  const done = useGame((s) => s.save.worlds[s.world].missions.includes('park-bells'))
  const seq = useRef(0)
  const swings = useRef([0, 0, 0])
  const groups = useRef<(THREE.Group | null)[]>([])
  const centers = useMemo(() => offsets.map((o) => new THREE.Vector3(pos[0] + o, pos[1] + 1.9, pos[2])), [pos, offsets])
  useEffect(() => {
    if (done) useLevel.getState().setFlag('gardenOpen', true)
  }, [done])
  useEffect(() => on((e) => {
    if (e.type !== 'bark') return
    let best = -1, bd = 2.8
    centers.forEach((c, i) => {
      const d = Math.hypot(c.x - e.x, c.z - e.z)
      if (d < bd) { bd = d; best = i }
    })
    if (best < 0) return
    swings.current[best] = 1
    emit({ type: 'bell', note: best })
    if (done) return
    if (best === seq.current) {
      seq.current++
      if (seq.current >= 3) {
        useGame.getState().completeMission('park-bells')
        useLevel.getState().setFlag('gardenOpen', true)
        useGame.getState().toast('¡Se ha abierto la verja del jardín secreto!', 'secret')
      }
    } else {
      seq.current = best === 0 ? 1 : 0
      useGame.getState().toast('Mmm… el orden no era ese. Pista: de la más pequeña a la más grande.', 'warning')
    }
    useGame.getState().setMissionProgress('park-bells', seq.current)
  }), [centers, done])
  useFrame((_, dt) => {
    groups.current.forEach((g, i) => {
      if (!g) return
      swings.current[i] = Math.max(0, swings.current[i] - dt * 0.7)
      g.rotation.z = Math.sin(runtime.time * 9) * swings.current[i] * 0.5
    })
  })
  const gold = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#e8b04a', metalness: 1, roughness: 0.28, clearcoat: 0.4 }), [])
  const bellGeo = useMemo(() => BELL_SIZES.map((r) => {
    const pts = [[0, 0], [r * 0.25, 0.02], [r * 0.4, r * 0.3], [r * 0.55, r * 0.9], [r * 0.95, r * 1.35], [r, r * 1.45], [0, r * 1.45]].map(([x, y]) => new THREE.Vector2(x, -y))
    return new THREE.LatheGeometry(pts, 24)
  }), [])
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.08, 1.2, 0.08]} position={[offsets[0] - 0.7, 1.2, 0]} />
        <CuboidCollider args={[0.08, 1.2, 0.08]} position={[offsets[2] + 0.7, 1.2, 0]} />
      </RigidBody>
      {[offsets[0] - 0.7, offsets[2] + 0.7].map((x) => (
        <mesh key={x} position={[x, 1.25, 0]} castShadow><boxGeometry args={[0.16, 2.5, 0.16]} /><meshStandardMaterial color="#6d4c33" /></mesh>
      ))}
      <mesh position={[0, 2.45, 0]} castShadow><boxGeometry args={[offsets[2] - offsets[0] + 1.7, 0.14, 0.18]} /><meshStandardMaterial color="#6d4c33" /></mesh>
      {offsets.map((o, i) => (
        <group key={i} position={[o, 2.4, 0]} ref={(el) => { groups.current[i] = el }}>
          <mesh position={[0, -0.1, 0]}><cylinderGeometry args={[0.012, 0.012, 0.2, 4]} /><meshStandardMaterial color="#333" /></mesh>
          <mesh geometry={bellGeo[i]} material={gold} position={[0, -0.2, 0]} castShadow />
        </group>
      ))}
    </group>
  )
}

export function GardenGate({ at, from, to }: { at: V3; from: [number, number, number]; to: [number, number, number] }) {
  const open = useLevel((s) => !!s.flags.gardenOpen)
  const g = useRef<THREE.Group>(null)
  const k = useRef(0)
  useFrame((_, dt) => {
    if (!g.current) return
    k.current = Math.min(1, k.current + (open ? dt * 0.8 : 0))
    g.current.position.y = -k.current * 2.1
    g.current.visible = k.current < 0.99
  })
  return (
    <group>
      <group ref={g}>
        {!open && <Hedge from={from} to={to} height={1.9} thick={0.9} />}
        {open && k.current < 1 && <mesh position={[at[0], at[1] + 0.95, at[2]]}><boxGeometry args={[0.9, 1.9, Math.hypot(to[0] - from[0], to[2] - from[2])]} /><meshStandardMaterial color="#3f7f30" /></mesh>}
      </group>
      {/* arco floral sobre la verja */}
      <mesh position={[at[0], at[1] + 2.3, at[2]]} rotation-y={Math.PI / 2}>
        <torusGeometry args={[1.3, 0.12, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#5f9a3e" roughness={0.9} />
      </mesh>
    </group>
  )
}
