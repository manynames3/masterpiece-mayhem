import { audio } from '../core/audio';
import type { StageDef } from '../data/types';
import { PAINTINGS } from '../art/paintings';
import { StageRuntime, type HudState } from '../game/runtime';
import type { App } from './app';
import { h, clear } from './dom';
import { icon } from './icons';

const GESTURE_ICON: Record<string, string> = {
  scrub: 'sponge', tap: 'hand', drag: 'hand', hold: 'hand', circle: 'cloth', swipe: 'hand', lasso: 'lasso', trace: 'hand', aim: 'spray', steer: 'sub',
};

export interface StageScreen { el: HTMLElement; runtime: StageRuntime; destroy(): void }

/** Full-bleed canvas with a glassy, thumb-friendly HUD wired to the runtime's real metrics. */
export function createStageScreen(app: App, stage: StageDef): StageScreen {
  const def = PAINTINGS[stage.painting];
  const canvas = h('canvas', { class: 'stage-canvas', 'data-testid': 'stage-canvas', 'aria-label': `${stage.title} play area` });
  const progressBar = h('i');
  const progressPct = h('span', null, '0%');
  const progressLbl = h('span', null, 'Restored');
  const botchFill = h('i');
  const botchFace = h('span', { class: 'face' }, '🙂');
  const botch = h('div', { class: 'botch', title: 'Botch Meter — mistakes fill it; when full, the painting gets cursed (temporarily!)' },
    botchFace, h('div', { class: 'meter' }, botchFill), h('div', { class: 'lbl' }, 'BOTCH'));
  const objectives = h('div', { class: 'objectives', 'data-testid': 'objectives', 'aria-live': 'polite' });
  const tray = h('div', { class: 'tool-tray', role: 'toolbar', 'aria-label': 'Tools' });
  const toastWrap = h('div', { class: 'toast-wrap' });
  const zoomBtn = h('button', { class: 'icon-btn', 'aria-label': 'Zoom out to the whole painting', html: icon('zoomOut'), 'data-testid': 'zoom' });
  const hintBtn = h('button', { class: 'icon-btn', 'aria-label': 'Hint', html: icon('hint'), 'data-testid': 'hint' });
  const tiltTop = h('div', { class: 'tilt top' });
  const tiltBottom = h('div', { class: 'tilt bottom' });
  const hudTop = h('div', { class: 'hud-top' },
    h('button', { class: 'icon-btn', 'aria-label': 'Pause', html: icon('pause'), 'data-testid': 'pause', onclick: () => openPause() }),
    h('div', { class: 'hud-title' },
      h('div', { class: 'sub' }, `Stage ${stage.id} · ${def.short} · ${stage.family}`),
      h('div', { class: 'row' }, h('div', { class: 'name display' }, stage.title)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Restoration progress' }, progressBar),
      h('div', { class: 'progress-label' }, progressLbl, progressPct),
    ),
    botch,
  );
  const hudBottom = h('div', { class: 'hud-bottom' },
    h('div', { class: 'hud-side' }, hintBtn),
    tray,
    h('div', { class: 'hud-side' }, zoomBtn),
  );
  const loading = h('div', { class: 'loading' }, h('div', { class: 'spinner' }));
  const introCard = h('div', { class: 'intro-card' },
    h('div', { class: 'eyebrow' }, `Stage ${stage.id} · ${def.title}`),
    h('h2', { class: 'display' }, stage.title),
    h('p', null, `${def.artist}, ${def.year}`),
    h('div', { class: 'tap' }, 'Tap to dive in'),
  );
  const el = h('div', { class: 'screen stage-screen', 'data-testid': 'stage-screen', 'data-stage': stage.id },
    canvas, h('div', { class: 'vignette' }), tiltTop, tiltBottom, hudTop, objectives, hudBottom, toastWrap, loading,
  );

  let curseBanner: HTMLElement | null = null;
  let coach: HTMLElement | null = null;
  let lastObjDone = new Set<string>();
  let toolsKey = '';
  let lastHud: HudState | null = null;

  const insets = () => {
    const small = window.innerWidth < 560;
    return { top: small ? 118 : 104, bottom: small ? 96 : 100, left: 8, right: 8 };
  };

  const runtime = new StageRuntime(canvas, stage, {
    onHud: (hud) => renderHud(hud),
    onWin: (r) => {
      removeCoach();
      setTimeout(() => app.openResults(r), 150);
    },
    onFail: (msg) => app.openFail(stage, msg),
    onCurse: (kind, text) => showCurse(kind !== null, text),
    onToast: (text, tone) => toast(text, tone),
    onPhase: (p) => {
      el.dataset.phase = p;
      if (p !== 'loading') loading.remove();
      if (p === 'intro') el.append(introCard);
      if (p === 'play') {
        introCard.classList.add('out');
        setTimeout(() => introCard.remove(), 500);
        if (!app.save.data.tutorialsSeen.includes(stage.id)) showCoach();
        tiltTop.classList.toggle('on', !!stage.visual.tiltShift && !app.save.data.settings.reducedMotion);
        tiltBottom.classList.toggle('on', !!stage.visual.tiltShift && !app.save.data.settings.reducedMotion);
      }
      if (p === 'celebrate') { tiltTop.classList.remove('on'); tiltBottom.classList.remove('on'); removeCurse(); }
    },
    onFirstInteraction: () => {
      if (coach) setTimeout(() => removeCoach(true), 900);
    },
  }, insets, {
    reducedMotion: app.save.data.settings.reducedMotion,
    paintingDoneBefore: [1, 2, 3].map((k) => Math.floor((stage.id - 1) / 3) * 3 + k).filter((id) => id < stage.id && app.save.record(id).completed).length,
    haptics: app.save.data.settings.haptics,
  });

  introCard.addEventListener('click', () => runtime.skipIntro());
  canvas.addEventListener('pointerdown', () => { audio.unlock(); if (runtime.phase === 'intro') runtime.skipIntro(); });
  zoomBtn.addEventListener('click', () => {
    audio.unlock();
    runtime.setView(runtime.view === 'work' ? 'overview' : 'work');
  });
  hintBtn.addEventListener('click', () => {
    audio.unlock();
    audio.play('chime', { pitch: 1.4 });
    toast(stage.hint, 'info');
    const p = runtime.hintPoint();
    if (p) {
      const ping = h('div', { class: 'hint-ping', style: `left:${p.x}px;top:${p.y}px` });
      el.append(ping);
      setTimeout(() => ping.remove(), 3800);
    }
  });

  function renderHud(hud: HudState) {
    lastHud = hud;
    progressBar.style.width = `${Math.round(hud.progress * 100)}%`;
    progressPct.textContent = `${Math.floor(hud.progress * 100)}%`;
    progressLbl.textContent = hud.progressLabel;
    botchFill.style.width = `${Math.round(hud.botch * 100)}%`;
    botchFace.textContent = hud.curse ? '🤪' : hud.botch > 0.66 ? '😬' : hud.botch > 0.33 ? '😅' : '🙂';
    botch.classList.toggle('wobbly', !!hud.curse);
    // objectives (diffed to keep pop animation meaningful)
    clear(objectives);
    for (const o of hud.objectives) {
      const isNew = o.done && !lastObjDone.has(o.id);
      if (isNew && lastObjDone.size + 1 > 0 && runtime.phase === 'play') audio.play('star', { pitch: 1.1 });
      objectives.append(h('div', { class: `obj ${o.done ? 'done' : ''} ${o.optional ? 'optional' : ''} ${isNew ? 'pop' : ''}`, 'data-objective': o.id, 'data-done': o.done ? '1' : '0' },
        h('span', { class: 'chk', html: icon('check') }),
        h('span', { class: 'txt' }, o.label),
        h('span', { class: 'val' }, o.value),
      ));
    }
    lastObjDone = new Set(hud.objectives.filter((o) => o.done).map((o) => o.id));
    const key = JSON.stringify(hud.tools);
    if (key !== toolsKey) {
      toolsKey = key;
      clear(tray);
      tray.style.display = hud.tools.length ? '' : 'none';
      for (const t of hud.tools) {
        tray.append(h('button', {
          class: `tool ${t.active ? 'active' : ''}`, disabled: t.disabled, 'aria-pressed': t.active ? 'true' : 'false', 'data-tool': t.id,
          onclick: () => runtime.selectTool(t.id),
        },
          t.color
            ? h('span', { class: 'swatch', style: `background:radial-gradient(circle at 35% 30%, #fff 0 8%, ${t.color} 30%, ${t.color})` })
            : h('span', { html: icon(t.icon), style: 'display:contents' }),
          h('span', null, t.label),
          t.badge ? h('b', { class: 'badge' }, t.badge) : null,
        ));
      }
    }
    zoomBtn.innerHTML = icon(hud.view === 'work' ? 'zoomOut' : 'zoomIn');
    zoomBtn.setAttribute('aria-label', hud.view === 'work' ? 'Zoom out to the whole painting' : 'Zoom back into the micro-world');
  }

  function toast(text: string, tone: 'info' | 'good' | 'warn' = 'info') {
    const t = h('div', { class: `toast ${tone}` }, text);
    toastWrap.append(t);
    setTimeout(() => t.remove(), 2700);
  }

  function showCurse(on: boolean, text: string) {
    removeCurse();
    if (!on) return;
    curseBanner = h('div', { class: 'curse-banner', role: 'alert', 'data-testid': 'curse' },
      h('span', { class: 'imp' }, '😈'),
      h('span', null, text),
      h('button', { class: 'btn', onclick: () => runtime.repairCurse() }, 'Fix it!'),
    );
    el.append(curseBanner);
  }
  function removeCurse() { curseBanner?.remove(); curseBanner = null; }

  function showCoach() {
    const g = stage.tutorial.gesture;
    coach = h('div', { class: 'coach', role: 'dialog', 'aria-label': 'How to play', 'data-testid': 'coach' },
      h('div', { class: `gesture g-${g}`, html: icon(GESTURE_ICON[g] ?? 'hand') }),
      h('div', { class: 'txt' }, h('b', null, stage.blurb.split('.')[0] + '.'), stage.tutorial.text),
      h('button', { class: 'btn small', onclick: () => removeCoach(true) }, 'Got it'),
    );
    el.append(coach);
  }
  function removeCoach(mark = false) {
    if (!coach) return;
    coach.remove();
    coach = null;
    if (mark) app.save.markTutorial(stage.id);
  }

  function openPause() {
    if (runtime.phase !== 'play' && runtime.phase !== 'intro') return;
    runtime.pause(true);
    app.openPause(stage, () => runtime.pause(false));
  }

  const onResize = () => runtime.resize();
  window.addEventListener('resize', onResize);
  const onVis = () => { if (document.hidden && runtime.phase === 'play' && !runtime.paused && !runtime.autoplay) openPause(); };
  document.addEventListener('visibilitychange', onVis);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'p') openPause();
    if (e.key === 'z') zoomBtn.click();
    if (e.key === 'h') hintBtn.click();
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && lastHud && lastHud.tools[n - 1]) runtime.selectTool(lastHud.tools[n - 1].id);
  };
  window.addEventListener('keydown', onKey);

  requestAnimationFrame(() => { void runtime.start(); });

  return {
    el, runtime,
    destroy() {
      runtime.destroy();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
