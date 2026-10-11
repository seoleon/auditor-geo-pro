// Elementos urbanos: edificios con fachadas por pisos, tiendas con toldo y letrero, coches,
// marquesina de autobús, bocas de riego, quiosco, maceteros, andamios y bandera de azotea.
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { facadeTexture, plasterTexture, woodTexture } from '../common/textures'
import { useInteractable } from '../../gameplay/Mechanics'
import { emit } from '../../systems/events'
import { particles } from '../../components/Particles'
import { runtime } from '../../systems/runtime'
import type { V3 } from '../../gameplay/levelTypes'

function signTexture(text: string, bg: string, fg = '#ffffff') {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128)
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116)
  g.font = '800 64px "Baloo 2", "Fredoka", sans-serif'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(text, 259, 70)
  g.fillStyle = fg; g.fillText(text, 256, 66)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface BuildingDef {
  id: string
  /** Centro de la base. */
  pos: V3
  size: V3
  wall: string
  trim: string
  roof?: string
  seed: number
  shop?: { name: string; color: string; face: 'n' | 's' | 'e' | 'w' }
  rooftop?: boolean
}

const FACE_ROT: Record<'n' | 's' | 'e' | 'w', number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }

export function Building({ def }: { def: BuildingDef }) {
  const [w, h, d] = def.size
  const { geo, mats } = useMemo(() => {
    const geo = new THREE.BoxGeometry(w, h, d)
    // UV por cara: la textura de fachada representa 2 ventanas x 1 piso (6 m x 3 m)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const faceW = [d, d, w, w, w, w]
    const faceH = [h, h, d, d, h, h]
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setXY(i, uv.getX(i) * faceW[f] / 6, uv.getY(i) * faceH[f] / 3)
    }
    const fac = facadeTexture(def.seed, def.wall, def.trim)
    const facade = new THREE.MeshStandardMaterial({ map: fac.map, normalMap: fac.normal, roughness: 0.85 })
    const pl = plasterTexture()
    const roof = new THREE.MeshStandardMaterial({ map: pl.map, color: def.roof ?? '#9a948a', roughness: 0.95 })
    return { geo, mats: [facade, facade, roof, roof, facade, facade] }
  }, [w, h, d, def.seed, def.wall, def.trim, def.roof])
  const sign = useMemo(() => (def.shop ? signTexture(def.shop.name, def.shop.color) : null), [def.shop])
  const [x, y, z] = def.pos
  const face = def.shop?.face ?? 's'
  const fw = face === 'e' || face === 'w' ? d : w
  const fd = face === 'e' || face === 'w' ? w : d
  return (
    <group position={[x, y, z]}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'stone' }}>
        <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
      </RigidBody>
      <mesh geometry={geo} material={mats} position={[0, h / 2, 0]} castShadow receiveShadow />
      {/* cornisa */}
      <mesh position={[0, h + 0.15, 0]} castShadow><boxGeometry args={[w + 0.4, 0.3, d + 0.4]} /><meshStandardMaterial color={def.trim} roughness={0.7} /></mesh>
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[w + 0.12, 1.0, d + 0.12]} /><meshStandardMaterial color="#6f655b" roughness={0.9} /></mesh>
      {/* azotea: pretil bajo, depósito de agua y chimeneas */}
      {def.rooftop !== false && (
        <group position={[0, h, 0]}>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[0.6, 0.6, 0.6]} position={[w / 2 - 1.2, 0.6, -d / 2 + 1.2]} />
          </RigidBody>
          <mesh position={[w / 2 - 1.2, 0.6, -d / 2 + 1.2]} castShadow><boxGeometry args={[1.2, 1.2, 1.2]} /><meshStandardMaterial color="#b9b2a6" /></mesh>
          <mesh position={[w / 2 - 1.2, 1.4, -d / 2 + 1.2]} castShadow><cylinderGeometry args={[0.6, 0.6, 0.6, 12]} /><meshStandardMaterial color="#7d5a3c" /></mesh>
          {[-1, 1].map((s) => <mesh key={s} position={[s * (w / 2 - 0.12), 0.12, 0]}><boxGeometry args={[0.24, 0.24, d]} /><meshStandardMaterial color={def.trim} /></mesh>)}
        </group>
      )}
      {def.shop && sign && (
        <group rotation-y={FACE_ROT[face]}>
          <group position={[0, 0, fd / 2]}>
            {/* escaparate */}
            <mesh position={[0, 1.7, 0.03]}><planeGeometry args={[Math.min(fw - 1, 7), 2.2]} /><meshPhysicalMaterial color="#9fd6ff" roughness={0.05} metalness={0.1} emissive="#ffe0a0" emissiveIntensity={0.25} /></mesh>
            <mesh position={[0, 3.35, 0.06]}><planeGeometry args={[Math.min(fw - 0.6, 6), 1.1]} /><meshStandardMaterial map={sign} emissive="#ffffff" emissiveMap={sign} emissiveIntensity={0.25} /></mesh>
            {/* toldo a rayas (plataforma saltable) */}
            <Awning width={Math.min(fw - 0.6, 6.5)} color={def.shop.color} />
          </group>
        </group>
      )}
    </group>
  )
}

export function Awning({ width, color, y = 2.55, depth = 1.6 }: { width: number; color: string; y?: number; depth?: number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 128; c.height = 16
    const g = c.getContext('2d')!
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : color; g.fillRect(i * 16, 0, 16, 16) }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = THREE.RepeatWrapping
    t.repeat.set(width / 2, 1)
    return t
  }, [color, width])
  return (
    <group position={[0, y, depth / 2]}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}>
        <CuboidCollider args={[width / 2, 0.08, depth / 2]} rotation={[0.18, 0, 0]} />
      </RigidBody>
      <mesh rotation-x={0.18 - Math.PI / 2} castShadow receiveShadow><planeGeometry args={[width, depth]} /><meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.8} /></mesh>
      <mesh position={[0, -0.17, depth / 2 - 0.02]}><boxGeometry args={[width, 0.25, 0.03]} /><meshStandardMaterial map={tex} /></mesh>
    </group>
  )
}

// ----------------------------------------------------------------------------- coche aparcado
export function Car({ pos, rot = 0, color }: { pos: V3; rot?: number; color: string }) {
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'stone' }}>
        <CuboidCollider args={[0.95, 0.55, 2.05]} position={[0, 0.75, 0]} />
        <CuboidCollider args={[0.85, 0.35, 1.1]} position={[0, 1.65, -0.15]} />
      </RigidBody>
      <RoundedBox args={[1.9, 0.85, 4.1]} radius={0.3} smoothness={3} position={[0, 0.75, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={color} metalness={0.35} roughness={0.3} clearcoat={1} clearcoatRoughness={0.1} />
      </RoundedBox>
      <RoundedBox args={[1.7, 0.75, 2.2]} radius={0.28} smoothness={3} position={[0, 1.5, -0.15]} castShadow>
        <meshPhysicalMaterial color="#cfe7ff" metalness={0.2} roughness={0.05} transmission={0} opacity={0.9} transparent />
      </RoundedBox>
      {[[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.35], [0.85, -1.35]].map(([x, z], i) => (
        <group key={i} position={[x, 0.38, z]} rotation-z={Math.PI / 2}>
          <mesh castShadow><cylinderGeometry args={[0.38, 0.38, 0.28, 18]} /><meshStandardMaterial color="#1b1b1e" roughness={0.8} /></mesh>
          <mesh position={[0, x > 0 ? 0.15 : -0.15, 0]}><cylinderGeometry args={[0.2, 0.2, 0.02, 14]} /><meshStandardMaterial color="#c9ccd2" metalness={1} roughness={0.25} /></mesh>
        </group>
      ))}
      {[-0.6, 0.6].map((x) => <mesh key={x} position={[x, 0.85, 2.06]}><sphereGeometry args={[0.13, 10, 8]} /><meshStandardMaterial color="#fff6d0" emissive="#ffe8a0" emissiveIntensity={0.6} /></mesh>)}
      {[-0.6, 0.6].map((x) => <mesh key={x} position={[x, 0.85, -2.06]}><boxGeometry args={[0.3, 0.12, 0.04]} /><meshStandardMaterial color="#ff3344" emissive="#ff2233" emissiveIntensity={0.5} /></mesh>)}
    </group>
  )
}

// ----------------------------------------------------------------------------- marquesina de autobús
export function BusStop({ pos, rot = 0 }: { pos: V3; rot?: number }) {
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1.8, 0.08, 0.8]} position={[0, 2.6, 0]} />
        <CuboidCollider args={[1.8, 1.2, 0.05]} position={[0, 1.25, -0.75]} />
        <CuboidCollider args={[0.05, 1.2, 0.8]} position={[-1.8, 1.25, 0]} />
        <CuboidCollider args={[1.1, 0.25, 0.25]} position={[0, 0.25, -0.45]} />
      </RigidBody>
      <mesh position={[0, 2.6, 0]} castShadow><boxGeometry args={[3.7, 0.16, 1.7]} /><meshStandardMaterial color="#2e7d5b" roughness={0.5} /></mesh>
      <mesh position={[0, 1.25, -0.75]}><boxGeometry args={[3.6, 2.4, 0.06]} /><meshPhysicalMaterial color="#bfe6ff" transparent opacity={0.35} roughness={0.05} /></mesh>
      <mesh position={[-1.8, 1.25, 0]}><boxGeometry args={[0.06, 2.4, 1.6]} /><meshPhysicalMaterial color="#bfe6ff" transparent opacity={0.35} roughness={0.05} /></mesh>
      {[-1.75, 1.75].map((x) => <mesh key={x} position={[x, 1.3, 0.75]}><cylinderGeometry args={[0.05, 0.05, 2.6, 8]} /><meshStandardMaterial color="#444" metalness={0.8} /></mesh>)}
      <mesh position={[0, 0.45, -0.45]}><boxGeometry args={[2.2, 0.1, 0.5]} /><meshStandardMaterial color="#8a5a3a" /></mesh>
    </group>
  )
}

// ----------------------------------------------------------------------------- boca de riego interactiva
export function Hydrant({ pos }: { pos: V3 }) {
  const p = useMemo(() => new THREE.Vector3(...pos), [pos])
  const spray = useRef(0)
  useInteractable('hydrant-' + pos.join(','), p, 1.6, 'Abrir la boca de riego', () => spray.current <= 0, () => {
    spray.current = 2.5
    emit({ type: 'splash', x: p.x, y: p.y + 0.8, z: p.z })
  })
  useFrame((_, dt) => {
    if (spray.current <= 0) return
    spray.current -= dt
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2
      particles.spawn({ x: p.x, y: p.y + 0.7, z: p.z, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, vy: 4 + Math.random() * 2, max: 1, size: 0.16, r: 0.7, g: 0.85, b: 1, grav: 9 })
    }
  })
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false}><CylinderCollider args={[0.4, 0.22]} position={[0, 0.4, 0]} /></RigidBody>
      <mesh position={[0, 0.35, 0]} castShadow><cylinderGeometry args={[0.18, 0.22, 0.7, 12]} /><meshStandardMaterial color="#e2342f" roughness={0.4} /></mesh>
      <mesh position={[0, 0.75, 0]} castShadow><sphereGeometry args={[0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#e2342f" roughness={0.4} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.22, 0.48, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.07, 0.07, 0.12, 8]} /><meshStandardMaterial color="#c9a227" metalness={0.8} /></mesh>)}
    </group>
  )
}

// ----------------------------------------------------------------------------- quiosco de prensa
export function Kiosk({ pos, rot = 0, onTake, taken }: { pos: V3; rot?: number; onTake: () => void; taken: boolean }) {
  const p = useMemo(() => new THREE.Vector3(pos[0], pos[1], pos[2]), [pos])
  const sign = useMemo(() => signTexture('PRENSA', '#2b5fae'), [])
  useInteractable('kiosk', p.clone().add(new THREE.Vector3(Math.sin(rot) * 2.0, 0, Math.cos(rot) * 2.0)), 2.2, 'Coger el periódico', () => !taken, onTake)
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false}><CuboidCollider args={[1.2, 1.3, 1.0]} position={[0, 1.3, 0]} /></RigidBody>
      <mesh position={[0, 1.2, 0]} castShadow><boxGeometry args={[2.4, 2.4, 2]} /><meshStandardMaterial color="#2e7d5b" roughness={0.5} /></mesh>
      <mesh position={[0, 2.65, 0]} castShadow><coneGeometry args={[1.9, 0.7, 4]} /><meshStandardMaterial color="#1f5a40" /></mesh>
      <mesh position={[0, 2.15, 1.02]}><planeGeometry args={[2.2, 0.5]} /><meshStandardMaterial map={sign} /></mesh>
      <mesh position={[0, 1.1, 1.02]}><planeGeometry args={[1.8, 1]} /><meshStandardMaterial color="#f4ecd8" /></mesh>
      {!taken && <mesh position={[0, 0.65, 1.2]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.08, 0.08, 0.5, 10]} /><meshStandardMaterial color="#f8f4ea" /></mesh>}
    </group>
  )
}

// ----------------------------------------------------------------------------- macetero con flores
export function Planter({ pos, size = [2, 0.6, 1] }: { pos: V3; size?: V3 }) {
  const wood = woodTexture()
  const flowers = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: (Math.random() - 0.5) * (size[0] - 0.3), z: (Math.random() - 0.5) * (size[2] - 0.3), c: ['#ff6b9a', '#ffd23f', '#ffffff', '#b388eb', '#ff4d6d'][i % 5] })), [size])
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}><CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={[0, size[1] / 2, 0]} /></RigidBody>
      <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial map={wood.map} color="#c98f5b" /></mesh>
      <mesh position={[0, size[1] + 0.02, 0]} rotation-x={-Math.PI / 2}><planeGeometry args={[size[0] - 0.1, size[2] - 0.1]} /><meshStandardMaterial color="#4a3020" /></mesh>
      {flowers.map((f, i) => <mesh key={i} position={[f.x, size[1] + 0.18, f.z]}><sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color={f.c} emissive={f.c} emissiveIntensity={0.1} /></mesh>)}
    </group>
  )
}

// ----------------------------------------------------------------------------- andamio de obra
export function Scaffold({ pos, levels = 3, w = 4, d = 2.2, step = 1.5, rot = 0 }: { pos: V3; levels?: number; w?: number; d?: number; step?: number; rot?: number }) {
  const wood = woodTexture()
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}>
        {Array.from({ length: levels }, (_, i) => <CuboidCollider key={i} args={[w / 2, 0.08, d / 2]} position={[i % 2 ? -0.8 : 0.8, (i + 1) * step, 0]} />)}
      </RigidBody>
      {Array.from({ length: levels }, (_, i) => (
        <group key={i} position={[i % 2 ? -0.8 : 0.8, (i + 1) * step, 0]}>
          <mesh castShadow receiveShadow><boxGeometry args={[w, 0.16, d]} /><meshStandardMaterial map={wood.map} color="#e3b37a" /></mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], k) => (
            <mesh key={k} position={[a * (w / 2 - 0.1), -step / 2, b * (d / 2 - 0.1)]}><cylinderGeometry args={[0.05, 0.05, step, 6]} /><meshStandardMaterial color="#f2c14e" metalness={0.6} roughness={0.4} /></mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ----------------------------------------------------------------------------- bandera de la azotea (misión)
export function RoofFlag({ pos, raised, onRaise }: { pos: V3; raised: boolean; onRaise: () => void }) {
  const p = useMemo(() => new THREE.Vector3(...pos), [pos])
  const flag = useRef<THREE.Mesh>(null)
  const [k, setK] = useState(raised ? 1 : 0)
  useInteractable('roof-flag', p, 2.4, 'Izar la bandera', () => !raised, onRaise)
  useFrame((_, dt) => {
    if (raised && k < 1) setK(Math.min(1, k + dt * 0.8))
    if (flag.current) flag.current.rotation.y = Math.sin(runtime.time * 3) * 0.2
  })
  return (
    <group position={pos}>
      <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[0.05, 0.06, 4, 8]} /><meshStandardMaterial color="#ddd" metalness={0.8} roughness={0.3} /></mesh>
      <mesh ref={flag} position={[0.6, 0.8 + k * 2.8, 0]}><planeGeometry args={[1.2, 0.75]} /><meshStandardMaterial color={raised ? '#ffcb3d' : '#9aa0a8'} side={THREE.DoubleSide} emissive={raised ? '#ff9d00' : '#000'} emissiveIntensity={0.4} /></mesh>
    </group>
  )
}
