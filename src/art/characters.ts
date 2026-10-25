import { TAU, RNG } from '../core/math';
import { roundRect, shade, stepT } from './draw';
import { drawHero, type WorkerOpts } from './crew';
import { drawGrimeling, type CritterKind, type CritterOpts } from './grimelings';

export { stepT, roundRect, drawStarShape, shade } from './draw';
export { HEROES, HERO_ORDER, heroForSeed, heroHeight, drawHero, drawTool } from './crew';
export type { WorkerTool, WorkerState, WorkerOpts, HeroId, HeroProfile } from './crew';
export { CRITTER_PROFILES, SPECIES_FOR_KIND, drawGrimeling } from './grimelings';
export type { CritterKind, Mood, CritterOpts, SpeciesId, CritterProfile } from './grimelings';

/** The Tiny Restorers crew — legacy entry point, now rendered by the felt-and-clay hero cast. */
export function drawWorker(g: CanvasRenderingContext2D, x: number, y: number, s: number, o: WorkerOpts) {
  drawHero(g, x, y, s, o);
}

/** Charming-grotesque grime critters — legacy entry point, now one of the Grimeling species. */
export function drawCritter(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: CritterKind, o: CritterOpts) {
  drawGrimeling(g, x, y, r, kind, o);
}

export function drawFrog(g: CanvasRenderingContext2D, x: number, y: number, s: number, o: { t: number; seed?: number; color?: string; state?: 'idle' | 'hop' | 'work' | 'cheer'; tool?: string; facing?: number }) {
  const t = stepT(o.t + (o.seed ?? 0) * 0.3);
  const c = o.color ?? '#5E9A48';
  const hop = o.state === 'hop' ? Math.abs(Math.sin(t * 10)) * s * 0.8 : o.state === 'cheer' ? Math.abs(Math.sin(t * 8)) * s * 0.5 : 0;
  const sq = o.state === 'work' ? 1 + Math.sin(t * 20) * 0.1 : 1;
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(10,20,30,0.25)';
  g.beginPath(); g.ellipse(0, 0, s * 0.8, s * 0.22, 0, 0, TAU); g.fill();
  g.translate(0, -hop);
  g.scale((o.facing ?? 1) / sq, sq);
  g.fillStyle = c;
  g.beginPath(); g.ellipse(-s * 0.55, -s * 0.15, s * 0.32, s * 0.2, 0.3, 0, TAU); g.ellipse(s * 0.55, -s * 0.15, s * 0.32, s * 0.2, -0.3, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(0, -s * 0.5, s * 0.7, s * 0.5, 0, 0, TAU); g.fill();
  g.fillStyle = '#E8E2A0';
  g.beginPath(); g.ellipse(0, -s * 0.35, s * 0.45, s * 0.28, 0, 0, TAU); g.fill();
  for (const ex of [-s * 0.35, s * 0.35]) {
    g.fillStyle = c; g.beginPath(); g.arc(ex, -s * 0.95, s * 0.24, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, -s * 0.97, s * 0.17, 0, TAU); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(ex + s * 0.03, -s * 0.95, s * 0.09, 0, TAU); g.fill();
  }
  g.strokeStyle = '#2A4A1E'; g.lineWidth = s * 0.06;
  g.beginPath(); g.arc(0, -s * 0.62, s * 0.28, 0.3, Math.PI - 0.3); g.stroke();
  // tiny hard hat — they're on the crew too
  g.fillStyle = o.tool === 'tongue' ? '#E86F5A' : o.tool === 'splash' ? '#3A6EA5' : '#F2B630';
  g.beginPath(); g.arc(0, -s * 1.02, s * 0.32, Math.PI, 0); g.fill();
  g.fillRect(-s * 0.4, -s * 1.05, s * 0.8, s * 0.07);
  g.restore();
}

export function drawBoat(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, tilt = 0, crew = 2) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt + Math.sin(t * 3) * 0.05);
  g.fillStyle = 'rgba(10,30,60,0.25)';
  g.beginPath(); g.ellipse(0, s * 0.3, s * 1.2, s * 0.25, 0, 0, TAU); g.fill();
  for (let i = 0; i < crew; i++) drawWorker(g, (i - (crew - 1) / 2) * s * 0.7, -s * 0.05, s * 0.55, { t, seed: i + 3, state: 'work', tool: 'none' });
  g.fillStyle = '#B07A44';
  g.beginPath();
  g.moveTo(-s * 1.2, -s * 0.1); g.lineTo(s * 1.2, -s * 0.1); g.quadraticCurveTo(s * 0.9, s * 0.45, 0, s * 0.45); g.quadraticCurveTo(-s * 0.9, s * 0.45, -s * 1.2, -s * 0.1);
  g.fill();
  g.fillStyle = '#E8D2A0';
  g.fillRect(-s * 1.1, -s * 0.12, s * 2.2, s * 0.08);
  g.restore();
}



/* ------------------------------------------------------------------ decor: the micro-village */

export function drawScaffold(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number) {
  g.save();
  g.strokeStyle = '#8A5A34'; g.lineWidth = s * 0.14; g.lineCap = 'round';
  const levels = Math.max(1, Math.round(h / (s * 2.2)));
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x, y - h);
  g.moveTo(x + w, y); g.lineTo(x + w, y - h);
  for (let i = 0; i <= levels; i++) {
    const yy = y - (h * i) / levels;
    g.moveTo(x, yy); g.lineTo(x + w, yy);
    if (i < levels) { g.moveTo(x, yy); g.lineTo(x + w, yy - h / levels); }
  }
  g.stroke();
  g.fillStyle = '#C9A04E';
  for (let i = 1; i <= levels; i++) g.fillRect(x - s * 0.2, y - (h * i) / levels - s * 0.12, w + s * 0.4, s * 0.18);
  g.restore();
}

export function drawTent(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, label = 'HQ') {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(20,10,5,0.3)';
  g.beginPath(); g.ellipse(0, 0, s * 1.5, s * 0.3, 0, 0, TAU); g.fill();
  g.fillStyle = '#F6EFE3';
  g.beginPath(); g.moveTo(-s * 1.4, 0); g.lineTo(0, -s * 1.6); g.lineTo(s * 1.4, 0); g.fill();
  g.fillStyle = '#E86F5A';
  for (let i = -2; i <= 1; i += 2) {
    g.beginPath(); g.moveTo(0, -s * 1.6); g.lineTo((i * s * 1.4) / 2, 0); g.lineTo(((i + 1) * s * 1.4) / 2, 0); g.fill();
  }
  g.fillStyle = '#3B2418';
  g.beginPath(); g.moveTo(-s * 0.3, 0); g.lineTo(0, -s * 0.8); g.lineTo(s * 0.3, 0); g.fill();
  g.strokeStyle = '#5A3A28'; g.lineWidth = s * 0.06;
  g.beginPath(); g.moveTo(0, -s * 1.6); g.lineTo(0, -s * 2.1); g.stroke();
  g.fillStyle = '#E8C46A';
  g.beginPath(); g.moveTo(0, -s * 2.1); g.lineTo(s * 0.5, -s * 1.95 + Math.sin(t * 6) * s * 0.05); g.lineTo(0, -s * 1.8); g.fill();
  g.font = `800 ${s * 0.32}px "Nunito Variable", system-ui`;
  g.fillStyle = '#3B2418'; g.textAlign = 'center';
  g.fillText(label, 0, -s * 0.95);
  g.restore();
}

export function drawBunting(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, s: number, t: number) {
  const cols = ['#E86F5A', '#E8C46A', '#2F8F8B', '#F6EFE3', '#3A6EA5'];
  const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / (s * 0.9)));
  const sag = s * 1.2;
  g.strokeStyle = 'rgba(59,36,24,0.8)'; g.lineWidth = s * 0.05;
  g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag * 2, x2, y2); g.stroke();
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const px = (1 - u) ** 2 * x1 + 2 * (1 - u) * u * ((x1 + x2) / 2) + u * u * x2;
    const py = (1 - u) ** 2 * y1 + 2 * (1 - u) * u * ((y1 + y2) / 2 + sag * 2) + u * u * y2;
    const sw = Math.sin(t * 3 + i) * 0.15;
    g.fillStyle = cols[i % cols.length];
    g.beginPath(); g.moveTo(px - s * 0.25, py); g.lineTo(px + s * 0.25, py); g.lineTo(px + sw * s, py + s * 0.5); g.fill();
  }
}

export function drawGrimeHut(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, seed: number, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y);
  g.fillStyle = 'rgba(20,10,5,0.35)';
  g.beginPath(); g.ellipse(0, 0, s * 1.1, s * 0.25, 0, 0, TAU); g.fill();
  const rng = new RNG(seed);
  g.fillStyle = '#4A3826';
  g.beginPath();
  g.moveTo(-s * 0.9, 0); g.lineTo(-s * 0.85, -s * 0.9); g.lineTo(s * 0.85, -s * 0.95); g.lineTo(s * 0.9, 0); g.fill();
  g.fillStyle = '#2E2216';
  g.beginPath(); g.moveTo(-s * 1.1, -s * 0.85); g.quadraticCurveTo(0, -s * (1.9 + rng.next() * 0.3), s * 1.1, -s * 0.9); g.fill();
  g.fillStyle = '#F2B850';
  g.fillRect(-s * 0.5, -s * 0.6, s * 0.28, s * 0.25);
  g.fillStyle = '#1A120A';
  roundRect(g, s * 0.15, -s * 0.55, s * 0.35, s * 0.55, s * 0.15); g.fill();
  g.fillStyle = '#3A2A1A';
  g.fillRect(s * 0.4, -s * 1.6, s * 0.22, s * 0.5);
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.6 + i / 3) % 1;
    g.fillStyle = `rgba(70,60,50,${0.4 * (1 - ph)})`;
    g.beginPath(); g.arc(s * 0.5 + Math.sin(ph * 6 + seed) * s * 0.2, -s * 1.7 - ph * s * 1.2, s * (0.15 + ph * 0.3), 0, TAU); g.fill();
  }
  g.restore();
}

export function drawLantern(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  g.save();
  const fl = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
  const gr = g.createRadialGradient(x, y, 0, x, y, s * 3);
  gr.addColorStop(0, `rgba(255,214,120,${0.45 * fl})`);
  gr.addColorStop(1, 'rgba(255,214,120,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, s * 3, 0, TAU); g.fill();
  g.strokeStyle = '#3B2418'; g.lineWidth = s * 0.1;
  g.beginPath(); g.moveTo(x, y - s * 0.5); g.lineTo(x, y - s * 1.6); g.stroke();
  g.fillStyle = '#FFE09A';
  roundRect(g, x - s * 0.3, y - s * 0.5, s * 0.6, s * 0.8, s * 0.15); g.fill();
  g.strokeStyle = '#5A3A28'; g.lineWidth = s * 0.08; g.stroke();
  g.restore();
}

export function drawLadder(g: CanvasRenderingContext2D, x: number, y: number, h: number, s: number, lean = 0.15) {
  g.save();
  g.translate(x, y);
  g.rotate(lean);
  g.strokeStyle = '#A8743E'; g.lineWidth = s * 0.12; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-s * 0.35, 0); g.lineTo(-s * 0.35, -h); g.moveTo(s * 0.35, 0); g.lineTo(s * 0.35, -h); g.stroke();
  g.lineWidth = s * 0.08;
  for (let yy = s * 0.4; yy < h; yy += s * 0.55) { g.beginPath(); g.moveTo(-s * 0.35, -yy); g.lineTo(s * 0.35, -yy); g.stroke(); }
  g.restore();
}

export function drawPigment(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, glow = 0) {
  if (glow > 0) {
    const gr = g.createRadialGradient(x, y, r * 0.5, x, y, r * 2.2);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = glow * 0.5;
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r * 2.2, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.25, color);
  gr.addColorStop(1, shade(color, -0.35));
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

