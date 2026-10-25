import { drawWorker } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { TAU, dist, segDist, type Vec } from '../../core/math';
import { makeBeam, makeNode, maxSag, resetTruss, stepTruss, TRUSS, type TBeam, type TNode } from '../truss';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface BridgeParams {
  type: 'bridge';
  /** normalized x of the two fingertips and the deck height */
  leftX: number;
  rightX: number;
  deckY: number;
  cols: number;
  rowsAbove: number;
  rowsBelow: number;
  budget: number;
  /** beam length limit in grid spacings */
  maxLen: number;
}

const PHYS = 60; // physics units per grid spacing

/**
 * Bridge family (stage 29 "Bridge the Gap"): build a scaffold truss between Adam's and God's
 * fingertips, then send a courier across. A Verlet solver decides — unbraced decks sag or snap.
 */
export class BridgeMechanic extends Mechanic {
  private gnodes: { c: number; r: number; fixed: boolean }[] = [];
  private beams: { a: number; b: number }[] = [];
  private s = 100;
  private ox = 0;
  private oy = 0;
  private deckRow = 0;
  private drag: { from: number; x: number; y: number } | null = null;
  private testing: { nodes: TNode[]; beams: TBeam[]; x: number; settle: number; result: string | null; timer: number; wy: number } | null = null;
  private collapses = 0;
  private crossed = false;
  private arrive = 0;
  private fake = new FakePointer(this);
  private autoCd = 0;

  constructor(readonly p: BridgeParams) { super(); }

  init() {
    const { W, H } = this.env;
    const p = this.p;
    const lx = p.leftX * W, rx = p.rightX * W;
    this.s = (rx - lx) / (p.cols - 1);
    this.ox = lx;
    this.deckRow = p.rowsAbove;
    this.oy = p.deckY * H - this.deckRow * this.s;
    const rows = p.rowsAbove + 1 + p.rowsBelow;
    for (let r = 0; r < rows; r++) for (let c = 0; c < p.cols; c++) {
      const anchorCol = c === 0 || c === p.cols - 1;
      const fixed = anchorCol && r >= this.deckRow && r <= this.deckRow + 1;
      this.gnodes.push({ c, r, fixed });
    }
    this.tool = 'build';
  }

  private pos(i: number): Vec { const n = this.gnodes[i]; return { x: this.ox + n.c * this.s, y: this.oy + n.r * this.s }; }
  private nodeAt(x: number, y: number, r = 0.42) {
    let best = -1, bd = this.s * r;
    this.gnodes.forEach((_, i) => { const q = this.pos(i); const d = dist(q.x, q.y, x, y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  private isDeck(a: number, b: number) { return this.gnodes[a].r === this.deckRow && this.gnodes[b].r === this.deckRow; }
  private hasBeam(a: number, b: number) { return this.beams.some((q) => (q.a === a && q.b === b) || (q.a === b && q.b === a)); }

  tools(): ToolDef[] {
    const left = this.p.budget - this.beams.length;
    return [
      { id: 'build', label: 'Beam', icon: 'beam', active: this.tool === 'build', badge: String(left) },
      { id: 'erase', label: 'Remove', icon: 'undo', active: this.tool === 'erase' },
      { id: 'test', label: 'Send courier', icon: 'test', disabled: !!this.testing || this.crossed },
    ];
  }

  selectTool(id: string) {
    if (id === 'test') { this.startTest(); return; }
    super.selectTool(id);
  }

  progressLabel() { return 'Bridge built'; }

  metrics() {
    const deckCols = new Set<number>();
    for (const b of this.beams) if (this.isDeck(b.a, b.b)) deckCols.add(Math.min(this.gnodes[b.a].c, this.gnodes[b.b].c));
    const deckK = deckCols.size / (this.p.cols - 1);
    return {
      progress: this.crossed ? 1 : Math.min(0.9, deckK * 0.6 + Math.min(1, this.beams.length / 20) * 0.3),
      crossed: this.crossed ? 1 : 0, beams: this.beams.length, collapses: this.collapses, budget: this.p.budget,
    };
  }

  ready() { return this.crossed && this.arrive > 1.2; }

  hintPoint() {
    for (let c = 0; c < this.p.cols - 1; c++) {
      const a = this.deckRow * this.p.cols + c;
      if (!this.hasBeam(a, a + 1)) return this.pos(a);
    }
    return null;
  }

  // ------------------------------------------------------------------ input
  onDown(p: PointerState) {
    if (this.testing) return;
    if (this.tool === 'erase') { this.eraseAt(p.x, p.y); return; }
    const n = this.nodeAt(p.x, p.y);
    if (n >= 0) this.drag = { from: n, x: p.x, y: p.y };
  }
  onMove(p: PointerState) { if (this.drag) { this.drag.x = p.x; this.drag.y = p.y; } }
  onUp(p: PointerState, tap: boolean) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const to = this.nodeAt(p.x, p.y);
    if (tap || to < 0 || to === d.from) {
      // tapping a beam while building removes it — quick fix for touch players
      if (tap) this.eraseAt(p.x, p.y, true);
      return;
    }
    const A = this.gnodes[d.from], B = this.gnodes[to];
    const len = Math.hypot(A.c - B.c, A.r - B.r);
    if (len > this.p.maxLen + 1e-6) { this.env.toast('Too long — beams span one cell (diagonals OK)', 'warn'); this.env.audio.play('error'); return; }
    if (A.fixed && B.fixed) return;
    if (this.hasBeam(d.from, to)) return;
    if (this.beams.length >= this.p.budget) { this.env.toast('Out of beams! Remove one first.', 'warn'); this.env.audio.play('error'); return; }
    this.beams.push({ a: d.from, b: to });
    this.env.audio.play('snap', { vol: 0.6 });
    this.env.audio.play('tap', { pitch: 0.8 + this.beams.length * 0.02 });
    const m = { x: (this.pos(d.from).x + this.pos(to).x) / 2, y: (this.pos(d.from).y + this.pos(to).y) / 2 };
    this.env.fx.emit('dust', m.x, m.y, 4, { color: '#C9A04E', size: 6, speed: 60 });
    this.env.refreshTools();
  }

  private eraseAt(x: number, y: number, quiet = false) {
    let bi = -1, bd = 26;
    this.beams.forEach((b, i) => { const A = this.pos(b.a), B = this.pos(b.b); const d = segDist(x, y, A.x, A.y, B.x, B.y).d; if (d < bd) { bd = d; bi = i; } });
    if (bi < 0) { if (!quiet) this.env.audio.play('click', { pitch: 0.5 }); return; }
    this.beams.splice(bi, 1);
    this.env.audio.play('creak');
    this.env.refreshTools();
  }

  private startTest() {
    if (this.testing || this.crossed) return;
    const nodes = this.gnodes.map((n) => makeNode(n.c * PHYS, n.r * PHYS, n.fixed));
    const beams = this.beams.map((b) => makeBeam(nodes, b.a, b.b, this.isDeck(b.a, b.b)));
    resetTruss(nodes, beams);
    this.testing = { nodes, beams, x: 0, settle: 0, result: null, timer: 0, wy: this.deckRow * PHYS };
    this.env.audio.play('whoosh', { pitch: 0.7 });
    this.env.refreshTools();
  }

  update(dt: number) {
    this.autoCd -= dt;
    if (this.crossed) this.arrive += dt;
    const T = this.testing;
    if (!T) return;
    if (T.result) {
      T.timer += dt;
      // keep simulating the collapse for drama
      if (T.result !== 'crossed') stepTruss(T.nodes, T.beams, 1 / 60);
      if (T.timer > 1.4 && T.result !== 'crossed') { this.testing = null; this.env.refreshTools(); }
      return;
    }
    const step = 1 / 60;
    const iters = Math.max(1, Math.round(dt / step));
    for (let k = 0; k < iters && !T.result; k++) {
      if (T.settle < 1) {
        T.settle += step;
        if (stepTruss(T.nodes, T.beams, step) >= 0) this.fail('collapse');
        continue;
      }
      T.x += step * 0.42 * PHYS * 2.2;
      const xEnd = (this.p.cols - 1) * PHYS;
      if (T.x >= xEnd) { this.succeed(); break; }
      for (const n of T.nodes) n.load = 0;
      const deck = T.beams.find((b) => b.deck && !b.broken && Math.min(T.nodes[b.a].x, T.nodes[b.b].x) - 1 <= T.x && Math.max(T.nodes[b.a].x, T.nodes[b.b].x) + 1 >= T.x);
      if (!deck) { this.fail('nodeck'); break; }
      const A = T.nodes[deck.a], B = T.nodes[deck.b];
      const u = Math.min(1, Math.max(0, (T.x - A.x) / (B.x - A.x || 1)));
      A.load += 6 * (1 - u); B.load += 6 * u;
      T.wy = A.y + (B.y - A.y) * u;
      if (stepTruss(T.nodes, T.beams, step) >= 0) { this.fail('collapse'); break; }
      if (maxSag(T.nodes, PHYS) > TRUSS.maxSag) { this.fail('sag'); break; }
    }
    if (Math.random() < 0.15) this.env.audio.play('creak', { vol: 0.3, pitch: 0.8 + Math.random() * 0.4 });
  }

  private fail(reason: string) {
    const T = this.testing!;
    T.result = reason;
    T.timer = 0;
    this.collapses++;
    const at = this.toLogical(T.x, T.wy);
    this.env.mistake(at.x, at.y, reason === 'nodeck' ? 'No deck to walk on!' : reason === 'sag' ? 'Too wobbly!' : 'Collapsed!');
    this.env.audio.play('thud');
    this.env.shake(0.4);
  }

  private succeed() {
    const T = this.testing!;
    T.result = 'crossed';
    this.crossed = true;
    this.env.audio.play('fanfare');
    const at = this.toLogical(T.x, T.wy);
    this.env.reward(at.x, at.y - 60, 300, 'Across!');
    this.env.fx.emit('star', at.x, at.y, 26, { color: '#FFE9A8', size: 12, speed: 240 });
    this.env.refreshTools();
  }

  private toLogical(px: number, py: number): Vec { return { x: this.ox + (px / PHYS) * this.s, y: this.oy + (py / PHYS) * this.s }; }

  // ------------------------------------------------------------------ render
  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    const T = this.testing;
    // grid pegs
    this.gnodes.forEach((n, i) => {
      const q = this.pos(i);
      if (n.fixed) {
        g.fillStyle = '#E8C46A'; g.beginPath(); g.arc(q.x, q.y, 16, 0, TAU); g.fill();
        g.strokeStyle = '#6E5022'; g.lineWidth = 4; g.stroke();
      } else {
        g.fillStyle = 'rgba(246,239,227,0.6)'; g.beginPath(); g.arc(q.x, q.y, 7, 0, TAU); g.fill();
      }
    });
    // deck guide line
    g.strokeStyle = 'rgba(232,196,106,0.35)'; g.lineWidth = 3; g.setLineDash([10, 12]);
    const dl = this.pos(this.deckRow * this.p.cols), dr = this.pos(this.deckRow * this.p.cols + this.p.cols - 1);
    g.beginPath(); g.moveTo(dl.x, dl.y); g.lineTo(dr.x, dr.y); g.stroke(); g.setLineDash([]);
    // beams (simulated positions while testing)
    const P = (i: number): Vec => (T ? this.toLogical(T.nodes[i].x, T.nodes[i].y) : this.pos(i));
    this.beams.forEach((b, bi) => {
      const A = P(b.a), B = P(b.b);
      const sb = T?.beams[bi];
      const deck = this.isDeck(b.a, b.b);
      if (sb?.broken) { g.globalAlpha = 0.35; }
      const strain = sb ? Math.abs(sb.strain) / TRUSS.breakTension : 0;
      g.strokeStyle = 'rgba(40,20,8,0.5)'; g.lineWidth = deck ? 20 : 15; g.lineCap = 'round';
      g.beginPath(); g.moveTo(A.x + 3, A.y + 5); g.lineTo(B.x + 3, B.y + 5); g.stroke();
      g.strokeStyle = strain > 0.6 ? `rgb(${200 + strain * 50},${120 - strain * 60},60)` : deck ? '#B07A44' : '#C9A04E';
      g.lineWidth = deck ? 16 : 11;
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
      if (deck) { g.strokeStyle = 'rgba(255,240,200,0.4)'; g.lineWidth = 3; g.beginPath(); g.moveTo(A.x, A.y - 5); g.lineTo(B.x, B.y - 5); g.stroke(); }
      g.globalAlpha = 1;
    });
    for (const b of this.beams) for (const i of [b.a, b.b]) { const q = P(i); g.fillStyle = '#5A3A28'; g.beginPath(); g.arc(q.x, q.y, 7, 0, TAU); g.fill(); }
    if (this.drag) {
      const A = this.pos(this.drag.from);
      const to = this.nodeAt(this.drag.x, this.drag.y);
      const B = to >= 0 ? this.pos(to) : { x: this.drag.x, y: this.drag.y };
      const okLen = to >= 0 && Math.hypot(this.gnodes[to].c - this.gnodes[this.drag.from].c, this.gnodes[to].r - this.gnodes[this.drag.from].r) <= this.p.maxLen + 1e-6;
      g.strokeStyle = okLen ? 'rgba(232,196,106,0.85)' : 'rgba(232,111,90,0.8)'; g.lineWidth = 10; g.setLineDash([14, 10]);
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); g.setLineDash([]);
      // reachable pegs
      this.gnodes.forEach((n, i) => {
        const len = Math.hypot(n.c - this.gnodes[this.drag!.from].c, n.r - this.gnodes[this.drag!.from].r);
        if (len > 0 && len <= this.p.maxLen + 1e-6) { const q = this.pos(i); g.strokeStyle = 'rgba(255,240,200,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(q.x, q.y, 16, 0, TAU); g.stroke(); }
      });
    }
    // the courier
    const left = this.pos(this.deckRow * this.p.cols);
    if (T) {
      const w = this.toLogical(T.settle < 1 ? 0 : T.x, T.settle < 1 ? this.deckRow * PHYS : T.wy);
      const fell = T.result && T.result !== 'crossed';
      drawWorker(g, w.x, w.y - 6 + (fell ? T.timer * T.timer * 600 : 0), 36, { t, seed: 3, state: fell ? 'scared' : T.result === 'crossed' ? 'cheer' : 'walk', tool: 'bucket', carry: '#E8C46A' });
    } else if (!this.crossed) {
      drawWorker(g, left.x - 10, left.y - 6, 36, { t, seed: 3, state: 'idle', tool: 'bucket', carry: '#E8C46A' });
    }
  }

  // ------------------------------------------------------------------ QA autoplay: build a Warren truss, then test
  autoplay(dt: number) {
    if (this.autoCd > 0 || this.testing) return;
    this.autoCd = 0.06;
    const cols = this.p.cols, d = this.deckRow;
    const id = (c: number, r: number) => r * cols + c;
    const plan: [number, number][] = [];
    for (let c = 0; c < cols - 1; c++) {
      plan.push([id(c, d), id(c + 1, d)]);
      plan.push([id(c, d + 1), id(c + 1, d + 1)]);
      plan.push(c % 2 === 0 ? [id(c, d), id(c + 1, d + 1)] : [id(c, d + 1), id(c + 1, d)]);
    }
    for (let c = 1; c < cols - 1; c++) plan.push([id(c, d), id(c, d + 1)]);
    const next = plan.find(([a, b]) => !this.hasBeam(a, b));
    if (next) {
      if (this.tool !== 'build') { this.selectTool('build'); return; }
      const A = this.pos(next[0]), B = this.pos(next[1]);
      this.fake.down(A.x, A.y); this.fake.move(B.x, B.y, dt); this.fake.up(false);
      return;
    }
    if (!this.crossed) this.selectTool('test');
  }
}
