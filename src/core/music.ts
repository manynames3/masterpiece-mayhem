/**
 * The score. One "Tiny Restorers" theme (a 3/4 waltz in G) is re-orchestrated per gallery, plus a
 * minor-key boss theme. Arrangements compile to a flat list of timed events that the audio engine's
 * look-ahead scheduler plays from sampled instruments. Layers let the music grow with progress:
 *   0 = accompaniment (always), 1 = melody (always), 2 = countermelody / colour, 3 = full-tutti extras.
 */
import type { InstrumentId, SampleId } from './audioAssets';

export type SceneId = 'menu' | 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'boss' | 'finale';
export type Layer = 0 | 1 | 2 | 3;

export interface MusicEvent {
  beat: number;
  dur: number;
  vel: number;
  layer: Layer;
  inst?: InstrumentId;
  midi?: number;
  sample?: SampleId;
  rate?: number;
  pan?: number;
}

export interface Song {
  scene: SceneId;
  bpm: number;
  meter: number;
  loopBeats: number;
  events: MusicEvent[];
  /** tonic of the arrangement's key (midi) and its scale, so SFX can play in key */
  tonic: number;
  scale: number[];
  /** instruments the song needs loaded before it can start */
  instruments: InstrumentId[];
  /** extra low-pass on the whole music bus (music-box softness), Hz */
  tone: number;
  reverb: number;
  /** linear gain trim */
  gain: number;
}

// ------------------------------------------------------------------ notation
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

interface Note { beat: number; dur: number; midi: number | null }

/** "G4:1 B4:1 D5:1 | C5:2 B4:1 | r:1 ..." → notes with absolute beats (bars are just readability). */
function parseLine(line: string): Note[] {
  const out: Note[] = [];
  let beat = 0;
  for (const tok of line.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [n, d] = tok.split(':');
    const dur = Number(d);
    out.push({ beat, dur, midi: n === 'r' ? null : noteMidi(n) });
    beat += dur;
  }
  return out;
}

const QUAL: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10] };
interface Chord { root: number; tones: number[] }
function parseChord(sym: string): Chord {
  const m = /^([A-G])(#|b)?(m7|m|7)?$/.exec(sym);
  if (!m) throw new Error(`bad chord ${sym}`);
  const root = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root, tones: QUAL[m[3] ?? ''] };
}

/** nearest midi with pitch class pc to `center` */
const place = (pc: number, center: number) => center + ((((pc - center) % 12) + 18) % 12) - 6;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR_H = [0, 2, 3, 5, 7, 8, 11];

/** move `steps` scale degrees from midi (diatonic), used for auto-harmony thirds/sixths */
function scaleStep(midi: number, steps: number, tonic: number, scale: number[]): number {
  const rel = midi - tonic;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  let idx = scale.indexOf(pc);
  if (idx < 0) idx = scale.findIndex((s) => s > pc) - 1;
  const n = idx + steps;
  const o = Math.floor(n / scale.length);
  return tonic + (oct + o) * 12 + scale[((n % scale.length) + scale.length) % scale.length];
}

/** measured sounding pitch (midi) of the timpani samples, so they can be tuned to the key */
export const TIMPANI = { timp1: 41.49, timp2: 53.56, timp3: 56.3, timp4: 58.95, timp5: 61.34, timpRoll: 48.75 };
/** playback rate that moves a drum of pitch `from` to the nearest octave of `pc`'s pitch class */
export const tuneTo = (target: number, from: number) => Math.pow(2, (place(((target % 12) + 12) % 12, from) - from) / 12);

// ------------------------------------------------------------------ the themes
const MAIN = {
  meter: 3,
  tonic: noteMidi('G4'),
  scale: MAJOR,
  A: 'G4:1 B4:1 D5:1 | C5:2 B4:1 | A4:1 B4:1 C5:1 | D5:3 | E5:1 D5:1 C5:1 | B4:2 G4:1 | A4:1 B4:1 A4:1 | G4:3',
  B: 'B4:1 C5:1 D5:1 | E5:2 D5:1 | C5:1 B4:1 A4:1 | B4:3 | G5:1 F#5:1 E5:1 | D5:2 B4:1 | C5:1 A4:1 F#4:1 | G4:3',
  chordsA: 'G C D7 G C G D7 G',
  chordsB: 'Em7 C Am Em C G D7 G',
  interlude: 'C G Am D7',
};

const BOSS = {
  meter: 4,
  tonic: noteMidi('E4'),
  scale: MINOR_H,
  A: 'E4:.5 G4:.5 B4:1 A4:.5 G4:.5 F#4:1 | E4:.5 F#4:.5 G4:1 B3:2 | E4:.5 G4:.5 B4:1 C5:.5 B4:.5 A4:1 | B4:3 r:1 | ' +
     'C5:.5 B4:.5 A4:1 G4:.5 A4:.5 B4:1 | E4:1 F#4:1 G4:2 | A4:.5 G4:.5 F#4:1 D#4:1 B3:1 | E4:3 r:1',
  chordsA: 'Em Em Am B Am7 Em B7 Em',
  interlude: 'Em C B7 Em',
};

// ------------------------------------------------------------------ arrangements
type Comp = 'waltz' | 'arp' | 'ostinato' | 'march';
interface Part { inst: InstrumentId; oct?: number; vel?: number; layer?: Layer; legato?: boolean }
interface Arrangement {
  scene: SceneId;
  theme: typeof MAIN | typeof BOSS;
  bpm: number;
  transpose: number;
  melody: Part;
  counter?: Part & { steps: number };
  double?: Part;
  bass: Part & { center: number };
  comp: Part & { style: Comp; low: number };
  pad?: Part & { low: number };
  tick?: boolean;
  perc?: { sample: SampleId; every: 'offbeat' | 'bar' | 'twoBars' | 'beat'; vel: number; layer: Layer; rate?: number; tuned?: number }[];
  tone?: number;
  reverb?: number;
  /** loudness trim in dB so every arrangement sits at the same level */
  gain?: number;
}

const ARR: Record<SceneId, Arrangement> = {
  // the restoration desk: a wind-up music box (glockenspiel tines, felt-soft) over a harp waltz
  menu: {
    scene: 'menu', gain: 2, theme: MAIN, bpm: 100, transpose: 0,
    melody: { inst: 'glock', oct: 1, vel: 0.55 },
    counter: { inst: 'harp', oct: 0, vel: 0.35, layer: 2, steps: -2 },
    bass: { inst: 'harp', center: 43, vel: 0.6 },
    comp: { inst: 'harp', style: 'waltz', low: 59, vel: 0.32 },
    tick: true, tone: 5200, reverb: 0.42,
  },
  // Gallery I (Mona Lisa, Night Watch): pizzicato strings, cello bass, harp and glockenspiel sparkle
  g1: {
    scene: 'g1', gain: -1.6, theme: MAIN, bpm: 112, transpose: 0,
    melody: { inst: 'pizz', oct: 0, vel: 0.8 },
    counter: { inst: 'glock', oct: 1, vel: 0.3, layer: 2, steps: -2 },
    bass: { inst: 'cellopizz', center: 43, vel: 0.85 },
    comp: { inst: 'harp', style: 'waltz', low: 57, vel: 0.36 },
    perc: [{ sample: 'triangle0', every: 'twoBars', vel: 0.22, layer: 3 }],
    reverb: 0.34,
  },
  // Gallery II (Vermeer, Hokusai): marimba tune, plucked strings, a flute answering above
  g2: {
    scene: 'g2', gain: -3.1, theme: MAIN, bpm: 120, transpose: -5,
    melody: { inst: 'marimba', oct: 1, vel: 0.75 },
    counter: { inst: 'flute', oct: 1, vel: 0.32, layer: 2, steps: 2, legato: true },
    bass: { inst: 'cellopizz', center: 40, vel: 0.85 },
    comp: { inst: 'pizz', style: 'waltz', low: 57, vel: 0.42 },
    perc: [{ sample: 'shaker', every: 'offbeat', vel: 0.14, layer: 3 }],
    reverb: 0.3,
  },
  // Gallery III (Monet, Van Gogh): dreamy flute over rippling harp arpeggios, clarinet pad at full bloom
  g3: {
    scene: 'g3', gain: -1.2, theme: MAIN, bpm: 92, transpose: -2,
    melody: { inst: 'flute', oct: 1, vel: 0.55, legato: true },
    counter: { inst: 'glock', oct: 1, vel: 0.24, layer: 2, steps: -2 },
    bass: { inst: 'harp', center: 41, vel: 0.6 },
    comp: { inst: 'harp', style: 'arp', low: 53, vel: 0.34 },
    pad: { inst: 'clarinet', low: 62, vel: 0.2, layer: 3 },
    perc: [{ sample: 'chimesRand', every: 'twoBars', vel: 0.08, layer: 3 }],
    reverb: 0.55,
  },
  // Gallery IV (Seurat, Bosch): a cheeky staccato bassoon with marimba and pizzicato bounce
  g4: {
    scene: 'g4', gain: -4.1, theme: MAIN, bpm: 128, transpose: -7,
    melody: { inst: 'bassoon', oct: -1, vel: 0.85 },
    double: { inst: 'clarinet', oct: 0, vel: 0.28, layer: 2 },
    bass: { inst: 'cellopizz', center: 38, vel: 0.85 },
    comp: { inst: 'marimba', style: 'waltz', low: 60, vel: 0.4 },
    perc: [{ sample: 'claves', every: 'offbeat', vel: 0.16, layer: 3 }, { sample: 'vibraslap', every: 'bar', vel: 0, layer: 3 }],
    reverb: 0.28,
  },
  // Gallery V (Arnolfini, Michelangelo): clarinet song over a parlour piano, horns swell at the end
  g5: {
    scene: 'g5', gain: -1.5, theme: MAIN, bpm: 96, transpose: 3,
    melody: { inst: 'clarinet', oct: 0, vel: 0.6, legato: true },
    counter: { inst: 'glock', oct: 1, vel: 0.22, layer: 2, steps: -2 },
    bass: { inst: 'piano', center: 46, vel: 0.6 },
    comp: { inst: 'piano', style: 'waltz', low: 58, vel: 0.36 },
    pad: { inst: 'horn', low: 46, vel: 0.28, layer: 3 },
    reverb: 0.48,
  },
  // King Gloopus: a minor-key villain march, cello ostinato, bassoon grumbling, timpani thumps
  boss: {
    scene: 'boss', gain: -5.6, theme: BOSS, bpm: 132, transpose: 0,
    melody: { inst: 'bassoon', oct: -1, vel: 0.9 },
    double: { inst: 'marimba', oct: 1, vel: 0.32, layer: 3 },
    bass: { inst: 'cellopizz', center: 40, vel: 0.9 },
    comp: { inst: 'cellopizz', style: 'ostinato', low: 40, vel: 0.5 },
    perc: [
      { sample: 'timp4', every: 'bar', vel: 0.55, layer: 2, tuned: TIMPANI.timp4 },
      { sample: 'triangle1', every: 'offbeat', vel: 0.07, layer: 3 },
    ],
    reverb: 0.3,
  },
  // the grand finale: the theme slowed to a hymn, every instrument in
  finale: {
    scene: 'finale', gain: -1.1, theme: MAIN, bpm: 84, transpose: 0,
    melody: { inst: 'clarinet', oct: 0, vel: 0.6, legato: true },
    counter: { inst: 'glock', oct: 1, vel: 0.3, layer: 1, steps: -2 },
    double: { inst: 'flute', oct: 1, vel: 0.25, layer: 2 },
    bass: { inst: 'cellopizz', center: 43, vel: 0.8 },
    comp: { inst: 'harp', style: 'arp', low: 55, vel: 0.36 },
    pad: { inst: 'horn', low: 47, vel: 0.3, layer: 1 },
    perc: [{ sample: 'triangle0', every: 'twoBars', vel: 0.2, layer: 2 }],
    reverb: 0.6,
  },
};

// ------------------------------------------------------------------ compiler
export function compileSong(scene: SceneId): Song {
  const a = ARR[scene];
  const th = a.theme;
  const meter = th.meter;
  const T = a.transpose;
  const tonic = th.tonic + T;
  const events: MusicEvent[] = [];
  const insts = new Set<InstrumentId>();
  const add = (e: MusicEvent) => { events.push(e); if (e.inst) insts.add(e.inst); };

  // section plan: A, B (or A again), A with countermelody, short accompaniment-only interlude
  const isMain = th === MAIN;
  const sections: { mel: string | null; chords: string; counter: boolean }[] = isMain
    ? [
      { mel: MAIN.A, chords: MAIN.chordsA, counter: false },
      { mel: MAIN.B, chords: MAIN.chordsB, counter: true },
      { mel: MAIN.A, chords: MAIN.chordsA, counter: true },
      { mel: null, chords: MAIN.interlude, counter: false },
    ]
    : [
      { mel: BOSS.A, chords: BOSS.chordsA, counter: false },
      { mel: BOSS.A, chords: BOSS.chordsA, counter: true },
      { mel: null, chords: BOSS.interlude, counter: false },
    ];

  let bar0 = 0;
  for (const sec of sections) {
    const chords = sec.chords.split(' ').map(parseChord);
    const base = bar0 * meter;
    // melody (+ automatic diatonic harmony / doubling)
    if (sec.mel) {
      for (const n of parseLine(sec.mel)) {
        if (n.midi === null) continue;
        const m = n.midi + T;
        const leg = a.melody.legato ? 1 : 0.92;
        add({ beat: base + n.beat, dur: n.dur * leg, vel: a.melody.vel ?? 0.7, layer: a.melody.layer ?? 1, inst: a.melody.inst, midi: m + 12 * (a.melody.oct ?? 0) });
        if (a.counter && sec.counter) {
          const h = scaleStep(m, a.counter.steps, tonic, th.scale);
          add({ beat: base + n.beat, dur: n.dur * 0.95, vel: a.counter.vel ?? 0.3, layer: a.counter.layer ?? 2, inst: a.counter.inst, midi: h + 12 * (a.counter.oct ?? 0), pan: 0.35 });
        }
        if (a.double) add({ beat: base + n.beat + 0.01, dur: n.dur * 0.9, vel: a.double.vel ?? 0.3, layer: a.double.layer ?? 2, inst: a.double.inst, midi: m + 12 * (a.double.oct ?? 0), pan: -0.3 });
      }
    }
    // harmony
    chords.forEach((c, i) => {
      const b = base + i * meter;
      const root = (c.root + T + 120) % 12;
      const tones = c.tones.map((t) => (root + t) % 12);
      const bassM = place(root, a.bass.center);
      add({ beat: b, dur: meter === 3 ? 1.2 : 1.6, vel: a.bass.vel ?? 0.8, layer: 0, inst: a.bass.inst, midi: bassM, pan: -0.15 });
      if (meter === 4 && a.comp.style !== 'ostinato') add({ beat: b + 2, dur: 1.4, vel: (a.bass.vel ?? 0.8) * 0.8, layer: 0, inst: a.bass.inst, midi: place((root + 7) % 12, a.bass.center) });
      const voiced = tones.slice(0, 3).map((pc) => a.comp.low + ((pc - a.comp.low) % 12 + 12) % 12).sort((x, y) => x - y);
      const cv = a.comp.vel ?? 0.4;
      switch (a.comp.style) {
        case 'waltz':
          for (const off of [1, 2]) voiced.forEach((m, k) => add({ beat: b + off + k * 0.012, dur: 0.85, vel: cv * (off === 1 ? 1 : 0.85), layer: 0, inst: a.comp.inst, midi: m, pan: 0.2 }));
          break;
        case 'arp': {
          const r = place(root, a.comp.low + 2), third = r + ((tones[1] - root + 12) % 12), fifth = r + ((tones[2] - root + 12) % 12);
          const seq = [r, fifth, r + 12, third + 12, r + 12, fifth];
          seq.slice(0, meter * 2).forEach((m, k) => add({ beat: b + k * 0.5, dur: 1.4, vel: cv * (k === 0 ? 1.1 : 0.85), layer: 0, inst: a.comp.inst, midi: m, pan: -0.25 + (k % 3) * 0.25 }));
          break;
        }
        case 'ostinato': {
          const r = place(root, a.comp.low + 4), fifth = r + 7;
          const seq = [r, r, fifth, r, r + 12, fifth, r, fifth];
          seq.slice(0, meter * 2).forEach((m, k) => add({ beat: b + k * 0.5, dur: 0.4, vel: cv * (k % 2 ? 0.7 : 1), layer: 0, inst: a.comp.inst, midi: m }));
          break;
        }
        case 'march':
          for (const off of [1, 3]) voiced.forEach((m) => add({ beat: b + off, dur: 0.6, vel: cv, layer: 0, inst: a.comp.inst, midi: m }));
          break;
      }
      if (a.pad) {
        const pv = tones.slice(0, 3).map((pc) => a.pad!.low + ((pc - a.pad!.low) % 12 + 12) % 12);
        pv.forEach((m, k) => add({ beat: b + k * 0.02, dur: meter * 0.98, vel: a.pad!.vel ?? 0.2, layer: a.pad!.layer ?? 3, inst: a.pad!.inst, midi: m, pan: k - 1 }));
      }
      // percussion colour
      for (const p of a.perc ?? []) {
        if (p.vel <= 0) continue;
        // tuned drums (timpani) follow the chord root
        const rate = p.tuned !== undefined ? Math.pow(2, (place(root, p.tuned) - p.tuned) / 12) : p.rate;
        if (p.every === 'bar') add({ beat: b, dur: 1, vel: p.vel, layer: p.layer, sample: p.sample, rate });
        if (p.every === 'twoBars' && (bar0 + i) % 2 === 0) add({ beat: b, dur: 1, vel: p.vel, layer: p.layer, sample: p.sample, rate: p.rate, pan: 0.4 });
        if (p.every === 'beat') for (let k = 0; k < meter; k++) add({ beat: b + k, dur: 0.3, vel: p.vel, layer: p.layer, sample: p.sample, rate: p.rate });
        if (p.every === 'offbeat') for (let k = 0; k < meter; k++) add({ beat: b + k + 0.5, dur: 0.3, vel: p.vel * (k === 0 ? 0.7 : 1), layer: p.layer, sample: p.sample, rate: p.rate, pan: 0.3 });
      }
      // music-box mechanism: a soft tick on every beat, a cylinder clack on the downbeat
      if (a.tick) for (let k = 0; k < meter; k++) add({ beat: b + k, dur: 0.1, vel: k === 0 ? 0.12 : 0.07, layer: 0, sample: 'woodClick', rate: k === 0 ? 1.9 : 2.6, pan: 0.1 });
    });
    // a vibraslap rattle to open the interlude in the cheeky gallery
    if (!sec.mel && scene === 'g4') add({ beat: base, dur: 1, vel: 0.35, layer: 1, sample: 'vibraslap' });
    if (!sec.mel && scene === 'boss') add({ beat: base, dur: 1, vel: 0.4, layer: 1, sample: 'timpRoll', rate: tuneTo(tonic, TIMPANI.timpRoll) });
    bar0 += chords.length;
  }

  return {
    scene, bpm: a.bpm, meter, loopBeats: bar0 * meter, events: events.sort((x, y) => x.beat - y.beat),
    tonic, scale: th.scale, instruments: [...insts], tone: a.tone ?? 18000, reverb: a.reverb ?? 0.35, gain: Math.pow(10, (a.gain ?? 0) / 20),
  };
}

/** Which arrangement a stage plays. */
export function sceneForStage(gallery: number, mechanic: string, id: number): SceneId {
  if (mechanic === 'boss') return 'boss';
  if (id === 30) return 'finale';
  return (['g1', 'g2', 'g3', 'g4', 'g5'] as const)[Math.max(0, Math.min(4, gallery - 1))];
}

export { scaleStep };
