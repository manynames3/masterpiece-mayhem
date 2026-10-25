import { PAINTINGS, PAINTING_ORDER, thumbUrl } from '../art/paintings';
import { GALLERIES } from '../data/galleries';
import { STAGE_COUNT, getStage } from '../data/stages';
import type { App } from './app';
import { h } from './dom';
import { icon } from './icons';

export function starIcons(n: number, max = 3) {
  return h('span', { class: 'stars', html: Array.from({ length: max }, (_, i) => icon('star').replace('<svg', `<svg class="${i < n ? 'star-on' : 'star-off'}"`)).join('') });
}

/** Five gallery rooms, two framed masterpieces each, three stage medallions per painting. */
export function createMap(app: App, focusStage?: number): HTMLElement {
  const save = app.save;
  const current = save.highestUnlocked(STAGE_COUNT);
  const scroll = h('div', { class: 'map-scroll' });
  for (const gal of GALLERIES) {
    const room = h('section', { class: 'gallery-room', style: `--room:${gal.color}`, 'aria-label': gal.name });
    const firstStage = (gal.id - 1) * 6 + 1;
    const galStars = Array.from({ length: 6 }, (_, i) => save.record(firstStage + i).stars).reduce((a, b) => a + b, 0);
    room.append(h('div', { class: 'room-head' },
      h('div', null,
        h('div', { class: 'eyebrow' }, `Gallery ${['I', 'II', 'III', 'IV', 'V'][gal.id - 1]} · ${gal.difficulty}`),
        h('h2', { class: 'display' }, gal.name),
        h('p', null, gal.subtitle),
      ),
      h('span', { class: 'pill', html: `${icon('star')} ${galStars} / 18` }),
    ));
    const grid = h('div', { class: 'room-paintings' });
    for (let k = 0; k < 2; k++) {
      const pIndex = (gal.id - 1) * 2 + k;
      const pid = PAINTING_ORDER[pIndex];
      const def = PAINTINGS[pid];
      const ids = [pIndex * 3 + 1, pIndex * 3 + 2, pIndex * 3 + 3];
      const doneCount = ids.filter((id) => save.record(id).completed).length;
      const unlocked = save.isUnlocked(ids[0]);
      const gilt = h('div', { class: `gilt ${!unlocked ? 'locked' : doneCount === 0 ? 'dirty' : doneCount < 3 ? 'partial' : ''}`, style: `--ar:${def.width / def.height}` },
        h('img', { src: thumbUrl(pid), alt: `${def.title} by ${def.artist}`, loading: 'lazy', draggable: 'false' }),
        !unlocked ? h('div', { class: 'lock', html: icon('lock') }) : null,
      );
      const row = h('div', { class: 'stage-row' });
      for (const id of ids) {
        const st = getStage(id);
        const rec = save.record(id);
        const open = save.isUnlocked(id) && !!st;
        const btn = h('button', {
          class: `stage-medal ${rec.completed ? 'done' : ''} ${id === current && st ? 'current' : ''} ${st?.boss ? 'boss' : ''}`,
          'data-stage': id,
          'aria-label': st ? `Stage ${id}: ${st.title}${open ? '' : ' (locked)'}` : `Stage ${id} (not yet built)`,
          disabled: !open,
          title: st ? st.title : 'Not yet built',
          onclick: () => st && app.openBrief(id),
        },
          h('span', { class: 'num' }, String(id)),
          open || rec.completed ? starIcons(rec.stars) : h('span', { class: 'stars', html: icon('lock').replace('<svg', '<svg style="width:14px;height:14px;opacity:.7"') }),
        );
        row.append(btn);
      }
      grid.append(h('div', { class: 'painting-card' },
        gilt,
        h('div', { class: 'painting-info' },
          h('h3', { class: 'display' }, def.title),
          h('div', { class: 'artist' }, `${def.artist} · ${def.year}`),
          row,
        ),
      ));
    }
    room.append(grid);
    scroll.append(room);
  }
  const root = h('div', { class: 'screen map-screen' },
    h('header', { class: 'map-header' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back to the restoration desk', html: icon('back'), onclick: () => app.showTitle() }),
      h('h1', { class: 'display' }, 'The Grand Gallery'),
      h('div', { class: 'star-total', 'aria-label': 'Total stars', html: `${icon('star')} ${save.totalStars()}<span style="opacity:.55">/90</span>` }),
      h('button', { class: 'icon-btn', 'aria-label': 'Settings', html: icon('settings'), onclick: () => app.openSettings() }),
    ),
    scroll,
  );
  requestAnimationFrame(() => {
    const target = scroll.querySelector(`[data-stage="${focusStage ?? current}"]`) as HTMLElement | null;
    if (target) {
      const room = target.closest('.gallery-room') as HTMLElement | null;
      if (room) scroll.scrollTo({ top: Math.max(0, room.offsetTop - 20), behavior: 'auto' });
    }
  });
  return root;
}
