import { drawCritter, drawStarShape, roundRect } from '../../art/characters';
import { drawFragileZone, drawHiddenObject, drawSponge, drawBrushTool, type HiddenIcon } from '../../art/props';
import { GRIME } from '../../art/textures';
import type { PointerState } from '../../core/input';
import { TAU, clamp, damp, segDist } from '../../core/math';
import { Walker } from '../agents';
import { DirtGrid, type Patch } from '../dirtgrid';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface ScrubParams {
  type: 'scrub';
  mode: 'wipe' | 'polish' | 'steer' | 'precision';
  grime: keyof typeof GRIME;
  coverage?: number;
  /** normalized patches: x,y in 0..1 of W/H, r in 0..1 of W */
  patches?: Patch[];
  brush: number;
  strength: number;
  thickness?: number;
  helpers?: number;
  critters?: number;
  fragile?: Patch[];
  hazards?: { pts: [number, number][]; r: number }[];
  hidden?: { id: string; label: string; x: number; y: number; icon: HiddenIcon }[];
  clipCircle?: { x: number; y: number; r: number };
  wearLimit?: number;
  shine?: { x: number; y: number; r: number };
}

interface SootSprite { x: number; y: number; home: boolean; vx: number; vy: number; seed: number; jump: number; gone: boolean; r: number }
interface Decal { x: number; y: number; r: number; a: number; kind: 'thin' | 'streak'; x2?: number; y2?: number; life: number }

/**
 * Scrub family: wipe (stage 1), circular polish (7), inertial steer-vacuum (13) and precision
 * brush with hidden-object discovery (25). One authoritative DirtGrid drives visuals + progress.
 */
export class ScrubMechanic extends Mechanic {
  grid!: DirtGrid;
  private helpers: Walker[] = [];
  private sprites: SootSprite[] = [];
  private decals: Decal[] = [];
  private fragile: { x: number; y: number; r: number; hot: number }[] = [];
  private hazards: { pts: { x: number; y: number }[]; r: number; hot: number }[] = [];
  private hidden: { id: string; label: string; x: number; y: number; icon: HiddenIcon; found: boolean; revealed: boolean; pulse: number }[] = [];
  private clip: { x: number; y: number; r: number } | null = null;
  private cursor = { x: -999, y: -999, on: false, squish: 0 };
  private intensity = 0;
  private mistakeCooldown = 0;
  private warnCooldown = 0;
  private turn = 0;
  private lastAngle: number | null = null;
  private circ = 0;
  private sub = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, on: false };
  private evicted = 0;
  private streaks = 0;
  private fake = new FakePointer(this);
  private autoT = 0;
  private autoTarget: { x: number; y: number } | null = null;
  private shineLevel = 0;

  constructor(readonly p: ScrubParams) { super(); }

  init() {
    const { W, H, rng } = this.env;
    const p = this.p;
    this.grid = new DirtGrid(W, H, { ...GRIME[p.grime], seed: this.env.stage.seed }, 128);
    this.grid.thickness = p.thickness ?? 1;
    const patches = p.patches?.map((q) => ({ x: q.x * W, y: q.y * H, r: q.r * W, s: q.s }));
    this.grid.fill(rng, { coverage: p.coverage ?? 1, patches });
    if (p.clipCircle) {
      this.clip = { x: p.clipCircle.x * W, y: p.clipCircle.y * H, r: p.clipCircle.r * W };
      const c = this.clip;
      for (let j = 0; j < this.grid.gh; j++) for (let i = 0; i < this.grid.gw; i++) {
        const x = (i + 0.5) * this.grid.cw, y = (j + 0.5) * this.grid.ch;
        if (Math.hypot(x - c.x, y - c.y) > c.r * 0.97) this.grid.dirt[j * this.grid.gw + i] = 0;
      }
    }
    this.fragile = (p.fragile ?? []).map((f) => ({ x: f.x * W, y: f.y * H, r: f.r * W, hot: 0 }));
    for (const f of this.fragile) this.grid.forCells(f.x, f.y, f.r, (idx) => { this.grid.dirt[idx] = 0; });
    this.hazards = (p.hazards ?? []).map((h) => ({ pts: h.pts.map(([x, y]) => ({ x: x * W, y: y * H })), r: h.r * W, hot: 0 }));
    this.hidden = (p.hidden ?? []).map((h) => ({ ...h, x: h.x * W, y: h.y * H, found: false, revealed: false, pulse: 0 }));
    for (const h of this.hidden) this.grid.add(h.x, h.y, 70, 1); // every secret starts buried
    this.grid.initialTotal = this.grid.total();
    this.grid.markDirty();
    for (let i = 0; i < (p.helpers ?? 0); i++) {
      const w = new Walker(i % 2 ? W - 70 : 70, H - 50 - i * 30, 44, 'sponge', 95);
      this.helpers.push(w);
    }
    for (let i = 0; i < (p.critters ?? 0); i++) {
      const spot = this.randomDirtySpot();
      if (spot) this.sprites.push({ ...spot, home: true, vx: 0, vy: 0, seed: i * 7 + 3, jump: 0, gone: false, r: 32 + rng.next() * 8 });
    }
    this.sub.x = this.sub.tx = W / 2;
    this.sub.y = this.sub.ty = H * 0.85;
    this.tool = p.mode === 'precision' ? 'brush' : p.mode === 'polish' ? 'cloth' : p.mode === 'steer' ? 'vac' : 'sponge';
  }

  private randomDirtySpot() {
    const { rng, W, H } = this.env;
    for (let k = 0; k < 200; k++) {
      const x = 80 + rng.next() * (W - 160), y = 80 + rng.next() * (H - 160);
      if (this.grid.at(x, y) > 0.7 && !this.fragile.some((f) => Math.hypot(f.x - x, f.y - y) < f.r + 40)) return { x, y };
    }
    return null;
  }

  tools(): ToolDef[] {
    const label = { wipe: 'Sponge', polish: 'Buff cloth', steer: 'Algae sub', precision: 'Fine brush' }[this.p.mode];
    const icon = { wipe: 'sponge', polish: 'cloth', steer: 'sub', precision: 'brush' }[this.p.mode];
    return [{ id: this.tool, label, icon, active: true }];
  }

  progressLabel() {
    return this.p.mode === 'polish' ? 'Polished' : this.p.mode === 'steer' ? 'Algae cleared' : 'Cleaned';
  }

  metrics() {
    const clean = this.grid.cleanFraction();
    const found = this.hidden.filter((h) => h.found).length;
    const target = this.env.stage.objectives.find((o) => o.metric === 'clean')?.target ?? 0.9;
    let progress = clamp(clean / target);
    if (this.hidden.length) progress = progress * 0.6 + (found / this.hidden.length) * 0.4;
    return { progress, clean, evicted: this.evicted, found, hiddenTotal: this.hidden.length, streaks: this.streaks };
  }

  hintPoint() {
    const unfound = this.hidden.find((h) => h.revealed && !h.found);
    if (unfound) return unfound;
    return this.grid.nearestDirty(this.env.W / 2, this.env.H / 2, 0.2);
  }

  // ------------------------------------------------------------------ input
  onDown(p: PointerState) {
    this.cursor.on = true;
    this.cursor.x = p.x; this.cursor.y = p.y;
    this.lastAngle = null;
    if (this.p.mode === 'steer') { this.sub.on = true; this.sub.tx = p.x; this.sub.ty = p.y; this.env.audio.play('boing', { pitch: 0.7 }); }
  }

  onHover(p: PointerState) { this.cursor.x = p.x; this.cursor.y = p.y; }

  onMove(p: PointerState) {
    this.cursor.x = p.x; this.cursor.y = p.y;
    if (this.p.mode === 'steer') { this.sub.tx = p.x; this.sub.ty = p.y; return; }
    const dx = p.x - p.px, dy = p.y - p.py;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    let amount = this.p.strength;
    if (this.p.mode === 'polish') {
      if (len > 1.5) {
        const a = Math.atan2(dy, dx);
        if (this.lastAngle !== null) {
          let da = a - this.lastAngle;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          this.turn = this.turn * 0.86 + (da / len) * 0.14;
        }
        this.lastAngle = a;
      }
      this.circ = clamp(Math.abs(this.turn) * 70);
      amount *= 0.08 + 0.92 * this.circ;
    }
    const speed = Math.hypot(p.vx, p.vy);
    this.cursor.squish = clamp(speed / 2500);
    const r = this.p.brush;
    // fragile zones: brushing inside is an accident
    for (const f of this.fragile) {
      if (segDist(f.x, f.y, p.px, p.py, p.x, p.y).d < f.r) {
        f.hot = 1;
        if (this.mistakeCooldown <= 0) { this.env.mistake(p.x, p.y, 'Fragile!'); this.mistakeCooldown = 0.9; }
        return;
      }
    }
    const res = this.grid.stroke(p.px, p.py, p.x, p.y, r, amount, (x, y, removed) => {
      if (removed > 0.15 && Math.random() < 0.5) {
        const c = GRIME[this.p.grime];
        this.env.fx.emit('dust', x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, 1, { color: c.base, size: 7, speed: 40, max: 0.6 });
        if (this.p.mode !== 'precision' && Math.random() < 0.4) this.env.fx.emit('bubble', x, y, 1, { size: 6, speed: 30, max: 0.9 });
      }
    });
    this.intensity = Math.min(1, this.intensity + res.removed * 0.02 + 0.04);
    // over-scrubbing clean paint wears it thin → a botch
    if (res.over > 0 && this.p.wearLimit) {
      const idx = Math.floor(p.y / this.grid.ch) * this.grid.gw + Math.floor(p.x / this.grid.cw);
      const w = this.grid.wear[idx] ?? 0;
      if (w > this.p.wearLimit * 0.6 && this.warnCooldown <= 0) {
        this.env.fx.emit('sparkle', p.x, p.y, 2, { color: '#FFF6DA', size: 7, speed: 60 });
        this.env.audio.play('tap', { pitch: 2.2, vol: 0.5 });
        this.warnCooldown = 0.35;
      }
      if (w > this.p.wearLimit && this.mistakeCooldown <= 0) {
        this.env.mistake(p.x, p.y, 'Too much scrubbing!');
        this.decals.push({ x: p.x, y: p.y, r: r * 0.9, a: 1, kind: 'thin', life: 8 });
        this.grid.forCells(p.x, p.y, r * 1.6, (i) => { this.grid.wear[i] = 0; });
        this.mistakeCooldown = 1.2;
      }
    }
    if (this.p.mode === 'polish' && this.circ < 0.12 && speed > 1600 && this.mistakeCooldown <= 0) {
      this.streaks++;
      this.decals.push({ x: p.px, y: p.py, x2: p.x + dx * 4, y2: p.y + dy * 4, r: 3, a: 1, kind: 'streak', life: 6 });
      this.env.mistake(p.x, p.y, 'Streaky! Go in circles');
      this.mistakeCooldown = 1.4;
    }
  }

  onUp(p: PointerState, tap: boolean) {
    this.cursor.on = false;
    this.sub.on = false;
    if (tap) {
      for (const h of this.hidden) {
        if (!h.found && h.revealed && Math.hypot(h.x - p.x, h.y - p.y) < 60) {
          h.found = true;
          this.env.audio.play('chime');
          this.env.fx.emit('sparkle', h.x, h.y, 14, { color: '#FFE9A8', size: 9, speed: 140 });
          this.env.fx.emit('ring', h.x, h.y, 1, { color: '#E8C46A', size: 30, max: 0.7 });
          this.env.reward(h.x, h.y - 40, 150, `Found: ${h.label}`);
          return;
        }
      }
      for (const s of this.sprites) if (s.home && Math.hypot(s.x - p.x, s.y - p.y) < s.r * 1.4) {
        s.jump = 1;
        this.env.audio.play('giggle');
      }
    }
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    const { W, H } = this.env;
    this.mistakeCooldown -= dt;
    this.warnCooldown -= dt;
    this.intensity = damp(this.intensity, 0, 5, dt);
    this.cursor.squish = damp(this.cursor.squish, 0, 6, dt);
    this.circ = damp(this.circ, 0, 1.5, dt);
    if (this.p.wearLimit) this.grid.relax(dt, 0.35);
    for (const f of this.fragile) f.hot = Math.max(0, f.hot - dt * 2);
    for (const h of this.hazards) h.hot = Math.max(0, h.hot - dt * 2);
    this.env.audio.setLoop(this.p.mode === 'steer' ? 'vacuum' : 'scrub', this.p.mode === 'steer' ? (this.sub.on ? 0.8 : 0) : this.intensity);

    if (this.p.mode === 'steer') this.updateSub(dt);

    // helpers walk to grime and scrub it for real
    for (const w of this.helpers) {
      w.update(dt);
      if (!w.busy) {
        const target = this.grid.nearestDirty(w.x + (Math.random() - 0.5) * 300, w.y + (Math.random() - 0.5) * 300, 0.25);
        if (target) {
          w.goTo(clamp(target.x, 40, W - 40), clamp(target.y + 20, 60, H - 20), () => w.work(1.4));
        } else if (w.state !== 'cheer') w.state = 'cheer';
      }
      if (w.state === 'work') {
        this.grid.brush(w.x + w.facing * 18, w.y - 20, 26, 0.9 * dt);
        if (Math.random() < 0.15) this.env.fx.emit('bubble', w.x + w.facing * 18, w.y - 25, 1, { size: 4, speed: 25 });
      }
    }

    // soot sprites get evicted as their home is cleaned
    for (const s of this.sprites) {
      if (s.gone) continue;
      s.jump = Math.max(0, s.jump - dt * 3);
      if (s.home && this.grid.regionDirt(s.x, s.y, 30) < 0.22) {
        s.home = false;
        const ex = s.x < W / 2 ? -80 : W + 80;
        const d = Math.hypot(ex - s.x, (H * 0.5 - s.y) * 0.2) || 1;
        s.vx = ((ex - s.x) / d) * 320;
        s.vy = -260;
        this.evicted++;
        this.env.audio.play('boing', { pitch: 1 + Math.random() * 0.4 });
        this.env.reward(s.x, s.y - 30, 50, 'Evicted!');
      }
      if (!s.home) {
        s.vy += 900 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y > H - 30 && s.vy > 0) { s.vy *= -0.45; s.y = H - 30; }
        if (s.x < -60 || s.x > W + 60) s.gone = true;
      }
    }

    // hidden objects become tappable once uncovered
    for (const h of this.hidden) {
      if (!h.revealed && this.grid.regionDirt(h.x, h.y, 40) < 0.12) {
        h.revealed = true;
        this.env.audio.play('sparkle');
        this.env.fx.emit('sparkle', h.x, h.y, 8, { color: '#FFF3C4', size: 6, speed: 80 });
      }
      h.pulse += dt;
    }

    for (const d of this.decals) d.life -= dt;
    this.decals = this.decals.filter((d) => d.life > 0);

    if (this.p.shine) {
      const s = this.p.shine;
      const target = 1 - this.grid.regionDirt(s.x * W, s.y * H, s.r * W);
      if (target > this.shineLevel + 0.05) this.env.fx.emit('sparkle', s.x * W + (Math.random() - 0.5) * s.r * W, s.y * H + (Math.random() - 0.5) * s.r * W, 1, { color: '#ffffff', size: 8, speed: 20 });
      this.shineLevel = damp(this.shineLevel, target, 3, dt);
    }
  }

  private updateSub(dt: number) {
    const s = this.sub;
    const ax = (s.tx - s.x) * 6, ay = (s.ty - s.y) * 6;
    s.vx = (s.vx + ax * dt) * Math.exp(-2.6 * dt);
    s.vy = (s.vy + ay * dt) * Math.exp(-2.6 * dt);
    s.x = clamp(s.x + s.vx * dt, 20, this.env.W - 20);
    s.y = clamp(s.y + s.vy * dt, 20, this.env.H - 20);
    if (s.on) {
      const nx = s.x, ny = s.y + 34;
      const res = this.grid.brush(nx, ny, this.p.brush, this.p.strength * dt * 9);
      if (res.removed > 0.05) {
        this.env.fx.emit('bubble', nx + (Math.random() - 0.5) * 40, ny, 1, { size: 5, speed: 60, dir: -Math.PI / 2, spread: 1 });
        this.env.fx.emit('dust', nx, ny, 1, { color: GRIME[this.p.grime].light, size: 6, speed: 30, max: 0.5 });
      }
      for (const h of this.hazards) {
        for (let i = 0; i < h.pts.length - 1; i++) {
          const a = h.pts[i], b = h.pts[i + 1];
          const sd = segDist(nx, ny, a.x, a.y, b.x, b.y);
          if (sd.d < h.r + this.p.brush * 0.35) {
            h.hot = 1;
            if (this.mistakeCooldown <= 0) {
              this.env.mistake(nx, ny, 'Mind the roots!');
              this.mistakeCooldown = 1.4;
              const ang = Math.atan2(ny - (a.y + (b.y - a.y) * sd.t), nx - (a.x + (b.x - a.x) * sd.t));
              s.vx += Math.cos(ang) * 500; s.vy += Math.sin(ang) * 500;
            }
          }
        }
      }
    }
  }

  onComplete() {
    // sweep away leftover specks with a sparkle wave
    const { W, H } = this.env;
    for (let i = 0; i < 26; i++) this.env.fx.emit('sparkle', Math.random() * W, Math.random() * H, 1, { color: '#FFF3C4', size: 10, speed: 40 });
    this.grid.clearAll();
    for (const w of this.helpers) { w.path = []; w.state = 'cheer'; }
  }

  // ------------------------------------------------------------------ rendering
  renderBelow(g: CanvasRenderingContext2D) {
    const { W, H } = this.env;
    const t = this.env.time();
    for (const h of this.hidden) drawHiddenObject(g, h.icon, h.x, h.y, 46, t);
    for (const d of this.decals) {
      g.globalAlpha = Math.min(1, d.life / 2);
      if (d.kind === 'thin') {
        const gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        gr.addColorStop(0, 'rgba(255,248,225,0.6)');
        gr.addColorStop(1, 'rgba(255,248,225,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(d.x, d.y, d.r, 0, TAU); g.fill();
      } else {
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x2!, d.y2!); g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (this.p.shine && this.shineLevel > 0.02) {
      const s = this.p.shine;
      const x = s.x * W, y = s.y * H, r = s.r * W;
      const k = this.shineLevel;
      const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, 0, x, y, r * 1.6);
      gr.addColorStop(0, `rgba(255,255,255,${0.75 * k})`);
      gr.addColorStop(0.3, `rgba(235,245,255,${0.25 * k})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r * 1.6, 0, TAU); g.fill();
      drawStarShape(g, x - r * 0.25, y - r * 0.3, r * 0.35 * k * (1 + Math.sin(t * 5) * 0.15), `rgba(255,255,255,${0.9 * k})`, 4);
    }
    if (this.clip) {
      g.save();
      g.beginPath();
      g.arc(this.clip.x, this.clip.y, this.clip.r, 0, TAU);
      g.clip();
      this.grid.render(g);
      // convex glass sheen
      const c = this.clip;
      const gr = g.createRadialGradient(c.x - c.r * 0.35, c.y - c.r * 0.4, c.r * 0.05, c.x, c.y, c.r);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = gr;
      g.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      g.restore();
    } else {
      this.grid.render(g);
    }
    if (this.p.mode === 'steer') {
      // underwater light: tint + caustic ripples
      g.save();
      g.fillStyle = 'rgba(40,90,140,0.18)';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(180,230,255,0.07)';
      g.lineWidth = 10;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        for (let x = 0; x <= W; x += 40) {
          const y = (i / 7) * H + Math.sin(x / 90 + t * 1.3 + i) * 22 + Math.sin(x / 41 - t * 0.9) * 8;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.restore();
    }
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    for (const f of this.fragile) drawFragileZone(g, f.x, f.y, f.r, t, f.hot);
    for (const h of this.hazards) this.drawRoot(g, h, t);
    for (const h of this.hidden) {
      if (h.found) {
        g.strokeStyle = '#E8C46A'; g.lineWidth = 4;
        g.beginPath(); g.arc(h.x, h.y, 42, 0, TAU); g.stroke();
        drawStarShape(g, h.x + 34, h.y - 34, 12, '#E8C46A');
      } else if (h.revealed) {
        const k = 0.5 + Math.sin(h.pulse * 5) * 0.5;
        g.strokeStyle = `rgba(255,243,196,${0.4 + k * 0.5})`; g.lineWidth = 3;
        g.setLineDash([8, 6]);
        g.beginPath(); g.arc(h.x, h.y, 44 + k * 6, 0, TAU); g.stroke();
        g.setLineDash([]);
      }
    }
    for (const s of this.sprites) {
      if (s.gone) continue;
      const sq = s.home ? 1 + Math.sin(t * 5 + s.seed) * 0.06 - s.jump * 0.25 : 0.85;
      const look = s.home ? { lookX: clamp((this.cursor.x - s.x) / 200, -1, 1), lookY: clamp((this.cursor.y - s.y) / 200, -1, 1) } : {};
      drawCritter(g, s.x, s.y - s.jump * 20, s.r, 'soot', { t, seed: s.seed, squash: sq, mood: s.home ? (s.jump > 0.2 ? 'surprised' : undefined) : 'panic', ...look });
    }
    for (const w of this.helpers) w.draw(g, t);
    if (this.p.mode === 'steer') this.drawSub(g, t);
    else if (this.cursor.x > -500 && !this.snapshotting) this.drawCursor(g, t);
  }

  private drawRoot(g: CanvasRenderingContext2D, h: { pts: { x: number; y: number }[]; r: number; hot: number }, t: number) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = h.hot > 0 ? `rgba(232,111,90,${0.5 + h.hot * 0.5})` : 'rgba(126,90,52,0.9)';
    g.lineWidth = h.r * 1.2;
    g.beginPath();
    h.pts.forEach((p, i) => (i ? g.lineTo(p.x + Math.sin(t * 1.5 + i) * 3, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
    g.strokeStyle = 'rgba(214,180,120,0.75)';
    g.lineWidth = h.r * 0.4;
    g.stroke();
    // little leaf at the end + warning tag
    const end = h.pts[0];
    g.fillStyle = '#6E9E4A';
    g.beginPath(); g.ellipse(end.x, end.y, h.r * 2.2, h.r * 1.3, 0.4, 0, TAU); g.fill();
    g.restore();
  }

  private drawSub(g: CanvasRenderingContext2D, t: number) {
    const s = this.sub;
    const r = 34;
    g.save();
    g.translate(s.x, s.y);
    g.rotate(clamp(s.vx / 900, -0.4, 0.4));
    if (s.on) {
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 2 + i / 3) % 1;
        g.globalAlpha = 1 - ph;
        g.beginPath(); g.arc(0, 34, this.p.brush * (1 - ph * 0.6), 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(10,30,50,0.25)'; g.beginPath(); g.ellipse(6, r + 18, r * 1.1, r * 0.3, 0, 0, TAU); g.fill();
    g.fillStyle = '#F2B630';
    g.beginPath(); g.ellipse(0, 0, r * 1.3, r * 0.9, 0, 0, TAU); g.fill();
    g.fillStyle = '#E86F5A'; g.fillRect(-r * 1.6, -r * 0.3, r * 0.4, r * 0.6);
    g.fillStyle = '#BFE6F2'; g.beginPath(); g.arc(r * 0.3, -r * 0.2, r * 0.45, 0, TAU); g.fill();
    g.fillStyle = '#F2C9A0'; g.beginPath(); g.arc(r * 0.3, -r * 0.15, r * 0.25, 0, TAU); g.fill();
    g.fillStyle = '#1E120B'; g.beginPath(); g.arc(r * 0.38, -r * 0.18, r * 0.06, 0, TAU); g.fill();
    g.strokeStyle = '#5A6266'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(0, r * 0.7); g.lineTo(0, r * 1.05); g.stroke();
    g.fillStyle = '#2A1A12'; roundRect(g, -r * 0.6, r * 0.95, r * 1.2, r * 0.25, 6); g.fill();
    const prop = Math.sin(t * 40) * r * 0.3;
    g.fillStyle = '#5A6266'; g.beginPath(); g.ellipse(-r * 1.65, 0, 4, Math.abs(prop) + 3, 0, 0, TAU); g.fill();
    g.restore();
  }

  private drawCursor(g: CanvasRenderingContext2D, t: number) {
    const { x, y, on } = this.cursor;
    const r = this.p.brush;
    g.save();
    g.strokeStyle = on ? 'rgba(255,248,225,0.9)' : 'rgba(255,248,225,0.5)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    if (this.p.mode === 'polish') {
      g.strokeStyle = this.circ > 0.5 ? '#9BE3C4' : '#E8C46A';
      g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.arc(x, y, r + 10, -Math.PI / 2, -Math.PI / 2 + this.circ * TAU); g.stroke();
    }
    g.restore();
    if (this.p.mode === 'precision') drawBrushTool(g, x + 6, y - 6, 54, -0.6 + Math.sin(t * 20) * (on ? 0.1 : 0));
    else if (this.p.mode === 'polish') this.drawCloth(g, x, y, t, on);
    else drawSponge(g, x, y, 56, this.cursor.squish, -0.3 + (on ? Math.sin(t * 25) * 0.08 : 0));
  }

  private drawCloth(g: CanvasRenderingContext2D, x: number, y: number, t: number, on: boolean) {
    g.save();
    g.translate(x, y);
    g.rotate(on ? t * 3 : 0.2);
    g.fillStyle = 'rgba(20,10,5,0.2)';
    g.beginPath(); g.ellipse(5, 8, 40, 30, 0, 0, TAU); g.fill();
    g.fillStyle = '#F6EFE3';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const rr = 36 + Math.sin(i * 2.3) * 6;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8);
    }
    g.closePath(); g.fill();
    g.strokeStyle = '#C9A04E'; g.lineWidth = 3; g.stroke();
    g.restore();
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay(dt: number) {
    this.autoT += dt;
    const f = this.fake;
    if (this.p.mode === 'precision' || this.hidden.length) {
      const h = this.hidden.find((q) => q.revealed && !q.found);
      if (h && !f.s.down) { f.tap(h.x, h.y); return; }
    }
    if (!this.autoTarget || this.grid.regionDirt(this.autoTarget.x, this.autoTarget.y, this.p.brush) < 0.05) {
      if (f.s.down && this.p.mode !== 'steer') f.up(false);
      this.autoTarget = this.grid.nearestDirty(f.s.x || this.env.W / 2, f.s.y || this.env.H / 2, 0.02);
      if (!this.autoTarget) {
        const h = this.hidden.find((q) => !q.found);
        if (h) this.autoTarget = { x: h.x, y: h.y };
        else return;
      }
    }
    const tg = this.autoTarget;
    if (!f.s.down) f.down(tg.x, tg.y);
    if (this.p.mode === 'steer') { f.move(tg.x, tg.y - 34, dt); return; }
    const rr = this.p.mode === 'polish' ? 45 : 25;
    const a = this.autoT * (this.p.mode === 'polish' ? 7 : 18);
    f.move(tg.x + Math.cos(a) * rr, tg.y + Math.sin(a) * rr, dt);
  }
}
