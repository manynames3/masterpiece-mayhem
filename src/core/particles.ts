import { TAU, clamp } from './math';

export type ParticleKind = 'dust' | 'sparkle' | 'bubble' | 'foam' | 'splat' | 'confetti' | 'drop' | 'star' | 'smoke' | 'ring' | 'text' | 'flake';

interface Particle {
  kind: ParticleKind;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; rot: number; vr: number;
  color: string; gravity: number; drag: number;
  text?: string;
}

const CONFETTI = ['#E8C46A', '#E86F5A', '#2F8F8B', '#3A6EA5', '#F6EFE3', '#9BC46A'];

/** Pooled particle system rendered in play-area logical coordinates. */
export class Particles {
  private list: Particle[] = [];
  scale = 1; // world-size multiplier so effects read well at any play-area size
  reduced = false;
  max = 700;

  clear() { this.list.length = 0; }
  get count() { return this.list.length; }

  emit(kind: ParticleKind, x: number, y: number, n = 1, opts: Partial<Omit<Particle, 'kind'>> & { spread?: number; speed?: number; dir?: number } = {}) {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count && this.list.length < this.max; i++) {
      const spread = opts.spread ?? TAU;
      const dir = opts.dir ?? -Math.PI / 2;
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = (opts.speed ?? 80) * (0.4 + Math.random() * 0.8) * this.scale;
      const base: Particle = {
        kind, x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: opts.max ?? 0.8 + Math.random() * 0.5,
        size: (opts.size ?? 6) * (0.6 + Math.random() * 0.8) * this.scale,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8,
        color: opts.color ?? '#ffffff',
        gravity: (opts.gravity ?? 0) * this.scale, drag: opts.drag ?? 2,
        text: opts.text,
      };
      if (kind === 'confetti') base.color = opts.color ?? CONFETTI[Math.floor(Math.random() * CONFETTI.length)];
      this.list.push(base);
    }
  }

  floatText(x: number, y: number, text: string, color = '#FFF6DA') {
    this.list.push({ kind: 'text', x, y, vx: 0, vy: -50 * this.scale, life: 0, max: 1.1, size: 22 * this.scale, rot: 0, vr: 0, color, gravity: 0, drag: 1.5, text });
  }

  update(dt: number) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life += dt;
      if (p.life >= p.max) { L[i] = L[L.length - 1]; L.pop(); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  render(g: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const t = p.life / p.max;
      const fade = 1 - t;
      g.globalAlpha = clamp(fade * 1.4);
      switch (p.kind) {
        case 'dust':
        case 'smoke': {
          const r = p.size * (1 + t * (p.kind === 'smoke' ? 2.5 : 1.2));
          g.globalAlpha = clamp(fade * 0.55);
          g.fillStyle = p.color;
          g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
          break;
        }
        case 'sparkle':
        case 'star': {
          const r = p.size * (p.kind === 'star' ? 1.3 : 1) * (t < 0.2 ? t * 5 : 1);
          g.fillStyle = p.color;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.beginPath();
          for (let k = 0; k < 8; k++) {
            const rr = k % 2 === 0 ? r : r * 0.28;
            const a = (k / 8) * TAU;
            g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          g.closePath(); g.fill(); g.restore();
          break;
        }
        case 'bubble': {
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.lineWidth = Math.max(1, p.size * 0.18);
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.beginPath(); g.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.22, 0, TAU); g.fill();
          break;
        }
        case 'foam': {
          g.fillStyle = p.color === '#ffffff' ? '#FFFDF5' : p.color;
          g.beginPath(); g.arc(p.x, p.y, p.size * (1 + t * 0.5), 0, TAU); g.fill();
          break;
        }
        case 'splat':
        case 'drop': {
          g.fillStyle = p.color;
          g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx));
          const stretch = 1 + Math.min(2, Math.hypot(p.vx, p.vy) / (200 * this.scale));
          g.beginPath(); g.ellipse(0, 0, p.size * stretch, p.size / stretch, 0, 0, TAU); g.fill();
          g.restore();
          break;
        }
        case 'confetti':
        case 'flake': {
          g.fillStyle = p.color;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.scale(1, Math.cos(p.life * 9 + p.rot));
          g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          g.restore();
          break;
        }
        case 'ring': {
          g.strokeStyle = p.color;
          g.lineWidth = Math.max(1, p.size * 0.25 * fade);
          g.beginPath(); g.arc(p.x, p.y, p.size * (0.3 + t * 3), 0, TAU); g.stroke();
          break;
        }
        case 'text': {
          const s = t < 0.15 ? 0.6 + t * 3 : 1;
          g.save(); g.translate(p.x, p.y); g.scale(s, s);
          g.font = `800 ${p.size}px "Nunito Variable", system-ui, sans-serif`;
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = p.size * 0.22; g.strokeStyle = 'rgba(42,26,18,0.85)';
          g.strokeText(p.text ?? '', 0, 0);
          g.fillStyle = p.color; g.fillText(p.text ?? '', 0, 0);
          g.restore();
          break;
        }
      }
    }
    g.globalAlpha = 1;
  }
}
