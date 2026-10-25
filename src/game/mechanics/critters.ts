import { drawCritter, drawGrimeHut, drawWorker, roundRect, type CritterKind, type Mood } from '../../art/characters';
import { drawBrushTool, drawFragileZone, drawNozzle } from '../../art/props';
import { GRIME } from '../../art/textures';
import type { PointerState } from '../../core/input';
import { TAU, clamp, damp, dist, pointInPolygon, segDist, type Vec } from '../../core/math';
import { DirtGrid, type Patch } from '../dirtgrid';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface CrittersParams {
  type: 'critters';
  tool: 'vacuum' | 'brush' | 'spray' | 'lasso';
  kind: CritterKind;
  count: number;
  innocents?: number;
  innocentStyle?: 'worker' | 'angel';
  huts?: number;
  grime?: { grime: keyof typeof GRIME; patches: Patch[] };
  fragile?: Patch[];
  speed: number;
  /** normalized circle critters live inside (stage 2's brown spot) */
  region?: Patch;
  /** spawn critters in waves (counts); default all at once */
  waves?: number[];
  /** lasso ink budget per loop (logical units) */
  ink?: number;
}

type CState = 'wander' | 'sucked' | 'flying' | 'caught' | 'gone' | 'hidden';
interface Critter {
  x: number; y: number; vx: number; vy: number; tx: number; ty: number;
  r: number; seed: number; state: CState; mood: Mood; innocent: boolean;
  t: number; spin: number; hut: number; scale: number; dizzy: number;
}
interface Shot { x: number; y: number; sx: number; sy: number; tx: number; ty: number; t: number; dur: number }

/**
 * Critter family — vacuum a germ village (2), flick dust invaders off armour (5), foam-blast
 * grime riding the Great Wave (10), lasso naughty Bosch creatures (22). Innocent crew/creatures
 * share the space, so precision matters.
 */
export class CrittersMechanic extends Mechanic {
  private list: Critter[] = [];
  private grid: DirtGrid | null = null;
  private huts: { x: number; y: number; s: number; alive: boolean; fade: number }[] = [];
  private fragile: { x: number; y: number; r: number; hot: number }[] = [];
  private region: { x: number; y: number; r: number } | null = null;
  private ptr = { x: -999, y: -999, down: false, vx: 0, vy: 0 };
  private caught = 0;
  private bonusCatch = 0;
  private cooldown = 0;
  private waveIdx = 0;
  private waveTimer = 0;
  private spawned = 0;
  private path: Vec[] = [];
  private inkUsed = 0;
  private shots: Shot[] = [];
  private tank = 1;
  private fireTimer = 0;
  private cannon = { x: 0, y: 0, a: -Math.PI / 2 };
  private jar = { x: 0, y: 0, wobble: 0 };
  private fake = new FakePointer(this);
  private autoTimer = 0;
  private autoPhase = 0;
  private autoTarget: Critter | null = null;
  private autoR = 80;
  private autoLoop = 0;
  private brushTrail: { x: number; y: number; life: number }[] = [];

  constructor(readonly p: CrittersParams) { super(); }

  init() {
    const { W, H, rng } = this.env;
    const p = this.p;
    if (p.region) this.region = { x: p.region.x * W, y: p.region.y * H, r: p.region.r * W };
    this.fragile = (p.fragile ?? []).map((f) => ({ x: f.x * W, y: f.y * H, r: f.r * W, hot: 0 }));
    if (p.grime) {
      this.grid = new DirtGrid(W, H, { ...GRIME[p.grime.grime], seed: this.env.stage.seed }, 112);
      this.grid.fill(rng, { patches: p.grime.patches.map((q) => ({ x: q.x * W, y: q.y * H, r: q.r * W, s: q.s })) });
      for (const f of this.fragile) this.grid.forCells(f.x, f.y, f.r, (i) => { this.grid!.dirt[i] = 0; });
      this.grid.initialTotal = this.grid.total();
    }
    for (let i = 0; i < (p.huts ?? 0); i++) {
      const a = (i / (p.huts ?? 1)) * TAU + rng.next() * 0.5;
      const c = this.region ?? { x: W / 2, y: H / 2, r: Math.min(W, H) * 0.35 };
      const rr = c.r * (0.35 + rng.next() * 0.4);
      const hx = c.x + Math.cos(a) * rr, hy = c.y + Math.sin(a) * rr * 0.8;
      this.huts.push({ x: hx, y: hy, s: 46 + rng.next() * 12, alive: true, fade: 1 });
      this.grid?.add(hx, hy - 20, 75, 1);
    }
    if (this.grid) this.grid.initialTotal = this.grid.total();
    const first = p.waves ? p.waves[0] : p.count;
    for (let i = 0; i < first; i++) this.spawn(false, i);
    for (let i = 0; i < (p.innocents ?? 0); i++) this.spawn(true, i);
    this.cannon = { x: W / 2, y: H - 30, a: -Math.PI / 2 };
    this.jar = { x: 70, y: H - 70, wobble: 0 };
    this.tool = p.tool;
  }

  private spawnPoint(): Vec {
    const { W, H, rng } = this.env;
    for (let k = 0; k < 60; k++) {
      let x: number, y: number;
      if (this.region) {
        const a = rng.next() * TAU, r = Math.sqrt(rng.next()) * this.region.r * 0.85;
        x = this.region.x + Math.cos(a) * r; y = this.region.y + Math.sin(a) * r;
      } else { x = 80 + rng.next() * (W - 160); y = 90 + rng.next() * (H - 220); }
      if (!this.fragile.some((f) => dist(f.x, f.y, x, y) < f.r + 30)) return { x, y };
    }
    return { x: W / 2, y: H / 2 };
  }

  private spawn(innocent: boolean, i: number) {
    const pt = this.spawnPoint();
    const { rng } = this.env;
    const hut = !innocent && this.huts.length ? i % this.huts.length : -1;
    const c: Critter = {
      x: pt.x, y: pt.y, vx: 0, vy: 0, tx: pt.x, ty: pt.y,
      r: innocent ? 26 : 30 + rng.next() * 10, seed: Math.floor(rng.next() * 1000), state: 'wander',
      mood: innocent ? 'happy' : (['grump', 'giggle', 'sneak', 'sleepy'] as Mood[])[i % 4],
      innocent, t: rng.next() * 3, spin: 0, hut, scale: 1, dizzy: 0,
    };
    if (hut >= 0 && i < this.huts.length * 2 && this.p.tool === 'vacuum') {
      // half the residents are at home inside their grime huts
      if (i % 2 === 1) { c.state = 'hidden'; c.x = this.huts[hut].x; c.y = this.huts[hut].y; }
    }
    if (!innocent) this.spawned++;
    this.list.push(c);
  }

  tools(): ToolDef[] {
    const map = { vacuum: ['Germ vac', 'vacuum'], brush: ['Dust brush', 'brush'], spray: ['Foam cannon', 'foam'], lasso: ['Lasso net', 'lasso'] } as const;
    const [label, ic] = map[this.p.tool];
    return [{ id: this.p.tool, label, icon: ic, active: true, badge: this.p.tool === 'spray' ? `${Math.round(this.tank * 100)}%` : undefined }];
  }

  progressLabel() { return { vacuum: 'Germs vacuumed', brush: 'Dust swept', spray: 'Grime blasted', lasso: 'Rounded up' }[this.p.tool]; }

  metrics() {
    const clean = this.grid ? this.grid.cleanFraction() : 1;
    const capT = this.p.count;
    const cap = Math.min(this.caught, capT);
    const cleanTarget = this.env.stage.objectives.find((o) => o.metric === 'clean')?.target ?? 0;
    const progress = this.grid && cleanTarget > 0 ? (cap / capT) * 0.6 + clamp(clean / cleanTarget) * 0.4 : cap / capT;
    return { progress, caught: this.caught, clean, multi: this.bonusCatch, remaining: this.list.filter((c) => !c.innocent && (c.state === 'wander' || c.state === 'hidden')).length };
  }

  hintPoint() {
    const c = this.list.find((q) => !q.innocent && q.state === 'wander');
    if (c) return c;
    const h = this.huts.find((q) => q.alive);
    if (h) return h;
    return this.grid?.nearestDirty(this.env.W / 2, this.env.H / 2, 0.2) ?? null;
  }

  // ------------------------------------------------------------------ input
  onDown(p: PointerState) {
    this.ptr = { x: p.x, y: p.y, down: true, vx: 0, vy: 0 };
    if (this.p.tool === 'lasso') { this.path = [{ x: p.x, y: p.y }]; this.inkUsed = 0; }
    if (this.p.tool === 'vacuum') this.env.audio.play('suck', { vol: 0.5 });
    if (this.p.tool === 'spray') this.fireTimer = 0;
  }
  onHover(p: PointerState) { this.ptr.x = p.x; this.ptr.y = p.y; }
  onMove(p: PointerState) {
    this.ptr.x = p.x; this.ptr.y = p.y; this.ptr.vx = p.vx; this.ptr.vy = p.vy;
    if (this.p.tool === 'lasso' && this.path.length) {
      const last = this.path[this.path.length - 1];
      const d = dist(last.x, last.y, p.x, p.y);
      if (d > 8) {
        const ink = this.p.ink ?? 2600;
        if (this.inkUsed + d <= ink) { this.path.push({ x: p.x, y: p.y }); this.inkUsed += d; }
        // auto-close when the loop meets its start
        if (this.path.length > 12 && dist(p.x, p.y, this.path[0].x, this.path[0].y) < 40) this.closeLasso();
      }
    }
    if (this.p.tool === 'brush') this.brushStroke(p);
  }
  onUp(_p: PointerState) {
    this.ptr.down = false;
    if (this.p.tool === 'lasso' && this.path.length > 6) this.closeLasso();
    this.path = [];
  }

  private brushStroke(p: PointerState) {
    const speed = Math.hypot(p.vx, p.vy);
    this.brushTrail.push({ x: p.x, y: p.y, life: 0.25 });
    const R = 46;
    for (const f of this.fragile) {
      if (segDist(f.x, f.y, p.px, p.py, p.x, p.y).d < f.r) {
        f.hot = 1;
        if (this.cooldown <= 0) { this.env.mistake(p.x, p.y, 'Fragile varnish!'); this.cooldown = 0.9; }
      }
    }
    if (this.grid) this.grid.stroke(p.px, p.py, p.x, p.y, R, 0.18);
    for (const c of this.list) {
      if (c.state !== 'wander') continue;
      if (segDist(c.x, c.y, p.px, p.py, p.x, p.y).d < c.r + R) {
        if (c.innocent) {
          if (this.cooldown <= 0) { this.env.mistake(c.x, c.y, 'Careful, crew!'); this.cooldown = 0.9; c.dizzy = 1.5; }
          continue;
        }
        const k = Math.min(1, speed / 1400);
        c.vx += p.vx * 0.9 * (0.4 + k);
        c.vy += p.vy * 0.9 * (0.4 + k);
        c.spin = (Math.random() - 0.5) * 20;
        c.state = 'flying';
        this.env.audio.play('boing', { pitch: 1.2 + Math.random() * 0.4 });
        this.env.fx.emit('dust', c.x, c.y, 6, { color: '#D4CCBC', size: 10, speed: 90 });
      }
    }
  }

  private closeLasso() {
    const poly = this.path.slice();
    this.path = [];
    this.ptr.down = false;
    if (poly.length < 6) return;
    const inside = this.list.filter((c) => c.state === 'wander' && pointInPolygon(c.x, c.y, poly));
    const bad = inside.filter((c) => c.innocent);
    const good = inside.filter((c) => !c.innocent);
    const cx = poly.reduce((s, q) => s + q.x, 0) / poly.length, cy = poly.reduce((s, q) => s + q.y, 0) / poly.length;
    if (bad.length) {
      this.env.mistake(cx, cy, 'Not the friendly ones!');
      this.env.audio.play('snap');
      for (const b of bad) b.dizzy = 1.6;
      for (const q of poly) if (Math.random() < 0.2) this.env.fx.emit('dust', q.x, q.y, 1, { color: '#E8C46A', size: 5 });
      return;
    }
    if (!good.length) { this.env.audio.play('whoosh', { vol: 0.4 }); return; }
    for (const c of good) { c.state = 'caught'; c.t = 0; }
    this.env.audio.play('pop');
    if (good.length >= 3) { this.bonusCatch++; this.env.reward(cx, cy, 100 * good.length, `${good.length}× roundup!`); }
    else this.env.reward(cx, cy, 40 * good.length);
    for (const q of poly) if (Math.random() < 0.3) this.env.fx.emit('sparkle', q.x, q.y, 1, { color: '#FFE9A8', size: 6 });
  }

  private fire(tx: number, ty: number) {
    if (this.tank < 0.08) { this.env.audio.play('click', { pitch: 0.5 }); return; }
    this.tank -= 0.08;
    const c = this.cannon;
    c.a = Math.atan2(ty - c.y, tx - c.x);
    const d = dist(c.x, c.y, tx, ty);
    this.shots.push({ x: c.x, y: c.y, sx: c.x + Math.cos(c.a) * 40, sy: c.y + Math.sin(c.a) * 40, tx, ty, t: 0, dur: 0.18 + d / 2600 });
    this.env.audio.play('splash', { pitch: 1.6, vol: 0.4 });
    this.env.fx.emit('foam', c.x + Math.cos(c.a) * 50, c.y + Math.sin(c.a) * 50, 3, { size: 8, speed: 60 });
  }

  private burst(x: number, y: number) {
    const R = 70;
    this.env.audio.play('squish', { pitch: 1.3 });
    this.env.fx.emit('foam', x, y, 14, { size: 13, speed: 160, drag: 4, max: 0.9 });
    this.env.fx.emit('bubble', x, y, 6, { size: 8, speed: 90 });
    this.grid?.brush(x, y, R, 0.7);
    for (const f of this.fragile) {
      if (dist(f.x, f.y, x, y) < f.r + R * 0.5) {
        f.hot = 1;
        this.env.mistake(x, y, 'Damaged section!');
      }
    }
    for (const c of this.list) {
      if (c.state !== 'wander') continue;
      const d = dist(c.x, c.y, x, y);
      if (d < R + c.r * 0.5) {
        if (c.innocent) { this.env.mistake(c.x, c.y, 'Foamed a friend!'); c.dizzy = 1.5; continue; }
        c.state = 'flying';
        const a = Math.atan2(c.y - y, c.x - x) || -Math.PI / 2;
        c.vx = Math.cos(a) * 500 + (Math.random() - 0.5) * 200;
        c.vy = -600;
        c.spin = (Math.random() - 0.5) * 18;
        this.caught++;
        this.env.reward(c.x, c.y - 30, 60);
      }
    }
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    const { W, H } = this.env;
    const t = this.env.time();
    this.cooldown -= dt;
    this.jar.wobble = damp(this.jar.wobble, 0, 6, dt);
    for (const f of this.fragile) f.hot = Math.max(0, f.hot - dt * 2);
    for (const b of this.brushTrail) b.life -= dt;
    this.brushTrail = this.brushTrail.filter((b) => b.life > 0);
    const vacOn = this.p.tool === 'vacuum' && this.ptr.down;
    this.env.audio.setLoop('vacuum', vacOn ? 0.9 : 0);
    this.env.audio.setLoop('spray', this.p.tool === 'spray' && this.ptr.down && this.tank > 0.08 ? 0.5 : 0);

    // waves
    if (this.p.waves && this.waveIdx < this.p.waves.length - 1) {
      const alive = this.list.filter((c) => !c.innocent && c.state === 'wander').length;
      if (alive <= 1) {
        this.waveTimer += dt;
        if (this.waveTimer > 1.2) {
          this.waveTimer = 0;
          this.waveIdx++;
          for (let i = 0; i < this.p.waves[this.waveIdx]; i++) this.spawn(false, this.spawned + i);
          this.env.toast(`Wave ${this.waveIdx + 1} of ${this.p.waves.length} incoming!`, 'warn');
          this.env.audio.play('giggle');
        }
      }
    }

    if (this.p.tool === 'spray') {
      if (!this.ptr.down) this.tank = Math.min(1, this.tank + dt * 0.45);
      this.cannon.a = Math.atan2(this.ptr.y - this.cannon.y, this.ptr.x - this.cannon.x);
      if (this.ptr.down) {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) { this.fire(this.ptr.x, this.ptr.y); this.fireTimer = 0.22; }
      }
      for (const s of this.shots) {
        s.t += dt / s.dur;
        const k = Math.min(1, s.t);
        s.x = s.sx + (s.tx - s.sx) * k;
        s.y = s.sy + (s.ty - s.sy) * k - Math.sin(k * Math.PI) * 60;
        if (Math.random() < 0.5) this.env.fx.emit('foam', s.x, s.y, 1, { size: 5, speed: 20, max: 0.4 });
        if (s.t >= 1) this.burst(s.tx, s.ty);
      }
      this.shots = this.shots.filter((s) => s.t < 1);
    }

    if (vacOn && this.grid) {
      const res = this.grid.brush(this.ptr.x, this.ptr.y + 10, 70, 1.2 * dt);
      if (res.removed > 0.02) this.env.fx.emit('dust', this.ptr.x + (Math.random() - 0.5) * 120, this.ptr.y + (Math.random() - 0.5) * 120, 1, { color: '#6E5A44', size: 8, speed: 10 });
    }

    // huts collapse when their grime is vacuumed, releasing residents
    this.huts.forEach((h, i) => {
      if (h.alive && this.grid && this.grid.regionDirt(h.x, h.y - 20, 50) < 0.25) {
        h.alive = false;
        this.env.audio.play('thud');
        this.env.fx.emit('dust', h.x, h.y - 30, 18, { color: '#4A3826', size: 14, speed: 120 });
        this.env.reward(h.x, h.y - 70, 80, 'Hut cleared!');
        for (const c of this.list) if (c.state === 'hidden' && c.hut === i) { c.state = 'wander'; c.vy = -300; c.vx = (Math.random() - 0.5) * 300; }
      }
      if (!h.alive) h.fade = Math.max(0, h.fade - dt * 1.5);
    });

    const flee = this.p.tool === 'lasso' ? 160 : this.p.tool === 'vacuum' ? 230 : 120;
    for (const c of this.list) {
      c.t += dt;
      if (c.dizzy > 0) c.dizzy -= dt;
      switch (c.state) {
        case 'hidden': {
          const h = this.huts[c.hut];
          if (!h || !h.alive) { c.state = 'wander'; }
          break;
        }
        case 'wander': {
          if (c.dizzy > 0) { c.vx *= 0.9; c.vy *= 0.9; break; }
          if (dist(c.x, c.y, c.tx, c.ty) < 20 || Math.random() < dt * 0.4) {
            const pt = this.spawnPoint();
            c.tx = pt.x; c.ty = pt.y;
          }
          let ax = c.tx - c.x, ay = c.ty - c.y;
          const al = Math.hypot(ax, ay) || 1;
          const sp = this.p.speed * (c.innocent ? 0.7 : 1);
          ax = (ax / al) * sp; ay = (ay / al) * sp;
          // naughty critters flee from the tool
          const dp = dist(c.x, c.y, this.ptr.x, this.ptr.y);
          if (!c.innocent && dp < flee && this.p.tool !== 'spray') {
            const k = (1 - dp / flee) * 2.2;
            ax += ((c.x - this.ptr.x) / (dp || 1)) * sp * k;
            ay += ((c.y - this.ptr.y) / (dp || 1)) * sp * k;
            if (c.mood !== 'scared' && Math.random() < 0.02) this.env.audio.play('giggle', { vol: 0.4 });
          }
          c.vx = damp(c.vx, ax, 4, dt);
          c.vy = damp(c.vy, ay, 4, dt);
          // vacuum suction
          if (vacOn) {
            const R = 190;
            const d = dist(c.x, c.y, this.ptr.x, this.ptr.y);
            if (d < R) {
              const pull = (1 - d / R) * 1600;
              c.vx += ((this.ptr.x - c.x) / (d || 1)) * pull * dt * 4;
              c.vy += ((this.ptr.y - c.y) / (d || 1)) * pull * dt * 4;
              if (d < 38) {
                if (c.innocent) {
                  this.env.mistake(c.x, c.y, 'Not the crew!');
                  c.dizzy = 1.8;
                  const a = Math.random() * TAU;
                  c.x = this.ptr.x + Math.cos(a) * 160; c.y = this.ptr.y + Math.sin(a) * 160;
                  c.vx = c.vy = 0;
                } else { c.state = 'sucked'; c.t = 0; }
              }
            }
          }
          c.x += c.vx * dt; c.y += c.vy * dt;
          // stay in bounds / region
          if (this.region && !c.innocent) {
            const d = dist(c.x, c.y, this.region.x, this.region.y);
            if (d > this.region.r * 1.15) { c.x = this.region.x + ((c.x - this.region.x) / d) * this.region.r * 1.15; c.y = this.region.y + ((c.y - this.region.y) / d) * this.region.r * 1.15; }
          }
          c.x = clamp(c.x, 30, W - 30); c.y = clamp(c.y, 50, H - 30);
          // dust invaders avoid fragile zones (but can still be knocked through them)
          for (const f of this.fragile) {
            const d = dist(c.x, c.y, f.x, f.y);
            if (d < f.r + c.r) { c.x = f.x + ((c.x - f.x) / (d || 1)) * (f.r + c.r); c.y = f.y + ((c.y - f.y) / (d || 1)) * (f.r + c.r); }
          }
          break;
        }
        case 'sucked': {
          c.scale = Math.max(0, c.scale - dt * 4);
          c.x = damp(c.x, this.ptr.x, 12, dt); c.y = damp(c.y, this.ptr.y, 12, dt);
          c.spin += dt * 20;
          if (c.scale <= 0) {
            c.state = 'gone';
            this.caught++;
            this.jar.wobble = 1;
            this.env.audio.play('pop', { pitch: 0.8 + Math.random() * 0.5 });
            this.env.fx.emit('dust', this.ptr.x, this.ptr.y, 5, { color: '#6E5A44', size: 8, speed: 80 });
            this.env.reward(this.ptr.x, this.ptr.y - 60, 50);
          }
          break;
        }
        case 'flying': {
          c.vy += (this.p.tool === 'spray' ? 1400 : 0) * dt;
          if (this.p.tool === 'brush') { c.vx *= Math.exp(-1.6 * dt); c.vy *= Math.exp(-1.6 * dt); }
          c.x += c.vx * dt; c.y += c.vy * dt;
          c.spin *= Math.exp(-dt);
          const out = c.x < -c.r || c.x > W + c.r || c.y < -c.r || c.y > H + c.r;
          if (out) {
            c.state = 'gone';
            if (this.p.tool === 'brush') {
              this.caught++;
              this.env.reward(clamp(c.x, 60, W - 60), clamp(c.y, 60, H - 60), 50, 'Swept!');
              this.env.audio.play('pop', { pitch: 1.3 });
            }
          } else if (this.p.tool === 'brush' && Math.hypot(c.vx, c.vy) < 60) {
            c.state = 'wander'; // not flicked hard enough — it hops back up
            this.env.audio.play('giggle', { vol: 0.5 });
          }
          break;
        }
        case 'caught': {
          // fly into the jar
          const k = Math.min(1, c.t / 0.7);
          c.x += (this.jar.x - c.x) * k * 0.2;
          c.y += (this.jar.y - c.y) * k * 0.2 - Math.sin(k * Math.PI) * 6;
          c.scale = 1 - k * 0.6;
          if (k >= 1) { c.state = 'gone'; this.caught++; this.jar.wobble = 1; this.env.audio.play('pop', { pitch: 1.1 }); }
          break;
        }
      }
    }
    void t;
  }

  onComplete() {
    for (const c of this.list) if (!c.innocent && c.state === 'wander') { c.state = 'flying'; c.vy = -500; }
    this.grid?.clearAll();
  }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) {
    if (this.region) {
      const r = this.region;
      const gr = g.createRadialGradient(r.x, r.y, r.r * 0.3, r.x, r.y, r.r * 1.3);
      gr.addColorStop(0, 'rgba(70,48,24,0.55)');
      gr.addColorStop(1, 'rgba(70,48,24,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(r.x, r.y, r.r * 1.3, 0, TAU); g.fill();
    }
    this.grid?.render(g);
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    for (const f of this.fragile) drawFragileZone(g, f.x, f.y, f.r, t, f.hot);
    for (const h of this.huts) if (h.fade > 0) drawGrimeHut(g, h.x, h.y, h.s, t, Math.round(h.x), h.fade);
    // depth sort
    const vis = this.list.filter((c) => c.state !== 'gone' && c.state !== 'hidden').sort((a, b) => a.y - b.y);
    for (const c of vis) {
      const lookX = clamp((this.ptr.x - c.x) / 250, -1, 1), lookY = clamp((this.ptr.y - c.y) / 250, -1, 1);
      if (c.innocent) {
        if (this.p.innocentStyle === 'angel') {
          g.save(); g.translate(c.x, c.y); g.rotate(c.dizzy > 0 ? Math.sin(t * 12) * 0.3 : 0);
          g.strokeStyle = 'rgba(255,240,180,0.9)'; g.lineWidth = 4;
          g.beginPath(); g.ellipse(0, -c.r * 1.25, c.r * 0.5, c.r * 0.15, 0, 0, TAU); g.stroke();
          drawCritter(g, 0, 0, c.r, 'gold', { t, seed: c.seed, mood: c.dizzy > 0 ? 'scared' : 'happy', lookX, lookY, hat: 'none' });
          g.restore();
        } else {
          drawWorker(g, c.x, c.y + c.r * 0.8, 40, {
            t, seed: c.seed, state: c.dizzy > 0 ? 'dizzy' : Math.hypot(c.vx, c.vy) > 20 ? 'walk' : 'idle',
            facing: c.vx >= 0 ? 1 : -1, tool: (['brush', 'bucket', 'sponge'] as const)[c.seed % 3], lookX, lookY,
          });
        }
        continue;
      }
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.state === 'flying' || c.state === 'sucked' ? c.spin * t : 0);
      g.scale(c.scale, c.scale);
      const scared = this.ptr.down && dist(c.x, c.y, this.ptr.x, this.ptr.y) < 200;
      drawCritter(g, 0, 0, c.r, this.p.kind, { t: c.t, seed: c.seed, mood: c.state === 'caught' ? 'surrender' : c.state === 'flying' || c.state === 'sucked' ? 'panic' : scared ? 'surprised' : c.mood, lookX, lookY });
      g.restore();
    }
    // tool visuals
    if (this.p.tool === 'lasso' || this.p.tool === 'vacuum') this.drawJar(g, t);
    if (this.snapshotting) return;
    if (this.p.tool === 'vacuum' && this.ptr.x > -500) {
      if (this.ptr.down) {
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
        g.beginPath(); g.arc(this.ptr.x, this.ptr.y, 190, 0, TAU); g.stroke();
        for (let i = 0; i < 6; i++) {
          const a = t * 3 + (i / 6) * TAU, rr = 160 - ((t * 240 + i * 40) % 140);
          g.fillStyle = 'rgba(200,180,150,0.5)';
          g.beginPath(); g.arc(this.ptr.x + Math.cos(a) * rr, this.ptr.y + Math.sin(a) * rr, 3, 0, TAU); g.fill();
        }
      }
      drawNozzle(g, this.ptr.x, this.ptr.y, 46, this.ptr.down, t);
    }
    if (this.p.tool === 'brush') {
      g.strokeStyle = 'rgba(255,248,225,0.6)'; g.lineCap = 'round';
      for (let i = 1; i < this.brushTrail.length; i++) {
        const a = this.brushTrail[i - 1], b = this.brushTrail[i];
        g.lineWidth = 40 * b.life * 4;
        g.globalAlpha = b.life * 2;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      g.globalAlpha = 1;
      if (this.ptr.x > -500) drawBrushTool(g, this.ptr.x, this.ptr.y, 70, -0.6 + clamp(this.ptr.vx / 3000, -0.5, 0.5));
    }
    if (this.p.tool === 'spray') this.drawCannon(g, t);
    if (this.p.tool === 'lasso') {
      if (this.path.length > 1) {
        g.strokeStyle = '#E8C46A'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
        g.setLineDash([16, 10]); g.lineDashOffset = -t * 60;
        g.beginPath();
        this.path.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        g.stroke();
        g.setLineDash([]);
        const s = this.path[0];
        g.fillStyle = '#E8C46A'; g.beginPath(); g.arc(s.x, s.y, 12 + Math.sin(t * 10) * 3, 0, TAU); g.fill();
        // ink meter
        const ink = 1 - this.inkUsed / (this.p.ink ?? 2600);
        const e = this.path[this.path.length - 1];
        g.strokeStyle = ink < 0.25 ? '#E86F5A' : '#F6EFE3'; g.lineWidth = 6;
        g.beginPath(); g.arc(e.x, e.y, 26, -Math.PI / 2, -Math.PI / 2 + ink * TAU); g.stroke();
      }
    }
  }

  private drawJar(g: CanvasRenderingContext2D, t: number) {
    const j = this.jar;
    g.save();
    g.translate(j.x, j.y);
    g.rotate(Math.sin(t * 20) * j.wobble * 0.15);
    g.fillStyle = 'rgba(20,10,5,0.3)'; g.beginPath(); g.ellipse(0, 50, 50, 12, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(200,230,240,0.35)';
    roundRect(g, -42, -40, 84, 92, 22); g.fill();
    const n = Math.min(this.caught, 12);
    for (let i = 0; i < n; i++) drawCritter(g, -22 + (i % 3) * 22, 36 - Math.floor(i / 3) * 18, 11, this.p.kind, { t: t + i, seed: i, mood: 'grump', legs: false });
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
    roundRect(g, -42, -40, 84, 92, 22); g.stroke();
    g.fillStyle = '#B07A44'; roundRect(g, -36, -52, 72, 16, 6); g.fill();
    g.fillStyle = '#F6EFE3'; g.font = '900 20px "Nunito Variable", system-ui'; g.textAlign = 'center';
    g.fillText(`${this.caught}/${this.p.count}`, 0, 76);
    g.restore();
  }

  private drawCannon(g: CanvasRenderingContext2D, t: number) {
    const c = this.cannon;
    for (const s of this.shots) {
      g.fillStyle = '#FFFDF5';
      g.beginPath(); g.arc(s.x, s.y, 16, 0, TAU); g.fill();
      g.fillStyle = 'rgba(160,200,230,0.8)';
      g.beginPath(); g.arc(s.x - 5, s.y - 5, 5, 0, TAU); g.fill();
    }
    if (!this.snapshotting && this.ptr.x > -500) {
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3;
      g.beginPath(); g.arc(this.ptr.x, this.ptr.y, 34 + Math.sin(t * 8) * 3, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(this.ptr.x - 48, this.ptr.y); g.lineTo(this.ptr.x - 22, this.ptr.y); g.moveTo(this.ptr.x + 22, this.ptr.y); g.lineTo(this.ptr.x + 48, this.ptr.y);
      g.moveTo(this.ptr.x, this.ptr.y - 48); g.lineTo(this.ptr.x, this.ptr.y - 22); g.moveTo(this.ptr.x, this.ptr.y + 22); g.lineTo(this.ptr.x, this.ptr.y + 48); g.stroke();
    }
    g.save();
    g.translate(c.x, c.y);
    g.fillStyle = 'rgba(10,20,40,0.3)'; g.beginPath(); g.ellipse(0, 22, 70, 16, 0, 0, TAU); g.fill();
    g.save();
    g.rotate(c.a + Math.PI / 2);
    g.fillStyle = '#3A6EA5'; roundRect(g, -18, -90, 36, 90, 12); g.fill();
    g.fillStyle = '#F6EFE3'; g.fillRect(-20, -92, 40, 12);
    g.restore();
    g.fillStyle = '#E86F5A'; g.beginPath(); g.arc(0, 0, 40, Math.PI, 0); g.fill();
    g.fillRect(-40, 0, 80, 18);
    // pressure gauge
    g.fillStyle = '#F6EFE3'; g.beginPath(); g.arc(0, 2, 20, 0, TAU); g.fill();
    g.strokeStyle = this.tank < 0.25 ? '#E86F5A' : '#2F8F8B'; g.lineWidth = 5;
    g.beginPath(); g.arc(0, 2, 14, Math.PI * 0.75, Math.PI * 0.75 + this.tank * Math.PI * 1.5); g.stroke();
    g.restore();
    drawWorker(g, c.x + 70, c.y + 26, 36, { t, seed: 9, state: this.ptr.down ? 'work' : 'idle', tool: 'hose', facing: -1 });
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay(dt: number) {
    const f = this.fake;
    this.autoTimer -= dt;
    const targets = this.list.filter((c) => !c.innocent && c.state === 'wander');
    const pickNearest = () => targets.sort((a, b) => dist(a.x, a.y, f.s.x, f.s.y) - dist(b.x, b.y, f.s.x, f.s.y))[0] ?? null;
    if (this.p.tool === 'vacuum') {
      let tgt: Vec | null = pickNearest();
      if (!tgt) {
        const hut = this.huts.find((h) => h.alive);
        tgt = hut ? { x: hut.x, y: hut.y - 20 } : this.grid?.nearestDirty(f.s.x, f.s.y, 0.05) ?? null;
      }
      if (!tgt) { if (f.s.down) f.up(); return; }
      const nearInnocent = this.list.some((c) => c.innocent && c.state === 'wander' && dist(c.x, c.y, tgt!.x, tgt!.y) < 150);
      if (!f.s.down) f.down(f.s.x || this.env.W / 2, f.s.y || this.env.H / 2);
      if (nearInnocent && targets.length > 1) { f.up(); return; }
      f.approach(tgt.x, tgt.y, 900, dt);
      return;
    }
    if (this.p.tool === 'spray') {
      const tgt = pickNearest();
      const dirty = !tgt && this.grid ? this.grid.nearestDirty(this.env.W / 2, this.env.H / 2, 0.05) : null;
      const aim = tgt ? { x: tgt.x + tgt.vx * 0.25, y: tgt.y + tgt.vy * 0.25 } : dirty;
      if (!aim) { if (f.s.down) f.up(); return; }
      if (this.fragile.some((q) => dist(q.x, q.y, aim.x, aim.y) < q.r + 50)) { if (f.s.down) f.up(); return; }
      if (!f.s.down) f.down(aim.x, aim.y); else f.move(aim.x, aim.y, dt);
      return;
    }
    if (this.p.tool === 'brush') {
      if (this.autoPhase === 0) {
        if (f.s.down) f.up();
        const tgt = pickNearest();
        if (!tgt) return;
        this.autoTarget = tgt;
        const { W, H } = this.env;
        const ex = tgt.x < W / 2 ? -1 : 1;
        const ey = tgt.y < H / 2 ? -1 : 1;
        const dx = Math.min(tgt.x, W - tgt.x) < Math.min(tgt.y, H - tgt.y) ? ex : 0;
        const dy = dx === 0 ? ey : 0;
        f.down(tgt.x - dx * 90, tgt.y - dy * 90);
        this.autoPhase = 1;
        this.autoTimer = 0.12;
        (this as unknown as { dir: Vec }).dir = { x: dx, y: dy };
      } else {
        const d = (this as unknown as { dir: Vec }).dir;
        f.move(f.s.x + d.x * 60, f.s.y + d.y * 60, 1 / 60);
        if (this.autoTimer <= 0) { f.up(); this.autoPhase = 0; }
      }
      return;
    }
    if (this.p.tool === 'lasso') {
      if (this.autoPhase === 0) {
        // most isolated target; loop radius shrinks to stay clear of the nearest friendly
        const clearance = (c: Critter) => Math.min(999, ...this.list.filter((q) => q.innocent && q.state === 'wander').map((q) => dist(q.x, q.y, c.x, c.y)));
        const tgt = targets.map((c) => ({ c, d: clearance(c) })).sort((a, b) => b.d - a.d)[0];
        if (!tgt || tgt.d < 50) return;
        this.autoTarget = tgt.c;
        this.autoR = Math.max(36, Math.min(80, tgt.d - 30));
        this.autoPhase = 1;
        this.autoLoop = 0;
        f.down(tgt.c.x + this.autoR, tgt.c.y);
      } else {
        const tgt = this.autoTarget!;
        // own accumulator: autoTimer is decremented at the top of autoplay(), which froze the loop
        this.autoLoop += dt;
        const a = Math.min(TAU + 0.6, this.autoLoop * 14);
        f.move(tgt.x + Math.cos(a) * this.autoR, tgt.y + Math.sin(a) * this.autoR, dt);
        if (a >= TAU + 0.6 || !f.s.down) { if (f.s.down) f.up(); this.autoPhase = 0; }
      }
    }
  }
}
