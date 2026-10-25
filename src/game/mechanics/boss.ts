import { drawCritter, drawWorker, roundRect } from '../../art/characters';
import { GRIME } from '../../art/textures';
import type { PointerState } from '../../core/input';
import { TAU, clamp, damp, dist, pointInPolygon, type Vec } from '../../core/math';
import { DirtGrid } from '../dirtgrid';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface BossParams {
  type: 'boss';
  pustules: number;
  pustuleHp: number;
  minions: number;
  /** slime coverage (0..1 of the play area) that ends the attempt */
  maxSlime: number;
  ink: number;
}

interface Pustule { a: number; d: number; hp: number }
interface Minion { x: number; y: number; vx: number; vy: number; seed: number; alive: boolean; t: number }

/**
 * Boss (stage 24 "Slime Rebellion"): a three-phase fight that recombines earlier skills —
 * pop pustules while dodging its armoured moments, mop the slime trail while splatting
 * minions, then lasso the shrunken Slime King into a jar. Real fail state: slime coverage.
 */
export class BossMechanic extends Mechanic {
  private grid!: DirtGrid;
  private phase = 0;
  private boss = { x: 0, y: 0, vx: 0, vy: 0, r: 120, tx: 0, ty: 0, armor: 0, armorTimer: 3, stun: 0, hurt: 0, jar: 0 };
  private pustules: Pustule[] = [];
  private minions: Minion[] = [];
  private crew: { x: number; y: number; tx: number; ty: number; seed: number; slimed: number }[] = [];
  private spawned = 0;
  private spawnTimer = 0;
  private path: Vec[] = [];
  private inkUsed = 0;
  private ptr = { x: -999, y: -999, down: false };
  private phaseIntro = 0;
  private fake = new FakePointer(this);
  private autoCd = 0;
  private autoA = 0;
  private peakSlime = 0;

  constructor(readonly p: BossParams) { super(); }

  init() {
    const { W, H } = this.env;
    this.grid = new DirtGrid(W, H, { ...GRIME.slime, seed: 24 }, 100);
    this.grid.initialTotal = 1;
    this.boss.x = this.boss.tx = W / 2;
    this.boss.y = this.boss.ty = H * 0.4;
    for (let i = 0; i < this.p.pustules; i++) this.pustules.push({ a: (i / this.p.pustules) * TAU + 0.3, d: 0.62, hp: this.p.pustuleHp });
    for (let i = 0; i < 3; i++) this.crew.push({ x: 150 + i * 340, y: H - 80, tx: 150 + i * 340, ty: H - 80, seed: i + 2, slimed: 0 });
    // the King arrives already oozing
    for (let i = 0; i < 6; i++) this.grid.add(W * (0.25 + Math.random() * 0.5), H * (0.25 + Math.random() * 0.4), 90, 0.9);
    this.tool = 'pop';
    this.phaseIntro = 2;
  }

  private slime() { return this.grid.total() / (this.grid.gw * this.grid.gh); }

  tools(): ToolDef[] {
    const t: Record<number, ToolDef> = {
      0: { id: 'pop', label: 'Pop pustules', icon: 'hand', active: true },
      1: { id: 'mop', label: 'Mop & splat', icon: 'sponge', active: true },
      2: { id: 'lasso', label: 'Jar lasso', icon: 'lasso', active: true },
      3: { id: 'done', label: 'Bottled!', icon: 'star', active: true },
    };
    return [t[this.phase]];
  }

  progressLabel() { return ['Phase 1 · Pop the pustules', 'Phase 2 · Mop the ooze', 'Phase 3 · Bottle the King', 'Slime King bottled'][this.phase]; }

  metrics() {
    const popped = this.pustules.filter((q) => q.hp <= 0).length;
    let sub = 0;
    if (this.phase === 0) sub = popped / this.pustules.length;
    else if (this.phase === 1) sub = clamp((this.p.minions - this.minions.filter((m) => m.alive).length - (this.p.minions - this.spawned)) / this.p.minions * 0.5 + clamp(1 - this.slime() / 0.08) * 0.5);
    else if (this.phase === 2) sub = 0.5;
    return { progress: Math.min(1, (this.phase + sub) / 3), phasesDone: this.phase, slime: this.slime(), peakSlime: this.peakSlime, popped };
  }

  ready() { return this.boss.jar > 1.2; }

  hintPoint() {
    if (this.phase === 0) { const q = this.pustules.find((x) => x.hp > 0); return q ? this.pustulePos(q) : null; }
    if (this.phase === 1) { const m = this.minions.find((x) => x.alive); return m ?? this.grid.nearestDirty(this.env.W / 2, this.env.H / 2, 0.1); }
    return { x: this.boss.x, y: this.boss.y };
  }

  private pustulePos(q: Pustule): Vec {
    const b = this.boss;
    const a = q.a + Math.sin(this.env.time() * 0.8) * 0.1;
    return { x: b.x + Math.cos(a) * b.r * q.d, y: b.y + Math.sin(a) * b.r * q.d * 0.85 };
  }

  // ------------------------------------------------------------------ input
  onDown(p: PointerState) {
    this.ptr = { x: p.x, y: p.y, down: true };
    if (this.phase === 0) this.tapPustule(p.x, p.y);
    if (this.phase === 1) this.splat(p.x, p.y);
    if (this.phase === 2) { this.path = [{ x: p.x, y: p.y }]; this.inkUsed = 0; }
  }
  onHover(p: PointerState) { this.ptr.x = p.x; this.ptr.y = p.y; }
  onMove(p: PointerState) {
    this.ptr.x = p.x; this.ptr.y = p.y;
    if (this.phase === 1) {
      const r = this.grid.stroke(p.px, p.py, p.x, p.y, 70, 0.35);
      if (r.removed > 0.1 && Math.random() < 0.4) this.env.fx.emit('bubble', p.x, p.y, 1, { size: 6, speed: 40 });
      this.env.audio.setLoop('scrub', Math.min(1, r.removed * 0.05 + 0.2));
      for (const m of this.minions) if (m.alive && dist(m.x, m.y, p.x, p.y) < 60) this.killMinion(m);
    }
    if (this.phase === 2 && this.path.length) {
      const last = this.path[this.path.length - 1];
      const d = dist(last.x, last.y, p.x, p.y);
      if (d > 8 && this.inkUsed + d <= this.p.ink) { this.path.push({ x: p.x, y: p.y }); this.inkUsed += d; }
      if (this.path.length > 12 && dist(p.x, p.y, this.path[0].x, this.path[0].y) < 45) this.closeLasso();
    }
  }
  onUp() {
    this.ptr.down = false;
    this.env.audio.setLoop('scrub', 0);
    if (this.phase === 2 && this.path.length > 8) this.closeLasso();
    this.path = [];
  }

  private tapPustule(x: number, y: number) {
    const b = this.boss;
    if (dist(x, y, b.x, b.y) > b.r * 1.3) return;
    if (b.armor > 0) {
      this.env.mistake(x, y, 'Spiky! Wait for it…');
      const q = this.pustules.find((p) => p.hp > 0 && p.hp < this.p.pustuleHp);
      if (q) q.hp++;
      return;
    }
    let best: Pustule | null = null, bd = 70;
    for (const q of this.pustules) { if (q.hp <= 0) continue; const pp = this.pustulePos(q); const d = dist(pp.x, pp.y, x, y); if (d < bd) { bd = d; best = q; } }
    if (!best) { this.env.audio.play('boing', { pitch: 0.5, vol: 0.5 }); b.hurt = 0.3; return; }
    best.hp--;
    b.hurt = 0.4;
    const pp = this.pustulePos(best);
    this.env.audio.play('squish', { pitch: 1.4 - best.hp * 0.15 });
    this.env.fx.emit('splat', pp.x, pp.y, 6, { color: '#B8E86A', size: 7, speed: 160, gravity: 300 });
    if (best.hp <= 0) {
      this.env.audio.play('pop');
      this.env.reward(pp.x, pp.y - 30, 80, 'Pop!');
      this.grid.add(pp.x, pp.y, 50, 0.5);
      if (this.pustules.every((q) => q.hp <= 0)) this.nextPhase();
    }
  }

  private splat(x: number, y: number) {
    for (const m of this.minions) if (m.alive && dist(m.x, m.y, x, y) < 60) { this.killMinion(m); return; }
  }

  private killMinion(m: Minion) {
    m.alive = false;
    this.env.audio.play('squish', { pitch: 1.6 });
    this.env.fx.emit('splat', m.x, m.y, 8, { color: '#7DB33E', size: 6, speed: 140, gravity: 300 });
    this.env.reward(m.x, m.y - 30, 30);
  }

  private closeLasso() {
    const poly = this.path.slice();
    this.path = [];
    this.ptr.down = false;
    const b = this.boss;
    const crewIn = this.crew.some((c) => pointInPolygon(c.x, c.y - 30, poly));
    if (crewIn) { this.env.mistake(b.x, b.y, 'Not the crew!'); this.env.audio.play('snap'); return; }
    // the whole body must be inside the loop
    let inside = pointInPolygon(b.x, b.y, poly);
    for (let k = 0; k < 8 && inside; k++) { const a = (k / 8) * TAU; inside = pointInPolygon(b.x + Math.cos(a) * b.r * 0.7, b.y + Math.sin(a) * b.r * 0.7, poly); }
    if (!inside) { this.env.audio.play('whoosh', { vol: 0.5 }); this.env.toast('Loop the whole King!', 'info'); return; }
    this.phase = 3;
    b.jar = 0.001;
    this.env.audio.play('pop', { pitch: 0.6 });
    this.env.audio.play('fanfare');
    this.env.shake(0.5);
    this.env.refreshTools();
  }

  private nextPhase() {
    this.phase++;
    this.phaseIntro = 2;
    const b = this.boss;
    if (this.phase === 1) { b.stun = 999; b.tx = this.env.W / 2; b.ty = this.env.H * 0.35; this.env.toast('Phase 2: mop the ooze & splat the minions!', 'warn'); }
    if (this.phase === 2) { b.stun = 0; b.r = 72; this.env.toast('Phase 3: he’s shrunk — lasso him into the jar!', 'warn'); }
    this.env.audio.play('chime', { pitch: 0.8 });
    this.env.refreshTools();
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    const { W, H } = this.env;
    const b = this.boss;
    const t = this.env.time();
    this.autoCd -= dt;
    this.phaseIntro = Math.max(0, this.phaseIntro - dt);
    b.hurt = Math.max(0, b.hurt - dt);
    this.peakSlime = Math.max(this.peakSlime, this.slime());
    if (this.phase === 3) { b.jar += dt; b.x = damp(b.x, W - 140, 4, dt); b.y = damp(b.y, H - 150, 4, dt); b.r = damp(b.r, 30, 3, dt); return; }
    // movement
    const speed = this.phase === 2 ? 260 : this.phase === 1 ? 0 : 70;
    if (dist(b.x, b.y, b.tx, b.ty) < 30 || Math.random() < dt * (this.phase === 2 ? 1.2 : 0.3)) {
      b.tx = 160 + Math.random() * (W - 320); b.ty = 180 + Math.random() * (H - 460);
    }
    if (speed > 0) {
      const d = dist(b.x, b.y, b.tx, b.ty) || 1;
      b.vx = damp(b.vx, ((b.tx - b.x) / d) * speed, 2, dt);
      b.vy = damp(b.vy, ((b.ty - b.y) / d) * speed, 2, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      this.grid.add(b.x, b.y + b.r * 0.7, b.r * 0.6, (this.phase === 2 ? 0.5 : 0.35) * dt * 3);
    }
    if (this.phase === 0) {
      b.armorTimer -= dt;
      if (b.armorTimer <= 0) {
        if (b.armor > 0) { b.armor = 0; b.armorTimer = 2.6 + Math.random() * 1.6; }
        else { b.armor = 1; b.armorTimer = 1.5; this.env.audio.play('zap', { pitch: 0.6 }); }
      }
    }
    if (this.phase === 1) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.spawned < this.p.minions) {
        const src = this.grid.nearestDirty(Math.random() * W, Math.random() * H * 0.6, 0.3) ?? { x: b.x, y: b.y + b.r };
        this.minions.push({ x: src.x, y: src.y, vx: 0, vy: 0, seed: this.spawned * 13, alive: true, t: 0 });
        this.spawned++;
        this.spawnTimer = 1.1;
        this.env.audio.play('giggle', { vol: 0.5 });
      }
      for (const m of this.minions) {
        if (!m.alive) continue;
        m.t += dt;
        const target = this.crew.reduce((best, c) => (dist(c.x, c.y, m.x, m.y) < dist(best.x, best.y, m.x, m.y) ? c : best), this.crew[0]);
        const d = dist(m.x, m.y, target.x, target.y - 20) || 1;
        m.vx = damp(m.vx, ((target.x - m.x) / d) * 85, 3, dt);
        m.vy = damp(m.vy, ((target.y - 20 - m.y) / d) * 85, 3, dt);
        m.x += m.vx * dt; m.y += m.vy * dt;
        this.grid.add(m.x, m.y, 26, 0.25 * dt);
        if (d < 40) {
          m.alive = false;
          target.slimed = 2;
          this.env.mistake(target.x, target.y - 40, 'Crew slimed!');
          this.grid.add(target.x, target.y - 20, 80, 0.8);
        }
      }
      const minionsDone = this.spawned >= this.p.minions && this.minions.every((m) => !m.alive);
      if (minionsDone && this.slime() < 0.08) this.nextPhase();
    }
    for (const c of this.crew) {
      c.slimed = Math.max(0, c.slimed - dt);
      if (dist(c.x, c.y, c.tx, c.ty) < 10 || Math.random() < dt * 0.3) { c.tx = 100 + Math.random() * (W - 200); c.ty = H - 60 - Math.random() * 120; }
      const d = dist(c.x, c.y, c.tx, c.ty) || 1;
      c.x += ((c.tx - c.x) / d) * Math.min(d, 60 * dt); c.y += ((c.ty - c.y) / d) * Math.min(d, 60 * dt);
    }
    void t;
  }

  onComplete() { this.grid.clearAll(); }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) { this.grid.render(g); }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    const b = this.boss;
    const { W, H } = this.env;
    for (const c of this.crew) drawWorker(g, c.x, c.y, 36, { t, seed: c.seed, state: c.slimed > 0 ? 'dizzy' : 'walk', tool: 'sponge', facing: c.tx > c.x ? 1 : -1, overalls: c.slimed > 0 ? '#7DB33E' : undefined });
    for (const m of this.minions) if (m.alive) drawCritter(g, m.x, m.y, 22, 'slime', { t: m.t, seed: m.seed, mood: 'giggle' });
    // the Slime King
    g.save();
    if (b.armor > 0) {
      g.strokeStyle = 'rgba(180,90,220,0.8)'; g.lineWidth = 8;
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * TAU + t;
        g.beginPath(); g.moveTo(b.x + Math.cos(a) * b.r * 0.95, b.y + Math.sin(a) * b.r * 0.95); g.lineTo(b.x + Math.cos(a) * b.r * 1.3, b.y + Math.sin(a) * b.r * 1.3); g.stroke();
      }
    }
    const wob = b.hurt > 0 ? 1 + Math.sin(t * 40) * 0.08 : 1;
    drawCritter(g, b.x, b.y, b.r * wob, 'slime', { t, seed: 5, mood: this.phase >= 3 ? 'surrender' : this.phase === 1 ? 'sleepy' : b.hurt > 0 ? 'panic' : this.phase === 2 ? 'surprised' : 'angry', hat: 'crown', lookX: clamp((this.ptr.x - b.x) / 300, -1, 1), lookY: clamp((this.ptr.y - b.y) / 300, -1, 1) });
    if (this.phase === 0) for (const q of this.pustules) {
      if (q.hp <= 0) continue;
      const pp = this.pustulePos(q);
      const s = 14 + q.hp * 5 + Math.sin(t * 6 + q.a) * 2;
      g.fillStyle = '#E8F7A0'; g.beginPath(); g.arc(pp.x, pp.y, s, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(pp.x - s * 0.3, pp.y - s * 0.3, s * 0.3, 0, TAU); g.fill();
    }
    if (this.phase === 1) { g.fillStyle = '#F6EFE3'; g.font = '900 36px "Fraunces Variable", serif'; g.fillText('z', b.x + b.r * 0.7, b.y - b.r - Math.sin(t * 2) * 10); }
    g.restore();
    if (this.phase >= 2) {
      // the jar waits in the corner
      const jx = W - 140, jy = H - 150;
      g.fillStyle = 'rgba(200,230,240,0.35)'; roundRect(g, jx - 80, jy - 90, 160, 180, 40); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#B07A44'; roundRect(g, jx - 70, jy - 110, 140, 26, 10); g.fill();
    }
    if (this.path.length > 1) {
      g.strokeStyle = '#E8C46A'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([16, 10]); g.lineDashOffset = -t * 60;
      g.beginPath(); this.path.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke(); g.setLineDash([]);
      const e = this.path[this.path.length - 1];
      const ink = 1 - this.inkUsed / this.p.ink;
      g.strokeStyle = ink < 0.25 ? '#E86F5A' : '#F6EFE3'; g.lineWidth = 6;
      g.beginPath(); g.arc(e.x, e.y, 26, -Math.PI / 2, -Math.PI / 2 + ink * TAU); g.stroke();
    }
    // slime meter
    const k = clamp(this.slime() / this.p.maxSlime);
    g.fillStyle = 'rgba(22,15,11,0.65)'; roundRect(g, W / 2 - 160, 16, 320, 30, 15); g.fill();
    g.fillStyle = k > 0.7 ? '#E86F5A' : '#7DB33E'; roundRect(g, W / 2 - 156, 20, 312 * k, 22, 11); g.fill();
    g.fillStyle = '#F6EFE3'; g.font = '900 16px "Nunito Variable", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SLIME LEVEL', W / 2, 31);
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay(dt: number) {
    const f = this.fake;
    const b = this.boss;
    if (this.phase === 0) {
      if (this.autoCd > 0 || b.armor > 0 || b.armorTimer < 0.35) return;
      const q = this.pustules.find((x) => x.hp > 0);
      if (q) { const pp = this.pustulePos(q); f.tap(pp.x, pp.y); this.autoCd = 0.18; }
      return;
    }
    if (this.phase === 1) {
      const m = this.minions.find((x) => x.alive);
      const tgt = m ?? this.grid.nearestDirty(f.s.x || this.env.W / 2, f.s.y || this.env.H / 2, 0.02);
      if (!tgt) { if (f.s.down) f.up(); return; }
      if (!f.s.down) f.down(tgt.x, tgt.y);
      this.autoA += dt * 16;
      f.move(tgt.x + Math.cos(this.autoA) * 30, tgt.y + Math.sin(this.autoA) * 30, dt);
      return;
    }
    if (this.phase === 2) {
      if (!f.s.down) { this.autoA = 0; f.down(b.x + b.r * 1.5, b.y); return; }
      this.autoA += dt * 9;
      f.move(b.x + Math.cos(this.autoA) * b.r * 1.5, b.y + Math.sin(this.autoA) * b.r * 1.5, dt);
      if (this.autoA > TAU + 0.5 && f.s.down) f.up();
    }
  }
}
