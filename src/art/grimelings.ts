import { RNG, TAU } from '../core/math';
import {
  clay, contactShadow, drawBlush, drawBrow, drawBubble, drawEye, drawMouth, drawSparkle, drawStarShape, drawSweat,
  lodFor, rgba, shade, stepT, type EyeStyle, type MouthStyle,
} from './draw';

/**
 * The Grimelings — mischievous grime mascots. Every species has its own silhouette and material
 * (lumpy soot, see-through ink jelly, cracked plaster shard, cloud-puff dust, glossy slime …) plus a
 * shared acting kit: surprise, panic, sneaky, grumpy, celebrate and white-flag surrender.
 */

export type CritterKind = 'soot' | 'dust' | 'slime' | 'algae' | 'fire' | 'crumb' | 'fly' | 'crack' | 'gold' | 'ink';
export type Mood = 'grump' | 'giggle' | 'sleepy' | 'sneak' | 'scared' | 'happy' | 'angry' | 'surprised' | 'surrender' | 'panic' | 'celebrate';

export interface CritterOpts {
  t: number;
  seed?: number;
  mood?: Mood;
  squash?: number;
  lookX?: number;
  lookY?: number;
  alpha?: number;
  hat?: 'none' | 'beret' | 'crown' | 'top' | 'bow';
  legs?: boolean;
}

export type SpeciesId = 'smudge' | 'blotto' | 'crackle' | 'puff' | 'gloop' | 'scorch' | 'nibs' | 'buzz' | 'glint' | 'mossy';

export const SPECIES_FOR_KIND: Record<CritterKind, SpeciesId> = {
  soot: 'smudge', ink: 'blotto', crack: 'crackle', dust: 'puff', slime: 'gloop',
  fire: 'scorch', crumb: 'nibs', fly: 'buzz', gold: 'glint', algae: 'mossy',
};

export interface CritterProfile {
  id: string;
  kind: CritterKind;
  name: string;
  species: string;
  tagline: string;
  personality: string;
  mischief: string;
  weakness: string;
  boss?: boolean;
}

export const CRITTER_PROFILES: CritterProfile[] = [
  { id: 'smudge', kind: 'soot', name: 'Smudge', species: 'Soot Smudger', tagline: 'Leaves thumbprints on everything. Proud of it.',
    personality: 'Puffed out of a 400-year-old candle with a smoke-curl quiff and ember cheeks. Grumpy until tickled — then giggles in little smoke rings.',
    mischief: 'Sneaks back into freshly cleaned patches', weakness: 'A good sponge (and tickles)' },
  { id: 'blotto', kind: 'ink', name: 'Blotto', species: 'Wobbly Ink Stain', tagline: 'Jiggles when nervous. Always nervous.',
    personality: 'A see-through puddle of spilled ink with a heart of goo. Absorbs anything shiny and can’t quite give it back.',
    mischief: 'Spreads when nobody is looking', weakness: 'Blotting paper and bright light' },
  { id: 'crackle', kind: 'crack', name: 'Crackle', species: 'Craquelure Critter', tagline: 'Splits into a grin. Literally.',
    personality: 'A chip of old plaster with a zig-zag fault line and big opinions. Snaps its two halves together like castanets when excited.',
    mischief: 'Opens brand-new cracks for fun', weakness: 'Fresh plaster patches' },
  { id: 'puff', kind: 'dust', name: 'Puffington', species: 'Dust Puff', tagline: 'Sneezes itself across the room.',
    personality: 'A cloud of museum dust with a pink nose and a fringe it refuses to trim. Moves mostly by accident, propelled by achoos.',
    mischief: 'Resettles on clean varnish', weakness: 'A soft brush and a steady hand' },
  { id: 'gloop', kind: 'slime', name: 'King Gloopus', species: 'Slime Boss', boss: true, tagline: 'Swallowed a paintbrush, a button and a crown. Kept the crown.',
    personality: 'The wobbling monarch of the Garden of Earthly Delights. Pompous, dramatic and very, very sticky. Commands a court of giggling Glooplets.',
    mischief: 'Slimes the crew and splits into minions', weakness: 'Teamwork, sponges and timing' },
  { id: 'scorch', kind: 'fire', name: 'Scorch', species: 'Ember Imp', tagline: 'Hot-headed. Literally.',
    personality: 'A candle-flame troublemaker who scorches varnish and then blows on it like that helps.', mischief: 'Leaves smoky soot trails', weakness: 'Splash crews' },
  { id: 'nibs', kind: 'crumb', name: 'Nibs', species: 'Crumb Goblin', tagline: 'Snacked in the gallery. Became the snack.',
    personality: 'A toasted crumb with sesame freckles and zero regrets. Rolls into frames and refuses to leave.', mischief: 'Attracts Buzzbys', weakness: 'The vacuum' },
  { id: 'buzz', kind: 'fly', name: 'Buzzby', species: 'Varnish Fly', tagline: 'Wears goggles. Has never once flown straight.',
    personality: 'A goggled stunt-flyer who lands in wet varnish on purpose to leave footprints.', mischief: 'Footprints in fresh varnish', weakness: 'Nets and patience' },
  { id: 'mossy', kind: 'algae', name: 'Mossy', species: 'Pond-Scum Jelly', tagline: 'Wears a lily pad. Thinks it’s fashion.',
    personality: 'Blotto’s soggy cousin from the water-lily pond. Burbles happily, clogs everything.', mischief: 'Clogs the pond channels', weakness: 'The algae vacuum' },
  { id: 'glint', kind: 'gold', name: 'Glint', species: 'Gilded Helper', tagline: 'The only friendly sparkle in the grime. Don’t catch it!',
    personality: 'A flake of gold leaf that came to life and joined the crew. Cheers loudly. Sparkles louder.', mischief: 'None — it’s on your side', weakness: 'Getting scooped up by mistake' },
];

const COLORS: Record<SpeciesId, [string, string, string]> = {
  smudge: ['#4A3C32', '#7C6A5A', '#1E1612'],
  blotto: ['#3B3F8C', '#8A90E0', '#1A1C4A'],
  crackle: ['#D8CBB0', '#F4EDDC', '#8E7C60'],
  puff: ['#CFC6B6', '#F1EBDF', '#988E7E'],
  gloop: ['#7DC24A', '#C8F08A', '#3E7A1E'],
  scorch: ['#F08A3A', '#FFE27A', '#C23A1A'],
  nibs: ['#D9A866', '#F2D6A0', '#8A5A2A'],
  buzz: ['#3A3A4A', '#8A8AA8', '#16161E'],
  glint: ['#F2C94C', '#FFF4B8', '#B8862A'],
  mossy: ['#3F8A56', '#8FD08A', '#1F4A2C'],
};

interface Acting {
  eyes: EyeStyle; brow: number; mouth: MouthStyle;
  arms: 'down' | 'up' | 'flag' | 'hips' | 'wave';
  sweat: boolean; shake: number; mark: '' | '!' | 'z' | '?';
}

function acting(mood: Mood): Acting {
  const A: Acting = { eyes: 'normal', brow: 0, mouth: 'smile', arms: 'down', sweat: false, shake: 0, mark: '' };
  switch (mood) {
    case 'grump': A.brow = -0.7; A.mouth = 'frown'; A.arms = 'hips'; break;
    case 'giggle': A.eyes = 'happy'; A.brow = 0.3; A.mouth = 'grin'; break;
    case 'sleepy': A.eyes = 'sleepy'; A.mouth = 'o'; A.mark = 'z'; break;
    case 'sneak': A.eyes = 'side'; A.brow = -0.35; A.mouth = 'smirk'; break;
    case 'scared': case 'panic': A.eyes = 'wide'; A.brow = 1; A.mouth = 'wobble'; A.arms = 'wave'; A.sweat = true; A.shake = 1; break;
    case 'happy': case 'celebrate': A.eyes = mood === 'celebrate' ? 'star' : 'happy'; A.brow = 0.5; A.mouth = 'grin'; A.arms = 'up'; break;
    case 'angry': A.brow = -1; A.mouth = 'teeth'; A.arms = 'hips'; A.shake = 0.4; break;
    case 'surprised': A.eyes = 'wide'; A.brow = 0.9; A.mouth = 'o'; A.arms = 'up'; A.mark = '!'; break;
    case 'surrender': A.eyes = 'teary'; A.brow = 0.75; A.mouth = 'wobble'; A.arms = 'flag'; break;
  }
  return A;
}

interface C {
  g: CanvasRenderingContext2D; r: number; t: number; seed: number; rng: RNG; lod: number;
  base: string; light: string; dark: string; A: Acting; mood: Mood;
}

// ------------------------------------------------------------------ body shapes

function smoothClosed(pts: [number, number][]): Path2D {
  const p = new Path2D();
  const n = pts.length;
  for (let i = 0; i <= n; i++) {
    const [ax, ay] = pts[i % n], [bx, by] = pts[(i + 1) % n];
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (i === 0) p.moveTo(mx, my); else p.quadraticCurveTo(ax, ay, mx, my);
  }
  p.closePath();
  return p;
}

function smudgeBody({ r, t, seed }: C) {
  const pts: [number, number][] = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const narrow = 1 - 0.16 * Math.max(0, -Math.sin(a));
    const lump = 1 + 0.09 * Math.sin(a * 7 + seed + t * 2) + 0.05 * Math.sin(a * 13 - t * 3);
    pts.push([Math.cos(a) * r * 1.02 * narrow * lump, Math.sin(a) * r * 0.95 * lump + r * 0.04]);
  }
  return smoothClosed(pts);
}

function blotBody({ r, t }: C) {
  const p = new Path2D();
  const w = Math.sin(t * 5) * r * 0.05;
  p.moveTo(-r * 1.12, r * 0.62);
  p.bezierCurveTo(-r * 1.2 - w, -r * 0.2, -r * 0.7, -r * 0.95 + w, 0, -r * 0.92 - w);
  p.bezierCurveTo(r * 0.7, -r * 0.95 + w, r * 1.2 + w, -r * 0.2, r * 1.12, r * 0.62);
  // wavy underside
  for (let i = 1; i <= 6; i++) {
    const x = r * 1.12 - (i / 6) * r * 2.24;
    p.quadraticCurveTo(x + r * 0.19, r * (0.85 + (i % 2) * 0.1), x, r * 0.62);
  }
  p.closePath();
  return p;
}

function crackleBody({ r, seed }: C) {
  const rng = new RNG(seed * 7 + 3);
  const pts: [number, number][] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU + (rng.next() - 0.5) * 0.3;
    const rr = r * (0.88 + rng.next() * 0.22);
    pts.push([Math.cos(a) * rr * 1.05, Math.min(r * 0.78, Math.sin(a) * rr)]);
  }
  const p = new Path2D();
  // slightly rounded polygon: shard-like but still huggable
  for (let i = 0; i <= n; i++) {
    const [ax, ay] = pts[i % n], [bx, by] = pts[(i + 1) % n];
    const mx = ax + (bx - ax) * 0.12, my = ay + (by - ay) * 0.12;
    const nx = ax + (bx - ax) * 0.88, ny = ay + (by - ay) * 0.88;
    if (i === 0) p.moveTo(mx, my); else p.quadraticCurveTo(ax, ay, mx, my);
    if (i < n) p.lineTo(nx, ny);
  }
  p.closePath();
  return p;
}

function puffBody({ r, t, seed }: C) {
  const rng = new RNG(seed * 5 + 11);
  const p = new Path2D();
  const br = 1 + Math.sin(t * 3) * 0.04;
  p.moveTo(r * 0.72, 0); p.arc(0, 0, r * 0.72 * br, 0, TAU);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rng.next() * 0.4;
    const cr = r * (0.36 + rng.next() * 0.14) * br;
    const cx = Math.cos(a) * r * 0.6, cy = Math.sin(a) * r * 0.52;
    p.moveTo(cx + cr, cy); p.arc(cx, cy, cr, 0, TAU);
  }
  return p;
}

function gloopBody({ r, t }: C) {
  const p = new Path2D();
  const lean = Math.sin(t * 2.5) * r * 0.12;
  const sq = Math.sin(t * 5) * r * 0.05;
  p.moveTo(lean, -r * 1.2 + sq);
  p.bezierCurveTo(lean + r * 0.15, -r * 0.9, r * 1.05, -r * 0.5, r * 1.08 + sq, r * 0.35);
  p.quadraticCurveTo(r * 1.15, r * 0.8, r * 0.6, r * 0.8);
  p.lineTo(-r * 0.6, r * 0.8);
  p.quadraticCurveTo(-r * 1.15, r * 0.8, -r * 1.08 - sq, r * 0.35);
  p.bezierCurveTo(-r * 1.05, -r * 0.5, lean - r * 0.15, -r * 0.9, lean, -r * 1.2 + sq);
  p.closePath();
  return p;
}

function scorchBody({ r, t }: C) {
  const p = new Path2D();
  const f = (k: number) => Math.sin(t * 18 + k) * r * 0.08;
  p.moveTo(-r * 0.95, r * 0.25);
  p.bezierCurveTo(-r * 1.0, -r * 0.4, -r * 0.6, -r * 0.6, -r * 0.55 + f(1), -r * 1.15);
  p.quadraticCurveTo(-r * 0.25, -r * 0.7, -r * 0.05 + f(2), -r * 1.55);
  p.quadraticCurveTo(r * 0.25, -r * 0.75, r * 0.55 + f(3), -r * 1.2);
  p.bezierCurveTo(r * 0.6, -r * 0.6, r * 1.0, -r * 0.4, r * 0.95, r * 0.25);
  p.bezierCurveTo(r * 0.9, r * 0.95, -r * 0.9, r * 0.95, -r * 0.95, r * 0.25);
  p.closePath();
  return p;
}

function nibsBody({ r, seed }: C) {
  const rng = new RNG(seed * 3 + 1);
  const pts: [number, number][] = [];
  const corners = [[-1, -0.85], [0, -1], [1, -0.8], [1.05, 0.1], [0.9, 0.8], [0, 0.85], [-0.95, 0.8], [-1.05, 0]];
  for (const [x, y] of corners) pts.push([x * r * (0.9 + rng.next() * 0.15), y * r * (0.9 + rng.next() * 0.12)]);
  return smoothClosed(pts);
}

function circleBody(k: number) {
  return ({ r }: C) => { const p = new Path2D(); p.arc(0, 0, r * k, 0, TAU); return p; };
}

function glintBody({ r, t }: C) {
  const p = new Path2D();
  const pulse = 1 + Math.sin(t * 6) * 0.05;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = (i % 2 ? r * 0.8 : r * 1.12) * pulse;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) p.moveTo(x, y);
    else {
      const pa = a - TAU / 16;
      p.quadraticCurveTo(Math.cos(pa) * r * 0.82, Math.sin(pa) * r * 0.82, x, y);
    }
  }
  p.quadraticCurveTo(Math.cos(-Math.PI / 2 - TAU / 16) * r * 0.82, Math.sin(-Math.PI / 2 - TAU / 16) * r * 0.82, 0, -r * 1.12 * pulse);
  p.closePath();
  return p;
}

interface SpeciesLook {
  body: (c: C) => Path2D;
  translucent?: number;
  eyeGap: number; eyeY: number; eyeR: number; mouthY: number;
  /** relative eye sizes for asymmetric faces */
  eyeL?: number; eyeR2?: number;
  feet: boolean; arms: boolean; armY: number;
  hatY: number;
  under?: (c: C) => void;
  over?: (c: C, body: Path2D) => void;
  top?: (c: C) => void;
  blush?: string;
}

const LOOK: Record<SpeciesId, SpeciesLook> = {
  smudge: {
    body: smudgeBody, eyeGap: 0.36, eyeY: -0.2, eyeR: 0.3, mouthY: 0.3, feet: true, arms: true, armY: 0.2, hatY: -1.0,
    blush: 'rgba(255,140,60,0.55)',
    over: ({ g, r, lod, rng, dark, light }) => {
      if (lod < 1) return;
      // sooty thumbprints
      g.strokeStyle = rgba(light, 0.25); g.lineWidth = Math.max(0.7, r * 0.03);
      for (let k = 0; k < 2; k++) {
        const x = (rng.next() - 0.5) * r, y = r * (0.25 + rng.next() * 0.35);
        for (let i = 1; i <= 3; i++) { g.beginPath(); g.ellipse(x, y, r * 0.05 * i, r * 0.04 * i, 0.4, 0, TAU); g.stroke(); }
      }
      g.fillStyle = dark;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc((rng.next() - 0.5) * r * 1.3, (rng.next() - 0.1) * r * 0.8, r * 0.04, 0, TAU); g.fill(); }
    },
    top: ({ g, r, t, lod }) => {
      // smoke-curl quiff
      g.save();
      g.lineCap = 'round';
      const wob = Math.sin(t * 4) * r * 0.08;
      g.strokeStyle = '#5E5048'; g.lineWidth = r * 0.22;
      g.beginPath(); g.moveTo(-r * 0.05, -r * 0.82); g.bezierCurveTo(-r * 0.2, -r * 1.25, r * 0.35 + wob, -r * 1.3, r * 0.25 + wob, -r * 1.05); g.stroke();
      if (lod > 0) {
        g.strokeStyle = 'rgba(140,125,115,0.55)'; g.lineWidth = r * 0.12;
        g.beginPath(); g.arc(r * 0.13 + wob, -r * 1.08, r * 0.12, 0.5, 4.2); g.stroke();
        g.fillStyle = 'rgba(120,108,100,0.35)';
        const ph = (t * 0.7) % 1;
        g.beginPath(); g.arc(r * 0.3 + wob, -r * (1.35 + ph * 0.6), r * (0.08 + ph * 0.12), 0, TAU); g.fill();
      }
      g.restore();
    },
  },
  blotto: {
    body: blotBody, translucent: 0.78, eyeGap: 0.36, eyeY: -0.18, eyeR: 0.28, mouthY: 0.28, feet: false, arms: true, armY: 0.25, hatY: -0.9,
    under: ({ g, r, base }) => {
      g.fillStyle = rgba(base, 0.28);
      g.beginPath(); g.ellipse(0, r * 0.82, r * 1.35, r * 0.2, 0, 0, TAU); g.fill();
    },
    over: (c) => gooInterior(c),
  },
  mossy: {
    body: blotBody, translucent: 0.8, eyeGap: 0.36, eyeY: -0.18, eyeR: 0.28, mouthY: 0.28, feet: false, arms: true, armY: 0.25, hatY: -1.05,
    under: ({ g, r, base }) => {
      g.fillStyle = rgba(base, 0.3);
      g.beginPath(); g.ellipse(0, r * 0.82, r * 1.35, r * 0.2, 0, 0, TAU); g.fill();
    },
    over: (c) => gooInterior(c),
    top: ({ g, r, t }) => {
      // the lily-pad hat it is very proud of
      g.save();
      g.translate(r * 0.15, -r * 0.88);
      g.rotate(-0.15 + Math.sin(t * 3) * 0.06);
      g.fillStyle = '#6FB04E';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r * 0.5, 0.25, TAU - 0.25); g.closePath(); g.fill();
      g.strokeStyle = '#3F7A2E'; g.lineWidth = r * 0.04; g.stroke();
      g.fillStyle = '#F4A6C0'; g.beginPath(); g.arc(-r * 0.15, -r * 0.12, r * 0.12, 0, TAU); g.fill();
      g.restore();
    },
  },
  crackle: {
    body: crackleBody, eyeGap: 0.34, eyeY: -0.22, eyeR: 0.26, mouthY: 0.3, eyeL: 1.25, eyeR2: 0.8, feet: true, arms: true, armY: 0.15, hatY: -0.95,
    over: ({ g, r, t, lod, dark, light, A, seed }) => {
      // the signature zig-zag fault line — it gapes open when the critter panics or laughs
      const open = A.shake > 0.5 ? 0.06 : A.mouth === 'grin' ? 0.03 + Math.abs(Math.sin(t * 10)) * 0.03 : 0;
      const pts: [number, number][] = [[-r * 0.15, -r * 0.95], [r * 0.05, -r * 0.62], [-r * 0.1, -r * 0.45], [r * 0.12, -r * 0.05], [-r * 0.04, r * 0.25], [r * 0.12, r * 0.8]];
      g.lineJoin = 'miter';
      g.strokeStyle = dark; g.lineWidth = Math.max(1, r * (0.07 + open));
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + r * 0.55, y) : g.moveTo(x + r * 0.55, y))); g.stroke();
      if (lod > 0) {
        g.strokeStyle = rgba(light, 0.8); g.lineWidth = Math.max(0.6, r * 0.025);
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + r * 0.57, y + r * 0.03) : g.moveTo(x + r * 0.57, y + r * 0.03))); g.stroke();
        // hairline branches
        g.strokeStyle = rgba(dark, 0.6); g.lineWidth = Math.max(0.6, r * 0.025);
        g.beginPath(); g.moveTo(r * 0.67, -r * 0.05); g.lineTo(r * 0.85, r * 0.1); g.moveTo(r * 0.45, -r * 0.45); g.lineTo(r * 0.3, -r * 0.6); g.stroke();
        // plaster pores
        const rng = new RNG(seed + 40);
        g.fillStyle = rgba(dark, 0.3);
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((rng.next() - 0.6) * r * 1.2, (rng.next() - 0.2) * r, r * 0.03, 0, TAU); g.fill(); }
      }
      if (A.shake > 0.5 || A.mouth === 'grin') {
        // flying chips
        g.fillStyle = light;
        for (let i = 0; i < 3; i++) {
          const ph = (t * 1.5 + i / 3) % 1;
          g.beginPath(); g.moveTo(r * (0.9 + ph * 0.6), -r * (0.2 + i * 0.3) - ph * r * 0.4); g.lineTo(r * (1.0 + ph * 0.6), -r * (0.15 + i * 0.3) - ph * r * 0.4); g.lineTo(r * (0.92 + ph * 0.6), -r * (0.05 + i * 0.3) - ph * r * 0.4); g.fill();
        }
      }
    },
  },
  puff: {
    body: puffBody, eyeGap: 0.3, eyeY: -0.02, eyeR: 0.22, mouthY: 0.38, feet: true, arms: false, armY: 0.2, hatY: -1.05,
    over: ({ g, r, lod, light, rng }) => {
      if (lod < 1) return;
      g.strokeStyle = rgba(light, 0.45); g.lineWidth = Math.max(0.6, r * 0.05); g.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = rng.next() * TAU, d = r * (0.82 + rng.next() * 0.15);
        const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.85;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1.2) * r * 0.08, y + Math.sin(a + 1.2) * r * 0.08, x + Math.cos(a + 0.6) * r * 0.12, y + Math.sin(a + 0.6) * r * 0.12); g.stroke();
      }
    },
    top: ({ g, r, t, lod, base, light, seed }) => {
      // the untrimmed fringe draped over the eyes + pink nose
      const fringe = new Path2D();
      for (let i = 0; i < 4; i++) { const x = -r * 0.42 + i * r * 0.28; fringe.moveTo(x + r * 0.2, -r * 0.24); fringe.arc(x, -r * 0.24, r * 0.2, 0, TAU); }
      clay(g, fringe, base, { cx: 0, cy: -r * 0.25, w: r, h: r * 0.4, lod: Math.min(lod, 1), outline: 'none' });
      g.fillStyle = '#F2A0A8';
      g.beginPath(); g.ellipse(0, r * 0.2, r * 0.1, r * 0.075, 0, 0, TAU); g.fill();
      // achoo cycle
      const ph = (t * 0.25 + seed * 0.1) % 1;
      if (ph > 0.9 && lod > 0) {
        const k = (ph - 0.9) / 0.1;
        g.fillStyle = rgba(light, 0.8 * (1 - k));
        for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(r * (0.5 + k * 1.2), r * (0.2 + (i - 2) * 0.12 * (1 + k)), r * 0.06 * (1 + i % 2), 0, TAU); g.fill(); }
      }
    },
  },
  gloop: {
    body: gloopBody, translucent: 0.86, eyeGap: 0.36, eyeY: -0.12, eyeR: 0.27, mouthY: 0.35, feet: false, arms: true, armY: 0.3, hatY: -1.15,
    under: ({ g, r, base, t }) => {
      g.fillStyle = rgba(base, 0.32);
      g.beginPath(); g.ellipse(0, r * 0.85, r * (1.4 + Math.sin(t * 5) * 0.05), r * 0.22, 0, 0, TAU); g.fill();
    },
    over: (c) => {
      const { g, r, t, lod } = c;
      if (r > 34 && lod > 0) {
        // the boss's swallowed treasures, blurred by goo
        g.save();
        g.globalAlpha *= 0.55;
        g.translate(-r * 0.45, r * 0.4); g.rotate(-0.5 + Math.sin(t) * 0.1);
        g.fillStyle = '#8A5A34'; g.fillRect(-r * 0.04, -r * 0.3, r * 0.08, r * 0.45);
        g.fillStyle = '#D4A84A'; g.fillRect(-r * 0.06, -r * 0.38, r * 0.12, r * 0.1);
        g.fillStyle = '#E86F5A'; g.beginPath(); g.ellipse(0, -r * 0.48, r * 0.06, r * 0.1, 0, 0, TAU); g.fill();
        g.restore();
        g.save();
        g.globalAlpha *= 0.5;
        g.fillStyle = '#3A6EA5'; g.beginPath(); g.arc(r * 0.5, r * 0.45, r * 0.12, 0, TAU); g.fill();
        g.fillStyle = '#1A2A4A'; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(r * 0.5 + dx * r * 0.035, r * 0.45 + dy * r * 0.035, r * 0.018, 0, TAU); g.fill(); }
        g.restore();
      }
      gooInterior(c);
    },
  },
  scorch: {
    body: scorchBody, eyeGap: 0.32, eyeY: -0.05, eyeR: 0.26, mouthY: 0.4, feet: false, arms: true, armY: 0.3, hatY: -1.2,
    over: ({ g, r, t, lod }) => {
      const core = new Path2D(); core.ellipse(0, r * 0.25, r * 0.55, r * 0.55, 0, 0, TAU);
      g.fillStyle = 'rgba(255,240,170,0.45)'; g.fill(core);
      if (lod > 0) for (let i = 0; i < 3; i++) {
        const ph = (t * 1.2 + i / 3) % 1;
        g.fillStyle = `rgba(255,${180 - ph * 100},60,${1 - ph})`;
        g.beginPath(); g.arc(Math.sin(i * 2 + t * 3) * r * 0.6, -r * (1.2 + ph * 0.9), r * 0.06 * (1 - ph * 0.5), 0, TAU); g.fill();
      }
    },
  },
  nibs: {
    body: nibsBody, eyeGap: 0.34, eyeY: -0.15, eyeR: 0.26, mouthY: 0.32, feet: true, arms: true, armY: 0.15, hatY: -0.95,
    over: ({ g, r, lod, dark, seed }) => {
      if (lod < 1) return;
      const rng = new RNG(seed + 77);
      g.fillStyle = rgba(dark, 0.45);
      for (let i = 0; i < 7; i++) { g.beginPath(); g.arc((rng.next() - 0.5) * r * 1.4, (rng.next() - 0.4) * r * 1.2, r * (0.03 + rng.next() * 0.03), 0, TAU); g.fill(); }
      g.fillStyle = '#FFF4DC';
      for (let i = 0; i < 4; i++) { g.save(); g.translate((rng.next() - 0.5) * r * 1.3, -r * 0.55 - rng.next() * r * 0.2); g.rotate(rng.next() * 3); g.beginPath(); g.ellipse(0, 0, r * 0.07, r * 0.035, 0, 0, TAU); g.fill(); g.restore(); }
    },
  },
  buzz: {
    body: circleBody(0.85), eyeGap: 0.34, eyeY: -0.2, eyeR: 0.32, mouthY: 0.32, feet: false, arms: false, armY: 0.2, hatY: -0.95,
    under: ({ g, r, t, lod }) => {
      const flap = Math.sin(t * 60) * 0.5;
      g.fillStyle = 'rgba(220,235,255,0.55)';
      g.strokeStyle = 'rgba(160,190,220,0.8)'; g.lineWidth = Math.max(0.6, r * 0.03);
      for (const side of [-1, 1]) {
        g.beginPath(); g.ellipse(side * r * 0.65, -r * 0.65, r * 0.6, r * 0.32, side * (-0.6 + flap), 0, TAU); g.fill(); if (lod > 0) g.stroke();
      }
      g.strokeStyle = '#16161E'; g.lineWidth = Math.max(0.8, r * 0.05); g.lineCap = 'round';
      g.beginPath(); g.moveTo(-r * 0.2, -r * 0.8); g.quadraticCurveTo(-r * 0.3, -r * 1.2, -r * 0.5, -r * 1.25); g.moveTo(r * 0.2, -r * 0.8); g.quadraticCurveTo(r * 0.3, -r * 1.2, r * 0.5, -r * 1.25); g.stroke();
    },
    over: ({ g, r, lod }) => {
      if (lod < 1) return;
      g.strokeStyle = 'rgba(140,220,200,0.35)'; g.lineWidth = r * 0.06;
      g.beginPath(); g.arc(0, 0, r * 0.7, 0.3, 1.4); g.stroke();
      g.strokeStyle = 'rgba(200,140,230,0.3)';
      g.beginPath(); g.arc(0, 0, r * 0.7, 1.5, 2.4); g.stroke();
    },
    top: ({ g, r, lod }) => {
      // aviator goggle rims
      if (lod < 1) return;
      g.strokeStyle = '#B07A44'; g.lineWidth = r * 0.07;
      for (const side of [-1, 1]) { g.beginPath(); g.arc(side * r * 0.34, -r * 0.2, r * 0.36, 0, TAU); g.stroke(); }
      g.beginPath(); g.moveTo(-r * 0.02, -r * 0.24); g.lineTo(r * 0.02, -r * 0.24); g.stroke();
    },
  },
  glint: {
    body: glintBody, eyeGap: 0.3, eyeY: -0.08, eyeR: 0.25, mouthY: 0.3, feet: false, arms: true, armY: 0.2, hatY: -1.1,
    blush: 'rgba(240,120,90,0.45)',
    top: ({ g, r, t }) => {
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i * TAU) / 3;
        drawSparkle(g, Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.9 - r * 0.2, r * 0.14 * (0.6 + 0.4 * Math.sin(t * 8 + i)), '#FFF8D0');
      }
    },
  },
};

/** Inner goo: a darker core, rising bubbles and a glossy wet highlight. */
function gooInterior({ g, r, t, lod, dark, seed }: C) {
  g.fillStyle = rgba(dark, 0.22);
  g.beginPath(); g.ellipse(r * 0.1, r * 0.25, r * 0.55, r * 0.35, 0, 0, TAU); g.fill();
  if (lod > 0) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i / 3 + seed * 0.07) % 1;
      drawBubble(g, Math.sin(i * 2.3 + seed) * r * 0.5, r * 0.55 - ph * r * 1.1, r * (0.05 + (i % 2) * 0.03));
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.ellipse(-r * 0.5, -r * 0.45, r * 0.22, r * 0.1, -0.7, 0, TAU); g.fill();
  g.beginPath(); g.arc(-r * 0.22, -r * 0.66, r * 0.05, 0, TAU); g.fill();
}

// ------------------------------------------------------------------ renderer

/** Draw a Grimeling centred at (x, y) with body radius `r` (feet rest at about y + 0.9r). */
export function drawGrimeling(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: CritterKind, o: CritterOpts) {
  const seed = o.seed ?? 0;
  const sp = SPECIES_FOR_KIND[kind] ?? 'smudge';
  const L = LOOK[sp];
  const t = stepT(o.t + seed * 0.21);
  const mood = o.mood ?? (['grump', 'giggle', 'sleepy', 'sneak'] as Mood[])[seed % 4];
  const A = acting(mood);
  const [base, light, dark] = COLORS[sp];
  const lod = lodFor(g, r);
  const c: C = { g, r, t, seed, rng: new RNG(seed * 13 + 1), lod, base, light, dark, A, mood };
  let sq = o.squash ?? 1 + Math.sin(t * 6 + seed) * 0.07;
  if (mood === 'celebrate' || mood === 'happy') sq *= 1 + Math.abs(Math.sin(t * 9)) * 0.08;
  if (mood === 'surrender') sq *= 0.9;
  const hop = mood === 'celebrate' ? Math.abs(Math.sin(t * 9)) * r * 0.35 : 0;
  const shake = A.shake ? Math.sin(t * 50) * r * 0.06 * A.shake : 0;

  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  g.translate(x, y);
  contactShadow(g, 0, r * 0.9, r * 0.95 * (1 - hop / (r * 2)), r * 0.22, 0.3);
  g.translate(shake, -hop);
  if (mood === 'surrender') g.rotate(-0.08);
  g.scale(1 / Math.sqrt(sq), sq);

  // feet
  if (L.feet && o.legs !== false) {
    const k = Math.sin(t * 16 + seed) * r * 0.12;
    for (const side of [-1, 1]) {
      const fp = new Path2D(); fp.ellipse(side * r * 0.4 + side * k, r * 0.86, r * 0.2, r * 0.12, 0, 0, TAU);
      clay(g, fp, dark, { cx: side * r * 0.4, cy: r * 0.86, w: r * 0.4, h: r * 0.24, lod: Math.min(lod, 1) });
    }
  }
  L.under?.(c);
  // arms behind the body for the wave/up poses read better in front, so draw them after the body
  const body = L.body(c);
  clay(g, body, base, { cx: 0, cy: 0, w: r * 2, h: r * 2, lod, alpha: L.translucent, rim: sp === 'scorch' ? 'rgba(255,240,170,0.5)' : undefined, felt: sp === 'blotto' || sp === 'gloop' || sp === 'mossy' ? 0 : sp === 'puff' ? 0.3 : 0.18 });
  L.over?.(c, body);

  // face
  const sizeJ = 0.92 + ((seed * 7) % 5) * 0.04;
  const er = r * L.eyeR * sizeJ;
  const lx = o.lookX ?? Math.sin(t * 1.3 + seed) * 0.6;
  const ly = o.lookY ?? Math.cos(t * 1.1 + seed) * 0.4;
  const blink = mood !== 'sleepy' && ((t * 0.3 + seed * 0.19) % 1) > 0.965 ? 1 : 0;
  for (const side of [-1, 1] as const) {
    const k = side < 0 ? L.eyeL ?? 1 : L.eyeR2 ?? 1;
    const ex = side * r * L.eyeGap, ey = r * L.eyeY;
    drawEye(g, ex, ey, er * k, er * k * 1.08, { style: A.eyes, lookX: lx, lookY: ly, iris: '#2A1A10', lid: shade(base, -0.05), t, blink, lod, jiggle: 1, pupil: 0.6 });
    if (lod > 0 && (A.brow !== 0)) drawBrow(g, ex, ey - er * k * 1.35, er * 1.8, A.brow, side, shade(dark, -0.3), Math.max(1, r * 0.09));
  }
  if (lod > 0 && L.blush !== undefined) {
    drawBlush(g, -r * (L.eyeGap + 0.2), r * (L.eyeY + 0.36), r * 0.16, L.blush);
    drawBlush(g, r * (L.eyeGap + 0.2), r * (L.eyeY + 0.36), r * 0.16, L.blush);
  }
  drawMouth(g, 0, r * L.mouthY, r * 0.42, A.mouth, t, '#1A0E06');
  L.top?.(c);

  if (L.arms) drawCritterArms(c, L.armY);
  if (A.sweat && lod > 0) drawSweat(g, r * 0.75, -r * 0.6, r * 0.13, t);
  if (A.mark === '!') {
    g.fillStyle = '#FFF4C2'; g.strokeStyle = '#3B2418'; g.lineWidth = Math.max(1, r * 0.06);
    g.font = `900 ${r * 0.8}px "Nunito Variable", system-ui`; g.textAlign = 'center';
    g.strokeText('!', r * 0.95, -r * 0.9); g.fillText('!', r * 0.95, -r * 0.9);
  } else if (A.mark === 'z' && lod > 0) {
    g.fillStyle = 'rgba(246,239,227,0.9)';
    g.font = `800 ${r * 0.45}px "Nunito Variable", system-ui`; g.textAlign = 'center';
    const ph = (t * 0.6) % 1;
    g.save();
    g.globalAlpha *= 1 - ph;
    g.fillText('z', r * (0.8 + ph * 0.4), -r * (0.8 + ph * 0.6));
    g.restore();
  }
  if ((mood === 'celebrate') && lod > 0) {
    for (let i = 0; i < 4; i++) {
      const a = t * 3 + (i * TAU) / 4;
      drawStarShape(g, Math.cos(a) * r * 1.4, -r * 0.4 + Math.sin(a) * r * 0.5, r * 0.12, i % 2 ? '#F2CF4A' : '#FFF4C2', 4);
    }
  }

  // personality hats
  const hat = o.hat ?? (seed % 7 === 3 ? 'beret' : seed % 11 === 5 ? 'top' : 'none');
  drawHat(g, hat, r, r * L.hatY, lod);
  g.restore();
}

function drawCritterArms(c: C, armY: number) {
  const { g, r, t, A, dark, base } = c;
  const y0 = r * armY;
  const len = r * 0.42;
  g.lineCap = 'round';
  const arm = (side: -1 | 1, a: number) => {
    const sx = side * r * 0.86, ex = sx + side * Math.sin(a) * len, ey = y0 + Math.cos(a) * len;
    g.strokeStyle = shade(base, -0.4); g.lineWidth = r * 0.2;
    g.beginPath(); g.moveTo(sx, y0); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = base; g.lineWidth = r * 0.13;
    g.beginPath(); g.moveTo(sx, y0); g.lineTo(ex, ey); g.stroke();
    return { x: ex, y: ey };
  };
  switch (A.arms) {
    case 'up': arm(-1, 2.6 + Math.sin(t * 12) * 0.2); arm(1, 2.6 - Math.sin(t * 12) * 0.2); break;
    case 'wave': arm(-1, 2.4 + Math.sin(t * 30) * 0.4); arm(1, 2.4 - Math.sin(t * 30) * 0.4); break;
    case 'hips': arm(-1, 1.2); arm(1, 1.2); break;
    case 'flag': {
      arm(-1, 0.4);
      const h = arm(1, 2.9);
      g.strokeStyle = '#8A5A34'; g.lineWidth = Math.max(1, r * 0.06);
      g.beginPath(); g.moveTo(h.x, h.y + r * 0.1); g.lineTo(h.x, h.y - r * 0.9); g.stroke();
      g.fillStyle = '#FFFDF6'; g.strokeStyle = 'rgba(60,40,30,0.5)'; g.lineWidth = Math.max(0.6, r * 0.03);
      const fl = Math.sin(t * 8) * r * 0.06;
      g.beginPath(); g.moveTo(h.x, h.y - r * 0.9); g.quadraticCurveTo(h.x + r * 0.3, h.y - r * 0.95 + fl, h.x + r * 0.6, h.y - r * 0.85); g.lineTo(h.x + r * 0.6, h.y - r * 0.5); g.quadraticCurveTo(h.x + r * 0.3, h.y - r * 0.55 - fl, h.x, h.y - r * 0.5); g.closePath(); g.fill(); g.stroke();
      break;
    }
    default: arm(-1, 0.5 + Math.sin(t * 4) * 0.08); arm(1, 0.5 - Math.sin(t * 4) * 0.08);
  }
  void dark;
}

function drawHat(g: CanvasRenderingContext2D, hat: CritterOpts['hat'], r: number, y: number, lod: number) {
  if (!hat || hat === 'none') return;
  if (hat === 'beret') {
    const p = new Path2D(); p.ellipse(r * 0.1, y + r * 0.05, r * 0.55, r * 0.2, -0.2, 0, TAU);
    clay(g, p, '#B33A22', { cx: r * 0.1, cy: y, w: r * 1.1, h: r * 0.4, lod: Math.min(lod, 1) });
    g.fillStyle = '#B33A22'; g.fillRect(r * 0.05, y - r * 0.22, r * 0.08, r * 0.15);
  } else if (hat === 'top') {
    const p = new Path2D(); p.rect(-r * 0.3, y - r * 0.55, r * 0.6, r * 0.6); p.rect(-r * 0.5, y, r * 1.0, r * 0.12);
    clay(g, p, '#2A1E18', { cx: 0, cy: y - r * 0.2, w: r, h: r * 0.7, lod: Math.min(lod, 1) });
    g.fillStyle = '#B33A22'; g.fillRect(-r * 0.3, y - r * 0.12, r * 0.6, r * 0.1);
  } else if (hat === 'crown') {
    const p = new Path2D();
    p.moveTo(-r * 0.5, y + r * 0.1); p.lineTo(-r * 0.55, y - r * 0.42); p.lineTo(-r * 0.25, y - r * 0.18); p.lineTo(0, y - r * 0.55); p.lineTo(r * 0.25, y - r * 0.18); p.lineTo(r * 0.55, y - r * 0.42); p.lineTo(r * 0.5, y + r * 0.1); p.closePath();
    clay(g, p, '#E8C46A', { cx: 0, cy: y - r * 0.2, w: r * 1.1, h: r * 0.65, lod });
    g.fillStyle = '#E86F5A'; g.beginPath(); g.arc(0, y - r * 0.05, r * 0.08, 0, TAU); g.fill();
    g.fillStyle = '#3A6EA5'; g.beginPath(); g.arc(-r * 0.28, y - r * 0.02, r * 0.06, 0, TAU); g.arc(r * 0.28, y - r * 0.02, r * 0.06, 0, TAU); g.fill();
  } else if (hat === 'bow') {
    g.fillStyle = '#E86F5A';
    g.beginPath(); g.ellipse(-r * 0.2, y + r * 0.05, r * 0.22, r * 0.13, 0.4, 0, TAU); g.ellipse(r * 0.2, y + r * 0.05, r * 0.22, r * 0.13, -0.4, 0, TAU); g.fill();
  }
}
