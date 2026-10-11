// Cámara cinematográfica en tercera persona: seguimiento suave, órbita con ratón/stick, zoom limitado,
// colisión con el escenario (no atraviesa árboles ni edificios), encuadre dinámico al correr,
// ajuste vertical al saltar, recolocación automática detrás de Rocky y vibración en impactos.
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { input } from '../systems/input'
import { runtime } from '../systems/runtime'
import { useGame } from '../stores/gameStore'

const MIN_D = 2.2
const MAX_D = 8.5

export function CameraRig() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const st = useRef({
    dist: 4.6,
    targetDist: 4.6,
    focus: new THREE.Vector3(),
    groundY: 0,
    idleLook: 0,
    fov: 50,
    init: false,
    collDist: 4.6,
  })
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), [rapier])
  const desired = useMemo(() => new THREE.Vector3(), [])
  const lookAt = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const game = useGame.getState()
    const sens = game.save.settings.sensitivity
    const invert = game.save.settings.invertY ? -1 : 1
    const p = runtime.player
    const cam = runtime.camera
    const playing = game.screen === 'playing'

    if (!s.init) {
      s.focus.set(p.pos.x, p.pos.y + 0.35, p.pos.z)
      s.groundY = p.pos.y
      s.init = true
    }

    // ---------------- entrada ----------------
    const [lx, ly] = playing ? input.takeLook() : (input.takeLook(), [0, 0])
    const z = playing ? input.takeZoom() : 0
    cam.yaw -= lx * 0.0026 * sens
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + ly * 0.0022 * sens * invert, -0.25, 1.15)
    s.targetDist = THREE.MathUtils.clamp(s.targetDist + z * 0.45, MIN_D, MAX_D)
    if (Math.abs(lx) + Math.abs(ly) > 0.5) s.idleLook = 0
    else s.idleLook += dt

    // recolocación automática detrás de Rocky cuando se mueve y no tocamos la cámara
    if (!playing && game.screen !== 'paused' && game.screen !== 'victory') {
      // menús: Rocky de frente, a la derecha del encuadre, con un vaivén cinematográfico lento
      const front = p.yaw + 0.55 + Math.sin(runtime.time * 0.12) * 0.35
      let d = front - cam.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      cam.yaw += d * (1 - Math.exp(-dt * 0.8))
      cam.pitch += (0.12 - cam.pitch) * (1 - Math.exp(-dt))
      s.targetDist += (3.4 - s.targetDist) * (1 - Math.exp(-dt))
    }
    if (playing && p.speed > 1.5 && s.idleLook > 1.2) {
      const behind = p.yaw + Math.PI
      let d = behind - cam.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      cam.yaw += d * (1 - Math.exp(-dt * 0.9 * Math.min(1, p.speed / 5)))
      cam.pitch += (0.32 - cam.pitch) * (1 - Math.exp(-dt * 0.5))
    }

    // ---------------- foco: sigue a Rocky; en el aire la altura se mueve con calma ----------------
    if (p.grounded || p.pos.y < s.groundY) s.groundY += (p.pos.y - s.groundY) * (1 - Math.exp(-dt * (p.grounded ? 10 : 6)))
    else s.groundY += (p.pos.y - 0.9 - s.groundY) * (1 - Math.exp(-dt * 1.2))
    const fy = Math.max(s.groundY, p.pos.y - 1.6) + 0.45
    const lead = Math.min(1, p.speed / 7) * 0.9
    const tx = p.pos.x + Math.sin(p.yaw) * lead
    const tz = p.pos.z + Math.cos(p.yaw) * lead
    s.focus.x += (tx - s.focus.x) * (1 - Math.exp(-dt * 9))
    s.focus.z += (tz - s.focus.z) * (1 - Math.exp(-dt * 9))
    s.focus.y += (fy - s.focus.y) * (1 - Math.exp(-dt * 7))

    // encuadre dinámico al correr: un poco más lejos y con más campo de visión
    const runK = Math.min(1, Math.max(0, (p.speed - 3) / 4))
    const dist = s.targetDist + runK * 1.1
    s.dist += (dist - s.dist) * (1 - Math.exp(-dt * 3))
    const fov = 50 + runK * 9
    s.fov += (fov - s.fov) * (1 - Math.exp(-dt * 3))
    const pc = camera as THREE.PerspectiveCamera
    if (Math.abs(pc.fov - s.fov) > 0.01) { pc.fov = s.fov; pc.updateProjectionMatrix() }

    // ligera respiración cinematográfica
    const t = runtime.time
    const sway = 0.012
    const cyaw = cam.yaw + Math.sin(t * 0.35) * sway
    const cpitch = cam.pitch + Math.sin(t * 0.27) * sway * 0.6

    const dirX = Math.sin(cyaw) * Math.cos(cpitch)
    const dirY = Math.sin(cpitch)
    const dirZ = Math.cos(cyaw) * Math.cos(cpitch)

    // ---------------- colisión de la cámara ----------------
    ray.origin = { x: s.focus.x, y: s.focus.y, z: s.focus.z }
    ray.dir = { x: dirX, y: dirY, z: dirZ }
    const hit = world.castRay(ray, s.dist + 0.3, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, undefined,
      (c) => c.handle !== p.colliderHandle)
    const allowed = hit ? Math.max(0.6, hit.timeOfImpact - 0.3) : s.dist
    // acercarse rápido al chocar, alejarse despacio al liberarse
    s.collDist += (allowed - s.collDist) * (1 - Math.exp(-dt * (allowed < s.collDist ? 25 : 3)))
    const d = Math.min(s.dist, s.collDist)
    desired.set(s.focus.x + dirX * d, s.focus.y + dirY * d, s.focus.z + dirZ * d)
    // nunca por debajo del terreno
    const wq = runtime.world
    if (wq) {
      const h = wq.heightAt(desired.x, desired.z) + 0.35
      if (desired.y < h) desired.y = h
      if (wq.waterY > -1e8 && desired.y < wq.waterY + 0.3) desired.y = wq.waterY + 0.3
    }

    // vibración por impactos
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 0.6)
      desired.x += (Math.random() - 0.5) * cam.shake
      desired.y += (Math.random() - 0.5) * cam.shake
    }
    camera.position.copy(desired)
    lookAt.copy(s.focus)
    lookAt.y += 0.15
    if (!playing && game.screen !== 'paused') {
      // en los menús Rocky queda a la derecha y los botones a la izquierda
      lookAt.x -= Math.cos(cam.yaw) * 1.25
      lookAt.z += Math.sin(cam.yaw) * 1.25
      lookAt.y += 0.25
    }
    camera.lookAt(lookAt)
  })
  return null
}
