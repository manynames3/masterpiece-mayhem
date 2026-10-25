import {
  CRITTER_PROFILES, HEROES, HERO_ORDER, drawCritter, drawHero, heroHeight,
  type CritterProfile, type HeroId, type Mood, type WorkerState, type WorkerTool,
} from '../art/characters';
import { audio } from '../core/audio';
import type { App } from './app';
import { h } from './dom';
import { icon } from './icons';

type Painter = (g: CanvasRenderingContext2D, W: number, H: number, t: number, look: { x: number; y: number }) => void;

interface Portrait { cv: HTMLCanvasElement; paint: Painter }

const HERO_POSES: { label: string; state: WorkerState }[] = [
  { label: 'Idle', state: 'idle' },
  { label: 'Scrub', state: 'work' },
  { label: 'Signature', state: 'signature' },
  { label: 'Yikes!', state: 'scared' },
  { label: 'Dizzy', state: 'dizzy' },
];

const CRITTER_MOODS: { label: string; mood: Mood }[] = [
  { label: 'Mischief', mood: 'sneak' },
  { label: 'Surprise', mood: 'surprised' },
  { label: 'Panic', mood: 'panic' },
  { label: 'Surrender', mood: 'surrender' },
  { label: 'Celebrate', mood: 'celebrate' },
];

const HERO_BG: Record<HeroId, [string, string]> = {
  pip: ['#2C6E6A', '#173B39'],
  bristle: ['#6E5A3E', '#33281B'],
  mo: ['#3B5B86', '#1C2B42'],
  zuzu: ['#8A4A3A', '#3F211A'],
};

/** "Crew & Critters": large living portraits of every character, with pose and mood switches. */
export function createCast(app: App): HTMLElement {
  const portraits: Portrait[] = [];
  const pointer = { x: -1, y: -1 };

  const portrait = (label: string, paint: Painter, cls = '') => {
    const cv = h('canvas', { class: `cast-portrait ${cls}`, role: 'img', 'aria-label': label });
    portraits.push({ cv, paint });
    return cv;
  };

  const chips = <T,>(items: { label: string; value: T }[], initial: number, onPick: (v: T) => void, groupLabel: string) => {
    const row = h('div', { class: 'cast-chips', role: 'group', 'aria-label': groupLabel });
    const btns = items.map((it, i) => {
      const b = h('button', { class: 'chip', 'aria-pressed': String(i === initial) }, it.label);
      b.addEventListener('click', () => {
        btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        audio.play('tap');
        onPick(it.value);
      });
      return b;
    });
    row.append(...btns);
    return row;
  };

  // ---------------------------------------------------------------- heroes
  const heroGrid = h('div', { class: 'cast-grid heroes' });
  HERO_ORDER.forEach((id, i) => {
    const p = HEROES[id];
    let state: WorkerState = 'signature';
    const tool: WorkerTool = p.tool;
    const cv = portrait(`${p.name}, ${p.role}`, (g, W, H, t, look) => {
      backdrop(g, W, H, HERO_BG[id]);
      const s = (H * 0.58) / heroHeight(id);
      drawHero(g, W / 2, H * 0.86, s, { t: t + i * 0.4, hero: id, seed: i, state, tool: state === 'signature' ? 'none' : tool, lookX: look.x, lookY: look.y, carry: '#9BC6E0' });
    });
    heroGrid.append(h('article', { class: 'cast-card', 'data-hero': id, style: `--accent:${p.color}` },
      h('div', { class: 'cast-frame' }, cv),
      h('div', { class: 'cast-body' },
        h('div', { class: 'eyebrow' }, p.role),
        h('h3', { class: 'display' }, p.name),
        h('p', { class: 'cast-tag' }, p.tagline),
        h('p', null, p.personality),
        h('p', { class: 'cast-sig' }, h('b', null, 'Signature move: '), p.signature),
        h('p', { class: 'cast-motif' }, p.motif),
        chips(HERO_POSES.map((x) => ({ label: x.label, value: x.state })), 2, (v) => { state = v; }, `${p.name} poses`),
      ),
    ));
  });

  // ---------------------------------------------------------------- grimelings
  const critterGrid = h('div', { class: 'cast-grid critters' });
  CRITTER_PROFILES.forEach((p: CritterProfile, i) => {
    let mood: Mood = p.kind === 'gold' ? 'celebrate' : 'sneak';
    const cv = portrait(`${p.name}, ${p.species}`, (g, W, H, t, look) => {
      backdrop(g, W, H, p.boss ? ['#3E5A2A', '#16210F'] : ['#4A3A2C', '#1E150F']);
      const r = p.boss ? H * 0.27 : H * 0.25;
      drawCritter(g, W / 2, H * 0.52, r, p.kind, { t: t + i * 0.3, seed: i * 3 + 1, mood, lookX: look.x, lookY: look.y, hat: p.boss ? 'crown' : 'none' });
    }, p.boss ? 'boss' : '');
    critterGrid.append(h('article', { class: `cast-card critter ${p.boss ? 'boss' : ''}`, 'data-critter': p.id },
      h('div', { class: 'cast-frame' }, cv),
      h('div', { class: 'cast-body' },
        h('div', { class: 'eyebrow' }, p.boss ? `Boss · ${p.species}` : p.species),
        h('h3', { class: 'display' }, p.name),
        h('p', { class: 'cast-tag' }, p.tagline),
        h('p', null, p.personality),
        h('dl', { class: 'cast-facts' },
          h('dt', null, 'Mischief'), h('dd', null, p.mischief),
          h('dt', null, 'Weakness'), h('dd', null, p.weakness),
        ),
        chips(CRITTER_MOODS.map((x) => ({ label: x.label, value: x.mood })), p.kind === 'gold' ? 4 : 0, (v) => { mood = v; }, `${p.name} moods`),
      ),
    ));
  });

  // ---------------------------------------------------------------- scale check (20 / 48 / 200 px)
  const scaleCv = portrait('Every character at 20, 48 and 200 pixels tall', (g, W, H, t) => {
    g.fillStyle = '#21160F'; g.fillRect(0, 0, W, H);
    const dpr = W / (g.canvas.getBoundingClientRect().width || W);
    const rows = [20, 48];
    g.fillStyle = 'rgba(246,239,227,0.6)';
    g.font = `800 ${11 * dpr}px "Nunito Variable", system-ui`;
    const cast: ({ hero: HeroId } | { kind: CritterProfile['kind'] })[] = [...HERO_ORDER.map((hero) => ({ hero })), ...CRITTER_PROFILES.map((p) => ({ kind: p.kind }))];
    let y = 14 * dpr;
    for (const px of rows) {
      const ph = px * dpr;
      g.fillText(`${px}px`, 8 * dpr, y + ph * 0.6);
      const step = (W - 60 * dpr) / cast.length;
      cast.forEach((c, i) => {
        const x = 60 * dpr + step * (i + 0.5);
        if ('hero' in c) drawHero(g, x, y + ph, ph / heroHeight(c.hero), { t, hero: c.hero, seed: i, state: 'idle' });
        else drawCritter(g, x, y + ph * 0.55, ph * 0.45, c.kind, { t, seed: i, mood: 'giggle', hat: 'none' });
      });
      y += ph + 18 * dpr;
    }
  });

  const scroll = h('div', { class: 'map-scroll cast-scroll' },
    h('section', { class: 'cast-intro' },
      h('div', { class: 'eyebrow' }, 'Meet the cast'),
      h('h2', { class: 'display' }, 'Four tiny heroes. A gallery full of grime.'),
      h('p', null, 'Every character is sculpted live in code — felt-and-clay shading, stop-motion timing, eyes that follow your pointer. Tap a pose or mood to see them act.'),
    ),
    h('h2', { class: 'cast-h display' }, 'The Tiny Restorers'),
    heroGrid,
    h('h2', { class: 'cast-h display' }, 'The Grimelings'),
    critterGrid,
    h('h2', { class: 'cast-h display' }, 'Scale check'),
    h('p', { class: 'cast-note' }, 'Readability test: the same characters at 20px and 48px tall — the sizes they appear at in play. Portraits above are ~200px.'),
    h('div', { class: 'cast-scale' }, scaleCv),
  );

  const root = h('div', { class: 'screen map-screen cast-screen', 'data-testid': 'cast-screen' },
    h('header', { class: 'map-header' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back to the restoration desk', 'data-testid': 'cast-back', html: icon('back'), onclick: () => app.showTitle() }),
      h('h1', { class: 'display' }, 'Crew & Critters'),
      h('button', { class: 'btn small', onclick: () => app.playStage(app.save.highestUnlocked(30)), html: `${icon('play')} Play` }),
    ),
    scroll,
  );

  root.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  const reduced = app.save.data.settings.reducedMotion;
  let raf = 0, t = 0, last = performance.now();
  const loop = (now: number) => {
    if (!root.isConnected && t > 0) { cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += reduced ? dt * 0.35 : dt;
    const vh = window.innerHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const p of portraits) {
      const r = p.cv.getBoundingClientRect();
      if (r.bottom < -40 || r.top > vh + 40 || r.width === 0) continue;
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      if (p.cv.width !== W || p.cv.height !== H) { p.cv.width = W; p.cv.height = H; }
      const g = p.cv.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      const look = pointer.x < 0
        ? { x: Math.sin(t * 0.7) * 0.6, y: 0 }
        : { x: clamp1((pointer.x - (r.left + r.width / 2)) / 220), y: clamp1((pointer.y - (r.top + r.height * 0.4)) / 220) };
      p.paint(g, W, H, t, look);
    }
  };
  raf = requestAnimationFrame(loop);
  return root;
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

function backdrop(g: CanvasRenderingContext2D, W: number, H: number, [a, b]: [string, string]) {
  const gr = g.createRadialGradient(W * 0.45, H * 0.35, H * 0.05, W / 2, H / 2, Math.max(W, H) * 0.75);
  gr.addColorStop(0, a); gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // painted "stage" the character stands on
  g.fillStyle = 'rgba(255,235,200,0.08)';
  g.beginPath(); g.ellipse(W / 2, H * 0.87, W * 0.42, H * 0.08, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = Math.max(2, H * 0.012); g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const y = H * (0.1 + i * 0.09);
    g.beginPath(); g.moveTo(W * 0.05, y); g.quadraticCurveTo(W * 0.5, y + H * 0.05 * Math.sin(i), W * 0.95, y - H * 0.02); g.stroke();
  }
}
