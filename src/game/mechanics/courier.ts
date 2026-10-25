import { drawPigment, roundRect } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { TAU, dist } from '../../core/math';
import { Walker } from '../agents';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface CourierParams {
  type: 'courier';
  cols: number;
  rows: number;
  colors: string[];
  /** deliveries per colour */
  perColor: number;
  /** fraction of grid edges removed to make the network interesting */
  prune: number;
}

interface Node { x: number; y: number }
interface Edge { a: number; b: number; used: number /* -1 free, else delivery idx */ }
interface Dest { node: number; color: number; filled: boolean; claimed: boolean; splash: number }
interface Route { color: number; nodes: number[]; edges: number[]; dest: number; walker: Walker; arrived: boolean }

/** BFS shortest path that may only use free edges. Exported for unit tests. */
export function bfsPath(nodeCount: number, edges: { a: number; b: number; used: number }[], from: number, to: number, blocked?: Set<number>): number[] | null {
  const adj: [number, number][][] = Array.from({ length: nodeCount }, () => []);
  edges.forEach((e, i) => { if (e.used < 0) { adj[e.a].push([e.b, i]); adj[e.b].push([e.a, i]); } });
  const prev = new Array<number>(nodeCount).fill(-2);
  const prevE = new Array<number>(nodeCount).fill(-1);
  prev[from] = -1;
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (n === to) break;
    for (const [m, ei] of adj[n]) if (prev[m] === -2 && (m === to || !blocked?.has(m))) { prev[m] = n; prevE[m] = ei; q.push(m); }
  }
  if (prev[to] === -2) return null;
  const path: number[] = [];
  for (let n = to; n !== -1; n = prev[n]) path.unshift(n);
  return path;
}

/**
 * Courier family (stage 8 "Crack Couriers"): route colour crews along a real branching
 * craquelure network. Every crack can carry only one courier before it is sealed, so routes
 * must be edge-disjoint — a genuine logistics puzzle, guaranteed solvable by construction.
 */
export class CourierMechanic extends Mechanic {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private depots: number[] = [];
  private dests: Dest[] = [];
  private routes: Route[] = [];
  private draft: { color: number; nodes: number[] } | null = null;
  private solution: { color: number; nodes: number[]; dest: number }[] = [];
  private solutionLen = 0;
  private undos = 0;
  private ptr = { x: -999, y: -999 };
  private fake = new FakePointer(this);
  private autoIdx = 0;
  private autoStep = 0;

  constructor(readonly p: CourierParams) { super(); }

  init() {
    let ok = false;
    for (let attempt = 0; attempt < 400 && !ok; attempt++) ok = this.generate(attempt);
    if (!ok) throw new Error('courier generator failed');
    this.tool = 'route';
  }

  private generate(_attempt: number): boolean {
    const { W, H, rng } = this.env;
    const { cols, rows } = this.p;
    this.nodes = []; this.edges = []; this.depots = []; this.dests = []; this.solution = [];
    const mx = 90, top = 110, bottom = 170;
    const sx = (W - mx * 2) / (cols - 1), sy = (H - top - bottom) / (rows - 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      this.nodes.push({ x: mx + c * sx + (rng.next() - 0.5) * sx * 0.45, y: top + r * sy + (rng.next() - 0.5) * sy * 0.45 });
    }
    const id = (c: number, r: number) => r * cols + c;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (c < cols - 1) this.edges.push({ a: id(c, r), b: id(c + 1, r), used: -1 });
      if (r < rows - 1) this.edges.push({ a: id(c, r), b: id(c, r + 1), used: -1 });
      if (c < cols - 1 && r < rows - 1 && rng.chance(0.25)) this.edges.push(rng.chance(0.5) ? { a: id(c, r), b: id(c + 1, r + 1), used: -1 } : { a: id(c + 1, r), b: id(c, r + 1), used: -1 });
    }
    // prune while keeping the graph connected
    const order = rng.shuffle(this.edges.map((_, i) => i));
    const removeN = Math.floor(this.edges.length * this.p.prune);
    let removed = 0;
    for (const ei of order) {
      if (removed >= removeN) break;
      const e = this.edges[ei];
      // keep the depot row fully wired so every bucket has exits
      if (Math.floor(e.a / cols) === rows - 1 || Math.floor(e.b / cols) === rows - 1) continue;
      e.used = 99;
      if (this.connected()) { removed++; } else e.used = -1;
    }
    this.edges = this.edges.filter((e) => e.used === -1);
    // depots along the bottom row, destinations inside
    const nColors = this.p.colors.length;
    const bottomRow = Array.from({ length: cols }, (_, c) => id(c, rows - 1));
    for (let k = 0; k < nColors; k++) {
      const c = Math.round(((k + 0.5) * cols) / nColors - 0.5);
      this.depots.push(id(Math.min(cols - 1, Math.max(0, c)), rows - 1));
    }
    const taken = new Set<number>([...this.depots, ...bottomRow]);
    for (let k = 0; k < nColors; k++) {
      for (let j = 0; j < this.p.perColor; j++) {
        let n = -1;
        for (let tries = 0; tries < 50; tries++) {
          const cand = id(Math.floor(rng.next() * cols), Math.floor(rng.next() * (rows - 2)));
          if (!taken.has(cand)) { n = cand; break; }
        }
        if (n < 0) return false;
        taken.add(n);
        this.dests.push({ node: n, color: k, filled: false, claimed: false, splash: 0 });
      }
    }
    // prove solvable: sequential edge-disjoint shortest paths; try several delivery orders.
    // Routes may cross at junctions but never run through another bucket.
    const blocked = new Set<number>(this.depots);
    for (let tryOrder = 0; tryOrder < 40; tryOrder++) {
      const scratch = this.edges.map((e) => ({ ...e }));
      const order2 = rng.shuffle(this.dests.map((_, i) => i));
      const sol: { color: number; nodes: number[]; dest: number }[] = [];
      let total = 0;
      let failed = false;
      for (const di of order2) {
        const d = this.dests[di];
        const path = bfsPath(this.nodes.length, scratch, this.depots[d.color], d.node, blocked);
        if (!path || path.length < 3) { failed = true; break; }
        for (let i = 0; i < path.length - 1; i++) {
          const ei = scratch.findIndex((e) => e.used < 0 && ((e.a === path[i] && e.b === path[i + 1]) || (e.b === path[i] && e.a === path[i + 1])));
          scratch[ei].used = di;
          total += dist(this.nodes[path[i]].x, this.nodes[path[i]].y, this.nodes[path[i + 1]].x, this.nodes[path[i + 1]].y);
        }
        sol.push({ color: d.color, nodes: path, dest: di });
      }
      if (failed) continue;
      this.solution = sol;
      this.solutionLen = total;
      return true;
    }
    return false;
  }

  private connected() {
    const adj: number[][] = Array.from({ length: this.nodes.length }, () => []);
    for (const e of this.edges) if (e.used === -1) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
    const seen = new Set([0]);
    const q = [0];
    while (q.length) { const n = q.pop()!; for (const m of adj[n]) if (!seen.has(m)) { seen.add(m); q.push(m); } }
    return seen.size === this.nodes.length;
  }

  tools(): ToolDef[] {
    return [
      { id: 'route', label: 'Route crew', icon: 'route', active: true },
      { id: 'undo', label: 'Undo route', icon: 'undo', disabled: !this.routes.length },
    ];
  }

  selectTool(id: string) {
    if (id === 'undo') { this.undo(); return; }
    super.selectTool(id);
  }

  private undo() {
    const r = this.routes.pop();
    if (!r) return;
    this.undos++;
    for (const ei of r.edges) this.edges[ei].used = -1;
    this.dests[r.dest].filled = false;
    this.dests[r.dest].claimed = false;
    this.env.audio.play('whoosh', { vol: 0.5 });
    this.env.refreshTools();
  }

  progressLabel() { return 'Colour delivered'; }

  metrics() {
    const delivered = this.dests.filter((d) => d.filled).length;
    const len = this.routes.reduce((s, r) => s + this.routeLen(r.nodes), 0);
    return {
      progress: delivered / this.dests.length, delivered, deliveries: this.dests.length, undos: this.undos,
      efficiency: this.routes.length ? this.solutionLen / Math.max(1, len) : 1,
    };
  }

  private routeLen(nodes: number[]) {
    let s = 0;
    for (let i = 0; i < nodes.length - 1; i++) s += dist(this.nodes[nodes[i]].x, this.nodes[nodes[i]].y, this.nodes[nodes[i + 1]].x, this.nodes[nodes[i + 1]].y);
    return s;
  }

  ready() { return this.routes.every((r) => r.arrived); }

  hintPoint() {
    const d = this.dests.find((q) => !q.claimed);
    return d ? this.nodes[this.depots[d.color]] : null;
  }

  private edgeBetween(a: number, b: number) {
    return this.edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  }

  private nodeAt(x: number, y: number, r = 50) {
    let best = -1, bd = r;
    this.nodes.forEach((n, i) => { const d = dist(n.x, n.y, x, y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // ------------------------------------------------------------------ input
  onDown(p: PointerState) {
    this.ptr = { x: p.x, y: p.y };
    const n = this.nodeAt(p.x, p.y, 70);
    const depotIdx = this.depots.indexOf(n);
    if (depotIdx >= 0) {
      this.draft = { color: depotIdx, nodes: [n] };
      this.env.audio.play('tap');
    } else if (n >= 0) {
      this.env.toast('Start each route from a paint bucket depot', 'info');
    }
  }
  onHover(p: PointerState) { this.ptr = { x: p.x, y: p.y }; }

  onMove(p: PointerState) {
    this.ptr = { x: p.x, y: p.y };
    const d = this.draft;
    if (!d) return;
    const n = this.nodeAt(p.x, p.y, 46);
    if (n < 0) return;
    const last = d.nodes[d.nodes.length - 1];
    if (n === last) return;
    if (d.nodes.length > 1 && n === d.nodes[d.nodes.length - 2]) { d.nodes.pop(); this.env.audio.play('click', { pitch: 0.8 }); return; }
    const ei = this.edgeBetween(last, n);
    if (ei < 0) return;
    if (this.edges[ei].used >= 0) { this.env.audio.play('click', { pitch: 0.4 }); return; }
    // no reusing a crack within the same draft either
    for (let i = 0; i < d.nodes.length - 1; i++) if (this.edgeBetween(d.nodes[i], d.nodes[i + 1]) === ei) return;
    d.nodes.push(n);
    this.env.audio.play('tap', { pitch: 1 + Math.min(1, d.nodes.length * 0.05) });
  }

  onUp() {
    const d = this.draft;
    this.draft = null;
    if (!d || d.nodes.length < 2) return;
    const end = d.nodes[d.nodes.length - 1];
    const di = this.dests.findIndex((q) => q.node === end && !q.claimed);
    if (di < 0) return;
    const dest = this.dests[di];
    if (dest.color !== d.color) {
      const n = this.nodes[end];
      this.env.mistake(n.x, n.y, 'Wrong colour!');
      return;
    }
    const edges: number[] = [];
    for (let i = 0; i < d.nodes.length - 1; i++) edges.push(this.edgeBetween(d.nodes[i], d.nodes[i + 1]));
    edges.forEach((ei) => { this.edges[ei].used = di; });
    dest.claimed = true;
    const start = this.nodes[d.nodes[0]];
    const w = new Walker(start.x, start.y, 34, 'bucket', 230);
    w.carry = this.p.colors[d.color];
    const route: Route = { color: d.color, nodes: d.nodes, edges, dest: di, walker: w, arrived: false };
    w.follow(d.nodes.slice(1).map((ni) => this.nodes[ni]), () => {
      route.arrived = true;
      dest.filled = true;
      dest.splash = 1;
      w.state = 'cheer';
      const n = this.nodes[dest.node];
      this.env.audio.play('splash', { pitch: 1.2 });
      this.env.fx.emit('splat', n.x, n.y, 12, { color: this.p.colors[d.color], size: 8, speed: 180, gravity: 300 });
      this.env.reward(n.x, n.y - 50, 100, 'Delivered!');
    });
    this.routes.push(route);
    this.env.audio.play('chime', { pitch: 0.9 + d.color * 0.1 });
    this.env.refreshTools();
  }

  update(dt: number) {
    for (const r of this.routes) r.walker.update(dt);
    for (const d of this.dests) d.splash = Math.max(0, d.splash - dt);
  }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    g.lineCap = 'round';
    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const used = e.used >= 0;
      g.strokeStyle = 'rgba(22,12,5,0.85)'; g.lineWidth = used ? 12 : 9;
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
      if (used) {
        const r = this.routes.find((q) => q.dest === e.used);
        g.strokeStyle = r ? this.p.colors[r.color] : '#E8C46A';
        g.globalAlpha = 0.85;
        g.lineWidth = 6;
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
        g.globalAlpha = 1;
      } else {
        g.strokeStyle = 'rgba(240,220,180,0.25)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(A.x + 2, A.y + 3); g.lineTo(B.x + 2, B.y + 3); g.stroke();
      }
    }
    for (const n of this.nodes) { g.fillStyle = 'rgba(22,12,5,0.9)'; g.beginPath(); g.arc(n.x, n.y, 7, 0, TAU); g.fill(); }
    // paint-loss spots waiting for colour
    for (const d of this.dests) {
      const n = this.nodes[d.node];
      const col = this.p.colors[d.color];
      if (d.filled) {
        g.fillStyle = col; g.globalAlpha = 0.35 + d.splash * 0.5;
        g.beginPath(); g.arc(n.x, n.y, 34 + d.splash * 20, 0, TAU); g.fill(); g.globalAlpha = 1;
        drawPigment(g, n.x, n.y, 18, col);
      } else {
        g.fillStyle = '#EDE3CC';
        g.beginPath(); g.arc(n.x, n.y, 30, 0, TAU); g.fill();
        g.strokeStyle = col; g.lineWidth = 7;
        g.setLineDash([10, 7]); g.lineDashOffset = -t * 20;
        g.beginPath(); g.arc(n.x, n.y, 34, 0, TAU); g.stroke(); g.setLineDash([]);
        g.fillStyle = col; g.globalAlpha = 0.6;
        g.beginPath(); g.arc(n.x, n.y, 12, 0, TAU); g.fill(); g.globalAlpha = 1;
      }
    }
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    // depots: paint buckets with a waiting crew member
    this.depots.forEach((n, k) => {
      const N = this.nodes[n];
      const col = this.p.colors[k];
      const left = this.dests.filter((d) => d.color === k && !d.claimed).length;
      g.save();
      g.translate(N.x, N.y + 6);
      g.fillStyle = 'rgba(20,10,5,0.35)'; g.beginPath(); g.ellipse(0, 40, 50, 12, 0, 0, TAU); g.fill();
      g.fillStyle = '#9AA5A8';
      g.beginPath(); g.moveTo(-36, -8); g.lineTo(36, -8); g.lineTo(28, 40); g.lineTo(-28, 40); g.fill();
      g.fillStyle = col; g.beginPath(); g.ellipse(0, -8, 36, 11, 0, 0, TAU); g.fill();
      g.strokeStyle = '#5A6266'; g.lineWidth = 4; g.beginPath(); g.arc(0, -8, 38, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      if (left) {
        g.fillStyle = '#3B2418'; roundRect(g, 20, -54, 40, 30, 10); g.fill();
        g.fillStyle = '#F6EFE3'; g.font = '900 22px "Nunito Variable", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(`×${left}`, 40, -39);
      }
      g.restore();
    });
    // draft route
    if (this.draft) {
      const d = this.draft;
      g.strokeStyle = this.p.colors[d.color]; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
      g.setLineDash([2, 22]); g.lineDashOffset = -t * 80;
      g.beginPath();
      d.nodes.forEach((ni, i) => { const n = this.nodes[ni]; if (i) g.lineTo(n.x, n.y); else g.moveTo(n.x, n.y); });
      g.lineTo(this.ptr.x, this.ptr.y);
      g.stroke(); g.setLineDash([]);
      const last = this.nodes[d.nodes[d.nodes.length - 1]];
      g.strokeStyle = '#FFF6DA'; g.lineWidth = 4;
      g.beginPath(); g.arc(last.x, last.y, 22 + Math.sin(t * 10) * 4, 0, TAU); g.stroke();
    }
    for (const r of this.routes) r.walker.draw(g, t);
  }

  // ------------------------------------------------------------------ QA autoplay: replay the generator's proof
  autoplay(dt: number) {
    if (this.autoIdx >= this.solution.length) return;
    const f = this.fake;
    const sol = this.solution[this.autoIdx];
    this.autoStep += dt * 12;
    const i = Math.floor(this.autoStep);
    if (!f.s.down) { const n = this.nodes[sol.nodes[0]]; f.down(n.x, n.y); this.autoStep = 0; return; }
    if (i < sol.nodes.length) { const n = this.nodes[sol.nodes[i]]; f.move(n.x, n.y, dt); return; }
    f.up();
    this.autoIdx++;
  }
}
