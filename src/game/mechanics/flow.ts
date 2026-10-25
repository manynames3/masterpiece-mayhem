import { drawCritter, drawFrog, drawStarShape, roundRect } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { RNG, TAU, type Vec } from '../../core/math';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface FlowParams {
  type: 'flow';
  cols: number;
  rows: number;
  colors: string[];
  /** each sink lists the colour indices that must (all, and only) reach it */
  sinks: number[][];
  blockers?: number;
  theme: 'wave' | 'pond' | 'pigment' | 'stars';
}

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const rotMask = (m: number, r: number) => ((m << r) | (m >> (4 - r))) & 15;

export interface FlowTile { kind: 'pipe' | 'source' | 'sink' | 'empty'; mask: number; rot: number; color: number; need: number; blocked: boolean; onPath: boolean; wet: number; colors: number; spin: number }

/** Pure flow propagation (exported for unit tests): returns colour bitmask reaching each tile. */
export function propagate(tiles: FlowTile[], cols: number, rows: number): { colors: number[]; parent: number[] } {
  const colors = new Array<number>(tiles.length).fill(0);
  const parent = new Array<number>(tiles.length).fill(-1);
  tiles.forEach((t, i) => {
    if (t.kind !== 'source') return;
    const bit = 1 << t.color;
    const q = [i];
    const seen = new Set([i]);
    colors[i] |= bit;
    while (q.length) {
      const n = q.shift()!;
      const tn = tiles[n];
      if (tn.kind === 'sink' && n !== i) continue;
      const m = tn.blocked ? 0 : rotMask(tn.mask, tn.rot);
      const cx = n % cols, cy = Math.floor(n / cols);
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue;
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        const tm = tiles[ni];
        if (tm.blocked || tm.kind === 'empty' || tm.kind === 'source') continue;
        if (!(rotMask(tm.mask, tm.rot) & (1 << ((d + 2) % 4)))) continue;
        if (seen.has(ni)) continue;
        seen.add(ni);
        colors[ni] |= bit;
        if (parent[ni] < 0) parent[ni] = n;
        q.push(ni);
      }
    }
  });
  return { colors, parent };
}

/**
 * Flow family — rotate channel tiles to route water/pigment: release the Great Wave (12),
 * reconnect the lily pond with frog-cleared knots (15), route coloured pigment rivers (17)
 * and mix colours to relight Van Gogh's stars (18). Generated from solved paths.
 */
export class FlowMechanic extends Mechanic {
  private tiles: FlowTile[] = [];
  private ox = 0;
  private oy = 0;
  private cs = 0;
  private rotations = 0;
  private par = 0;
  private charges = 0;
  private parent: number[] = [];
  private fake = new FakePointer(this);
  private autoCd = 0;
  private wave = -1;
  private sinkIdx: number[] = [];

  constructor(readonly p: FlowParams) { super(); }

  init() {
    let ok = false;
    for (let a = 0; a < 300 && !ok; a++) ok = this.generate(new RNG(this.env.stage.seed * 97 + a));
    if (!ok) throw new Error('flow generator failed');
    const { W, H } = this.env;
    const top = 90, bottom = 60;
    this.cs = Math.min((W - 60) / this.p.cols, (H - top - bottom) / this.p.rows);
    this.ox = (W - this.cs * this.p.cols) / 2;
    this.oy = top + (H - top - bottom - this.cs * this.p.rows) / 2;
    this.recompute(false);
    this.tool = 'rotate';
  }

  private generate(rng: RNG): boolean {
    const { cols, rows } = this.p;
    const N = cols * rows;
    this.tiles = Array.from({ length: N }, () => ({ kind: 'empty' as const, mask: 0, rot: 0, color: 0, need: 0, blocked: false, onPath: false, wet: 0, colors: 0, spin: 0 }));
    const idx = (x: number, y: number) => y * cols + x;
    const occupied = new Set<number>();
    // sources on the left edge, spread out
    const nC = this.p.colors.length;
    const srcCells: number[] = [];
    for (let c = 0; c < nC; c++) {
      const y = Math.min(rows - 1, Math.floor(((c + 0.5) / nC) * rows + (rng.next() - 0.5)));
      const i = idx(0, Math.max(0, y));
      if (occupied.has(i)) return false;
      srcCells.push(i);
      occupied.add(i);
      Object.assign(this.tiles[i], { kind: 'source', color: c });
    }
    // sinks toward the right half
    this.sinkIdx = [];
    for (const need of this.p.sinks) {
      let i = -1;
      for (let k = 0; k < 80; k++) {
        const x = Math.floor(cols * 0.45 + rng.next() * cols * 0.55), y = Math.floor(rng.next() * rows);
        const c = idx(Math.min(cols - 1, x), y);
        if (!occupied.has(c)) { i = c; break; }
      }
      if (i < 0) return false;
      occupied.add(i);
      this.sinkIdx.push(i);
      Object.assign(this.tiles[i], { kind: 'sink', need: need.reduce((m, c) => m | (1 << c), 0) });
    }
    // carve a path from each required source to each sink; later paths of the same colour may
    // branch off that colour's existing network (T-junctions) — an edge source has only 3 exits
    const network = srcCells.map((c) => [c]);
    for (let s = 0; s < this.p.sinks.length; s++) {
      const sink = this.sinkIdx[s];
      for (const color of this.p.sinks[s]) {
        let path: number[] | null = null;
        const starts = [network[color][0], ...rng.shuffle(network[color].slice(1))];
        for (const start of starts) { path = this.carve(rng, start, sink, occupied); if (path) break; }
        if (!path) return false;
        for (let k = 1; k < path.length - 1; k++) network[color].push(path[k]);
        for (let k = 0; k < path.length - 1; k++) {
          const a = path[k], b = path[k + 1];
          const ax = a % cols, ay = Math.floor(a / cols), bx = b % cols, by = Math.floor(b / cols);
          const d = bx > ax ? 1 : bx < ax ? 3 : by > ay ? 2 : 0;
          this.tiles[a].mask |= 1 << d;
          this.tiles[b].mask |= 1 << ((d + 2) % 4);
          if (k > 0) { occupied.add(a); this.tiles[a].kind = 'pipe'; this.tiles[a].onPath = true; }
        }
      }
    }
    // decoys everywhere else
    const decoys = [5, 10, 3, 6, 12, 9, 7, 11, 13, 14];
    for (let i = 0; i < N; i++) {
      const t = this.tiles[i];
      if (t.kind === 'empty') { if (rng.next() < 0.88) { t.kind = 'pipe'; t.mask = rng.pick(decoys); } }
    }
    // blockers on path tiles
    const pathTiles = this.tiles.map((t, i) => (t.onPath ? i : -1)).filter((i) => i >= 0);
    if ((this.p.blockers ?? 0) > pathTiles.length) return false;
    rng.shuffle(pathTiles).slice(0, this.p.blockers ?? 0).forEach((i) => { this.tiles[i].blocked = true; });
    this.charges = (this.p.blockers ?? 0) + 1;
    // verify solved state, then scramble rotations (player-legal)
    const solved = propagate(this.tiles, cols, rows);
    const unblocked = this.tiles.map((t) => ({ ...t, blocked: false }));
    const sv = propagate(unblocked, cols, rows);
    if (!this.sinkIdx.every((si) => sv.colors[si] === this.tiles[si].need)) return false;
    void solved;
    this.par = 0;
    for (const t of this.tiles) {
      if (t.kind !== 'pipe') continue;
      t.rot = Math.floor(rng.next() * 4);
      if (t.onPath) {
        const sym = t.mask === 5 || t.mask === 10;
        const need = (4 - t.rot) % 4;
        this.par += sym ? need % 2 : need;
      }
    }
    const scrambled = propagate(this.tiles.map((t) => ({ ...t, blocked: false })), cols, rows);
    if (this.sinkIdx.every((si) => scrambled.colors[si] === this.tiles[si].need)) return false;
    return true;
  }

  /** randomized best-first carve from a to b through free cells */
  private carve(rng: RNG, a: number, b: number, occupied: Set<number>): number[] | null {
    const { cols, rows } = this.p;
    const bx = b % cols, by = Math.floor(b / cols);
    const visited = new Set<number>([a]);
    const path = [a];
    let guard = 0;
    while (path.length && guard++ < 4000) {
      const cur = path[path.length - 1];
      if (cur === b) return path;
      const cx = cur % cols, cy = Math.floor(cur / cols);
      const opts: { i: number; s: number }[] = [];
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (visited.has(ni)) continue;
        if (ni !== b && occupied.has(ni)) continue;
        opts.push({ i: ni, s: Math.abs(nx - bx) + Math.abs(ny - by) + rng.next() * 2.6 });
      }
      if (!opts.length) { path.pop(); continue; }
      opts.sort((p, q) => p.s - q.s);
      visited.add(opts[0].i);
      path.push(opts[0].i);
    }
    return null;
  }

  private recompute(judge: boolean) {
    const res = propagate(this.tiles, this.p.cols, this.p.rows);
    const before = this.sinksOk();
    this.tiles.forEach((t, i) => { t.colors = res.colors[i]; });
    this.parent = res.parent;
    if (judge && this.sinksOk() > before) { this.env.audio.play('chime', { pitch: 0.9 + this.sinksOk() * 0.12 }); this.env.haptic(20); }
  }

  private sinksOk() { return this.sinkIdx.filter((i) => this.tiles[i].colors === this.tiles[i].need).length; }

  tools(): ToolDef[] {
    const t: ToolDef[] = [{ id: 'rotate', label: 'Rotate', icon: 'rotate', active: this.tool === 'rotate' }];
    if (this.p.blockers) t.push({ id: 'frog', label: 'Frog clears', icon: 'tongue', active: this.tool === 'frog', badge: String(this.charges), disabled: this.charges <= 0 });
    return t;
  }

  progressLabel() { return { wave: 'Channels open', pond: 'Pond reconnected', pigment: 'Rivers routed', stars: 'Stars relit' }[this.p.theme]; }

  metrics() {
    const ok = this.sinksOk();
    const blocked = this.tiles.filter((t) => t.blocked).length;
    return { progress: ok / this.sinkIdx.length, sinks: ok, sinksTotal: this.sinkIdx.length, rotations: this.rotations, par: this.par, overPar: Math.max(0, this.rotations - this.par), knots: blocked, charges: this.charges };
  }

  ready() { return this.sinkIdx.every((i) => this.tiles[i].wet > 0.9); }

  private tileCenter(i: number): Vec { const c = i % this.p.cols, r = Math.floor(i / this.p.cols); return { x: this.ox + (c + 0.5) * this.cs, y: this.oy + (r + 0.5) * this.cs }; }

  hintPoint() {
    const b = this.tiles.findIndex((t) => t.blocked);
    if (b >= 0) return this.tileCenter(b);
    const i = this.tiles.findIndex((t) => t.onPath && !t.blocked && !this.solvedTile(t));
    return i >= 0 ? this.tileCenter(i) : null;
  }

  private solvedTile(t: FlowTile) { return rotMask(t.mask, t.rot) === t.mask; }

  onUp(p: PointerState, tap: boolean) {
    if (!tap) return;
    const c = Math.floor((p.x - this.ox) / this.cs), r = Math.floor((p.y - this.oy) / this.cs);
    if (c < 0 || r < 0 || c >= this.p.cols || r >= this.p.rows) return;
    const i = r * this.p.cols + c;
    const t = this.tiles[i];
    const ctr = this.tileCenter(i);
    if (this.tool === 'frog') {
      if (t.blocked && this.charges > 0) {
        t.blocked = false;
        this.charges--;
        this.env.audio.play('squish');
        this.env.fx.emit('splat', ctr.x, ctr.y, 10, { color: '#7E5A34', size: 8, speed: 160, gravity: 300 });
        this.env.reward(ctr.x, ctr.y - 40, 60, 'Knot cleared!');
        if (!this.tiles.some((q) => q.blocked)) this.tool = 'rotate';
        this.recompute(true);
      } else if (this.charges > 0) {
        this.charges--;
        this.env.mistake(ctr.x, ctr.y, 'Wasted frog splash!', 0.6);
      }
      this.env.refreshTools();
      return;
    }
    if (t.kind !== 'pipe') return;
    if (t.blocked) { this.env.toast('A root knot jams this channel — use the frog!', 'warn'); this.env.audio.play('creak'); return; }
    t.rot = (t.rot + 1) % 4;
    t.spin = 1;
    this.rotations++;
    this.env.audio.play('rotate', { pitch: 0.9 + Math.random() * 0.25 });
    this.recompute(true);
  }

  update(dt: number) {
    this.autoCd -= dt;
    // wetness travels along the flow tree for a satisfying "rush"
    const order = this.tiles.map((_, i) => i).sort((a, b) => this.depth(a) - this.depth(b));
    for (const i of order) {
      const t = this.tiles[i];
      t.spin = Math.max(0, t.spin - dt * 7);
      const connected = t.colors !== 0;
      const src = t.kind === 'source';
      const parentWet = src ? 1 : this.parent[i] >= 0 ? this.tiles[this.parent[i]].wet : 0;
      if (connected && parentWet > 0.6) t.wet = Math.min(1, t.wet + dt * 7);
      else t.wet = Math.max(0, t.wet - dt * 5);
    }
    this.env.audio.setLoop('flow', Math.min(1, this.tiles.filter((t) => t.wet > 0.5).length / 30));
    if (this.wave >= 0) {
      this.wave += dt * 900;
      const { H } = this.env;
      for (let k = 0; k < 6; k++) this.env.fx.emit('foam', this.wave + (Math.random() - 0.5) * 60, Math.random() * H, 1, { size: 16, speed: 80, dir: 0, spread: 1, max: 0.9 });
      if (this.wave > this.env.W + 200) this.wave = -1;
    }
  }

  private depth(i: number): number {
    let d = 0, n = i;
    while (this.parent[n] >= 0 && d < 200) { n = this.parent[n]; d++; }
    return d;
  }

  onComplete() {
    const { W, H } = this.env;
    if (this.p.theme === 'wave') { this.wave = 0; this.env.audio.play('splash', { pitch: 0.6 }); this.env.shake(0.5); }
    for (const i of this.sinkIdx) {
      const c = this.tileCenter(i);
      const col = this.mixColor(this.tiles[i].need);
      this.env.fx.emit(this.p.theme === 'pond' ? 'confetti' : 'star', c.x, c.y, 24, { color: this.p.theme === 'pond' ? '#F1B6B8' : col, size: 12, speed: 260, gravity: 120 });
    }
    void W; void H;
  }

  private mixColor(mask: number) {
    let r = 0, g = 0, b = 0, n = 0;
    this.p.colors.forEach((c, i) => {
      if (!(mask & (1 << i))) return;
      const v = parseInt(c.slice(1), 16);
      r += (v >> 16) & 255; g += (v >> 8) & 255; b += v & 255; n++;
    });
    if (!n) return '#5A4632';
    if (n > 1) { r = r / n; g = g / n; b = b / n; } // mixing
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    const cs = this.cs;
    g.save();
    g.fillStyle = 'rgba(22,14,8,0.32)';
    roundRect(g, this.ox - 12, this.oy - 12, cs * this.p.cols + 24, cs * this.p.rows + 24, 18); g.fill();
    this.tiles.forEach((tile, i) => {
      const { x, y } = this.tileCenter(i);
      g.save();
      g.translate(x, y);
      g.strokeStyle = 'rgba(246,239,227,0.08)'; g.lineWidth = 2;
      g.strokeRect(-cs / 2, -cs / 2, cs, cs);
      if (tile.kind === 'empty') { g.restore(); return; }
      const ang = (tile.rot - tile.spin) * (Math.PI / 2);
      g.rotate(tile.kind === 'pipe' ? ang : 0);
      const m = tile.mask;
      const chan = cs * 0.34;
      // carved channel
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(25,14,6,0.88)'; g.lineWidth = chan;
      this.drawMask(g, m, cs);
      g.strokeStyle = 'rgba(232,210,170,0.3)'; g.lineWidth = chan + 8; g.globalCompositeOperation = 'destination-over';
      this.drawMask(g, m, cs);
      g.globalCompositeOperation = 'source-over';
      if (tile.wet > 0.02 && tile.colors) {
        g.strokeStyle = this.mixColor(tile.colors);
        g.globalAlpha = tile.wet;
        g.lineWidth = chan * 0.62 * tile.wet;
        this.drawMask(g, m, cs);
        // shimmer
        g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 3; g.setLineDash([6, 14]); g.lineDashOffset = -t * 60;
        this.drawMask(g, m, cs);
        g.setLineDash([]);
        g.globalAlpha = 1;
      }
      g.restore();
      if (tile.blocked) {
        drawCritter(g, x, y, cs * 0.3, 'crumb', { t, seed: i, mood: 'grump', hat: 'none' });
        g.strokeStyle = '#6E9E4A'; g.lineWidth = 6;
        g.beginPath(); g.arc(x, y, cs * 0.38, 0.3, 2.6); g.stroke();
      }
    });
    g.restore();
  }

  private drawMask(g: CanvasRenderingContext2D, m: number, cs: number) {
    g.beginPath();
    for (let d = 0; d < 4; d++) if (m & (1 << d)) { g.moveTo(0, 0); g.lineTo(DX[d] * cs / 2, DY[d] * cs / 2); }
    g.stroke();
    if (m) { g.beginPath(); g.arc(0, 0, g.lineWidth / 2, 0, TAU); g.fillStyle = g.strokeStyle as string; g.fill(); }
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    const cs = this.cs;
    this.tiles.forEach((tile, i) => {
      const { x, y } = this.tileCenter(i);
      if (tile.kind === 'source') {
        const col = this.p.colors[tile.color];
        g.fillStyle = col;
        g.beginPath(); g.arc(x, y, cs * 0.36, 0, TAU); g.fill();
        g.strokeStyle = '#F6EFE3'; g.lineWidth = 5; g.stroke();
        for (let k = 0; k < 3; k++) {
          const ph = (t * 1.5 + k / 3) % 1;
          g.strokeStyle = col; g.globalAlpha = 1 - ph; g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, cs * (0.36 + ph * 0.3), 0, TAU); g.stroke();
        }
        g.globalAlpha = 1;
      } else if (tile.kind === 'sink') {
        const ok = tile.colors === tile.need;
        const lit = ok ? tile.wet : 0;
        const need = this.mixColor(tile.need);
        if (this.p.theme === 'stars' || this.p.theme === 'pigment') {
          if (lit > 0) { g.fillStyle = `rgba(255,240,170,${0.35 * lit})`; g.beginPath(); g.arc(x, y, cs * (0.7 + Math.sin(t * 4) * 0.05), 0, TAU); g.fill(); }
          drawStarShape(g, x, y, cs * 0.42, ok ? need : 'rgba(40,30,20,0.85)', this.p.theme === 'stars' ? 8 : 5);
          g.strokeStyle = need; g.lineWidth = 4;
          g.beginPath(); g.arc(x, y, cs * 0.46, 0, TAU); g.stroke();
          if (tile.colors && !ok) { g.fillStyle = '#E86F5A'; g.font = `900 ${cs * 0.3}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✕', x, y); }
        } else if (this.p.theme === 'pond') {
          const bloom = lit;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU + t * 0.2;
            g.fillStyle = bloom > 0.5 ? '#F1B6B8' : '#6E9E4A';
            g.beginPath(); g.ellipse(x + Math.cos(a) * cs * 0.2 * (0.4 + bloom), y + Math.sin(a) * cs * 0.2 * (0.4 + bloom), cs * 0.16, cs * 0.08, a, 0, TAU); g.fill();
          }
          g.fillStyle = bloom > 0.5 ? '#F7D774' : '#4E7A3A'; g.beginPath(); g.arc(x, y, cs * 0.1, 0, TAU); g.fill();
          if (bloom > 0.5) drawFrog(g, x + cs * 0.3, y + cs * 0.35, cs * 0.25, { t, seed: i, state: 'cheer' });
        } else {
          // wave theme: a grime dam that bursts when the water arrives
          if (lit < 0.9) drawCritter(g, x, y, cs * 0.36, 'soot', { t, seed: i, mood: 'grump', hat: 'beret' });
          else { g.fillStyle = 'rgba(244,241,230,0.9)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + Math.cos(k + t * 3) * cs * 0.25, y + Math.sin(k * 2 + t * 3) * cs * 0.25, cs * 0.12, 0, TAU); g.fill(); } }
          g.strokeStyle = need; g.lineWidth = 4; g.beginPath(); g.arc(x, y, cs * 0.46, 0, TAU); g.stroke();
        }
      }
    });
    if (this.p.blockers) drawFrog(g, this.ox - 10, this.oy + cs * this.p.rows + 50, 40, { t, seed: 2, state: this.tool === 'frog' ? 'hop' : 'idle', tool: 'tongue' });
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay() {
    if (this.autoCd > 0) return;
    this.autoCd = 0.12;
    const b = this.tiles.findIndex((t) => t.blocked);
    if (b >= 0) {
      if (this.tool !== 'frog') { this.selectTool('frog'); return; }
      const c = this.tileCenter(b); this.fake.tap(c.x, c.y); return;
    }
    if (this.tool !== 'rotate') { this.selectTool('rotate'); return; }
    const i = this.tiles.findIndex((t) => t.onPath && !this.solvedTile(t));
    if (i >= 0) { const c = this.tileCenter(i); this.fake.tap(c.x, c.y); }
  }
}
