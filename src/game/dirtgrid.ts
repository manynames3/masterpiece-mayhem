import { canvas, grimeTexture, type GrimeStyle } from '../art/textures';
import { makeNoise, type RNG } from '../core/math';

export interface Patch { x: number; y: number; r: number; s?: number }

/**
 * Authoritative dirt state on a coarse grid. Rendering upsamples the grid as a soft alpha mask
 * over a painterly grime texture, so what you see is exactly what the progress counter measures.
 */
export class DirtGrid {
  readonly gw: number;
  readonly gh: number;
  readonly cw: number;
  readonly ch: number;
  dirt: Float32Array;
  wear: Float32Array;
  initialTotal = 0;
  private mask: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private img: ImageData;
  private comp: HTMLCanvasElement;
  private shadow: HTMLCanvasElement;
  private tex: HTMLCanvasElement;
  private dirtyFlag = true;
  shadowColor = 'rgba(30,18,8,0.55)';
  shadowOffset = 5;
  thickness = 1;
  /** below 0.72 the painting ghosts through the thickest grime so it stays recognizable */
  maxAlpha = 0.62;
  /** how quickly brushing clean paint wears it (per sample) */
  wearRate = 0.14;

  constructor(readonly W: number, readonly H: number, style: GrimeStyle, res = 128) {
    this.gw = res;
    this.gh = Math.max(8, Math.round((res * H) / W));
    this.cw = W / this.gw;
    this.ch = H / this.gh;
    this.dirt = new Float32Array(this.gw * this.gh);
    this.wear = new Float32Array(this.gw * this.gh);
    this.mask = canvas(this.gw, this.gh);
    this.mctx = this.mask.getContext('2d')!;
    this.img = this.mctx.createImageData(this.gw, this.gh);
    const cw = Math.round(W / 2), ch = Math.round(H / 2);
    this.comp = canvas(cw, ch);
    this.shadow = canvas(cw, ch);
    this.tex = grimeTexture(cw, ch, style);
  }

  /** Fill with organic noisy coverage, optionally restricted to patches. */
  fill(rng: RNG, opts: { coverage?: number; patches?: Patch[]; min?: number; noiseScale?: number }) {
    const noise = makeNoise(Math.floor(rng.next() * 1e6));
    const cov = opts.coverage ?? 1;
    const ns = opts.noiseScale ?? 9;
    for (let j = 0; j < this.gh; j++) {
      for (let i = 0; i < this.gw; i++) {
        const x = (i + 0.5) * this.cw, y = (j + 0.5) * this.ch;
        const n = noise(i / ns, j / ns, 3);
        let v = 0;
        if (opts.patches && opts.patches.length) {
          for (const p of opts.patches) {
            const d = Math.hypot(x - p.x, y - p.y) / p.r;
            const edge = 1 - d + (n - 0.5) * 0.7;
            v = Math.max(v, Math.min(1, edge * 3) * (p.s ?? 1));
          }
        } else {
          v = Math.min(1, (n - (1 - cov)) * 3 + 0.6);
        }
        v = Math.max(opts.min ?? 0, v);
        this.dirt[j * this.gw + i] = v > 0.05 ? Math.min(1, v) : 0;
      }
    }
    this.initialTotal = this.total();
    this.dirtyFlag = true;
  }

  total() {
    let s = 0;
    for (let i = 0; i < this.dirt.length; i++) s += this.dirt[i];
    return s;
  }

  cleanFraction() {
    return this.initialTotal > 0 ? Math.max(0, Math.min(1, 1 - this.total() / this.initialTotal)) : 1;
  }

  /** fraction of dirty cells cleared inside a circle */
  regionDirt(x: number, y: number, r: number) {
    let s = 0, n = 0;
    this.forCells(x, y, r, (idx) => { s += this.dirt[idx]; n++; });
    return n ? s / n : 0;
  }

  at(x: number, y: number) {
    const i = Math.floor(x / this.cw), j = Math.floor(y / this.ch);
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return 0;
    return this.dirt[j * this.gw + i];
  }

  forCells(x: number, y: number, r: number, fn: (idx: number, falloff: number) => void) {
    const i0 = Math.max(0, Math.floor((x - r) / this.cw)), i1 = Math.min(this.gw - 1, Math.floor((x + r) / this.cw));
    const j0 = Math.max(0, Math.floor((y - r) / this.ch)), j1 = Math.min(this.gh - 1, Math.floor((y + r) / this.ch));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const cy = (j + 0.5) * this.ch;
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * this.cw;
        const d2 = (cx - x) ** 2 + (cy - y) ** 2;
        if (d2 > r2) continue;
        fn(j * this.gw + i, 1 - d2 / r2);
      }
    }
  }

  /** Remove dirt in a soft circle. Returns {removed, overClean} where overClean is brush energy spent on clean paint. */
  brush(x: number, y: number, r: number, amount: number) {
    let removed = 0, over = 0;
    this.forCells(x, y, r, (idx, f) => {
      const a = amount * (0.35 + 0.65 * f);
      const d = this.dirt[idx];
      if (d > 0) {
        const nd = Math.max(0, d - a / this.thickness);
        removed += d - nd;
        this.dirt[idx] = nd < 0.02 ? 0 : nd;
      } else {
        over += a * f;
        this.wear[idx] += a * f * this.wearRate;
      }
    });
    if (removed > 0) this.dirtyFlag = true;
    return { removed, over };
  }

  /** Brush along a segment with spacing so fast swipes never skip. */
  stroke(x0: number, y0: number, x1: number, y1: number, r: number, amount: number, onSample?: (x: number, y: number, removed: number, over: number) => void) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (r * 0.3)));
    let removed = 0, over = 0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const res = this.brush(x, y, r, amount);
      removed += res.removed;
      over += res.over;
      onSample?.(x, y, res.removed, res.over);
    }
    return { removed, over };
  }

  add(x: number, y: number, r: number, amount: number) {
    this.forCells(x, y, r, (idx, f) => { this.dirt[idx] = Math.min(1, this.dirt[idx] + amount * f); });
    this.dirtyFlag = true;
  }

  clearAll() { this.dirt.fill(0); this.dirtyFlag = true; }

  nearestDirty(x: number, y: number, threshold = 0.1): { x: number; y: number } | null {
    let best = -1, bd = Infinity;
    for (let j = 0; j < this.gh; j += 2) {
      for (let i = 0; i < this.gw; i += 2) {
        const idx = j * this.gw + i;
        if (this.dirt[idx] < threshold) continue;
        const cx = (i + 0.5) * this.cw, cy = (j + 0.5) * this.ch;
        const d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < bd) { bd = d; best = idx; }
      }
    }
    if (best < 0) return null;
    return { x: ((best % this.gw) + 0.5) * this.cw, y: (Math.floor(best / this.gw) + 0.5) * this.ch };
  }

  /** decay wear back toward zero (paint "rests") */
  relax(dt: number, rate = 0.25) {
    for (let i = 0; i < this.wear.length; i++) if (this.wear[i] > 0) this.wear[i] = Math.max(0, this.wear[i] - rate * dt);
  }

  markDirty() { this.dirtyFlag = true; }

  private rebuild() {
    const d = this.img.data;
    for (let i = 0; i < this.dirt.length; i++) {
      const v = this.dirt[i];
      const a = v <= 0 ? 0 : 0.28 + this.maxAlpha * Math.min(1, v * 1.35);
      d[i * 4 + 3] = a * 255;
    }
    this.mctx.putImageData(this.img, 0, 0);
    const cw = this.comp.width, ch = this.comp.height;
    for (const [c, fill] of [[this.comp, null], [this.shadow, this.shadowColor]] as const) {
      const g = c.getContext('2d')!;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, cw, ch);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.mask, 0, 0, cw, ch);
      g.globalCompositeOperation = 'source-in';
      if (fill) { g.fillStyle = fill; g.fillRect(0, 0, cw, ch); } else g.drawImage(this.tex, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    this.dirtyFlag = false;
  }

  render(g: CanvasRenderingContext2D, alpha = 1) {
    if (this.dirtyFlag) this.rebuild();
    g.save();
    g.globalAlpha = alpha;
    g.drawImage(this.shadow, this.shadowOffset * 0.6, this.shadowOffset, this.W, this.H);
    g.drawImage(this.comp, 0, 0, this.W, this.H);
    g.restore();
  }
}
