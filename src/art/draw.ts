import { TAU } from '../core/math';

/**
 * Shared drawing atoms for the cast: stop-motion timing, the "felt & clay" material, toy-sticker
 * outlines and a small expressive face kit (eyes, brows, mouths) reused by heroes and critters.
 */

/** Stop-motion feel: character animation advances in 12fps steps, like a handmade clay short. */
export const stepT = (t: number, fps = 12) => Math.floor(t * fps) / fps;

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export function drawStarShape(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, points = 5) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; gg *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; gg += (255 - gg) * amt; b += (255 - b) * amt; }
  return '#' + [r, gg, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Soft contact shadow — grounds characters on the painted surface. */
export function contactShadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.32) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(25,12,5,${a})`);
  gr.addColorStop(0.6, `rgba(25,12,5,${a * 0.55})`);
  gr.addColorStop(1, 'rgba(25,12,5,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
  g.restore();
}

// ------------------------------------------------------------------ felt fibre texture
let feltTile: HTMLCanvasElement | null = null;
const feltPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();

function feltPattern(g: CanvasRenderingContext2D): CanvasPattern | null {
  if (feltPatterns.has(g)) return feltPatterns.get(g)!;
  if (!feltTile && typeof document !== 'undefined') {
    feltTile = document.createElement('canvas');
    feltTile.width = feltTile.height = 72;
    const c = feltTile.getContext('2d')!;
    let seed = 9;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = rnd() * 72, y = rnd() * 72, a = rnd() * TAU, l = 2 + rnd() * 5;
      c.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
      c.lineWidth = 0.6 + rnd() * 0.6;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 1) * l, y + Math.sin(a + 1) * l, x + Math.cos(a) * l * 1.4, y + Math.sin(a) * l * 1.4); c.stroke();
    }
  }
  const p = feltTile ? g.createPattern(feltTile, 'repeat') : null;
  feltPatterns.set(g, p);
  return p;
}

export interface ClayOpts {
  /** body bounds centre + size, used to place the key light */
  cx: number; cy: number; w: number; h: number;
  /** level of detail: 0 = flat sticker (tiny), 1 = shaded, 2 = shaded + felt + rim light */
  lod: number;
  outline?: string;
  outlineW?: number;
  felt?: number;
  /** translucent materials (stains, slime) */
  alpha?: number;
  rim?: string;
}

/**
 * The house material: a softly lit clay/felt toy. Key light top-left, warm bounce rim bottom-right,
 * fibre texture and a toy-sticker outline so silhouettes still read at 20px.
 */
export function clay(g: CanvasRenderingContext2D, p: Path2D, base: string, o: ClayOpts) {
  const { cx, cy, w, h, lod } = o;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  if (lod > 0) {
    const r = Math.max(w, h);
    const gr = g.createRadialGradient(cx - w * 0.26, cy - h * 0.3, r * 0.02, cx, cy, r * 0.82);
    gr.addColorStop(0, shade(base, 0.34));
    gr.addColorStop(0.42, base);
    gr.addColorStop(1, shade(base, -0.38));
    g.fillStyle = gr;
  } else g.fillStyle = base;
  g.fill(p);
  if (lod > 1) {
    g.save();
    g.clip(p);
    const k = Math.min(w, h) * 0.07;
    g.save();
    g.translate(-k, -k * 0.8);
    g.strokeStyle = o.rim ?? 'rgba(255,226,170,0.32)';
    g.lineWidth = k * 2;
    g.stroke(p);
    g.restore();
    const pat = feltPattern(g);
    if (pat) {
      g.globalAlpha *= o.felt ?? 0.16;
      g.fillStyle = pat;
      g.fillRect(cx - w, cy - h, w * 2, h * 2);
    }
    g.restore();
  }
  if (o.outline !== 'none') {
    g.strokeStyle = o.outline ?? rgba(shade(base, -0.62), 0.75);
    g.lineWidth = o.outlineW ?? Math.max(1, Math.min(w, h) * 0.045);
    g.lineJoin = 'round';
    g.stroke(p);
  }
  g.restore();
}

// ------------------------------------------------------------------ face kit
export type EyeStyle = 'normal' | 'happy' | 'spiral' | 'wide' | 'sleepy' | 'side' | 'star' | 'squint' | 'teary' | 'closed';
export type MouthStyle = 'smile' | 'grin' | 'o' | 'wobble' | 'frown' | 'smirk' | 'teeth' | 'flat' | 'tongue' | 'gap';

export interface EyeOpts {
  style: EyeStyle;
  lookX: number; lookY: number;
  iris: string;
  lid: string;
  t: number;
  /** 0..1 eyelid closure (blink) */
  blink?: number;
  lod: number;
  jiggle?: number;
  pupil?: number;
}

export function drawEye(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, o: EyeOpts) {
  const lw = Math.max(1, rx * 0.16);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (o.style === 'happy' || o.style === 'closed' || (o.blink ?? 0) >= 1) {
    g.strokeStyle = '#21130B'; g.lineWidth = lw * 1.4;
    g.beginPath();
    if (o.style === 'happy') g.arc(x, y + ry * 0.35, rx * 0.8, Math.PI * 1.15, Math.PI * 1.85);
    else { g.moveTo(x - rx * 0.8, y + ry * 0.1); g.quadraticCurveTo(x, y + ry * 0.55, x + rx * 0.8, y + ry * 0.1); }
    g.stroke();
    return;
  }
  if (o.style === 'squint') {
    g.strokeStyle = '#21130B'; g.lineWidth = lw * 1.4;
    g.beginPath(); g.moveTo(x - rx * 0.8, y - ry * 0.25); g.lineTo(x + rx * 0.7, y + ry * 0.05); g.lineTo(x - rx * 0.6, y + ry * 0.35); g.stroke();
    return;
  }
  // sclera
  g.fillStyle = '#FFFDF6';
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  if (o.lod > 1) {
    const sh = g.createLinearGradient(x, y - ry, x, y + ry);
    sh.addColorStop(0, 'rgba(60,40,30,0.22)'); sh.addColorStop(0.35, 'rgba(60,40,30,0)');
    g.fillStyle = sh; g.fill();
  }
  g.strokeStyle = 'rgba(33,19,11,0.85)'; g.lineWidth = lw; g.stroke();
  if (o.style === 'spiral') {
    g.strokeStyle = '#21130B'; g.lineWidth = lw * 1.1;
    g.beginPath();
    for (let i = 0; i < 26; i++) {
      const a = o.t * 9 + i * 0.5, rr = (i / 26) * Math.min(rx, ry) * 0.85;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.stroke();
    return;
  }
  const side = o.style === 'side';
  const lx = side ? 0.85 : Math.max(-1, Math.min(1, o.lookX));
  const ly = side ? 0.1 : Math.max(-1, Math.min(1, o.lookY));
  const jig = (o.jiggle ?? 0) * Math.sin(o.t * 23 + x) * rx * 0.12;
  const wide = o.style === 'wide';
  const ir = Math.min(rx, ry) * (wide ? 0.38 : o.pupil ?? 0.66);
  const ix = x + lx * (rx - ir) * 0.7 + jig, iy = y + ly * (ry - ir) * 0.6;
  if (o.lod > 0 && !wide) {
    g.fillStyle = o.iris;
    g.beginPath(); g.arc(ix, iy, ir, 0, TAU); g.fill();
    g.fillStyle = '#140A05';
    g.beginPath(); g.arc(ix, iy, ir * 0.58, 0, TAU); g.fill();
  } else {
    g.fillStyle = '#140A05';
    g.beginPath(); g.arc(ix, iy, ir, 0, TAU); g.fill();
  }
  // catch-lights: the "alive" sparkle
  g.fillStyle = '#ffffff';
  if (o.style === 'star') drawStarShape(g, ix - ir * 0.15, iy - ir * 0.2, ir * 0.62, '#ffffff', 4);
  else {
    g.beginPath(); g.arc(ix - ir * 0.36, iy - ir * 0.38, ir * 0.36, 0, TAU); g.fill();
    if (o.lod > 0) { g.beginPath(); g.arc(ix + ir * 0.34, iy + ir * 0.34, ir * 0.15, 0, TAU); g.fill(); }
  }
  // eyelids
  const lidK = o.style === 'sleepy' ? 0.55 : side ? 0.38 : (o.blink ?? 0);
  if (lidK > 0) {
    g.save();
    g.beginPath(); g.ellipse(x, y, rx * 1.06, ry * 1.06, 0, 0, TAU); g.clip();
    g.fillStyle = o.lid;
    g.fillRect(x - rx * 1.2, y - ry * 1.2, rx * 2.4, ry * 2.4 * lidK);
    g.strokeStyle = '#21130B'; g.lineWidth = lw * 1.2;
    g.beginPath(); g.moveTo(x - rx * 1.1, y - ry * 1.2 + ry * 2.4 * lidK); g.lineTo(x + rx * 1.1, y - ry * 1.2 + ry * 2.4 * lidK); g.stroke();
    g.restore();
  }
  if (o.style === 'teary') {
    g.fillStyle = 'rgba(150,210,255,0.9)';
    const k = (o.t * 1.5) % 1;
    g.beginPath(); g.ellipse(x + rx * 0.4, y + ry * (0.9 + k * 1.2), rx * 0.18, ry * 0.26, 0, 0, TAU); g.fill();
  }
}

/** Brow: tilt -1 = angry/determined (inner end low), +1 = worried/surprised (inner end high). */
export function drawBrow(g: CanvasRenderingContext2D, x: number, y: number, w: number, tilt: number, side: -1 | 1, color: string, thick: number) {
  const inner = x - side * w * 0.5, outer = x + side * w * 0.5;
  g.strokeStyle = color; g.lineWidth = thick; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(inner, y + tilt * -w * 0.35);
  g.quadraticCurveTo(x, y - w * 0.18 - Math.abs(tilt) * w * 0.05, outer, y + tilt * w * 0.12);
  g.stroke();
}

export function drawMouth(g: CanvasRenderingContext2D, x: number, y: number, w: number, style: MouthStyle, t: number, ink = '#3A160C') {
  const lw = Math.max(1, w * 0.16);
  g.strokeStyle = ink; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  switch (style) {
    case 'smile':
      g.arc(x, y - w * 0.25, w * 0.5, 0.35, Math.PI - 0.35); g.stroke();
      break;
    case 'gap':
      g.arc(x, y - w * 0.25, w * 0.5, 0.35, Math.PI - 0.35); g.stroke();
      g.fillStyle = '#FFFDF6'; g.fillRect(x - w * 0.12, y + w * 0.12, w * 0.1, w * 0.14); g.fillRect(x + w * 0.04, y + w * 0.12, w * 0.1, w * 0.14);
      break;
    case 'grin': case 'tongue': case 'teeth': {
      g.moveTo(x - w * 0.55, y - w * 0.1);
      g.quadraticCurveTo(x, y - w * 0.02, x + w * 0.55, y - w * 0.1);
      g.quadraticCurveTo(x + w * 0.4, y + w * 0.75, x, y + w * 0.75);
      g.quadraticCurveTo(x - w * 0.4, y + w * 0.75, x - w * 0.55, y - w * 0.1);
      g.closePath();
      g.fillStyle = '#5A1A12'; g.fill();
      g.save(); g.clip();
      if (style === 'teeth') {
        g.fillStyle = '#FFFDF6'; g.fillRect(x - w * 0.6, y - w * 0.2, w * 1.2, w * 0.3);
      } else {
        g.fillStyle = '#FFFDF6'; g.fillRect(x - w * 0.3, y - w * 0.2, w * 0.6, w * 0.18);
        g.fillStyle = '#E86F7A'; g.beginPath(); g.ellipse(x + (style === 'tongue' ? w * 0.25 : 0), y + w * 0.65, w * 0.32, w * 0.24, 0, 0, TAU); g.fill();
      }
      g.restore();
      g.stroke();
      if (style === 'tongue') {
        g.fillStyle = '#E86F7A';
        g.beginPath(); g.ellipse(x + w * 0.45, y + w * 0.45, w * 0.16, w * 0.22, -0.5, 0, TAU); g.fill();
      }
      break;
    }
    case 'o':
      g.fillStyle = '#5A1A12';
      g.ellipse(x, y + w * 0.15, w * 0.24, w * 0.32, 0, 0, TAU); g.fill(); g.stroke();
      break;
    case 'wobble':
      g.moveTo(x - w * 0.5, y + w * 0.15);
      for (let i = 1; i <= 6; i++) g.lineTo(x - w * 0.5 + (i / 6) * w, y + w * 0.15 + (i % 2 ? -1 : 1) * w * 0.12 * (1 + Math.sin(t * 30) * 0.3));
      g.stroke();
      break;
    case 'frown':
      g.arc(x, y + w * 0.55, w * 0.42, Math.PI + 0.55, -0.55); g.stroke();
      break;
    case 'smirk':
      g.moveTo(x - w * 0.4, y + w * 0.1); g.quadraticCurveTo(x + w * 0.1, y + w * 0.32, x + w * 0.5, y - w * 0.12); g.stroke();
      break;
    case 'flat':
      g.moveTo(x - w * 0.35, y + w * 0.15); g.lineTo(x + w * 0.35, y + w * 0.15); g.stroke();
      break;
  }
}

export function drawBlush(g: CanvasRenderingContext2D, x: number, y: number, rx: number, color = 'rgba(240,110,100,0.38)') {
  g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y, rx, rx * 0.6, 0, 0, TAU); g.fill();
}

export function drawSweat(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  const k = (t * 2) % 1;
  g.fillStyle = 'rgba(170,220,255,0.92)';
  g.beginPath();
  const yy = y + k * r * 1.4;
  g.moveTo(x, yy - r);
  g.quadraticCurveTo(x + r * 0.75, yy, x, yy + r * 0.55);
  g.quadraticCurveTo(x - r * 0.75, yy, x, yy - r);
  g.fill();
}

export function drawSparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color = '#FFF4C2') {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

export function drawBubble(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = 'rgba(220,240,255,0.25)';
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(0.8, r * 0.14);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, TAU); g.fill();
}

export function drawHeart(g: CanvasRenderingContext2D, x: number, y: number, r: number, color = '#E8566A') {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y + r * 0.8);
  g.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.35);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.3, y - r * 0.1, x, y + r * 0.8);
  g.fill();
}

/** Level of detail from the unit size as it actually lands on screen (accounts for camera zoom). */
export function lodFor(g: CanvasRenderingContext2D, size: number) {
  const m = g.getTransform();
  const px = size * Math.hypot(m.a, m.b);
  return px < 10 ? 0 : px < 20 ? 1 : 2;
}

/** Rounded-rect Path2D without relying on Path2D.roundRect (missing on older Safari). */
export function rrect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  const rr = Math.min(r, w / 2, h / 2);
  p.moveTo(x + rr, y);
  p.arcTo(x + w, y, x + w, y + h, rr);
  p.arcTo(x + w, y + h, x, y + h, rr);
  p.arcTo(x, y + h, x, y, rr);
  p.arcTo(x, y, x + w, y, rr);
  p.closePath();
  return p;
}
