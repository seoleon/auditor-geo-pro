// Cielo físico (Preetham), sol con sombras suaves que siguen a Rocky, luz ambiental hemisférica,
// mapa de entorno generado a partir del propio cielo (reflejos en agua y ojos), niebla de
// profundidad atmosférica, nubes que derivan y ciclo lento amanecer → tarde → atardecer.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { runtime } from '../../systems/runtime'
import { cloudTexture } from './textures'
import { mulberry32 } from '../../utils/random'

export interface AtmospherePreset {
  /** Elevación del sol en grados al empezar y amplitud del ciclo. */
  sunElevation: number
  sunAzimuth: number
  cycleAmplitude: number
  /** Duración de un ciclo completo en segundos (0 = estático). */
  cyclePeriod: number
  turbidity: number
  rayleigh: number
  fog: string
  fogDensity: number
  hemiSky: string
  hemiGround: string
  sunColor: string
  sunIntensity: number
  exposure: number
  clouds: number
}

export function sunColorFor(elev: number, base: THREE.Color, out: THREE.Color) {
  // el sol se vuelve anaranjado cerca del horizonte
  const warm = THREE.MathUtils.clamp(1 - elev / 25, 0, 1)
  return out.copy(base).lerp(new THREE.Color('#ff9a4d'), warm * 0.75)
}

function Clouds({ count, seed = 3 }: { count: number; seed?: number }) {
  const sprites = useMemo(() => {
    const rnd = mulberry32(seed)
    const tex = cloudTexture()
    return Array.from({ length: count }, () => {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 + rnd() * 0.25 })
      const s = new THREE.Sprite(mat)
      const a = rnd() * Math.PI * 2, r = 90 + rnd() * 140
      s.position.set(Math.cos(a) * r, 55 + rnd() * 45, Math.sin(a) * r)
      const k = 45 + rnd() * 55
      s.scale.set(k, k * 0.45, 1)
      s.renderOrder = -1
      return s
    })
  }, [count, seed])
  useEffect(() => () => sprites.forEach((s) => s.material.dispose()), [sprites])
  useFrame((_, dt) => {
    for (const s of sprites) {
      s.position.x += dt * 1.2
      if (s.position.x > 240) s.position.x = -240
    }
  })
  return <>{sprites.map((s, i) => <primitive key={i} object={s} />)}</>
}

export function Atmosphere({ preset, shadowSize = 2048, shadows = true }: { preset: AtmospherePreset; shadowSize?: number; shadows?: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const { scene, gl } = useThree()
  const sunPos = useMemo(() => new THREE.Vector3(), [])
  const [envKey, setEnvKey] = useState(0)
  const [skySun, setSkySun] = useState<[number, number, number]>([0, 1, 0])
  const lastEnvElev = useRef(-999)
  const elevRef = useRef(preset.sunElevation)
  const baseSun = useMemo(() => new THREE.Color(preset.sunColor), [preset.sunColor])
  const tmpC = useMemo(() => new THREE.Color(), [])
  const fogBase = useMemo(() => new THREE.Color(preset.fog), [preset.fog])

  useEffect(() => {
    scene.fog = new THREE.FogExp2(preset.fog, preset.fogDensity)
    gl.toneMappingExposure = preset.exposure
    return () => { scene.fog = null }
  }, [scene, gl, preset])

  const computeSun = (elevDeg: number) => {
    const phi = THREE.MathUtils.degToRad(90 - elevDeg)
    const theta = THREE.MathUtils.degToRad(preset.sunAzimuth)
    sunPos.setFromSphericalCoords(1, phi, theta)
    return sunPos
  }

  useEffect(() => {
    const s = computeSun(preset.sunElevation)
    setSkySun([s.x, s.y, s.z])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset])

  useFrame(() => {
    const t = runtime.time
    const elev = preset.cyclePeriod > 0
      ? preset.sunElevation + Math.sin((t / preset.cyclePeriod) * Math.PI * 2) * preset.cycleAmplitude
      : preset.sunElevation
    elevRef.current = elev
    const s = computeSun(elev)
    const L = light.current
    if (L) {
      const p = runtime.player.pos
      L.position.set(p.x + s.x * 60, p.y + s.y * 60, p.z + s.z * 60)
      L.target.position.copy(p)
      L.target.updateMatrixWorld()
      sunColorFor(elev, baseSun, tmpC)
      L.color.copy(tmpC)
      L.intensity = preset.sunIntensity * THREE.MathUtils.clamp(elev / 12, 0.25, 1)
    }
    if (hemi.current) hemi.current.intensity = 0.55 + THREE.MathUtils.clamp(elev / 40, 0, 1) * 0.5
    if (scene.fog instanceof THREE.FogExp2) {
      const warm = THREE.MathUtils.clamp(1 - elev / 20, 0, 1)
      scene.fog.color.copy(fogBase).lerp(new THREE.Color('#f2b38a'), warm * 0.4)
    }
    // actualizar el cielo y el entorno de reflejos cuando el sol cambia apreciablemente
    if (Math.abs(elev - lastEnvElev.current) > 1.5) {
      lastEnvElev.current = elev
      setSkySun([s.x, s.y, s.z])
      setEnvKey((k) => k + 1)
    }
  })

  return (
    <>
      <Sky distance={4000} sunPosition={skySun} turbidity={preset.turbidity} rayleigh={preset.rayleigh} mieCoefficient={0.004} mieDirectionalG={0.86} />
      <Environment key={envKey} frames={1} resolution={64} background={false} environmentIntensity={0.7}>
        <Sky distance={4000} sunPosition={skySun} turbidity={preset.turbidity} rayleigh={preset.rayleigh} mieCoefficient={0.004} mieDirectionalG={0.86} />
        <mesh position={[0, -40, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial color={preset.hemiGround} />
        </mesh>
      </Environment>
      <hemisphereLight ref={hemi} args={[preset.hemiSky, preset.hemiGround, 0.8]} />
      <directionalLight
        ref={light}
        castShadow={shadows}
        intensity={preset.sunIntensity}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Clouds count={preset.clouds} />
    </>
  )
}
