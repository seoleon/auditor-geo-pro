// Puente de depuración para pruebas automáticas (Playwright) y diagnóstico desde la consola:
//   window.__game.state()            → resumen del estado
//   window.__game.teleport(x, y, z)  → mueve a Rocky
//   window.__game.player()           → posición, velocidad, suelo
import * as THREE from 'three'
import { useGame } from '../stores/gameStore'
import { useLevel } from '../stores/levelStore'
import { runtime } from './runtime'
import { input } from './input'

export function installDebugBridge() {
  const w = window as unknown as Record<string, unknown>
  w.__game = {
    store: useGame,
    level: useLevel,
    runtime,
    input,
    state: () => {
      const g = useGame.getState()
      return { screen: g.screen, world: g.world, mounted: g.mountedWorld, ready: g.sceneReady, health: g.health, progress: g.save.worlds[g.world], hint: g.hint, objective: g.objective, unlocked: g.save.unlocked }
    },
    player: () => ({ pos: runtime.player.pos.toArray(), vel: runtime.player.vel.toArray(), grounded: runtime.player.grounded, yaw: runtime.player.yaw }),
    teleport: (x: number, y: number, z: number, yaw = runtime.player.yaw) => {
      runtime.player.teleport = new THREE.Vector3(x, y, z)
      runtime.player.teleportYaw = yaw
    },
    camera: () => ({ ...runtime.camera }),
    steps: () => runtime.steps,
    time: () => runtime.simTime,
  }
}
