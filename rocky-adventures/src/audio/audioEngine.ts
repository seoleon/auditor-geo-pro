// Motor de audio 100 % sintetizado con Web Audio API (sin archivos externos ni licencias).
// Efectos: ladridos, pasos por superficie, saltos, premios, secretos, etc.
// Ambiente: viento, pájaros, agua, ciudad, olas y gaviotas.

import { on, type GameEvent, type Surface } from '../systems/events'
import type { WorldId } from '../systems/save'
import { MusicPlayer } from './music'

class AudioEngine {
  ctx: AudioContext | null = null
  master!: GainNode
  sfx!: GainNode
  musicBus!: GainNode
  ambBus!: GainNode
  private noiseBuf!: AudioBuffer
  private reverb!: ConvolverNode
  private reverbSend!: GainNode
  music: MusicPlayer | null = null
  private ambientNodes: AudioNode[] = []
  private ambientTimers: number[] = []
  private world: WorldId | null = null
  private settings = { music: 0.55, sfx: 0.8, musicMuted: false, sfxMuted: false }

  /** Debe llamarse tras un gesto del usuario (requisito de los navegadores). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 3
    this.master.connect(comp).connect(ctx.destination)
    this.sfx = ctx.createGain()
    this.musicBus = ctx.createGain()
    this.ambBus = ctx.createGain()
    this.sfx.connect(this.master)
    this.musicBus.connect(this.master)
    this.ambBus.connect(this.master)
    // ruido blanco reutilizable
    const len = ctx.sampleRate * 2
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    // reverberación sintética (respuesta al impulso exponencial)
    this.reverb = ctx.createConvolver()
    const irLen = ctx.sampleRate * 1.6
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c)
      for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3)
    }
    this.reverb.buffer = ir
    this.reverbSend = ctx.createGain()
    this.reverbSend.gain.value = 0.25
    this.reverbSend.connect(this.reverb).connect(this.master)
    this.music = new MusicPlayer(ctx, this.musicBus, this.reverbSend)
    this.applyVolumes()
    on((e) => this.onEvent(e))
  }

  setVolumes(music: number, sfx: number, musicMuted: boolean, sfxMuted: boolean) {
    this.settings = { music, sfx, musicMuted, sfxMuted }
    this.applyVolumes()
  }

  private applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.musicBus.gain.setTargetAtTime(this.settings.musicMuted ? 0 : this.settings.music * 0.55, t, 0.1)
    this.sfx.gain.setTargetAtTime(this.settings.sfxMuted ? 0 : this.settings.sfx, t, 0.05)
    this.ambBus.gain.setTargetAtTime(this.settings.sfxMuted ? 0 : this.settings.sfx * 0.6, t, 0.2)
  }

  // ------------------------------------------------------------------ utilidades
  private now() { return this.ctx!.currentTime }

  private noise(dur: number, filterType: BiquadFilterType, freq: number, q: number, gain: number, at = 0, dest?: AudioNode, sweepTo?: number) {
    const ctx = this.ctx!
    const t = this.now() + at
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const f = ctx.createBiquadFilter()
    f.type = filterType
    f.frequency.setValueAtTime(freq, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.2))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(dest ?? this.sfx)
    src.start(t, Math.random() * 1.5)
    src.stop(t + dur + 0.05)
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0, dest?: AudioNode, attack = 0.005) {
    const ctx = this.ctx!
    const t = this.now() + at
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest ?? this.sfx)
    o.start(t)
    o.stop(t + dur + 0.05)
    return o
  }

  private bell(freq: number, at: number, gain = 0.18, dur = 1.2) {
    // FM sencilla para un timbre de campana / celesta
    const ctx = this.ctx!
    const t = this.now() + at
    const car = ctx.createOscillator()
    const mod = ctx.createOscillator()
    const mg = ctx.createGain()
    car.frequency.value = freq
    mod.frequency.value = freq * 3.5
    mg.gain.setValueAtTime(freq * 2, t)
    mg.gain.exponentialRampToValueAtTime(1, t + dur)
    mod.connect(mg).connect(car.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    car.connect(g)
    g.connect(this.sfx)
    g.connect(this.reverbSend)
    car.start(t); mod.start(t)
    car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1)
  }

  // ------------------------------------------------------------------ efectos
  bark() {
    if (!this.ctx) return
    const ctx = this.ctx
    const pitch = 0.9 + Math.random() * 0.2
    for (const [at, scale] of [[0, 1], [0.16, 0.8]] as const) {
      const t = this.now() + at
      // cuerda vocal: diente de sierra con caída de tono
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(430 * pitch, t)
      o.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.13)
      // formantes del "guau"
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 3
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1700; f2.Q.value = 4
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.9 * scale, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      o.connect(f1).connect(g)
      o.connect(f2).connect(g)
      g.connect(this.sfx)
      g.connect(this.reverbSend)
      o.start(t); o.stop(t + 0.2)
      this.noise(0.08, 'bandpass', 2200, 1.5, 0.25 * scale, at)
    }
  }

  step(surface: Surface, run: boolean) {
    if (!this.ctx) return
    const v = run ? 1 : 0.6
    switch (surface) {
      case 'grass': this.noise(0.06, 'highpass', 2500 + Math.random() * 1500, 0.7, 0.05 * v); break
      case 'wood': this.tone('triangle', 190 + Math.random() * 30, 120, 0.06, 0.12 * v); this.noise(0.03, 'bandpass', 900, 2, 0.06 * v); break
      case 'sand': this.noise(0.09, 'lowpass', 1400, 0.8, 0.08 * v); break
      case 'stone': this.noise(0.035, 'bandpass', 3200, 3, 0.07 * v); this.tone('sine', 400, 300, 0.03, 0.03 * v); break
      case 'water': this.noise(0.12, 'bandpass', 900, 1, 0.12 * v, 0, undefined, 400); break
    }
  }

  onEvent(e: GameEvent) {
    if (!this.ctx || this.ctx.state !== 'running') return
    switch (e.type) {
      case 'bark': this.bark(); break
      case 'step': this.step(e.surface, e.run); break
      case 'jump': this.tone('sine', 320, 620, 0.16, 0.12); this.noise(0.05, 'bandpass', 1500, 1, 0.05); break
      case 'land': this.tone('sine', 140, 55, 0.12, 0.25 * Math.min(1, e.strength)); this.step(e.surface, true); break
      case 'collect':
        if (e.kind === 'bone') [1047, 1319, 1568, 2093].forEach((f, i) => this.bell(f, i * 0.07, 0.16, 0.9))
        else { this.noise(0.05, 'bandpass', 2500, 2, 0.15); this.noise(0.05, 'bandpass', 3000, 2, 0.12, 0.06); this.bell(e.kind === 'shell' ? 1760 : 1568, 0.04, 0.1, 0.6) }
        break
      case 'secret': [523, 659, 784, 988, 1175, 1568].forEach((f, i) => this.bell(f, i * 0.09, 0.12, 1.4)); break
      case 'checkpoint': [392, 494, 587, 784].forEach((f) => this.tone('triangle', f, f, 1.2, 0.07, 0, undefined, 0.15)); this.bell(1568, 0.2, 0.1); break
      case 'hurt': this.tone('square', 600, 180, 0.3, 0.08); this.bark(); break
      case 'stomp': this.tone('sine', 220, 880, 0.18, 0.2); this.noise(0.06, 'lowpass', 600, 1, 0.2); break
      case 'break': for (let i = 0; i < 4; i++) this.noise(0.08, 'bandpass', 600 + i * 400, 2, 0.25, i * 0.03); this.tone('triangle', 160, 70, 0.2, 0.18); break
      case 'splash': this.noise(0.5, 'lowpass', 3000, 0.7, 0.3, 0, undefined, 300); break
      case 'mission': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.18, 0.05, i * 0.11)); break
      case 'gate': [131, 196, 262, 330, 392].forEach((f, i) => this.tone('sawtooth', f, f, 2.5, 0.04, i * 0.05, undefined, 0.4)); this.noise(2, 'lowpass', 200, 1, 0.3); break
      case 'victory': [523, 659, 784, 1047, 988, 1047, 1319, 1568].forEach((f, i) => this.bell(f, i * 0.13, 0.13, 1.2)); break
      case 'dig': for (let i = 0; i < 5; i++) this.noise(0.07, 'bandpass', 900 + Math.random() * 600, 1.5, 0.15, i * 0.09); break
      case 'bell': this.bell([784, 988, 1175, 1568][e.note] ?? 880, 0, 0.25, 2); break
      case 'squirrel': for (let i = 0; i < 6; i++) this.tone('square', 2400 + Math.random() * 800, 1800, 0.035, 0.03, i * 0.05); break
      case 'skid': this.noise(0.35, 'bandpass', 1800, 1.5, 0.1, 0, undefined, 700); break
      case 'shake': for (let i = 0; i < 8; i++) this.noise(0.05, 'bandpass', 1200, 1, 0.05, i * 0.09); break
    }
  }

  // ------------------------------------------------------------------ ambiente y música
  setWorld(world: WorldId | null) {
    if (!this.ctx) return
    if (this.world === world) return
    this.world = world
    this.stopAmbient()
    this.music?.play(world)
    if (!world) return
    const ctx = this.ctx
    // viento: ruido filtrado con modulación lenta
    const windSrc = ctx.createBufferSource()
    windSrc.buffer = this.noiseBuf
    windSrc.loop = true
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = world === 'city' ? 300 : 500; wf.Q.value = 0.8
    const wg = ctx.createGain(); wg.gain.value = world === 'beach' ? 0.05 : 0.035
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07
    const lfoG = ctx.createGain(); lfoG.gain.value = 250
    lfo.connect(lfoG).connect(wf.frequency)
    windSrc.connect(wf).connect(wg).connect(this.ambBus)
    windSrc.start(); lfo.start()
    this.ambientNodes.push(windSrc, lfo)

    if (world === 'beach') {
      // olas: ruido con envolvente lenta tipo resaca
      const ws = ctx.createBufferSource(); ws.buffer = this.noiseBuf; ws.loop = true
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900
      const g = ctx.createGain(); g.gain.value = 0.0
      const swell = ctx.createOscillator(); swell.frequency.value = 0.11
      const sg = ctx.createGain(); sg.gain.value = 0.09
      const off = ctx.createConstantSource(); off.offset.value = 0.1
      swell.connect(sg).connect(g.gain); off.connect(g.gain)
      ws.connect(f).connect(g).connect(this.ambBus)
      ws.start(); swell.start(); off.start()
      this.ambientNodes.push(ws, swell, off)
    }
    if (world === 'city') {
      const hs = ctx.createBufferSource(); hs.buffer = this.noiseBuf; hs.loop = true
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160
      const g = ctx.createGain(); g.gain.value = 0.06
      hs.connect(f).connect(g).connect(this.ambBus); hs.start()
      this.ambientNodes.push(hs)
    }
    if (world === 'park') {
      // murmullo del agua de la fuente/lago
      const ws = ctx.createBufferSource(); ws.buffer = this.noiseBuf; ws.loop = true
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6
      const g = ctx.createGain(); g.gain.value = 0.012
      ws.connect(f).connect(g).connect(this.ambBus); ws.start()
      this.ambientNodes.push(ws)
    }
    // sonidos esporádicos: pájaros, gaviotas, claxon lejano
    const schedule = () => {
      if (!this.ctx || this.world !== world) return
      if (world === 'park') this.birdChirp()
      else if (world === 'beach') this.gull()
      else if (Math.random() < 0.35) this.distantHorn(); else this.birdChirp(0.4)
      const id = window.setTimeout(schedule, 1200 + Math.random() * 3800)
      this.ambientTimers.push(id)
    }
    const id = window.setTimeout(schedule, 800)
    this.ambientTimers.push(id)
  }

  private birdChirp(vol = 1) {
    const ctx = this.ctx!
    const n = 2 + Math.floor(Math.random() * 4)
    const base = 2600 + Math.random() * 1800
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1
    pan.connect(this.ambBus)
    for (let i = 0; i < n; i++) {
      const t = this.now() + i * (0.09 + Math.random() * 0.05)
      const o = ctx.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(base, t)
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.05)
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.08)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.03 * vol, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
      o.connect(g).connect(pan)
      o.start(t); o.stop(t + 0.12)
    }
  }

  private gull() {
    const ctx = this.ctx!
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1
    pan.connect(this.ambBus)
    for (let i = 0; i < 3; i++) {
      const t = this.now() + i * 0.28
      const o = ctx.createOscillator(); o.type = 'sawtooth'
      o.frequency.setValueAtTime(1100, t)
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.06)
      o.frequency.exponentialRampToValueAtTime(800, t + 0.22)
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 2
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.02, t + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
      o.connect(f).connect(g).connect(pan)
      o.start(t); o.stop(t + 0.3)
    }
  }

  private distantHorn() {
    const ctx = this.ctx!
    const t = this.now()
    for (const f of [392, 494]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.008, t + 0.05)
      g.gain.setValueAtTime(0.008, t + 0.3)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
      o.connect(lp).connect(g).connect(this.ambBus)
      o.start(t); o.stop(t + 0.5)
    }
  }

  private stopAmbient() {
    this.ambientNodes.forEach((n) => { try { (n as AudioScheduledSourceNode).stop() } catch { /* ya parado */ } n.disconnect() })
    this.ambientNodes = []
    this.ambientTimers.forEach((id) => clearTimeout(id))
    this.ambientTimers = []
  }

  /** Música del menú principal. */
  menuMusic() {
    if (!this.ctx) return
    this.world = null
    this.stopAmbient()
    this.music?.play('menu')
  }
}

export const audio = new AudioEngine()
