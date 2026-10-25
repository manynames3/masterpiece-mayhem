import type { PointerState } from '../../core/input';
import { TAU, clamp, damp, dist, polygonArea, type Vec } from '../../core/math';
import { Walker } from '../agents';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

type Corner = 'tl' | 'tr' | 'bl' | 'br';
export interface PeelParams {
  type: 'peel';
  /** normalized rectangles of varnish sheet */
  strips: { x: number; y: number; w: number; h: number; tab: Corner; crew?: number }[];
  /** pointer speed (logical units/s) above which the varnish tears */
  maxSpeed: number;
  crewTotal?: number;
  awaken?: { x: number; y: number; label: string }[];
}

interface Strip {
  poly: Vec[];
  area0: number;
  grab: Vec;
  peeling: boolean;
  P: Vec;
  target: Vec | null;
  done: boolean;
  flyT: number;
  flap: Vec[] | null;
  remain: Vec[];
  crewNeed: number;
  crew: Walker[];
  release: 'none' | 'spring' | 'finish';
  finishDir: Vec;
}

/** Clip a convex polygon to the half-plane dot(X - M, n) >= 0. */
function clipHalf(poly: Vec[], M: Vec, n: Vec): Vec[] {
  const out: Vec[] = [];
  const side = (p: Vec) => (p.x - M.x) * n.x + (p.y - M.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
const reflect = (p: Vec, M: Vec, n: Vec): Vec => {
  const d = (p.x - M.x) * n.x + (p.y - M.y) * n.y;
  return { x: p.x - 2 * d * n.x, y: p.y - 2 * d * n.y };
};

/**
 * Peel family — drag a translucent amber varnish sheet back with a real page-curl fold
 * (perpendicular-bisector geometry). Too fast and it tears. Stage 6 adds crew lift teams.
 */
export class PeelMechanic extends Mechanic {
  private strips: Strip[] = [];
  private active: Strip | null = null;
  private fastTime = 0;
  private tears = 0;
  private springs = 0;
  private debris: { poly: Vec[]; x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number }[] = [];
  private pool: Walker[] = [];
  private awaken: { x: number; y: number; label: string; woke: number }[] = [];
  private fake = new FakePointer(this);
  private autoK = 0;
  private light = 0;

  constructor(readonly p: PeelParams) { super(); }

  init() {
    const { W, H } = this.env;
    for (const s of this.p.strips) {
      const x = s.x * W, y = s.y * H, w = s.w * W, h = s.h * H;
      const poly = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      const grab = { tl: poly[0], tr: poly[1], br: poly[2], bl: poly[3] }[s.tab];
      this.strips.push({
        poly, area0: polygonArea(poly), grab: { ...grab }, peeling: false, P: { ...grab }, target: null,
        done: false, flyT: 0, flap: null, remain: poly, crewNeed: s.crew ?? 0, crew: [], release: 'none', finishDir: { x: 0, y: 0 },
      });
    }
    for (let i = 0; i < (this.p.crewTotal ?? 0); i++) {
      const w = new Walker(W * 0.5 + (i - (this.p.crewTotal! - 1) / 2) * 56, H - 36, 40, 'rope', 220);
      this.pool.push(w);
    }
    this.awaken = (this.p.awaken ?? []).map((a) => ({ x: a.x * W, y: a.y * H, label: a.label, woke: 0 }));
    this.tool = this.pool.length ? 'crew' : 'peel';
  }

  tools(): ToolDef[] {
    if (!this.pool.length) return [{ id: 'peel', label: 'Peel', icon: 'squeegee', active: true }];
    const free = this.pool.filter((w) => !this.strips.some((s) => s.crew.includes(w))).length;
    return [
      { id: 'crew', label: 'Send lift crew', icon: 'crew', active: this.tool === 'crew', badge: String(free) },
      { id: 'peel', label: 'Peel', icon: 'squeegee', active: this.tool === 'peel' },
    ];
  }

  progressLabel() { return 'Varnish lifted'; }

  private fraction(s: Strip) { return s.done ? 1 : clamp(1 - polygonArea(s.remain) / s.area0); }

  metrics() {
    const peeled = this.strips.filter((s) => s.done).length;
    const progress = this.strips.reduce((a, s) => a + this.fraction(s), 0) / this.strips.length;
    return { progress, peeled, strips: this.strips.length, tears: this.tears, springs: this.springs, awakened: this.awaken.filter((a) => a.woke > 0).length };
  }

  ready() { return this.strips.every((s) => s.done && s.flyT > 0.6); }

  hintPoint() {
    const s = this.strips.find((q) => !q.done && this.lifted(q)) ?? this.strips.find((q) => !q.done);
    return s ? s.grab : null;
  }

  private lifted(s: Strip) {
    return s.crewNeed === 0 || (s.crew.length >= s.crewNeed && s.crew.every((w) => !w.path.length));
  }

  private setFold(s: Strip, P: Vec) {
    s.P = P;
    const C = s.grab;
    const d = dist(C.x, C.y, P.x, P.y);
    if (d < 1) { s.remain = s.poly; s.flap = null; return; }
    const n = { x: (P.x - C.x) / d, y: (P.y - C.y) / d };
    const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
    s.remain = clipHalf(s.poly, M, n);
    const lifted = clipHalf(s.poly, M, { x: -n.x, y: -n.y });
    s.flap = lifted.length >= 3 ? lifted.map((q) => reflect(q, M, n)) : null;
  }

  // ------------------------------------------------------------------ input
  onDown(p: PointerState) {
    if (this.tool === 'crew') { this.sendCrew(p.x, p.y); return; }
    let best: Strip | null = null, bd = 110;
    for (const s of this.strips) {
      if (s.done || s.release !== 'none') continue;
      const d = dist(p.x, p.y, s.grab.x, s.grab.y);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) {
      const inside = this.strips.find((s) => !s.done && insidePoly(p, s.remain));
      if (inside) this.env.toast('Grab the curled corner tab to peel', 'info');
      return;
    }
    if (!this.lifted(best)) {
      this.env.toast(`Too heavy! Send ${best.crewNeed} crew to lift this sheet.`, 'warn');
      this.env.audio.play('creak');
      return;
    }
    this.active = best;
    best.peeling = true;
    this.fastTime = 0;
    this.env.audio.play('peel', { pitch: 0.8 });
  }


  onMove(p: PointerState) {
    const s = this.active;
    if (!s) return;
    const speed = Math.hypot(p.vx, p.vy);
    this.setFold(s, { x: p.x, y: p.y });
    this.env.audio.setLoop('peel', clamp(speed / this.p.maxSpeed) * 0.8);
    if (Math.random() < 0.3 && s.flap) {
      const q = s.flap[0];
      this.env.fx.emit('sparkle', q.x, q.y, 1, { color: '#FFD98A', size: 5, speed: 30 });
    }
    if (speed > this.p.maxSpeed) this.fastTime += 1 / 60; else this.fastTime = Math.max(0, this.fastTime - 1 / 120);
    if (this.fastTime > 0.07 && this.fraction(s) > 0.04 && this.fraction(s) < 0.92) this.tear(s);
    if (this.fraction(s) >= 0.995) this.complete(s);
  }

  onUp() {
    const s = this.active;
    this.active = null;
    this.env.audio.setLoop('peel', 0);
    if (!s || s.done) return;
    s.peeling = false;
    const f = this.fraction(s);
    if (f > 0.55) {
      s.release = 'finish';
      const C = s.grab;
      const d = dist(C.x, C.y, s.P.x, s.P.y) || 1;
      s.finishDir = { x: (s.P.x - C.x) / d, y: (s.P.y - C.y) / d };
    } else if (f > 0.01) {
      s.release = 'spring';
      this.springs++;
      this.env.audio.play('boing', { pitch: 0.6, vol: 0.5 });
    }
  }

  private tear(s: Strip) {
    this.tears++;
    this.env.audio.play('tear');
    this.env.mistake(s.P.x, s.P.y, 'Ripped! Peel slower');
    if (s.flap && s.flap.length >= 3) {
      const cx = s.flap.reduce((a, q) => a + q.x, 0) / s.flap.length, cy = s.flap.reduce((a, q) => a + q.y, 0) / s.flap.length;
      this.debris.push({ poly: s.flap.map((q) => ({ x: q.x - cx, y: q.y - cy })), x: cx, y: cy, vx: (Math.random() - 0.5) * 300, vy: -200, rot: 0, vr: (Math.random() - 0.5) * 6, life: 1.6 });
    }
    // the torn edge becomes the new sheet; grab from the vertex nearest the old corner
    s.poly = s.remain.length >= 3 ? s.remain : s.poly;
    s.area0 = Math.max(s.area0, 1);
    let bi = 0, bd = Infinity;
    s.poly.forEach((q, i) => { const d = dist(q.x, q.y, s.grab.x, s.grab.y); if (d < bd) { bd = d; bi = i; } });
    s.grab = { ...s.poly[bi] };
    s.P = { ...s.grab };
    s.remain = s.poly;
    s.flap = null;
    s.peeling = false;
    this.active = null;
    this.fastTime = 0;
  }

  private complete(s: Strip) {
    if (s.done) return;
    s.done = true;
    s.peeling = false;
    s.release = 'none';
    if (this.active === s) this.active = null;
    this.env.audio.play('peel', { pitch: 1.4 });
    this.env.audio.play('chime');
    this.env.reward(s.grab.x, s.grab.y + 40, 150, 'Peeled!');
    this.env.shake(0.15);
    const bb = bounds(s.poly);
    for (let i = 0; i < 24; i++) this.env.fx.emit('sparkle', bb.x + Math.random() * bb.w, bb.y + Math.random() * bb.h, 1, { color: '#FFE9A8', size: 9, speed: 50 });
    for (const a of this.awaken) if (!a.woke && a.x >= bb.x && a.x <= bb.x + bb.w && a.y >= bb.y && a.y <= bb.y + bb.h) {
      a.woke = 0.001;
      this.env.audio.play('giggle', { pitch: 0.8 });
    }
    // crew go back to the pool
    for (const w of s.crew) { w.tool = 'rope'; w.goTo(w.data.homeX ?? w.x, this.env.H - 36); }
    s.crew = [];
    this.env.refreshTools();
  }

  private sendCrew(x: number, y: number) {
    const s = this.strips.find((q) => !q.done && (insidePoly({ x, y }, q.remain) || dist(x, y, q.grab.x, q.grab.y) < 100));
    if (!s) return;
    if (s.crewNeed === 0) { this.env.toast('This sheet is light — just peel it!', 'info'); return; }
    const need = s.crewNeed - s.crew.length;
    if (need <= 0) { this.tool = 'peel'; this.env.refreshTools(); return; }
    const free = this.pool.filter((w) => !this.strips.some((q) => q.crew.includes(w)));
    if (free.length < need) {
      this.env.toast(`Needs ${need} free crew — finish another sheet first.`, 'warn');
      this.env.audio.play('error');
      return;
    }
    free.slice(0, need).forEach((w, i) => {
      w.data.homeX = w.data.homeX ?? w.x;
      s.crew.push(w);
      const off = (i - (need - 1) / 2) * 30;
      w.goTo(s.grab.x + off, s.grab.y + 26, () => { w.state = 'lift'; this.env.audio.play('tap', { pitch: 1.4 }); });
    });
    this.env.audio.play('chime', { pitch: 1.3 });
    if (s.crew.length >= s.crewNeed) { this.tool = 'peel'; }
    this.env.refreshTools();
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    for (const w of this.pool) {
      w.update(dt);
      const s = this.strips.find((q) => q.crew.includes(w));
      if (s && !w.path.length) {
        w.state = 'lift';
        // the lift crew holds the moving fold corner
        if (s.peeling && s.flap) {
          const tgt = s.flap[0];
          w.x = damp(w.x, tgt.x, 8, dt); w.y = damp(w.y, tgt.y + 30, 8, dt);
        }
      }
    }
    for (const s of this.strips) {
      if (s.release === 'spring') {
        const P = { x: damp(s.P.x, s.grab.x, 10, dt), y: damp(s.P.y, s.grab.y, 10, dt) };
        this.setFold(s, P);
        if (dist(P.x, P.y, s.grab.x, s.grab.y) < 2) { this.setFold(s, s.grab); s.release = 'none'; }
      } else if (s.release === 'finish') {
        const P = { x: s.P.x + s.finishDir.x * 1400 * dt, y: s.P.y + s.finishDir.y * 1400 * dt };
        this.setFold(s, P);
        if (this.fraction(s) >= 0.995 || dist(P.x, P.y, s.grab.x, s.grab.y) > 4000) this.complete(s);
      }
      if (s.done) s.flyT += dt;
    }
    for (const d of this.debris) { d.life -= dt; d.vy += 600 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; }
    this.debris = this.debris.filter((d) => d.life > 0);
    for (const a of this.awaken) if (a.woke > 0) a.woke += dt;
    if (this.strips.every((s) => s.done)) this.light = Math.min(1, this.light + dt * 0.6);
  }

  onComplete() {
    const { W, H } = this.env;
    for (let i = 0; i < 40; i++) this.env.fx.emit('sparkle', Math.random() * W, Math.random() * H, 1, { color: '#FFE9A8', size: 10, speed: 40 });
    for (const w of this.pool) w.state = 'cheer';
  }

  // ------------------------------------------------------------------ render
  renderBelow(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    const { W, H } = this.env;
    // remaining varnish
    for (const s of this.strips) {
      if (s.done || s.remain.length < 3) continue;
      g.save();
      path(g, s.remain);
      g.clip();
      this.env.drawPainting(g, 'varnished');
      const bb = bounds(s.poly);
      const gr = g.createLinearGradient(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h);
      gr.addColorStop(0, 'rgba(255,214,140,0.22)');
      gr.addColorStop(0.5, 'rgba(255,214,140,0.04)');
      gr.addColorStop(1, 'rgba(120,70,20,0.2)');
      g.fillStyle = gr;
      g.fillRect(bb.x, bb.y, bb.w, bb.h);
      // glossy sheen sweep
      const sx = bb.x + ((t * 120) % (bb.w + 400)) - 200;
      const sh = g.createLinearGradient(sx, 0, sx + 140, 0);
      sh.addColorStop(0, 'rgba(255,240,200,0)'); sh.addColorStop(0.5, 'rgba(255,240,200,0.12)'); sh.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = sh; g.fillRect(bb.x, bb.y, bb.w, bb.h);
      g.restore();
      g.strokeStyle = 'rgba(255,220,150,0.5)'; g.lineWidth = 2;
      path(g, s.remain); g.stroke();
    }
    // "let there be light" sweep after everything is peeled
    if (this.light > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const x = -W * 0.5 + this.light * W * 2;
      const gr = g.createLinearGradient(x - 300, 0, x, H);
      gr.addColorStop(0, 'rgba(255,230,170,0)'); gr.addColorStop(0.5, `rgba(255,230,170,${0.25 * (1 - this.light * 0.6)})`); gr.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.restore();
    }
  }

  render(g: CanvasRenderingContext2D) {
    const t = this.env.time();
    for (const s of this.strips) {
      if (s.done) {
        // finished sheet flutters off-screen
        if (s.flyT < 1.4 && s.flap) {
          g.save();
          g.globalAlpha = Math.max(0, 1 - s.flyT / 1.4);
          g.translate(s.flyT * 300, -s.flyT * s.flyT * 500);
          this.drawFlap(g, s.flap, s);
          g.restore();
        }
        continue;
      }
      if (s.flap) {
        // shadow cast by the lifted flap
        g.save();
        g.translate(10, 14);
        g.fillStyle = 'rgba(20,10,4,0.35)';
        path(g, s.flap); g.fill();
        g.restore();
        this.drawFlap(g, s.flap, s);
      } else if (!this.snapshotting) {
        // curled tab handle
        const c = s.grab;
        const pulse = 1 + Math.sin(t * 4) * 0.12;
        const ready = this.lifted(s);
        const cx = bounds(s.poly);
        const inx = c.x < cx.x + cx.w / 2 ? 1 : -1, iny = c.y < cx.y + cx.h / 2 ? 1 : -1;
        g.save();
        g.translate(c.x, c.y);
        g.fillStyle = ready ? 'rgba(255,226,160,0.95)' : 'rgba(200,170,120,0.8)';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(inx * 70 * pulse, 0); g.quadraticCurveTo(inx * 30, iny * 30, 0, iny * 70 * pulse); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(120,70,20,0.7)'; g.lineWidth = 3; g.stroke();
        if (s.crewNeed && s.crew.length < s.crewNeed) {
          g.fillStyle = '#3B2418';
          g.beginPath(); g.arc(inx * 70, iny * 70, 26, 0, TAU); g.fill();
          g.fillStyle = '#F6EFE3'; g.font = '900 24px "Nunito Variable", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(`${s.crew.length}/${s.crewNeed}`, inx * 70, iny * 70);
        }
        g.restore();
      }
    }
    for (const d of this.debris) {
      g.save(); g.globalAlpha = Math.min(1, d.life); g.translate(d.x, d.y); g.rotate(d.rot);
      g.fillStyle = 'rgba(214,160,80,0.75)'; path(g, d.poly); g.fill();
      g.restore();
    }
    for (const a of this.awaken) {
      if (a.woke <= 0) continue;
      const k = Math.min(1, a.woke * 2);
      g.save();
      g.translate(a.x, a.y - 60 - Math.sin(a.woke * 3) * 6);
      g.scale(k, k);
      g.fillStyle = '#FFFDF5';
      g.beginPath(); g.ellipse(0, 0, 90, 40, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-10, 34); g.lineTo(-24, 62); g.lineTo(14, 36); g.fill();
      g.fillStyle = '#3B2418'; g.font = '800 26px "Fraunces Variable", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(a.label, 0, 2);
      g.restore();
    }
    for (const w of this.pool) w.draw(g, t);
  }

  private drawFlap(g: CanvasRenderingContext2D, flap: Vec[], s: Strip) {
    const bb = bounds(flap);
    const C = s.grab, P = s.P;
    const gr = g.createLinearGradient(C.x, C.y, P.x, P.y);
    gr.addColorStop(0, 'rgba(255,236,190,0.95)');
    gr.addColorStop(0.55, 'rgba(232,180,100,0.92)');
    gr.addColorStop(1, 'rgba(170,110,40,0.95)');
    g.fillStyle = gr;
    path(g, flap); g.fill();
    g.strokeStyle = 'rgba(255,248,225,0.9)'; g.lineWidth = 3; g.stroke();
    // fold highlight
    g.save(); path(g, flap); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < 4; i++) g.fillRect(bb.x + (i / 4) * bb.w, bb.y, 6, bb.h);
    g.restore();
  }

  // ------------------------------------------------------------------ QA autoplay
  autoplay(dt: number) {
    const f = this.fake;
    if (this.active) {
      const s = this.active;
      const C = s.grab;
      const bb = bounds(s.poly);
      const far = { x: bb.x + bb.w / 2 + (bb.x + bb.w / 2 - C.x) * 1.4, y: bb.y + bb.h / 2 + (bb.y + bb.h / 2 - C.y) * 1.4 };
      this.autoK = Math.min(1, this.autoK + dt * 0.9);
      f.move(C.x + (far.x - C.x) * this.autoK, C.y + (far.y - C.y) * this.autoK, dt);
      if (this.autoK >= 1 || s.done) { f.up(); this.autoK = 0; }
      return;
    }
    const s = this.strips.find((q) => !q.done && q.release === 'none');
    if (!s) return;
    if (!this.lifted(s)) {
      if (s.crew.length < s.crewNeed) {
        if (this.tool !== 'crew') this.selectTool('crew');
        f.tap(s.grab.x, s.grab.y);
      }
      return;
    }
    if (this.tool !== 'peel') { this.selectTool('peel'); return; }
    this.autoK = 0;
    f.down(s.grab.x, s.grab.y);
  }
}

function path(g: CanvasRenderingContext2D, poly: Vec[]) {
  g.beginPath();
  poly.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  g.closePath();
}
function bounds(poly: Vec[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of poly) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function insidePoly(p: Vec, poly: Vec[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
