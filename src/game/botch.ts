import { TAU, clamp } from '../core/math';

export type CurseKind = 'mustache' | 'googly' | 'wobble' | 'disco' | 'partyhat';

export const CURSE_TEXT: Record<CurseKind, string> = {
  mustache: 'A dashing mustache has appeared!',
  googly: 'The painting grew googly eyes!',
  wobble: 'Everything has gone wobbly!',
  disco: 'Disco colours! The pigments are partying.',
  partyhat: 'Someone added a party hat…',
};

/**
 * Botch Meter: playful, never a hard fail. Mistakes fill it; at full, a silly temporary "curse"
 * distortion appears that the player can repair with one tap (or it fades on its own).
 */
export class BotchMeter {
  level = 0;
  curse: CurseKind | null = null;
  curseTime = 0;
  curses = 0;
  intensity = 0;
  private order: CurseKind[] = ['mustache', 'googly', 'wobble', 'partyhat', 'disco'];
  private next = 0;
  onCurse: ((k: CurseKind) => void) | null = null;
  onClear: (() => void) | null = null;

  constructor(seed: number) { this.next = seed % this.order.length; }

  add(weight = 1) {
    if (this.curse) return;
    this.level = clamp(this.level + 0.34 * weight);
    if (this.level >= 1) this.trigger();
  }

  trigger() {
    this.curse = this.order[this.next++ % this.order.length];
    this.curseTime = 0;
    this.curses++;
    this.onCurse?.(this.curse);
  }

  repair() {
    if (!this.curse) return false;
    this.curse = null;
    this.level = 0.25;
    this.onClear?.();
    return true;
  }

  update(dt: number) {
    if (this.curse) {
      this.curseTime += dt;
      this.intensity = Math.min(1, this.intensity + dt * 2.5);
      if (this.curseTime > 14) this.repair();
    } else {
      this.intensity = Math.max(0, this.intensity - dt * 2);
      this.level = Math.max(0, this.level - dt * 0.025);
    }
  }

  /** drawn in logical play-area space at the stage's focal point */
  render(g: CanvasRenderingContext2D, x: number, y: number, size: number, t: number) {
    if (!this.curse && this.intensity <= 0) return;
    const k = this.intensity;
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    switch (this.curse) {
      case 'mustache': {
        g.fillStyle = '#1E120B';
        const w = size * 0.9;
        g.rotate(Math.sin(t * 3) * 0.06);
        for (const sgn of [-1, 1]) {
          g.beginPath();
          g.moveTo(0, 0);
          g.bezierCurveTo(sgn * w * 0.3, -w * 0.18, sgn * w * 0.55, w * 0.1, sgn * w * 0.62, -w * 0.12);
          g.bezierCurveTo(sgn * w * 0.7, -w * 0.3, sgn * w * 0.85, -w * 0.05, sgn * w * 0.6, w * 0.08);
          g.bezierCurveTo(sgn * w * 0.45, w * 0.18, sgn * w * 0.2, w * 0.12, 0, w * 0.05);
          g.fill();
        }
        break;
      }
      case 'googly': {
        for (const sx of [-1, 1]) {
          const ex = sx * size * 0.32, ey = -size * 0.3;
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(ex, ey, size * 0.22, 0, TAU); g.fill();
          g.strokeStyle = '#1E120B'; g.lineWidth = size * 0.03; g.stroke();
          g.fillStyle = '#1E120B';
          g.beginPath(); g.arc(ex + Math.sin(t * 9 + sx) * size * 0.08, ey + Math.cos(t * 7) * size * 0.08 + size * 0.06, size * 0.1, 0, TAU); g.fill();
        }
        break;
      }
      case 'partyhat': {
        g.translate(0, -size * 0.75);
        g.rotate(0.25 + Math.sin(t * 4) * 0.08);
        g.fillStyle = '#E86F5A';
        g.beginPath(); g.moveTo(-size * 0.28, 0); g.lineTo(0, -size * 0.7); g.lineTo(size * 0.28, 0); g.fill();
        g.fillStyle = '#E8C46A';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.arc((i - 1.5) * size * 0.12, -size * 0.12 - i * size * 0.13, size * 0.04, 0, TAU); g.fill(); }
        g.fillStyle = '#F6EFE3'; g.beginPath(); g.arc(0, -size * 0.72, size * 0.07, 0, TAU); g.fill();
        break;
      }
      default:
        break;
    }
    g.restore();
  }

  /** wobble curse: horizontal displacement for a given y (logical) */
  wobble(y: number, t: number) {
    if (this.curse !== 'wobble') return 0;
    return Math.sin(y / 40 + t * 5) * 14 * this.intensity;
  }

  cssFilter(t: number) {
    if (this.curse !== 'disco') return '';
    return `hue-rotate(${Math.round((t * 120) % 360)}deg) saturate(1.5)`;
  }
}
