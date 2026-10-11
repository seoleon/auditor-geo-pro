// Configuración del controlador cinemático de personaje de Rapier para Rocky.
// Un controlador cinemático (en vez de un cuerpo dinámico) da un control preciso de plataformas:
// sin rebotes ni deslizamientos indeseados, con escalones automáticos, ajuste al suelo en
// bajadas, límite de pendiente escalable y empuje de objetos dinámicos (la pelota).
import type { World } from '@dimforge/rapier3d-compat'

export const CAPSULE_HALF_HEIGHT = 0.12
export const CAPSULE_RADIUS = 0.28
/** Distancia del centro de la cápsula a las patas. */
export const FEET_OFFSET = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS
/** Separación de seguridad que mantiene el controlador con el entorno. */
export const SKIN = 0.02

export const MAX_CLIMB_DEG = 52
export const MIN_SLIDE_DEG = 58
export const STEP_HEIGHT = 0.32

export function createRockyController(world: World) {
  const c = world.createCharacterController(SKIN)
  c.setUp({ x: 0, y: 1, z: 0 })
  c.enableAutostep(STEP_HEIGHT, 0.18, false)
  c.enableSnapToGround(0.35)
  c.setMaxSlopeClimbAngle((MAX_CLIMB_DEG * Math.PI) / 180)
  c.setMinSlopeSlideAngle((MIN_SLIDE_DEG * Math.PI) / 180)
  c.setApplyImpulsesToDynamicBodies(true)
  c.setCharacterMass(14)
  c.setSlideEnabled(true)
  return c
}
