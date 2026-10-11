// Entrada unificada: teclado, ratón (con bloqueo de puntero) y mando (Gamepad API).
// El juego lee "input" cada fotograma; las pulsaciones puntuales se consumen con consume().

export type Action = 'jump' | 'run' | 'interact' | 'bark' | 'sniff' | 'pause'

const KEYMAP: Record<string, Action | 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyE: 'interact',
  KeyF: 'bark',
  KeyC: 'sniff', ControlLeft: 'sniff',
  Escape: 'pause', KeyP: 'pause',
}

class InputState {
  moveX = 0
  moveY = 0
  /** Delta de cámara acumulado (px de ratón o equivalente del stick). */
  lookX = 0
  lookY = 0
  zoom = 0
  held: Record<Action, boolean> = { jump: false, run: false, interact: false, bark: false, sniff: false, pause: false }
  private pressed = new Set<Action>()
  private keys = new Set<string>()
  private padPrev: boolean[] = []
  usingGamepad = false
  enabled = true
  pointerLocked = false
  private attached = false
  /** Tiempo en que se pulsó cada acción (para el búfer de salto). */
  pressTime: Record<string, number> = {}

  attach(target: HTMLElement) {
    if (this.attached) return
    this.attached = true
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code]
      if (!a) return
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      if (a !== 'up' && a !== 'down' && a !== 'left' && a !== 'right') this.press(a)
      this.usingGamepad = false
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      const a = KEYMAP[e.code]
      if (a && a !== 'up' && a !== 'down' && a !== 'left' && a !== 'right') {
        // soltar solo si ninguna otra tecla de la misma acción sigue pulsada
        const still = [...this.keys].some((k) => KEYMAP[k] === a)
        if (!still) this.held[a] = false
      }
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
      ;(Object.keys(this.held) as Action[]).forEach((k) => (this.held[k] = false))
    })
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.enabled) return
      this.lookX += e.movementX
      this.lookY += e.movementY
    })
    target.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY) }, { passive: true })
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === target
    })
    // arrastrar con el ratón también gira la cámara (si el bloqueo de puntero no está disponible)
    let dragging = false
    target.addEventListener('mousedown', (e) => { if (e.button === 2 || !this.pointerLocked) dragging = true })
    window.addEventListener('mouseup', () => { dragging = false })
    window.addEventListener('mousemove', (e) => {
      if (dragging && !this.pointerLocked && this.enabled) { this.lookX += e.movementX; this.lookY += e.movementY }
    })
    target.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  requestPointerLock(target: HTMLElement) {
    try {
      const r = target.requestPointerLock?.() as unknown
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {})
    } catch { /* algunos navegadores lo bloquean */ }
  }

  private press(a: Action) {
    this.held[a] = true
    this.pressed.add(a)
    this.pressTime[a] = performance.now()
  }

  /** Devuelve true una sola vez por pulsación. */
  consume(a: Action): boolean {
    if (this.pressed.has(a)) { this.pressed.delete(a); return true }
    return false
  }

  /** Pulsación ocurrida hace menos de ms milisegundos (búfer de entrada). */
  recentlyPressed(a: Action, ms: number): boolean {
    return this.pressed.has(a) && performance.now() - (this.pressTime[a] ?? 0) < ms
  }

  clearPressed() { this.pressed.clear() }

  /** Llamar una vez por fotograma antes de leer el estado. */
  poll() {
    let mx = 0, my = 0
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const pad = pads && Array.from(pads).find((p) => p && p.connected)
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82)
      const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0)
      const rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0)
      if (lx || ly || rx || ry) this.usingGamepad = true
      if (lx || ly) { mx = lx; my = -ly }
      this.lookX += rx * 14
      this.lookY += ry * 10
      // A=0 salto, B=1 ladrar, X=2 interactuar, Y=3 olfatear, RB/RT=5/7 correr, Start=9 pausa
      const map: [number, Action][] = [[0, 'jump'], [1, 'bark'], [2, 'interact'], [3, 'sniff'], [9, 'pause']]
      const b = pad.buttons.map((x) => x.pressed)
      for (const [i, a] of map) {
        if (b[i] && !this.padPrev[i]) { this.press(a); this.usingGamepad = true }
        if (!b[i] && this.padPrev[i]) this.held[a] = false
      }
      const runPad = !!(b[5] || b[7] || b[10])
      if (runPad) this.held.run = true
      else if (this.padPrev[5] || this.padPrev[7] || this.padPrev[10]) this.held.run = false
      if (b[4] && !this.padPrev[4]) this.zoom -= 1
      if (b[6] && !this.padPrev[6]) this.zoom += 1
      this.padPrev = b
    }
    const len = Math.hypot(mx, my)
    if (len > 1) { mx /= len; my /= len }
    this.moveX = this.enabled ? mx : 0
    this.moveY = this.enabled ? my : 0
  }

  takeLook(): [number, number] {
    const r: [number, number] = [this.lookX, this.lookY]
    this.lookX = 0
    this.lookY = 0
    return r
  }

  takeZoom(): number {
    const z = this.zoom
    this.zoom = 0
    return z
  }

  /** Para pruebas automáticas: simula teclas. */
  simulateKey(code: string, down: boolean) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }))
  }
}

export const input = new InputState()
