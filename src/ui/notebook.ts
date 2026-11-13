import { audio } from '../core/audio';
import { PAINTINGS, PAINTING_ORDER, thumbUrl, type PaintingId } from '../art/paintings';
import { NOTEBOOK } from '../data/notebook';
import type { SaveStore } from '../core/save';
import type { App } from './app';
import { h } from './dom';
import { icon } from './icons';

/** A painting's notebook page unlocks once any of its three stages is restored. */
export function stagesFor(id: PaintingId): number[] {
  const i = PAINTING_ORDER.indexOf(id);
  return [i * 3 + 1, i * 3 + 2, i * 3 + 3];
}
export function pageUnlocked(save: SaveStore, id: PaintingId) {
  return stagesFor(id).some((s) => save.record(s).completed);
}
export const pagesUnlocked = (save: SaveStore) => PAINTING_ORDER.filter((id) => pageUnlocked(save, id)).length;

/** Read text aloud with the device's built-in voice (for early readers). */
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export function speak(text: string) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 0.9; u.pitch = 1.08;
  synth.speak(u);
}
const stopSpeaking = () => { if (canSpeak()) window.speechSynthesis.cancel(); };
const readBtn = (get: () => string, cls = 'btn secondary small') =>
  canSpeak() ? h('button', { class: `${cls} read-aloud`, 'data-testid': 'read-aloud', 'aria-label': 'Read to me', onclick: (e: Event) => { e.stopPropagation(); speak(get()); }, html: cls.includes('icon-btn') ? icon('sound') : `${icon('sound')} Read to me` }) : null;

const fullUrl = (id: PaintingId) => `${import.meta.env.BASE_URL}art/${PAINTINGS[id].file}`;

/** The Conservator's Notebook index screen. */
export function createNotebook(app: App): HTMLElement {
  const grid = h('div', { class: 'nb-grid' });
  for (const id of PAINTING_ORDER) {
    const p = PAINTINGS[id];
    const open = pageUnlocked(app.save, id);
    grid.append(h('button', {
      class: `nb-tile ${open ? '' : 'locked'}`, 'data-page': id, disabled: !open,
      'aria-label': open ? `Notebook page: ${p.title}` : `${p.title} (locked: restore one of its stages to unlock)`,
      onclick: () => open && openPage(app, id),
    },
      h('div', { class: 'gilt', style: `--ar:${p.width / p.height}` },
        h('img', { src: thumbUrl(id), alt: '', loading: 'lazy', draggable: 'false' }),
        open ? null : h('div', { class: 'lock', html: icon('lock') }),
      ),
      h('div', { class: 'nb-tile-text' },
        h('b', { class: 'display' }, p.title),
        h('span', null, open ? `${p.artist} · ${p.year}` : 'Fix it to unlock'),
      ),
    ));
  }
  const count = pagesUnlocked(app.save);
  const scroll = h('div', { class: 'map-scroll nb-scroll' },
    h('div', { class: 'nb-intro' },
      h('div', { class: 'eyebrow' }, 'Field notes'),
      h('h2', { class: 'display' }, 'Every painting has a story.'),
      h('p', null, 'Fix a painting to unlock its page. Find true facts and hidden secrets!'),
    ),
    grid,
  );
  return h('div', { class: 'screen map-screen notebook-screen', 'data-testid': 'notebook' },
    h('header', { class: 'map-header' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('back'), onclick: () => app.showTitle() }),
      h('h1', { class: 'display' }, "Conservator's Notebook"),
      h('div', { class: 'star-total', 'aria-label': `${count} of 10 pages`, html: `${icon('book')} ${count}<span style="opacity:.55">/10</span>` }),
    ),
    scroll,
  );
}

/** One painting's page, as a modal card. */
export function openPage(app: App, id: PaintingId, isNew = false) {
  audio.play('peel');
  const p = PAINTINGS[id];
  const n = NOTEBOOK[id];
  const card = h('div', { class: 'card nb-page', 'data-testid': 'notebook-page', 'data-page': id },
    h('button', { class: 'card-close', 'aria-label': 'Close', html: icon('close'), onclick: () => app.closeModal() }),
    h('div', { class: 'eyebrow' }, isNew ? 'New notebook page!' : "Conservator's Notebook"),
    h('div', { class: 'nb-head' },
      h('button', { class: 'gilt nb-thumb', style: `--ar:${p.width / p.height}`, 'aria-label': 'Look closer', onclick: () => openLookCloser(app, id) },
        h('img', { src: thumbUrl(id), alt: `${p.title} by ${p.artist}`, draggable: 'false' }),
        h('span', { class: 'nb-thumb-badge', html: icon('eye') }),
      ),
      h('div', null,
        h('h2', { class: 'display' }, p.title),
        h('div', { class: 'nb-artist' }, `${p.artist} · ${p.year}`),
        h('p', { class: 'nb-hook' }, n.hook),
      ),
    ),
    h('ol', { class: 'nb-facts' }, ...n.facts.map((f) => h('li', null, f))),
    h('dl', { class: 'nb-meta' },
      h('dt', null, 'Size'), h('dd', null, n.size),
      h('dt', null, 'See it for real'), h('dd', null, n.where),
    ),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn', 'data-testid': 'look-closer', onclick: () => { stopSpeaking(); openLookCloser(app, id); }, html: `${icon('eye')} Look closer` }),
      readBtn(() => [p.title, n.hook, ...n.facts].join(' ')),
    ),
    h('p', { class: 'nb-sources' }, 'For grown-ups: ', ...n.sources.flatMap((s, i) => [i ? ' · ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label)])),
  );
  app.showModal(card);
}

/** Full-screen painting with tappable hotspots that zoom in and explain what you're seeing. */
export function openLookCloser(app: App, id: PaintingId, start = -1) {
  audio.play('whoosh', { vol: 0.6 });
  const p = PAINTINGS[id];
  const spots = NOTEBOOK[id].hotspots;
  let idx = start;
  const img = h('img', { src: fullUrl(id), alt: `${p.title} by ${p.artist}`, draggable: 'false' });
  const layer = h('div', { class: 'lc-layer' });
  const stage = h('div', { class: 'lc-stage', style: `--ar:${p.width / p.height}` }, img, layer);
  const title = h('b', { class: 'display' });
  const text = h('p');
  const counter = h('span', { class: 'lc-count' });
  const caption = h('div', { class: 'lc-caption', 'aria-live': 'polite' },
    h('div', { class: 'lc-cap-text' }, title, text),
    h('div', { class: 'lc-nav' },
      readBtn(() => `${title.textContent}. ${text.textContent}`, 'icon-btn light'),
      h('button', { class: 'icon-btn light', 'aria-label': 'Previous', html: icon('prev'), onclick: () => go(idx <= 0 ? spots.length - 1 : idx - 1) }),
      counter,
      h('button', { class: 'icon-btn light', 'aria-label': 'Next', html: icon('next'), onclick: () => go(idx >= spots.length - 1 ? 0 : idx + 1) }),
    ),
  );
  const view = h('div', { class: 'lc-view', onclick: () => go(-1) }, stage);
  const ar = p.width / p.height;
  const fit = () => {
    const vw = view.clientWidth - 32, vh = view.clientHeight - 20;
    if (vw <= 0 || vh <= 0) return;
    const w = Math.min(vw, vh * ar);
    stage.style.width = `${w}px`;
    stage.style.height = `${w / ar}px`;
  };
  const dots = spots.map((s, i) => {
    const d = h('button', { class: 'lc-dot', style: `left:${s.x * 100}%;top:${s.y * 100}%`, 'aria-label': s.title, onclick: (e: Event) => { e.stopPropagation(); go(i); } }, String(i + 1));
    layer.append(d);
    return d;
  });
  const close = () => { stopSpeaking(); el.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', fit); };
  const el = h('div', { class: 'look-closer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Look closer: ${p.title}`, 'data-testid': 'look-closer-view' },
    h('header', { class: 'lc-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('close'), onclick: close }),
      h('div', null, h('div', { class: 'eyebrow' }, 'Look closer'), h('div', { class: 'display lc-title' }, p.title)),
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom out', html: icon('zoomOut'), onclick: () => go(-1) }),
    ),
    view,
    caption,
  );

  function go(i: number) {
    idx = i;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    if (i < 0) {
      stage.style.transform = '';
      el.classList.remove('zoomed');
      title.textContent = `Find ${spots.length} secrets!`;
      text.textContent = 'Tap a number to zoom in.';
      counter.textContent = '';
      return;
    }
    const s = spots[i];
    // zoom so the hotspot moves to the centre of the view
    const k = 2.4;
    // keep the zoomed view inside the painting near its edges
    const cx = Math.min(1 - 0.5 / k, Math.max(0.5 / k, s.x)), cy = Math.min(1 - 0.5 / k, Math.max(0.5 / k, s.y));
    stage.style.transform = `scale(${k}) translate(${(0.5 - cx) * 100}%, ${(0.5 - cy) * 100}%)`;
    el.classList.add('zoomed');
    title.textContent = s.title;
    text.textContent = s.text;
    counter.textContent = `${i + 1} / ${spots.length}`;
    audio.play('chime', { pitch: 1 + i * 0.1, vol: 0.6 });
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') go(idx >= spots.length - 1 ? 0 : idx + 1);
    if (e.key === 'ArrowLeft') go(idx <= 0 ? spots.length - 1 : idx - 1);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', fit);
  app.root.append(el);
  requestAnimationFrame(fit);
  go(start);
}
