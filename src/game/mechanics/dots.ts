import { drawPigment, drawWorker, roundRect } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { RNG, TAU, dist, hexToRgb, rgbToHex, type Vec } from '../../core/math';
import { Walker } from '../agents';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface DotsParams {
  type: 'dots';
  mode: 'match' | 'blend' | 'district';
  palette: { name: string; color: string }[];
  /** match: number of holes; blend: number of clusters; district: number of districts */
  count: number;
  /** blend/district: dots per cluster/district */
  per?: number;
  /** RGB distance accepted as "reads the same from afar" */
  tolerance?: number;
  /** district mode: spare dots beyond the exact solution */
  spare?: number;
  workers?: number;
}

interface Hole { x: number; y: number; target: number; placed: number; pending: number; group: number; flash: number }
interface Group { holes: number[]; target: string; solution: number[]; locked: boolean; wrong: number; cx: number; cy: number }

/** Average colour of dots (optical mixing approximated in sRGB). Exported for tests. */
export function mixDots(colors: string[]): string {
  let r = 0, g = 0, b = 0;
  for (const c of colors) { const [rr, gg, bb] = hexToRgb(c); r += rr; g += gg; b += bb; }
  const n = Math.max(1, colors.length);
  return rgbToHex(r / n, g / n, b / n);
}
export function colorDist(a: string, b: string) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * Dots family (Seurat) — place exact pigment dots (19), place neighbouring primaries whose
 * optical blend matches a target seen from afar (20), and restore whole districts with a
 * limited dot inventory delivered by the crew (21).
 */
export class DotsMechanic extends Mechanic {
  private holes: Hole[] = [];
  private groups: Group[] = [];
  private inventory: number[] = [];
  private workers: Walker[] = [];
  private queue: { hole: number; color: number }[] = [];
  private repaints = 0;
  private wrongPlaced = 0;
  private fake = new FakePointer(this);
  private autoCd = 0;
  private depot: Vec = { x: 0, y: 0 };
  private dotR = 26;

  constructor(readonly p: DotsParams) { super(); }

  init() {
    const { W, H } = this.env;
    const rng = new RNG(this.env.stage.seed * 7);
    const pal = this.p.palette;
    this.depot = { x: W / 2, y: H - 60 };
    const spots = this.layoutSpots(rng);
    if (this.p.mode === 'match') {
      for (let i = 0; i < this.p.count; i++) {
        const s = spots[i];
        this.holes.push({ x: s.x, y: s.y, target: Math.floor(rng.next() * pal.length), placed: -1, pending: -1, group: -1, flash: 0 });
      }
    } else {
      const per = this.p.per ?? 2;
      for (let gi = 0; gi < this.p.count; gi++) {
        const center = spots[gi];
        const sol: number[] = [];
        // choose a combination whose mix differs from any single pure pigment
        for (let k = 0; k < per; k++) sol.push(Math.floor(rng.next() * pal.length));
        if (sol.every((c) => c === sol[0])) sol[per - 1] = (sol[0] + 1 + Math.floor(rng.next() * (pal.length - 1))) % pal.length;
        const target = mixDots(sol.map((c) => pal[c].color));
        const holes: number[] = [];
        const rad = per === 2 ? this.dotR * 1.25 : this.dotR * 1.9;
        for (let k = 0; k < per; k++) {
          const a = (k / per) * TAU + rng.next() * 0.4;
          this.holes.push({ x: center.x + Math.cos(a) * rad, y: center.y + Math.sin(a) * rad, target: -1, placed: -1, pending: -1, group: gi, flash: 0 });
          holes.push(this.holes.length - 1);
        }
        this.groups.push({ holes, target, solution: sol, locked: false, wrong: 0, cx: center.x, cy: center.y });
      }
    }
    if (this.p.mode === 'district') {
      this.inventory = pal.map(() => 0);
      for (const g of this.groups) for (const c of g.solution) this.inventory[c]++;
      for (let s = 0; s < (this.p.spare ?? 2); s++) this.inventory[Math.floor(rng.next() * pal.length)]++;
      for (let i = 0; i < (this.p.workers ?? 3); i++) {
        const w = new Walker(this.depot.x + (i - 1) * 50, this.depot.y, 34, 'bucket', 260);
        this.workers.push(w);
      }
    }
    this.tool = `c0`;
  }

  /** poisson-ish scatter of hole/cluster centres avoiding HUD margins */
  private layoutSpots(rng: RNG): Vec[] {
    const { W, H } = this.env;
    const n = this.p.count;
    const minD = this.p.mode === 'match' ? 120 : this.p.mode === 'blend' ? 190 : 230;
    const out: Vec[] = [];
    for (let k = 0; k < 4000 && out.length < n; k++) {
      const x = 110 + rng.next() * (W - 220), y = 150 + rng.next() * (H - 340);
      if (out.every((q) => dist(q.x, q.y, x, y) > minD * (1 - k / 8000))) out.push({ x, y });
    }
    while (out.length < n) out.push({ x: 110 + rng.next() * (W - 220), y: 150 + rng.next() * (H - 340) });
    return out;
  }

  private sel() { return parseInt(this.tool.slice(1), 10) || 0; }

  tools(): ToolDef[] {
    return this.p.palette.map((c, i) => ({
      id: `c${i}`, label: c.name, icon: 'pigment', color: c.color, active: this.tool === `c${i}`,
      badge: this.p.mode === 'district' ? String(this.inventory[i]) : undefined,
      disabled: this.p.mode === 'district' && this.inventory[i] <= 0 && this.tool !== `c${i}`,
    }));
  }

  progressLabel() { return this.p.mode === 'match' ? 'Dots restored' : this.p.mode === 'blend' ? 'Clusters blended' : 'Districts restored'; }

  metrics(): Record<string, number> {
    if (this.p.mode === 'match') {
      const ok = this.holes.filter((h) => h.placed === h.target).length;
      return { progress: ok / this.holes.length, placed: ok, holes: this.holes.length, wrong: this.wrongPlaced, repaints: this.repaints };
    }
    const locked = this.groups.filter((g) => g.locked).length;
    return { progress: locked / this.groups.length, locked, groups: this.groups.length, wrong: this.wrongPlaced, repaints: this.repaints, spare: this.inventory.reduce((a, b) => a + b, 0) };
  }

  ready() { return this.workers.every((w) => !w.busy) && this.queue.length === 0; }

  hintPoint() {
    if (this.p.mode === 'match') { const h = this.holes.find((q) => q.placed !== q.target); return h ?? null; }
    const g = this.groups.find((q) => !q.locked);
    return g ? { x: g.cx, y: g.cy } : null;
  }

  // ------------------------------------------------------------------ input
  onUp(p: PointerState, tap: boolean) {
    if (!tap) return;
    let hi = -1, bd = this.dotR * 1.6;
    this.holes.forEach((h, i) => { const d = dist(h.x, h.y, p.x, p.y); if (d < bd) { bd = d; hi = i; } });
    if (hi < 0) return;
    const h = this.holes[hi];
    const c = this.sel();
    if (h.group >= 0 && this.groups[h.group].locked) { this.env.toast('Already perfect from afar ✨', 'good'); return; }
    if (h.pending >= 0) return;
    if (this.p.mode === 'match') {
      if (h.placed === h.target) return;
      if (c === h.target) {
        h.placed = c;
        this.env.audio.play('pop', { pitch: 0.9 + (c % 4) * 0.1 });
        this.env.fx.emit('splat', h.x, h.y, 8, { color: this.p.palette[c].color, size: 6, speed: 120 });
        this.env.reward(h.x, h.y - 40, 30);
      } else {
        this.wrongPlaced++;
        h.flash = 1;
        this.env.mistake(h.x, h.y, 'Not quite that shade!');
      }
      return;
    }
    if (this.p.mode === 'district') {
      if (h.placed >= 0) {
        // take the dot back into the inventory
        this.inventory[h.placed]++;
        h.placed = -1;
        this.repaints++;
        this.env.audio.play('suck', { pitch: 1.4, vol: 0.5 });
        this.env.refreshTools();
        return;
      }
      if (this.inventory[c] <= 0) { this.env.toast(`Out of ${this.p.palette[c].name}`, 'warn'); return; }
      this.inventory[c]--;
      h.pending = c;
      this.queue.push({ hole: hi, color: c });
      this.env.audio.play('tap');
      this.env.refreshTools();
      return;
    }
    // blend mode: place / replace
    if (h.placed >= 0) this.repaints++;
    h.placed = c;
    this.env.audio.play('pop', { pitch: 0.9 + (c % 4) * 0.1 });
    this.env.fx.emit('splat', h.x, h.y, 6, { color: this.p.palette[c].color, size: 5, speed: 90 });
    this.judgeGroup(h.group);
  }

  private judgeGroup(gi: number) {
    const g = this.groups[gi];
    if (g.locked || g.holes.some((i) => this.holes[i].placed < 0)) return;
    const mix = mixDots(g.holes.map((i) => this.p.palette[this.holes[i].placed].color));
    const tol = this.p.tolerance ?? 34;
    if (colorDist(mix, g.target) <= tol) {
      g.locked = true;
      this.env.audio.play('chime', { pitch: 0.9 + gi * 0.04 });
      this.env.fx.emit('sparkle', g.cx, g.cy, 14, { color: g.target, size: 9, speed: 150 });
      this.env.reward(g.cx, g.cy - 70, 100, 'Blends perfectly!');
    } else {
      g.wrong = 1;
      this.wrongPlaced++;
      this.env.mistake(g.cx, g.cy, 'Reads wrong from afar');
    }
  }

  update(dt: number) {
    this.autoCd -= dt;
    for (const h of this.holes) h.flash = Math.max(0, h.flash - dt * 2);
    for (const g of this.groups) g.wrong = Math.max(0, g.wrong - dt);
    // crew deliver queued dots in district mode
    for (const w of this.workers) {
      w.update(dt);
      if (!w.busy && this.queue.length) {
        const job = this.queue.shift()!;
        const h = this.holes[job.hole];
        w.carry = this.p.palette[job.color].color;
        w.goTo(h.x, h.y + 30, () => {
          w.work(0.35, () => {
            h.placed = job.color;
            h.pending = -1;
            w.carry = undefined;
            this.env.audio.play('pop', { pitch: 1.1 });
            this.env.fx.emit('splat', h.x, h.y, 6, { color: this.p.palette[job.color].color, size: 5, speed: 90 });
            this.judgeGroup(h.group);
            w.goTo(this.depot.x + (Math.random() - 0.5) * 120, this.depot.y);
          });
        });
      }
    }
  }

  onComplete() {
    for (const h of this.holes) if (Math.random() < 0.4) this.env.fx.emit('sparkle', h.x, h.y, 2, { color: '#FFF3C4', size: 8, speed: 60 });
  }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    const r = this.dotR;
    // cluster halos show what the spot must look like from afar
    for (const gr of this.groups) {
      const rad = (this.p.per ?? 2) === 2 ? r * 3 : r * 3.9;
      g.fillStyle = gr.target; g.globalAlpha = gr.locked ? 0.55 : 0.32;
      g.beginPath(); g.arc(gr.cx, gr.cy, rad, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = gr.wrong > 0 ? '#E86F5A' : gr.locked ? '#F6EFE3' : gr.target; g.lineWidth = gr.locked ? 5 : 4;
      g.setLineDash(gr.locked ? [] : [12, 8]); g.lineDashOffset = -t * 15;
      g.beginPath(); g.arc(gr.cx, gr.cy, rad + 6, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    for (const h of this.holes) {
      if (h.placed >= 0) {
        drawPigment(g, h.x, h.y, r, this.p.palette[h.placed].color);
        continue;
      }
      g.fillStyle = '#EDE3CC';
      g.beginPath(); g.arc(h.x, h.y, r, 0, TAU); g.fill();
      g.strokeStyle = h.flash > 0 ? '#E86F5A' : 'rgba(90,60,30,0.6)'; g.lineWidth = 3; g.stroke();
      if (this.p.mode === 'match') {
        // target shade shown as a ring + inner hint
        g.strokeStyle = this.p.palette[h.target].color; g.lineWidth = 7;
        g.beginPath(); g.arc(h.x, h.y, r + 6, 0, TAU); g.stroke();
      }
      if (h.pending >= 0) {
        g.strokeStyle = this.p.palette[h.pending].color; g.lineWidth = 4; g.setLineDash([6, 6]);
        g.beginPath(); g.arc(h.x, h.y, r * 0.6, t * 3, t * 3 + 5); g.stroke(); g.setLineDash([]);
      }
    }
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    if (this.p.mode === 'district') {
      g.fillStyle = 'rgba(246,239,227,0.9)'; roundRect(g, this.depot.x - 120, this.depot.y - 10, 240, 50, 20); g.fill();
      g.fillStyle = '#5A3A28'; g.font = '900 20px "Nunito Variable", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('PIGMENT DEPOT', this.depot.x, this.depot.y + 15);
      for (const w of this.workers) w.draw(g, t);
    } else {
      drawWorker(g, 60, this.env.H - 30, 38, { t, seed: 7, state: 'idle', tool: 'brush', badge: this.p.palette[this.sel()].color });
    }
    // selected colour cursor hint on hover handled by HUD; draw the mixed preview for blend groups
    for (const gr of this.groups) {
      const placed = gr.holes.map((i) => this.holes[i].placed).filter((c) => c >= 0);
      if (!placed.length || gr.locked) continue;
      const mix = mixDots(placed.map((c) => this.p.palette[c].color));
      g.fillStyle = mix; g.beginPath(); g.arc(gr.cx, gr.cy, 10, 0, TAU); g.fill();
      g.strokeStyle = '#F6EFE3'; g.lineWidth = 2; g.stroke();
    }
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay() {
    if (this.autoCd > 0) return;
    this.autoCd = 0.1;
    if (this.p.mode === 'match') {
      const h = this.holes.find((q) => q.placed !== q.target);
      if (!h) return;
      if (this.sel() !== h.target) { this.selectTool(`c${h.target}`); return; }
      this.fake.tap(h.x, h.y);
      return;
    }
    for (const gr of this.groups) {
      if (gr.locked) continue;
      for (let k = 0; k < gr.holes.length; k++) {
        const h = this.holes[gr.holes[k]];
        const want = gr.solution[k];
        if (h.pending >= 0) continue;
        if (h.placed === want) continue;
        if (this.p.mode === 'district' && h.placed >= 0) { this.fake.tap(h.x, h.y); return; }
        if (this.sel() !== want) { this.selectTool(`c${want}`); return; }
        this.fake.tap(h.x, h.y);
        return;
      }
    }
  }
}
