import { drawBoat, drawCritter, drawPigment, drawWorker } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { RNG, TAU, clamp, damp, dist } from '../../core/math';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface RunnerParams {
  type: 'runner';
  mode: 'lanes' | 'free';
  lanes?: number;
  /** course length in metres of painted water */
  length: number;
  speed: number;
  hazards: number;
  pickups: number;
  /** stranded crew to rescue (lanes mode) */
  rescues?: number;
  pickupColor?: string;
}

interface Item { kind: 'whirl' | 'rock' | 'critter' | 'crew' | 'drop' | 'knot'; d: number; lane: number; x: number; taken: boolean; phase: number }

/**
 * Runner family — steer a boat of crew across lanes of the Great Wave (11) or surf a raised
 * impasto channel through Starry Night (16). Distance, rescues, pickups and hits are all real.
 */
export class RunnerMechanic extends Mechanic {
  private items: Item[] = [];
  private dist = 0;
  private lane = 1;
  private x = 0;
  private targetX = 0;
  private tilt = 0;
  private hits = 0;
  private rescued = 0;
  private collected = 0;
  private invuln = 0;
  private dragStart: { x: number; bx: number } | null = null;
  private stopped = false;
  private fake = new FakePointer(this);
  private autoCd = 0;
  private boost = 0;
  private wakes: { x: number; y: number; life: number }[] = [];
  readonly pxPerM = 14;

  constructor(readonly p: RunnerParams) { super(); }

  private get lanes() { return this.p.lanes ?? 3; }
  private laneX(l: number) { const { W } = this.env; const m = 150; return m + (l * (W - m * 2)) / (this.lanes - 1); }
  private boatY() { return this.env.H - 190; }
  /** free-mode channel centre at distance d */
  channelX(d: number) { const { W } = this.env; return W / 2 + Math.sin(d / 38) * W * 0.22 + Math.sin(d / 13 + 1) * W * 0.06; }
  private channelHalf(d: number) { return 150 + Math.sin(d / 21) * 30 - Math.min(40, d / 40); }

  init() {
    const rng = new RNG(this.env.stage.seed * 17);
    const p = this.p;
    this.lane = Math.floor(this.lanes / 2);
    this.x = this.targetX = p.mode === 'lanes' ? this.laneX(this.lane) : this.channelX(0);
    const L = p.length;
    const place = (kind: Item['kind'], n: number) => {
      for (let i = 0; i < n; i++) {
        const d = 30 + ((i + rng.next() * 0.8) / n) * (L - 50);
        const lane = Math.floor(rng.next() * this.lanes);
        const off = (rng.next() - 0.5) * 1.4;
        this.items.push({ kind, d, lane, x: off, taken: false, phase: rng.next() * TAU });
      }
    };
    if (p.mode === 'lanes') {
      place('whirl', Math.ceil(p.hazards * 0.45));
      place('rock', Math.floor(p.hazards * 0.3));
      place('critter', Math.floor(p.hazards * 0.25));
      place('crew', p.rescues ?? 0);
      place('drop', p.pickups);
      // never block every lane at once: shuffle hazards that collide in distance
      this.items.sort((a, b) => a.d - b.d);
      for (let i = 1; i < this.items.length; i++) {
        const a = this.items[i - 1], b = this.items[i];
        if (Math.abs(a.d - b.d) < 7 && a.lane === b.lane) b.d += 9;
      }
      const hazards = this.items.filter((q) => q.kind === 'whirl' || q.kind === 'rock' || q.kind === 'critter');
      for (let i = 2; i < hazards.length; i++) {
        const set = new Set([hazards[i - 2], hazards[i - 1], hazards[i]].filter((q) => Math.abs(q.d - hazards[i].d) < 8).map((q) => q.lane));
        if (set.size >= this.lanes) hazards[i].d += 12;
      }
    } else {
      place('knot', p.hazards);
      place('drop', p.pickups);
    }
    this.items.sort((a, b) => a.d - b.d);
    this.tool = 'steer';
  }

  tools(): ToolDef[] {
    if (this.p.mode === 'lanes') return [
      { id: 'left', label: 'Left', icon: 'back' },
      { id: 'right', label: 'Right', icon: 'next' },
    ];
    return [{ id: 'steer', label: 'Surf board', icon: 'boat', active: true }];
  }

  selectTool(id: string) {
    if (id === 'left') this.shift(-1);
    else if (id === 'right') this.shift(1);
  }

  private shift(dir: number) {
    const nl = clamp(this.lane + dir, 0, this.lanes - 1);
    if (nl !== this.lane) { this.lane = nl; this.targetX = this.laneX(nl); this.env.audio.play('splash', { pitch: 1.8, vol: 0.4 }); }
  }

  progressLabel() { return 'Course completed'; }

  metrics() {
    return {
      progress: clamp(this.dist / this.p.length), distance: this.dist, hits: this.hits, rescued: this.rescued,
      collected: this.collected, rescuesTotal: this.p.rescues ?? 0, pickupsTotal: this.p.pickups,
      finished: this.dist >= this.p.length ? 1 : 0,
    };
  }

  hintPoint() {
    const next = this.items.find((q) => !q.taken && q.d > this.dist && (q.kind === 'crew' || q.kind === 'drop'));
    return next ? { x: this.itemX(next), y: this.itemY(next) } : null;
  }

  private itemX(it: Item) {
    if (this.p.mode === 'lanes') return this.laneX(it.lane) + it.x * 30;
    return this.channelX(it.d) + it.x * this.channelHalf(it.d) * 0.7;
  }
  private itemY(it: Item) { return this.boatY() - (it.d - this.dist) * this.pxPerM; }

  // ------------------------------------------------------------------ input
  onDown(p: PointerState) {
    if (this.p.mode === 'lanes') { this.dragStart = { x: p.x, bx: this.x }; return; }
    this.dragStart = { x: p.x, bx: this.targetX };
  }
  onMove(p: PointerState) {
    if (!this.dragStart) return;
    if (this.p.mode === 'free') {
      this.targetX = clamp(this.dragStart.bx + (p.x - this.dragStart.x) * 1.25, 40, this.env.W - 40);
      return;
    }
    const dx = p.x - this.dragStart.x;
    if (Math.abs(dx) > 70) { this.shift(dx > 0 ? 1 : -1); this.dragStart.x = p.x; }
  }
  onUp(p: PointerState, tap: boolean) {
    if (this.p.mode === 'lanes' && tap) this.shift(p.x < this.x ? -1 : 1);
    this.dragStart = null;
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    if (this.stopped) return;
    const W = this.env.W;
    this.invuln = Math.max(0, this.invuln - dt);
    this.boost = Math.max(0, this.boost - dt);
    const speed = this.p.speed * (1 + Math.min(0.6, this.dist / this.p.length * 0.5)) * (this.boost > 0 ? 1.15 : 1);
    this.dist = Math.min(this.p.length, this.dist + speed * dt);
    const prevX = this.x;
    this.x = damp(this.x, this.targetX, this.p.mode === 'lanes' ? 12 : 7, dt);
    this.tilt = clamp((this.x - prevX) / dt / 1600, -0.5, 0.5);
    if (this.p.mode === 'free') {
      const cx = this.channelX(this.dist), hw = this.channelHalf(this.dist);
      if (Math.abs(this.x - cx) > hw - 20 && this.invuln <= 0) {
        this.hit(this.x, this.boatY(), 'Off the brushstroke!');
        this.targetX = cx;
      }
    }
    if (Math.random() < 0.6) this.wakes.push({ x: this.x + (Math.random() - 0.5) * 40, y: this.boatY() + 40, life: 1 });
    for (const w of this.wakes) { w.life -= dt * 1.4; w.y += speed * this.pxPerM * dt; }
    this.wakes = this.wakes.filter((w) => w.life > 0);
    const by = this.boatY();
    for (const it of this.items) {
      if (it.taken) continue;
      if (Math.abs(it.d - this.dist) > 3.2) continue;
      const ix = this.itemX(it);
      const r = it.kind === 'whirl' ? 70 : it.kind === 'drop' ? 60 : it.kind === 'crew' ? 70 : 62;
      if (Math.abs(ix - this.x) < r && Math.abs(this.itemY(it) - by) < 60) {
        it.taken = true;
        if (it.kind === 'drop') {
          this.collected++;
          this.boost = 0.6;
          this.env.audio.play('coin', { pitch: 1 + (this.collected % 5) * 0.1 });
          this.env.fx.emit('splat', ix, by - 30, 6, { color: this.p.pickupColor ?? '#E9D86A', size: 7, speed: 120 });
        } else if (it.kind === 'crew') {
          this.rescued++;
          this.env.reward(ix, by - 70, 120, 'Rescued!');
          this.env.audio.play('chime');
        } else if (this.invuln <= 0) {
          this.hit(ix, by, it.kind === 'whirl' ? 'Whirlpool!' : it.kind === 'rock' ? 'Bonk!' : it.kind === 'knot' ? 'Paint knot!' : 'Grime pirate!');
        }
      }
    }
    if (this.dist >= this.p.length) {
      this.stopped = true;
      this.env.audio.play('fanfare');
    }
    void W;
  }

  private hit(x: number, y: number, label: string) {
    this.hits++;
    this.invuln = 1.2;
    this.env.mistake(x, y, label);
    this.env.audio.play('thud');
    this.env.fx.emit('foam', x, y, 12, { size: 10, speed: 160 });
  }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) {
    const { W, H } = this.env;
    const t = this.env.time();
    const scroll = this.dist * this.pxPerM;
    g.save();
    if (this.p.mode === 'lanes') {
      // swirling water channels scrolling over the print
      g.fillStyle = 'rgba(29,63,110,0.25)'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(244,241,230,0.55)'; g.lineWidth = 5; g.lineCap = 'round';
      for (let i = -2; i < 16; i++) {
        const y = ((i * 110 + scroll) % (H + 220)) - 110;
        for (let l = 0; l < this.lanes; l++) {
          const x = this.laneX(l);
          g.beginPath();
          g.arc(x + Math.sin(i + l) * 40, y, 26 + (i % 3) * 8, 0.2, Math.PI - 0.2);
          g.stroke();
        }
      }
      g.strokeStyle = 'rgba(244,241,230,0.18)'; g.lineWidth = 3; g.setLineDash([18, 22]); g.lineDashOffset = -scroll;
      for (let l = 0; l < this.lanes - 1; l++) { const x = (this.laneX(l) + this.laneX(l + 1)) / 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      g.setLineDash([]);
    } else {
      // raised impasto channel: draw the walls of a curving brushstroke
      g.fillStyle = 'rgba(15,25,60,0.38)'; g.fillRect(0, 0, W, H);
      const by = this.boatY();
      const strip = (side: number, col: string, w: number) => {
        g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
        g.beginPath();
        for (let y = -40; y <= H + 40; y += 16) {
          const d = this.dist + (by - y) / this.pxPerM;
          const x = this.channelX(d) + side * this.channelHalf(d);
          if (y === -40) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      };
      g.save();
      g.beginPath();
      for (let y = -40; y <= H + 40; y += 16) { const d = this.dist + (by - y) / this.pxPerM; const x = this.channelX(d) - this.channelHalf(d); if (y === -40) g.moveTo(x, y); else g.lineTo(x, y); }
      for (let y = H + 40; y >= -40; y -= 16) { const d = this.dist + (by - y) / this.pxPerM; g.lineTo(this.channelX(d) + this.channelHalf(d), y); }
      g.closePath();
      g.fillStyle = 'rgba(90,140,210,0.35)'; g.fill();
      g.clip();
      g.strokeStyle = 'rgba(200,225,255,0.35)'; g.lineWidth = 6;
      for (let i = 0; i < 26; i++) {
        const y = ((i * 60 + scroll * 1.0) % (H + 120)) - 60;
        const d = this.dist + (by - y) / this.pxPerM;
        const cx = this.channelX(d);
        g.beginPath(); g.moveTo(cx - 60 + Math.sin(i) * 30, y); g.quadraticCurveTo(cx, y - 30, cx + 60 + Math.cos(i) * 30, y); g.stroke();
      }
      g.restore();
      strip(-1, 'rgba(20,35,80,0.9)', 26); strip(1, 'rgba(20,35,80,0.9)', 26);
      strip(-1, 'rgba(233,216,106,0.8)', 8); strip(1, 'rgba(233,216,106,0.8)', 8);
    }
    for (const w of this.wakes) { g.fillStyle = `rgba(255,255,255,${w.life * 0.5})`; g.beginPath(); g.arc(w.x, w.y, 10 * w.life + 4, 0, TAU); g.fill(); }
    g.restore();
    void t;
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    const { H } = this.env;
    for (const it of this.items) {
      if (it.taken) continue;
      const y = this.itemY(it);
      if (y < -120 || y > H + 120) continue;
      const x = this.itemX(it);
      switch (it.kind) {
        case 'whirl':
          g.save(); g.translate(x, y); g.rotate(t * 4 + it.phase);
          for (let k = 0; k < 4; k++) { g.strokeStyle = `rgba(244,241,230,${0.9 - k * 0.2})`; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 18 + k * 14, k, k + 4); g.stroke(); }
          g.fillStyle = 'rgba(10,30,60,0.6)'; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
          g.restore();
          break;
        case 'rock':
          g.fillStyle = '#2F5E94'; g.beginPath(); g.ellipse(x, y, 56, 34, 0, 0, TAU); g.fill();
          g.fillStyle = '#F4F1E6';
          for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x - 40 + k * 20, y - 30 + Math.sin(t * 6 + k) * 4, 12, 0, TAU); g.fill(); }
          break;
        case 'critter':
          drawCritter(g, x, y, 34, 'soot', { t, seed: Math.round(it.phase * 10), mood: 'angry', hat: 'top' });
          break;
        case 'knot':
          drawCritter(g, x, y, 36, 'ink', { t, seed: Math.round(it.phase * 10), mood: 'grump' });
          break;
        case 'crew':
          g.fillStyle = '#8A5A34'; g.fillRect(x - 46, y + 6, 92, 16);
          drawWorker(g, x, y + 8, 34, { t, seed: Math.round(it.phase * 10), state: 'scared', tool: 'flag' });
          break;
        case 'drop':
          drawPigment(g, x, y + Math.sin(t * 5 + it.phase) * 6, 20, this.p.pickupColor ?? '#E9D86A', 1);
          break;
      }
    }
    const by = this.boatY();
    const blink = this.invuln > 0 && Math.floor(t * 12) % 2 === 0;
    if (!blink) {
      if (this.p.mode === 'lanes') drawBoat(g, this.x, by, 64, t, this.tilt, 2 + Math.min(3, this.rescued));
      else {
        g.save(); g.translate(this.x, by); g.rotate(this.tilt);
        g.fillStyle = '#E86F5A'; g.beginPath(); g.ellipse(0, 18, 56, 16, 0, 0, TAU); g.fill();
        g.fillStyle = '#F6EFE3'; g.fillRect(-50, 14, 100, 5);
        g.restore();
        drawWorker(g, this.x, by + 12, 44, { t, seed: 6, state: 'cheer', tool: 'none', facing: this.tilt >= 0 ? 1 : -1 });
      }
    }
    // distance ribbon
    const k = clamp(this.dist / this.p.length);
    g.fillStyle = 'rgba(22,15,11,0.6)'; g.fillRect(20, 70, 14, H - 300);
    g.fillStyle = '#E8C46A'; g.fillRect(20, 70 + (H - 300) * (1 - k), 14, (H - 300) * k);
    g.fillStyle = '#F6EFE3'; g.beginPath(); g.arc(27, 70 + (H - 300) * (1 - k), 12, 0, TAU); g.fill();
    void dist;
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay(dt: number) {
    this.autoCd -= dt;
    const look = this.items.filter((q) => !q.taken && q.d > this.dist && q.d - this.dist < 14);
    if (this.p.mode === 'lanes') {
      if (this.autoCd > 0) return;
      const danger = (l: number) => look.some((q) => (q.kind === 'whirl' || q.kind === 'rock' || q.kind === 'critter') && q.lane === l && q.d - this.dist < 9);
      const good = (l: number) => look.some((q) => (q.kind === 'crew' || q.kind === 'drop') && q.lane === l);
      let best = this.lane, bs = -Infinity;
      for (let l = 0; l < this.lanes; l++) {
        const s = (danger(l) ? -100 : 0) + (good(l) ? 10 : 0) - Math.abs(l - this.lane) * 2;
        if (s > bs) { bs = s; best = l; }
      }
      if (best !== this.lane) { this.fake.tap(best < this.lane ? this.x - 200 : this.x + 200, this.boatY()); this.autoCd = 0.12; }
      return;
    }
    // free mode: aim for channel centre, nudge toward pickups, away from knots
    const ahead = this.dist + 2.5;
    let tx = this.channelX(ahead);
    const knot = look.find((q) => q.kind === 'knot' && q.d - this.dist < 6);
    if (knot) { const kx = this.itemX(knot); tx += kx > tx ? -60 : 60; }
    const drop = look.find((q) => q.kind === 'drop' && q.d - this.dist < 8);
    if (drop && !knot) tx = this.itemX(drop);
    if (!this.fake.s.down) this.fake.down(this.targetX, this.boatY());
    const nx = this.fake.s.startX + (tx - this.dragStart!.bx) / 1.25;
    this.fake.move(nx, this.boatY(), dt);
  }
}
