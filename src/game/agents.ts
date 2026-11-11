import { drawWorker, heroForSeed, type HeroId, type WorkerState, type WorkerTool } from '../art/characters';
import type { Vec } from '../core/math';

let SEED = 1;

/** Visual scale for heroes in play; positions and hit areas use the unscaled size. */
export const HERO_DRAW_SCALE = 1.4;

/** A Tiny Restorer that physically walks routes and performs timed jobs. */
export class Walker {
  x: number;
  y: number;
  seed: number;
  speed: number;
  state: WorkerState = 'idle';
  tool: WorkerTool;
  facing = 1;
  path: Vec[] = [];
  carry?: string;
  overalls?: string;
  badge?: string;
  workTimer = 0;
  onArrive: (() => void) | null = null;
  onWorkDone: (() => void) | null = null;
  lookX = 0.3;
  lookY = 0;
  size: number;
  alpha = 1;
  /** free-form data owned by the mechanic */
  data: Record<string, number> = {};
  dizzyTimer = 0;
  /** which of the four Tiny Restorers this is — stable for the walker's lifetime */
  hero: HeroId;

  constructor(x: number, y: number, size = 30, tool: WorkerTool = 'none', speed = 120) {
    this.x = x; this.y = y; this.size = size; this.tool = tool; this.speed = speed;
    this.seed = SEED++;
    this.hero = heroForSeed(this.seed);
  }

  goTo(x: number, y: number, onArrive?: () => void) {
    this.path = [{ x, y }];
    this.onArrive = onArrive ?? null;
    this.state = this.carry ? 'carry' : 'walk';
  }

  follow(path: Vec[], onArrive?: () => void) {
    this.path = path.map((p) => ({ x: p.x, y: p.y }));
    this.onArrive = onArrive ?? null;
    this.state = this.carry ? 'carry' : 'walk';
  }

  work(seconds: number, onDone?: () => void) {
    this.state = 'work';
    this.workTimer = seconds;
    this.onWorkDone = onDone ?? null;
  }

  dizzy(seconds = 1.6) {
    this.dizzyTimer = seconds;
    this.state = 'dizzy';
  }

  get busy() { return this.path.length > 0 || this.state === 'work' || this.dizzyTimer > 0; }

  update(dt: number) {
    if (this.dizzyTimer > 0) {
      this.dizzyTimer -= dt;
      if (this.dizzyTimer <= 0) this.state = 'idle';
      return;
    }
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.x, dy = target.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
      this.lookX = dx / (d || 1);
      this.lookY = dy / (d || 1);
      if (d <= step) {
        this.x = target.x; this.y = target.y;
        this.path.shift();
        if (!this.path.length) {
          this.state = 'idle';
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }
      return;
    }
    if (this.state === 'work') {
      this.workTimer -= dt;
      if (this.workTimer <= 0) {
        this.state = 'idle';
        const cb = this.onWorkDone;
        this.onWorkDone = null;
        cb?.();
      }
    }
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    // Heroes are drawn larger than their gameplay footprint so they read at phone scale,
    // standing in a soft warm pool of light that separates them from busy paintings.
    const s = this.size * HERO_DRAW_SCALE;
    if (this.alpha > 0.05) {
      g.save();
      g.globalAlpha = 0.5 * this.alpha;
      const cy = this.y - s * 0.75;
      const rg = g.createRadialGradient(this.x, cy, 0, this.x, cy, s * 1.25);
      rg.addColorStop(0, 'rgba(255,240,205,0.85)');
      rg.addColorStop(0.55, 'rgba(255,232,180,0.35)');
      rg.addColorStop(1, 'rgba(255,232,180,0)');
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(this.x, cy, s * 1.0, s * 1.25, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    drawWorker(g, this.x, this.y, s, {
      t, seed: this.seed, hero: this.hero, facing: this.facing, state: this.state, tool: this.tool,
      carry: this.carry, lookX: this.lookX, lookY: this.lookY, alpha: this.alpha,
      overalls: this.overalls, badge: this.badge,
    });
  }
}
