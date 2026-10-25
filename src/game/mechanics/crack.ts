import { drawStarShape, roundRect } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { TAU, clamp, dist, pointInPolygon, segDist, type Vec } from '../../core/math';
import { Walker } from '../agents';
import type { Patch } from '../dirtgrid';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface CrackParams {
  type: 'crack';
  /** crack trees to generate */
  trees: number;
  /** segments per tree trunk */
  length: number;
  branchChance: number;
  region?: Patch;
  tolerance: number;
  crews: number;
  /** fresco plaster holes that need matching patches (stage 28) */
  holes?: number;
  /** payoff glow location (normalized) */
  payoff?: { x: number; y: number; label: string };
}

interface Edge { a: number; b: number; bins: Uint8Array; traced: boolean; queued: boolean; fill: number; claimed: boolean }
interface Hole { x: number; y: number; shape: Vec[]; rot: number; filled: boolean; flash: number }
interface Piece { shape: number; rot: number; used: boolean }

const BINS = 10;

/**
 * Crack family — trace hairline craquelure so the crew can walk your guide-rope and fill it
 * (stage 3 "Save the Smile"), plus fresco plaster-patch shape matching (stage 28).
 */
export class CrackMechanic extends Mechanic {
  private nodes: Vec[] = [];
  private edges: Edge[] = [];
  private holes: Hole[] = [];
  private pieces: Piece[] = [];
  private current = 0;
  private crews: Walker[] = [];
  private offTrack = 0;
  private cooldown = 0;
  private smears: { x: number; y: number; life: number }[] = [];
  private ptr = { x: -999, y: -999, down: false };
  private glow = 0;
  private fake = new FakePointer(this);
  private autoEdge = -1;
  private autoK = 0;
  private wrongFits = 0;

  constructor(readonly p: CrackParams) { super(); }

  init() {
    const { W, H, rng } = this.env;
    const p = this.p;
    const reg = p.region ? { x: p.region.x * W, y: p.region.y * H, r: p.region.r * W } : { x: W / 2, y: H / 2, r: Math.min(W, H) * 0.42 };
    // fresco holes first — cracks radiate from them
    const roots: Vec[] = [];
    for (let i = 0; i < (p.holes ?? 0); i++) {
      const a = (i / (p.holes ?? 1)) * TAU + rng.next() * 0.6;
      const rr = reg.r * (0.35 + rng.next() * 0.35);
      const x = reg.x + Math.cos(a) * rr, y = reg.y + Math.sin(a) * rr * 0.85;
      const n = 5 + Math.floor(rng.next() * 3);
      const shape: Vec[] = [];
      for (let k = 0; k < n; k++) {
        const aa = (k / n) * TAU + (rng.next() - 0.5) * 0.5;
        const r = 38 + rng.next() * 30;
        shape.push({ x: Math.cos(aa) * r, y: Math.sin(aa) * r });
      }
      const rot = Math.floor(rng.next() * 6);
      this.holes.push({ x, y, shape, rot, filled: false, flash: 0 });
      roots.push({ x, y });
      this.pieces.push({ shape: i, rot: (rot + 1 + Math.floor(rng.next() * 5)) % 6, used: false });
    }
    rng.shuffle(this.pieces);
    for (let t = 0; t < p.trees; t++) {
      const root = roots.length ? roots[t % roots.length] : (() => {
        const a = rng.next() * TAU, r = Math.sqrt(rng.next()) * reg.r * 0.7;
        return { x: reg.x + Math.cos(a) * r, y: reg.y + Math.sin(a) * r };
      })();
      this.growTree(root, rng.next() * TAU, p.length, 0, reg);
    }
    for (let i = 0; i < p.crews; i++) {
      const w = new Walker(60 + i * 60, H - 40, 40, 'plaster', 150);
      w.overalls = i % 2 ? '#3A6EA5' : '#2F8F8B';
      this.crews.push(w);
    }
    this.tool = 'trace';
  }

  private growTree(from: Vec, angle: number, len: number, depth: number, reg: { x: number; y: number; r: number }) {
    const { rng, W, H } = this.env;
    let prev = this.nodes.length;
    this.nodes.push({ ...from });
    let a = angle;
    let x = from.x, y = from.y;
    for (let i = 0; i < len; i++) {
      a += (rng.next() - 0.5) * 0.9;
      const step = 34 + rng.next() * 26;
      const nx = clamp(x + Math.cos(a) * step, 30, W - 30), ny = clamp(y + Math.sin(a) * step, 60, H - 60);
      if (dist(nx, ny, reg.x, reg.y) > reg.r * 1.25) { a += Math.PI * 0.6; continue; }
      const idx = this.nodes.length;
      this.nodes.push({ x: nx, y: ny });
      this.edges.push({ a: prev, b: idx, bins: new Uint8Array(BINS), traced: false, queued: false, fill: 0, claimed: false });
      if (depth < 2 && rng.next() < this.p.branchChance) this.growTree({ x: nx, y: ny }, a + (rng.chance(0.5) ? 1 : -1) * (0.7 + rng.next() * 0.6), Math.max(2, Math.floor(len * 0.5)), depth + 1, reg);
      prev = idx; x = nx; y = ny;
    }
  }

  tools(): ToolDef[] {
    const t: ToolDef[] = [{ id: 'trace', label: 'Guide rope', icon: 'route', active: this.tool === 'trace' }];
    if (this.holes.length) {
      const left = this.pieces.filter((q) => !q.used).length;
      t.push({ id: 'patch', label: 'Plaster patch', icon: 'patch', active: this.tool === 'patch', badge: String(left), disabled: left === 0 });
      t.push({ id: 'rotate', label: 'Rotate', icon: 'rotate', disabled: this.tool !== 'patch' });
      t.push({ id: 'next', label: 'Next piece', icon: 'next', disabled: this.tool !== 'patch' || left < 2 });
    }
    return t;
  }

  selectTool(id: string) {
    if (id === 'rotate') { const pc = this.currentPiece(); if (pc) { pc.rot = (pc.rot + 1) % 6; this.env.audio.play('rotate'); } this.env.refreshTools(); return; }
    if (id === 'next') { this.cyclePiece(); this.env.refreshTools(); return; }
    super.selectTool(id);
  }

  private currentPiece(): Piece | null {
    const avail = this.pieces.filter((q) => !q.used);
    if (!avail.length) return null;
    return avail[this.current % avail.length];
  }
  private cyclePiece() { this.current++; this.env.audio.play('click'); }

  progressLabel() { return this.holes.length ? 'Fresco mended' : 'Cracks filled'; }

  metrics() {
    const filled = this.edges.filter((e) => e.fill >= 1).length;
    const traced = this.edges.filter((e) => e.traced).length;
    const holesFilled = this.holes.filter((h) => h.filled).length;
    const total = this.edges.length + this.holes.length * 3;
    const progress = (filled + traced * 0.5 + holesFilled * 3) / (total + this.edges.length * 0.5);
    return {
      progress, filledPct: this.edges.length ? filled / this.edges.length : 1, tracedPct: this.edges.length ? traced / this.edges.length : 1,
      holes: holesFilled, holesTotal: this.holes.length, wrongFits: this.wrongFits,
    };
  }

  ready() { return this.edges.every((e) => e.fill >= 1) && this.holes.every((h) => h.filled); }

  hintPoint() {
    const h = this.holes.find((q) => !q.filled);
    if (h && this.tool === 'patch') return h;
    const e = this.edges.find((q) => !q.traced);
    if (e) { const a = this.nodes[e.a], b = this.nodes[e.b]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    return null;
  }

  // ------------------------------------------------------------------ input
  onDown(p: PointerState) {
    this.ptr = { x: p.x, y: p.y, down: true };
    this.offTrack = 0;
    if (this.tool === 'patch') this.tryPlace(p.x, p.y);
  }
  onHover(p: PointerState) { this.ptr.x = p.x; this.ptr.y = p.y; }
  onUp() { this.ptr.down = false; }

  onMove(p: PointerState) {
    this.ptr.x = p.x; this.ptr.y = p.y;
    if (this.tool !== 'trace') return;
    const tol = this.p.tolerance;
    const steps = Math.max(1, Math.ceil(dist(p.px, p.py, p.x, p.y) / 8));
    let onAny = false;
    for (let s = 1; s <= steps; s++) {
      const x = p.px + ((p.x - p.px) * s) / steps, y = p.py + ((p.y - p.py) * s) / steps;
      for (let i = 0; i < this.edges.length; i++) {
        const e = this.edges[i];
        const A = this.nodes[e.a], B = this.nodes[e.b];
        const sd = segDist(x, y, A.x, A.y, B.x, B.y);
        if (sd.d < tol) {
          onAny = true;
          const bin = Math.min(BINS - 1, Math.floor(sd.t * BINS));
          if (!e.bins[bin]) {
            e.bins[bin] = 1;
            if (Math.random() < 0.3) this.env.fx.emit('sparkle', x, y, 1, { color: '#FFE9A8', size: 5, speed: 30 });
          }
          if (!e.traced && e.bins.reduce((a, b) => a + b, 0) >= BINS - 1) {
            e.traced = true;
            e.queued = true;
            this.env.audio.play('tap', { pitch: 1 + (i % 5) * 0.12 });
          }
        }
      }
    }
    if (onAny) this.offTrack = Math.max(0, this.offTrack - 30);
    else {
      const near = this.edges.some((e) => segDist(p.x, p.y, this.nodes[e.a].x, this.nodes[e.a].y, this.nodes[e.b].x, this.nodes[e.b].y).d < tol * 2.4);
      if (!near) this.offTrack += dist(p.px, p.py, p.x, p.y);
      if (this.offTrack > 260 && this.cooldown <= 0) {
        this.env.mistake(p.x, p.y, 'Filler smeared!');
        this.smears.push({ x: p.x, y: p.y, life: 6 });
        this.offTrack = 0;
        this.cooldown = 1.2;
      }
    }
  }

  private tryPlace(x: number, y: number) {
    const pc = this.currentPiece();
    if (!pc) return;
    const hole = this.holes.find((h) => !h.filled && pointInPolygon(x - h.x, y - h.y, h.shape.map((q) => rotate(q, h.rot))));
    if (!hole) return;
    const target = this.holes.indexOf(hole);
    if (pc.shape === target && pc.rot === hole.rot) {
      hole.filled = true;
      hole.flash = 1;
      pc.used = true;
      this.env.audio.play('thud');
      this.env.audio.play('chime', { pitch: 0.9 });
      this.env.fx.emit('dust', hole.x, hole.y, 14, { color: '#EDE6D6', size: 12, speed: 120 });
      this.env.reward(hole.x, hole.y - 60, 120, 'Perfect fit!');
      this.env.shake(0.2);
      if (this.pieces.every((q) => q.used)) this.tool = 'trace';
      this.env.refreshTools();
    } else {
      this.wrongFits++;
      this.env.mistake(hole.x, hole.y, pc.shape === target ? 'Rotate it!' : 'Wrong shape!');
    }
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    this.cooldown -= dt;
    for (const s of this.smears) s.life -= dt;
    this.smears = this.smears.filter((s) => s.life > 0);
    for (const h of this.holes) h.flash = Math.max(0, h.flash - dt);
    for (const w of this.crews) {
      w.update(dt);
      if (w.busy) continue;
      // claim the nearest traced edge and walk there
      let best = -1, bd = Infinity;
      this.edges.forEach((e, i) => {
        if (!e.queued || e.claimed || e.fill >= 1) return;
        const A = this.nodes[e.a];
        const d = dist(w.x, w.y, A.x, A.y);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) {
        const e = this.edges[best];
        e.claimed = true;
        const A = this.nodes[e.a], B = this.nodes[e.b];
        w.goTo(A.x, A.y + 10, () => {
          w.state = 'work';
          w.data.edge = best;
          w.follow([{ x: B.x, y: B.y + 10 }], () => { e.fill = 1; e.queued = false; w.state = 'idle'; this.env.fx.emit('sparkle', B.x, B.y, 3, { color: '#FFE9A8', size: 7 }); this.env.audio.play('tap', { pitch: 1.6, vol: 0.4 }); });
          w.state = 'work';
          w.speed = 90;
        });
        w.speed = 170;
      } else if (this.edges.every((e) => e.fill >= 1) && w.state !== 'cheer') w.state = 'cheer';
    }
    // filler progress follows the walker along its edge
    for (const w of this.crews) {
      if (w.data.edge === undefined || !w.path.length) continue;
      const e = this.edges[w.data.edge];
      if (e.fill >= 1) continue;
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const L = dist(A.x, A.y, B.x, B.y) || 1;
      e.fill = clamp(dist(A.x, A.y + 10, w.x, w.y) / L, e.fill, 0.99);
    }
    if (this.ready()) this.glow = Math.min(1, this.glow + dt);
  }

  onComplete() {
    for (const e of this.edges) {
      const A = this.nodes[e.a];
      if (Math.random() < 0.5) this.env.fx.emit('sparkle', A.x, A.y, 2, { color: '#FFE9A8', size: 9, speed: 60 });
    }
    if (this.p.payoff) {
      const { W, H } = this.env;
      this.env.fx.emit('star', this.p.payoff.x * W, this.p.payoff.y * H, 20, { color: '#FFE9A8', size: 12, speed: 220 });
      this.env.fx.floatText(this.p.payoff.x * W, this.p.payoff.y * H - 80, this.p.payoff.label, '#FFE9A8');
    }
  }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    // plaster holes (bare intonaco)
    for (const h of this.holes) {
      const shape = h.shape.map((q) => rotate(q, h.rot));
      g.save();
      g.translate(h.x, h.y);
      g.beginPath(); shape.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath();
      if (h.filled) {
        g.save(); g.clip();
        g.translate(-h.x, -h.y);
        this.env.drawPainting(g, 'clean', { x: h.x - 80, y: h.y - 80, w: 160, h: 160 });
        g.restore();
        if (h.flash > 0) { g.fillStyle = `rgba(255,240,200,${h.flash * 0.6})`; g.fill(); }
      } else {
        g.fillStyle = '#D9D0BC'; g.fill();
        g.strokeStyle = '#8A806C'; g.lineWidth = 4; g.setLineDash([10, 6]); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(138,128,108,0.5)';
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(Math.sin(i * 7.1) * 20, Math.cos(i * 3.3) * 18, 3, 0, TAU); g.fill(); }
      }
      g.restore();
    }
    // cracks
    g.lineCap = 'round';
    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      g.strokeStyle = 'rgba(25,14,6,0.85)'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
      g.strokeStyle = 'rgba(230,210,170,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(A.x + 3, A.y + 3); g.lineTo(B.x + 3, B.y + 3); g.stroke();
      if (e.fill > 0) {
        const fx = A.x + (B.x - A.x) * e.fill, fy = A.y + (B.y - A.y) * e.fill;
        g.strokeStyle = e.fill >= 1 ? `rgba(232,196,106,${0.85 - this.glow * 0.6})` : '#E8C46A';
        g.lineWidth = 9;
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(fx, fy); g.stroke();
      }
    }
    for (const s of this.smears) {
      g.fillStyle = `rgba(235,225,205,${Math.min(0.7, s.life / 3)})`;
      g.beginPath(); g.ellipse(s.x, s.y, 40, 22, 0.4, 0, TAU); g.fill();
    }
    void t;
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    // guide-rope overlay on traced-but-unfilled cracks
    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      if (e.traced && e.fill < 1) {
        g.strokeStyle = '#F6EFE3'; g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = -t * 40;
        g.beginPath(); g.moveTo(A.x, A.y - 6); g.lineTo(B.x, B.y - 6); g.stroke(); g.setLineDash([]);
      } else if (!e.traced) {
        // partially traced bins glow
        for (let k = 0; k < BINS; k++) {
          if (!e.bins[k]) continue;
          const u = (k + 0.5) / BINS;
          g.fillStyle = 'rgba(255,233,168,0.8)';
          g.beginPath(); g.arc(A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u, 5, 0, TAU); g.fill();
        }
      }
    }
    for (const w of this.crews) w.draw(g, t);
    if (this.tool === 'patch' && !this.snapshotting) this.drawPieceTray(g, t);
    if (this.glow > 0 && this.p.payoff) {
      const { W, H } = this.env;
      const x = this.p.payoff.x * W, y = this.p.payoff.y * H;
      const gr = g.createRadialGradient(x, y, 0, x, y, 200);
      gr.addColorStop(0, `rgba(255,236,180,${0.45 * this.glow})`);
      gr.addColorStop(1, 'rgba(255,236,180,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 200, 0, TAU); g.fill();
      drawStarShape(g, x + 60, y - 50, 18 * this.glow, '#FFF6DA', 4);
    }
  }

  private drawPieceTray(g: CanvasRenderingContext2D, t: number) {
    const pc = this.currentPiece();
    if (!pc) return;
    const shape = this.holes[pc.shape].shape.map((q) => rotate(q, pc.rot));
    const { W } = this.env;
    const x = W - 110, y = 120;
    g.save();
    g.fillStyle = 'rgba(246,239,227,0.92)';
    roundRect(g, x - 90, y - 90, 180, 200, 24); g.fill();
    g.strokeStyle = 'rgba(201,160,78,0.8)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#5A3A28'; g.font = '900 20px "Nunito Variable", system-ui'; g.textAlign = 'center';
    g.fillText('PATCH', x, y + 90);
    g.translate(x, y + Math.sin(t * 3) * 3);
    g.beginPath(); shape.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath();
    g.fillStyle = '#EDE6D6'; g.fill();
    g.strokeStyle = '#B9AE98'; g.lineWidth = 4; g.stroke();
    g.restore();
    // ghost preview under the pointer
    if (this.ptr.x > -500) {
      g.save();
      g.globalAlpha = 0.55;
      g.translate(this.ptr.x, this.ptr.y);
      g.beginPath(); shape.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath();
      g.fillStyle = '#EDE6D6'; g.fill();
      g.restore();
    }
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay(dt: number) {
    const f = this.fake;
    if (this.holes.some((h) => !h.filled)) {
      if (this.tool !== 'patch') { this.selectTool('patch'); return; }
      const pc = this.currentPiece();
      if (!pc) return;
      const hole = this.holes[pc.shape];
      if (pc.rot !== hole.rot) { this.selectTool('rotate'); return; }
      f.tap(hole.x, hole.y);
      return;
    }
    if (this.tool !== 'trace') { this.selectTool('trace'); return; }
    if (this.autoEdge < 0 || this.edges[this.autoEdge].traced) {
      if (f.s.down) f.up();
      this.autoEdge = this.edges.findIndex((e) => !e.traced);
      this.autoK = 0;
      if (this.autoEdge < 0) return;
      const A = this.nodes[this.edges[this.autoEdge].a];
      f.down(A.x, A.y);
    }
    const e = this.edges[this.autoEdge];
    const A = this.nodes[e.a], B = this.nodes[e.b];
    this.autoK = Math.min(1.05, this.autoK + dt * 3);
    const k = Math.min(1, this.autoK);
    f.move(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k, dt);
    if (this.autoK >= 1.05) { f.up(); this.autoEdge = -1; }
  }
}

function rotate(p: Vec, r: number): Vec {
  const a = (r * Math.PI) / 3;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}
