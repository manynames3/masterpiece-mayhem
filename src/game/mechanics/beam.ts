import { drawCritter, drawLantern, drawStarShape, drawWorker, roundRect } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { RNG, TAU, type Vec } from '../../core/math';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface BeamBoardDef { x: number; y: number; w: number; h: number; cols: number; rows: number; label?: string; style?: 'plain' | 'mirror' | 'deep' }
export interface BeamParams {
  type: 'beam';
  boards: BeamBoardDef[];
  /** board visit order for the light path, e.g. [0] or [0,1,0] */
  route: number[];
  targets: number;
  decoys: number;
  blocks: number;
  fragile: number;
  /** link mirrors into groups that rotate together (stage 27) */
  linked?: boolean;
  /** cells per straight run before the generator may turn */
  turnChance?: number;
}

type Kind = 'empty' | 'mirror' | 'block' | 'target' | 'fragile' | 'portal';
export interface BeamCell { kind: Kind; orient: number; group: number; portal?: { b: number; c: number; r: number }; pair?: number; lit: boolean; spin: number }
interface Board extends BeamBoardDef { cw: number; ch: number; cells: BeamCell[][] }
const reflectDir = (d: Vec, orient: number): Vec => (orient === 0 ? { x: -d.y, y: -d.x } : { x: d.y, y: d.x });

export interface TraceResult { segs: { b: number; pts: Vec[] }[]; lit: Set<string>; fragileHit: boolean }

/** Pure light-path trace (exported for unit tests). */
export function traceBeam(cells: BeamCell[][][], source: { b: number; c: number; r: number; d: Vec }): TraceResult {
  const lit = new Set<string>();
  const segs: { b: number; pts: Vec[] }[] = [];
  let b = source.b, c = source.c, r = source.r, d = { ...source.d };
  let seg = { b, pts: [{ x: c - d.x * 0.5, y: r - d.y * 0.5 }] as Vec[] };
  let fragileHit = false;
  for (let guard = 0; guard < 600; guard++) {
    const grid = cells[b];
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) { seg.pts.push({ x: c - d.x * 0.5, y: r - d.y * 0.5 }); break; }
    const cell = grid[r][c];
    if (cell.kind === 'block') { seg.pts.push({ x: c - d.x * 0.45, y: r - d.y * 0.45 }); break; }
    if (cell.kind === 'target') lit.add(`${b}:${c}:${r}`);
    if (cell.kind === 'fragile') fragileHit = true;
    if (cell.kind === 'mirror') {
      seg.pts.push({ x: c, y: r });
      d = reflectDir(d, cell.orient);
    } else if (cell.kind === 'portal' && cell.portal) {
      seg.pts.push({ x: c, y: r });
      segs.push(seg);
      ({ b, c, r } = cell.portal);
      seg = { b, pts: [{ x: c, y: r }] };
    }
    c += d.x; r += d.y;
  }
  segs.push(seg);
  return { segs, lit, fragileHit };
}

/**
 * Beam family — rotate mirror tiles to steer light onto highlight spots (9), across portal-
 * linked mirror worlds (26) and through nested boards with linked mirrors (27).
 * Puzzles are generated from a solved light path, then scrambled only by player-legal taps.
 */
export class BeamMechanic extends Mechanic {
  private boards: Board[] = [];
  private source = { b: 0, c: 0, r: 0, d: { x: 1, y: 0 } };
  private solution = new Map<string, number>();
  private groups: { b: number; c: number; r: number }[][] = [];
  private trace: TraceResult = { segs: [], lit: new Set(), fragileHit: false };
  private taps = 0;
  private par = 0;
  private scorch = 0;
  private fake = new FakePointer(this);
  private autoCooldown = 0;
  private targetsTotal = 0;
  private sparkleT = 0;

  constructor(readonly p: BeamParams) { super(); }

  init() {
    const { W, H } = this.env;
    let ok = false;
    for (let attempt = 0; attempt < 400 && !ok; attempt++) ok = this.generate(new RNG(this.env.stage.seed * 131 + attempt));
    if (!ok) throw new Error('beam generator failed');
    this.boards.forEach((b) => { b.x *= W; b.y *= H; b.w *= W; b.h *= H; b.cw = b.w / b.cols; b.ch = b.h / b.rows; });
    this.retrace(false);
    this.tool = 'rotate';
  }

  private cellsOnly() { return this.boards.map((b) => b.cells); }

  private generate(rng: RNG): boolean {
    const p = this.p;
    this.boards = p.boards.map((d) => ({ ...d, cw: 0, ch: 0, cells: Array.from({ length: d.rows }, () => Array.from({ length: d.cols }, () => ({ kind: 'empty' as Kind, orient: 0, group: -1, lit: false, spin: 0 }))) }));
    const visited = new Set<string>();
    const key = (b: number, c: number, r: number) => `${b}:${c}:${r}`;
    const inside = (b: number, c: number, r: number) => c >= 0 && r >= 0 && c < this.boards[b].cols && r < this.boards[b].rows;
    const b0 = this.boards[p.route[0]];
    const sr = 1 + Math.floor(rng.next() * (b0.rows - 2));
    this.source = { b: p.route[0], c: 0, r: sr, d: { x: 1, y: 0 } };
    let b = p.route[0], c = 0, r = sr, d = { x: 1, y: 0 };
    const pathCells: { b: number; c: number; r: number }[] = [];
    const turnChance = p.turnChance ?? 0.38;
    let pairId = 0;
    for (let segI = 0; segI < p.route.length; segI++) {
      const last = segI === p.route.length - 1;
      const segLen = last ? 3 + Math.floor(rng.next() * 6) : 4 + Math.floor(rng.next() * 5);
      let sinceTurn = 0;
      for (let step = 0; step < 30; step++) {
        if (!inside(b, c, r)) { if (last && step >= 2) break; return false; }
        if (visited.has(key(b, c, r))) return false;
        visited.add(key(b, c, r));
        pathCells.push({ b, c, r });
        const cell = this.boards[b].cells[r][c];
        if (!last && step >= segLen) {
          // jump through a portal to the next board
          const nb = p.route[segI + 1];
          const B = this.boards[nb];
          let tries = 0, ec = 0, er = 0;
          do { ec = Math.floor(rng.next() * B.cols); er = Math.floor(rng.next() * B.rows); tries++; }
          while ((visited.has(key(nb, ec, er)) || !inside(nb, ec + d.x, er + d.y) || !inside(nb, ec + d.x * 2, er + d.y * 2)) && tries < 60);
          if (tries >= 60) return false;
          cell.kind = 'portal'; cell.portal = { b: nb, c: ec, r: er }; cell.pair = pairId;
          const exit = B.cells[er][ec];
          exit.kind = 'portal'; exit.pair = pairId; exit.portal = undefined;
          visited.add(key(nb, ec, er));
          pathCells.push({ b: nb, c: ec, r: er });
          pairId++;
          b = nb; c = ec + d.x; r = er + d.y;
          break;
        }
        if (last && step >= segLen) { c += d.x; r += d.y; if (!inside(b, c, r)) break; continue; }
        if (sinceTurn >= 1 && rng.next() < turnChance) {
          const turnLeft = rng.chance(0.5);
          const nd = turnLeft ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x };
          if (inside(b, c + nd.x, r + nd.y) && !visited.has(key(b, c + nd.x, r + nd.y))) {
            // choose orientation that maps d → nd
            const o0 = reflectDir(d, 0);
            cell.kind = 'mirror';
            cell.orient = o0.x === nd.x && o0.y === nd.y ? 0 : 1;
            d = nd; sinceTurn = 0;
            c += d.x; r += d.y;
            continue;
          }
        }
        sinceTurn++;
        c += d.x; r += d.y;
      }
    }
    const mirrors = pathCells.filter((q) => this.boards[q.b].cells[q.r][q.c].kind === 'mirror');
    if (mirrors.length < Math.max(2, p.route.length + 1)) return false;
    // targets on straight path cells, spread along the route
    const plain = pathCells.filter((q, i) => i > 0 && this.boards[q.b].cells[q.r][q.c].kind === 'empty');
    if (plain.length < p.targets) return false;
    const stride = plain.length / p.targets;
    for (let i = 0; i < p.targets; i++) {
      const q = plain[Math.min(plain.length - 1, Math.floor(stride * i + stride * 0.6))];
      this.boards[q.b].cells[q.r][q.c].kind = 'target';
    }
    this.targetsTotal = p.targets;
    // decoys / blocks / fragile go on cells the solved beam never touches
    const free: { b: number; c: number; r: number }[] = [];
    this.boards.forEach((B, bi) => { for (let rr = 0; rr < B.rows; rr++) for (let cc = 0; cc < B.cols; cc++) if (!visited.has(key(bi, cc, rr))) free.push({ b: bi, c: cc, r: rr }); });
    rng.shuffle(free);
    const take = (n: number, kind: Kind) => { for (let i = 0; i < n && free.length; i++) { const q = free.pop()!; const cell = this.boards[q.b].cells[q.r][q.c]; cell.kind = kind; cell.orient = Math.floor(rng.next() * 2); } };
    take(p.decoys, 'mirror');
    take(p.blocks, 'block');
    take(p.fragile, 'fragile');
    // record the solution, build groups
    this.solution.clear();
    const allMirrors: { b: number; c: number; r: number }[] = [];
    this.boards.forEach((B, bi) => B.cells.forEach((row, rr) => row.forEach((cell, cc) => { if (cell.kind === 'mirror') { allMirrors.push({ b: bi, c: cc, r: rr }); this.solution.set(key(bi, cc, rr), cell.orient); } })));
    this.groups = [];
    if (p.linked) {
      rng.shuffle(allMirrors);
      while (allMirrors.length) {
        const size = allMirrors.length >= 4 ? (rng.chance(0.5) ? 2 : 3) : allMirrors.length;
        this.groups.push(allMirrors.splice(0, size));
      }
    } else this.groups = allMirrors.map((m) => [m]);
    this.groups.forEach((gr, gi) => gr.forEach((m) => { this.boards[m.b].cells[m.r][m.c].group = gi; }));
    // the solved state must light everything and never scorch
    const solved = traceBeam(this.cellsOnly(), this.source);
    if (solved.lit.size !== p.targets || solved.fragileHit) return false;
    // scramble with legal taps only
    const order = rng.shuffle(this.groups.map((_, i) => i));
    const nTap = Math.max(2, Math.ceil(order.length * 0.55));
    for (let i = 0; i < nTap; i++) this.toggleGroup(order[i], false);
    if (traceBeam(this.cellsOnly(), this.source).lit.size === p.targets) this.toggleGroup(order[nTap % order.length], false);
    this.par = this.groups.filter((gr) => gr.some((m) => this.boards[m.b].cells[m.r][m.c].orient !== this.solution.get(key(m.b, m.c, m.r)))).length;
    return true;
  }

  private toggleGroup(gi: number, animate = true) {
    for (const m of this.groups[gi]) {
      const cell = this.boards[m.b].cells[m.r][m.c];
      cell.orient ^= 1;
      if (animate) cell.spin = 1;
    }
  }

  private retrace(judge: boolean) {
    const before = this.trace.lit.size;
    this.trace = traceBeam(this.cellsOnly(), this.source);
    this.boards.forEach((B, bi) => B.cells.forEach((row, r) => row.forEach((cell, c) => { cell.lit = this.trace.lit.has(`${bi}:${c}:${r}`); })));
    if (!judge) return;
    if (this.trace.fragileHit) {
      this.scorch = 1;
      const pt = this.fragilePoint();
      this.env.mistake(pt.x, pt.y, 'Scorched a fragile spot!');
    }
    if (this.trace.lit.size > before) { this.env.audio.play('chime', { pitch: 1 + this.trace.lit.size * 0.1 }); this.env.haptic(15); }
  }

  private fragilePoint(): Vec {
    for (let bi = 0; bi < this.boards.length; bi++) {
      const B = this.boards[bi];
      for (let r = 0; r < B.rows; r++) for (let c = 0; c < B.cols; c++) if (B.cells[r][c].kind === 'fragile') return this.cellCenter(bi, c, r);
    }
    return { x: this.env.W / 2, y: this.env.H / 2 };
  }

  private cellCenter(b: number, c: number, r: number): Vec {
    const B = this.boards[b];
    return { x: B.x + (c + 0.5) * B.cw, y: B.y + (r + 0.5) * B.ch };
  }

  tools(): ToolDef[] { return [{ id: 'rotate', label: 'Flip mirror', icon: 'mirror', active: true }]; }
  progressLabel() { return 'Highlights lit'; }

  metrics() {
    return { progress: this.trace.lit.size / this.targetsTotal, lit: this.trace.lit.size, targets: this.targetsTotal, taps: this.taps, par: this.par, overPar: Math.max(0, this.taps - this.par) };
  }

  hintPoint() {
    for (const gr of this.groups) for (const m of gr) {
      if (this.boards[m.b].cells[m.r][m.c].orient !== this.solution.get(`${m.b}:${m.c}:${m.r}`)) return this.cellCenter(m.b, m.c, m.r);
    }
    return null;
  }

  onUp(p: PointerState, tap: boolean) {
    if (!tap) return;
    for (let bi = 0; bi < this.boards.length; bi++) {
      const B = this.boards[bi];
      const c = Math.floor((p.x - B.x) / B.cw), r = Math.floor((p.y - B.y) / B.ch);
      if (c < 0 || r < 0 || c >= B.cols || r >= B.rows) continue;
      const cell = B.cells[r][c];
      if (cell.kind === 'mirror') {
        this.taps++;
        this.toggleGroup(cell.group);
        this.env.audio.play('rotate', { pitch: 0.9 + Math.random() * 0.2 });
        if (this.groups[cell.group].length > 1) this.env.audio.play('sparkle', { vol: 0.5 });
        this.retrace(true);
      } else if (cell.kind === 'block') {
        this.env.toast('A sleepy grime lump — light can’t pass it', 'info');
      } else if (cell.kind === 'fragile') {
        this.env.toast('Fragile spot — keep the beam away!', 'warn');
      }
      return;
    }
  }

  update(dt: number) {
    this.scorch = Math.max(0, this.scorch - dt);
    this.autoCooldown -= dt;
    this.sparkleT += dt;
    for (const B of this.boards) for (const row of B.cells) for (const cell of row) cell.spin = Math.max(0, cell.spin - dt * 6);
    if (this.sparkleT > 0.08 && this.trace.segs.length) {
      this.sparkleT = 0;
      const s = this.trace.segs[Math.floor(Math.random() * this.trace.segs.length)];
      const i = Math.floor(Math.random() * Math.max(1, s.pts.length - 1));
      const a = s.pts[i], bb = s.pts[Math.min(s.pts.length - 1, i + 1)];
      const u = Math.random();
      const pt = this.gridToLogical(s.b, a.x + (bb.x - a.x) * u, a.y + (bb.y - a.y) * u);
      this.env.fx.emit('sparkle', pt.x, pt.y, 1, { color: '#FFF3C4', size: 5, speed: 20, max: 0.5 });
    }
  }

  private gridToLogical(b: number, gx: number, gy: number): Vec {
    const B = this.boards[b];
    return { x: B.x + (gx + 0.5) * B.cw, y: B.y + (gy + 0.5) * B.ch };
  }

  onComplete() {
    for (const s of this.trace.segs) for (const q of s.pts) { const pt = this.gridToLogical(s.b, q.x, q.y); this.env.fx.emit('star', pt.x, pt.y, 3, { color: '#FFF3C4', size: 10, speed: 120 }); }
  }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    this.boards.forEach((B, bi) => {
      g.save();
      if (B.style === 'mirror' || B.style === 'deep') {
        // a mirror-world panel: the painting seen through silvered glass
        g.fillStyle = B.style === 'deep' ? 'rgba(30,40,60,0.55)' : 'rgba(40,50,60,0.35)';
        roundRect(g, B.x - 14, B.y - 14, B.w + 28, B.h + 28, 26); g.fill();
        g.strokeStyle = '#C9D2D6'; g.lineWidth = 8; g.stroke();
        g.strokeStyle = '#8A6524'; g.lineWidth = 3; roundRect(g, B.x - 22, B.y - 22, B.w + 44, B.h + 44, 30); g.stroke();
      } else {
        g.fillStyle = 'rgba(20,12,6,0.25)';
        g.fillRect(B.x, B.y, B.w, B.h);
      }
      g.strokeStyle = 'rgba(246,239,227,0.14)'; g.lineWidth = 2;
      for (let c = 0; c <= B.cols; c++) { g.beginPath(); g.moveTo(B.x + c * B.cw, B.y); g.lineTo(B.x + c * B.cw, B.y + B.h); g.stroke(); }
      for (let r = 0; r <= B.rows; r++) { g.beginPath(); g.moveTo(B.x, B.y + r * B.ch); g.lineTo(B.x + B.w, B.y + r * B.ch); g.stroke(); }
      if (B.label) {
        g.fillStyle = 'rgba(246,239,227,0.85)'; g.font = '800 22px "Nunito Variable", system-ui'; g.textAlign = 'left';
        g.fillText(B.label.toUpperCase(), B.x, B.y - 30);
      }
      g.restore();
      for (let r = 0; r < B.rows; r++) for (let c = 0; c < B.cols; c++) this.drawCell(g, bi, c, r, t);
    });
  }

  private drawCell(g: CanvasRenderingContext2D, b: number, c: number, r: number, t: number) {
    const B = this.boards[b];
    const cell = B.cells[r][c];
    const { x, y } = this.cellCenter(b, c, r);
    const s = Math.min(B.cw, B.ch);
    switch (cell.kind) {
      case 'target': {
        const k = cell.lit ? 1 : 0;
        const gr = g.createRadialGradient(x - s * 0.08, y - s * 0.1, 1, x, y, s * 0.42);
        gr.addColorStop(0, cell.lit ? '#FFFFFF' : '#C9C2B4');
        gr.addColorStop(0.5, cell.lit ? '#F2F6F8' : '#8E887C');
        gr.addColorStop(1, cell.lit ? '#B9C9D2' : '#5A554C');
        if (k) { g.fillStyle = 'rgba(255,250,220,0.35)'; g.beginPath(); g.arc(x, y, s * (0.55 + Math.sin(t * 5) * 0.05), 0, TAU); g.fill(); }
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, s * 0.28, 0, TAU); g.fill();
        if (k) drawStarShape(g, x - s * 0.1, y - s * 0.12, s * 0.12, '#ffffff', 4);
        break;
      }
      case 'block':
        drawCritter(g, x, y, s * 0.32, 'soot', { t, seed: c * 7 + r, mood: 'sleepy', legs: false });
        break;
      case 'fragile':
        g.save();
        g.strokeStyle = this.scorch > 0 ? '#E86F5A' : 'rgba(232,196,106,0.9)';
        g.setLineDash([6, 5]); g.lineWidth = 3;
        g.strokeRect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8);
        g.setLineDash([]);
        g.strokeStyle = 'rgba(40,20,10,0.8)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x - s * 0.3, y - s * 0.1); g.lineTo(x - s * 0.05, y + s * 0.05); g.lineTo(x + s * 0.1, y - s * 0.2); g.lineTo(x + s * 0.3, y + s * 0.2); g.stroke();
        g.restore();
        break;
      case 'portal': {
        const cols = ['#9BC6E0', '#E8C46A', '#E86F5A', '#9BE3C4'];
        const col = cols[(cell.pair ?? 0) % cols.length];
        g.save(); g.translate(x, y); g.rotate(t * 2 * (cell.portal ? 1 : -1));
        for (let i = 0; i < 3; i++) { g.strokeStyle = col; g.globalAlpha = 0.9 - i * 0.25; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, s * (0.18 + i * 0.1), i, i + 4.2); g.stroke(); }
        g.restore();
        break;
      }
      case 'mirror': {
        const angle = (cell.orient === 0 ? -Math.PI / 4 : Math.PI / 4) + cell.spin * Math.PI / 2 * (cell.orient === 0 ? 1 : -1);
        g.save(); g.translate(x, y); g.rotate(angle);
        g.fillStyle = 'rgba(20,10,5,0.35)'; roundRect(g, -s * 0.44 + 3, -s * 0.09 + 4, s * 0.88, s * 0.18, 4); g.fill();
        const gr = g.createLinearGradient(0, -s * 0.09, 0, s * 0.09);
        gr.addColorStop(0, '#F4FAFC'); gr.addColorStop(0.5, '#AFC4CE'); gr.addColorStop(1, '#6E8794');
        g.fillStyle = gr; roundRect(g, -s * 0.44, -s * 0.09, s * 0.88, s * 0.18, 4); g.fill();
        g.strokeStyle = '#8A6524'; g.lineWidth = 3; g.stroke();
        g.restore();
        if (cell.group >= 0 && this.p.linked) {
          const gc = ['#E86F5A', '#3A6EA5', '#7DA85E', '#E8C46A', '#B46AD1', '#2F8F8B', '#F28C3A'][cell.group % 7];
          g.fillStyle = gc; g.beginPath(); g.arc(x + s * 0.3, y - s * 0.3, s * 0.1, 0, TAU); g.fill();
          g.strokeStyle = '#F6EFE3'; g.lineWidth = 2; g.stroke();
        }
        break;
      }
    }
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    // the light source: a lantern operated by the crew
    const src = this.cellCenter(this.source.b, this.source.c, this.source.r);
    const B0 = this.boards[this.source.b];
    drawLantern(g, src.x - B0.cw * 0.95, src.y + 10, 22, t);
    drawWorker(g, src.x - B0.cw * 0.95, src.y + B0.ch * 0.9, 30, { t, seed: 4, state: 'work', tool: 'lantern' });
    // beam
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [w, a] of [[28, 0.12], [14, 0.3], [5, 0.95]] as const) {
      g.strokeStyle = `rgba(255,236,170,${a})`;
      g.lineWidth = w;
      for (const s of this.trace.segs) {
        g.beginPath();
        s.pts.forEach((q, i) => { const pt = this.gridToLogical(s.b, q.x, q.y); if (i) g.lineTo(pt.x, pt.y); else g.moveTo(pt.x, pt.y); });
        g.stroke();
      }
    }
    g.restore();
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay() {
    if (this.autoCooldown > 0) return;
    const pt = this.hintPoint();
    if (!pt) return;
    this.fake.tap(pt.x, pt.y);
    this.autoCooldown = 0.25;
  }
}
