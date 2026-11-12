/**
 * Audio engine: sampled instruments (VSCO 2 CE, CC0) and recorded foley (VSCO + Kenney, CC0) layered with
 * a little synthesis. Everything routes through a gallery-room reverb and a gentle master limiter.
 *
 *  - Music: a look-ahead scheduler plays the score in ./music.ts. Arrangements change per gallery, layers
 *    fade in with restoration progress, and wins/fails resolve the tune with cues in the current key.
 *  - SFX: each sound is a recipe of layered samples (transient + body + tail) with random variation,
 *    placed in stereo where the player is touching, and tonal SFX are tuned to the music's key.
 *  - Work loops (scrub, peel, spray, vacuum, flow) are granular textures whose density follows gameplay.
 *
 * Samples load lazily on the first user gesture; until a sample arrives its recipe falls back to synthesis.
 */
import { INSTRUMENTS, SAMPLES, type InstrumentId, type SampleId, type Zone } from './audioAssets';
import { TIMPANI, compileSong, scaleStep, tuneTo, type Layer, type SceneId, type Song } from './music';

export type Sfx =
  | 'tap' | 'pop' | 'squish' | 'chime' | 'success' | 'fanfare' | 'whoosh' | 'suck' | 'splash'
  | 'tear' | 'click' | 'error' | 'sparkle' | 'thud' | 'zap' | 'coin' | 'peel' | 'boing' | 'giggle'
  | 'rotate' | 'creak' | 'snap' | 'star';

export type LoopId = 'scrub' | 'vacuum' | 'spray' | 'flow' | 'peel';
export type Ambience = 'warm' | 'cool' | 'night' | 'fresco';
export type Cue = 'win' | 'bigWin' | 'fail';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'audio/';

/** per-instrument mix + envelope */
const INST: Record<InstrumentId, { gain: number; attack: number; release: number; sustain: boolean }> = {
  harp: { gain: 0.8, attack: 0.002, release: 0.5, sustain: false },
  glock: { gain: 0.42, attack: 0.001, release: 0.6, sustain: false },
  marimba: { gain: 0.75, attack: 0.001, release: 0.25, sustain: false },
  pizz: { gain: 0.8, attack: 0.002, release: 0.15, sustain: false },
  cellopizz: { gain: 0.9, attack: 0.002, release: 0.2, sustain: false },
  bassoon: { gain: 0.7, attack: 0.004, release: 0.08, sustain: false },
  flute: { gain: 0.5, attack: 0.05, release: 0.22, sustain: true },
  clarinet: { gain: 0.5, attack: 0.04, release: 0.2, sustain: true },
  horn: { gain: 0.55, attack: 0.08, release: 0.35, sustain: true },
  piano: { gain: 0.7, attack: 0.002, release: 0.35, sustain: false },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

interface LoopState { level: number; next: number; nodes?: { stop(): void; set(level: number): void } }

export class AudioEngine {
  ctx: AudioContext | null = null;
  soundOn = true;
  musicOn = true;
  /** -1..1 stereo position of the player's finger, set by the stage runtime; default pan for SFX */
  panHint = 0;

  private master!: GainNode;
  private sfxBus!: GainNode;
  private sfxTone!: BiquadFilterNode;
  private musicBus!: GainNode;
  private musicDuck!: GainNode;
  private musicTone!: BiquadFilterNode;
  private musicReverbSend!: GainNode;
  private sfxReverbSend!: GainNode;
  private reverb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  private output!: AudioNode;

  private buffers = new Map<string, AudioBuffer>();
  private reversed = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private lastPlayed = new Map<string, number>();
  private recent: number[] = [];
  private voices = 0;

  private loops = new Map<LoopId, LoopState>();

  // music state
  private scene: SceneId = 'menu';
  private ambience: Ambience = 'warm';
  private song: Song | null = null;
  private songReady = false;
  private songStart = 0;
  private scheduledBeat = 0;
  private intensity = 0;
  private intensityFloor = 0;
  private layerLevel: number[] = [1, 1, 0, 0];
  private musicHoldUntil = 0;
  private sceneToken = 0;

  // ------------------------------------------------------------------ lifecycle
  unlock() {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return; // browsers refuse audio before a real gesture
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC({ latencyHint: 'interactive' }));

    // master: gentle glue compressor, then a brick-wall-ish limiter
    this.master = c.createGain();
    this.master.gain.value = 0.78;
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -18; glue.ratio.value = 2.5; glue.attack.value = 0.01; glue.release.value = 0.2;
    const limit = c.createDynamicsCompressor();
    limit.threshold.value = -4; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.12;
    this.master.connect(glue).connect(limit).connect(c.destination);
    this.output = limit;

    // gallery-room reverb shared by music and SFX
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse('warm');
    const rvReturn = c.createGain();
    rvReturn.gain.value = 0.9;
    this.reverb.connect(rvReturn).connect(this.master);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.soundOn ? 1.4 : 0;
    this.sfxTone = c.createBiquadFilter();
    this.sfxTone.type = 'lowpass'; this.sfxTone.frequency.value = 20000; this.sfxTone.Q.value = 0.5;
    // stacked effects glue together instead of piling up
    const sfxComp = c.createDynamicsCompressor();
    sfxComp.threshold.value = -20; sfxComp.knee.value = 8; sfxComp.ratio.value = 3.5; sfxComp.attack.value = 0.003; sfxComp.release.value = 0.15;
    this.sfxBus.connect(sfxComp).connect(this.sfxTone).connect(this.master);
    this.sfxReverbSend = c.createGain();
    this.sfxReverbSend.gain.value = 0.16;
    this.sfxTone.connect(this.sfxReverbSend).connect(this.reverb);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.6 : 0;
    this.musicDuck = c.createGain();
    this.musicTone = c.createBiquadFilter();
    this.musicTone.type = 'lowpass'; this.musicTone.frequency.value = 18000; this.musicTone.Q.value = 0.4;
    this.musicBus.connect(this.musicDuck).connect(this.musicTone).connect(this.master);
    this.musicReverbSend = c.createGain();
    this.musicReverbSend.gain.value = 0.35;
    this.musicTone.connect(this.musicReverbSend).connect(this.reverb);

    // pink-ish noise for synthetic layers
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }

    // load every foley sample up front (small), instruments per scene
    for (const s of SAMPLES) void this.load(s);
    for (const z of [...INSTRUMENTS.glock, ...INSTRUMENTS.harp]) void this.load(z.file);
    window.setInterval(() => this.tick(), 25);
    this.setScene(this.scene, { ambience: this.ambience, floor: this.intensityFloor });
  }

  /** QA: a MediaStream of the final mix (used by the screenshot/recording scripts). */
  debugStream(): MediaStream | null {
    if (!this.ctx) return null;
    const d = this.ctx.createMediaStreamDestination();
    this.output.connect(d);
    return d.stream;
  }

  setSound(on: boolean) {
    this.soundOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1.4 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.6 * (this.song?.gain ?? 1) : 0, this.ctx.currentTime, 0.3);
    if (on) this.restartSong(0.4);
  }

  // ------------------------------------------------------------------ loading
  private load(file: string): Promise<AudioBuffer | null> {
    const hit = this.loading.get(file);
    if (hit) return hit;
    const p = fetch(BASE + file + '.mp3')
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => new Promise<AudioBuffer>((res, rej) => this.ctx!.decodeAudioData(ab, res, rej)))
      .then((buf) => { this.buffers.set(file, buf); return buf; })
      .catch(() => null);
    this.loading.set(file, p);
    return p;
  }

  private buf(file: string) { return this.buffers.get(file) ?? null; }

  private reversedBuf(file: string) {
    const r = this.reversed.get(file);
    if (r) return r;
    const b = this.buf(file);
    if (!b || !this.ctx) return null;
    const out = this.ctx.createBuffer(1, b.length, b.sampleRate);
    const src = b.getChannelData(0), dst = out.getChannelData(0);
    for (let i = 0; i < b.length; i++) dst[i] = src[b.length - 1 - i];
    this.reversed.set(file, out);
    return out;
  }

  private loadInstruments(ids: InstrumentId[]) {
    return Promise.all(ids.flatMap((id) => INSTRUMENTS[id].map((z) => this.load(z.file))));
  }

  /** Generated stereo impulse response: early reflections + a damped, diffuse tail. */
  private makeImpulse(kind: Ambience) {
    const c = this.ctx!;
    const cfg = { warm: [1.9, 0.55], cool: [2.6, 0.75], night: [3.0, 0.45], fresco: [3.6, 0.65] }[kind];
    const [secs, bright] = cfg;
    const len = Math.floor(c.sampleRate * secs);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / c.sampleRate;
        const decay = Math.pow(1 - i / len, 2.4) * Math.exp(-t * 1.2);
        const k = Math.min(0.95, 0.15 + (1 - bright) * 0.6 + t * 0.25); // darker as it decays
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        d[i] = lp * decay * 1.6;
      }
      // a few discrete early reflections off gallery walls
      for (const [ms, g] of [[11, 0.5], [17, 0.35], [23, 0.3], [31, 0.22], [43, 0.16]]) {
        const idx = Math.floor(((ms + (ch ? 3 : 0)) / 1000) * c.sampleRate);
        if (idx < len) d[idx] += g * (ch ? 0.9 : 1);
      }
    }
    return ir;
  }

  // ------------------------------------------------------------------ voices
  private out(pan: number, bus: AudioNode) {
    const c = this.ctx!;
    const g = c.createGain();
    if (c.createStereoPanner && pan !== 0) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(bus);
    } else g.connect(bus);
    return g;
  }

  /** Play a buffer (or a slice of it) with an envelope; returns the end time. */
  private playBuf(b: AudioBuffer, at: number, o: { rate?: number; vol?: number; pan?: number; offset?: number; dur?: number; attack?: number; release?: number; bus?: AudioNode; filter?: [BiquadFilterType, number, number?]; slideTo?: number }) {
    if (this.voices > 64) return at;
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = b;
    const rate = o.rate ?? 1;
    src.playbackRate.setValueAtTime(rate, at);
    const offset = Math.min(o.offset ?? 0, Math.max(0, b.duration - 0.02));
    const natural = (b.duration - offset) / rate;
    const dur = Math.min(o.dur ?? natural, natural);
    if (o.slideTo) src.playbackRate.exponentialRampToValueAtTime(o.slideTo, at + dur);
    const g = this.out(o.pan ?? 0, o.bus ?? this.sfxBus);
    const vol = o.vol ?? 1;
    const atk = o.attack ?? 0.002, rel = Math.min(o.release ?? 0.05, dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + atk);
    g.gain.setValueAtTime(Math.max(0.0002, vol), Math.max(at + atk, at + dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let head: AudioNode = src;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter[0]; f.frequency.value = o.filter[1]; f.Q.value = o.filter[2] ?? 0.7;
      src.connect(f); head = f;
    }
    head.connect(g);
    src.start(at, offset);
    src.stop(at + dur + 0.02);
    this.voices++;
    src.onended = () => { this.voices--; };
    return at + dur;
  }

  private sample(name: SampleId, at: number, o: Parameters<AudioEngine['playBuf']>[2] = {}) {
    const b = this.buf(name);
    return b ? (this.playBuf(b, at, o), true) : false;
  }

  /** grain: a short random slice of a sample */
  private grain(name: SampleId, at: number, len: number, o: Parameters<AudioEngine['playBuf']>[2] = {}, reverse = false) {
    const b = reverse ? this.reversedBuf(name) : this.buf(name);
    if (!b) return false;
    const off = rand(0, Math.max(0, b.duration - len - 0.01));
    this.playBuf(b, at, { ...o, offset: off, dur: len, attack: o.attack ?? 0.008, release: o.release ?? len * 0.6 });
    return true;
  }

  private zoneFor(inst: InstrumentId, midi: number): Zone {
    let best = INSTRUMENTS[inst][0];
    for (const z of INSTRUMENTS[inst]) if (Math.abs(z.midi - midi) < Math.abs(best.midi - midi)) best = z;
    return best;
  }

  /** Sampled instrument note. */
  note(inst: InstrumentId, midi: number, at: number, o: { dur?: number; vel?: number; pan?: number; bus?: AudioNode; slideTo?: number } = {}) {
    if (!this.ctx) return false;
    const z = this.zoneFor(inst, midi);
    const b = this.buf(z.file);
    if (!b) { void this.load(z.file); return false; }
    const cfg = INST[inst];
    const rate = Math.pow(2, (midi - z.midi) / 12) * (1 + rand(-0.0025, 0.0025));
    const vel = o.vel ?? 0.7;
    const len = cfg.sustain ? Math.min(b.duration / rate, (o.dur ?? 1) + cfg.release) : b.duration / rate;
    this.playBuf(b, at, {
      rate, vol: cfg.gain * vel * vel, pan: o.pan ?? 0, bus: o.bus ?? this.sfxBus,
      dur: len, attack: cfg.attack, release: cfg.sustain ? cfg.release : Math.min(cfg.release + 0.4, len), slideTo: o.slideTo ? rate * o.slideTo : undefined,
      filter: inst === 'glock' && this.scene === 'menu' && o.bus === this.musicBus ? ['lowpass', 4200, 0.5] : undefined,
    });
    return true;
  }

  // synthesis helpers (fallbacks + layers)
  private tone(freq: number, type: OscillatorType, at: number, dur: number, vol: number, glideTo?: number, pan = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = this.out(pan, this.sfxBus);
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    o.start(at); o.stop(at + dur + 0.05);
  }

  private noise(at: number, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number, pan = 0) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    f.Q.value = q;
    const g = this.out(pan, this.sfxBus);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g);
    s.start(at, Math.random());
    s.stop(at + dur + 0.05);
  }

  /** Little gibberish voice for the Grimelings: a buzzy source through two vowel formants. */
  private voice(at: number, base: number, syllables: number, pan: number, vol = 0.16) {
    const c = this.ctx!;
    const VOWELS = [[800, 1150], [400, 1700], [350, 2200], [450, 800], [325, 700]];
    let t = at;
    for (let i = 0; i < syllables; i++) {
      const len = rand(0.055, 0.095);
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const f0 = base * (1 + i * 0.08) * rand(0.92, 1.12);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * rand(1.15, 1.4), t + len);
      const [f1, f2] = pick(VOWELS);
      const g = this.out(pan, this.sfxBus);
      const sum = c.createGain();
      sum.gain.value = 1;
      for (const [f, q, gg] of [[f1, 3, 1], [f2, 5, 0.7]]) {
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f * rand(0.95, 1.05); bp.Q.value = q;
        const fg = c.createGain(); fg.gain.value = gg;
        o.connect(bp).connect(fg).connect(sum);
      }
      sum.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.start(t); o.stop(t + len + 0.02);
      t += len + rand(0.01, 0.035);
    }
  }

  // ------------------------------------------------------------------ key helpers (tonal SFX play in the music's key)
  private keyNote(degree: number, octave = 0) {
    const s = this.song;
    const tonic = s ? s.tonic : 67;
    const scale = s ? s.scale : [0, 2, 4, 5, 7, 9, 11];
    return scaleStep(tonic, degree, tonic, scale) + 12 * octave;
  }

  private duck(amount = 0.45, secs = 0.9) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.musicDuck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(amount, t, 0.04);
    g.setTargetAtTime(1, t + secs, 0.35);
  }

  // ------------------------------------------------------------------ SFX
  play(name: Sfx, opts: { pitch?: number; vol?: number; pan?: number } = {}) {
    if (!this.ctx || !this.soundOn) return;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? 0;
    if (now - last < 0.035) return; // avoid machine-gun stacking
    this.lastPlayed.set(name, now);
    // busy moments: each extra effect in the last quarter-second makes the next one a little quieter
    this.recent = this.recent.filter((x) => now - x < 0.25);
    this.recent.push(now);
    const p = opts.pitch ?? 1;
    const v = (opts.vol ?? 1) / Math.sqrt(1 + (this.recent.length - 1) * 0.6);
    const pan = opts.pan ?? this.panHint * 0.7;
    const t = now + 0.005;
    const S = (n: SampleId, o: Parameters<AudioEngine['playBuf']>[2] = {}) => this.sample(n, t, { pan, ...o });
    switch (name) {
      case 'tap':
        if (!S(pick(['ui_click1', 'ui_click3'] as const), { rate: p * rand(0.94, 1.06), vol: 0.55 * v })) this.tone(880 * p, 'triangle', t, 0.06, 0.18 * v, undefined, pan);
        S('woodClick', { rate: 1.6 * p, vol: 0.12 * v });
        break;
      case 'click':
        if (!S(pick(['ui_switch2', 'ui_switch7'] as const), { rate: p * rand(0.96, 1.04), vol: 0.5 * v })) this.tone(1400 * p, 'square', t, 0.025, 0.06 * v, undefined, pan);
        break;
      case 'pop':
        // cork-like pop: pitched blip + a wet bubble + a woody transient
        this.tone(420 * p * rand(0.92, 1.08), 'sine', t, 0.08, 0.4 * v, 1250 * p, pan);
        this.grain(pick(['bubbles1', 'bubbles2'] as const), t, 0.07, { rate: 1.4 * p, vol: 0.6 * v, pan });
        S('woodClick', { rate: 2.2 * p, vol: 0.3 * v });
        break;
      case 'squish': {
        // wet sponge squelch: cloth body pitched down + bubbly slurp + low thump
        const ok = S(pick(['cloth1', 'cloth2', 'cloth3', 'cloth4'] as const), { rate: 0.6 * p * rand(0.9, 1.1), vol: 0.5 * v, filter: ['lowpass', 1600, 1.2] });
        this.grain(pick(['bubbles1', 'bubbles2', 'bubbles4'] as const), t + 0.01, 0.16, { rate: 0.9 * p, vol: 0.45 * v, pan });
        this.tone(200 * p, 'sine', t, 0.12, 0.14 * v, 110 * p, pan);
        if (!ok) this.noise(t, 0.14, 0.28 * v, 700 * p, 3, 'bandpass', 240 * p, pan);
        break;
      }
      case 'boing':
        if (!S('flexSlap', { rate: p * rand(0.92, 1.1), vol: 0.5 * v, dur: 0.5, release: 0.2 })) this.tone(180 * p, 'sine', t, 0.28, 0.3 * v, 520 * p, pan);
        break;
      case 'chime': {
        // tuned to the current key; higher pitch requests climb the scale
        const deg = Math.round((p - 1) * 10);
        const m = this.keyNote(deg, 1);
        if (!this.note('glock', m, t, { vel: 1 * v, pan })) this.tone(660 * p, 'sine', t, 0.5, 0.12 * v, undefined, pan);
        this.note('harp', m - 12, t + 0.01, { vel: 0.55 * v, pan });
        break;
      }
      case 'sparkle':
        for (let i = 0; i < 3; i++) this.note('glock', this.keyNote(Math.floor(rand(0, 7)), 2), t + i * 0.05 + rand(0, 0.02), { vel: 0.62 * v, pan: pan + rand(-0.3, 0.3) });
        S('triangle0', { vol: 0.08 * v, rate: rand(1.4, 1.8), dur: 0.8, release: 0.6 });
        break;
      case 'star': {
        // results / objective stars: 1st, 3rd, 5th of the key as the pitch rises
        const deg = Math.max(0, Math.round((p - 1) / 0.075));
        const m = this.keyNote(deg, 1);
        if (!this.note('glock', m, t, { vel: 0.8 * v, pan })) this.tone(990 * p, 'triangle', t, 0.35, 0.2 * v, undefined, pan);
        this.note('harp', m - 12, t, { vel: 0.5 * v, pan });
        S('triangle1', { vol: 0.12 * v, dur: 1.2, release: 1 });
        break;
      }
      case 'coin':
        if (!S('coins', { rate: p * rand(0.95, 1.08), vol: 0.5 * v, dur: 0.5, release: 0.3 })) this.tone(990 * p, 'square', t, 0.06, 0.07 * v, undefined, pan);
        this.note('glock', this.keyNote(4, 2), t + 0.04, { vel: 0.4 * v, pan });
        break;
      case 'success': {
        // small win flourish in key (the music cue adds the cadence)
        const run = [0, 2, 4, 7].map((d) => this.keyNote(d, 1));
        run.forEach((m, i) => this.note('harp', m, t + i * 0.07, { vel: 0.6 * v, pan: -0.3 + i * 0.2 }));
        this.note('glock', this.keyNote(7, 1), t + 0.3, { vel: 0.7 * v });
        S('chimesUp', { vol: 0.18 * v, pan: 0 });
        this.duck(0.5, 1.2);
        break;
      }
      case 'fanfare': {
        const root = this.keyNote(0, -1);
        [0, 4, 7].forEach((iv, i) => this.note('horn', root + iv - 12, t + i * 0.09, { vel: 0.68 * v, dur: 1.8, pan: -0.3 + i * 0.3 }));
        [0, 2, 4, 7, 9].forEach((d, i) => this.note('harp', this.keyNote(d, 0), t + i * 0.05, { vel: 0.55 * v }));
        S('timpRoll', { vol: 0.5 * v, dur: 1.4, release: 0.5, rate: tuneTo(this.keyNote(0), TIMPANI.timpRoll) });
        S('cymbalSwell', { vol: 0.25 * v, offset: 1.2 });
        this.note('glock', this.keyNote(7, 1), t + 0.6, { vel: 0.7 * v });
        this.duck(0.35, 1.8);
        break;
      }
      case 'whoosh':
        if (!S(pick(['cloth1', 'cloth3'] as const), { rate: rand(1.2, 1.5), vol: 0.75 * v, filter: ['bandpass', 1400, 0.8] })) this.noise(t, 0.5, 0.25 * v, 300, 0.8, 'bandpass', 2400, pan);
        this.noise(t, 0.45, 0.12 * v, 300, 0.8, 'bandpass', 2400, pan);
        break;
      case 'suck':
        // reversed bubbles = slurped into the jar
        if (!this.grain('bubbles2', t, 0.22, { rate: 1.3 * p, vol: 0.5 * v, pan }, true)) this.noise(t, 0.22, 0.3 * v, 2600 * p, 2, 'bandpass', 500, pan);
        this.tone(600 * p, 'sine', t + 0.05, 0.16, 0.1 * v, 1500 * p, pan);
        break;
      case 'splash':
        this.grain(pick(['bubbles1', 'bubbles2'] as const), t, 0.4, { rate: 0.85 * p, vol: 0.55 * v, pan });
        S('leather', { rate: 0.8 * p, vol: 0.3 * v, filter: ['lowpass', 1800] });
        this.noise(t, 0.3, 0.2 * v, 1800 * p, 0.7, 'lowpass', 500, pan);
        break;
      case 'tear':
        if (!S('knife', { rate: 1.3, vol: 0.45 * v })) this.noise(t, 0.18, 0.4 * v, 3000, 4, 'bandpass', 900, pan);
        S('pageFlip3', { rate: 1.2, vol: 0.5 * v });
        break;
      case 'peel':
        if (!S(pick(['pageFlip1', 'pageFlip2'] as const), { rate: p * rand(0.95, 1.15), vol: 0.5 * v })) this.noise(t, 0.25, 0.18 * v, 900 * p, 2, 'bandpass', 2200 * p, pan);
        break;
      case 'error': {
        // a soft wooden bonk and a sad little bassoon "wah-wah"
        S('slitLo', { rate: 0.9 * p, vol: 0.55 * v });
        const m = this.keyNote(-1, -1);
        if (!this.note('bassoon', m, t + 0.05, { vel: 0.55 * v, pan })) {
          this.tone(220 * p, 'sawtooth', t, 0.12, 0.07 * v, 160 * p, pan);
          this.tone(180 * p, 'sawtooth', t + 0.1, 0.16, 0.07 * v, 120 * p, pan);
        } else this.note('bassoon', m - 1, t + 0.22, { vel: 0.5 * v, pan, slideTo: 0.94 });
        break;
      }
      case 'thud':
        if (!S(pick(['bookPlace', 'step0', 'step1'] as const), { rate: 0.8 * p, vol: 0.6 * v })) this.noise(t, 0.08, 0.2 * v, 300, 1, 'lowpass', undefined, pan);
        this.tone(110 * p, 'sine', t, 0.2, 0.3 * v, 50 * p, pan);
        break;
      case 'zap':
        if (!S('zap', { rate: p * rand(0.9, 1.1), vol: 0.8 * v, dur: 0.4, release: 0.2 })) this.tone(1200 * p, 'sawtooth', t, 0.12, 0.07 * v, 300 * p, pan);
        break;
      case 'giggle':
        this.voice(t, 520 * p * rand(0.85, 1.2), 3 + Math.floor(rand(0, 3)), pan, 0.9 * v);
        break;
      case 'rotate':
        if (!S(pick(['woodClick', 'claves'] as const), { rate: rand(1.3, 1.6) * p, vol: 0.35 * v })) this.tone(600 * p, 'triangle', t, 0.05, 0.12 * v, 800 * p, pan);
        this.grain('ratchet', t + 0.01, 0.06, { rate: 1.2, vol: 0.2 * v, pan });
        break;
      case 'creak':
        if (!S(pick(['creak1', 'creak2', 'creak3'] as const), { rate: p * rand(0.9, 1.1), vol: 0.4 * v })) this.tone(140 * p, 'sawtooth', t, 0.35, 0.05 * v, 95 * p, pan);
        break;
      case 'snap':
        if (!S(pick(['slapstick', 'claves'] as const), { rate: p * rand(0.95, 1.05), vol: 0.5 * v })) this.noise(t, 0.06, 0.45 * v, 2000, 1.5, 'bandpass', undefined, pan);
        S('latch', { rate: 1.2, vol: 0.2 * v });
        break;
    }
  }

  // ------------------------------------------------------------------ work loops
  /** Continuous work textures whose density/loudness follows gameplay intensity (0..1). */
  setLoop(id: LoopId, level: number) {
    if (!this.ctx) return;
    let l = this.loops.get(id);
    if (!l) { if (level <= 0.001) return; l = { level: 0, next: 0 }; this.loops.set(id, l); }
    l.level = Math.min(1, Math.max(0, level));
    if (l.level > 0.001 && !l.nodes) l.nodes = this.loopNodes(id);
    l.nodes?.set(this.soundOn ? l.level : 0);
  }

  stopLoops() {
    this.loops.forEach((l) => { l.level = 0; l.nodes?.set(0); });
  }

  /** Continuous (non-granular) parts of a loop. */
  private loopNodes(id: LoopId): LoopState['nodes'] {
    const c = this.ctx!;
    const t = () => c.currentTime;
    if (id === 'vacuum') {
      // little electric motor: two detuned saws + noise rush, spinning up and down with a lag
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0;
      const o1 = c.createOscillator(), o2 = c.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 60; o2.frequency.value = 30.4;
      const og = c.createGain(); og.gain.value = 0.18;
      o1.connect(og); o2.connect(og); og.connect(lp);
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 1.5;
      const ng = c.createGain(); ng.gain.value = 0.5;
      n.connect(nf).connect(ng).connect(lp);
      lp.connect(g).connect(this.sfxBus);
      o1.start(); o2.start(); n.start();
      return {
        set: (lv) => {
          const now = t();
          g.gain.setTargetAtTime(lv * 0.22, now, lv > 0 ? 0.12 : 0.25);
          o1.frequency.setTargetAtTime(55 + lv * 95, now, 0.35);
          o2.frequency.setTargetAtTime((55 + lv * 95) * 0.502, now, 0.35);
          lp.frequency.setTargetAtTime(500 + lv * 1300, now, 0.3);
          nf.frequency.setTargetAtTime(500 + lv * 700, now, 0.3);
        },
        stop: () => { o1.stop(); o2.stop(); n.stop(); },
      };
    }
    if (id === 'flow' && this.buf('bubbles1')) {
      const src = c.createBufferSource(); src.buffer = this.buf('bubbles1'); src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(lp).connect(g).connect(this.sfxBus);
      src.start();
      return { set: (lv) => g.gain.setTargetAtTime(lv * 0.35, t(), 0.2), stop: () => src.stop() };
    }
    if (id === 'flow') { void this.load('bubbles1'); return undefined; } // retry once the sample arrives
    if (id === 'spray') {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400; hp.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = 0;
      n.connect(hp).connect(g).connect(this.sfxBus);
      n.start();
      return { set: (lv) => g.gain.setTargetAtTime(lv * 0.12, t(), 0.05), stop: () => n.stop() };
    }
    return { set: () => {}, stop: () => {} };
  }

  /** Granular parts of the loops, scheduled from the engine tick. */
  private loopGrains(id: LoopId, l: LoopState, now: number) {
    const ahead = now + 0.1;
    if (l.level < 0.02 || !this.soundOn) { l.next = Math.max(l.next, now); return; }
    const pan = this.panHint * 0.7;
    while (l.next < ahead) {
      const at = Math.max(l.next, now + 0.005);
      const lv = l.level;
      switch (id) {
        case 'scrub': {
          // sponge on canvas: cloth rubs, with a wet bubbly squelch every few strokes
          this.grain(pick(['cloth1', 'cloth2', 'cloth3', 'cloth4'] as const), at, rand(0.06, 0.11), { rate: rand(0.75, 1.0) + lv * 0.25, vol: 0.32 * lv, pan, filter: ['lowpass', 2600 + lv * 2000] });
          if (Math.random() < 0.35) this.grain(pick(['bubbles1', 'bubbles4'] as const), at + 0.02, rand(0.05, 0.09), { rate: rand(1.1, 1.5), vol: 0.16 * lv, pan });
          l.next = at + rand(0.07, 0.11) - lv * 0.035;
          break;
        }
        case 'peel': {
          // sticky varnish: paper rips and tiny crackles, denser the faster you pull
          this.grain(pick(['pageFlip1', 'pageFlip2', 'pageFlip3'] as const), at, rand(0.04, 0.08), { rate: rand(1.1, 1.5), vol: 0.8 * lv, pan, filter: ['highpass', 700] });
          if (Math.random() < 0.6) this.noise(at + rand(0, 0.02), 0.012, 0.28 * lv, rand(2500, 5000), 3, 'bandpass', undefined, pan);
          l.next = at + rand(0.05, 0.09) - lv * 0.03;
          break;
        }
        case 'spray':
          this.grain(pick(['bubbles1', 'bubbles2'] as const), at, rand(0.05, 0.1), { rate: rand(1.4, 1.9), vol: 0.14 * lv, pan });
          l.next = at + rand(0.08, 0.14);
          break;
        case 'vacuum':
          // debris rattling up the hose
          if (lv > 0.5 && Math.random() < 0.5) this.grain(pick(['shaker', 'cabasa'] as const), at, rand(0.04, 0.08), { rate: rand(1.2, 1.7), vol: 0.12 * lv, pan, filter: ['bandpass', 2500, 1.2] });
          l.next = at + rand(0.12, 0.22);
          break;
        case 'flow':
          if (!l.nodes && Math.random() < 0.7) this.grain('bubbles1', at, rand(0.1, 0.2), { rate: rand(0.8, 1.1), vol: 0.18 * lv, filter: ['lowpass', 1700] });
          l.next = at + rand(0.15, 0.25);
          break;
      }
    }
  }

  // ------------------------------------------------------------------ music
  /** Choose the arrangement (and room) for what's on screen. Safe to call before audio unlocks. */
  setScene(scene: SceneId, o: { ambience?: Ambience; floor?: number } = {}) {
    const changed = scene !== this.scene || !this.song;
    this.scene = scene;
    this.intensityFloor = o.floor ?? 0;
    if (o.ambience && o.ambience !== this.ambience) {
      this.ambience = o.ambience;
      if (this.ctx) this.reverb.buffer = this.makeImpulse(o.ambience);
    }
    if (!this.ctx) return;
    if (changed) this.restartSong(0.8);
  }

  /** 0..1 restoration progress; extra layers of the arrangement bloom as it rises. */
  setIntensity(x: number) { this.intensity = Math.max(0, Math.min(1, x)); }

  /** Muffle SFX when pulled back to the whole painting (further from the canvas). */
  setDistance(far: number) {
    if (!this.ctx) return;
    this.sfxTone.frequency.setTargetAtTime(far > 0.5 ? 3200 : 20000, this.ctx.currentTime, 0.25);
  }

  private restartSong(fade: number) {
    const c = this.ctx!;
    const token = ++this.sceneToken;
    const song = compileSong(this.scene);
    // fade out what's playing, then start the new arrangement once its instruments have loaded
    this.musicBus.gain.cancelScheduledValues(c.currentTime);
    this.musicBus.gain.setTargetAtTime(0, c.currentTime, fade / 4);
    this.songReady = false;
    void this.loadInstruments(song.instruments).then(() => {
      if (token !== this.sceneToken || !this.ctx) return;
      const startAt = Math.max(this.ctx.currentTime + 0.15, this.ctx.currentTime + fade * 0.6);
      window.setTimeout(() => {
        if (token !== this.sceneToken || !this.ctx) return;
        this.song = song;
        this.musicReverbSend.gain.setTargetAtTime(song.reverb, this.ctx.currentTime, 0.2);
        this.musicTone.frequency.setTargetAtTime(song.tone, this.ctx.currentTime, 0.2);
        this.songStart = this.ctx.currentTime + 0.08;
        this.scheduledBeat = 0;
        this.layerLevel = [1, 1, 0, 0];
        this.songReady = true;
        this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
        this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.6 * song.gain : 0, this.ctx.currentTime, 0.3);
      }, Math.max(0, (startAt - this.ctx.currentTime) * 1000));
    });
  }

  /** Musical punctuation: resolve the tune on a win, sigh on a fail. */
  cue(kind: Cue) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + 0.03;
    const bus = this.musicBus;
    // pause the loop under the cue, then start it again softly (results screen)
    this.musicHoldUntil = t + (kind === 'fail' ? 2.2 : 4.2);
    if (kind === 'fail') {
      [4, 3, 2, 0].forEach((d, i) => this.note('bassoon', this.keyNote(d, -1), t + i * 0.28, { vel: 0.7, bus, slideTo: i === 3 ? 0.94 : undefined }));
      this.sample('slitLo', t + 1.1, { vol: 0.4 });
      return;
    }
    if (!this.musicOn) { this.play(kind === 'bigWin' ? 'fanfare' : 'success'); return; }
    // harp glissando up two octaves of the scale, then the tonic chord with sparkle
    for (let i = 0; i <= 14; i++) this.note('harp', this.keyNote(i, -1), t + i * 0.035, { vel: 0.35 + i * 0.02, pan: -0.5 + i / 14, bus });
    const end = t + 15 * 0.035 + 0.05;
    [0, 2, 4, 7].forEach((d, i) => this.note('harp', this.keyNote(d, 0), end + i * 0.015, { vel: 0.75, bus }));
    this.note('cellopizz', this.keyNote(0, -2), end, { vel: 0.9, bus });
    this.note('glock', this.keyNote(0, 1), end + 0.02, { vel: 0.8, bus });
    this.note('glock', this.keyNote(4, 1), end + 0.18, { vel: 0.6, bus });
    this.note('glock', this.keyNote(7, 1), end + 0.36, { vel: 0.7, bus });
    this.sample('chimesUp', t, { vol: 0.22 });
    this.sample('triangle0', end, { vol: 0.25, dur: 1.8, release: 1.4 });
    if (kind === 'bigWin') {
      this.sample('timpRoll', t, { vol: 0.55, dur: end - t + 0.1, release: 0.1, rate: tuneTo(this.keyNote(4), TIMPANI.timpRoll) });
      this.sample('timp4', end, { vol: 0.55, rate: tuneTo(this.keyNote(0), TIMPANI.timp4) });
      this.sample('cymbalSwell', end - 0.2, { vol: 0.25, offset: 2.6 });
      [0, 4, 7].forEach((iv, i) => this.note('horn', this.keyNote(0, -1) + iv - 12, end + i * 0.04, { vel: 0.72, dur: 2.2, bus, pan: -0.3 + i * 0.3 }));
    }
    this.duck(0.6, 1.5);
  }

  // ------------------------------------------------------------------ scheduler
  private tick() {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    this.loops.forEach((l, id) => this.loopGrains(id, l, now));
    const s = this.song;
    if (!s || !this.songReady || !this.musicOn) return;
    // smooth the layer levels toward the intensity targets
    const x = Math.max(this.intensity, this.intensityFloor);
    const target = [1, 1, smooth(0.3, 0.55, x), smooth(0.7, 0.92, x)];
    for (let i = 0; i < 4; i++) this.layerLevel[i] += (target[i] - this.layerLevel[i]) * 0.04;
    if (now < this.musicHoldUntil) {
      // a cue is playing: keep the clock moving but skip notes, then resume on the next bar
      const spb = 60 / s.bpm;
      const barBeats = s.meter;
      const beatNow = (now - this.songStart) / spb;
      this.scheduledBeat = Math.ceil((beatNow + 0.5) / barBeats) * barBeats;
      return;
    }
    const spb = 60 / s.bpm;
    const horizon = (now + 0.15 - this.songStart) / spb;
    while (this.scheduledBeat < horizon) {
      const from = this.scheduledBeat, to = Math.min(horizon, Math.floor(from) + 1);
      const loopIdx = Math.floor(from / s.loopBeats);
      const a = from - loopIdx * s.loopBeats, b = to - loopIdx * s.loopBeats;
      for (const e of s.events) {
        if (e.beat < a || e.beat >= b) continue;
        const lv = this.layerLevel[e.layer as Layer];
        if (lv < 0.03) continue;
        // humanise: a few ms of timing slop and velocity variation
        const at = this.songStart + (loopIdx * s.loopBeats + e.beat) * spb + rand(-0.006, 0.008);
        if (at < now) continue;
        const vel = e.vel * lv * rand(0.9, 1.05);
        if (e.inst && e.midi !== undefined) this.note(e.inst, e.midi, at, { dur: e.dur * spb, vel, pan: e.pan ?? 0, bus: this.musicBus });
        else if (e.sample) this.sample(e.sample, at, { vol: vel, rate: (e.rate ?? 1) * rand(0.98, 1.02), pan: e.pan ?? 0, bus: this.musicBus });
      }
      this.scheduledBeat = to;
    }
  }
}

export const audio = new AudioEngine();

export function haptic(ms = 12) {
  try { (navigator as Navigator & { vibrate?: (n: number) => boolean }).vibrate?.(ms); } catch { /* unsupported */ }
}
