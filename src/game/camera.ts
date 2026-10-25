import { clamp, ease, lerp, type Rect } from '../core/math';

export interface View { cx: number; cy: number; scale: number }

/**
 * Camera in painting-pixel space. Transitions interpolate log-scale so the zoom from painting →
 * brushstroke → micro-village feels continuous (no asset swap, the same layers just scale).
 */
export class Camera {
  cx = 0;
  cy = 0;
  scale = 1;
  private from: View | null = null;
  private to: View | null = null;
  private t = 0;
  private dur = 1;
  private onDone: (() => void) | null = null;
  shakeAmt = 0;
  shakeX = 0;
  shakeY = 0;
  parallaxX = 0;
  parallaxY = 0;

  /** fit a painting-space rect inside a screen-space viewport rect */
  static fit(r: Rect, vp: Rect, pad = 0.92): View {
    const scale = Math.min(vp.w / r.w, vp.h / r.h) * pad;
    return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, scale };
  }

  set(v: View) { this.cx = v.cx; this.cy = v.cy; this.scale = v.scale; this.from = this.to = null; }
  get view(): View { return { cx: this.cx, cy: this.cy, scale: this.scale }; }
  get moving() { return this.to !== null; }

  flyTo(v: View, dur: number, onDone?: () => void) {
    this.from = this.view;
    this.to = v;
    this.t = 0;
    this.dur = Math.max(0.001, dur);
    this.onDone = onDone ?? null;
  }

  /** retarget without restarting (e.g. viewport resize mid-flight) */
  retarget(v: View) {
    if (this.to) this.to = v; else this.set(v);
  }

  update(dt: number) {
    if (this.from && this.to) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const k = ease.inOutCubic(this.t);
      const ls = lerp(Math.log(this.from.scale), Math.log(this.to.scale), k);
      this.scale = Math.exp(ls);
      // keep the target point drifting in proportion to zoom progress for a natural dolly
      const kz = clamp((Math.log(this.scale) - Math.log(this.from.scale)) / (Math.log(this.to.scale) - Math.log(this.from.scale) || 1));
      const kc = Number.isFinite(kz) && Math.abs(Math.log(this.to.scale / this.from.scale)) > 0.05 ? kz : k;
      this.cx = lerp(this.from.cx, this.to.cx, kc);
      this.cy = lerp(this.from.cy, this.to.cy, kc);
      if (this.t >= 1) {
        this.set(this.to);
        const cb = this.onDone;
        this.onDone = null;
        cb?.();
      }
    }
    if (this.shakeAmt > 0) {
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 3);
      this.shakeX = (Math.random() - 0.5) * this.shakeAmt * 14;
      this.shakeY = (Math.random() - 0.5) * this.shakeAmt * 14;
    } else { this.shakeX = this.shakeY = 0; }
  }

  shake(a: number) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  /** apply painting→screen transform; screen center is (sw/2, sh/2) offset by viewport centre */
  apply(g: CanvasRenderingContext2D, centerX: number, centerY: number, dpr: number) {
    g.setTransform(
      dpr * this.scale, 0, 0, dpr * this.scale,
      dpr * (centerX - this.cx * this.scale + this.shakeX + this.parallaxX),
      dpr * (centerY - this.cy * this.scale + this.shakeY + this.parallaxY),
    );
  }

  toPainting(sx: number, sy: number, centerX: number, centerY: number) {
    return {
      x: (sx - centerX - this.shakeX - this.parallaxX) / this.scale + this.cx,
      y: (sy - centerY - this.shakeY - this.parallaxY) / this.scale + this.cy,
    };
  }
}
