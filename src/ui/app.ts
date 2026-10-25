import { audio } from '../core/audio';
import { SaveStore } from '../core/save';
import { PAINTINGS, PAINTING_ORDER, thumbUrl } from '../art/paintings';
import { GALLERIES } from '../data/galleries';
import { STAGES, STAGE_COUNT, getStage } from '../data/stages';
import type { StageDef } from '../data/types';
import type { StageResult } from '../game/runtime';
import { h } from './dom';
import { icon } from './icons';
import { createMap, starIcons } from './map';
import { createStageScreen, type StageScreen } from './stageScreen';
import { createTitle } from './title';
import { createCast } from './cast';
import { playFinale } from './finale';

export class App {
  readonly save = new SaveStore();
  private screenEl: HTMLElement | null = null;
  private stageScreen: StageScreen | null = null;
  private modal: HTMLElement | null = null;

  constructor(readonly root: HTMLElement) {
    const st = this.save.data.settings;
    audio.soundOn = st.sound;
    audio.musicOn = st.music;
    document.documentElement.classList.toggle('reduced-motion', st.reducedMotion);
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    this.installQA();
  }

  private mount(el: HTMLElement) {
    this.closeModal();
    this.stageScreen?.destroy();
    this.stageScreen = null;
    this.screenEl?.remove();
    this.screenEl = el;
    this.root.append(el);
  }

  showTitle() { this.mount(createTitle(this)); }
  showMap(focusStage?: number) { this.mount(createMap(this, focusStage)); }
  showCast() { this.mount(createCast(this)); }

  playStage(id: number) {
    const stage = getStage(id);
    if (!stage || !this.save.isUnlocked(id)) { this.showMap(); return; }
    audio.unlock();
    this.save.notePlay(id);
    const s = createStageScreen(this, stage);
    this.mount(s.el);
    this.stageScreen = s;
  }

  get runtime() { return this.stageScreen?.runtime ?? null; }

  // ------------------------------------------------------------------ modals
  closeModal() { this.modal?.remove(); this.modal = null; }

  private openModal(card: HTMLElement, dismissable = true) {
    this.closeModal();
    const scrim = h('div', { class: 'scrim', role: 'dialog', 'aria-modal': 'true' }, card);
    if (dismissable) scrim.addEventListener('click', (e) => { if (e.target === scrim) this.closeModal(); });
    this.modal = scrim;
    this.root.append(scrim);
    (card.querySelector('.btn') as HTMLElement | null)?.focus({ preventScroll: true });
    return scrim;
  }

  openBrief(id: number) {
    const st = getStage(id);
    if (!st) return;
    const def = PAINTINGS[st.painting];
    const rec = this.save.record(id);
    audio.play('tap');
    const objectives = st.objectives.map((o) => h('li', { class: o.optional ? 'opt' : '', html: `${icon(o.optional ? 'star' : 'check')}<span>${o.optional ? 'Bonus: ' : ''}${o.label}</span>` }));
    const stars = [{ label: 'Restore the painting' }, ...st.stars].map((s, i) => h('li', { class: i < rec.stars ? '' : 'opt', html: `${icon('star')}<span>${s.label}</span>` }));
    const card = h('div', { class: 'card', 'data-testid': 'brief' },
      h('button', { class: 'card-close', 'aria-label': 'Close', html: icon('close'), onclick: () => this.closeModal() }),
      h('div', { class: 'brief-head' },
        h('div', { class: 'gilt', style: `--ar:${def.width / def.height}` }, h('img', { src: thumbUrl(st.painting), alt: def.title })),
        h('div', null,
          h('div', { class: 'eyebrow' }, `Stage ${st.id} of ${STAGE_COUNT}${st.boss ? ' · Finale' : ''}`),
          h('h2', { class: 'display' }, st.title),
          h('div', { style: 'font-weight:700;color:#5a3a28;font-size:14px' }, `${def.title} — ${def.artist}`),
        ),
      ),
      h('div', { class: 'brief-meta' },
        h('span', { class: 'pill' }, st.family),
        h('span', { class: 'pill' }, `Difficulty ${'●'.repeat(Math.ceil(st.difficulty / 2))}${'○'.repeat(5 - Math.ceil(st.difficulty / 2))}`),
        rec.completed ? h('span', { class: 'pill' }, `Best ${rec.bestScore.toLocaleString()}`) : null,
      ),
      h('p', null, st.blurb),
      h('div', { class: 'brief-sub' }, 'Objectives'),
      h('ul', { class: 'brief-list' }, ...objectives),
      h('div', { class: 'brief-sub' }, 'Stars'),
      h('ul', { class: 'brief-list' }, ...stars),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn', 'data-testid': 'brief-play', onclick: () => this.playStage(id), html: `${icon('play')} ${rec.completed ? 'Play again' : 'Start restoring'}` }),
      ),
    );
    this.openModal(card);
  }

  openResults(r: StageResult) {
    const st = r.stage;
    const prevBest = this.save.record(st.id).bestScore;
    this.save.completeStage(st.id, r.stars, r.score, r.curses, st.reward.collectible);
    const nextId = st.id + 1;
    const next = getStage(nextId);
    const galleryDone = st.id % 6 === 0 && st.id < 30;
    const starsRow = h('div', { class: 'result-stars', 'aria-label': `${r.stars} of 3 stars` });
    for (let i = 0; i < 3; i++) {
      const sv = h('span', { html: icon('star') }).firstElementChild as SVGElement;
      if (i < r.stars) { sv.classList.add('on'); sv.style.animationDelay = `${0.25 + i * 0.28}s`; setTimeout(() => audio.play('star', { pitch: 1 + i * 0.15 }), 250 + i * 280); }
      starsRow.append(sv);
    }
    const ba = r.before && r.after ? beforeAfter(r.before, r.after) : null;
    const actions = h('div', { class: 'card-actions' });
    if (st.id === 30) {
      actions.append(h('button', { class: 'btn', onclick: () => { this.closeModal(); playFinale(this); } }, 'Watch the Final Touch'));
    } else if (next) {
      actions.append(h('button', { class: 'btn', 'data-testid': 'next-stage', onclick: () => this.playStage(nextId), html: `Next: ${next.title} ${icon('next')}` }));
    }
    actions.append(
      h('button', { class: 'btn secondary', 'data-testid': 'replay', onclick: () => this.playStage(st.id), html: `${icon('replay')} Replay` }),
      h('button', { class: 'btn secondary', 'data-testid': 'to-map', onclick: () => this.showMap(nextId), html: `${icon('map')} Map` }),
    );
    const card = h('div', { class: 'card results', 'data-testid': 'results', 'data-stars': r.stars },
      h('div', { class: 'eyebrow', style: 'text-align:center' }, `Stage ${st.id} · ${PAINTINGS[st.painting].title}`),
      h('h2', { class: 'display' }, st.boss ? 'Masterpiece restored!' : 'Restored!'),
      starsRow,
      h('ul', { class: 'criteria' }, ...r.starResults.map((s) => h('li', { class: s.ok ? 'ok' : 'no', html: `${icon(s.ok ? 'check' : 'x')}<span>${s.label}</span>` }))),
      h('div', { class: 'score-row' },
        h('span', null, 'Score', r.score > prevBest && prevBest > 0 ? h('span', { class: 'best' }, ' · new best!') : null),
        h('b', null, r.score.toLocaleString()),
      ),
      ba ? h('div', { class: 'ba-wrap', style: `--ar:${r.after!.width / r.after!.height}` }, ba) : null,
      h('div', { class: 'reward' }, h('span', { class: 'medal' }, '🏅'), h('div', null, h('b', null, st.reward.collectible), st.reward.note)),
      galleryDone ? h('div', { class: 'gallery-banner' }, h('span', { class: 'display' }, `${GALLERIES[st.gallery - 1].name} complete!`), `Gallery ${['II', 'III', 'IV', 'V'][st.gallery - 1]} — ${GALLERIES[st.gallery].name} — is now open.`) : null,
      actions,
    );
    this.openModal(card, false);
  }

  openFail(st: StageDef, msg: string) {
    const card = h('div', { class: 'card', 'data-testid': 'fail' },
      h('div', { class: 'eyebrow' }, `Stage ${st.id} · ${st.title}`),
      h('h2', { class: 'display' }, 'Whoops — let’s try that again'),
      h('p', null, msg),
      h('p', { style: 'font-size:14px' }, `Tip: ${st.hint}`),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn', onclick: () => this.playStage(st.id), html: `${icon('replay')} Retry` }),
        h('button', { class: 'btn secondary', onclick: () => this.showMap(st.id), html: `${icon('map')} Map` }),
      ),
    );
    this.openModal(card, false);
  }

  openPause(st: StageDef, resume: () => void) {
    const doResume = () => { this.closeModal(); resume(); };
    const card = h('div', { class: 'card', 'data-testid': 'pause-menu' },
      h('div', { class: 'eyebrow' }, `Stage ${st.id} · ${PAINTINGS[st.painting].title}`),
      h('h2', { class: 'display' }, 'Tea break'),
      h('p', null, st.blurb),
      h('div', { class: 'settings-list' }, ...this.settingRows()),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn', onclick: doResume, html: `${icon('play')} Resume` }),
        h('button', { class: 'btn secondary', onclick: () => this.playStage(st.id), html: `${icon('replay')} Restart` }),
        h('button', { class: 'btn secondary', onclick: () => this.showMap(st.id), html: `${icon('map')} Map` }),
      ),
    );
    const scrim = this.openModal(card, false);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) doResume(); });
  }

  private settingRows() {
    const s = this.save.data.settings;
    const row = (label: string, sub: string, key: keyof typeof s, apply: (v: boolean) => void) => {
      const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(s[key]), 'aria-label': label });
      sw.addEventListener('click', () => {
        const v = !this.save.data.settings[key];
        this.save.setSetting(key, v);
        sw.setAttribute('aria-checked', String(v));
        apply(v);
        audio.play('click');
      });
      return h('div', { class: 'toggle-row' }, h('div', null, label, h('small', null, sub)), sw);
    };
    return [
      row('Sound effects', 'Squishes, pops and chimes', 'sound', (v) => audio.setSound(v)),
      row('Music', 'Gentle music-box ambience', 'music', (v) => audio.setMusic(v)),
      row('Reduced motion', 'Calmer camera, fewer particles', 'reducedMotion', (v) => document.documentElement.classList.toggle('reduced-motion', v)),
      row('Haptics', 'Vibration on supported phones', 'haptics', () => undefined),
    ];
  }

  openSettings() {
    audio.play('tap');
    let confirmReset = false;
    const resetBtn = h('button', { class: 'btn ghost small' }, 'Reset all progress');
    resetBtn.addEventListener('click', () => {
      if (!confirmReset) { confirmReset = true; resetBtn.textContent = 'Tap again to erase everything'; return; }
      this.save.reset();
      this.closeModal();
      this.showTitle();
    });
    const card = h('div', { class: 'card', 'data-testid': 'settings' },
      h('button', { class: 'card-close', 'aria-label': 'Close', html: icon('close'), onclick: () => this.closeModal() }),
      h('div', { class: 'eyebrow' }, 'Workshop'),
      h('h2', { class: 'display' }, 'Settings'),
      h('div', { class: 'settings-list' }, ...this.settingRows()),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn secondary small', onclick: () => this.openCredits() }, 'Art credits & licences'),
        resetBtn,
      ),
      h('p', { style: 'font-size:12px;margin-top:14px;opacity:.75' }, `Progress saves automatically on this device. Collection: ${this.save.data.collection.length} badges.`),
    );
    this.openModal(card);
  }

  openCredits() {
    const items = PAINTING_ORDER.map((id) => {
      const p = PAINTINGS[id];
      return h('li', null, h('b', null, `${p.title}`), ` — ${p.artist}, ${p.year}. ${p.holder}. Public-domain reproduction via `, h('a', { href: p.source, target: '_blank', rel: 'noopener' }, 'Wikimedia Commons'), '.');
    });
    const card = h('div', { class: 'card' },
      h('button', { class: 'card-close', 'aria-label': 'Close', html: icon('close'), onclick: () => this.closeModal() }),
      h('div', { class: 'eyebrow' }, 'Credits'),
      h('h2', { class: 'display' }, 'The masterpieces'),
      h('p', { class: 'credits' }, 'All ten works are centuries old and in the public domain; the reproductions are Wikimedia Commons files marked public domain. Crew, critters, grime, tools and UI are original procedural art. Fonts: Fraunces & Nunito (SIL Open Font License). See ART_LICENSES.md for details and caveats.'),
      h('ul', { class: 'credits' }, ...items),
      h('p', { class: 'credits' }, 'Masterpiece Mayhem is a fantasy. Never clean a real painting — leave that to trained conservators!'),
    );
    this.openModal(card);
  }

  // ------------------------------------------------------------------ QA hooks (used by Playwright)
  private installQA() {
    const w = window as unknown as Record<string, unknown>;
    w.__MM = {
      app: this,
      stages: () => STAGES.map((s) => ({ id: s.id, title: s.title, mechanic: s.mechanic.type })),
      unlockAll: () => { this.save.unlockAll(STAGE_COUNT); },
      play: (id: number) => this.playStage(id),
      cast: () => this.showCast(),
      runtime: () => this.runtime,
      autoplay: (on = true) => { const r = this.runtime; if (r) { r.autoplay = on; r.skipIntro(); } },
      state: () => {
        const r = this.runtime;
        return r ? { phase: r.phase, metrics: r.metrics(), objectives: r.objectiveViews() } : null;
      },
      save: () => this.save.data,
    };
  }
}

function beforeAfter(before: HTMLCanvasElement, after: HTMLCanvasElement) {
  const b = before, a = after;
  const wrap = h('div', { class: 'ba', 'aria-label': 'Before and after comparison — drag to compare' });
  a.style.width = '100%';
  const bWrap = h('div', { class: 'before' }, b);
  b.style.width = '100%';
  const handle = h('div', { class: 'handle' });
  wrap.append(a, bWrap, handle, h('span', { class: 'tag l' }, 'BEFORE'), h('span', { class: 'tag r' }, 'AFTER'));
  const set = (clientX: number) => {
    const r = wrap.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    bWrap.style.clipPath = `inset(0 ${100 - k * 100}% 0 0)`;
    handle.style.left = `${k * 100}%`;
  };
  let dragging = false;
  wrap.addEventListener('pointerdown', (e) => { dragging = true; wrap.setPointerCapture(e.pointerId); set(e.clientX); });
  wrap.addEventListener('pointermove', (e) => { if (dragging) set(e.clientX); });
  wrap.addEventListener('pointerup', () => { dragging = false; });
  // a little auto-sweep so players notice it
  let t0 = 0;
  const sweep = (now: number) => {
    if (dragging || !wrap.isConnected && t0) return;
    if (!t0) t0 = now;
    const k = (now - t0) / 1600;
    if (k > 1) return;
    const r = wrap.getBoundingClientRect();
    set(r.left + r.width * (0.5 + Math.sin(k * Math.PI * 2) * 0.35));
    requestAnimationFrame(sweep);
  };
  setTimeout(() => requestAnimationFrame(sweep), 1200);
  return wrap;
}

export { starIcons };
