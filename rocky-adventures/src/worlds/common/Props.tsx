// Objetos del escenario con colisiones: bancos, farolas, fuente, puentes, rampas, plataformas,
// bloques de piedra, setos, arco de entrada, túneles, tronco hueco, cenador, portería y más.
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { cobbleTexture, leafCardTexture, rockTexture, woodTexture } from './textures'
import type { V3 } from '../../gameplay/levelTypes'
import { runtime } from '../../systems/runtime'

const useWood = () => {
  const t = woodTexture()
  return useMemo(() => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color: '#e3c49b', roughness: 0.82 }), [t])
}
const useStone = (color = '#d9d2c5') => {
  const t = cobbleTexture()
  return useMemo(() => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, color, roughness: 0.9 }), [t, color])
}
const metal = new THREE.MeshStandardMaterial({ color: '#2f3b38', metalness: 0.7, roughness: 0.4 })

// ----------------------------------------------------------------------------- banco
export function Bench({ pos, rot = 0 }: { pos: V3; rot?: number }) {
  const wood = useWood()
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}>
        <CuboidCollider args={[1.0, 0.25, 0.3]} position={[0, 0.25, 0]} />
        <CuboidCollider args={[1.0, 0.3, 0.06]} position={[0, 0.8, -0.3]} />
      </RigidBody>
      {[-0.18, 0, 0.18].map((z) => (
        <mesh key={z} position={[0, 0.48, z]} material={wood} castShadow receiveShadow><boxGeometry args={[2, 0.06, 0.15]} /></mesh>
      ))}
      {[0.62, 0.86].map((y) => (
        <mesh key={y} position={[0, y, -0.3]} rotation-x={-0.12} material={wood} castShadow><boxGeometry args={[2, 0.13, 0.05]} /></mesh>
      ))}
      {[-0.85, 0.85].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.24, 0]} material={metal} castShadow><boxGeometry args={[0.07, 0.48, 0.5]} /></mesh>
          <mesh position={[0, 0.72, -0.28]} material={metal}><boxGeometry args={[0.06, 0.5, 0.06]} /></mesh>
          <mesh position={[0, 0.58, 0]} material={metal}><boxGeometry args={[0.06, 0.05, 0.55]} /></mesh>
        </group>
      ))}
    </group>
  )
}

// ----------------------------------------------------------------------------- farola
export function Lamp({ pos, glow = 1 }: { pos: V3; glow?: number }) {
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false}><CylinderCollider args={[1.6, 0.1]} position={[0, 1.6, 0]} /></RigidBody>
      <mesh position={[0, 0.15, 0]} material={metal} castShadow><cylinderGeometry args={[0.18, 0.24, 0.3, 10]} /></mesh>
      <mesh position={[0, 1.7, 0]} material={metal} castShadow><cylinderGeometry args={[0.05, 0.08, 3.2, 8]} /></mesh>
      <mesh position={[0, 3.45, 0]}>
        <sphereGeometry args={[0.22, 14, 10]} />
        <meshStandardMaterial color="#fff4cf" emissive="#ffcf70" emissiveIntensity={0.9 * glow} />
      </mesh>
      <mesh position={[0, 3.7, 0]} material={metal}><coneGeometry args={[0.3, 0.22, 10]} /></mesh>
    </group>
  )
}

// ----------------------------------------------------------------------------- fuente
export function Fountain({ pos }: { pos: V3 }) {
  const stone = useStone('#e9e2d6')
  const jets = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = 420
    const p = new Float32Array(n * 3), ph = new Float32Array(n)
    for (let i = 0; i < n; i++) ph[i] = Math.random()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('phase', new THREE.BufferAttribute(ph, 1))
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute float phase; uniform float uTime; varying float vA;
        void main() {
          // chorro central que cae en forma de paraguas sobre la taza intermedia
          float t = fract(uTime * 0.7 + phase);
          float a = phase * 6.2831 * 13.0;
          float r = t * (1.05 + fract(phase * 91.7) * 0.35);
          vec3 p = vec3(cos(a) * r, 3.15 + t * 1.1 - t * t * 2.6, sin(a) * r);
          vA = (1.0 - t) * smoothstep(0.0, 0.08, t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(55.0 / -mv.z, 1.0, 14.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.85, 0.95, 1.0, vA * 0.7 * (1.0 - d * 2.0)); }`,
      transparent: true, depthWrite: false,
    })
    return { g, m }
  }, [])
  useFrame((_, dt) => { jets.m.uniforms.uTime.value += dt })
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'stone' }}>
        {/* borde del estanque (anillo de cajas) */}
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2
          return <CuboidCollider key={i} args={[0.35, 0.36, 0.85]} position={[Math.cos(a) * 4.2, 0.36, Math.sin(a) * 4.2]} rotation={[0, -a, 0]} />
        })}
        <CylinderCollider args={[0.25, 4.0]} position={[0, -0.05, 0]} />
        <CylinderCollider args={[0.8, 0.7]} position={[0, 0.8, 0]} />
        <CylinderCollider args={[0.12, 1.6]} position={[0, 1.65, 0]} />
        <CylinderCollider args={[0.6, 0.35]} position={[0, 2.3, 0]} />
        <CylinderCollider args={[0.1, 0.85]} position={[0, 2.95, 0]} />
      </RigidBody>
      <mesh position={[0, 0.36, 0]} material={stone} castShadow receiveShadow>
        <cylinderGeometry args={[4.6, 4.75, 0.72, 40, 1, true]} />
      </mesh>
      <mesh position={[0, 0.72, 0]} rotation-x={-Math.PI / 2} material={stone} receiveShadow>
        <ringGeometry args={[3.85, 4.6, 40]} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={stone}><cylinderGeometry args={[3.85, 3.85, 0.72, 40, 1, true]} /></mesh>
      {/* agua del estanque */}
      <mesh position={[0, 0.48, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[3.86, 40]} />
        <meshPhysicalMaterial color="#5fc3d6" roughness={0.05} transmission={0.2} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0.8, 0]} material={stone} castShadow><cylinderGeometry args={[0.55, 0.75, 1.6, 20]} /></mesh>
      <mesh position={[0, 1.65, 0]} material={stone} castShadow receiveShadow><cylinderGeometry args={[1.6, 1.1, 0.25, 32]} /></mesh>
      <mesh position={[0, 2.3, 0]} material={stone} castShadow><cylinderGeometry args={[0.28, 0.38, 1.2, 16]} /></mesh>
      <mesh position={[0, 2.95, 0]} material={stone} castShadow receiveShadow><cylinderGeometry args={[0.85, 0.6, 0.2, 24]} /></mesh>
      <mesh position={[0, 3.1, 0]}><sphereGeometry args={[0.18, 14, 10]} /><meshStandardMaterial color="#ffd23f" metalness={1} roughness={0.25} /></mesh>
      <points geometry={jets.g} material={jets.m} frustumCulled={false} />
    </group>
  )
}

// ----------------------------------------------------------------------------- rampa / pasarela de madera entre dos puntos
export function Ramp({ from, to, width = 2, thick = 0.25, rails = true, material = 'wood' }: { from: V3; to: V3; width?: number; thick?: number; rails?: boolean; material?: 'wood' | 'stone' }) {
  const wood = useWood()
  const stone = useStone()
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
    const d = b.clone().sub(a)
    const len = d.length()
    const yaw = Math.atan2(d.x, d.z)
    const pitch = -Math.asin(d.y / len)
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
    const pos = a.clone().add(b).multiplyScalar(0.5)
    pos.y -= thick / 2
    return { pos, quat, len }
  }, [from, to, thick])
  const mat = material === 'wood' ? wood : stone
  return (
    <group position={pos} quaternion={quat}>
      <RigidBody type="fixed" colliders={false} position={[0, 0, 0]} userData={{ surface: material === 'wood' ? 'wood' : 'stone' }}>
        <CuboidCollider args={[width / 2, thick / 2, len / 2]} />
        {rails && <CuboidCollider args={[0.05, 0.5, len / 2]} position={[width / 2, 0.5, 0]} />}
        {rails && <CuboidCollider args={[0.05, 0.5, len / 2]} position={[-width / 2, 0.5, 0]} />}
      </RigidBody>
      <mesh material={mat} castShadow receiveShadow><boxGeometry args={[width, thick, len]} /></mesh>
      {rails && [-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * width / 2, 0.75, 0]} material={wood} castShadow><boxGeometry args={[0.08, 0.08, len]} /></mesh>
          {Array.from({ length: Math.max(2, Math.floor(len / 1.5)) + 1 }, (_, i) => {
            const n = Math.max(2, Math.floor(len / 1.5))
            return <mesh key={i} position={[s * width / 2, 0.38, -len / 2 + (i / n) * len]} material={wood} castShadow><boxGeometry args={[0.08, 0.75, 0.08]} /></mesh>
          })}
        </group>
      ))}
    </group>
  )
}

// ----------------------------------------------------------------------------- plataforma / bloque
export function Block({ pos, size, rot = 0, kind = 'wood', posts = false, postsTo }: { pos: V3; size: V3; rot?: number; kind?: 'wood' | 'stone' | 'rock'; posts?: boolean; postsTo?: number }) {
  const wood = useWood()
  const stone = useStone()
  const rockT = rockTexture()
  const rock = useMemo(() => new THREE.MeshStandardMaterial({ map: rockT.map, normalMap: rockT.normal, color: '#cfc8bb', roughness: 0.9 }), [rockT])
  const mat = kind === 'wood' ? wood : kind === 'stone' ? stone : rock
  const [sx, sy, sz] = size
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: kind === 'wood' ? 'wood' : 'stone' }}>
        <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} position={[0, sy / 2, 0]} />
      </RigidBody>
      <mesh position={[0, sy / 2, 0]} material={mat} castShadow receiveShadow><boxGeometry args={[sx, sy, sz]} /></mesh>
      {posts && [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => {
        const len = Math.max(0.5, pos[1] - (postsTo ?? pos[1] - 4) + 0.3)
        return <mesh key={i} position={[a * (sx / 2 - 0.12), -len / 2, b * (sz / 2 - 0.12)]} material={wood} castShadow><boxGeometry args={[0.18, len, 0.18]} /></mesh>
      })}
    </group>
  )
}

// ----------------------------------------------------------------------------- seto recortado
export function Hedge({ from, to, height = 1.8, thick = 1.0 }: { from: [number, number, number]; to: [number, number, number]; height?: number; thick?: number }) {
  const leaf = leafCardTexture('broad')
  const mat = useMemo(() => {
    const t = leaf.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ color: '#4f8f3a', roughness: 0.9, map: t })
  }, [leaf])
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
  const d = b.clone().sub(a)
  const len = Math.hypot(d.x, d.z)
  const yaw = Math.atan2(d.x, d.z)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(thick, height, len, 2, 4, Math.max(2, Math.floor(len)))
    // bordes redondeados y bultos de follaje
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const n = Math.sin(z * 3.1 + y * 2.3) * 0.05 + Math.sin(z * 7.7 - y * 5.1) * 0.03
      p.setX(i, x * (1 + n)); p.setY(i, y + (y > 0 ? n : 0))
    }
    g.computeVertexNormals()
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 0.5, uv.getY(i) * height * 0.5)
    return g
  }, [len, height, thick])
  return (
    <group position={[mid.x, mid.y, mid.z]} rotation-y={yaw}>
      <RigidBody type="fixed" colliders={false}><CuboidCollider args={[thick / 2, height / 2, len / 2]} position={[0, height / 2, 0]} /></RigidBody>
      <mesh geometry={geo} material={mat} position={[0, height / 2, 0]} castShadow receiveShadow />
    </group>
  )
}

// ----------------------------------------------------------------------------- arco de entrada con letrero
export function EntranceArch({ pos, rot = 0, title }: { pos: V3; rot?: number; title: string }) {
  const wood = useWood()
  const sign = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024; c.height = 192
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 192)
    grad.addColorStop(0, '#7a4a24'); grad.addColorStop(1, '#4e2d14')
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 192)
    g.strokeStyle = '#ffcf4a'; g.lineWidth = 10; g.strokeRect(8, 8, 1008, 176)
    g.font = '800 92px "Baloo 2", "Fredoka", sans-serif'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = '#2b1606'; g.fillText(title, 516, 104)
    g.fillStyle = '#ffd86b'; g.fillText(title, 512, 98)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [title])
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.35, 2.4, 0.35]} position={[-3.6, 2.4, 0]} />
        <CuboidCollider args={[0.35, 2.4, 0.35]} position={[3.6, 2.4, 0]} />
      </RigidBody>
      {[-3.6, 3.6].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 2.4, 0]} material={wood} castShadow><cylinderGeometry args={[0.3, 0.38, 4.8, 10]} /></mesh>
          <mesh position={[0, 4.9, 0]}><sphereGeometry args={[0.42, 14, 10]} /><meshStandardMaterial color="#ffcf4a" metalness={0.8} roughness={0.3} /></mesh>
        </group>
      ))}
      <mesh position={[0, 4.3, 0]} castShadow><boxGeometry args={[7.2, 1.35, 0.25]} /><meshStandardMaterial map={sign} roughness={0.6} /></mesh>
      <mesh position={[0, 4.3, -0.13]} rotation-y={Math.PI}><planeGeometry args={[7.2, 1.35]} /><meshStandardMaterial map={sign} /></mesh>
      {/* guirnalda de flores */}
      {Array.from({ length: 22 }, (_, i) => {
        const t = i / 21
        const x = -3.5 + t * 7, y = 3.45 - Math.sin(t * Math.PI) * 0.45
        return <mesh key={i} position={[x, y, 0.15]}><sphereGeometry args={[0.13, 8, 6]} /><meshStandardMaterial color={['#ff6b9a', '#ffd23f', '#ffffff', '#ff9f43'][i % 4]} emissive="#331" /></mesh>
      })}
    </group>
  )
}

// ----------------------------------------------------------------------------- túnel de piedra
export function StoneTunnel({ pos, rot = 0, length = 10, width = 2.6, height = 2.4 }: { pos: V3; rot?: number; length?: number; width?: number; height?: number }) {
  const rockT = rockTexture()
  const rock = useMemo(() => new THREE.MeshStandardMaterial({ map: rockT.map, normalMap: rockT.normal, color: '#bdb5a7', roughness: 0.95, side: THREE.DoubleSide }), [rockT])
  const archGeo = useMemo(() => {
    // bóveda semicircular de medio punto
    const g = new THREE.CylinderGeometry(width / 2 + 0.6, width / 2 + 0.6, length, 20, 1, true, -Math.PI / 2, Math.PI)
    g.rotateZ(Math.PI / 2)
    g.rotateY(Math.PI / 2)
    return g
  }, [length, width])
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'stone' }}>
        <CuboidCollider args={[0.5, height / 2 + 0.6, length / 2]} position={[width / 2 + 0.5, height / 2, 0]} />
        <CuboidCollider args={[0.5, height / 2 + 0.6, length / 2]} position={[-width / 2 - 0.5, height / 2, 0]} />
        <CuboidCollider args={[width / 2 + 1, 0.6, length / 2]} position={[0, height + 0.9, 0]} />
        <CuboidCollider args={[width / 2 + 1, 0.15, length / 2]} position={[0, -0.1, 0]} />
      </RigidBody>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + 0.5), height / 2 - 0.2, 0]} material={rock} castShadow receiveShadow><boxGeometry args={[1, height + 0.6, length]} /></mesh>
      ))}
      <mesh geometry={archGeo} material={rock} position={[0, height - 0.3, 0]} castShadow />
      <mesh position={[0, height + 0.9, 0]} material={rock} castShadow><boxGeometry args={[width + 2, 1.2, length]} /></mesh>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[width, length]} /><meshStandardMaterial color="#6b6155" roughness={1} /></mesh>
      {/* farolillos dentro del túnel */}
      {[-length / 3, length / 3].map((z) => (
        <mesh key={z} position={[width / 2 - 0.05, height * 0.7, z]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshStandardMaterial color="#ffd27a" emissive="#ffb347" emissiveIntensity={2} />
        </mesh>
      ))}
      <pointLight position={[0, height * 0.7, 0]} color="#ffb85c" intensity={6} distance={9} />
    </group>
  )
}

// ----------------------------------------------------------------------------- tronco hueco (pasadizo secreto)
export function HollowLog({ pos, rot = 0, length = 6, radius = 1.0 }: { pos: V3; rot?: number; length?: number; radius?: number }) {
  const geo = useMemo(() => {
    const outer = new THREE.CylinderGeometry(radius + 0.2, radius + 0.25, length, 18, 1, true)
    outer.rotateX(Math.PI / 2)
    return outer
  }, [length, radius])
  const inner = useMemo(() => {
    const g = new THREE.CylinderGeometry(radius, radius, length, 18, 1, true)
    g.rotateX(Math.PI / 2)
    return g
  }, [length, radius])
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}>
        <CuboidCollider args={[radius + 0.2, 0.2, length / 2]} position={[0, radius * 2 + 0.3, 0]} />
        <CuboidCollider args={[0.2, radius, length / 2]} position={[radius + 0.1, radius, 0]} />
        <CuboidCollider args={[0.2, radius, length / 2]} position={[-radius - 0.1, radius, 0]} />
      </RigidBody>
      <mesh geometry={geo} position={[0, radius + 0.05, 0]} castShadow receiveShadow><meshStandardMaterial color="#6e4a2e" roughness={0.95} /></mesh>
      <mesh geometry={inner} position={[0, radius + 0.05, 0]}><meshStandardMaterial color="#3e2a1a" roughness={1} side={THREE.BackSide} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, radius + 0.05, (s * length) / 2]}>
          <ringGeometry args={[radius, radius + 0.25, 18]} />
          <meshStandardMaterial color="#c9a273" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* musgo */}
      <mesh position={[0, radius * 2 + 0.2, 0]} scale={[1, 0.3, 1]}><sphereGeometry args={[radius * 0.8, 10, 6]} /><meshStandardMaterial color="#5f8f3a" roughness={1} /></mesh>
    </group>
  )
}

// ----------------------------------------------------------------------------- cenador (pérgola)
export function Gazebo({ pos }: { pos: V3 }) {
  const wood = useWood()
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}>
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2
          return <CylinderCollider key={i} args={[1.5, 0.15]} position={[Math.cos(a) * 3, 1.5, Math.sin(a) * 3]} />
        })}
        <CylinderCollider args={[0.1, 3.4]} position={[0, 0.1, 0]} />
      </RigidBody>
      <mesh position={[0, 0.1, 0]} material={wood} receiveShadow castShadow><cylinderGeometry args={[3.4, 3.5, 0.2, 6]} /></mesh>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        return <mesh key={i} position={[Math.cos(a) * 3, 1.6, Math.sin(a) * 3]} castShadow><cylinderGeometry args={[0.13, 0.15, 3, 8]} /><meshStandardMaterial color="#f4efe6" roughness={0.6} /></mesh>
      })}
      <mesh position={[0, 3.6, 0]} castShadow><coneGeometry args={[4, 1.7, 6]} /><meshStandardMaterial color="#c4573a" roughness={0.7} /></mesh>
      <mesh position={[0, 4.6, 0]}><sphereGeometry args={[0.22, 12, 8]} /><meshStandardMaterial color="#ffcf4a" metalness={0.9} roughness={0.3} /></mesh>
    </group>
  )
}

// ----------------------------------------------------------------------------- portería del parque infantil
export function SoccerGoal({ pos, rot = 0 }: { pos: V3; rot?: number }) {
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.4 }), [])
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.06, 0.9, 0.06]} position={[0, 0.9, -1.6]} />
        <CuboidCollider args={[0.06, 0.9, 0.06]} position={[0, 0.9, 1.6]} />
        <CuboidCollider args={[0.06, 0.06, 1.6]} position={[0, 1.8, 0]} />
        <CuboidCollider args={[0.05, 0.9, 1.6]} position={[1.2, 0.9, 0]} />
        <CuboidCollider args={[0.6, 0.9, 0.05]} position={[0.6, 0.9, -1.6]} />
        <CuboidCollider args={[0.6, 0.9, 0.05]} position={[0.6, 0.9, 1.6]} />
      </RigidBody>
      {[-1.6, 1.6].map((z) => <mesh key={z} position={[0, 0.9, z]} material={white} castShadow><cylinderGeometry args={[0.06, 0.06, 1.8, 8]} /></mesh>)}
      <mesh position={[0, 1.8, 0]} rotation-x={Math.PI / 2} material={white} castShadow><cylinderGeometry args={[0.06, 0.06, 3.3, 8]} /></mesh>
      <mesh position={[1.2, 0.9, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[3.2, 1.8, 16, 9]} /><meshStandardMaterial color="#ffffff" wireframe transparent opacity={0.6} /></mesh>
      {[-1.6, 1.6].map((z) => <mesh key={z} position={[0.6, 0.9, z]}><planeGeometry args={[1.2, 1.8, 6, 9]} /><meshStandardMaterial color="#ffffff" wireframe transparent opacity={0.6} side={THREE.DoubleSide} /></mesh>)}
    </group>
  )
}

// ----------------------------------------------------------------------------- tobogán
export function Slide({ pos, rot = 0 }: { pos: V3; rot?: number }) {
  return (
    <group position={pos} rotation-y={rot}>
      <RigidBody type="fixed" colliders={false} userData={{ surface: 'wood' }}>
        <CuboidCollider args={[0.6, 0.08, 0.6]} position={[0, 1.8, 0]} />
        <CuboidCollider args={[0.5, 0.06, 1.7]} position={[0, 0.95, 1.95]} rotation={[0.55, 0, 0]} />
        <CuboidCollider args={[0.5, 0.06, 1.2]} position={[0, 0.9, -1.4]} rotation={[-0.85, 0, 0]} />
      </RigidBody>
      <mesh position={[0, 1.8, 0]} castShadow><boxGeometry args={[1.2, 0.16, 1.2]} /><meshStandardMaterial color="#ff8a3d" /></mesh>
      <mesh position={[0, 0.95, 1.95]} rotation-x={0.55} castShadow><boxGeometry args={[1.0, 0.12, 3.4]} /><meshStandardMaterial color="#3fb4ff" metalness={0.2} roughness={0.25} /></mesh>
      <mesh position={[0, 0.9, -1.4]} rotation-x={-0.85} castShadow><boxGeometry args={[1.0, 0.12, 2.4]} /><meshStandardMaterial color="#ffd23f" /></mesh>
      {[[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.9, z]} castShadow><cylinderGeometry args={[0.06, 0.06, 1.8, 8]} /><meshStandardMaterial color="#e94f64" /></mesh>
      ))}
    </group>
  )
}

// ----------------------------------------------------------------------------- valla de madera
export function Fence({ points, height = 0.9 }: { points: V3[]; height?: number }) {
  const wood = useWood()
  return (
    <group>
      {points.slice(0, -1).map((a, i) => {
        const b = points[i + 1]
        const dx = b[0] - a[0], dz = b[2] - a[2]
        const len = Math.hypot(dx, dz)
        const yaw = Math.atan2(dx, dz)
        const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
        return (
          <group key={i} position={mid} rotation-y={yaw}>
            <RigidBody type="fixed" colliders={false}><CuboidCollider args={[0.05, height / 2, len / 2]} position={[0, height / 2, 0]} /></RigidBody>
            {[0.35, 0.75].map((y) => <mesh key={y} position={[0, y * height, 0]} material={wood} castShadow><boxGeometry args={[0.06, 0.1, len]} /></mesh>)}
            <mesh position={[0, height / 2, -len / 2]} material={wood} castShadow><boxGeometry args={[0.12, height, 0.12]} /></mesh>
          </group>
        )
      })}
    </group>
  )
}

// ----------------------------------------------------------------------------- paredes invisibles de los límites
export function BoundaryWalls({ half, height = 30 }: { half: number; height?: number }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[half, height, 1]} position={[0, 0, half]} />
      <CuboidCollider args={[half, height, 1]} position={[0, 0, -half]} />
      <CuboidCollider args={[1, height, half]} position={[half, 0, 0]} />
      <CuboidCollider args={[1, height, half]} position={[-half, 0, 0]} />
    </RigidBody>
  )
}

// ----------------------------------------------------------------------------- disparador de lugar secreto
export function SecretZone({ pos, radius, onEnter }: { pos: V3; radius: number; onEnter: () => void }) {
  const fired = useMemo(() => ({ v: false }), [])
  useFrame(() => {
    if (fired.v) return
    const p = runtime.player.pos
    if (Math.hypot(p.x - pos[0], p.y - pos[1], p.z - pos[2]) < radius) { fired.v = true; onEnter() }
  })
  return null
}
