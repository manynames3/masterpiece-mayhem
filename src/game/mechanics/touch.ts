import { drawStarShape } from '../../art/characters';
import type { PointerState } from '../../core/input';
import { TAU, clamp, dist, ease } from '../../core/math';
import { FakePointer, Mechanic, type ToolDef } from '../mechanic';

export interface TouchParams {
  type: 'touch';
  /** normalized fingertip positions */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** charge window (0..1.2) that counts as a perfect touch */
  window: [number, number];
  chargeTime: number;
}

/**
 * The Final Touch: hold on God's fingertip to gather the golden spark, release inside the
 * glowing window to leap the gap. Too early fizzles; too long overloads. Timing, not speed.
 */
export class TouchMechanic extends Mechanic {
  private charge = 0;
  private holding = false;
  private connected = 0;
  private fizzles = 0;
  private spark = -1;
  private fake = new FakePointer(this);

  constructor(readonly p: TouchParams) { super(); }

  init() { this.tool = 'touch'; }
  tools(): ToolDef[] { return [{ id: 'touch', label: 'Golden spark', icon: 'touch', active: true }]; }
  progressLabel() { return 'The Final Touch'; }
  metrics() { return { progress: this.connected > 0 ? 1 : clamp(this.charge) * 0.8, connected: this.connected > 0 ? 1 : 0, fizzles: this.fizzles }; }
  ready() { return this.connected > 1.6; }

  private pt(q: { x: number; y: number }) { return { x: q.x * this.env.W, y: q.y * this.env.H }; }
  hintPoint() { return this.pt(this.p.from); }

  onDown(p: PointerState) {
    if (this.connected > 0) return;
    const f = this.pt(this.p.from);
    if (dist(p.x, p.y, f.x, f.y) > 150) { this.env.toast('Press and hold on the glowing fingertip', 'info'); return; }
    this.holding = true;
    this.charge = 0;
    this.env.audio.play('zap', { pitch: 0.5, vol: 0.5 });
  }

  onUp() {
    if (!this.holding) return;
    this.holding = false;
    const [lo, hi] = this.p.window;
    const f = this.pt(this.p.from);
    if (this.charge >= lo && this.charge <= hi) {
      this.spark = 0;
      this.env.audio.play('whoosh', { pitch: 1.4 });
    } else {
      this.fizzles++;
      this.env.mistake(f.x, f.y, this.charge < lo ? 'Not enough spark…' : 'Overcharged!');
      this.charge = 0;
    }
  }

  update(dt: number) {
    if (this.holding) {
      this.charge += dt / this.p.chargeTime;
      if (Math.random() < 0.5) { const f = this.pt(this.p.from); this.env.fx.emit('sparkle', f.x + (Math.random() - 0.5) * 60, f.y + (Math.random() - 0.5) * 60, 1, { color: '#FFE9A8', size: 6 + this.charge * 6, speed: 40 }); }
      this.env.audio.setLoop('peel', Math.min(1, this.charge));
      if (this.charge > this.p.window[1] + 0.25) { this.holding = false; this.onUpOver(); }
    } else this.env.audio.setLoop('peel', 0);
    if (this.spark >= 0) {
      this.spark += dt * 1.6;
      const f = this.pt(this.p.from), t = this.pt(this.p.to);
      const k = ease.inOutCubic(Math.min(1, this.spark));
      this.env.fx.emit('star', f.x + (t.x - f.x) * k, f.y + (t.y - f.y) * k, 2, { color: '#FFE9A8', size: 9, speed: 60 });
      if (this.spark >= 1 && !this.connected) {
        this.connected = 0.001;
        this.env.audio.play('fanfare');
        this.env.shake(0.6);
        this.env.fx.emit('ring', t.x, t.y, 3, { color: '#FFE9A8', size: 60, max: 1.2 });
        this.env.fx.emit('star', t.x, t.y, 40, { color: '#FFE9A8', size: 14, speed: 380 });
      }
    }
    if (this.connected > 0) this.connected += dt;
  }

  private onUpOver() {
    this.fizzles++;
    const f = this.pt(this.p.from);
    this.env.mistake(f.x, f.y, 'Overcharged!');
    this.charge = 0;
  }

  renderBelow(g: CanvasRenderingContext2D) {
    if (this.connected <= 0) return;
    const f = this.pt(this.p.from), t = this.pt(this.p.to);
    const k = Math.min(1, this.connected);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(f.x, f.y, t.x, t.y);
    gr.addColorStop(0, `rgba(255,230,160,${0.7 * k})`); gr.addColorStop(1, `rgba(255,230,160,${0.7 * k})`);
    g.strokeStyle = gr; g.lineWidth = 18 * k; g.lineCap = 'round';
    g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(t.x, t.y); g.stroke();
    g.restore();
  }

  render(g: CanvasRenderingContext2D) {
    const time = this.env.time();
    const f = this.pt(this.p.from), t = this.pt(this.p.to);
    if (this.connected > 0) return;
    // target fingertip glow
    g.fillStyle = `rgba(255,240,200,${0.25 + Math.sin(time * 3) * 0.1})`;
    g.beginPath(); g.arc(t.x, t.y, 40, 0, TAU); g.fill();
    // source: charge ring with sweet window
    const R = 92;
    const [lo, hi] = this.p.window;
    const maxC = hi + 0.25;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(22,15,11,0.6)'; g.lineWidth = 18;
    g.beginPath(); g.arc(f.x, f.y, R, -Math.PI / 2, -Math.PI / 2 + TAU); g.stroke();
    g.strokeStyle = 'rgba(155,227,196,0.85)'; g.lineWidth = 18;
    g.beginPath(); g.arc(f.x, f.y, R, -Math.PI / 2 + (lo / maxC) * TAU, -Math.PI / 2 + (hi / maxC) * TAU); g.stroke();
    const inWin = this.charge >= lo && this.charge <= hi;
    g.strokeStyle = inWin ? '#FFF6DA' : '#E8C46A'; g.lineWidth = 10;
    g.beginPath(); g.arc(f.x, f.y, R, -Math.PI / 2, -Math.PI / 2 + (Math.min(this.charge, maxC) / maxC) * TAU); g.stroke();
    const pulse = 1 + Math.sin(time * (this.holding ? 18 : 4)) * 0.12;
    g.fillStyle = `rgba(255,233,168,${this.holding ? 0.8 : 0.5})`;
    g.beginPath(); g.arc(f.x, f.y, 28 * pulse + this.charge * 20, 0, TAU); g.fill();
    drawStarShape(g, f.x, f.y, 18 + this.charge * 12, '#FFFDF5', 4);
    g.fillStyle = '#F6EFE3'; g.font = '900 24px "Nunito Variable", system-ui'; g.textAlign = 'center';
    g.fillText(this.holding ? (inWin ? 'RELEASE!' : 'hold…') : 'HOLD HERE', f.x, f.y + R + 44);
  }

  autoplay() {
    const f = this.pt(this.p.from);
    if (this.connected > 0 || this.spark >= 0) return;
    if (!this.holding) { this.fake.down(f.x, f.y); return; }
    if (this.charge >= (this.p.window[0] + this.p.window[1]) / 2) this.fake.up(false);
  }
}
