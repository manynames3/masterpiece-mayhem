import { RNG, makeNoise, TAU } from '../core/math';

const cache = new Map<string, HTMLCanvasElement>();

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export interface GrimeStyle {
  base: string;       // dominant grime color
  dark: string;
  light: string;
  speckle?: number;   // speckle density
  streaks?: boolean;
  fuzz?: boolean;     // dust-bunny fuzz
  seed?: number;
}

export const GRIME: Record<string, GrimeStyle> = {
  soot: { base: '#5A4630', dark: '#2E2216', light: '#8A7250', speckle: 1, streaks: true },
  smoke: { base: '#4A4038', dark: '#221C18', light: '#7C6E60', speckle: 0.6 },
  dust: { base: '#9A8E7E', dark: '#6A6052', light: '#C8BCA8', speckle: 0.4, fuzz: true },
  algae: { base: '#3E6B44', dark: '#1F3E28', light: '#7FAE6A', speckle: 0.7 },
  slime: { base: '#6FA43A', dark: '#3C6A1E', light: '#B6E06A', speckle: 0.5 },
  tarnish: { base: '#6E6A5A', dark: '#3A382E', light: '#A8A28A', speckle: 0.5, streaks: true },
  plaster: { base: '#B9AE98', dark: '#8A806C', light: '#E2D9C6', speckle: 0.8 },
};

/** Painterly grime texture: mottled noise, speckles, drips — sized to the play area. */
export function grimeTexture(w: number, h: number, style: GrimeStyle): HTMLCanvasElement {
  const key = `grime:${w}x${h}:${style.base}:${style.seed ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const res = 4;
  const sw = Math.ceil(w / res), sh = Math.ceil(h / res);
  const small = canvas(sw, sh);
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(sw, sh);
  const noise = makeNoise(style.seed ?? 7);
  const [br, bg, bb] = hex(style.base), [dr, dg, db] = hex(style.dark), [lr, lg, lb] = hex(style.light);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const n = noise(x / 22, y / 22, 4);
      const m = noise(x / 6 + 100, y / 6, 2);
      let t = n * 1.4 - 0.2 + (m - 0.5) * 0.35;
      t = Math.max(0, Math.min(1, t));
      const r = t < 0.5 ? dr + (br - dr) * t * 2 : br + (lr - br) * (t - 0.5) * 2;
      const gg = t < 0.5 ? dg + (bg - dg) * t * 2 : bg + (lg - bg) * (t - 0.5) * 2;
      const b = t < 0.5 ? db + (bb - db) * t * 2 : bb + (lb - bb) * (t - 0.5) * 2;
      const i = (y * sw + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b;
      img.data[i + 3] = 235 + m * 20;
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, w, h);
  const rng = new RNG((style.seed ?? 7) * 31 + 5);
  const spk = Math.round((w * h) / 900 * (style.speckle ?? 0.5));
  for (let i = 0; i < spk; i++) {
    const x = rng.next() * w, y = rng.next() * h;
    g.fillStyle = rng.chance(0.6) ? `rgba(${dr},${dg},${db},${0.3 + rng.next() * 0.5})` : `rgba(${lr},${lg},${lb},${0.25 + rng.next() * 0.4})`;
    g.beginPath(); g.arc(x, y, 0.8 + rng.next() * 3.2, 0, TAU); g.fill();
  }
  if (style.streaks) {
    for (let i = 0; i < w / 18; i++) {
      const x = rng.next() * w, y = rng.next() * h * 0.7, len = 30 + rng.next() * 140;
      const gr = g.createLinearGradient(x, y, x, y + len);
      gr.addColorStop(0, `rgba(${dr},${dg},${db},0)`);
      gr.addColorStop(0.3, `rgba(${dr},${dg},${db},0.35)`);
      gr.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
      g.fillStyle = gr;
      g.fillRect(x, y, 2 + rng.next() * 5, len);
    }
  }
  if (style.fuzz) {
    g.strokeStyle = `rgba(${lr},${lg},${lb},0.35)`;
    g.lineWidth = 0.8;
    for (let i = 0; i < (w * h) / 300; i++) {
      const x = rng.next() * w, y = rng.next() * h, a = rng.next() * TAU, l = 3 + rng.next() * 7;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1) * l, y + Math.sin(a + 1) * l, x + Math.cos(a) * l * 1.5, y + Math.sin(a) * l * 1.5); g.stroke();
    }
  }
  cache.set(key, c);
  return c;
}

/**
 * Macro "you are standing on the brushstrokes" relief: oriented impasto ridges with highlight
 * and shadow lips. Blended with overlay at high zoom so a 1600px reproduction still reads as
 * a tactile painted surface.
 */
export function brushstrokeTexture(size = 512, seed = 3, flowAngle = 0.35, swirl = 0): HTMLCanvasElement {
  const key = `strokes:${size}:${seed}:${flowAngle}:${swirl}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  const noise = makeNoise(seed + 11);
  const strokes = Math.round(size * 1.6);
  g.lineCap = 'round';
  for (let i = 0; i < strokes; i++) {
    const x = rng.next() * size, y = rng.next() * size;
    let a = flowAngle + (noise(x / 90, y / 90) - 0.5) * 2.2;
    if (swirl) a = Math.atan2(y - size / 2, x - size / 2) + Math.PI / 2 + (noise(x / 60, y / 60) - 0.5);
    const len = 14 + rng.next() * 34;
    const wdt = 3 + rng.next() * 6;
    const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
    for (let k = 0; k < 2; k++) {
      // wrap-around so the tile repeats seamlessly
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        if (x + ox < -len || x + ox > size + len || y + oy < -len || y + oy > size + len) continue;
        const px = x + ox, py = y + oy;
        g.lineWidth = wdt;
        g.strokeStyle = k === 0 ? 'rgba(40,40,40,0.35)' : 'rgba(225,225,225,0.4)';
        const off = k === 0 ? 1.4 : -1.1;
        g.beginPath();
        g.moveTo(px - dx / 2 + off, py - dy / 2 + off);
        g.quadraticCurveTo(px + dy * 0.12 + off, py - dx * 0.12 + off, px + dx / 2 + off, py + dy / 2 + off);
        g.stroke();
      }
    }
  }
  cache.set(key, c);
  return c;
}

/** Linen canvas weave, tiled at very high zoom. */
export function weaveTexture(size = 128): HTMLCanvasElement {
  const key = `weave:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const step = size / 16;
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    g.fillRect(i * step, 0, step * 0.6, size);
    g.fillStyle = i % 2 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    g.fillRect(0, i * step, size, step * 0.55);
  }
  cache.set(key, c);
  return c;
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
