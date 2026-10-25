import { TAU } from '../core/math';
import { drawCritter, drawWorker, roundRect, drawStarShape } from './characters';

export type HiddenIcon = 'painter' | 'sleeper' | 'key' | 'snail' | 'apple' | 'candle' | 'ring' | 'crewmate' | 'cherub' | 'dove';

/** Tiny secrets painted into reflections — revealed by careful cleaning. */
export function drawHiddenObject(g: CanvasRenderingContext2D, icon: HiddenIcon, x: number, y: number, s: number, t: number) {
  g.save();
  g.translate(x, y);
  switch (icon) {
    case 'painter':
      g.fillStyle = '#2E4A8A'; roundRect(g, -s * 0.3, -s * 0.2, s * 0.6, s * 0.9, s * 0.2); g.fill();
      g.fillStyle = '#E2B48A'; g.beginPath(); g.arc(0, -s * 0.45, s * 0.28, 0, TAU); g.fill();
      g.fillStyle = '#B33A22'; g.beginPath(); g.ellipse(0, -s * 0.7, s * 0.32, s * 0.14, 0, 0, TAU); g.fill();
      g.strokeStyle = '#8A5A34'; g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(s * 0.3, 0); g.lineTo(s * 0.7, -s * 0.4); g.stroke();
      break;
    case 'sleeper':
      drawCritter(g, 0, 0, s * 0.5, 'soot', { t, seed: 2, mood: 'sleepy', legs: false });
      g.fillStyle = '#F6EFE3'; g.font = `800 ${s * 0.4}px system-ui`; g.fillText('z', s * 0.45, -s * 0.5 - Math.sin(t * 2) * s * 0.1);
      break;
    case 'key':
      g.strokeStyle = '#E8C46A'; g.lineWidth = s * 0.14;
      g.beginPath(); g.arc(-s * 0.3, 0, s * 0.22, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.08, 0); g.lineTo(s * 0.55, 0); g.moveTo(s * 0.4, 0); g.lineTo(s * 0.4, s * 0.2); g.moveTo(s * 0.55, 0); g.lineTo(s * 0.55, s * 0.25); g.stroke();
      break;
    case 'snail':
      g.fillStyle = '#C9A88A'; g.beginPath(); g.ellipse(0, s * 0.25, s * 0.6, s * 0.15, 0, 0, TAU); g.fill();
      g.fillStyle = '#B07A44'; g.beginPath(); g.arc(-s * 0.05, -s * 0.05, s * 0.35, 0, TAU); g.fill();
      g.strokeStyle = '#6A4424'; g.lineWidth = s * 0.06; g.beginPath(); g.arc(-s * 0.05, -s * 0.05, s * 0.18, 0, 5); g.stroke();
      g.strokeStyle = '#C9A88A'; g.beginPath(); g.moveTo(s * 0.45, s * 0.15); g.lineTo(s * 0.55, -s * 0.2); g.stroke();
      break;
    case 'apple':
      g.fillStyle = '#C2402E'; g.beginPath(); g.arc(-s * 0.15, 0, s * 0.32, 0, TAU); g.arc(s * 0.15, 0, s * 0.32, 0, TAU); g.fill();
      g.fillStyle = '#5E9A48'; g.beginPath(); g.ellipse(s * 0.12, -s * 0.4, s * 0.16, s * 0.08, -0.6, 0, TAU); g.fill();
      break;
    case 'candle': {
      g.fillStyle = '#F6EFE3'; g.fillRect(-s * 0.12, -s * 0.2, s * 0.24, s * 0.7);
      const f = 1 + Math.sin(t * 14) * 0.15;
      g.fillStyle = '#FFB54A'; g.beginPath(); g.ellipse(0, -s * 0.35, s * 0.1 * f, s * 0.2 * f, 0, 0, TAU); g.fill();
      break;
    }
    case 'ring':
      g.strokeStyle = '#E8C46A'; g.lineWidth = s * 0.12; g.beginPath(); g.arc(0, 0, s * 0.3, 0, TAU); g.stroke();
      drawStarShape(g, 0, -s * 0.36, s * 0.14, '#BFE6F2', 4);
      break;
    case 'crewmate':
      drawWorker(g, 0, s * 0.5, s * 0.55, { t, seed: 4, state: 'cheer', tool: 'flag' });
      break;
    case 'cherub':
      g.fillStyle = '#F2D2B0'; g.beginPath(); g.arc(0, 0, s * 0.35, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.ellipse(-s * 0.4, -s * 0.1, s * 0.25, s * 0.14, -0.5 + Math.sin(t * 8) * 0.2, 0, TAU); g.ellipse(s * 0.4, -s * 0.1, s * 0.25, s * 0.14, 0.5 - Math.sin(t * 8) * 0.2, 0, TAU); g.fill();
      break;
    case 'dove':
      g.fillStyle = '#FBF7EE'; g.beginPath(); g.ellipse(0, 0, s * 0.4, s * 0.2, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-s * 0.1, 0); g.lineTo(-s * 0.3, -s * 0.45); g.lineTo(s * 0.2, -s * 0.05); g.fill();
      break;
  }
  g.restore();
}

/** Classic tool sprites for in-world cursors. */
export function drawSponge(g: CanvasRenderingContext2D, x: number, y: number, s: number, squish = 0, angle = -0.3) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(1 + squish * 0.18, 1 - squish * 0.22);
  g.fillStyle = 'rgba(20,10,5,0.25)';
  roundRect(g, -s * 0.55 + 4, -s * 0.38 + 6, s * 1.1, s * 0.76, s * 0.18); g.fill();
  g.fillStyle = '#F4D35E';
  roundRect(g, -s * 0.55, -s * 0.38, s * 1.1, s * 0.6, s * 0.18); g.fill();
  g.fillStyle = '#3E9B83';
  roundRect(g, -s * 0.55, s * 0.12, s * 1.1, s * 0.26, s * 0.1); g.fill();
  g.fillStyle = 'rgba(180,140,40,0.55)';
  for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(-s * 0.4 + (i % 4) * s * 0.26 + (i > 3 ? s * 0.13 : 0), -s * 0.2 + (i > 3 ? s * 0.18 : 0), s * 0.05, 0, TAU); g.fill(); }
  g.restore();
}

export function drawBrushTool(g: CanvasRenderingContext2D, x: number, y: number, s: number, angle = -0.6) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = '#8A5A34'; roundRect(g, -s * 0.08, -s * 1.3, s * 0.16, s * 0.9, s * 0.08); g.fill();
  g.fillStyle = '#C9C2B4'; g.fillRect(-s * 0.14, -s * 0.45, s * 0.28, s * 0.18);
  g.fillStyle = '#E8C46A';
  g.beginPath(); g.moveTo(-s * 0.16, -s * 0.28); g.quadraticCurveTo(-s * 0.2, s * 0.2, 0, s * 0.3); g.quadraticCurveTo(s * 0.2, s * 0.2, s * 0.16, -s * 0.28); g.fill();
  g.restore();
}

export function drawNozzle(g: CanvasRenderingContext2D, x: number, y: number, s: number, active: boolean, t: number) {
  g.save();
  g.translate(x, y);
  if (active) {
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 2.5 + i / 3) % 1;
      g.globalAlpha = 1 - ph;
      g.beginPath(); g.arc(0, 0, s * (1.6 - ph * 1.2), 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }
  g.fillStyle = 'rgba(20,10,5,0.3)'; g.beginPath(); g.ellipse(4, 8, s * 0.7, s * 0.4, 0, 0, TAU); g.fill();
  g.fillStyle = '#E86F5A'; roundRect(g, -s * 0.5, -s * 0.5, s, s * 0.8, s * 0.25); g.fill();
  g.fillStyle = '#2A1A12'; g.beginPath(); g.ellipse(0, s * 0.3, s * 0.42, s * 0.18, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(-s * 0.2, -s * 0.3, s * 0.18, s * 0.08, -0.3, 0, TAU); g.fill();
  g.strokeStyle = '#5A6266'; g.lineWidth = s * 0.25; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, -s * 0.5); g.quadraticCurveTo(s * 0.4, -s * 1.4, s * 1.4, -s * 1.8); g.stroke();
  g.restore();
}

export function drawFragileZone(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, hot = 0) {
  g.save();
  g.setLineDash([r * 0.18, r * 0.12]);
  g.lineDashOffset = -t * 20;
  g.strokeStyle = hot > 0 ? `rgba(232,111,90,${0.7 + hot * 0.3})` : 'rgba(232,196,106,0.85)';
  g.lineWidth = Math.max(2, r * 0.06);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.setLineDash([]);
  g.fillStyle = hot > 0 ? `rgba(232,111,90,${0.15 + hot * 0.25})` : 'rgba(232,196,106,0.08)';
  g.fill();
  // tiny caution tag
  g.fillStyle = '#F6EFE3';
  roundRect(g, x - r * 0.42, y - r - r * 0.32, r * 0.84, r * 0.28, r * 0.08); g.fill();
  g.fillStyle = '#B33A22';
  g.font = `900 ${r * 0.18}px "Nunito Variable", system-ui`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('FRAGILE', x, y - r - r * 0.18);
  g.restore();
}
