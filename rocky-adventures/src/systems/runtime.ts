// Estado compartido de alta frecuencia (no reactivo): posición del jugador, interactuables,
// objetivos de olfato, mundo activo. Se actualiza en cada fotograma sin re-renderizar React.
import * as THREE from 'three'
import type { Surface } from './events'

export interface Interactable {
  id: string
  pos: THREE.Vector3
  radius: number
  label: string
  enabled: () => boolean
  onInteract: () => void
}

export interface ScentTarget {
  id: string
  pos: THREE.Vector3
  active: () => boolean
}

export interface WorldQuery {
  heightAt: (x: number, z: number) => number
  surfaceAt: (x: number, z: number) => Surface
  /** Altura del agua o -Infinity si no hay. */
  waterY: number
  /** ¿El agua es profunda (hay que reaparecer)? */
  isDeepWater: (x: number, z: number) => boolean
  killY: number
}

export const runtime = {
  player: {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    grounded: true,
    speed: 0,
    sniffing: false,
    invulnerable: 0,
    inWater: false,
    /** Petición de teletransporte (checkpoint, pruebas). */
    teleport: null as THREE.Vector3 | null,
    teleportYaw: 0,
    /** Impulso externo (rebotes, golpes). */
    impulse: new THREE.Vector3(),
    bounce: 0,
    colliderHandle: -1,
  },
  interactables: new Map<string, Interactable>(),
  scents: new Map<string, ScentTarget>(),
  /** Puntos que llaman la atención de Rocky (gira la cabeza hacia ellos). */
  lookTargets: new Map<string, THREE.Vector3>(),
  world: null as WorldQuery | null,
  /** Velocidad de plataformas móviles por handle de cuerpo rígido. */
  platformVel: new Map<number, THREE.Vector3>(),
  camera: { yaw: 0, pitch: 0.35, shake: 0, snap: false },
  paused: false,
  time: 0,
  rockyReady: false,
  /** Pasos de simulación del jugador (para pruebas deterministas). */
  steps: 0,
  /** Tiempo simulado del jugador en segundos. */
  simTime: 0,
}

export function resetRuntime() {
  runtime.interactables.clear()
  runtime.scents.clear()
  runtime.lookTargets.clear()
  runtime.platformVel.clear()
  runtime.player.teleport = null
  runtime.player.impulse.set(0, 0, 0)
  runtime.player.bounce = 0
  runtime.player.invulnerable = 0
  runtime.rockyReady = false
}
