// Mecánicas de juego reutilizables: checkpoints, plataformas móviles, cajas rompibles, enemigos
// caricaturescos originales, carteles, puerta final y utilidades de interacción.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGame } from '../stores/gameStore'
import { useLevel } from '../stores/levelStore'
import { runtime } from '../systems/runtime'
import { emit, on } from '../systems/events'
import { respawnPoints } from '../characters/Player'
import { particles } from '../components/Particles'
import { woodTexture } from '../worlds/common/textures'
import type { CheckpointDef, CrateDef, EnemyDef, PlatformDef, V3 } from './levelTypes'

// ----------------------------------------------------------------------------- utilidades
export function useInteractable(id: string, pos: THREE.Vector3, radius: number, label: string, enabled: () => boolean, onInteract: () => void) {
  const cb = useRef({ enabled, onInteract })
  cb.current = { enabled, onInteract }
  useEffect(() => {
    runtime.interactables.set(id, { id, pos, radius, label, enabled: () => cb.current.enabled(), onInteract: () => cb.current.onInteract() })
    return () => { runtime.interactables.delete(id) }
  }, [id, pos, radius, label])
}

const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2])

// ----------------------------------------------------------------------------- checkpoints
export function Checkpoints({ list, spawn, spawnYaw }: { list: CheckpointDef[]; spawn: THREE.Vector3; spawnYaw: number }) {
  const active = useGame((s) => s.save.worlds[s.world].checkpoint)
  useEffect(() => {
    respawnPoints.clear()
    respawnPoints.set('__spawn', { pos: spawn.clone(), yaw: spawnYaw })
    list.forEach((c) => respawnPoints.set(c.id, { pos: new THREE.Vector3(c.pos[0], c.pos[1] + 0.6, c.pos[2]), yaw: c.yaw }))
  }, [list, spawn, spawnYaw])
  return <>{list.map((c) => <CheckpointPost key={c.id} def={c} active={active === c.id} />)}</>
}

function CheckpointPost({ def, active }: { def: CheckpointDef; active: boolean }) {
  const lamp = useRef<THREE.Mesh>(null)
  const flag = useRef<THREE.Mesh>(null)
  const pos = useMemo(() => v3(def.pos), [def.pos])
  useFrame((_, dt) => {
    const p = runtime.player.pos
    if (!active && useGame.getState().screen === 'playing' && Math.hypot(p.x - pos.x, p.z - pos.z) < 1.7 && Math.abs(p.y - pos.y) < 2.5) {
      if (useGame.getState().reachCheckpoint(def.id)) emit({ type: 'checkpoint', x: pos.x, y: pos.y + 1.5, z: pos.z })
    }
    if (lamp.current) {
      const m = lamp.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = active ? 1.6 + Math.sin(runtime.time * 3) * 0.4 : 0.15
    }
    if (flag.current) flag.current.rotation.y = Math.sin(runtime.time * 2.2) * 0.25 + (active ? 0 : 0)
    if (flag.current) flag.current.scale.y += ((active ? 1 : 0.15) - flag.current.scale.y) * dt * 3
  })
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'stone' }}>
        <CuboidCollider args={[0.18, 0.9, 0.18]} position={[0, 0.9, 0]} />
      </RigidBody>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.5, 0.24, 16]} />
        <meshStandardMaterial color="#9a9184" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.26, 1.5, 0.26]} />
        <meshStandardMaterial color="#c9bfae" roughness={0.85} />
      </mesh>
      <mesh ref={lamp} position={[0, 1.9, 0]} castShadow>
        <dodecahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color={active ? '#8dffb0' : '#b8c4c9'} emissive={active ? '#2dff8a' : '#334'} emissiveIntensity={0.2} roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <coneGeometry args={[0.2, 0.25, 4]} />
        <meshStandardMaterial color="#7a5a3a" roughness={0.7} />
      </mesh>
      <mesh ref={flag} position={[0.32, 1.45, 0]} scale={[1, 0.15, 1]}>
        <planeGeometry args={[0.5, 0.36]} />
        <meshStandardMaterial color="#3ddc84" side={THREE.DoubleSide} emissive="#0a5" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// ----------------------------------------------------------------------------- plataformas móviles
export function MovingPlatform({ def }: { def: PlatformDef }) {
  const body = useRef<RapierRigidBody>(null)
  const from = useMemo(() => v3(def.from), [def.from])
  const to = useMemo(() => v3(def.to), [def.to])
  const cur = useMemo(() => from.clone(), [from])
  const vel = useMemo(() => new THREE.Vector3(), [])
  const t = useRef((def.phase ?? 0) * def.period)
  const wood = woodTexture()
  useBeforePhysicsStep((w) => {
    const b = body.current
    if (!b) return
    const dt = w.timestep
    t.current += dt
    const k = 0.5 - 0.5 * Math.cos((t.current / def.period) * Math.PI * 2)
    const nx = from.x + (to.x - from.x) * k, ny = from.y + (to.y - from.y) * k, nz = from.z + (to.z - from.z) * k
    vel.set((nx - cur.x) / dt, (ny - cur.y) / dt, (nz - cur.z) / dt)
    cur.set(nx, ny, nz)
    b.setNextKinematicTranslation(cur)
    runtime.platformVel.set(b.handle, vel)
  })
  useEffect(() => () => { if (body.current) runtime.platformVel.delete(body.current.handle) }, [])
  const [sx, sy, sz] = def.size
  const kind = def.kind ?? 'wood'
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={from} userData={{ surface: kind === 'lily' ? 'grass' : kind === 'stone' ? 'stone' : 'wood' }}>
      <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} />
      {kind === 'lily' ? (
        <group>
          <mesh receiveShadow castShadow scale={[sx / 2, 1, sz / 2]}>
            <cylinderGeometry args={[1, 1, sy, 24, 1, false, 0.3, Math.PI * 2 - 0.3]} />
            <meshStandardMaterial color="#4f9a3a" roughness={0.6} />
          </mesh>
          <mesh position={[sx * 0.2, sy / 2 + 0.08, 0]}>
            <sphereGeometry args={[0.16, 10, 8]} />
            <meshStandardMaterial color="#ff8fc8" emissive="#ff4fa0" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ) : kind === 'log' ? (
        <mesh rotation-z={Math.PI / 2} castShadow receiveShadow>
          <cylinderGeometry args={[sy / 2, sy / 2, sx, 14]} />
          <meshStandardMaterial color="#8a6040" roughness={0.9} />
        </mesh>
      ) : (
        <group>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[sx, sy, sz]} />
            <meshStandardMaterial map={wood.map} normalMap={wood.normal} color={kind === 'stone' ? '#b8b0a4' : '#e0c39a'} roughness={0.8} />
          </mesh>
          {/* cuerdas/soportes decorativos */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (sx / 2 - 0.12), -sy / 2 - 0.1, 0]}>
              <boxGeometry args={[0.12, 0.2, sz * 0.9]} />
              <meshStandardMaterial color="#6d4c33" />
            </mesh>
          ))}
        </group>
      )}
    </RigidBody>
  )
}

// ----------------------------------------------------------------------------- cajas rompibles
export function Crate({ def }: { def: CrateDef }) {
  const broken = useLevel((s) => s.broken.has(def.id))
  const pos = useMemo(() => v3(def.pos), [def.pos])
  const wood = woodTexture()
  const shake = useRef(0)
  const mesh = useRef<THREE.Group>(null)
  useEffect(() => {
    if (broken) return
    runtime.lookTargets.set('crate-' + def.id, pos)
    const off = on((e) => {
      if (e.type === 'bark' && Math.hypot(e.x - pos.x, e.z - pos.z) < 3 && Math.abs(e.y - pos.y) < 2) breakIt()
    })
    return () => { off(); runtime.lookTargets.delete('crate-' + def.id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broken])
  const breakIt = () => {
    if (useLevel.getState().broken.has(def.id)) return
    useLevel.getState().breakCrate(def.id)
    emit({ type: 'break', x: pos.x, y: pos.y + 0.5, z: pos.z })
  }
  useFrame((_, dt) => {
    if (broken) return
    const p = runtime.player
    // aplastar saltando encima
    if (Math.abs(p.pos.x - pos.x) < 0.75 && Math.abs(p.pos.z - pos.z) < 0.75 && p.pos.y - pos.y > 0.9 && p.pos.y - pos.y < 1.7 && p.vel.y < -2) {
      runtime.player.bounce = 7
      breakIt()
    }
    shake.current = Math.max(0, shake.current - dt)
    if (mesh.current) mesh.current.rotation.z = Math.sin(runtime.time * 40) * shake.current * 0.1
  })
  if (broken) return null
  return (
    <RigidBody type="fixed" colliders={false} position={pos} userData={{ surface: 'wood' }}>
      <CuboidCollider args={[0.5, 0.5, 0.5]} position={[0, 0.5, 0]} />
      {def.look === 'sandcastle' ? (
        <group ref={mesh} position={[0, 0, 0]}>
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow><cylinderGeometry args={[0.6, 0.7, 0.7, 12]} /><meshStandardMaterial color="#e8cf96" roughness={1} /></mesh>
          {[[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.2, 0.24, 1.1, 10]} /><meshStandardMaterial color="#e2c58a" roughness={1} /></mesh>
              <mesh position={[0, 1.2, 0]}><coneGeometry args={[0.24, 0.3, 10]} /><meshStandardMaterial color="#d8b97a" roughness={1} /></mesh>
            </group>
          ))}
          <mesh position={[0, 1.25, 0]}><cylinderGeometry args={[0.012, 0.012, 0.5, 4]} /><meshStandardMaterial color="#6d4c33" /></mesh>
          <mesh position={[0.1, 1.42, 0]}><planeGeometry args={[0.2, 0.13]} /><meshStandardMaterial color="#ff5a6a" side={THREE.DoubleSide} /></mesh>
        </group>
      ) : (
      <group ref={mesh} position={[0, 0.5, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial map={wood.map} normalMap={wood.normal} color="#d9a96a" roughness={0.85} />
        </mesh>
        {/* refuerzos en aspa */}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]} position={[Math.sin((i * Math.PI) / 2) * 0.51, 0, Math.cos((i * Math.PI) / 2) * 0.51]}>
            <boxGeometry args={[1.25, 0.1, 0.03]} />
            <meshStandardMaterial color="#7a4e2a" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 0.51, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.18, 0.26, 20]} />
          <meshStandardMaterial color="#ffcf4a" emissive="#ff9d00" emissiveIntensity={def.contains ? 0.5 : 0} side={THREE.DoubleSide} />
        </mesh>
      </group>
      )}
    </RigidBody>
  )
}

// ----------------------------------------------------------------------------- carteles
export function Signpost({ pos, rot = 0, text, title }: { pos: V3; rot?: number; text: string; title: string }) {
  const p = useMemo(() => v3(pos), [pos])
  useInteractable('sign-' + pos.join(','), p, 2, 'Leer cartel', () => true, () => useGame.getState().toast(`${title}: ${text}`, 'info'))
  const wood = woodTexture()
  return (
    <group position={p} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false}><CuboidCollider args={[0.06, 0.6, 0.06]} position={[0, 0.6, 0]} /></RigidBody>
      <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[0.1, 1.2, 0.1]} /><meshStandardMaterial color="#6d4c33" /></mesh>
      <mesh position={[0, 1.15, 0.02]} castShadow><boxGeometry args={[0.95, 0.5, 0.06]} /><meshStandardMaterial map={wood.map} color="#e6c79c" /></mesh>
      {/* huella dibujada */}
      <group position={[0, 1.15, 0.06]}>
        <mesh><circleGeometry args={[0.09, 16]} /><meshBasicMaterial color="#5b3a1e" /></mesh>
        {[[-0.11, 0.1], [-0.04, 0.15], [0.04, 0.15], [0.11, 0.1]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]}><circleGeometry args={[0.035, 12]} /><meshBasicMaterial color="#5b3a1e" /></mesh>
        ))}
      </group>
    </group>
  )
}

// ----------------------------------------------------------------------------- enemigos
function EnemyBody({ kind, stunned }: { kind: EnemyDef['kind']; stunned: boolean }) {
  const spikes = useMemo(() => {
    if (kind !== 'chestnut') return null
    const pts: THREE.Vector3[] = []
    const n = 46
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const a = i * 2.39996
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
    }
    return pts
  }, [kind])
  const eyes = (
    <group position={[0, kind === 'crab' ? 0.42 : 0.12, kind === 'crab' ? 0.18 : 0.36]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.13, 0, 0]}>
          <mesh><sphereGeometry args={[0.1, 14, 10]} /><meshStandardMaterial color="#fff" roughness={0.3} /></mesh>
          <mesh position={[0, -0.01, 0.075]}><sphereGeometry args={[0.045, 10, 8]} /><meshStandardMaterial color={stunned ? '#888' : '#111'} /></mesh>
          {/* ceja enfadada */}
          <mesh position={[0, 0.11, 0.05]} rotation-z={s * 0.5}><boxGeometry args={[0.16, 0.035, 0.04]} /><meshStandardMaterial color="#2a160a" /></mesh>
        </group>
      ))}
    </group>
  )
  if (kind === 'chestnut') return (
    <group>
      <mesh castShadow><sphereGeometry args={[0.4, 20, 16]} /><meshStandardMaterial color="#8a5a2b" roughness={0.75} /></mesh>
      {spikes!.map((p, i) => (
        <mesh key={i} position={p.clone().multiplyScalar(0.4)} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p)} castShadow>
          <coneGeometry args={[0.045, 0.24, 5]} />
          <meshStandardMaterial color="#b88a3e" roughness={0.6} />
        </mesh>
      ))}
      {eyes}
    </group>
  )
  if (kind === 'crab') return (
    <group>
      <mesh castShadow scale={[1, 0.55, 0.8]} position={[0, 0.25, 0]}><sphereGeometry args={[0.42, 20, 14]} /><meshStandardMaterial color="#e84a3a" roughness={0.45} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.5, 0.3, 0.25]} castShadow scale={[1, 0.7, 1]}><sphereGeometry args={[0.16, 12, 10]} /><meshStandardMaterial color="#ff6a50" /></mesh>
          <mesh position={[s * 0.62, 0.32, 0.36]} rotation-y={s * 0.6}><boxGeometry args={[0.06, 0.12, 0.2]} /><meshStandardMaterial color="#c43c2e" /></mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[s * 0.38, 0.1, -0.15 + k * 0.15]} rotation-z={s * 0.9}><cylinderGeometry args={[0.025, 0.02, 0.32, 5]} /><meshStandardMaterial color="#c43c2e" /></mesh>
          ))}
          <mesh position={[s * 0.13, 0.38, 0.18]}><cylinderGeometry args={[0.025, 0.025, 0.12, 5]} /><meshStandardMaterial color="#c43c2e" /></mesh>
        </group>
      ))}
      {eyes}
    </group>
  )
  // Escobot: robot escoba de la ciudad
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.32, 0.38, 0.5, 18]} /><meshStandardMaterial color="#5b7cfa" metalness={0.4} roughness={0.35} /></mesh>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.42, 0.42, 0.08, 18]} /><meshStandardMaterial color="#f2c14e" roughness={0.9} /></mesh>
      <mesh position={[0, 0.58, 0]}><sphereGeometry args={[0.3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#dfe6ff" metalness={0.2} roughness={0.2} /></mesh>
      <mesh position={[0, 0.38, 0.33]}><boxGeometry args={[0.36, 0.16, 0.04]} /><meshStandardMaterial color="#111" emissive={stunned ? '#888' : '#ff3355'} emissiveIntensity={1.2} /></mesh>
      <mesh position={[0, 0.95, 0]}><cylinderGeometry args={[0.015, 0.015, 0.3, 5]} /><meshStandardMaterial color="#999" /></mesh>
      <mesh position={[0, 1.12, 0]}><sphereGeometry args={[0.05, 8, 6]} /><meshStandardMaterial color="#ff3355" emissive="#ff3355" emissiveIntensity={1} /></mesh>
    </group>
  )
}

export function Enemy({ def }: { def: EnemyDef }) {
  const defeated = useLevel((s) => s.defeated.has(def.id))
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const path = useMemo(() => def.path.map(v3), [def.path])
  const st = useRef({ seg: 0, t: 0, dir: 1, pos: path[0].clone(), stun: 0, squash: 0, dying: 0, chase: 0, hop: 0 })
  const [stunned, setStunned] = useState(false)
  useEffect(() => on((e) => {
    if (e.type !== 'bark') return
    const s = st.current
    if (s.pos.distanceTo(new THREE.Vector3(e.x, e.y, e.z)) < 4.5) { s.stun = 3; setStunned(true) }
  }), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const g = group.current
    if (!g || defeated) return
    if (s.dying > 0) {
      s.dying += dt
      g.scale.set(1 + s.dying * 2, Math.max(0.05, 1 - s.dying * 4), 1 + s.dying * 2)
      if (s.dying > 0.35) useLevel.getState().defeat(def.id)
      return
    }
    if (useGame.getState().screen !== 'playing') return
    const p = runtime.player
    if (s.stun > 0) {
      s.stun -= dt
      if (s.stun <= 0) setStunned(false)
      if (Math.random() < dt * 8) particles.spawn({ x: s.pos.x + Math.cos(runtime.time * 6) * 0.4, y: s.pos.y + 1, z: s.pos.z + Math.sin(runtime.time * 6) * 0.4, vy: 0.2, max: 0.5, size: 0.12, r: 1, g: 1, b: 0.4 })
    } else {
      // patrulla entre puntos; persigue un poco si Rocky está cerca
      const dP = Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z)
      const chasing = dP < 5 && Math.abs(p.pos.y - s.pos.y) < 1.5
      if (chasing) {
        const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z
        const l = Math.hypot(dx, dz) || 1
        s.pos.x += (dx / l) * def.speed * 1.25 * dt
        s.pos.z += (dz / l) * def.speed * 1.25 * dt
        g.rotation.y = Math.atan2(dx, dz)
        // no alejarse demasiado del camino
        const home = path[s.seg]
        if (s.pos.distanceTo(home) > 9) s.pos.lerp(home, dt)
      } else {
        const a = path[s.seg], b = path[(s.seg + 1) % path.length]
        const len = a.distanceTo(b)
        s.t += (def.speed * dt) / Math.max(0.1, len)
        if (s.t >= 1) { s.t = 0; s.seg = (s.seg + 1) % path.length }
        const target = a.clone().lerp(b, s.t)
        const dx = target.x - s.pos.x, dz = target.z - s.pos.z
        s.pos.x += dx * Math.min(1, dt * 4); s.pos.z += dz * Math.min(1, dt * 4)
        s.pos.y = target.y
        if (Math.hypot(dx, dz) > 0.01) g.rotation.y = def.kind === 'crab' ? Math.atan2(dx, dz) + Math.PI / 2 : Math.atan2(dx, dz)
      }
      if (runtime.world) s.pos.y = Math.max(s.pos.y, runtime.world.heightAt(s.pos.x, s.pos.z))
    }
    // ---- contacto con Rocky ----
    const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z
    const horiz = Math.hypot(dx, dz)
    const above = p.pos.y - (s.pos.y + 0.4)
    if (horiz < 0.8 && above > 0.15 && above < 1.0 && p.vel.y < 0.5) {
      // pisotón
      s.dying = 0.001
      runtime.player.bounce = 8.5
      emit({ type: 'stomp', x: s.pos.x, y: s.pos.y + 0.5, z: s.pos.z })
      useGame.getState().enemyDefeated()
      enemyStomped(def)
    } else if (horiz < 0.75 && Math.abs(above) < 0.6 && s.stun <= 0 && p.invulnerable <= 0) {
      runtime.player.invulnerable = 1.6
      const l = horiz || 1
      runtime.player.impulse.set((dx / l) * 7, 4.5, (dz / l) * 7)
      runtime.camera.shake = 0.2
      useGame.getState().damage(1)
    }
    // posición publicada para pruebas automáticas y depuración
    ;((window as unknown as { __enemies?: Record<string, number[]> }).__enemies ??= {})[def.id] = [s.pos.x, s.pos.y, s.pos.z]
    // ---- animación ----
    s.hop += dt * (s.stun > 0 ? 2 : 9)
    g.position.copy(s.pos)
    if (body.current) {
      if (def.kind === 'chestnut') { body.current.position.y = 0.42 + Math.abs(Math.sin(s.hop)) * 0.12; body.current.rotation.x += dt * def.speed * (s.stun > 0 ? 0 : 2.5) }
      else if (def.kind === 'crab') { body.current.position.y = Math.abs(Math.sin(s.hop * 1.5)) * 0.05; body.current.rotation.z = Math.sin(s.hop) * 0.12 }
      else { body.current.position.y = Math.abs(Math.sin(s.hop * 0.8)) * 0.18; body.current.rotation.z = Math.sin(s.hop * 0.8) * 0.15 }
      if (s.stun > 0) body.current.rotation.y = Math.sin(runtime.time * 8) * 0.4
    }
  })
  if (defeated) return null
  return (
    <group ref={group} position={path[0]}>
      <group ref={body}>
        {def.kind === 'chestnut' ? <group rotation-y={0}><EnemyBody kind="chestnut" stunned={stunned} /></group> : <EnemyBody kind={def.kind} stunned={stunned} />}
      </group>
    </group>
  )
}

const stompListeners = new Set<(d: EnemyDef) => void>()
function enemyStomped(d: EnemyDef) { stompListeners.forEach((f) => f(d)) }
export function onEnemyStomped(f: (d: EnemyDef) => void) {
  stompListeners.add(f)
  return () => { stompListeners.delete(f) }
}

// ----------------------------------------------------------------------------- puerta / objetivo final
export function GoalGate({ pos, rot = 0, label, required, onOpen, style = 'paw' }: { pos: V3; rot?: number; label: string; required: number; onOpen?: () => void; style?: 'paw' | 'medal' | 'chest' }) {
  const p = useMemo(() => v3(pos), [pos])
  const bones = useGame((s) => s.save.worlds[s.world].bones.length)
  const [opening, setOpening] = useState(false)
  const doorL = useRef<THREE.Group>(null)
  const doorR = useRef<THREE.Group>(null)
  const lid = useRef<THREE.Group>(null)
  const prog = useRef(0)
  const center = useMemo(() => p.clone().add(new THREE.Vector3(0, 1, 0)), [p])
  useEffect(() => {
    runtime.lookTargets.set('goal', center)
    return () => { runtime.lookTargets.delete('goal') }
  }, [center])
  useInteractable('goal', center, 3.2, label, () => !opening && bones >= required, () => {
    setOpening(true)
    emit({ type: 'gate' })
    runtime.camera.shake = 0.25
    onOpen?.()
    setTimeout(() => useGame.getState().winWorld(), 2600)
  })
  // aviso si faltan huesos
  const warned = useRef(0)
  useFrame((_, dt) => {
    const d = runtime.player.pos.distanceTo(center)
    if (d < 3.2 && bones < required && runtime.time - warned.current > 6) {
      warned.current = runtime.time
      useGame.getState().toast(`Necesitas ${required} huesos dorados para abrir esto (tienes ${bones}).`, 'warning')
    }
    if (opening) prog.current = Math.min(1, prog.current + dt * 0.6)
    const k = prog.current
    if (doorL.current) doorL.current.rotation.y = -k * 1.6
    if (doorR.current) doorR.current.rotation.y = k * 1.6
    if (lid.current) lid.current.rotation.x = -k * 1.7
  })
  const goldMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#ffcb47', metalness: 1, roughness: 0.25, emissive: '#7a4a00', emissiveIntensity: 0.35 }), [])
  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8e0d0', roughness: 0.8 }), [])
  if (style === 'chest') {
    return (
      <group position={p} rotation-y={rot}>
        <RigidBody type="fixed" colliders={false}><CuboidCollider args={[0.9, 0.5, 0.6]} position={[0, 0.5, 0]} /></RigidBody>
        <mesh position={[0, 0.45, 0]} castShadow receiveShadow><boxGeometry args={[1.8, 0.9, 1.2]} /><meshStandardMaterial color="#7a4a24" roughness={0.8} /></mesh>
        {[-0.7, 0, 0.7].map((x) => <mesh key={x} position={[x, 0.45, 0]} material={goldMat}><boxGeometry args={[0.12, 0.95, 1.25]} /></mesh>)}
        <group ref={lid} position={[0, 0.9, -0.6]}>
          <mesh position={[0, 0.2, 0.6]} rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[0.6, 0.6, 1.8, 20, 1, false, 0, Math.PI]} /><meshStandardMaterial color="#8a5428" roughness={0.8} side={THREE.DoubleSide} /></mesh>
          <mesh position={[0, 0.1, 1.2]} material={goldMat}><boxGeometry args={[0.3, 0.3, 0.08]} /></mesh>
        </group>
        <pointLight position={[0, 1.2, 0]} color="#ffcf6a" intensity={opening ? 8 : 1.5} distance={6} />
      </group>
    )
  }
  if (style === 'medal') {
    return (
      <group position={p} rotation-y={rot}>
        <RigidBody type="fixed" colliders={false}><CuboidCollider args={[0.8, 0.6, 0.8]} position={[0, 0.6, 0]} /></RigidBody>
        <mesh position={[0, 0.6, 0]} material={stoneMat} castShadow receiveShadow><cylinderGeometry args={[0.8, 0.95, 1.2, 8]} /></mesh>
        <group position={[0, 1.9, 0]} rotation-y={runtime.time}>
          <mesh material={goldMat} castShadow><cylinderGeometry args={[0.5, 0.5, 0.1, 32]} /></mesh>
        </group>
        <mesh position={[0, 2.8, 0]}><torusGeometry args={[0.3, 0.06, 8, 20]} /><meshStandardMaterial color="#d33" /></mesh>
      </group>
    )
  }
  // Puerta de las Huellas: arco monumental con huella dorada
  return (
    <group position={p} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'stone' }}>
        <CuboidCollider args={[0.6, 2.6, 0.6]} position={[-2.4, 2.6, 0]} />
        <CuboidCollider args={[0.6, 2.6, 0.6]} position={[2.4, 2.6, 0]} />
        <CuboidCollider args={[3.0, 0.5, 0.7]} position={[0, 5.6, 0]} />
        {!opening && <CuboidCollider args={[1.8, 2.5, 0.15]} position={[0, 2.5, 0]} />}
      </RigidBody>
      {[-2.4, 2.4].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 2.6, 0]} material={stoneMat} castShadow receiveShadow><boxGeometry args={[1.2, 5.2, 1.2]} /></mesh>
          <mesh position={[0, 5.35, 0]} material={goldMat}><boxGeometry args={[1.35, 0.25, 1.35]} /></mesh>
          <mesh position={[0, 0.15, 0]} material={stoneMat}><boxGeometry args={[1.5, 0.3, 1.5]} /></mesh>
        </group>
      ))}
      <mesh position={[0, 5.7, 0]} material={stoneMat} castShadow><boxGeometry args={[6.2, 1, 1.4]} /></mesh>
      {/* huella gigante */}
      <group position={[0, 6.9, 0]}>
        <mesh material={goldMat} castShadow scale={[1, 0.85, 0.4]}><sphereGeometry args={[0.75, 24, 16]} /></mesh>
        {[[-0.95, 0.75], [-0.35, 1.15], [0.35, 1.15], [0.95, 0.75]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]} material={goldMat} scale={[1, 1.2, 0.5]}><sphereGeometry args={[0.32, 16, 12]} /></mesh>
        ))}
      </group>
      {/* hojas de la puerta */}
      {[[-1, doorL], [1, doorR]].map(([s, ref]) => (
        <group key={s as number} ref={ref as React.RefObject<THREE.Group>} position={[(s as number) * 1.8, 0, 0]}>
          <mesh position={[-(s as number) * 0.9, 2.5, 0]} castShadow>
            <boxGeometry args={[1.8, 5, 0.2]} />
            <meshPhysicalMaterial color="#3b6fd8" metalness={0.3} roughness={0.35} clearcoat={0.6} />
          </mesh>
          <mesh position={[-(s as number) * 0.9, 2.5, 0.12]} material={goldMat}><torusGeometry args={[0.5, 0.06, 8, 24]} /></mesh>
        </group>
      ))}
      {/* indicador de huesos encima de la puerta */}
      <group position={[0, 5.7, 0.72]}>
        {Array.from({ length: required }, (_, i) => (
          <mesh key={i} position={[(i - (required - 1) / 2) * 0.5, 0, 0]}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshStandardMaterial color={i < bones ? '#ffd23f' : '#555'} emissive={i < bones ? '#ff9d00' : '#000'} emissiveIntensity={i < bones ? 1.2 : 0} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
