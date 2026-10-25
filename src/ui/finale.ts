import { PAINTINGS, PAINTING_ORDER, thumbUrl } from '../art/paintings';
import { drawWorker } from '../art/characters';
import { audio } from '../core/audio';
import { TAU, ease } from '../core/math';
import type { App } from './app';
import { h } from './dom';

/** Stage 30 payoff: a golden wave flies back through every masterpiece in the gallery. */
export function playFinale(app: App) {
  app.save.data.finaleSeen = true;
  app.save.persist();
  const cv = h('canvas');
  const text = h('div', { class: 'finale-text' },
    h('div', { class: 'eyebrow' }, 'The Final Touch'),
    h('h1', { class: 'display' }, 'The Grand Gallery is restored'),
    h('p', null, `${app.save.totalStars()} of 90 stars · ${app.save.data.collection.length} crew badges earned`),
    h('button', { class: 'btn', onclick: () => { el.remove(); app.showMap(30); } }, 'Back to the gallery'),
  );
  const el = h('div', { class: 'finale', 'data-testid': 'finale' }, cv, text);
  app.root.append(el);
  const imgs = PAINTING_ORDER.map((id) => { const i = new Image(); i.src = thumbUrl(id); return i; });
  const g = cv.getContext('2d')!;
  const sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  let t = 0, last = performance.now();
  const revealed = new Set<number>();
  audio.play('fanfare');
  const loop = (now: number) => {
    if (!el.isConnected) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth * dpr, H = cv.clientHeight * dpr;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const bg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#2a1a10'); bg.addColorStop(1, '#0d0805');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const fh = Math.min(H * 0.42, W * 0.5);
    const gap = fh * 0.25;
    const widths = PAINTING_ORDER.map((id) => fh * (PAINTINGS[id].width / PAINTINGS[id].height));
    const total = widths.reduce((a, b) => a + b + gap, 0);
    const k = ease.inOutSine(Math.min(1, t / 6.5));
    const offset = W * 0.5 - widths[0] / 2 - k * (total - widths[0] - gap - widths[9] / 2 - widths[0] / 2 + gap);
    const waveX = W * 0.5 + 40 * dpr;
    const y0 = H * 0.42 - fh / 2;
    let x = offset;
    PAINTING_ORDER.forEach((id, i) => {
      const w = widths[i];
      const ft = fh * 0.05;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x - ft + 8, y0 - ft + 12, w + ft * 2, fh + ft * 2);
      const fg = g.createLinearGradient(x, y0, x + w, y0 + fh);
      fg.addColorStop(0, '#F1D07A'); fg.addColorStop(0.4, '#9A7330'); fg.addColorStop(0.7, '#E2BD62'); fg.addColorStop(1, '#6E5022');
      g.fillStyle = fg; g.fillRect(x - ft, y0 - ft, w + ft * 2, fh + ft * 2);
      const img = imgs[i];
      if (img.complete && img.naturalWidth) {
        g.drawImage(img, x, y0, w, fh);
        // aged veil to the right of the wave
        const cut = Math.max(x, Math.min(x + w, waveX));
        if (cut < x + w) {
          g.fillStyle = 'rgba(70,45,20,0.62)';
          g.fillRect(cut, y0, x + w - cut, fh);
        }
        if (waveX > x + w * 0.5 && !revealed.has(i)) {
          revealed.add(i);
          audio.play('chime', { pitch: 0.8 + i * 0.06 });
          for (let s = 0; s < 40; s++) sparks.push({ x: x + Math.random() * w, y: y0 + Math.random() * fh, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, life: 1 });
        }
      }
      g.fillStyle = 'rgba(246,239,227,0.8)';
      g.font = `600 ${Math.max(12, fh * 0.06)}px "Fraunces Variable", Georgia, serif`;
      g.textAlign = 'center';
      g.fillText(PAINTINGS[id].short, x + w / 2, y0 + fh + ft + fh * 0.12);
      x += w + gap;
    });
    // the golden wave
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 3; layer++) {
      const gr = g.createLinearGradient(waveX - 120 * dpr, 0, waveX + 60 * dpr, 0);
      gr.addColorStop(0, 'rgba(232,196,106,0)');
      gr.addColorStop(0.7, `rgba(255,214,120,${0.35 - layer * 0.08})`);
      gr.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(waveX - 140 * dpr, 0);
      for (let yy = 0; yy <= H; yy += 20) g.lineTo(waveX + Math.sin(yy / 60 + t * 4 + layer) * 30 * dpr, yy);
      g.lineTo(waveX - 140 * dpr, H);
      g.fill();
    }
    g.restore();
    for (const s of sparks) {
      s.life -= dt * 0.8; s.vy += 300 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) continue;
      g.globalAlpha = s.life;
      g.fillStyle = '#FFE9A8';
      g.beginPath(); g.arc(s.x, s.y, 3 * dpr, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // the crew rides the wave
    for (let i = 0; i < 4; i++) drawWorker(g, waveX - (30 + i * 46) * dpr, H * 0.84 + Math.sin(t * 5 + i) * 8, 22 * dpr, { t: t + i, seed: i + 1, state: 'cheer', tool: i % 2 ? 'flag' : 'sponge' });
  };
  requestAnimationFrame(loop);
}
