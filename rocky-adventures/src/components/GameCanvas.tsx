// Lienzo 3D: renderer, física, mundo activo, posprocesado según calidad, resolución adaptable,
// detección de "escena lista" (precompilando shaders para evitar tirones) y medidor de FPS.
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { PerformanceMonitor } from '@react-three/drei'
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useGame } from '../stores/gameStore'
import { runtime } from '../systems/runtime'
import { input } from '../systems/input'
import { setTextureSize } from '../worlds/common/textures'
import { LOW_FX } from '../utils/flags'

const ParkWorld = lazy(() => import('../worlds/park/ParkWorld'))
const CityWorld = lazy(() => import('../worlds/city/CityWorld'))
const BeachWorld = lazy(() => import('../worlds/beach/BeachWorld'))

function ReadyWatcher() {
  const { gl, scene, camera } = useThree()
  const frames = useRef(-1)
  const runId = useGame((s) => s.runId)
  useEffect(() => { frames.current = -1 }, [runId])
  useFrame(() => {
    const g = useGame.getState()
    if (g.sceneReady) return
    if (!runtime.rockyReady) { g.setLoading(Math.min(0.85, g.loadingProgress + 0.004), 'Esculpiendo a Rocky…'); return }
    if (frames.current < 0) {
      g.setLoading(0.9, 'Preparando la luz y los materiales…')
      try { gl.compile(scene, camera) } catch { /* no crítico */ }
      frames.current = 0
      return
    }
    frames.current++
    if (frames.current > 3) {
      g.setSceneReady(true)
      g.setLoading(1, '¡Listo!')
      g.finishLoading()
    }
  })
  return null
}

function FpsMeter() {
  const acc = useRef({ t: 0, n: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    a.t += dt; a.n++
    if (a.t > 0.5) {
      const fps = Math.round(a.n / a.t)
      ;(window as unknown as { __fps: number }).__fps = fps
      useGame.getState().setFps(fps)
      a.t = 0; a.n = 0
    }
  })
  return null
}

/** Pausa con ESC / Start; el tiempo de juego se congela fuera de "playing". */
function PauseController() {
  useFrame(() => {
    input.poll()
    const g = useGame.getState()
    if (input.consume('pause')) {
      if (g.screen === 'playing') { g.setScreen('paused'); if (document.pointerLockElement) document.exitPointerLock() }
      else if (g.screen === 'paused') g.setScreen('playing')
    }
    runtime.paused = g.screen !== 'playing'
  }, -10)
  return null
}

function Effects({ quality }: { quality: 'low' | 'medium' | 'high' }) {
  if (quality === 'low') return null
  return (
    <EffectComposer multisampling={0} enableNormalPass={quality === 'high'}>
      <>{quality === 'high' && <N8AO aoRadius={1.2} intensity={1.6} distanceFalloff={0.6} halfRes />}</>
      <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
      <HueSaturation saturation={0.14} />
      <BrightnessContrast contrast={0.06} />
      <Vignette offset={0.25} darkness={0.5} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  )
}

export function GameCanvas() {
  const quality = useGame((s) => s.save.settings.quality)
  const mounted = useGame((s) => s.mountedWorld)
  const runId = useGame((s) => s.runId)
  const screen = useGame((s) => s.screen)
  const showFps = useGame((s) => s.save.settings.showFps)
  const maxDpr = LOW_FX ? 0.3 : quality === 'high' ? 1.75 : quality === 'medium' ? 1.25 : 0.9
  const [dpr, setDpr] = useState(maxDpr)
  useEffect(() => setDpr(maxDpr), [maxDpr])
  setTextureSize(quality)
  const paused = screen === 'paused' || screen === 'victory' || screen === 'gameover'

  return (
    <Canvas
      shadows={LOW_FX ? false : { type: THREE.PCFShadowMap }}
      dpr={dpr}
      camera={{ fov: 50, near: 0.1, far: 900, position: [0, 3, 8] }}
      gl={{ antialias: quality === 'low', powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = quality === 'low' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
        gl.outputColorSpace = THREE.SRGBColorSpace
        input.attach(gl.domElement)
      }}
      onPointerDown={(e) => {
        if (useGame.getState().screen === 'playing') input.requestPointerLock(e.target as HTMLElement)
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      {/* resolución adaptable: baja la resolución si los FPS caen y la recupera cuando hay margen */}
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.55, +(d - 0.15).toFixed(2)))} onIncline={() => setDpr((d) => Math.min(maxDpr, +(d + 0.1).toFixed(2)))} flipflops={6} />
      <PauseController />
      <FpsMeter />
      <Suspense fallback={null}>
        <Physics timeStep="vary" gravity={[0, -20, 0]} paused={paused}>
          {mounted === 'park' && <ParkWorld key={'park' + runId} />}
          {mounted === 'city' && <CityWorld key={'city' + runId} />}
          {mounted === 'beach' && <BeachWorld key={'beach' + runId} />}
        </Physics>
        <ReadyWatcher />
        {!LOW_FX && <Effects quality={quality} />}
      </Suspense>
      {showFps && null}
    </Canvas>
  )
}
