import { HERO_ORDER, drawCritter, drawHero, drawWorker, heroHeight, type WorkerTool } from '../art/characters';
import { drawSponge } from '../art/props';
import { PAINTINGS, thumbUrl } from '../art/paintings';
import { grimeTexture, GRIME } from '../art/textures';
import { TAU } from '../core/math';
import type { App } from './app';
import { h } from './dom';
import { icon } from './icons';
import { STAGE_COUNT, getStage } from '../data/stages';

/** "Museum restoration desk": an easel where the crew is already busy scrubbing Mona Lisa. */
export function createTitle(app: App): HTMLElement {
  const save = app.save;
  const highest = save.highestUnlocked(STAGE_COUNT);
  const anyProgress = Object.keys(save.data.stages).length > 0;
  const next = getStage(Math.min(highest, STAGE_COUNT));
  const cv = h('canvas', { 'aria-label': 'Tiny restorers scrubbing the Mona Lisa on an easel' });
  const stars = save.totalStars();
  const crewCv = h('canvas', { class: 'title-crew', 'aria-label': 'The Tiny Restorers: Pip, Professor Bristlebrow, Big Mo and Zuzu, with two grime critters sneaking up' });
  const root = h('div', { class: 'screen title-screen' },
    h('div', { class: 'title-lamp' }),
    h('div', { class: 'title-desk' }),
    h('div', { class: 'title-corner' },
      h('button', { class: 'icon-btn', 'aria-label': 'Settings', html: icon('settings'), onclick: () => app.openSettings() }),
    ),
    h('div', { class: 'title-stage' },
      h('div', { class: 'title-left' },
        h('div', { class: 'title-logo' },
          h('div', { class: 'eyebrow' }, 'The Grand Gallery presents'),
          h('div', { class: 'display', html: 'Masterpiece<br><em>Mayhem</em>' }),
          h('div', { class: 'title-sub' }, 'Tiny Restorers'),
        ),
        h('div', { class: 'title-actions' },
          h('button', {
            class: 'btn', 'data-testid': 'play',
            onclick: () => (anyProgress ? app.showMap(highest) : app.playStage(1)),
            html: `${icon('play')} ${anyProgress ? `Continue · Stage ${highest}` : 'Begin restoring'}`,
          }),
          h('div', { class: 'title-row' },
            h('button', { class: 'btn secondary', 'data-testid': 'open-map', onclick: () => app.showMap(), html: `${icon('map')} Gallery map` }),
            h('button', { class: 'btn secondary', 'data-testid': 'open-cast', onclick: () => app.showCast(), html: `${icon('crew')} Crew &amp; Critters` }),
          ),
          h('div', { class: 'title-meta' },
            h('span', { html: `<b>30</b> stages` }),
            h('span', { html: `<b>10</b> masterpieces` }),
            h('span', { html: `<b>${stars}</b>/90 ★` }),
          ),
        ),
      ),
      h('div', { class: 'title-easel' }, cv),
    ),
    crewCv,
    h('div', { class: 'title-foot' },
      'Fantastical game — not real conservation advice. Paintings: public-domain reproductions via Wikimedia Commons. ',
      h('button', { onclick: () => app.openCredits() }, 'Art credits'),
      next && anyProgress ? ` · Next: ${next.title}` : '',
    ),
  );
  startAttract(cv);
  startEnsemble(crewCv, app.save.data.settings.reducedMotion);
  return root;
}

function startAttract(cv: HTMLCanvasElement) {
  const img = new Image();
  img.src = thumbUrl('mona-lisa');
  let raf = 0;
  const g = cv.getContext('2d')!;
  const def = PAINTINGS['mona-lisa'];
  const grime = document.createElement('canvas');
  const gctx = grime.getContext('2d')!;
  let t = 0, last = performance.now(), cycle = -1;
  const loop = (now: number) => {
    if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cycle = -1; }
    const s = W / 330;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    // easel
    g.strokeStyle = '#6E4428'; g.lineWidth = 12 * s; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W * 0.3, H * 0.06); g.lineTo(W * 0.14, H * 0.99); g.moveTo(W * 0.7, H * 0.06); g.lineTo(W * 0.86, H * 0.99); g.moveTo(W * 0.5, H * 0.1); g.lineTo(W * 0.5, H * 0.97); g.stroke();
    // painting rect
    const pw = W * 0.74, ph = pw * (def.height / def.width);
    const px = (W - pw) / 2, py = H * 0.04;
    const ft = 12 * s;
    const fg = g.createLinearGradient(px, py, px + pw, py + ph);
    fg.addColorStop(0, '#F1D07A'); fg.addColorStop(0.4, '#9A7330'); fg.addColorStop(0.7, '#E2BD62'); fg.addColorStop(1, '#6E5022');
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(px - ft + 6 * s, py - ft + 10 * s, pw + ft * 2, ph + ft * 2);
    g.fillStyle = fg; g.fillRect(px - ft, py - ft, pw + ft * 2, ph + ft * 2);
    if (img.complete && img.naturalWidth) g.drawImage(img, px, py, pw, ph);
    else { g.fillStyle = '#4A3A24'; g.fillRect(px, py, pw, ph); }
    // grime layer that the sponge eats through; resets every cycle
    const cyc = Math.floor(t / 9);
    if (cyc !== cycle) {
      cycle = cyc;
      grime.width = Math.round(pw); grime.height = Math.round(ph);
      gctx.globalCompositeOperation = 'source-over';
      gctx.drawImage(grimeTexture(Math.round(pw), Math.round(ph), { ...GRIME.soot, seed: 4 }), 0, 0);
      gctx.globalAlpha = 0.25;
      gctx.fillStyle = '#2E2216';
      gctx.fillRect(0, 0, pw, ph);
      gctx.globalAlpha = 1;
    }
    const lt = t % 9;
    const sx = pw * (0.5 + Math.sin(lt * 2.1) * 0.32);
    const sy = ph * (0.18 + (lt / 9) * 0.55 + Math.sin(lt * 5.3) * 0.05);
    if (lt < 7.5) {
      gctx.globalCompositeOperation = 'destination-out';
      gctx.beginPath(); gctx.arc(sx, sy, 22 * s, 0, TAU); gctx.fill();
    }
    g.globalAlpha = lt > 8.2 ? 1 - (lt - 8.2) / 0.8 : 1;
    g.drawImage(grime, px, py);
    g.globalAlpha = 1;
    // soot critter peeking from the frame corner
    const near = lt < 7.5 && Math.hypot(sx - pw * 0.86, sy - ph * 0.84) < 90 * s;
    drawCritter(g, px + pw * 0.86, py + ph * 0.84 + Math.sin(t * 2) * 3 * s, 17 * s, 'soot', { t, seed: 3, mood: near ? 'panic' : 'sneak', hat: 'none', lookX: (sx - pw * 0.86) / (pw * 0.3), lookY: (sy - ph * 0.84) / (ph * 0.3) });
    if (lt < 7.5) drawSponge(g, px + sx, py + sy, 34 * s, Math.abs(Math.sin(lt * 9)) * 0.5, -0.3 + Math.sin(lt * 9) * 0.1);
    // crew on the easel ledge
    const ly = py + ph + ft + 8 * s;
    g.fillStyle = '#8A5A34'; g.fillRect(px - ft * 1.4, ly, pw + ft * 2.8, 9 * s);
    drawWorker(g, px + pw * 0.16, ly, 17 * s, { t, hero: 'zuzu', state: 'idle', tool: 'flag' });
    drawWorker(g, px + pw * 0.82, ly, 15 * s, { t, hero: 'bristle', state: 'work', tool: 'brush', facing: -1, lookY: -0.6 });
  };
  raf = requestAnimationFrame(loop);
}

/** The hero line-up on the desk: big, readable, eyes on your pointer, taking turns showing off. */
function startEnsemble(cv: HTMLCanvasElement, reduced: boolean) {
  const g = cv.getContext('2d')!;
  const pointer = { x: -1, y: -1 };
  const onMove = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; };
  window.addEventListener('pointermove', onMove, { passive: true });
  const tools: WorkerTool[] = ['sponge', 'brush', 'bucket', 'lantern'];
  const order = [0, 2, 1, 3];
  let raf = 0, t = 0, last = performance.now();
  const loop = (now: number) => {
    if (!cv.isConnected && t > 0) { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); return; }
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += reduced ? dt * 0.35 : dt;
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const ground = H * 0.94;
    const span = Math.min(W * 0.84, H * 4.6);
    // whoever's turn it is performs their signature move
    const turn = Math.floor(t / 2.6) % 4;
    HERO_ORDER.forEach((id, i) => {
      const k = order[i];
      const x = W / 2 + (k - 1.5) * (span / 4);
      const s = Math.min((H * 0.8) / heroHeight(id), span / 4 / 1.85) * (id === 'mo' ? 0.96 : id === 'zuzu' ? 0.9 : 1);
      const cx = r.left + x / dpr, cy = r.top + (ground - H * 0.5) / dpr;
      const look = pointer.x < 0 ? { x: Math.sin(t * 0.6 + i) * 0.7, y: -0.1 } : { x: clamp1((pointer.x - cx) / 260), y: clamp1((pointer.y - cy) / 260) };
      const performing = !reduced && turn === i;
      drawHero(g, x, ground, s, { t: t + i * 0.5, hero: id, seed: i, state: performing ? 'signature' : 'idle', tool: performing ? 'none' : tools[i], carry: '#9BC6E0', lookX: look.x, lookY: look.y, facing: k < 2 ? 1 : -1 });
    });
    // two grimelings sneaking in from the wings
    const cr = Math.min(H * 0.15, span * 0.045);
    const peek = Math.sin(t * 0.8) * 0.5 + 0.5;
    drawCritter(g, W / 2 - span / 2 - cr * (0.6 - peek * 0.8), ground - cr * 0.9, cr, 'soot', { t, seed: 3, mood: turn === 0 ? 'surprised' : 'sneak', hat: 'none', lookX: 1 });
    drawCritter(g, W / 2 + span / 2 + cr * (0.6 - peek * 0.8), ground - cr * 0.9, cr * 0.9, 'dust', { t: t + 1, seed: 5, mood: turn === 3 ? 'panic' : 'giggle', hat: 'none', lookX: -1 });
  };
  raf = requestAnimationFrame(loop);
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
