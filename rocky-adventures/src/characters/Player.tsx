// Controlador del jugador: Rocky con un controlador cinemático de Rapier (colisiones reales,
// escalones, pendientes, plataformas móviles) y toda la lógica de movimiento de plataformas.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody, type RapierCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { RockyModel, createAnimInput, type RockyHandle } from './rocky/RockyModel'
import { input } from '../systems/input'
import { runtime } from '../systems/runtime'
import { emit, type Surface } from '../systems/events'
import { setTeleportHandler, useGame } from '../stores/gameStore'
import { ANCHORS } from './rocky/anatomy'
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS, FEET_OFFSET, SKIN, createRockyController } from '../physics/characterController'

export const ROCKY_SCALE = 1.5
const CAP_HALF = CAPSULE_HALF_HEIGHT
const CAP_R = CAPSULE_RADIUS
const FEET = FEET_OFFSET
const OFFSET = SKIN

const WALK = 2.6
const RUN = 6.0
const SPRINT = 7.6
const CROUCH = 1.1
const ACCEL = 16
const DECEL = 20
const AIR_ACCEL = 7
const JUMP_V = 7.4
const GRAV_UP = 17
const GRAV_DOWN = 30
const COYOTE = 0.13
const JUMP_BUFFER = 0.16

interface Props {
  spawn: THREE.Vector3
  spawnYaw: number
}

export function Player({ spawn, spawnYaw }: Props) {
  const quality = useGame((s) => s.save.settings.quality)
  const legendary = useGame((s) => s.save.legendaryCollar)
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const visual = useRef<THREE.Group>(null)
  const handle = useRef<RockyHandle | null>(null)
  const animIn = useMemo(() => createAnimInput(), [])
  const { world, rapier } = useRapier()

  const st = useRef({
    pos: spawn.clone(),
    vel: new THREE.Vector3(),
    yaw: spawnYaw,
    grounded: true,
    lastGrounded: 0,
    jumpHeld: false,
    jumpBuffer: 0,
    jumping: false,
    runTime: 0,
    skid: 0,
    stepDist: 0,
    barkCd: 0,
    sniffCd: 0,
    airTime: 0,
    minVyAir: 0,
    mantleUsed: false,
    wasInWater: false,
    respawnFade: 0,
    prevSpeed: 0,
    prevYaw: spawnYaw,
    surface: 'grass' as Surface,
    platformBody: -1,
  })

  // el controlador se crea en un efecto (compatible con el doble montaje de React StrictMode)
  const ctrlRef = useRef<ReturnType<typeof world.createCharacterController> | null>(null)
  useEffect(() => {
    const c = createRockyController(world)
    ctrlRef.current = c
    return () => {
      ctrlRef.current = null
      world.removeCharacterController(c)
    }
  }, [world])

  // posición inicial
  useEffect(() => {
    const s = st.current
    s.pos.copy(spawn)
    s.yaw = spawnYaw
    runtime.player.pos.copy(spawn)
    runtime.player.yaw = spawnYaw
    runtime.camera.yaw = spawnYaw + Math.PI
  }, [spawn, spawnYaw])

  useEffect(() => onCelebrate(() => handle.current?.animator.trigger('celebrate')), [])

  const tmpV = useMemo(() => new THREE.Vector3(), [])
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier])

  const castDown = (x: number, y: number, z: number, maxDist: number) => {
    ray.origin = { x, y, z }
    ray.dir = { x: 0, y: -1, z: 0 }
    return world.castRay(ray, maxDist, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider.current ?? undefined)
  }

  useBeforePhysicsStep((w) => {
    const s = st.current
    const col = collider.current
    const rb = body.current
    const controller = ctrlRef.current
    if (!col || !rb || !controller) return
    const dt = Math.min(w.timestep, 0.1)
    runtime.steps++
    runtime.simTime += dt
    const game = useGame.getState()
    const playing = game.screen === 'playing'
    runtime.player.colliderHandle = col.handle
    const anim = handle.current?.animator

    // ---------------- teletransporte (checkpoints / reaparición) ----------------
    if (runtime.player.teleport) {
      s.pos.copy(runtime.player.teleport)
      s.yaw = runtime.player.teleportYaw
      s.vel.set(0, 0, 0)
      runtime.player.teleport = null
      rb.setTranslation(s.pos, true)
      rb.setNextKinematicTranslation(s.pos)
      runtime.camera.yaw = s.yaw + Math.PI
      runtime.camera.snap = true
      return
    }
    if (!playing) {
      rb.setNextKinematicTranslation(s.pos)
      return
    }

    // ---------------- dirección deseada relativa a la cámara ----------------
    const cy = runtime.camera.yaw
    const fx = -Math.sin(cy), fz = -Math.cos(cy)
    const rx = Math.cos(cy), rz = -Math.sin(cy)
    let dx = fx * input.moveY + rx * input.moveX
    let dz = fz * input.moveY + rz * input.moveX
    const mag = Math.min(1, Math.hypot(dx, dz))
    if (mag > 0.001) { dx /= Math.hypot(dx, dz); dz /= Math.hypot(dx, dz) }
    const locked = anim?.lockMovement ?? false
    const sniffing = input.held.sniff && s.grounded
    runtime.player.sniffing = sniffing
    const wantRun = input.held.run && !sniffing
    s.runTime = wantRun && mag > 0.2 ? s.runTime + dt : 0
    // aceleración progresiva: al mantener la carrera se alcanza el esprint
    const runMax = RUN + (SPRINT - RUN) * Math.min(1, Math.max(0, (s.runTime - 0.8) / 1.5))
    let maxSpeed = sniffing ? CROUCH : wantRun ? runMax : WALK
    if (runtime.player.inWater) maxSpeed *= 0.6
    if (locked) maxSpeed = 0
    const target = tmpV.set(dx * maxSpeed * mag, 0, dz * maxSpeed * mag)

    // ---------------- derrape al invertir la dirección a gran velocidad ----------------
    const hv = Math.hypot(s.vel.x, s.vel.z)
    if (s.grounded && hv > 4.2 && mag > 0.5) {
      const dot = (s.vel.x * dx + s.vel.z * dz) / hv
      if (dot < -0.45 && s.skid <= 0) { s.skid = 0.32; emit({ type: 'skid' }) }
    }
    if (s.skid > 0) {
      s.skid -= dt
      target.set(0, 0, 0)
    }

    // ---------------- integración horizontal ----------------
    const a = s.grounded ? (target.lengthSq() > 0.01 ? ACCEL : DECEL) * (s.skid > 0 ? 1.4 : 1) : AIR_ACCEL
    const k = 1 - Math.exp(-a * dt / Math.max(1, maxSpeed * 0.35))
    s.vel.x += (target.x - s.vel.x) * k
    s.vel.z += (target.z - s.vel.z) * k

    // ---------------- salto con altura variable, coyote time y búfer ----------------
    s.lastGrounded = s.grounded ? 0 : s.lastGrounded + dt
    // búfer de salto medido en tiempo de juego (independiente de los FPS)
    if (input.consume('jump')) s.jumpBuffer = JUMP_BUFFER
    else s.jumpBuffer = Math.max(0, s.jumpBuffer - dt)
    if (s.jumpBuffer > 0 && s.lastGrounded < COYOTE && !s.jumping && !locked) {
      s.jumpBuffer = 0
      s.vel.y = JUMP_V + Math.min(1, hv / RUN) * 0.6
      s.jumping = true
      s.jumpHeld = true
      s.grounded = false
      s.lastGrounded = COYOTE
      s.mantleUsed = false
      emit({ type: 'jump' })
      anim?.wakeUp()
    }
    if (s.jumpHeld && !input.held.jump) {
      s.jumpHeld = false
      if (s.vel.y > 2) s.vel.y *= 0.55
    }
    // rebote externo (al pisar enemigos, setas…)
    if (runtime.player.bounce > 0) {
      s.vel.y = runtime.player.bounce
      runtime.player.bounce = 0
      s.jumping = true
      s.jumpHeld = input.held.jump
      s.grounded = false
    }
    if (runtime.player.impulse.lengthSq() > 0) {
      s.vel.add(runtime.player.impulse)
      runtime.player.impulse.set(0, 0, 0)
      s.grounded = false
    }

    const g = s.vel.y > 0 && s.jumpHeld ? GRAV_UP : GRAV_DOWN
    if (!s.grounded) s.vel.y = Math.max(-26, s.vel.y - g * dt)
    else if (s.vel.y < 0) s.vel.y = -2

    // ---------------- plataformas móviles: arrastre del jugador ----------------
    let carryX = 0, carryY = 0, carryZ = 0
    if (s.grounded) {
      const hit = castDown(s.pos.x, s.pos.y - FEET + 0.1, s.pos.z, 0.35)
      const parent = hit?.collider.parent()
      const pv = parent ? runtime.platformVel.get(parent.handle) : undefined
      if (pv) { carryX = pv.x * dt; carryY = pv.y * dt; carryZ = pv.z * dt }
      const ud = parent?.userData as { surface?: Surface } | undefined
      s.surface = ud?.surface ?? runtime.world?.surfaceAt(s.pos.x, s.pos.z) ?? 'grass'
    }

    // ---------------- movimiento con colisiones ----------------
    const desired = { x: s.vel.x * dt + carryX, y: s.vel.y * dt + carryY, z: s.vel.z * dt + carryZ }
    controller.computeColliderMovement(col, desired, rapier.QueryFilterFlags.EXCLUDE_SENSORS)
    const mv = controller.computedMovement()
    const wasGrounded = s.grounded
    s.grounded = controller.computedGrounded()

    // golpe contra techo / pared
    let hitWall = false
    for (let i = 0; i < controller.numComputedCollisions(); i++) {
      const c = controller.computedCollision(i)
      if (!c) continue
      const n = c.normal1
      if (n.y < -0.5 && s.vel.y > 0) s.vel.y = 0
      if (Math.abs(n.y) < 0.35) hitWall = true
    }

    s.pos.x += mv.x; s.pos.y += mv.y; s.pos.z += mv.z
    // velocidad real (tras colisiones) para la animación
    if (dt > 0) {
      const rvx = (mv.x - carryX) / dt, rvz = (mv.z - carryZ) / dt
      if (hitWall) { s.vel.x = rvx; s.vel.z = rvz }
    }

    // ---------------- asistencia en bordes: si casi llegamos, nos subimos ----------------
    if (!s.grounded && hitWall && !s.mantleUsed && s.vel.y < 3.5 && mag > 0.3) {
      const fwdX = Math.sin(s.yaw), fwdZ = Math.cos(s.yaw)
      const probe = castDown(s.pos.x + fwdX * 0.55, s.pos.y + 0.9, s.pos.z + fwdZ * 0.55, 1.9)
      if (probe) {
        const topY = s.pos.y + 0.9 - probe.timeOfImpact
        const feet = s.pos.y - FEET
        if (topY > feet && topY - feet < 0.85) {
          s.vel.y = Math.max(s.vel.y, Math.sqrt(2 * GRAV_DOWN * (topY - feet + 0.15)))
          s.vel.x += fwdX * 1.5; s.vel.z += fwdZ * 1.5
          s.mantleUsed = true
        }
      }
    }

    // ---------------- aterrizaje ----------------
    if (!wasGrounded && s.grounded) {
      const strength = Math.min(1.5, Math.max(0.2, -s.minVyAir / 10))
      if (s.airTime > 0.12) {
        anim?.trigger('land', strength)
        emit({ type: 'land', strength, surface: s.surface })
        if (strength > 0.9) runtime.camera.shake = Math.max(runtime.camera.shake, strength * 0.12)
      }
      s.jumping = false
      s.vel.y = 0
      s.airTime = 0
      s.minVyAir = 0
    }
    if (!s.grounded) {
      s.airTime += dt
      s.minVyAir = Math.min(s.minVyAir, s.vel.y)
    }

    rb.setNextKinematicTranslation(s.pos)

    // ---------------- orientación ----------------
    const speedNow = Math.hypot(s.vel.x, s.vel.z)
    if (speedNow > 0.25 && s.skid <= 0) {
      const targetYaw = Math.atan2(s.vel.x, s.vel.z)
      let d = targetYaw - s.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      const turn = (s.grounded ? 11 : 5) * dt
      s.yaw += Math.max(-turn * Math.max(1, Math.abs(d) * 2), Math.min(turn * Math.max(1, Math.abs(d) * 2), d))
    }

    // ---------------- agua ----------------
    const wq = runtime.world
    const feetY = s.pos.y - FEET
    const inWater = !!wq && feetY < wq.waterY - 0.12
    if (inWater && !s.wasInWater) emit({ type: 'splash', x: s.pos.x, y: wq!.waterY, z: s.pos.z })
    if (!inWater && s.wasInWater && s.grounded) { anim?.trigger('shake'); emit({ type: 'shake' }) }
    s.wasInWater = inWater
    runtime.player.inWater = inWater
    const fell = !!wq && (feetY < wq.killY || (inWater && wq.isDeepWater(s.pos.x, s.pos.z) && feetY < wq.waterY - 0.55))
    if (fell) {
      emit({ type: 'splash', x: s.pos.x, y: s.pos.y, z: s.pos.z })
      respawnAtCheckpoint(true)
    }

    // ---------------- pasos ----------------
    if (s.grounded && speedNow > 0.4) {
      s.stepDist += speedNow * dt
      const stride = speedNow > 4 ? 0.85 : 0.5
      if (s.stepDist > stride) {
        s.stepDist = 0
        emit({ type: 'step', surface: inWater ? 'water' : s.surface, run: speedNow > 4 })
      }
    }

    // ---------------- acciones: ladrar, olfatear, interactuar ----------------
    s.barkCd -= dt
    if (input.consume('bark') && s.barkCd <= 0) {
      s.barkCd = 0.45
      anim?.trigger('bark')
      const hx = s.pos.x + Math.sin(s.yaw) * 0.5, hz = s.pos.z + Math.cos(s.yaw) * 0.5
      emit({ type: 'bark', x: hx, y: s.pos.y + 0.3, z: hz })
    }
    s.sniffCd -= dt
    if (sniffing && s.sniffCd <= 0) {
      s.sniffCd = 0.55
      const nx = s.pos.x + Math.sin(s.yaw) * ANCHORS.noseTip[2] * ROCKY_SCALE
      const nz = s.pos.z + Math.cos(s.yaw) * ANCHORS.noseTip[2] * ROCKY_SCALE
      emit({ type: 'sniff', x: nx, y: s.pos.y - FEET + 0.1, z: nz })
    }

    // interacción contextual
    let best: { id: string; d: number } | null = null
    runtime.interactables.forEach((it) => {
      if (!it.enabled()) return
      const d = it.pos.distanceTo(s.pos)
      if (d < it.radius && (!best || d < best.d)) best = { id: it.id, d }
    })
    const bestIt = best ? runtime.interactables.get((best as { id: string }).id) : undefined
    game.setHint(bestIt ? `E · ${bestIt.label}` : sniffing ? 'Olfateando… sigue el rastro dorado' : null)
    if (input.consume('interact') && bestIt) bestIt.onInteract()
    else input.consume('interact')

    // ---------------- datos compartidos ----------------
    runtime.player.pos.copy(s.pos)
    runtime.player.vel.copy(s.vel)
    runtime.player.yaw = s.yaw
    runtime.player.grounded = s.grounded
    runtime.player.speed = speedNow
    runtime.player.invulnerable = Math.max(0, runtime.player.invulnerable - dt)

    // ---------------- entrada para el animador ----------------
    const yawRate = (Math.atan2(Math.sin(s.yaw - s.prevYaw), Math.cos(s.yaw - s.prevYaw))) / Math.max(dt, 1e-3)
    s.prevYaw = s.yaw
    animIn.speed = speedNow / ROCKY_SCALE
    animIn.vy = s.vel.y / ROCKY_SCALE / 3
    animIn.grounded = s.grounded || s.airTime < 0.08
    animIn.turnRate = yawRate
    animIn.accel = (speedNow - s.prevSpeed) / Math.max(dt, 1e-3) / ROCKY_SCALE
    s.prevSpeed = speedNow
    animIn.sprinting = speedNow > RUN - 0.5
    animIn.skidding = s.skid > 0
    animIn.crouching = sniffing
    // mirar el objeto interesante más cercano
    let look: THREE.Vector3 | null = null
    let ld = 6
    runtime.lookTargets.forEach((p) => {
      const d = p.distanceTo(s.pos)
      if (d < ld) { ld = d; look = p }
    })
    if (look) {
      const l = look as THREE.Vector3
      const lx = l.x - s.pos.x, ly = l.y - (s.pos.y + 0.2), lz = l.z - s.pos.z
      const c = Math.cos(-s.yaw), sn = Math.sin(-s.yaw)
      animIn.look = { x: lx * c + lz * sn, y: ly, z: -lx * sn + lz * c }
    } else animIn.look = null
  })

  // ---------------- visual ----------------
  useFrame((_, dt) => {
    const s = st.current
    const v = visual.current
    if (!v) return
    v.position.set(s.pos.x, s.pos.y - FEET - OFFSET + 0.005, s.pos.z)
    v.rotation.y = s.yaw
    // parpadeo de invulnerabilidad tras un golpe
    const inv = runtime.player.invulnerable
    v.visible = inv <= 0 || Math.floor(inv * 12) % 2 === 0
    runtime.time += dt
  })

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[spawn.x, spawn.y, spawn.z]} enabledRotations={[false, false, false]}>
        <CapsuleCollider ref={collider} args={[CAP_HALF, CAP_R]} />
      </RigidBody>
      <group ref={visual}>
        <RockyModel quality={quality} handle={handle} input={animIn} scale={ROCKY_SCALE} legendary={legendary} allowCustom onReady={() => { runtime.rockyReady = true; (window as unknown as { __rockyReady: boolean }).__rockyReady = true }} />
      </group>
    </>
  )
}

/** Devuelve a Rocky al último punto de control. */
export function respawnAtCheckpoint(hurt: boolean) {
  const g = useGame.getState()
  const cp = respawnPoints.get(g.save.worlds[g.world].checkpoint ?? '') ?? respawnPoints.get('__spawn')
  if (!cp) return
  runtime.player.teleport = cp.pos.clone()
  runtime.player.teleportYaw = cp.yaw
  if (hurt) g.damage(1)
}

setTeleportHandler(() => respawnAtCheckpoint(false))

/** Registro de puntos de reaparición del nivel activo. */
export const respawnPoints = new Map<string, { pos: THREE.Vector3; yaw: number }>()

/** Estado del animador accesible para otros sistemas (celebrar al recoger premios). */
export function celebrate() {
  celebrateListeners.forEach((f) => f())
}
const celebrateListeners = new Set<() => void>()
export function onCelebrate(f: () => void) {
  celebrateListeners.add(f)
  return () => { celebrateListeners.delete(f) }
}
