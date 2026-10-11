// Elementos de la playa: muelle, barcas, barco naufragado, faro con rampa en espiral,
// sombrillas, cristales de la cueva.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { woodTexture, plasterTexture } from '../common/textures'
import { Ramp } from '../common/Props'
import { useInteractable } from '../../gameplay/Mechanics'
import { runtime } from '../../systems/runtime'
import type { V3 } from '../../gameplay/levelTypes'

const useWoodMat = (color = '#c9a273') => {
  const t = woodTexture()
  return useMemo(() => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color, roughness: 0.85 }), [t, color])
}

export function Pier({ from, to, width = 3 }: { from: V3; to: V3; width?: number }) {
  const wood = useWoodMat('#d8b48a')
  const len = Math.hypot(to[0] - from[0], to[2] - from[2])
  const posts = Math.floor(len / 3)
  return (
    <group>
      <Ramp from={from} to={to} width={width} rails={false} />
      {Array.from({ length: posts + 1 }, (_, i) => {
        const t = i / posts
        const x = from[0] + (to[0] - from[0]) * t, z = from[2] + (to[2] - from[2]) * t
        return [-1, 1].map((s) => (
          <mesh key={`${i}${s}`} position={[x + s * (width / 2 - 0.1), from[1] - 1.8, z]} material={wood} castShadow>
            <cylinderGeometry args={[0.13, 0.15, 3.6, 8]} />
          </mesh>
        ))
      })}
    </group>
  )
}

export function Boat({ pos, rot = 0, color = '#3f8fd6' }: { pos: V3; rot?: number; color?: string }) {
  const g = useRef<THREE.Group>(null)
  const wood = useWoodMat('#e9c79c')
  const phase = useMemo(() => Math.random() * 10, [])
  useFrame(() => {
    if (!g.current) return
    const t = runtime.time
    g.current.position.y = pos[1] + Math.sin(t * 1.2 + phase) * 0.06
    g.current.rotation.z = Math.sin(t * 0.9 + phase) * 0.04
  })
  const hull = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-0.8, 0); shape.quadraticCurveTo(-0.95, 1.6, 0, 2.4); shape.quadraticCurveTo(0.95, 1.6, 0.8, 0)
    shape.quadraticCurveTo(0.7, -1.6, 0, -1.9); shape.quadraticCurveTo(-0.7, -1.6, -0.8, 0)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 })
    geo.rotateX(Math.PI / 2)
    geo.translate(0, 0.3, 0)
    return geo
  }, [])
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}><CuboidCollider args={[0.8, 0.3, 1.9]} position={[0, 0.0, 0.2]} /></RigidBody>
      <group ref={g}>
        <mesh geometry={hull} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.5} /></mesh>
        <mesh position={[0, 0.32, 0.2]} material={wood}><boxGeometry args={[1.3, 0.05, 3.2]} /></mesh>
        <mesh position={[0, 0.5, 0.4]} material={wood}><boxGeometry args={[1.4, 0.08, 0.35]} /></mesh>
        <mesh position={[0.5, 0.6, 0]} rotation-z={0.5} material={wood}><cylinderGeometry args={[0.03, 0.03, 2, 6]} /></mesh>
      </group>
    </group>
  )
}

/** Barco naufragado: casco escorado con brecha lateral, bodega, cubierta y mástil con cofa. */
export function Shipwreck({ pos, rot }: { pos: V3; rot: number }) {
  const wood = useWoodMat('#8a6040')
  const dark = useWoodMat('#5e3f28')
  const sail = useMemo(() => new THREE.MeshStandardMaterial({ color: '#efe4cc', side: THREE.DoubleSide, roughness: 0.9 }), [])
  const holdY = 0.45, deckY = 2.4, nestY = 6.4
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}>
        {/* suelo de la bodega */}
        <CuboidCollider args={[2.2, 0.15, 6]} position={[0, holdY - 0.15, 0]} />
        {/* costados (el de babor tiene una brecha para entrar) */}
        <CuboidCollider args={[0.2, 1.6, 6]} position={[2.4, 1.4, 0]} />
        <CuboidCollider args={[0.2, 1.6, 2.2]} position={[-2.4, 1.4, 3.8]} />
        <CuboidCollider args={[0.2, 1.6, 2.2]} position={[-2.4, 1.4, -3.8]} />
        <CuboidCollider args={[0.2, 0.5, 1.6]} position={[-2.4, 2.5, 0]} />
        <CuboidCollider args={[2.4, 1.6, 0.2]} position={[0, 1.4, 6.1]} />
        <CuboidCollider args={[2.4, 1.6, 0.2]} position={[0, 1.4, -6.1]} />
        {/* cubierta (popa y proa), el centro queda abierto sobre la bodega */}
        <CuboidCollider args={[2.3, 0.12, 2]} position={[0, deckY, 4]} />
        <CuboidCollider args={[2.3, 0.12, 2]} position={[0, deckY, -4]} />
        {/* mástil y cofa */}
        <CylinderCollider args={[2.5, 0.18]} position={[0, deckY + 2.5, -3.2]} />
        <CylinderCollider args={[0.1, 1.1]} position={[0, nestY - 0.1, -3.2]} />
      </RigidBody>
      <mesh position={[0, holdY - 0.15, 0]} material={dark} receiveShadow><boxGeometry args={[4.4, 0.3, 12]} /></mesh>
      <mesh position={[2.4, 1.4, 0]} material={wood} castShadow receiveShadow><boxGeometry args={[0.4, 3.2, 12]} /></mesh>
      {[3.8, -3.8].map((z) => <mesh key={z} position={[-2.4, 1.4, z]} material={wood} castShadow><boxGeometry args={[0.4, 3.2, 4.4]} /></mesh>)}
      <mesh position={[-2.4, 2.5, 0]} material={wood}><boxGeometry args={[0.4, 1, 3.2]} /></mesh>
      {[6.1, -6.1].map((z) => <mesh key={z} position={[0, 1.4, z]} material={wood} castShadow><boxGeometry args={[4.8, 3.2, 0.4]} /></mesh>)}
      {/* proa puntiaguda */}
      <mesh position={[0, 1.6, 7.4]} rotation-y={Math.PI / 4} material={wood} castShadow><boxGeometry args={[3.4, 2.8, 3.4]} /></mesh>
      {[4, -4].map((z) => <mesh key={z} position={[0, deckY, z]} material={wood} receiveShadow castShadow><boxGeometry args={[4.6, 0.24, 4]} /></mesh>)}
      <mesh position={[0, deckY + 2.5, -3.2]} material={dark} castShadow><cylinderGeometry args={[0.16, 0.2, 5.2, 10]} /></mesh>
      <mesh position={[0, nestY - 0.1, -3.2]} material={dark} castShadow receiveShadow><cylinderGeometry args={[1.1, 0.9, 0.2, 16]} /></mesh>
      <mesh position={[0, nestY + 0.3, -3.2]}><cylinderGeometry args={[1.1, 1.1, 0.6, 16, 1, true]} /><meshStandardMaterial color="#6e4a2e" side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, deckY + 3.4, -2.6]} rotation-x={0.12} material={sail}><planeGeometry args={[3.2, 2.6, 6, 6]} /></mesh>
      {/* bandera pirata bulldog */}
      <mesh position={[0.5, nestY + 1.5, -3.2]}><planeGeometry args={[1, 0.6]} /><meshStandardMaterial color="#1a1a1a" side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, nestY + 1.0, -3.2]} material={dark}><cylinderGeometry args={[0.04, 0.04, 2, 6]} /></mesh>
      {/* pasarela desde la arena y escala de cuerda hasta la cofa */}
      <Ramp from={[3.8, -0.1, 5.5]} to={[2.0, deckY + 0.12, 4.4]} width={1.4} rails={false} />
      <Ramp from={[0, deckY + 0.12, -0.8]} to={[0, nestY + 0.02, -2.2]} width={1.0} rails={false} />
      <Ramp from={[-0.2, holdY, -1.2]} to={[-0.2, deckY + 0.12, -2.6]} width={1.2} rails={false} />
    </group>
  )
}

/** Faro con rampa exterior en espiral y linterna que se enciende. */
export function Lighthouse({ x, z, base, height, lit, onLight }: { x: number; z: number; base: number; height: number; lit: boolean; onLight: () => void }) {
  const plaster = plasterTexture()
  const beam = useRef<THREE.Group>(null)
  const segs = 8
  const R = 3.4
  const rise = height / segs
  const ramps = useMemo(() => Array.from({ length: segs }, (_, i) => {
    const a0 = i * (Math.PI / 2), a1 = (i + 1) * (Math.PI / 2)
    return {
      from: [x + Math.cos(a0) * R, base + i * rise + 0.02, z + Math.sin(a0) * R] as V3,
      to: [x + Math.cos(a1) * R, base + (i + 1) * rise + 0.02, z + Math.sin(a1) * R] as V3,
    }
  }), [x, z, base, rise])
  const top = useMemo(() => new THREE.Vector3(x + R, base + height + 0.5, z), [x, z, base, height])
  useInteractable('lighthouse', top, 3, 'Encender el faro', () => !lit, onLight)
  const stripes = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: plaster.map, roughness: 0.6 })
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.85, 0.12, 0.12), step(0.5, fract(vMapUv.y * 4.0)));`)
    }
    return m
  }, [plaster])
  useFrame((_, dt) => { if (beam.current && lit) beam.current.rotation.y += dt * 0.8 })
  return (
    <group>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'stone' }}>
        <CylinderCollider args={[height / 2, 2.3]} position={[x, base + height / 2, z]} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          return <CuboidCollider key={i} args={[0.9, 0.12, 0.9]} position={[x + Math.cos(a) * R, base + height, z + Math.sin(a) * R]} rotation={[0, -a, 0]} />
        })}
      </RigidBody>
      <mesh position={[x, base + height / 2, z]} material={stripes} castShadow receiveShadow><cylinderGeometry args={[1.9, 2.4, height, 24]} /></mesh>
      <mesh position={[x, base + height, z]} castShadow receiveShadow><cylinderGeometry args={[R + 0.9, R + 0.9, 0.24, 24]} /><meshStandardMaterial color="#5a5f66" metalness={0.6} roughness={0.4} /></mesh>
      <mesh position={[x, base + height + 1.4, z]}><cylinderGeometry args={[1.4, 1.4, 2.4, 16]} /><meshPhysicalMaterial color="#fff6d0" transmission={0.6} roughness={0.05} emissive={lit ? '#ffd56a' : '#333'} emissiveIntensity={lit ? 2.4 : 0.2} /></mesh>
      <mesh position={[x, base + height + 3.0, z]} castShadow><coneGeometry args={[1.8, 1.2, 16]} /><meshStandardMaterial color="#b3262e" roughness={0.5} /></mesh>
      {lit && (
        <group ref={beam} position={[x, base + height + 1.4, z]}>
          <mesh position={[0, 0, 14]} rotation-x={-Math.PI / 2}>
            <coneGeometry args={[4, 28, 24, 1, true]} />
            <meshBasicMaterial color="#fff2b0" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
          <pointLight color="#ffd56a" intensity={30} distance={25} />
        </group>
      )}
      {ramps.map((r, i) => <Ramp key={i} from={r.from} to={r.to} width={1.6} />)}
    </group>
  )
}

export function Umbrella({ pos, color }: { pos: V3; color: string }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 16
    const g = c.getContext('2d')!
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#fff' : color; g.fillRect(i * 16, 0, 16, 16) }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [color])
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false}><CylinderCollider args={[1.2, 0.06]} position={[0, 1.2, 0]} /><CylinderCollider args={[0.1, 1.5]} position={[0, 2.35, 0]} /></RigidBody>
      <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.04, 0.04, 2.4, 6]} /><meshStandardMaterial color="#eee" /></mesh>
      <mesh position={[0, 2.4, 0]} castShadow><coneGeometry args={[1.6, 0.6, 16, 1, true]} /><meshStandardMaterial map={tex} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0.9, 0.03, 0.4]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.9, 1.8]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
}

export function Crystals({ pos }: { pos: V3 }) {
  const items = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    x: Math.cos(i * 2.4) * (1 + (i % 3) * 0.5), z: Math.sin(i * 2.4) * (1 + (i % 3) * 0.5), s: 0.3 + (i % 4) * 0.15, c: ['#7fdcff', '#c39bff', '#7fffd4'][i % 3],
  })), [])
  return (
    <group position={pos}>
      {items.map((it, i) => (
        <mesh key={i} position={[it.x, it.s, it.z]} rotation={[0.2 * i, i, 0.3]} scale={[it.s * 0.6, it.s * 1.8, it.s * 0.6]}>
          <octahedronGeometry args={[1, 0]} />
          <meshPhysicalMaterial color={it.c} emissive={it.c} emissiveIntensity={1.2} roughness={0.1} transmission={0.3} />
        </mesh>
      ))}
      <pointLight position={[0, 1.5, 0]} color="#9fd8ff" intensity={8} distance={12} />
    </group>
  )
}
