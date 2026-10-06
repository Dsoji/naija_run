// Tiny Web Audio sound bank (spec §6): synthesized placeholder SFX + a simple
// looping bassline — no asset files. The AudioContext can only start after a
// user gesture, so resume() is called from the start button. A single master
// gain implements mute (persisted in localStorage).

export type SfxName = 'pickup' | 'jump' | 'crash' | 'horn' | 'siren'

const MUTE_KEY = 'naijaRun.muted'

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicTimer = 0
  private musicStep = 0
  muted = false

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      this.muted = false
    }
  }

  /** Create/resume the context (call from a user gesture, e.g. the start tap). */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 1
      this.master.connect(this.ctx.destination)
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = 0.06
      this.musicGain.connect(this.master)
    }
    void this.ctx.resume()
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 1
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  play(name: SfxName): void {
    if (!this.ctx || !this.master || this.muted) return
    switch (name) {
      case 'pickup':
        this.blip(880, 0.08, 'sine', 1320)
        break
      case 'jump':
        this.blip(330, 0.18, 'triangle', 720)
        break
      case 'crash':
        this.noise(0.35)
        break
      case 'horn':
        this.blip(196, 0.28, 'sawtooth')
        break
      case 'siren':
        this.siren(0.9)
        break
      default:
        break
    }
  }

  startMusic(): void {
    if (!this.ctx || this.musicTimer) return
    const notes = [110, 110, 146.8, 110, 164.8, 146.8, 130.8, 110] // a looping A-minor-ish bass
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.muted) return
      const f = notes[this.musicStep % notes.length]
      this.musicStep++
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = 'triangle'
      o.frequency.value = f
      const t = this.ctx.currentTime
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(1, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
      o.connect(g)
      g.connect(this.musicGain)
      o.start(t)
      o.stop(t + 0.3)
    }, 300)
  }

  stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer)
      this.musicTimer = 0
    }
  }

  // --- synth helpers ---------------------------------------------------------

  private blip(freq: number, dur: number, type: OscillatorType, sweepTo?: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const t = ctx.currentTime
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.master!)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private noise(dur: number): void {
    const ctx = this.ctx!
    const frames = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = 0.7
    src.connect(g)
    g.connect(this.master!)
    src.start()
  }

  private siren(dur: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const t = ctx.currentTime
    o.type = 'square'
    o.frequency.setValueAtTime(700, t)
    o.frequency.linearRampToValueAtTime(1100, t + dur / 2)
    o.frequency.linearRampToValueAtTime(700, t + dur)
    g.gain.setValueAtTime(0.25, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.master!)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
}
