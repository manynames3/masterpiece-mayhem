/**
 * Fully synthesized audio (no sample downloads): short SFX built from oscillators and filtered
 * noise, continuous "work" loops (scrub, vacuum, spray, flow) driven by intensity, and a soft
 * generative music-box ambience. Everything is lazily created on the first user gesture.
 */
export type Sfx =
  | 'tap' | 'pop' | 'squish' | 'chime' | 'success' | 'fanfare' | 'whoosh' | 'suck' | 'splash'
  | 'tear' | 'click' | 'error' | 'sparkle' | 'thud' | 'zap' | 'coin' | 'peel' | 'boing' | 'giggle'
  | 'rotate' | 'creak' | 'snap' | 'star';

export type LoopId = 'scrub' | 'vacuum' | 'spray' | 'flow' | 'peel';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private loops = new Map<LoopId, { gain: GainNode; filter: BiquadFilterNode; src: AudioScheduledSourceNode; level: number }>();
  private musicTimer: number | null = null;
  private lastPlayed = new Map<string, number>();
  soundOn = true;
  musicOn = true;

  unlock() {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return; // browsers refuse audio before a real gesture
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.soundOn ? 1 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
    this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
    if (this.musicOn) this.startMusic();
  }

  setSound(on: boolean) {
    this.soundOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.2);
    if (on) this.startMusic(); else this.stopMusic();
  }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private tone(freq: number, type: OscillatorType, start: number, dur: number, vol: number, glideTo?: number, bus?: GainNode) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
    this.env(g, start, 0.006, vol, dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private noise(start: number, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, start);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, start, 0.01, vol, dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(start, Math.random());
    s.stop(start + dur + 0.05);
  }

  play(name: Sfx, opts: { pitch?: number; vol?: number } = {}) {
    if (!this.ctx || !this.soundOn) return;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? 0;
    if (now - last < 0.035) return; // avoid machine-gun stacking
    this.lastPlayed.set(name, now);
    const p = opts.pitch ?? 1;
    const v = opts.vol ?? 1;
    const t = now + 0.005;
    switch (name) {
      case 'tap': this.tone(880 * p, 'triangle', t, 0.06, 0.18 * v); break;
      case 'click': this.tone(1400 * p, 'square', t, 0.025, 0.06 * v); break;
      case 'pop': this.tone(500 * p, 'sine', t, 0.09, 0.35 * v, 1300 * p); break;
      case 'squish': this.noise(t, 0.14, 0.28 * v, 700 * p, 3, 'bandpass', 240 * p); this.tone(220 * p, 'sine', t, 0.12, 0.15 * v, 120 * p); break;
      case 'boing': this.tone(180 * p, 'sine', t, 0.28, 0.3 * v, 520 * p); break;
      case 'chime': [0, 4, 7].forEach((s, i) => this.tone(660 * p * 2 ** (s / 12), 'sine', t + i * 0.06, 0.5, 0.12 * v)); break;
      case 'sparkle': for (let i = 0; i < 4; i++) this.tone(1800 * p * (1 + Math.random() * 0.6), 'sine', t + i * 0.04, 0.18, 0.05 * v); break;
      case 'star': this.tone(990 * p, 'triangle', t, 0.35, 0.2 * v); this.tone(1485 * p, 'sine', t + 0.05, 0.4, 0.12 * v); break;
      case 'coin': this.tone(990 * p, 'square', t, 0.06, 0.07 * v); this.tone(1320 * p, 'square', t + 0.06, 0.14, 0.07 * v); break;
      case 'success': [0, 4, 7, 12].forEach((s, i) => this.tone(523 * p * 2 ** (s / 12), 'triangle', t + i * 0.09, 0.5, 0.16 * v)); break;
      case 'fanfare':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(392 * p * 2 ** (s / 12), 'triangle', t + i * 0.08, 0.7, 0.14 * v));
        [0, 7, 12].forEach((s) => this.tone(196 * 2 ** (s / 12), 'sine', t + 0.56, 1.4, 0.12 * v));
        break;
      case 'whoosh': this.noise(t, 0.5, 0.25 * v, 300, 0.8, 'bandpass', 2400); break;
      case 'suck': this.noise(t, 0.22, 0.3 * v, 2600 * p, 2, 'bandpass', 500); this.tone(700 * p, 'sine', t, 0.18, 0.12 * v, 1600 * p); break;
      case 'splash': this.noise(t, 0.35, 0.35 * v, 1800 * p, 0.7, 'lowpass', 500); break;
      case 'tear': this.noise(t, 0.18, 0.4 * v, 3000, 4, 'bandpass', 900); this.noise(t + 0.05, 0.12, 0.25 * v, 1500, 6); break;
      case 'peel': this.noise(t, 0.25, 0.18 * v, 900 * p, 2, 'bandpass', 2200 * p); break;
      case 'error': this.tone(220 * p, 'sawtooth', t, 0.12, 0.07 * v, 160 * p); this.tone(180 * p, 'sawtooth', t + 0.1, 0.16, 0.07 * v, 120 * p); break;
      case 'thud': this.tone(110 * p, 'sine', t, 0.2, 0.4 * v, 50 * p); this.noise(t, 0.08, 0.2 * v, 300, 1, 'lowpass'); break;
      case 'zap': this.tone(1200 * p, 'sawtooth', t, 0.12, 0.07 * v, 300 * p); break;
      case 'giggle': for (let i = 0; i < 4; i++) this.tone((700 + Math.random() * 200) * p, 'sine', t + i * 0.07, 0.06, 0.12 * v, 900 * p); break;
      case 'rotate': this.tone(600 * p, 'triangle', t, 0.05, 0.12 * v, 800 * p); this.noise(t, 0.05, 0.08 * v, 2500, 3); break;
      case 'creak': this.tone(140 * p, 'sawtooth', t, 0.35, 0.05 * v, 95 * p); break;
      case 'snap': this.noise(t, 0.06, 0.45 * v, 2000, 1.5); this.tone(300, 'square', t, 0.05, 0.08 * v, 80); break;
    }
  }

  /** Continuous work-noise loops whose loudness follows gameplay intensity (0..1). */
  setLoop(id: LoopId, level: number) {
    if (!this.ctx) return;
    let l = this.loops.get(id);
    if (!l) {
      if (level <= 0.001) return;
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = c.createBiquadFilter();
      const gain = c.createGain();
      gain.gain.value = 0;
      const cfg: Record<LoopId, [BiquadFilterType, number, number]> = {
        scrub: ['bandpass', 1100, 1.2],
        vacuum: ['bandpass', 500, 3],
        spray: ['highpass', 2500, 0.5],
        flow: ['lowpass', 600, 0.7],
        peel: ['bandpass', 1800, 2],
      };
      const [type, f, q] = cfg[id];
      filter.type = type;
      filter.frequency.value = f;
      filter.Q.value = q;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      l = { gain, filter, src, level: 0 };
      this.loops.set(id, l);
    }
    const target = Math.min(1, Math.max(0, level));
    l.level = target;
    const base = id === 'vacuum' ? 0.22 : id === 'flow' ? 0.18 : 0.16;
    l.gain.gain.setTargetAtTime(target * base, this.ctx.currentTime, 0.04);
    if (id === 'scrub') l.filter.frequency.setTargetAtTime(800 + target * 1400, this.ctx.currentTime, 0.05);
    if (id === 'vacuum') l.filter.frequency.setTargetAtTime(380 + target * 500, this.ctx.currentTime, 0.1);
  }

  stopLoops() {
    if (!this.ctx) return;
    this.loops.forEach((l) => l.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.05));
  }

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    let step = 0;
    const chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
    const tick = () => {
      if (!this.ctx || !this.musicOn) return;
      const t = this.ctx.currentTime + 0.05;
      const chord = chords[Math.floor(step / 8) % chords.length];
      if (step % 8 === 0) chord.forEach((s) => this.tone(196 * 2 ** (s / 12), 'sine', t, 2.6, 0.05, undefined, this.musicBus));
      if (Math.random() < 0.55) {
        const n = PENTA[Math.floor(Math.random() * PENTA.length)];
        this.tone(523 * 2 ** (n / 12), 'triangle', t, 0.9, 0.04 + Math.random() * 0.03, undefined, this.musicBus);
      }
      step++;
    };
    this.musicTimer = window.setInterval(tick, 380);
  }

  private stopMusic() {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}

export const audio = new AudioEngine();

export function haptic(ms = 12) {
  try { (navigator as Navigator & { vibrate?: (n: number) => boolean }).vibrate?.(ms); } catch { /* unsupported */ }
}
