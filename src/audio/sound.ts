// Lightweight Web Audio SFX. Everything is synthesized on the fly, so the
// vertical slice ships zero audio assets. All entry points are no-ops until the
// player interacts (browsers require a gesture before audio can start).

export type SoundName =
  | 'pitch'
  | 'hit_weak'
  | 'hit_solid'
  | 'homer'
  | 'whiff'
  | 'out'
  | 'cheer'
  | 'wall';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  /** Must be called from a user gesture (click / keypress / touch). */
  resume(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    switch (name) {
      case 'pitch':
        this.blip(now, 220, 180, 'sine', 0.12);
        break;
      case 'whiff':
        this.noise(now, 0.18, 0.2);
        break;
      case 'hit_weak':
        this.blip(now, 180, 90, 'triangle', 0.3);
        break;
      case 'hit_solid':
        this.blip(now, 320, 140, 'square', 0.35);
        break;
      case 'homer':
        this.blip(now, 300, 520, 'square', 0.4);
        this.blip(now + 0.09, 420, 600, 'square', 0.4);
        this.blip(now + 0.18, 560, 700, 'square', 0.4);
        break;
      case 'out':
        this.blip(now, 200, 120, 'sawtooth', 0.3);
        this.blip(now + 0.12, 150, 90, 'sawtooth', 0.3);
        break;
      case 'cheer':
        this.noise(now, 0.6, 0.25);
        break;
      case 'wall':
        // A dull clang off the fence: low thump + a short metallic noise burst.
        this.blip(now, 150, 60, 'sawtooth', 0.14);
        this.noise(now, 0.12, 0.22);
        break;
    }
  }

  private blip(
    start: number,
    fromHz: number,
    toHz: number,
    type: OscillatorType,
    dur: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toHz), start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.6, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, level: number): void {
    if (!this.ctx || !this.master) return;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    src.buffer = buffer;
    src.connect(gain).connect(this.master);
    src.start(start);
  }
}

export const sound = new SoundEngine();
