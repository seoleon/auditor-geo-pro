// Visor de desarrollo de Rocky: /?viewer=rocky&anim=walk&cam=side
// Sirve para revisar proporciones, materiales y animaciones con capturas automáticas.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RockyModel, createAnimInput, type Quality, type RockyHandle } from '../characters/rocky/RockyModel'

const params = new URLSearchParams(location.search)

function Driver({ handle }: { handle: React.MutableRefObject<RockyHandle | null> }) {
  const anim = params.get('anim') ?? 'idle'
  const t0 = useRef(0)
  useFrame((_, dt) => {
    const h = handle.current
    if (!h) return
    t0.current += dt
    const i = h.input
    i.speed = anim === 'walk' ? 0.35 : anim === 'trot' ? 0.9 : anim === 'run' ? 2.4 : 0
    i.grounded = anim !== 'jump' && anim !== 'fall'
    i.vy = anim === 'jump' ? 1.5 : anim === 'fall' ? -1.5 : 0
    i.crouching = anim === 'sniff'
    i.skidding = anim === 'skid'
    i.sprinting = anim === 'run' || anim === 'pant'
    if (anim === 'pant') { i.speed = 0; (h.animator as unknown as { pant: number }).pant = 1 }
    if (anim === 'sit' || anim === 'sleep') (h.animator as unknown as { idleTime: number }).idleTime = anim === 'sit' ? 8 : 30
    if (anim === 'shake' && t0.current > 0.3 && !h.animator.isBusy) h.animator.trigger('shake')
    if (anim === 'celebrate' && t0.current > 0.3 && !h.animator.isBusy) h.animator.trigger('celebrate')
    if (anim === 'bark' && Math.floor(t0.current * 2) !== Math.floor((t0.current - dt) * 2)) h.animator.trigger('bark')
  })
  return null
}

function CamSetup() {
  const { camera } = useThree()
  useEffect(() => {
    const cam = params.get('cam') ?? 'three'
    const pos: Record<string, [number, number, number]> = {
      front: [0, 0.42, 1.25], side: [1.3, 0.35, 0.05], three: [0.85, 0.55, 0.95], head: [0.25, 0.5, 0.65], top: [0, 1.4, 0.2], back: [0.3, 0.5, -1.1],
    }
    camera.position.set(...(pos[cam] ?? pos.three))
    camera.lookAt(0, 0.28, 0.05)
  }, [camera])
  return null
}

export default function RockyViewer() {
  const handle = useRef<RockyHandle | null>(null)
  const quality = (params.get('q') as Quality) ?? 'high'
  const input = useMemo(() => createAnimInput(), [])
  return (
    <Canvas shadows camera={{ fov: 35, near: 0.01, far: 50 }} gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05 }}>
      <color attach="background" args={['#b9cbe0']} />
      <hemisphereLight args={['#dbe8ff', '#6b5a3a', 0.9]} />
      <directionalLight position={[2, 3, 2]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-1} shadow-camera-right={1} shadow-camera-top={1} shadow-camera-bottom={-1} shadow-bias={-0.0004} />
      <directionalLight position={[-2, 1.5, -1.5]} intensity={0.8} color="#ffd8a8" />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[3, 48]} />
        <meshStandardMaterial color="#7d8f5a" roughness={0.95} />
      </mesh>
      <RockyModel quality={quality} handle={handle} input={input} onReady={() => { (window as unknown as { __rockyReady: boolean }).__rockyReady = true }} />
      <Driver handle={handle} />
      <CamSetup />
      <OrbitControls target={[0, 0.28, 0.05]} />
    </Canvas>
  )
}
