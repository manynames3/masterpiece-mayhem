import { drawCritter, drawFrog, drawWorker, roundRect, type CritterKind, type WorkerTool } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { TAU, clamp, damp, dist } from '../../core/math';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface DispatchParams {
  type: 'dispatch';
  theme: 'frogs' | 'factory';
  teams: { id: string; label: string; icon: string; handles: string; size: number; color: string; tool?: WorkerTool }[];
  kinds: { id: string; label: string; critter: CritterKind; grow: number }[];
  total: number;
  initial: number;
  spawnEvery?: number;
  /** max layers per contamination (combos) */
  layers?: number;
}

interface Spot { x: number; y: number; tx: number; ty: number; layers: string[]; size: number; assigned: number; seed: number; appear: number; moving: boolean; work: number; gone: boolean; flash: number }
interface Member { team: number; x: number; y: number; hx: number; hy: number; spot: number; phase: 'home' | 'go' | 'work' | 'back'; seed: number; t: number }

/**
 * Dispatch family — pick the right specialist team for each contamination: frog crews with
 * tongue/splash/stomp skills (14) and the Bosch monster-factory with layered combos (23).
 */
export class DispatchMechanic extends Mechanic {
  private spots: Spot[] = [];
  private members: Member[] = [];
  private spawned = 0;
  private cleared = 0;
  private spawnTimer = 0;
  private peak = 0;
  private wrong = 0;
  private fake = new FakePointer(this);
  private autoCd = 0;
  private factory = { x: 0, y: 0, pulse: 0 };

  constructor(readonly p: DispatchParams) { super(); }

  init() {
    const { W, H } = this.env;
    this.factory = { x: W / 2, y: 70, pulse: 0 };
    const n = this.p.teams.length;
    this.p.teams.forEach((tm, ti) => {
      const bx = (W * (ti + 0.5)) / n;
      for (let k = 0; k < tm.size; k++) {
        const hx = bx + (k - (tm.size - 1) / 2) * 44, hy = H - 46;
        this.members.push({ team: ti, x: hx, y: hy, hx, hy, spot: -1, phase: 'home', seed: ti * 10 + k, t: 0 });
      }
    });
    for (let i = 0; i < this.p.initial; i++) this.spawnSpot(false);
    this.tool = this.p.teams[0].id;
    this.spawnTimer = this.p.spawnEvery ?? 0;
  }

  private spawnSpot(fromFactory: boolean) {
    const { W, H, rng } = this.env;
    if (this.spawned >= this.p.total) return;
    let x = 0, y = 0;
    for (let k = 0; k < 40; k++) {
      x = 100 + rng.next() * (W - 200); y = 170 + rng.next() * (H - 380);
      if (!this.spots.some((s) => !s.gone && dist(s.tx, s.ty, x, y) < 150)) break;
    }
    const nLayers = 1 + (this.p.layers && this.p.layers > 1 && rng.next() < 0.45 ? Math.floor(rng.next() * (this.p.layers - 1)) + 1 : 0);
    const layers: string[] = [];
    for (let i = 0; i < nLayers; i++) {
      let k = rng.pick(this.p.kinds).id;
      if (layers.length && layers[layers.length - 1] === k) k = this.p.kinds[(this.p.kinds.findIndex((q) => q.id === k) + 1) % this.p.kinds.length].id;
      layers.push(k);
    }
    const s: Spot = { x: fromFactory ? this.factory.x : x, y: fromFactory ? this.factory.y : y, tx: x, ty: y, layers, size: 0.7, assigned: -1, seed: Math.floor(rng.next() * 999), appear: 0, moving: fromFactory, work: 0, gone: false, flash: 0 };
    this.spots.push(s);
    this.spawned++;
    if (fromFactory) { this.factory.pulse = 1; this.env.audio.play('boing', { pitch: 0.7 }); }
  }

  tools(): ToolDef[] {
    return this.p.teams.map((tm, ti) => {
      const free = this.members.filter((m) => m.team === ti && m.phase === 'home').length;
      return { id: tm.id, label: tm.label, icon: tm.icon, active: this.tool === tm.id, badge: String(free), disabled: free === 0 && this.tool !== tm.id };
    });
  }

  progressLabel() { return 'Contamination cleared'; }

  private pressure() {
    const live = this.spots.filter((s) => !s.gone);
    return clamp(live.reduce((a, s) => a + s.size * s.layers.length, 0) / (this.p.theme === 'factory' ? 9 : 12));
  }

  metrics() {
    return { progress: this.cleared / this.p.total, cleared: this.cleared, total: this.p.total, pressure: this.pressure(), peak: this.peak, wrong: this.wrong };
  }

  hintPoint() {
    const s = this.spots.find((q) => !q.gone && !q.moving && q.assigned < 0);
    return s ? { x: s.x, y: s.y } : null;
  }

  private kind(id: string) { return this.p.kinds.find((k) => k.id === id)!; }

  onUp(p: PointerState, tap: boolean) {
    if (!tap) return;
    let best = -1, bd = 110;
    this.spots.forEach((s, i) => { if (s.gone) return; const d = dist(s.x, s.y, p.x, p.y); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    const s = this.spots[best];
    if (s.moving) { this.env.toast('Wait for it to land!', 'info'); return; }
    if (s.assigned >= 0) { this.env.toast('A team is already on it', 'info'); return; }
    const ti = this.p.teams.findIndex((t) => t.id === this.tool);
    const team = this.p.teams[ti];
    const top = s.layers[0];
    if (!team.handles.split(',').includes(top)) {
      this.wrong++;
      s.size = Math.min(2.2, s.size + 0.35);
      s.flash = 1;
      this.env.mistake(s.x, s.y, `${team.label} can’t fix ${this.kind(top).label}!`);
      return;
    }
    const m = this.members.filter((q) => q.team === ti && q.phase === 'home').sort((a, b) => dist(a.x, a.y, s.x, s.y) - dist(b.x, b.y, s.x, s.y))[0];
    if (!m) { this.env.toast(`All ${team.label} are busy`, 'warn'); this.env.audio.play('error'); return; }
    m.spot = best;
    m.phase = 'go';
    s.assigned = ti;
    this.env.audio.play(this.p.theme === 'frogs' ? 'boing' : 'tap', { pitch: 1.2 });
    this.env.refreshTools();
  }

  update(dt: number) {
    const live = this.spots.filter((s) => !s.gone);
    this.factory.pulse = Math.max(0, this.factory.pulse - dt * 2);
    if (this.p.spawnEvery) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.spawned < this.p.total) {
        this.spawnSpot(true);
        this.spawnTimer = this.p.spawnEvery * (0.8 + Math.random() * 0.4);
      }
    } else if (live.length < 2 && this.spawned < this.p.total) this.spawnSpot(false);
    for (const s of this.spots) {
      if (s.gone) continue;
      s.appear = Math.min(1, s.appear + dt * 2);
      s.flash = Math.max(0, s.flash - dt * 2);
      if (s.moving) {
        s.x = damp(s.x, s.tx, 2.5, dt); s.y = damp(s.y, s.ty, 2.5, dt);
        if (dist(s.x, s.y, s.tx, s.ty) < 6) s.moving = false;
      } else if (s.assigned < 0) {
        s.size = Math.min(2.2, s.size + this.kind(s.layers[0]).grow * dt);
      }
    }
    for (const m of this.members) {
      m.t += dt;
      const speed = this.p.theme === 'frogs' ? 330 : 280;
      if (m.phase === 'go') {
        const s = this.spots[m.spot];
        const tx = s.x + (m.seed % 2 ? 50 : -50), ty = s.y + 40;
        const d = dist(m.x, m.y, tx, ty);
        if (d < 8) { m.phase = 'work'; s.work = 0; }
        else { m.x += ((tx - m.x) / d) * Math.min(d, speed * dt); m.y += ((ty - m.y) / d) * Math.min(d, speed * dt); }
      } else if (m.phase === 'work') {
        const s = this.spots[m.spot];
        s.work += dt / 1.3;
        if (Math.random() < 0.3) this.workFx(s, m);
        if (s.work >= 1) {
          const done = s.layers.shift()!;
          s.assigned = -1;
          s.work = 0;
          this.env.audio.play('pop', { pitch: 1 + Math.random() * 0.3 });
          if (!s.layers.length) {
            s.gone = true;
            this.cleared++;
            this.env.reward(s.x, s.y - 50, 80 + Math.round((2.2 - s.size) * 40), 'Cleared!');
            this.env.fx.emit('sparkle', s.x, s.y, 12, { color: '#FFE9A8', size: 9, speed: 140 });
          } else {
            s.size = Math.max(0.7, s.size * 0.85);
            this.env.toast(`${this.kind(done).label} gone — now ${this.kind(s.layers[0]).label}!`, 'info');
          }
          m.phase = 'back';
          this.env.refreshTools();
        }
      } else if (m.phase === 'back') {
        const d = dist(m.x, m.y, m.hx, m.hy);
        if (d < 8) { m.phase = 'home'; m.spot = -1; this.env.refreshTools(); }
        else { m.x += ((m.hx - m.x) / d) * Math.min(d, speed * dt); m.y += ((m.hy - m.y) / d) * Math.min(d, speed * dt); }
      }
    }
    this.peak = Math.max(this.peak, this.pressure());
    this.autoCd -= dt;
  }

  private workFx(s: Spot, m: Member) {
    const k = s.layers[0];
    const col = { flies: '#3A3A44', algae: '#7FAE6A', crust: '#C99A5A', slime: '#B8E86A', fire: '#BFE6F2', crumbs: '#EBCB92', crack: '#EDE6D6' }[k] ?? '#ffffff';
    this.env.fx.emit(k === 'fire' ? 'foam' : k === 'algae' || k === 'slime' ? 'bubble' : 'dust', s.x + (Math.random() - 0.5) * 60, s.y + (Math.random() - 0.5) * 60, 1, { color: col, size: 8, speed: 80 });
    void m;
  }

  onComplete() { for (const m of this.members) { m.phase = 'home'; } }

  // ------------------------------------------------------------------ render
  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    if (this.p.theme === 'factory') this.drawFactory(g, t);
    // team bases
    const { W, H } = this.env;
    this.p.teams.forEach((tm, ti) => {
      const bx = (W * (ti + 0.5)) / this.p.teams.length;
      g.fillStyle = tm.color; g.globalAlpha = this.tool === tm.id ? 0.55 : 0.25;
      roundRect(g, bx - 90, H - 80, 180, 66, 22); g.fill();
      g.globalAlpha = 1;
      if (this.tool === tm.id) { g.strokeStyle = '#F6EFE3'; g.lineWidth = 4; g.stroke(); }
    });
    const live = this.spots.filter((s) => !s.gone).sort((a, b) => a.y - b.y);
    for (const s of live) this.drawSpot(g, s, t);
    for (const m of this.members) {
      const working = m.phase === 'work';
      const tm = this.p.teams[m.team];
      if (this.p.theme === 'frogs') {
        drawFrog(g, m.x, m.y, 34, { t: m.t, seed: m.seed, color: tm.color, state: m.phase === 'go' || m.phase === 'back' ? 'hop' : working ? 'work' : 'idle', tool: tm.id });
        if (working && tm.id === 'tongue') {
          const s = this.spots[m.spot];
          g.strokeStyle = '#E86F5A'; g.lineWidth = 6; g.lineCap = 'round';
          const k = Math.abs(Math.sin(m.t * 12));
          g.beginPath(); g.moveTo(m.x, m.y - 22); g.lineTo(m.x + (s.x - m.x) * k, m.y - 22 + (s.y - m.y + 22) * k); g.stroke();
        }
      } else {
        drawWorker(g, m.x, m.y, 36, { t: m.t, seed: m.seed, state: m.phase === 'go' || m.phase === 'back' ? 'walk' : working ? 'work' : 'idle', tool: tm.tool ?? 'sponge', overalls: tm.color, facing: m.phase === 'back' ? (m.hx > m.x ? 1 : -1) : 1 });
      }
    }
  }

  private drawSpot(g: CanvasRenderingContext2D, s: Spot, t: number) {
    const k = this.kind(s.layers[0]);
    const r = 34 * s.size * (0.4 + s.appear * 0.6);
    g.save();
    if (s.flash > 0) { g.fillStyle = `rgba(232,111,90,${s.flash * 0.4})`; g.beginPath(); g.arc(s.x, s.y, r * 1.8, 0, TAU); g.fill(); }
    // contamination stain under the critter
    g.fillStyle = 'rgba(30,18,8,0.28)';
    g.beginPath(); g.ellipse(s.x, s.y + r * 0.5, r * 1.5, r * 0.8, 0, 0, TAU); g.fill();
    if (s.layers[0] === 'flies') {
      for (let i = 0; i < 3 + Math.round(s.size * 2); i++) {
        const a = t * (2 + i * 0.3) + i * 2.1;
        drawCritter(g, s.x + Math.cos(a) * r * 0.9, s.y + Math.sin(a * 1.3) * r * 0.6, 14, 'fly', { t, seed: s.seed + i, mood: 'giggle' });
      }
    } else if (s.layers[0] === 'crack') {
      g.strokeStyle = 'rgba(25,14,6,0.9)'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(s.x - r * 1.4, s.y - r * 0.4); g.lineTo(s.x - r * 0.3, s.y + r * 0.2); g.lineTo(s.x + r * 0.4, s.y - r * 0.5); g.lineTo(s.x + r * 1.4, s.y + r * 0.3); g.stroke();
      drawCritter(g, s.x, s.y, r * 0.8, k.critter, { t, seed: s.seed, mood: 'sneak' });
    } else {
      drawCritter(g, s.x, s.y, r, k.critter, { t, seed: s.seed, mood: s.assigned >= 0 ? 'scared' : undefined });
    }
    // upcoming layers as little badges
    s.layers.slice(1).forEach((id, i) => {
      const kk = this.kind(id);
      drawCritter(g, s.x + r + 18 + i * 30, s.y - r - 6, 13, kk.critter, { t, seed: i, legs: false, mood: 'grump' });
    });
    // label pill
    g.fillStyle = 'rgba(22,15,11,0.75)';
    const label = k.label;
    g.font = '800 20px "Nunito Variable", system-ui';
    const w = g.measureText(label).width + 20;
    roundRect(g, s.x - w / 2, s.y + r + 12, w, 28, 12); g.fill();
    g.fillStyle = '#F6EFE3'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, s.x, s.y + r + 27);
    if (s.assigned >= 0) {
      g.strokeStyle = '#9BE3C4'; g.lineWidth = 6;
      g.beginPath(); g.arc(s.x, s.y, r + 14, -Math.PI / 2, -Math.PI / 2 + s.work * TAU); g.stroke();
    }
    g.restore();
  }

  private drawFactory(g: CanvasRenderingContext2D, t: number) {
    const f = this.factory;
    g.save();
    g.translate(f.x, f.y);
    const k = 1 + f.pulse * 0.15;
    g.scale(k, k);
    g.fillStyle = '#C24A3A';
    g.beginPath(); g.moveTo(-70, 30); g.lineTo(-40, -50); g.lineTo(40, -50); g.lineTo(70, 30); g.fill();
    g.fillStyle = '#E8D8C8'; roundRect(g, -80, 20, 160, 34, 14); g.fill();
    g.fillStyle = '#2A1A12'; g.beginPath(); g.ellipse(0, 40, 36, 12, 0, 0, TAU); g.fill();
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.7 + i / 3) % 1;
      g.fillStyle = `rgba(120,200,90,${0.5 * (1 - ph)})`;
      g.beginPath(); g.arc(-30 + i * 30, -60 - ph * 50, 10 + ph * 16, 0, TAU); g.fill();
    }
    g.fillStyle = '#F6EFE3'; g.font = '900 18px "Nunito Variable", system-ui'; g.textAlign = 'center';
    g.fillText(`${this.p.total - this.spawned} left`, 0, 44);
    g.restore();
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay() {
    if (this.autoCd > 0) return;
    this.autoCd = 0.15;
    for (const s of this.spots) {
      if (s.gone || s.moving || s.assigned >= 0) continue;
      const ti = this.p.teams.findIndex((tm) => tm.handles.split(',').includes(s.layers[0]));
      if (ti < 0) continue;
      if (!this.members.some((m) => m.team === ti && m.phase === 'home')) continue;
      if (this.tool !== this.p.teams[ti].id) { this.selectTool(this.p.teams[ti].id); return; }
      this.fake.tap(s.x, s.y);
      return;
    }
  }
}
