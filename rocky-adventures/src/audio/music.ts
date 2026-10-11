// Secuenciador de música original sintetizada: una pieza distinta por mundo y otra para el menú.
// Planificación con antelación (lookahead) sobre el reloj de Web Audio para un ritmo estable.

type Song = {
  bpm: number
  swing: number
  /** Acordes por compás (notas MIDI). */
  chords: number[][]
  /** Melodía en corcheas: nota MIDI, 0 = silencio, -1 = mantener. 8 por compás. */
  melody: number[]
  bass: 'bounce' | 'walk' | 'calypso' | 'soft'
  lead: OscillatorType
  pluck: OscillatorType
  drums: 'pop' | 'swing' | 'calypso' | 'none'
  leadGain: number
}

const m = (s: string) => s.trim().split(/\s+/).map((x) => (x === '.' ? -1 : x === '_' ? 0 : Number(x)))

const SONGS: Record<string, Song> = {
  menu: {
    bpm: 92, swing: 0, bass: 'soft', lead: 'triangle', pluck: 'sine', drums: 'none', leadGain: 0.09,
    chords: [[53, 57, 60, 64], [50, 57, 60, 65], [46, 53, 58, 62], [48, 55, 60, 64]],
    melody: m(`
      72 . 76 . 77 . 76 74 | 72 . . . 69 . 72 . | 74 . 72 . 70 . 69 . | 67 . . . . . _ _
      72 . 76 . 79 . 77 76 | 74 . . . 77 . 76 . | 74 . 72 . 70 . 74 . | 72 . . . . . _ _`.replace(/\|/g, '')),
  },
  park: {
    bpm: 116, swing: 0.08, bass: 'bounce', lead: 'triangle', pluck: 'triangle', drums: 'pop', leadGain: 0.1,
    chords: [[53, 57, 60], [46, 50, 53], [48, 52, 55], [53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55], [48, 52, 55, 58]],
    melody: m(`
      69 72 77 76 74 72 69 72 | 74 . 70 74 77 . 74 . | 76 . 72 76 79 77 76 74 | 72 . 69 . 65 . _ _
      77 76 74 69 74 76 77 81 | 79 77 74 70 74 . 77 . | 76 79 76 72 74 76 77 79 | 81 . 79 . 76 . 72 .`.replace(/\|/g, '')),
  },
  city: {
    bpm: 104, swing: 0.2, bass: 'walk', lead: 'square', pluck: 'triangle', drums: 'swing', leadGain: 0.06,
    chords: [[46, 50, 53, 57], [43, 46, 50, 53], [48, 51, 55, 58], [41, 45, 48, 51], [51, 55, 58, 62], [52, 55, 58, 61], [46, 50, 53, 57], [41, 45, 48, 51]],
    melody: m(`
      70 . 74 77 . 74 72 70 | 74 . . 70 72 . 74 . | 75 . 72 . 70 72 75 79 | 77 . . . 75 . 74 .
      79 . 77 75 . 74 75 77 | 79 . 76 . 73 . 70 . | 74 72 70 . 77 . 74 . | 72 . . . _ _ _ _`.replace(/\|/g, '')),
  },
  beach: {
    bpm: 124, swing: 0.05, bass: 'calypso', lead: 'sine', pluck: 'sine', drums: 'calypso', leadGain: 0.13,
    chords: [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55], [57, 60, 64], [53, 57, 60], [55, 59, 62, 65], [48, 52, 55]],
    melody: m(`
      72 . 76 . 79 76 . 72 | 77 . 81 . 79 77 76 74 | 74 . 79 . 83 79 77 74 | 76 . 72 . _ 72 74 76
      76 . 81 . 79 76 72 76 | 77 . 74 . 72 74 77 81 | 79 . 77 . 74 . 71 74 | 72 . . . _ _ _ _`.replace(/\|/g, '')),
  },
}

const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

export class MusicPlayer {
  private song: Song | null = null
  private name: string | null = null
  private step = 0
  private nextTime = 0
  private timer: number | null = null
  private out: GainNode
  private noise: AudioBuffer

  constructor(private ctx: AudioContext, dest: AudioNode, private reverb: AudioNode) {
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(dest)
    const len = ctx.sampleRate
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }

  play(name: string | null) {
    if (name === this.name) return
    const t = this.ctx.currentTime
    // fundido de salida y cambio de pieza
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setTargetAtTime(0, t, 0.25)
    const start = () => {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      this.name = name
      this.song = name ? SONGS[name] ?? null : null
      if (!this.song) return
      this.step = 0
      this.nextTime = this.ctx.currentTime + 0.1
      this.out.gain.setTargetAtTime(1, this.ctx.currentTime, 0.6)
      this.timer = window.setInterval(() => this.schedule(), 30)
    }
    if (this.name) window.setTimeout(start, 700)
    else start()
    this.name = name
  }

  private schedule() {
    const s = this.song
    if (!s) return
    const eighth = 60 / s.bpm / 2
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const swingOff = this.step % 2 === 1 ? eighth * s.swing : 0
      this.playStep(this.step, this.nextTime + swingOff, eighth)
      this.nextTime += eighth
      this.step++
    }
  }

  private playStep(step: number, t: number, eighth: number) {
    const s = this.song!
    const bars = s.chords.length
    const bar = Math.floor(step / 8) % bars
    const beat = step % 8
    const chord = s.chords[bar]
    // ---- melodía (la pieza se repite; la segunda vuelta va una octava variada en el adorno) ----
    const mi = step % s.melody.length
    const note = s.melody[mi]
    if (note > 0) {
      let len = 1
      while (s.melody[(mi + len) % s.melody.length] === -1 && len < 8) len++
      this.lead(mtof(note), t, len * eighth * 0.95, s)
    }
    // ---- acompañamiento ----
    if (s.bass === 'soft') {
      if (beat === 0) chord.forEach((n, i) => this.pad(mtof(n), t + i * 0.03, eighth * 8))
      if (beat === 0 || beat === 4) this.bassNote(mtof(chord[0] - 12), t, eighth * 3.5, 0.12)
    } else if (s.bass === 'bounce') {
      if (beat % 2 === 0) this.bassNote(mtof(chord[0] - 12 + (beat === 4 ? 7 : 0)), t, eighth * 0.9, 0.2)
      if (beat % 2 === 1) chord.forEach((n) => this.pluck(mtof(n + 12), t, eighth * 0.8, s.pluck, 0.035))
    } else if (s.bass === 'walk') {
      const walk = [0, 4, 7, 9]
      if (beat % 2 === 0) this.bassNote(mtof(chord[0] - 12 + walk[beat / 2]), t, eighth * 1.8, 0.2)
      if (beat === 1 || beat === 5) chord.forEach((n) => this.pluck(mtof(n + 12), t, eighth * 1.2, 'triangle', 0.03))
    } else if (s.bass === 'calypso') {
      if (beat === 0 || beat === 3 || beat === 6) this.bassNote(mtof(chord[0] - 12 + (beat === 3 ? 7 : 0)), t, eighth * 1.2, 0.2)
      if (beat === 2 || beat === 5 || beat === 7) chord.forEach((n) => this.marimba(mtof(n + 12), t, 0.045))
    }
    // ---- percusión ----
    if (s.drums === 'pop') {
      if (beat === 0 || beat === 4) this.kick(t)
      if (beat === 2 || beat === 6) this.snare(t, 0.08)
      this.hat(t, beat % 2 ? 0.02 : 0.035)
    } else if (s.drums === 'swing') {
      if (beat === 0 || beat === 4) this.kick(t, 0.5)
      if (beat === 2 || beat === 6) this.snare(t, 0.04, true)
      if (beat % 2 === 0 || beat === 3 || beat === 7) this.hat(t, 0.025, 6000)
    } else if (s.drums === 'calypso') {
      if (beat === 0 || beat === 3 || beat === 4) this.kick(t, 0.6)
      if (beat === 2 || beat === 6) this.snare(t, 0.05, true)
      this.shaker(t)
    }
  }

  private env(t: number, dur: number, peak: number, attack = 0.01) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, dur))
    return g
  }

  private lead(f: number, t: number, dur: number, s: Song) {
    const o = this.ctx.createOscillator()
    o.type = s.lead
    o.frequency.value = f
    const vib = this.ctx.createOscillator(); vib.frequency.value = 5.5
    const vg = this.ctx.createGain(); vg.gain.value = f * 0.006
    vib.connect(vg).connect(o.frequency)
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = s.lead === 'square' ? 2200 : 5000
    const g = this.env(t, dur + 0.12, s.leadGain, 0.015)
    o.connect(lp).connect(g)
    g.connect(this.out); g.connect(this.reverb)
    if (s.lead === 'sine') {
      // armónico metálico tipo "steel drum"
      const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01
      const g2 = this.env(t, dur * 0.6, s.leadGain * 0.35, 0.005)
      o2.connect(g2).connect(this.out)
      o2.start(t); o2.stop(t + dur + 0.2)
    }
    o.start(t); vib.start(t)
    o.stop(t + dur + 0.2); vib.stop(t + dur + 0.2)
  }

  private pluck(f: number, t: number, dur: number, type: OscillatorType, gain: number) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(600, t + dur)
    const g = this.env(t, dur, gain, 0.004)
    o.connect(lp).connect(g).connect(this.out)
    o.start(t); o.stop(t + dur + 0.05)
  }

  private marimba(f: number, t: number, gain: number) {
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4
    const g = this.env(t, 0.35, gain, 0.003)
    const g2 = this.env(t, 0.08, gain * 0.4, 0.002)
    o.connect(g).connect(this.out); o2.connect(g2).connect(this.out)
    o.start(t); o2.start(t); o.stop(t + 0.4); o2.stop(t + 0.1)
  }

  private pad(f: number, t: number, dur: number) {
    for (const det of [-6, 6]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
      const g = this.env(t, dur, 0.018, dur * 0.35)
      o.connect(lp).connect(g)
      g.connect(this.out); g.connect(this.reverb)
      o.start(t); o.stop(t + dur + 0.1)
    }
  }

  private bassNote(f: number, t: number, dur: number, gain: number) {
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f / 2
    const g = this.env(t, dur, gain, 0.008)
    o.connect(g); o2.connect(g)
    g.connect(this.out)
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05)
  }

  private kick(t: number, gain = 0.7) {
    const o = this.ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    const g = this.env(t, 0.18, gain * 0.5, 0.002)
    o.connect(g).connect(this.out)
    o.start(t); o.stop(t + 0.2)
  }

  private noiseHit(t: number, dur: number, type: BiquadFilterType, freq: number, gain: number) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq
    const g = this.env(t, dur, gain, 0.002)
    src.connect(f).connect(g).connect(this.out)
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02)
  }

  private snare(t: number, gain: number, brush = false) {
    this.noiseHit(t, brush ? 0.14 : 0.12, brush ? 'highpass' : 'bandpass', brush ? 3000 : 1800, gain)
  }

  private hat(t: number, gain: number, freq = 8000) {
    this.noiseHit(t, 0.03, 'highpass', freq, gain)
  }

  private shaker(t: number) {
    this.noiseHit(t, 0.05, 'highpass', 6000, 0.018)
  }
}
