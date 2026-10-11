// Animación procedural de Rocky: máquina de estados con capas mezcladas suavemente.
// Locomoción con marcha / trote / galope sincronizados con la velocidad real (sin patinar),
// aire (salto/caída), aterrizaje con amortiguación, derrape, olfateo, sentarse, tumbarse a dormir,
// sacudirse, ladrar, jadear, celebrar, mirar objetos cercanos, orejas con física de muelle,
// parpadeo y cola en tirabuzón.

import { BONES, BONE_INDEX } from '../characters/rocky/anatomy.ts'

const NB = BONES.length
const ROOT_OFF = NB * 3

/** Pose: rotaciones (x,y,z) de cada hueso + desplazamiento de la raíz (x,y,z). */
class Pose {
  r = new Float32Array(NB * 3 + 3)
  clear() { this.r.fill(0); return this }
  add(bone: string, x: number, y = 0, z = 0) {
    const i = BONE_INDEX[bone] * 3
    this.r[i] += x; this.r[i + 1] += y; this.r[i + 2] += z
  }
  root(x: number, y: number, z: number) {
    this.r[ROOT_OFF] += x; this.r[ROOT_OFF + 1] += y; this.r[ROOT_OFF + 2] += z
  }
  lerpTo(o: Pose, w: number) {
    if (w <= 0) return
    const a = this.r, b = o.r
    for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * w
  }
  addScaled(o: Pose, w: number) {
    if (w === 0) return
    const a = this.r, b = o.r
    for (let i = 0; i < a.length; i++) a[i] += b[i] * w
  }
}

export interface AnimInput {
  /** Velocidad horizontal en unidades del modelo por segundo. */
  speed: number
  /** Velocidad vertical (modelo/s). */
  vy: number
  grounded: boolean
  /** Velocidad de giro (rad/s, signo = izquierda). */
  turnRate: number
  /** Aceleración longitudinal (modelo/s²). */
  accel: number
  sprinting: boolean
  skidding: boolean
  crouching: boolean
  /** Dirección al objeto de interés en espacio local del perro (o null). */
  look: { x: number; y: number; z: number } | null
}

type OneShot = 'bark' | 'shake' | 'celebrate' | 'land'

const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt))

const smooth = (t: number) => t * t * (3 - 2 * t)

// Desfases de cada pata por tipo de marcha: [delIzq, delDer, traIzq, traDer]
const GAIT_WALK = [0.25, 0.75, 0.0, 0.5]
const GAIT_TROT = [0.0, 0.5, 0.5, 0.0]
const GAIT_GALLOP = [0.0, 0.1, 0.52, 0.62]

export class RockyAnimator {
  private base = new Pose()
  private tmp = new Pose()
  private out = new Pose()
  private phase = 0
  private gaitBlend = 0 // 0 marcha, 1 trote, 2 galope
  private moveW = 0
  private airW = 0
  private sitW = 0
  private lieW = 0
  private sniffW = 0
  private skidW = 0
  private time = 0
  private idleTime = 0
  private pant = 0
  private shots: Record<OneShot, number> = { bark: -1, shake: -1, celebrate: -1, land: -1 }
  private landStrength = 0
  private blinkT = 2
  private blink = 0
  private earL = { a: 0, v: 0, b: 0, bv: 0 }
  private earR = { a: 0, v: 0, b: 0, bv: 0 }
  private lookYaw = 0
  private lookPitch = 0
  private idleLookYaw = 0
  private idleLookTimer = 2
  private prevSpeed = 0
  private wiggle = 0

  /** 'auto' = se sienta y duerme solo; 'sit' = siempre sentado (NPC); 'stand' = nunca se sienta. */
  mode: 'auto' | 'sit' | 'stand' = 'auto'

  /** Estado expuesto para la lógica del juego (p. ej. mostrar "Zzz"). */
  sleeping = false
  sitting = false

  trigger(shot: OneShot, strength = 1) {
    this.shots[shot] = 0
    if (shot === 'land') this.landStrength = Math.min(1.5, strength)
    if (shot !== 'land') this.idleTime = 0
  }

  get isBusy() {
    return this.shots.shake >= 0 || this.shots.celebrate >= 0
  }

  /** Sacudirse / celebrar en curso: el controlador puede bloquear el movimiento. */
  get lockMovement() {
    return this.shots.shake >= 0 && this.shots.shake < 1.0
  }

  wakeUp() {
    this.idleTime = 0
  }

  /** Avanza la animación. Devuelve la pose resultante (rotaciones + raíz). */
  update(dt: number, inp: AnimInput): Float32Array {
    dt = Math.min(dt, 0.05)
    this.time += dt
    const t = this.time
    const sp = inp.speed

    // ---------------- Pesos de estado ----------------
    const moving = sp > 0.03 && inp.grounded
    const active = moving || !inp.grounded || inp.crouching || this.isBusy || this.shots.bark >= 0
    this.idleTime = active ? 0 : this.idleTime + dt
    const wantSit = this.mode === 'sit' || (this.mode === 'auto' && this.idleTime > 6 && this.idleTime < 22)
    const wantLie = this.mode === 'auto' && this.idleTime >= 22
    this.sitting = this.sitW > 0.6
    this.sleeping = this.lieW > 0.8 && this.idleTime > 25

    this.moveW = damp(this.moveW, moving ? 1 : 0, 8, dt)
    this.airW = damp(this.airW, inp.grounded ? 0 : 1, inp.grounded ? 18 : 10, dt)
    this.sitW = damp(this.sitW, wantSit && !wantLie ? 1 : 0, wantSit ? 2.5 : 7, dt)
    this.lieW = damp(this.lieW, wantLie ? 1 : 0, wantLie ? 1.2 : 6, dt)
    this.sniffW = damp(this.sniffW, inp.crouching ? 1 : 0, 7, dt)
    this.skidW = damp(this.skidW, inp.skidding ? 1 : 0, 12, dt)

    // jadeo: sube corriendo, baja en reposo
    this.pant = Math.max(0, Math.min(1, this.pant + (inp.sprinting && moving ? dt * 0.12 : -dt * 0.05)))
    if (this.shots.celebrate >= 0) this.pant = Math.max(this.pant, 0.6)

    // ---------------- Locomoción ----------------
    const targetGait = sp < 0.55 ? 0 : sp < 1.4 ? 1 : 2
    this.gaitBlend = damp(this.gaitBlend, targetGait, 4, dt)
    const g = this.gaitBlend
    const stride = g < 1 ? 0.2 + 0.11 * g : 0.31 + 0.22 * (g - 1)
    const freq = Math.max(0.6, sp / stride)
    if (moving) this.phase = (this.phase + freq * dt) % 1
    const offs = [0, 1, 2, 3].map((i) =>
      g < 1 ? GAIT_WALK[i] + (GAIT_TROT[i] - GAIT_WALK[i]) * g : GAIT_TROT[i] + (GAIT_GALLOP[i] - GAIT_TROT[i]) * (g - 1),
    )
    const duty = g < 1 ? 0.62 - 0.12 * g : 0.5 - 0.12 * (g - 1)
    const amp = (g < 1 ? 0.32 + 0.14 * g : 0.46 + 0.24 * (g - 1)) * Math.min(1, sp / 0.25 + 0.3)

    const P = this.base.clear()
    const legs: [string, string, string, boolean][] = [
      ['upperArmL', 'forearmL', 'handL', true],
      ['upperArmR', 'forearmR', 'handR', true],
      ['thighL', 'shinL', 'footL', false],
      ['thighR', 'shinR', 'footR', false],
    ]
    for (let i = 0; i < 4; i++) {
      const psi = (this.phase + offs[i]) % 1
      let x: number, lift: number
      if (psi < duty) { x = 1 - 2 * (psi / duty); lift = 0 }
      else { const s = (psi - duty) / (1 - duty); x = -1 + 2 * smooth(s); lift = Math.sin(Math.PI * s) }
      const [up, mid, low, front] = legs[i]
      if (front) {
        P.add(up, -amp * x)
        P.add(mid, lift * (0.9 + 0.5 * (g / 2)))
        P.add(low, lift * 1.1 - (1 - lift) * 0.08 * x)
      } else {
        P.add(up, -amp * x * 0.9 - 0.05)
        P.add(mid, lift * 0.9)
        P.add(low, -lift * 0.75 + x * 0.12)
      }
    }
    // balanceo del cuerpo
    const ph2 = this.phase * Math.PI * 2
    const gallop = Math.max(0, g - 1)
    P.root(0, -Math.abs(Math.sin(ph2 * 2)) * 0.006 * (1 - gallop) + Math.sin(ph2) * 0.012 * gallop, 0)
    P.add('root', Math.sin(ph2 + 0.6) * 0.07 * gallop, Math.sin(ph2) * 0.03 * (1 - gallop), Math.sin(ph2) * 0.025 * (1 - gallop))
    P.add('spine', Math.sin(ph2 + 1.2) * 0.1 * gallop)
    P.add('chest', -Math.sin(ph2 + 1.2) * 0.06 * gallop)
    P.add('neck', Math.sin(ph2 * 2) * 0.03 * (1 - gallop) - 0.05 * gallop)
    P.add('head', -Math.sin(ph2 * 2) * 0.03 * (1 - gallop) - Math.sin(ph2 + 0.6) * 0.06 * gallop)
    P.add('tail', 0, Math.sin(ph2 * 2) * 0.3, 0)
    // inclinación en curvas y con la aceleración
    const lean = Math.max(-0.35, Math.min(0.35, -inp.turnRate * sp * 0.12))
    P.add('root', -Math.max(-0.12, Math.min(0.12, inp.accel * 0.02)), 0, lean)

    // ---------------- Reposo (respiración, mirar alrededor) ----------------
    const idle = this.tmp.clear()
    const breath = Math.sin(t * (1.6 + this.pant * 9)) * (0.012 + this.pant * 0.02)
    idle.add('chest', breath * 0.5)
    idle.add('neck', -0.05 + breath * 0.3)
    idle.add('head', 0.05)
    idle.add('upperArmL', 0.02); idle.add('upperArmR', 0.02)
    idle.add('thighL', -0.04); idle.add('thighR', -0.04)
    idle.add('tail', 0, Math.sin(t * 2.2) * 0.15, 0)
    // peso que cambia de pata ocasionalmente
    const shift = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.21) * 0.5
    idle.add('root', 0, 0, shift * 0.025)
    P.lerpTo(idle, 1 - this.moveW)

    // ---------------- Derrape ----------------
    if (this.skidW > 0.01) {
      const sk = this.tmp.clear()
      sk.add('root', -0.18, 0, 0)
      sk.root(0, -0.01, 0)
      sk.add('upperArmL', -0.75); sk.add('upperArmR', -0.7)
      sk.add('forearmL', 0.15); sk.add('forearmR', 0.15)
      sk.add('thighL', -0.55); sk.add('thighR', -0.5)
      sk.add('shinL', 0.4); sk.add('shinR', 0.4)
      sk.add('neck', -0.2); sk.add('head', -0.1)
      P.lerpTo(sk, this.skidW)
    }

    // ---------------- Olfatear / agacharse ----------------
    if (this.sniffW > 0.01) {
      const sn = this.tmp.clear()
      sn.root(0, -0.03, 0)
      sn.add('root', 0.12)
      sn.add('chest', 0.12)
      sn.add('neck', 0.62)
      sn.add('head', 0.42 + Math.sin(t * 22) * 0.03, Math.sin(t * 1.7) * 0.25)
      sn.add('jaw', 0.03 + Math.max(0, Math.sin(t * 22)) * 0.03)
      sn.add('upperArmL', -0.25); sn.add('upperArmR', -0.25)
      sn.add('forearmL', 0.35); sn.add('forearmR', 0.35)
      sn.add('handL', -0.1); sn.add('handR', -0.1)
      sn.add('earL', 0.35); sn.add('earR', 0.35)
      sn.add('tail', 0, Math.sin(t * 9) * 0.4, 0)
      // si camina olfateando conserva el movimiento de patas
      const keep = this.moveW * 0.6
      for (const b of ['upperArmL', 'upperArmR', 'thighL', 'thighR', 'forearmL', 'forearmR', 'shinL', 'shinR']) {
        const i = BONE_INDEX[b] * 3
        sn.r[i] += (this.base.r[i]) * keep
      }
      P.lerpTo(sn, this.sniffW)
    }

    // ---------------- Sentado ----------------
    if (this.sitW > 0.01) {
      const s = this.tmp.clear()
      s.root(0, -0.07, -0.045)
      s.add('pelvis', -0.62)
      s.add('spine', 0.08)
      s.add('chest', 0.06)
      s.add('neck', 0.05)
      s.add('head', 0.26 + Math.sin(t * 0.8) * 0.03, Math.sin(t * 0.33) * 0.35)
      s.add('upperArmL', 0.54); s.add('upperArmR', 0.54)
      s.add('handL', -0.05); s.add('handR', -0.05)
      s.add('thighL', -1.05, 0, -0.18); s.add('thighR', -1.05, 0, 0.18)
      s.add('shinL', 1.75); s.add('shinR', 1.75)
      s.add('footL', -0.25); s.add('footR', -0.25)
      s.add('tail', 0.4, Math.sin(t * 2) * 0.2)
      s.add('chest', Math.sin(t * (1.6 + this.pant * 9)) * 0.01)
      P.lerpTo(s, this.sitW)
    }

    // ---------------- Tumbado (dormir) ----------------
    if (this.lieW > 0.01) {
      const l = this.tmp.clear()
      const sleepBreath = Math.sin(t * 1.1) * 0.02
      l.root(0, -0.125, 0)
      l.add('root', 0.02)
      l.add('chest', sleepBreath)
      l.add('upperArmL', -1.35); l.add('upperArmR', -1.35)
      l.add('forearmL', -0.05); l.add('forearmR', -0.05)
      l.add('handL', 1.35); l.add('handR', 1.35)
      l.add('thighL', -0.9, 0, -0.35); l.add('thighR', -0.9, 0, 0.35)
      l.add('shinL', 2.0); l.add('shinR', 2.0)
      l.add('footL', -0.6); l.add('footR', -0.6)
      l.add('neck', 0.42)
      l.add('head', 0.2 + sleepBreath, 0.25)
      l.add('earL', -0.25, 0, 0.25); l.add('earR', -0.25, 0, -0.25)
      l.add('tail', 0.3)
      P.lerpTo(l, this.lieW)
    }

    // ---------------- Aire ----------------
    if (this.airW > 0.01) {
      const a = this.tmp.clear()
      const up = Math.max(-1, Math.min(1, inp.vy / 1.2)) // >0 subiendo
      const rise = (up + 1) / 2
      a.add('root', -0.2 * rise + 0.12 * (1 - rise))
      a.add('upperArmL', -0.8 * rise - 0.45 * (1 - rise)); a.add('upperArmR', -0.75 * rise - 0.45 * (1 - rise))
      a.add('forearmL', 1.1 * rise + 0.15 * (1 - rise)); a.add('forearmR', 1.0 * rise + 0.15 * (1 - rise))
      a.add('handL', 0.6 * rise); a.add('handR', 0.6 * rise)
      a.add('thighL', 0.65 * rise - 0.35 * (1 - rise)); a.add('thighR', 0.6 * rise - 0.35 * (1 - rise))
      a.add('shinL', -0.3 * rise + 0.3 * (1 - rise)); a.add('shinR', -0.3 * rise + 0.3 * (1 - rise))
      a.add('neck', -0.15 * rise); a.add('head', 0.1 * (1 - rise))
      a.add('earL', -0.5 * rise + 0.3 * (1 - rise)); a.add('earR', -0.5 * rise + 0.3 * (1 - rise))
      a.add('tail', -0.3)
      a.add('jaw', 0.12 * rise)
      P.lerpTo(a, this.airW)
    }

    // ---------------- Disparos únicos ----------------
    const out = this.out.clear()
    out.addScaled(P, 1)

    // aterrizaje: amortiguación con rebote
    if (this.shots.land >= 0) {
      const lt = (this.shots.land += dt)
      const k = Math.exp(-lt * 9) * Math.sin(lt * 18 + 0.4) * this.landStrength
      out.root(0, -0.03 * k, 0)
      out.add('upperArmL', 0.1 * k); out.add('upperArmR', 0.1 * k)
      out.add('forearmL', -0.3 * k); out.add('forearmR', -0.3 * k)
      out.add('thighL', -0.25 * k); out.add('thighR', -0.25 * k)
      out.add('shinL', 0.45 * k); out.add('shinR', 0.45 * k)
      out.add('neck', 0.15 * k); out.add('head', 0.1 * k)
      out.add('earL', 0.6 * k); out.add('earR', 0.6 * k)
      this.earL.v += 6 * k * dt * 60 * 0.02; this.earR.v += 6 * k * dt * 60 * 0.02
      if (lt > 0.6) this.shots.land = -1
    }

    // ladrido
    if (this.shots.bark >= 0) {
      const bt = (this.shots.bark += dt)
      const k = bt < 0.08 ? bt / 0.08 : Math.max(0, 1 - (bt - 0.08) / 0.3)
      out.add('jaw', 0.42 * k)
      out.add('head', -0.22 * k)
      out.add('neck', -0.12 * k)
      out.add('chest', -0.05 * k)
      out.root(0, 0, -0.01 * k)
      out.add('earL', -0.35 * k); out.add('earR', -0.35 * k)
      if (bt > 0.45) this.shots.bark = -1
    }

    // sacudirse (el movimiento recorre el cuerpo de la cabeza a la cola)
    if (this.shots.shake >= 0) {
      const st = (this.shots.shake += dt)
      const env = Math.sin(Math.min(1, st / 1.1) * Math.PI)
      const w = 2 * Math.PI * 6.5
      out.add('head', 0, Math.sin(w * st) * 0.35 * env, Math.sin(w * st) * 0.45 * env)
      out.add('neck', 0, 0, Math.sin(w * st - 0.6) * 0.35 * env)
      out.add('chest', 0, 0, Math.sin(w * st - 1.2) * 0.3 * env)
      out.add('spine', 0, 0, Math.sin(w * st - 1.8) * 0.25 * env)
      out.add('pelvis', 0, 0, Math.sin(w * st - 2.4) * 0.2 * env)
      out.add('earL', 0.3 * Math.sin(w * st * 1.3) * env, 0, 0.6 * Math.sin(w * st) * env)
      out.add('earR', 0.3 * Math.sin(w * st * 1.3 + 1) * env, 0, 0.6 * Math.sin(w * st + 0.5) * env)
      out.add('jaw', 0.08 * env)
      if (st > 1.25) this.shots.shake = -1
    }

    // celebración: reverencia de juego + saltitos felices
    if (this.shots.celebrate >= 0) {
      const ct = (this.shots.celebrate += dt)
      const bow = ct < 0.55 ? Math.sin((ct / 0.55) * Math.PI) : 0
      out.root(0, -0.05 * bow, 0)
      out.add('root', 0.3 * bow)
      out.add('upperArmL', -1.0 * bow); out.add('upperArmR', -1.0 * bow)
      out.add('forearmL', -0.2 * bow); out.add('forearmR', -0.2 * bow)
      out.add('neck', -0.4 * bow); out.add('head', -0.1 * bow)
      if (ct >= 0.55) {
        const hop = Math.abs(Math.sin((ct - 0.55) * Math.PI * 3.2))
        const fade = Math.max(0, 1 - (ct - 0.55) / 1.3)
        out.root(0, 0.06 * hop * fade, 0)
        out.add('root', -0.35 * fade)
        out.add('upperArmL', -0.9 * fade * hop); out.add('upperArmR', -0.9 * fade * hop)
        out.add('forearmL', 1.2 * fade * hop); out.add('forearmR', 1.2 * fade * hop)
        out.add('neck', -0.25 * fade); out.add('head', -0.2 * fade)
        out.add('jaw', 0.3 * fade)
      }
      this.wiggle = 1
      if (ct > 1.9) this.shots.celebrate = -1
    }

    // ---------------- Capas aditivas ----------------
    // jadeo: boca abierta y lengua fuera
    const pantOpen = Math.max(this.pant > 0.25 ? (this.pant - 0.25) * 1.3 : 0, this.shots.celebrate >= 0 ? 0.8 : 0)
    if (pantOpen > 0 && this.lieW < 0.5) {
      out.add('jaw', pantOpen * (0.2 + Math.sin(t * 14) * 0.04))
      out.add('chest', Math.sin(t * 14) * 0.012 * pantOpen)
    }
    this.tongueOut = damp(this.tongueOut, pantOpen > 0.1 && this.lieW < 0.5 ? Math.min(1, pantOpen + 0.3) : 0, 6, dt)

    // meneo del trasero (los bulldogs mueven todo el culete al no tener cola)
    this.wiggle = Math.max(0, this.wiggle - dt * 0.6)
    if (this.wiggle > 0) {
      const wv = Math.sin(t * 22) * this.wiggle
      out.add('pelvis', 0, wv * 0.12, wv * 0.04)
      out.add('tail', 0, wv * 0.8, 0)
    }

    // mirar el objeto de interés o mirar alrededor en reposo
    let ty = 0, tp = 0
    if (inp.look && this.lieW < 0.5) {
      ty = Math.atan2(inp.look.x, inp.look.z)
      tp = -Math.atan2(inp.look.y, Math.hypot(inp.look.x, inp.look.z))
      if (Math.abs(ty) > 1.6) ty = 0
    } else if (!moving && this.lieW < 0.5) {
      this.idleLookTimer -= dt
      if (this.idleLookTimer < 0) {
        this.idleLookTimer = 1.5 + Math.random() * 3
        this.idleLookYaw = Math.random() < 0.4 ? 0 : (Math.random() - 0.5) * 1.4
      }
      ty = this.idleLookYaw
    }
    ty = Math.max(-1, Math.min(1, ty)) * (1 - this.sniffW)
    tp = Math.max(-0.5, Math.min(0.5, tp)) * (1 - this.sniffW)
    this.lookYaw = damp(this.lookYaw, ty, 5, dt)
    this.lookPitch = damp(this.lookPitch, tp, 5, dt)
    out.add('neck', this.lookPitch * 0.4, this.lookYaw * 0.4, 0)
    out.add('head', this.lookPitch * 0.6, this.lookYaw * 0.6, -this.lookYaw * 0.12)

    // orejas: muelles amortiguados excitados por el movimiento, viento hacia atrás al correr
    const accelKick = (sp - this.prevSpeed) / Math.max(dt, 1e-3)
    this.prevSpeed = sp
    const wind = Math.min(1, sp / 2) * -0.35
    const updEar = (e: { a: number; v: number; b: number; bv: number }, side: number) => {
      const target = wind + (this.sniffW * 0.2)
      e.v += (-(e.a - target) * 160 - e.v * 9) * dt - accelKick * 0.0015 + (inp.grounded ? 0 : inp.vy * -0.02)
      e.a += e.v * dt
      e.bv += (-(e.b) * 120 - e.bv * 8) * dt + side * inp.turnRate * 0.04
      e.b += e.bv * dt
      // tic aleatorio en reposo
      if (!moving && Math.random() < dt * 0.25) e.v += (Math.random() - 0.3) * 4
    }
    updEar(this.earL, 1)
    updEar(this.earR, -1)
    out.add('earL', this.earL.a, 0, -this.earL.b * 0.6)
    out.add('earR', this.earR.a, 0, this.earR.b * 0.6)

    // parpadeo
    this.blinkT -= dt
    if (this.blinkT < 0) { this.blinkT = 2 + Math.random() * 4; this.blink = 1 }
    this.blink = Math.max(0, this.blink - dt * 7)
    const blinkAmt = this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0
    this.lidClose = Math.max(blinkAmt, this.lieW > 0.7 && this.idleTime > 24 ? 1 : this.lieW * 0.5, this.shots.shake >= 0 ? 0.7 : 0)

    return out.r
  }

  tongueOut = 0
  lidClose = 0
}

export const ROOT_OFFSET_INDEX = ROOT_OFF
export const BONE_COUNT = NB
