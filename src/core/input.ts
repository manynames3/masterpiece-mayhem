import type { Vec } from './math';

export interface PointerState {
  /** logical (play-area) coordinates */
  x: number;
  y: number;
  /** previous logical position (for stroke interpolation) */
  px: number;
  py: number;
  /** screen (CSS px) coordinates */
  sx: number;
  sy: number;
  /** smoothed velocity in logical units / second */
  vx: number;
  vy: number;
  down: boolean;
  downAt: number;
  startX: number;
  startY: number;
  travel: number;
  type: string;
}

export interface InputHandlers {
  down(p: PointerState): void;
  move(p: PointerState): void;
  up(p: PointerState, tap: boolean): void;
  hover?(p: PointerState): void;
}

/**
 * Single-pointer input on the game canvas with coalesced-event interpolation so fast swipes on
 * 120Hz touch screens never skip, plus scroll/zoom suppression for mobile Safari.
 */
export class InputController {
  readonly state: PointerState = {
    x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, vx: 0, vy: 0,
    down: false, downAt: 0, startX: 0, startY: 0, travel: 0, type: 'mouse',
  };
  private activeId: number | null = null;
  private downSX = 0;
  private downSY = 0;
  private lastT = 0;
  enabled = true;
  handlers: InputHandlers | null = null;

  constructor(private el: HTMLElement, private toLogical: (sx: number, sy: number) => Vec) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp, { passive: false });
    window.addEventListener('pointercancel', this.onUp, { passive: false });
    el.addEventListener('touchstart', this.prevent, { passive: false });
    el.addEventListener('touchmove', this.prevent, { passive: false });
    el.addEventListener('gesturestart', this.prevent as EventListener, { passive: false });
    el.addEventListener('contextmenu', this.prevent);
  }

  destroy() {
    this.el.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('touchstart', this.prevent);
    this.el.removeEventListener('touchmove', this.prevent);
    this.el.removeEventListener('contextmenu', this.prevent);
  }

  private prevent = (e: Event) => { e.preventDefault(); };

  private local(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  private apply(sx: number, sy: number, now: number) {
    const s = this.state;
    const p = this.toLogical(sx, sy);
    s.px = s.x; s.py = s.y;
    s.x = p.x; s.y = p.y;
    s.sx = sx; s.sy = sy;
    const dt = Math.max(1, now - this.lastT) / 1000;
    this.lastT = now;
    const ivx = (s.x - s.px) / dt, ivy = (s.y - s.py) / dt;
    s.vx = s.vx * 0.6 + ivx * 0.4;
    s.vy = s.vy * 0.6 + ivy * 0.4;
    s.travel += Math.hypot(s.x - s.px, s.y - s.py);
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!this.enabled || this.activeId !== null) return;
    this.activeId = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const { sx, sy } = this.local(e);
    const p = this.toLogical(sx, sy);
    const s = this.state;
    s.x = s.px = s.startX = p.x;
    s.y = s.py = s.startY = p.y;
    s.sx = sx; s.sy = sy;
    this.downSX = sx; this.downSY = sy;
    s.vx = s.vy = 0;
    s.travel = 0;
    s.down = true;
    s.type = e.pointerType;
    s.downAt = performance.now();
    this.lastT = s.downAt;
    this.handlers?.down(s);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (this.activeId === null) {
      if (e.pointerType === 'mouse' && e.target === this.el) {
        const { sx, sy } = this.local(e);
        this.apply(sx, sy, performance.now());
        this.handlers?.hover?.(this.state);
      }
      return;
    }
    if (e.pointerId !== this.activeId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    for (const ev of list) {
      const { sx, sy } = this.local(ev);
      this.apply(sx, sy, ev.timeStamp || performance.now());
      this.handlers?.move(this.state);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    const s = this.state;
    s.down = false;
    const tap = performance.now() - s.downAt < 400 && Math.hypot(s.sx - this.downSX, s.sy - this.downSY) < 14;
    this.handlers?.up(s, tap);
  };

  /** Programmatic input — used by the deterministic autoplay solver in tests. */
  synth(kind: 'down' | 'move' | 'up', x: number, y: number) {
    const s = this.state;
    if (kind === 'down') {
      s.x = s.px = s.startX = x; s.y = s.py = s.startY = y;
      s.vx = s.vy = 0; s.travel = 0; s.down = true; s.downAt = performance.now();
      this.handlers?.down(s);
    } else if (kind === 'move') {
      s.px = s.x; s.py = s.y; s.x = x; s.y = y;
      s.vx = (s.x - s.px) * 60; s.vy = (s.y - s.py) * 60;
      s.travel += Math.hypot(s.x - s.px, s.y - s.py);
      if (s.down) this.handlers?.move(s); else this.handlers?.hover?.(s);
    } else {
      s.down = false;
      this.handlers?.up(s, s.travel < 6);
    }
  }
}
