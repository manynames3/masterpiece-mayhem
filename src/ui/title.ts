import { PAINTINGS, thumbUrl } from '../art/paintings';
import { audio } from '../core/audio';
import type { App } from './app';
import { h } from './dom';
import { mountMenuScene } from './menu/scene';
import { STAGE_COUNT, getStage } from '../data/stages';

/**
 * Main menu — "Design #4": a warm gallery hall, a gilded Vermeer under amber varnish, and the real
 * Tiny Restorers at work on the frame. Every control is a real button routed through App.
 */
export function createTitle(app: App): HTMLElement {
  const save = app.save;
  const reduced = save.data.settings.reducedMotion;
  const highest = save.highestUnlocked(STAGE_COUNT);
  const anyProgress = Object.keys(save.data.stages).length > 0;
  const next = getStage(Math.min(highest, STAGE_COUNT));
  const stars = save.totalStars();
  const pearl = PAINTINGS['pearl-earring'];

  // ---- the scene (right / middle)
  const img = h('img', { class: 'menu-painting', alt: '', decoding: 'async', draggable: 'false' });
  const grime = h('canvas', { class: 'menu-grime', 'data-testid': 'menu-grime', 'aria-label': `${pearl.title} by ${pearl.artist}, under centuries of amber varnish. Drag across it to wipe the grime away.`, role: 'img' });
  const frame = h('div', { class: 'gilt-frame' },
    ...(['tl', 'tr', 'bl', 'br'] as const).map((c) => h('span', { class: `gilt-orn ${c}`, html: CORNER_SVG })),
    h('span', { class: 'gilt-crest', html: CREST_SVG }),
    h('div', { class: 'gilt-inner' }, img, grime, h('div', { class: 'gilt-sheen' })),
  );
  const plaque = h('div', { class: 'menu-plaque' }, h('b', null, pearl.title), h('span', null, `${pearl.artist} · ${pearl.year}`));
  const crew = h('canvas', { class: 'title-crew menu-crew', 'data-testid': 'menu-crew', 'aria-label': 'The Tiny Restorers at work: Pip scrubs from the scaffold, Professor Bristlebrow inspects the frame, Big Mo steadies the ladder, and Zuzu tails a soot smudger by lantern-light.' });
  const hint = h('p', { class: 'menu-hint', 'aria-hidden': 'true' }, h('span', { html: HAND_SVG }), 'Drag to wipe');
  const sceneEl = h('section', { class: 'menu-scene', 'aria-label': 'The Grand Gallery' },
    h('div', { class: 'distant d2', 'aria-hidden': 'true' }, h('img', { src: thumbUrl('starry-night'), alt: '' })),
    frame, plaque, crew,
    hint,
  );

  // ---- brand + actions (left)
  const brand = h('header', { class: 'menu-brand' },
    h('div', { class: 'menu-eyebrow' }, 'The Grand Gallery presents'),
    h('h1', { class: 'menu-logo', 'aria-label': 'Masterpiece Mayhem: Tiny Restorers' },
      h('span', { class: 'logo-master', 'aria-hidden': 'true' }, 'Masterpiece'),
      h('span', { class: 'logo-mayhem', 'aria-hidden': 'true' }, h('span', { class: 'logo-stroke', html: STROKE_SVG }), h('span', { class: 'logo-word' }, 'Mayhem')),
      h('span', { class: 'logo-sub', 'aria-hidden': 'true' }, h('i'), 'Tiny Restorers', h('i')),
    ),
  );

  let leaving = false;
  const go = (fn: () => void) => () => {
    if (leaving) return;
    leaving = true;
    audio.play('tap');
    root.classList.add('menu-go');
    setTimeout(fn, reduced ? 0 : 340);
  };
  const playLabel = anyProgress ? 'Continue' : 'Play';
  const playSub = anyProgress && next ? `Stage ${highest} · ${next.title}` : `Stage 1 · ${getStage(1)?.title ?? 'Begin restoring'}`;
  const btn = (cls: string, testid: string, label: string, sub: string, ic: string, onclick: () => void) =>
    h('button', { class: `mbtn ${cls}`, 'data-testid': testid, onclick },
      h('span', { class: 'mbtn-medal', html: ic }),
      h('span', { class: 'mbtn-text' }, h('span', { class: 'mbtn-label' }, label), h('span', { class: 'mbtn-sub' }, sub)),
    );
  const nav = h('nav', { class: 'menu-actions', 'aria-label': 'Main menu' },
    btn('mbtn-play', 'play', playLabel, playSub, I.play, go(() => (anyProgress ? app.showMap(highest) : app.playStage(1)))),
    h('div', { class: 'menu-row' },
      btn('', 'open-map', 'Gallery Map', `${STAGE_COUNT} stages · 5 wings`, I.map, () => app.showMap()),
      btn('', 'open-cast', 'Crew & Critters', 'Meet the cast', I.crew, () => app.showCast()),
      btn('', 'open-settings', 'Settings', 'Sound · motion', I.settings, () => app.openSettings()),
    ),
    h('div', { class: 'menu-meta' },
      h('span', { html: `<b>${stars}</b>/90 ${I.star}` }),
      h('span', { html: `<b>10</b> masterpieces` }),
    ),
  );
  // arrow keys walk the menu
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = [...nav.querySelectorAll<HTMLButtonElement>('.mbtn')];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const n = list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length];
    n.focus(); e.preventDefault();
  });
  // hovering Play nudges the camera toward the painting
  const playBtn = nav.querySelector<HTMLElement>('.mbtn-play')!;
  playBtn.addEventListener('pointerenter', () => root.classList.add('menu-lean'));
  playBtn.addEventListener('pointerleave', () => root.classList.remove('menu-lean'));
  playBtn.addEventListener('focus', () => root.classList.add('menu-lean'));
  playBtn.addEventListener('blur', () => root.classList.remove('menu-lean'));

  const root = h('div', { class: 'screen menu title-screen', 'data-testid': 'title' },
    h('div', { class: 'hall', 'aria-hidden': 'true' },
      h('div', { class: 'hall-wall' }),
      h('div', { class: 'hall-beam' }),
      h('div', { class: 'hall-wainscot' }),
      h('div', { class: 'hall-floor' }),
      h('div', { class: 'hall-curtain l' }),
      h('div', { class: 'hall-curtain r' }),
      h('div', { class: 'hall-valance' }),
    ),
    h('div', { class: 'menu-layout' }, brand, sceneEl, nav),
    h('footer', { class: 'menu-foot' },
      'A fantasy game — never clean a real painting! Public-domain reproductions via Wikimedia Commons. ',
      h('button', { onclick: () => app.openCredits() }, 'Art credits'),
    ),
    h('div', { class: 'menu-vignette', 'aria-hidden': 'true' }),
  );

  const scene = mountMenuScene({ scene: sceneEl, frame, img, grime, crew, plaque, hint }, reduced);
  (crew as unknown as { __boxes: () => DOMRect[] }).__boxes = scene.boxes;
  return root;
}

// ---------------------------------------------------------------- bespoke ornament + icon art

const GOLD_DEFS = `<defs><linearGradient id="gold-o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".35" stop-color="#E2B656"/><stop offset=".7" stop-color="#9A6A22"/><stop offset="1" stop-color="#5E3D10"/></linearGradient></defs>`;

/** Acanthus corner cartouche: shell rosette with two scrolling leaves running along the mouldings. */
const CORNER_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">${GOLD_DEFS}
<g fill="url(#gold-o)" stroke="#4A2C08" stroke-width="1.3" stroke-linejoin="round">
<path d="M4 4 C30 1 50 6 62 16 C70 23 79 21 86 12 C85 27 70 34 58 29 C47 24 40 19 27 19 C21 19 19 21 19 27 C19 40 24 47 29 58 C34 70 27 85 12 86 C21 79 23 70 16 62 C6 50 1 30 4 4 Z"/>
<path d="M60 18 C66 12 74 12 78 16 C74 15 69 17 66 21 Z M18 60 C12 66 12 74 16 78 C15 74 17 69 21 66 Z"/>
<circle cx="17" cy="17" r="11"/>
<path d="M17 6 L19 15 L28 17 L19 19 L17 28 L15 19 L6 17 L15 15 Z" fill="#FFF4C8" stroke="#7A4E14" stroke-width=".8"/>
</g>
<path d="M10 7 C30 5 48 10 58 18 M7 10 C5 30 10 48 18 58" fill="none" stroke="#FFF6D0" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
</svg>`;

/** Shell crest for the top of the frame. */
const CREST_SVG = `<svg viewBox="0 0 120 60" aria-hidden="true">${GOLD_DEFS}
<g fill="url(#gold-o)" stroke="#4A2C08" stroke-width="1.3" stroke-linejoin="round">
<path d="M2 52 C20 52 30 44 36 36 C30 46 18 50 8 46 Z M118 52 C100 52 90 44 84 36 C90 46 102 50 112 46 Z"/>
<path d="M28 54 C28 26 44 6 60 6 C76 6 92 26 92 54 Z"/>
</g>
<g stroke="#5E3A0C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8">
<path d="M60 52 L60 12 M60 52 L46 16 M60 52 L74 16 M60 52 L36 28 M60 52 L84 28"/>
</g>
<path d="M36 50 C38 28 48 12 60 10" stroke="#FFF6D0" stroke-width="1.6" fill="none" opacity=".65"/>
<ellipse cx="60" cy="54" rx="10" ry="5" fill="#E86F5A" stroke="#4A2C08" stroke-width="1.2"/>
</svg>`;

/** A dry, bristly brush swipe behind MAYHEM — oxblood paint with frayed ends. */
const STROKE_SVG = `<svg viewBox="0 0 600 140" preserveAspectRatio="none" aria-hidden="true">
<defs>
<filter id="frayed" x="-5%" y="-20%" width="110%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="16"/></filter>
<linearGradient id="paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B42A2E"/><stop offset=".55" stop-color="#8A161E"/><stop offset="1" stop-color="#5A0B12"/></linearGradient>
</defs>
<g filter="url(#frayed)">
<path d="M14 64 C60 30 150 22 300 20 C430 18 520 22 586 40 C596 60 590 92 572 108 C470 122 330 124 190 120 C110 118 46 112 20 98 C6 88 6 74 14 64 Z" fill="url(#paint)"/>
<path d="M40 52 C180 36 380 34 560 46" stroke="#D2484A" stroke-width="5" fill="none" opacity=".55"/>
<path d="M30 100 C200 110 400 112 570 98" stroke="#3E060C" stroke-width="6" fill="none" opacity=".5"/>
</g>
</svg>`;

const HAND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.6 15.6a1.6 1.6 0 0 1 2.4-2L9 15.5"/><path d="M3 6c1.5-1.5 3-1.5 4.5 0M2 9.5c2.5-2.5 5.5-2.5 8 0" opacity=".6"/></svg>`;

/** Purpose-built menu icons: engraved into each button's medallion. */
const I = {
  // a brush-tipped play triangle
  play: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 6.5v19a1.4 1.4 0 0 0 2.1 1.2l14.2-9.5a1.4 1.4 0 0 0 0-2.4L13.1 5.3A1.4 1.4 0 0 0 11 6.5z" fill="currentColor"/><path d="M3 10.5h5M2 16h6M3 21.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/></svg>`,
  // gallery floor plan: framed rooms and a dotted route
  map: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="11" height="9" rx="1"/><rect x="18" y="5" width="11" height="9" rx="1"/><rect x="3" y="18" width="11" height="9" rx="1"/><rect x="18" y="18" width="11" height="9" rx="1"/><path d="M8.5 9.5h.01M23.5 9.5h.01M8.5 22.5h.01" stroke-width="3" stroke-linecap="round"/><path d="M14 9.5h4M8.5 14v4M23.5 14v4" stroke-dasharray="1.5 2"/><path d="M21 22.5l2 2 3.5-4" stroke-linecap="round"/></svg>`,
  // Pip's gumdrop silhouette (with sponge hat) eyeing a soot smudger
  crew: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="5.5" width="15" height="5" rx="1.8" fill="currentColor"/><path d="M5.5 28c-1-8 1.5-16 6-16s7 8 6 16z" fill="currentColor"/><circle cx="9.6" cy="17" r="1.5" fill="var(--medal-ink)"/><circle cx="13.6" cy="17" r="1.5" fill="var(--medal-ink)"/><path d="M21 27.5c-2 0-2.6-2-1.8-3.6-.8-1.6.6-3.4 2.4-3 .8-1.6 3.2-1.6 4 0 1.8-.4 3.2 1.4 2.4 3 .8 1.6.2 3.6-1.8 3.6z" fill="currentColor" opacity=".7"/></svg>`,
  // a brass restorer's dial: palette with a gear hub
  settings: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 4.5c6.6 0 11.5 4.6 11.5 10 0 3.2-2.6 4.2-4.7 3.5-1.8-.6-3.3.9-2.6 2.8.9 2.5-.6 5.2-4.2 5.2C9.6 26 4.5 21.2 4.5 15S9.6 4.5 16 4.5z" stroke-linejoin="round"/><circle cx="10" cy="13" r="1.8" fill="currentColor"/><circle cx="15.5" cy="9.5" r="1.8" fill="currentColor"/><circle cx="21.5" cy="11" r="1.8" fill="currentColor"/><circle cx="11" cy="19.5" r="2.4"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>`,
};
