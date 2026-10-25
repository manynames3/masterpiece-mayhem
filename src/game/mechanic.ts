import type { AudioEngine } from '../core/audio';
import type { PointerState } from '../core/input';
import type { RNG, Rect, Vec } from '../core/math';
import type { Particles } from '../core/particles';
import type { LoadedPainting } from '../art/paintings';
import type { StageDef } from '../data/types';

export interface ToolDef {
  id: string;
  label: string;
  icon: string;
  /** live badge (e.g. remaining charges) */
  badge?: string;
  disabled?: boolean;
  active?: boolean;
  /** paint-swatch tools (Seurat dots) */
  color?: string;
}

export interface MechanicEnv {
  /** logical play-area size; W is always 1000 */
  W: number;
  H: number;
  rng: RNG;
  fx: Particles;
  audio: AudioEngine;
  painting: LoadedPainting;
  /** focus rect in painting pixels */
  focusPx: Rect;
  /** painting pixels per logical unit */
  unit: number;
  stage: StageDef;
  time(): number;
  /** a player mistake: counts toward the botch meter and "no accidents" stars */
  mistake(x: number, y: number, label?: string, weight?: number): void;
  reward(x: number, y: number, points: number, label?: string): void;
  shake(amount: number): void;
  haptic(ms?: number): void;
  toast(text: string, tone?: 'info' | 'good' | 'warn'): void;
  reducedMotion: boolean;
  /** draw the focus region of a painting variant into logical coordinates */
  drawPainting(g: CanvasRenderingContext2D, variant?: 'clean' | 'aged' | 'varnished', clip?: Rect): void;
  /** request a camera mode (e.g. dots stages "squint" at the overview) */
  requestView(view: 'work' | 'overview'): void;
  /** tells the HUD the tool tray changed */
  refreshTools(): void;
  /** current botch-curse distortion (0 none … 1 full) — some mechanics react to it */
  curse(): number;
}

/**
 * Every gameplay family implements this contract. Mechanics own real state and report it through
 * metrics(); objectives, stars, progress bars and win/fail are all computed from those metrics.
 */
export abstract class Mechanic {
  env!: MechanicEnv;
  tool = '';
  /** set by the runtime during autoplay (QA solver) */
  autoplaying = false;
  /** true while the runtime renders before/after thumbnails — hide cursors */
  snapshotting = false;

  bind(env: MechanicEnv) { this.env = env; }
  abstract init(): void;
  abstract update(dt: number): void;
  /** drawn directly above the painting, below decor */
  renderBelow(_g: CanvasRenderingContext2D): void {}
  abstract render(g: CanvasRenderingContext2D): void;
  onDown(_p: PointerState): void {}
  onMove(_p: PointerState): void {}
  onUp(_p: PointerState, _tap: boolean): void {}
  onHover(_p: PointerState): void {}
  tools(): ToolDef[] { return []; }
  selectTool(id: string) { this.tool = id; this.env.refreshTools(); }
  /** must include `progress` (0..1) */
  abstract metrics(): Record<string, number>;
  hintPoint(): Vec | null { return null; }
  /** extra completion gate beyond objectives (e.g. an end-of-stage animation finishing) */
  ready(): boolean { return true; }
  /** called once when the stage is won — mechanic-specific payoff */
  onComplete(): void {}
  /** QA solver: performs real actions through the same API the player uses */
  autoplay(_dt: number): void {}
  /** label for the progress bar */
  progressLabel(): string { return 'Restored'; }
  dispose(): void {}
}

/** Synthetic pointer used by autoplay solvers so they exercise the exact player input path. */
export class FakePointer {
  readonly s: PointerState = {
    x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, vx: 0, vy: 0,
    down: false, downAt: 0, startX: 0, startY: 0, travel: 0, type: 'touch',
  };
  constructor(private m: Mechanic) {}
  down(x: number, y: number) {
    const s = this.s;
    s.x = s.px = s.startX = x; s.y = s.py = s.startY = y;
    s.vx = s.vy = 0; s.travel = 0; s.down = true; s.downAt = performance.now();
    this.m.onDown(s);
  }
  move(x: number, y: number, dt = 1 / 60) {
    const s = this.s;
    s.px = s.x; s.py = s.y; s.x = x; s.y = y;
    s.vx = (s.x - s.px) / dt; s.vy = (s.y - s.py) / dt;
    s.travel += Math.hypot(s.x - s.px, s.y - s.py);
    if (s.down) this.m.onMove(s); else this.m.onHover(s);
  }
  up(tap?: boolean) {
    this.s.down = false;
    this.m.onUp(this.s, tap ?? this.s.travel < 6);
  }
  tap(x: number, y: number) { this.down(x, y); this.up(true); }
  /** step toward a target at a capped speed; returns true when arrived */
  approach(tx: number, ty: number, speed: number, dt: number) {
    const dx = tx - this.s.x, dy = ty - this.s.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= step) { this.move(tx, ty, dt); return true; }
    this.move(this.s.x + (dx / d) * step, this.s.y + (dy / d) * step, dt);
    return false;
  }
}
