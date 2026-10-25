import { TAU } from '../core/math';
import {
  clay, contactShadow, drawBlush, drawBrow, drawBubble, drawEye, drawHeart, drawMouth, drawSparkle, drawStarShape,
  drawSweat, lodFor, roundRect, rrect, shade, stepT, type EyeStyle, type MouthStyle,
} from './draw';

/**
 * The Tiny Restorers — four recurring heroes with distinct silhouettes (gumdrop, tall capsule,
 * pillow, paint-drop), each sculpted in the house "felt & clay diorama" material and animated
 * at stop-motion 12fps. `drawHero` is the renderer behind the legacy `drawWorker` API.
 */

export type WorkerTool = 'none' | 'sponge' | 'brush' | 'bucket' | 'vacuum' | 'plaster' | 'lantern' | 'flag' | 'squeegee' | 'polish' | 'rope' | 'hose' | 'net' | 'hammer';
export type WorkerState = 'idle' | 'walk' | 'work' | 'cheer' | 'dizzy' | 'carry' | 'lift' | 'scared' | 'signature';
export type HeroId = 'pip' | 'bristle' | 'mo' | 'zuzu';

export interface WorkerOpts {
  t: number;
  seed?: number;
  /** explicit hero; otherwise picked deterministically from `seed` */
  hero?: HeroId;
  facing?: number;
  state?: WorkerState;
  tool?: WorkerTool;
  /** team / outfit colour override (dispatch teams, slimed crew) */
  overalls?: string;
  carry?: string;
  lookX?: number;
  lookY?: number;
  alpha?: number;
  badge?: string;
}

export interface HeroProfile {
  id: HeroId;
  name: string;
  role: string;
  tagline: string;
  personality: string;
  signature: string;
  motif: string;
  tool: WorkerTool;
  color: string;
}

export const HERO_ORDER: HeroId[] = ['pip', 'bristle', 'mo', 'zuzu'];

export const HEROES: Record<HeroId, HeroProfile> = {
  pip: {
    id: 'pip', name: 'Pip Sudsworth', role: 'Rookie Scrubber', color: '#2F8F8B', tool: 'sponge',
    tagline: 'Has never met a smudge it couldn’t out-wiggle.',
    personality: 'Endlessly eager, slightly too fast, always humming. Pip wears the crew’s lucky sponge as a hat and refuses to take it off — even in the bath.',
    signature: 'Bubble Bounce — a big hop that launches the sponge hat into a spin and a stream of bubbles.',
    motif: 'Gumdrop body · sponge hat · freckles · bubbles',
  },
  bristle: {
    id: 'bristle', name: 'Professor Bristlebrow', role: 'Senior Conservator', color: '#F3EBDD', tool: 'brush',
    tagline: 'Seventy years of squinting at varnish. Still delighted.',
    personality: 'Fussy, kind and theatrical. Inspects every brushstroke through a brass loupe, and the paint-dipped tuft on top doubles as an emergency touch-up brush.',
    signature: 'Eureka Loupe — leans in, the loupe eye swells enormous, eyebrows dance, brush conducts.',
    motif: 'Tall capsule · brush-tip hair · walrus moustache · brass loupe',
  },
  mo: {
    id: 'mo', name: 'Big Mo Brogan', role: 'Lifter & Scaffold Boss', color: '#3A6EA5', tool: 'bucket',
    tagline: 'Can lift a scaffold. Cries at sunsets.',
    personality: 'Strong, soft-spoken and gloriously sentimental. Mo carries buckets, ladders and, on busy days, Pip. The hard hat is three sizes too small and that is not up for discussion.',
    signature: 'Gentle Giant Flex — a squishy crouch, a double-bicep flex and a little heart.',
    motif: 'Pillow body · polka-dot bandana · tiny hard hat · mitten gloves',
  },
  zuzu: {
    id: 'zuzu', name: 'Zuzu Glimmer', role: 'Lamplighter & Pigment Courier', color: '#E86F5A', tool: 'lantern',
    tagline: 'Smallest on the crew. Fastest in the gallery.',
    personality: 'Fearless, chatty and sparkly. Zuzu zips colour along craquelure roads and lights the way into the darkest varnish with an antenna lantern.',
    signature: 'Twinkle Twirl — a spinning hop that leaves an orbit of little stars.',
    motif: 'Paint-drop raincoat · antenna lantern · bouncing pigtails · rain boots',
  },
};

export const heroForSeed = (seed: number): HeroId => HERO_ORDER[((Math.round(seed) % 4) + 4) % 4];

// ------------------------------------------------------------------ pose

interface Pose {
  bob: number; sq: number; tilt: number; spin: number;
  armF: number; armB: number; bendF: number; bendB: number; legA: number;
  eyes: EyeStyle; brow: number; mouth: MouthStyle; sweat: boolean;
  /** 0..1 phase of the signature loop */
  sig: number;
  sigOn: boolean;
}

function pose(state: WorkerState, t: number, id: HeroId): Pose {
  const P: Pose = { bob: 0, sq: 1, tilt: 0, spin: 1, armF: 0.3, armB: -0.3, bendF: 0.25, bendB: -0.25, legA: 0, eyes: 'normal', brow: 0, mouth: 'smile', sweat: false, sig: 0, sigOn: false };
  switch (state) {
    case 'walk': case 'carry': {
      const ph = t * 14;
      P.bob = Math.abs(Math.sin(ph)) * 0.14;
      P.legA = Math.sin(ph);
      P.sq = 1 + Math.sin(ph * 2) * 0.04;
      if (state === 'carry') { P.armF = 2.75; P.armB = 2.75; P.bendF = P.bendB = 0; P.mouth = 'o'; P.brow = 0.3; }
      else { P.armF = Math.sin(ph) * 0.7; P.armB = -Math.sin(ph) * 0.7; }
      break;
    }
    case 'work':
      P.armF = 1.25 + Math.sin(t * 22) * 0.55;
      P.armB = -0.2;
      P.sq = 1 + Math.sin(t * 22) * 0.05;
      P.tilt = 0.08 + Math.sin(t * 11) * 0.05;
      P.brow = -0.45; P.mouth = 'tongue';
      break;
    case 'cheer': case 'signature': {
      P.sigOn = true;
      const u = (t % 1.6) / 1.6;
      P.sig = u;
      if (id === 'pip') {
        if (u < 0.6) { const k = u / 0.6; P.bob = Math.sin(k * Math.PI) * 0.6; P.sq = 1 + Math.sin(k * Math.PI) * 0.08; }
        else { const k = (u - 0.6) / 0.4; P.sq = 1 - Math.sin(k * Math.PI) * 0.15; }
        P.armF = 2.6 + Math.sin(t * 16) * 0.2; P.armB = 2.6 - Math.sin(t * 16) * 0.2; P.bendF = P.bendB = 0;
        P.eyes = 'happy'; P.mouth = 'grin'; P.brow = 0.5;
      } else if (id === 'bristle') {
        P.tilt = 0.06 + Math.sin(t * 4) * 0.13;
        P.armF = 2.3 + Math.sin(t * 8) * 0.5; P.armB = 0.4;
        P.eyes = 'star'; P.brow = 0.7 + Math.sin(t * 12) * 0.3; P.mouth = 'grin';
        P.bob = Math.abs(Math.sin(t * 4)) * 0.08;
      } else if (id === 'mo') {
        if (u < 0.3) { P.sq = 1 - Math.sin((u / 0.3) * Math.PI) * 0.14; P.armF = 0.6; P.armB = 0.6; }
        else { P.bob = Math.sin(((u - 0.3) / 0.7) * Math.PI) * 0.18; P.armF = 1.55; P.armB = 1.55; P.bendF = 1.5; P.bendB = 1.5; P.sq = 1.04; }
        P.eyes = 'happy'; P.mouth = 'gap'; P.brow = 0.3;
      } else {
        P.spin = Math.cos(u * TAU);
        if (Math.abs(P.spin) < 0.18) P.spin = P.spin < 0 ? -0.18 : 0.18;
        P.bob = Math.abs(Math.sin(u * TAU)) * 0.32;
        P.armF = 2.5; P.armB = 2.5; P.bendF = P.bendB = 0;
        P.eyes = 'star'; P.mouth = 'grin'; P.brow = 0.4;
      }
      break;
    }
    case 'dizzy':
      P.tilt = Math.sin(t * 8) * 0.3;
      P.armF = 0.8 + Math.sin(t * 6) * 0.5; P.armB = -0.8;
      P.eyes = 'spiral'; P.mouth = 'wobble'; P.brow = 0.6;
      break;
    case 'lift':
      P.armF = 2.9; P.armB = 2.9; P.bendF = P.bendB = 0;
      P.sq = 0.9 + Math.sin(t * 6) * 0.03;
      P.eyes = 'squint'; P.brow = -0.7; P.mouth = 'teeth'; P.sweat = true;
      break;
    case 'scared':
      P.bob = Math.abs(Math.sin(t * 30)) * 0.06;
      P.tilt = Math.sin(t * 40) * 0.04;
      P.armF = 2.5 + Math.sin(t * 40) * 0.2; P.armB = 2.5;
      P.eyes = 'wide'; P.brow = 1; P.mouth = 'wobble'; P.sweat = true;
      break;
    default:
      P.sq = 1 + Math.sin(t * 3) * 0.03;
      P.armF = 0.3 + Math.sin(t * 2.2) * 0.06;
  }
  return P;
}

// ------------------------------------------------------------------ looks

interface Ctx {
  g: CanvasRenderingContext2D; s: number; W: number; H: number; t: number; P: Pose; lod: number;
  o: WorkerOpts; L: Look; outfit: string; state: WorkerState;
}

interface Look {
  w: number; h: number;
  body: string; skin: string;
  outfitTop: number;
  boot: string; glove: string; sleeve?: string; iris: string; lid?: string;
  eye: number; eyeGap: number; faceY: number; faceX: number;
  shoulder: number; arm: number; armW: number; hand: number;
  brows: string; browW: number;
  shape: (W: number, H: number) => Path2D;
  back?: (c: Ctx) => void;
  outfitDetail?: (c: Ctx) => void;
  /** drawn after the eyes/mouth */
  front: (c: Ctx) => void;
  eyeScale?: (front: boolean, c: Ctx) => number;
  mouthDY?: number;
  headTop: number;
}

function gumdrop(W: number, H: number) {
  const p = new Path2D();
  p.moveTo(-W * 0.5, -H * 0.08);
  p.bezierCurveTo(-W * 0.57, -H * 0.58, -W * 0.36, -H, 0, -H);
  p.bezierCurveTo(W * 0.36, -H, W * 0.57, -H * 0.58, W * 0.5, -H * 0.08);
  p.quadraticCurveTo(W * 0.48, 0, W * 0.34, 0);
  p.lineTo(-W * 0.34, 0);
  p.quadraticCurveTo(-W * 0.48, 0, -W * 0.5, -H * 0.08);
  p.closePath();
  return p;
}

function capsule(W: number, H: number) {
  const r = W / 2;
  const p = new Path2D();
  p.moveTo(-r, -H + r);
  p.arc(0, -H + r, r, Math.PI, 0);
  p.bezierCurveTo(r, -H * 0.5, r * 1.12, -H * 0.2, r * 1.12, -H * 0.06);
  p.quadraticCurveTo(r * 1.1, 0, r * 0.8, 0);
  p.lineTo(-r * 0.8, 0);
  p.quadraticCurveTo(-r * 1.1, 0, -r * 1.12, -H * 0.06);
  p.bezierCurveTo(-r * 1.12, -H * 0.2, -r, -H * 0.5, -r, -H + r);
  p.closePath();
  return p;
}

function pillow(W: number, H: number) {
  const p = new Path2D();
  p.moveTo(0, -H);
  p.bezierCurveTo(W * 0.4, -H, W * 0.5, -H * 0.95, W * 0.51, -H * 0.62);
  p.bezierCurveTo(W * 0.53, -H * 0.2, W * 0.48, 0, W * 0.28, 0);
  p.lineTo(-W * 0.28, 0);
  p.bezierCurveTo(-W * 0.48, 0, -W * 0.53, -H * 0.2, -W * 0.51, -H * 0.62);
  p.bezierCurveTo(-W * 0.5, -H * 0.95, -W * 0.4, -H, 0, -H);
  p.closePath();
  return p;
}

function paintDrop(W: number, H: number) {
  const p = new Path2D();
  p.moveTo(W * 0.14, -H);
  p.bezierCurveTo(W * 0.06, -H * 0.82, W * 0.52, -H * 0.62, W * 0.52, -H * 0.32);
  p.bezierCurveTo(W * 0.52, -H * 0.06, W * 0.3, 0, 0, 0);
  p.bezierCurveTo(-W * 0.3, 0, -W * 0.52, -H * 0.06, -W * 0.52, -H * 0.32);
  p.bezierCurveTo(-W * 0.52, -H * 0.64, -W * 0.12, -H * 0.76, W * 0.14, -H);
  p.closePath();
  return p;
}

const LOOKS: Record<HeroId, Look> = {
  // ---------------------------------------------------------------- PIP: gumdrop + sponge hat
  pip: {
    w: 1.22, h: 1.6, body: '#EDB98E', skin: '#EDB98E', outfitTop: 0.4,
    boot: '#4A2E1E', glove: '#F4D35E', iris: '#6A4024',
    eye: 0.145, eyeGap: 0.205, faceY: 0.68, faceX: 0.05,
    shoulder: 0.4, arm: 0.5, armW: 0.2, hand: 0.12, brows: '#B8662E', browW: 0.06,
    shape: gumdrop, headTop: 1.85,
    outfitDetail: ({ g, W, H, outfit, lod, s }) => {
      // bib, straps and gold buttons
      const bib = new Path2D();
      bib.moveTo(-W * 0.25, -H * 0.36); bib.lineTo(-W * 0.22, -H * 0.47); bib.quadraticCurveTo(0, -H * 0.49, W * 0.22, -H * 0.47); bib.lineTo(W * 0.25, -H * 0.36); bib.closePath();
      clay(g, bib, outfit, { cx: 0, cy: -H * 0.42, w: W * 0.5, h: H * 0.13, lod: Math.min(lod, 1), outline: 'none' });
      g.strokeStyle = outfit; g.lineWidth = s * 0.07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-W * 0.2, -H * 0.46); g.lineTo(-W * 0.46, -H * 0.5); g.moveTo(W * 0.2, -H * 0.46); g.lineTo(W * 0.46, -H * 0.5); g.stroke();
      g.fillStyle = '#F2C94C';
      g.beginPath(); g.arc(-W * 0.19, -H * 0.445, s * 0.045, 0, TAU); g.arc(W * 0.19, -H * 0.445, s * 0.045, 0, TAU); g.fill();
      if (lod > 0) {
        // pocket with a spare brush poking out
        g.fillStyle = shade(outfit, -0.18);
        roundRect(g, -W * 0.12, -H * 0.3, W * 0.24, H * 0.12, s * 0.04); g.fill();
        g.fillStyle = '#8A5A34'; g.fillRect(W * 0.03, -H * 0.36, s * 0.04, H * 0.07);
        g.fillStyle = '#F2C94C'; g.beginPath(); g.ellipse(W * 0.05, -H * 0.375, s * 0.04, s * 0.06, 0, 0, TAU); g.fill();
      }
    },
    front: (c) => {
      const { g, W, H, s, t, P, lod } = c;
      if (lod > 0) {
        g.fillStyle = 'rgba(176,100,60,0.55)';
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
          g.beginPath(); g.arc(W * c.L.faceX + sx * W * (0.24 + i * 0.05), -H * (0.555 - (i % 2) * 0.025), s * 0.018, 0, TAU); g.fill();
        }
      }
      // orange fringe peeking from under the sponge
      g.strokeStyle = '#D9773A'; g.lineWidth = s * 0.07; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < 4; i++) { const x = -W * 0.22 + i * W * 0.15; g.moveTo(x, -H * 0.88); g.quadraticCurveTo(x + W * 0.08, -H * 0.85, x + W * 0.03, -H * 0.82); }
      g.stroke();
      // the sponge hat (spins off during the Bubble Bounce)
      const u = P.sig;
      const lift = P.sigOn ? Math.max(0, Math.sin(Math.min(1, u / 0.75) * Math.PI)) * H * 0.55 : 0;
      const rot = P.sigOn ? -0.14 + Math.min(1, u / 0.75) * TAU : -0.14 + Math.sin(t * 3) * 0.03;
      g.save();
      g.translate(W * 0.04, -H * 0.97 - lift);
      g.rotate(rot);
      const sw = W * 0.98, sh = H * 0.3;
      const sp = rrect(-sw / 2, -sh / 2, sw, sh, sh * 0.32);
      clay(g, sp, '#F4D35E', { cx: 0, cy: 0, w: sw, h: sh, lod });
      g.save(); g.clip(sp);
      const scrub = new Path2D(); scrub.rect(-sw / 2, sh * 0.16, sw, sh * 0.4);
      clay(g, scrub, '#3E9B83', { cx: 0, cy: sh * 0.3, w: sw, h: sh * 0.4, lod: Math.min(lod, 1), outline: 'none' });
      if (lod > 0) {
        g.fillStyle = 'rgba(180,130,30,0.55)';
        const holes = [[-0.32, -0.2, 0.06], [-0.12, -0.05, 0.045], [0.08, -0.22, 0.055], [0.3, -0.06, 0.05], [0.18, 0.02, 0.03], [-0.38, 0.04, 0.035]];
        for (const [hx, hy, hr] of holes) { g.beginPath(); g.ellipse(hx * sw, hy * sh * 1.6, hr * sw, hr * sw * 0.7, 0, 0, TAU); g.fill(); }
      }
      g.restore();
      g.restore();
      // bubbles drift up from the sponge
      const nb = P.sigOn ? 5 : c.state === 'work' ? 3 : lod > 1 ? 1 : 0;
      for (let i = 0; i < nb; i++) {
        const ph = (t * (P.sigOn ? 0.9 : 0.45) + i / Math.max(1, nb)) % 1;
        drawBubble(g, W * (0.3 + Math.sin(ph * 6 + i) * 0.2) - (i % 2) * W * 0.5, -H * 1.05 - lift - ph * H * 0.9, s * (0.06 + (i % 3) * 0.025) * (0.6 + ph));
      }
    },
  },

  // ---------------------------------------------------------------- BRISTLE: tall capsule + brush-tip hair + loupe
  bristle: {
    w: 0.92, h: 1.95, body: '#8C5A3C', skin: '#8C5A3C', outfitTop: 0.5,
    boot: '#2A1A12', glove: '#8C5A3C', sleeve: '#E9DFCC', iris: '#3B2A1E', lid: '#7A4C32',
    eye: 0.15, eyeGap: 0.21, faceY: 0.75, faceX: 0.06,
    shoulder: 0.48, arm: 0.56, armW: 0.16, hand: 0.1, brows: '#F4EEE2', browW: 0.1,
    shape: capsule, headTop: 2.4, mouthDY: 0.08,
    eyeScale: (front, c) => (front ? 1.25 + (c.P.sigOn ? 0.45 * (0.5 + 0.5 * Math.sin(c.t * 4)) : 0) : 0.92),
    outfitDetail: ({ g, W, H, s, lod, outfit }) => {
      // lapels, centre seam, pocket pens, bow tie
      g.fillStyle = shade(outfit, -0.1);
      g.beginPath(); g.moveTo(-W * 0.05, -H * 0.5); g.lineTo(-W * 0.3, -H * 0.5); g.lineTo(-W * 0.08, -H * 0.28); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W * 0.05, -H * 0.5); g.lineTo(W * 0.3, -H * 0.5); g.lineTo(W * 0.08, -H * 0.28); g.closePath(); g.fill();
      g.strokeStyle = shade(outfit, -0.22); g.lineWidth = s * 0.025;
      g.beginPath(); g.moveTo(0, -H * 0.3); g.lineTo(0, -H * 0.02); g.stroke();
      if (lod > 0) {
        g.fillStyle = '#C9B99F'; g.beginPath(); g.arc(W * 0.04, -H * 0.2, s * 0.03, 0, TAU); g.arc(W * 0.04, -H * 0.1, s * 0.03, 0, TAU); g.fill();
        g.fillStyle = '#E86F5A'; g.fillRect(-W * 0.36, -H * 0.44, s * 0.05, H * 0.08);
        g.fillStyle = '#2F8F8B'; g.fillRect(-W * 0.28, -H * 0.42, s * 0.05, H * 0.07);
        g.fillStyle = shade(outfit, -0.16); roundRect(g, -W * 0.42, -H * 0.38, W * 0.26, H * 0.08, s * 0.02); g.fill();
      }
      g.fillStyle = '#E86F5A';
      g.beginPath(); g.moveTo(0, -H * 0.5); g.lineTo(-W * 0.16, -H * 0.54); g.lineTo(-W * 0.16, -H * 0.46); g.closePath();
      g.moveTo(0, -H * 0.5); g.lineTo(W * 0.16, -H * 0.54); g.lineTo(W * 0.16, -H * 0.46); g.closePath(); g.fill();
    },
    front: (c) => {
      const { g, W, H, s, t, P, lod, L } = c;
      const fx = W * L.faceX;
      // brush-tip hair: brass ferrule + paint-dipped bristles
      const sway = Math.sin(t * 3) * 0.08 + (P.sigOn ? Math.sin(t * 12) * 0.12 : 0);
      g.save();
      g.translate(0, -H + W * 0.06);
      g.rotate(sway);
      const n = lod > 0 ? 9 : 5;
      for (let i = 0; i < n; i++) {
        const a = -0.55 + (i / (n - 1)) * 1.1;
        const len = s * (0.5 + Math.cos(a * 2) * 0.12);
        const ex = Math.sin(a) * len, ey = -Math.cos(a) * len;
        g.strokeStyle = '#F4EEE2'; g.lineWidth = s * 0.13; g.lineCap = 'round';
        g.beginPath(); g.moveTo(Math.sin(a) * s * 0.1, 0); g.quadraticCurveTo(ex * 0.6, ey * 0.55, ex, ey); g.stroke();
        g.strokeStyle = '#E86F5A'; g.lineWidth = s * 0.11;
        g.beginPath(); g.moveTo(ex * 0.8, ey * 0.8); g.lineTo(ex, ey); g.stroke();
      }
      const fer = rrect(-W * 0.34, -s * 0.06, W * 0.68, s * 0.16, s * 0.05);
      clay(g, fer, '#D4A84A', { cx: 0, cy: 0, w: W * 0.68, h: s * 0.16, lod: Math.min(lod, 1) });
      g.restore();
      // nose + walrus moustache (wiggles during Eureka)
      const ny = -H * L.faceY + s * 0.17;
      g.fillStyle = shade(L.skin, -0.18);
      g.beginPath(); g.ellipse(fx + s * 0.03, ny - s * 0.02, s * 0.075, s * 0.06, 0, 0, TAU); g.fill();
      const wig = P.sigOn ? Math.sin(t * 20) * 0.12 : Math.sin(t * 2) * 0.03;
      for (const side of [-1, 1]) {
        g.save();
        g.translate(fx + side * s * 0.01, ny + s * 0.04);
        g.rotate(side * (0.25 + wig));
        const m = new Path2D();
        m.moveTo(0, 0);
        m.bezierCurveTo(side * s * 0.12, -s * 0.06, side * s * 0.3, -s * 0.02, side * s * 0.33, s * 0.1);
        m.bezierCurveTo(side * s * 0.24, s * 0.06, side * s * 0.12, s * 0.12, 0, s * 0.06);
        m.closePath();
        clay(g, m, '#F4EEE2', { cx: side * s * 0.15, cy: s * 0.04, w: s * 0.33, h: s * 0.14, lod: Math.min(lod, 1) });
        g.restore();
      }
      // brass loupe over the front eye
      const er = W * L.eye * L.eyeScale!(true, c);
      const ex = fx + W * L.eyeGap, ey = -H * L.faceY;
      g.strokeStyle = '#C9963A'; g.lineWidth = s * 0.06;
      g.fillStyle = 'rgba(190,230,255,0.18)';
      g.beginPath(); g.arc(ex, ey, er * 1.35, 0, TAU); g.fill(); g.stroke();
      if (lod > 0) {
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = s * 0.025;
        g.beginPath(); g.arc(ex, ey, er * 1.12, -2.4, -1.6); g.stroke();
        g.strokeStyle = 'rgba(201,150,58,0.8)'; g.lineWidth = s * 0.015;
        g.beginPath(); g.moveTo(ex + er * 1.3, ey + er * 0.4); g.quadraticCurveTo(ex + er * 1.6, -H * 0.55, W * 0.24, -H * 0.47); g.stroke();
      }
      if (P.sigOn) drawSparkle(g, ex + er * 1.3, ey - er * 1.3, s * 0.12 * (0.6 + 0.4 * Math.sin(t * 9)));
    },
  },

  // ---------------------------------------------------------------- MO: pillow + bandana + tiny hard hat
  mo: {
    w: 1.62, h: 1.5, body: '#C68B5E', skin: '#C68B5E', outfitTop: 0.46,
    boot: '#3B2418', glove: '#E8C46A', sleeve: '#E86F5A', iris: '#3B2A1E', lid: '#A8724A',
    eye: 0.1, eyeGap: 0.16, faceY: 0.68, faceX: 0.05,
    shoulder: 0.5, arm: 0.54, armW: 0.27, hand: 0.15, brows: '#3B2418', browW: 0.09,
    shape: pillow, headTop: 1.8,
    back: ({ g, W, H, s, t, P }) => {
      // bandana knot tails flutter behind
      const fl = Math.sin(t * (P.sigOn ? 14 : 5)) * 0.25;
      g.fillStyle = '#C93B30';
      for (const k of [0, 1]) {
        g.save();
        g.translate(-W * 0.48, -H * 0.86);
        g.rotate(-0.5 - k * 0.5 + fl * (k ? 1 : -1));
        g.beginPath(); g.moveTo(0, -s * 0.06); g.quadraticCurveTo(-s * 0.3, -s * 0.12, -s * 0.42, 0); g.quadraticCurveTo(-s * 0.3, s * 0.05, 0, s * 0.06); g.fill();
        g.restore();
      }
    },
    outfitDetail: ({ g, W, H, s, lod, outfit }) => {
      // t-shirt band, wide denim straps, big pocket with a wrench, stitching
      g.fillStyle = '#E86F5A'; g.fillRect(-W, -H * 0.56, W * 2, H * 0.1);
      const bib = rrect(-W * 0.26, -H * 0.58, W * 0.52, H * 0.2, s * 0.06);
      clay(g, bib, outfit, { cx: 0, cy: -H * 0.48, w: W * 0.52, h: H * 0.2, lod: Math.min(lod, 1), outline: 'none' });
      g.strokeStyle = outfit; g.lineWidth = s * 0.11;
      g.beginPath(); g.moveTo(-W * 0.22, -H * 0.56); g.lineTo(-W * 0.42, -H * 0.64); g.moveTo(W * 0.22, -H * 0.56); g.lineTo(W * 0.42, -H * 0.64); g.stroke();
      g.fillStyle = '#E8C46A';
      g.beginPath(); g.arc(-W * 0.2, -H * 0.54, s * 0.055, 0, TAU); g.arc(W * 0.2, -H * 0.54, s * 0.055, 0, TAU); g.fill();
      g.fillStyle = shade(outfit, -0.2);
      roundRect(g, -W * 0.18, -H * 0.34, W * 0.36, H * 0.17, s * 0.06); g.fill();
      g.fillStyle = '#9AA5A8';
      g.fillRect(W * 0.06, -H * 0.44, s * 0.06, H * 0.12);
      g.beginPath(); g.arc(W * 0.06 + s * 0.03, -H * 0.45, s * 0.07, 0, TAU); g.fill();
      if (lod > 1) {
        g.setLineDash([s * 0.04, s * 0.04]);
        g.strokeStyle = 'rgba(240,200,110,0.7)'; g.lineWidth = s * 0.015;
        g.strokeRect(-W * 0.16, -H * 0.32, W * 0.32, H * 0.13);
        g.setLineDash([]);
      }
    },
    front: (c) => {
      const { g, W, H, s, t, P, lod } = c;
      // polka-dot bandana around the crown
      const band = new Path2D();
      band.moveTo(-W * 0.52, -H * 0.8); band.quadraticCurveTo(0, -H * 0.86, W * 0.52, -H * 0.8);
      band.lineTo(W * 0.5, -H * 0.92); band.quadraticCurveTo(0, -H * 1.0, -W * 0.5, -H * 0.92); band.closePath();
      g.save(); g.clip(LOOKS.mo.shape(W, H));
      clay(g, band, '#D9483B', { cx: 0, cy: -H * 0.87, w: W, h: H * 0.13, lod: Math.min(lod, 1), outline: 'none' });
      if (lod > 0) {
        g.fillStyle = '#FFF4E4';
        for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(-W * 0.42 + i * W * 0.14, -H * (0.87 + (i % 2) * 0.03), s * 0.03, 0, TAU); g.fill(); }
      }
      g.restore();
      // the three-sizes-too-small hard hat
      g.save();
      g.translate(W * 0.1, -H * 0.99);
      g.rotate(0.22 + (P.sigOn ? Math.sin(t * 14) * 0.1 : 0));
      const hat = new Path2D(); hat.arc(0, 0, s * 0.24, Math.PI, 0); hat.closePath();
      clay(g, hat, '#F2B630', { cx: 0, cy: -s * 0.1, w: s * 0.48, h: s * 0.24, lod: Math.min(lod, 1) });
      g.fillStyle = '#D99A1A'; roundRect(g, -s * 0.32, -s * 0.03, s * 0.64, s * 0.07, s * 0.03); g.fill();
      g.restore();
      // stubble
      if (lod > 1) {
        g.fillStyle = 'rgba(70,40,25,0.35)';
        for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(W * c.L.faceX + (i - 4) * s * 0.07, -H * 0.53 + Math.abs(i - 4) * -s * 0.012, s * 0.012, 0, TAU); g.fill(); }
      }
      if (P.sigOn && P.sig > 0.35) {
        const k = (P.sig - 0.35) / 0.65;
        g.globalAlpha *= 1 - k * 0.6;
        drawHeart(g, W * 0.3, -H * 1.1 - k * s * 0.6, s * (0.12 + k * 0.08));
      }
    },
  },

  // ---------------------------------------------------------------- ZUZU: paint-drop raincoat + antenna lantern
  zuzu: {
    w: 1.04, h: 1.5, body: '#E86F5A', skin: '#F5D7B8', outfitTop: 0,
    boot: '#F2B630', glove: '#F2B630', iris: '#2F6F8F', lid: '#EBC6A2',
    eye: 0.17, eyeGap: 0.18, faceY: 0.52, faceX: 0.04,
    shoulder: 0.38, arm: 0.42, armW: 0.17, hand: 0.1, brows: '#3B2418', browW: 0.05,
    shape: paintDrop, headTop: 1.95,
    back: ({ g, W, H, s, t, P, lod }) => {
      const bounce = Math.sin(t * (P.sigOn ? 16 : 6)) * s * 0.04;
      for (const side of [-1, 1]) {
        const px = side * W * 0.56, py = -H * 0.5 + bounce * side;
        const p = new Path2D(); p.arc(px, py, W * 0.16, 0, TAU);
        clay(g, p, '#3B2418', { cx: px, cy: py, w: W * 0.32, h: W * 0.32, lod: Math.min(lod, 1) });
        g.fillStyle = '#2F8F8B'; g.beginPath(); g.arc(px - side * W * 0.12, py, s * 0.05, 0, TAU); g.fill();
      }
    },
    outfitDetail: ({ g, W, H, s, lod, L }) => {
      // the hood's face window, bangs and toggle buttons
      const fx = W * L.faceX;
      const win = new Path2D(); win.ellipse(fx, -H * 0.5, W * 0.37, H * 0.25, 0, 0, TAU);
      clay(g, win, L.skin, { cx: fx, cy: -H * 0.5, w: W * 0.74, h: H * 0.5, lod: Math.min(lod, 1), outline: 'rgba(120,40,30,0.55)', outlineW: s * 0.05 });
      g.save(); g.clip(win);
      g.fillStyle = '#3B2418';
      g.beginPath(); g.ellipse(fx - W * 0.1, -H * 0.74, W * 0.32, H * 0.08, -0.25, 0, TAU); g.ellipse(fx + W * 0.2, -H * 0.73, W * 0.22, H * 0.07, 0.3, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = '#FFF4E4';
      if (lod > 0) for (const yy of [0.2, 0.1]) { roundRect(g, -s * 0.07, -H * yy - s * 0.025, s * 0.14, s * 0.05, s * 0.02); g.fill(); }
    },
    front: (c) => {
      const { g, W, H, s, t, P, lod } = c;
      // antenna lantern rising from the paint-drop tip
      const tipX = W * 0.14, tipY = -H;
      const sw = Math.sin(t * (P.sigOn ? 10 : 3)) * s * 0.08;
      const lx = tipX + s * 0.12 + sw, ly = tipY - s * 0.32;
      g.strokeStyle = '#5A3A28'; g.lineWidth = s * 0.035; g.lineCap = 'round';
      g.beginPath(); g.moveTo(tipX, tipY); g.quadraticCurveTo(tipX + s * 0.02, ly + s * 0.1, lx, ly); g.stroke();
      if (lod > 0) {
        const gr = g.createRadialGradient(lx, ly + s * 0.05, 0, lx, ly + s * 0.05, s * 0.45);
        gr.addColorStop(0, `rgba(255,220,120,${0.5 + Math.sin(t * 13) * 0.08})`); gr.addColorStop(1, 'rgba(255,220,120,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(lx, ly + s * 0.05, s * 0.45, 0, TAU); g.fill();
      }
      g.fillStyle = '#FFE09A'; roundRect(g, lx - s * 0.07, ly, s * 0.14, s * 0.15, s * 0.04); g.fill();
      g.strokeStyle = '#8A5A34'; g.lineWidth = s * 0.025; g.stroke();
      if (P.sigOn || lod > 1) {
        const n = P.sigOn ? 5 : 2;
        for (let i = 0; i < n; i++) {
          const a = t * (P.sigOn ? 4 : 1.2) + (i / n) * TAU;
          const rr = P.sigOn ? W * 0.75 : W * 0.25;
          drawStarShape(g, Math.cos(a) * rr, -H * (P.sigOn ? 0.6 : 1.05) + Math.sin(a) * rr * 0.35 - (P.sigOn ? 0 : s * 0.25), s * (P.sigOn ? 0.09 : 0.045), i % 2 ? '#FFF4C2' : '#F2CF4A', 4);
        }
      }
    },
  },
};

// ------------------------------------------------------------------ renderer

/** Draw one of the Tiny Restorers standing at (x, y) — feet on the ground — at unit size `s`. */
export function drawHero(g: CanvasRenderingContext2D, x: number, y: number, s: number, o: WorkerOpts) {
  const seed = o.seed ?? 0;
  const id = o.hero ?? heroForSeed(seed);
  const L = LOOKS[id];
  const t = stepT(o.t + seed * 0.37);
  const state = o.state ?? 'idle';
  const facing = (o.facing ?? 1) < 0 ? -1 : 1;
  const P = pose(state, t, id);
  const lod = lodFor(g, s);
  const W = s * L.w, H = s * L.h, foot = s * 0.13;
  const outfit = o.overalls ?? (id === 'zuzu' ? L.body : id === 'bristle' ? '#F3EBDD' : id === 'mo' ? '#3A6EA5' : '#2F8F8B');
  const c: Ctx = { g, s, W, H, t, P, lod, o, L, outfit, state };

  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  g.translate(x, y);
  contactShadow(g, 0, 0, W * 0.62 * (1 - Math.min(0.5, P.bob * 0.6)), s * 0.17);
  g.translate(0, -P.bob * s);
  g.rotate(P.tilt * facing);
  g.scale((facing * P.spin) / Math.sqrt(P.sq), P.sq);

  // feet
  const step = P.legA * W * 0.12;
  g.fillStyle = L.boot;
  for (const side of [-1, 1]) {
    const lift = Math.max(0, side * P.legA) * s * 0.08;
    const fp = new Path2D(); fp.ellipse(side * W * 0.2 + side * step + s * 0.04, -foot * 0.45 - lift, s * 0.16, s * 0.1, 0, 0, TAU);
    clay(g, fp, L.boot, { cx: side * W * 0.2, cy: -foot * 0.45, w: s * 0.32, h: s * 0.2, lod: Math.min(lod, 1) });
  }
  g.translate(0, -foot);

  L.back?.(c);
  // back arm sits behind the body
  drawArm(c, -1, P.armB, P.bendB);

  // body: skin/coat clay, then the outfit layer clipped inside
  const bodyCol = id === 'zuzu' ? outfit : L.body;
  const body = L.shape(W, H);
  clay(g, body, bodyCol, { cx: 0, cy: -H * 0.5, w: W, h: H, lod });
  if (L.outfitTop > 0) {
    g.save();
    g.clip(body);
    const op = new Path2D();
    op.moveTo(-W, -H * L.outfitTop);
    op.quadraticCurveTo(0, -H * (L.outfitTop - 0.04), W, -H * L.outfitTop);
    op.lineTo(W, s); op.lineTo(-W, s); op.closePath();
    clay(g, op, outfit, { cx: 0, cy: -H * L.outfitTop * 0.5, w: W, h: H * L.outfitTop, lod, outline: 'none' });
    g.restore();
  }
  if (L.outfitDetail) { g.save(); g.clip(body); L.outfitDetail(c); g.restore(); }
  if (o.badge) {
    g.fillStyle = o.badge;
    g.beginPath(); g.arc(-W * 0.02, -H * 0.3, s * 0.11, 0, TAU); g.fill();
    g.strokeStyle = '#FFF4E4'; g.lineWidth = s * 0.03; g.stroke();
  }

  // face
  const fx = W * L.faceX, fy = -H * L.faceY;
  const blink = state === 'idle' || state === 'walk' ? (((t * 0.28 + seed * 0.13) % 1) > 0.962 ? 1 : 0) : 0;
  const lookX = (o.lookX ?? 0.3) * facing, lookY = o.lookY ?? 0;
  for (const side of [-1, 1] as const) {
    const k = L.eyeScale ? L.eyeScale(side === 1, c) : 1;
    const rx = W * L.eye * k, ry = rx * 1.18;
    drawEye(g, fx + side * W * L.eyeGap, fy, rx, ry, { style: P.eyes, lookX, lookY, iris: L.iris, lid: L.lid ?? shade(L.skin, -0.1), t, blink, lod });
    if (lod > 0) drawBrow(g, fx + side * W * L.eyeGap, fy - ry * 1.35 - (P.brow > 0 ? P.brow * ry * 0.3 : 0), rx * 1.9, P.brow, side, L.brows, s * L.browW);
  }
  if (lod > 0 && id !== 'bristle') {
    drawBlush(g, fx - W * (L.eyeGap + 0.1), fy + W * L.eye * 1.55, W * 0.085);
    drawBlush(g, fx + W * (L.eyeGap + 0.1), fy + W * L.eye * 1.55, W * 0.085);
  }
  drawMouth(g, fx + s * 0.02, fy + W * L.eye * 1.45 + s * (L.mouthDY ?? 0), s * 0.2, P.mouth, t);
  L.front(c);

  // front arm + tool on top
  const hand = drawArm(c, 1, P.armF, P.bendF);
  drawTool(g, o.tool ?? 'none', hand.x, hand.y, s, t, o.carry);

  if (P.sweat) drawSweat(g, fx - W * 0.42, fy - H * 0.08, s * 0.08, t);
  if (state === 'dizzy') {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * TAU) / 3;
      drawStarShape(g, Math.cos(a) * W * 0.55, -s * L.headTop - s * 0.1 + Math.sin(a) * s * 0.12, s * 0.12, '#F2CF4A');
    }
  }
  g.restore();
}

function drawArm(c: Ctx, side: -1 | 1, a: number, bend: number) {
  const { g, s, W, H, L, outfit, lod } = c;
  const sx = side * W * (L === LOOKS.mo ? 0.46 : 0.42);
  const sy = -H * L.shoulder;
  const len = s * L.arm;
  const dir = side;
  const ex = sx + dir * Math.sin(a) * len * 0.55, ey = sy + Math.cos(a) * len * 0.55;
  const hx = ex + dir * Math.sin(a + bend) * len * 0.5, hy = ey + Math.cos(a + bend) * len * 0.5;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = shade(L.sleeve ?? outfit, -0.45); g.lineWidth = s * L.armW + Math.max(1, s * 0.05);
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(hx, hy); g.stroke();
  g.strokeStyle = side < 0 ? shade(L.sleeve ?? outfit, -0.12) : L.sleeve ?? outfit; g.lineWidth = s * L.armW;
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(hx, hy); g.stroke();
  const hp = new Path2D(); hp.arc(hx, hy, s * L.hand, 0, TAU);
  clay(g, hp, L.glove, { cx: hx, cy: hy, w: s * L.hand * 2, h: s * L.hand * 2, lod: Math.min(lod, 1) });
  return { x: hx, y: hy };
}

export function drawTool(g: CanvasRenderingContext2D, tool: WorkerTool, hx: number, hy: number, s: number, t: number, carry?: string) {
  switch (tool) {
    case 'sponge':
      g.fillStyle = '#F2D45C'; roundRect(g, hx - s * 0.18, hy - s * 0.12, s * 0.36, s * 0.26, s * 0.06); g.fill();
      g.fillStyle = '#4FA48F'; g.fillRect(hx - s * 0.18, hy + s * 0.06, s * 0.36, s * 0.08);
      break;
    case 'brush': case 'polish':
      g.strokeStyle = '#8A5A34'; g.lineWidth = s * 0.08;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + s * 0.25, hy - s * 0.35); g.stroke();
      g.fillStyle = tool === 'polish' ? '#F6EFE3' : '#E8C46A';
      g.beginPath(); g.ellipse(hx + s * 0.3, hy - s * 0.44, s * 0.12, s * 0.07, -0.9, 0, TAU); g.fill();
      break;
    case 'bucket':
      g.fillStyle = '#9AA5A8'; g.beginPath(); g.moveTo(hx - s * 0.18, hy); g.lineTo(hx + s * 0.18, hy); g.lineTo(hx + s * 0.14, hy + s * 0.3); g.lineTo(hx - s * 0.14, hy + s * 0.3); g.fill();
      g.fillStyle = carry ?? '#3A6EA5'; g.beginPath(); g.ellipse(hx, hy, s * 0.18, s * 0.05, 0, 0, TAU); g.fill();
      break;
    case 'vacuum': case 'hose':
      g.strokeStyle = '#5A6266'; g.lineWidth = s * 0.12;
      g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo(hx + s * 0.4, hy + s * 0.2, hx + s * 0.55, hy + s * 0.5); g.stroke();
      g.fillStyle = '#E86F5A'; g.beginPath(); g.arc(hx + s * 0.55, hy + s * 0.5, s * 0.1, 0, TAU); g.fill();
      break;
    case 'plaster':
      g.fillStyle = '#8A8A8A'; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + s * 0.35, hy - s * 0.1); g.lineTo(hx + s * 0.3, hy + s * 0.08); g.fill();
      g.fillStyle = '#EDE6D6'; g.beginPath(); g.arc(hx + s * 0.25, hy - s * 0.05, s * 0.08, 0, TAU); g.fill();
      break;
    case 'lantern': {
      const gr = g.createRadialGradient(hx, hy + s * 0.15, 0, hx, hy + s * 0.15, s * 0.55);
      gr.addColorStop(0, 'rgba(255,220,120,0.5)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(hx, hy + s * 0.15, s * 0.55, 0, TAU); g.fill();
      g.fillStyle = '#F7D774'; roundRect(g, hx - s * 0.1, hy, s * 0.2, s * 0.28, s * 0.05); g.fill();
      g.strokeStyle = '#8A5A34'; g.lineWidth = s * 0.03; g.stroke();
      break;
    }
    case 'flag':
      g.strokeStyle = '#5A3A28'; g.lineWidth = s * 0.06;
      g.beginPath(); g.moveTo(hx, hy + s * 0.2); g.lineTo(hx, hy - s * 0.8); g.stroke();
      g.fillStyle = '#E86F5A';
      g.beginPath(); g.moveTo(hx, hy - s * 0.8); g.lineTo(hx + s * 0.5, hy - s * 0.65 + Math.sin(t * 8) * s * 0.05); g.lineTo(hx, hy - s * 0.5); g.fill();
      break;
    case 'squeegee':
      g.strokeStyle = '#5A3A28'; g.lineWidth = s * 0.07;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + s * 0.1, hy - s * 0.5); g.stroke();
      g.fillStyle = '#2B2B2B'; g.fillRect(hx - s * 0.15, hy - s * 0.58, s * 0.5, s * 0.08);
      break;
    case 'rope':
      g.strokeStyle = '#C9A04E'; g.lineWidth = s * 0.06;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx, hy - s * 1.4); g.stroke();
      break;
    case 'net':
      g.strokeStyle = '#8A5A34'; g.lineWidth = s * 0.06;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + s * 0.3, hy - s * 0.5); g.stroke();
      g.strokeStyle = 'rgba(246,239,227,0.9)'; g.lineWidth = s * 0.03;
      g.beginPath(); g.arc(hx + s * 0.38, hy - s * 0.66, s * 0.2, 0, TAU); g.stroke();
      break;
    case 'hammer':
      g.strokeStyle = '#8A5A34'; g.lineWidth = s * 0.07;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + s * 0.2, hy - s * 0.4); g.stroke();
      g.fillStyle = '#5A6266'; g.fillRect(hx + s * 0.08, hy - s * 0.52, s * 0.28, s * 0.13);
      break;
  }
}

/** Approximate standing height of a hero in units of `s` (feet to top of hat/hair). */
export const heroHeight = (id: HeroId) => LOOKS[id].headTop + 0.13;
