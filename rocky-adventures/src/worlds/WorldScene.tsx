// Escena genérica de un mundo: jugador, cámara, física del nivel, premios, enemigos,
// plataformas, checkpoints, partículas y atmósfera. Cada mundo aporta su escenario como hijos.
import { useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { Player } from '../characters/Player'
import { CameraRig } from '../components/CameraRig'
import { ParticleSystem } from '../components/Particles'
import { Collectibles, ScentSystem } from '../gameplay/Collectibles'
import { Checkpoints, Crate, Enemy, MovingPlatform } from '../gameplay/Mechanics'
import type { BoneDef, CheckpointDef, CookieDef, CrateDef, EnemyDef, PlatformDef, V3 } from '../gameplay/levelTypes'
import { useGame } from '../stores/gameStore'
import { resetRuntime, runtime, type WorldQuery } from '../systems/runtime'
import { Atmosphere, type AtmospherePreset } from './common/Atmosphere'
import { WindDriver } from './common/Grass'
import { audio } from '../audio/audioEngine'

export interface WorldDef extends WorldQuery {
  spawn: V3
  spawnYaw: number
  bones: BoneDef[]
  cookies: CookieDef[]
  crates: CrateDef[]
  checkpoints: CheckpointDef[]
  enemies: EnemyDef[]
  platforms: PlatformDef[]
  cookieKind?: 'cookie' | 'shell'
  atmosphere: AtmospherePreset
}

export function WorldScene({ def, children }: { def: WorldDef; children: ReactNode }) {
  const quality = useGame((s) => s.save.settings.quality)
  const world = useGame((s) => s.world)
  const checkpoint = useGame((s) => s.save.worlds[s.mountedWorld].checkpoint)

  // registrar consultas del mundo y reiniciar el estado de sesión del nivel
  useMemo(() => {
    resetRuntime()
    runtime.world = { heightAt: def.heightAt, surfaceAt: def.surfaceAt, waterY: def.waterY, isDeepWater: def.isDeepWater, killY: def.killY }
  }, [def])

  const spawn = useMemo(() => new THREE.Vector3(...def.spawn), [def.spawn])
  // posición inicial: último checkpoint guardado o la entrada del nivel
  const start = useMemo(() => {
    const cp = def.checkpoints.find((c) => c.id === checkpoint)
    return cp ? { pos: new THREE.Vector3(cp.pos[0], cp.pos[1] + 0.6, cp.pos[2]), yaw: cp.yaw } : { pos: spawn, yaw: def.spawnYaw }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def])

  useEffect(() => { audio.setWorld(world) }, [world])

  return (
    <>
      <Atmosphere preset={def.atmosphere} shadowSize={quality === 'high' ? 2048 : quality === 'medium' ? 1536 : 1024} />
      <WindDriver />
      <Player spawn={start.pos} spawnYaw={start.yaw} />
      <CameraRig />
      <ParticleSystem />
      <ScentSystem />
      <Collectibles bones={def.bones} cookies={def.cookies} crates={def.crates} cookieKind={def.cookieKind} />
      <Checkpoints list={def.checkpoints} spawn={spawn} spawnYaw={def.spawnYaw} />
      {def.enemies.map((e) => <Enemy key={e.id} def={e} />)}
      {def.platforms.map((p) => <MovingPlatform key={p.id} def={p} />)}
      {def.crates.map((c) => <Crate key={c.id} def={c} />)}
      {children}
    </>
  )
}
