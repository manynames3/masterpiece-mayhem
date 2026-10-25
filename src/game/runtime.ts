import { loadPainting, type LoadedPainting } from '../art/paintings';
import { brushstrokeTexture, canvas as makeCanvas } from '../art/textures';
import { drawBunting, drawLadder, drawLantern, drawScaffold, drawTent } from '../art/characters';
import { audio, haptic } from '../core/audio';
import { InputController, type PointerState } from '../core/input';
import { RNG, TAU, clamp, damp, ease, type Rect, type Vec } from '../core/math';
import { Particles } from '../core/particles';
import type { ObjectiveDef, StageDef, StarDef } from '../data/types';
import { Walker } from './agents';
import { BotchMeter, CURSE_TEXT, type CurseKind } from './botch';
import { Camera, type View } from './camera';
import type { Mechanic, MechanicEnv, ToolDef } from './mechanic';
import { createMechanic } from './mechanics/registry';

export interface ObjectiveView { id: string; label: string; value: string; done: boolean; optional: boolean }
export interface HudState {
  objectives: ObjectiveView[];
  progress: number;
  progressLabel: string;
  botch: number;
  curse: CurseKind | null;
  mistakes: number;
  tools: ToolDef[];
  time: number;
  view: 'work' | 'overview';
  phase: Phase;
}
export interface StarResult { label: string; ok: boolean }
export interface StageResult {
  stage: StageDef;
  stars: number;
  starResults: StarResult[];
  score: number;
  mistakes: number;
  curses: number;
  time: number;
  before: HTMLCanvasElement | null;
  after: HTMLCanvasElement | null;
  metrics: Record<string, number>;
}

type Phase = 'loading' | 'intro' | 'play' | 'celebrate' | 'done' | 'failed';

export interface RuntimeCallbacks {
  onHud(h: HudState): void;
  onWin(r: StageResult): void;
  onFail(message: string): void;
  onCurse(kind: CurseKind | null, text: string): void;
  onToast(text: string, tone: 'info' | 'good' | 'warn'): void;
  onPhase(p: Phase): void;
  onFirstInteraction(): void;
}

export interface Insets { top: number; bottom: number; left: number; right: number }

function evalOp(v: number, op: '>=' | '<=', target: number) {
  return op === '<=' ? v <= target + 1e-9 : v >= target - 1e-9;
}

export function formatObjective(o: ObjectiveDef, v: number): string {
  if (o.format === 'pct') return `${Math.floor(clamp(v) * 100)}% / ${Math.round(o.target * 100)}%`;
  if (o.op === '<=') return `${Math.round(v)} / ${o.target} max`;
  return `${Math.min(Math.round(v), o.target)} / ${o.target}`;
}

/**
 * Owns one stage session: painting, camera, mechanic, botch meter, objective evaluation, the
 * three dramatic beats (dirty overview → dive into the micro-village → restored reveal).
 */
export class StageRuntime {
  readonly g: CanvasRenderingContext2D;
  readonly cam = new Camera();
  readonly fx = new Particles();
  readonly botch: BotchMeter;
  readonly input: InputController;
  mech!: Mechanic;
  painting!: LoadedPainting;
  phase: Phase = 'loading';
  paused = false;
  autoplay = false;
  view: 'work' | 'overview' = 'overview';
  W = 1000;
  H = 1000;
  private focusPx: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private unit = 1;
  private dpr = 1;
  private sw = 1;
  private sh = 1;
  private t = 0;
  private playTime = 0;
  private mistakes = 0;
  private raf = 0;
  private last = 0;
  private hudTimer = 0;
  private interacted = false;
  private veil = { before: 0.8, after: 0.5, wipe: 0 };
  private strokes!: CanvasPattern | null;
  private crew: Walker[] = [];
  private celebrateTimer = 0;
  private before: HTMLCanvasElement | null = null;
  private destroyed = false;
  private zoomK = 0;
  private hoverPar: Vec = { x: 0, y: 0 };
  private reduced: boolean;
  private rng: RNG;
  private bonus = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly stage: StageDef,
    private cb: RuntimeCallbacks,
    private insets: () => Insets,
    opts: { reducedMotion: boolean; paintingDoneBefore: number; haptics: boolean },
  ) {
    this.g = canvas.getContext('2d', { alpha: false })!;
    this.reduced = opts.reducedMotion;
    this.fx.reduced = opts.reducedMotion;
    this.rng = new RNG(stage.seed);
    this.botch = new BotchMeter(stage.seed);
    this.hapticsOn = opts.haptics;
    const done = clamp(opts.paintingDoneBefore, 0, 2);
    this.veil.before = (1 - done / 3) * 0.85;
    this.veil.after = (1 - (done + 1) / 3) * 0.85;
    this.botch.onCurse = (k) => {
      audio.play('boing', { pitch: 0.6 });
      audio.play('giggle');
      this.cam.shake(0.4);
      this.cb.onCurse(k, CURSE_TEXT[k]);
    };
    this.botch.onClear = () => this.cb.onCurse(null, '');
    this.input = new InputController(canvas, (sx, sy) => this.screenToLogical(sx, sy));
    this.input.enabled = false;
    this.input.handlers = {
      down: (p) => this.pointer('down', p),
      move: (p) => this.pointer('move', p),
      up: (p, tap) => this.pointer('up', p, tap),
      hover: (p) => this.pointer('hover', p),
    };
  }
  private hapticsOn: boolean;

  async start() {
    this.resize();
    this.painting = await loadPainting(this.stage.painting);
    if (this.destroyed) return;
    const f = this.stage.focus;
    const pw = this.painting.w, ph = this.painting.h;
    this.focusPx = { x: f.x * pw, y: f.y * ph, w: f.w * pw, h: f.h * ph };
    this.unit = this.focusPx.w / this.W;
    this.H = Math.round((this.W * this.focusPx.h) / this.focusPx.w);
    this.fx.scale = 1;
    this.mech = createMechanic(this.stage.mechanic);
    this.mech.bind(this.makeEnv());
    this.mech.init();
    this.setupDecor();
    const tex = brushstrokeTexture(512, this.stage.seed, this.stage.visual.strokeAngle ?? 0.4, this.stage.visual.swirl ? 1 : 0);
    this.strokes = this.g.createPattern(tex, 'repeat');
    this.cam.set(this.overviewView());
    this.view = 'overview';
    this.setPhase('intro');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    // beat 1: the dirty overview — then dive into the micro-world
    window.setTimeout(() => this.diveIn(), this.reduced ? 300 : 1100);
  }

  private diveIn(fast = false) {
    if (this.phase !== 'intro' || this.cam.moving) return;
    audio.play('whoosh');
    this.cam.flyTo(this.workView(), this.reduced ? 0.4 : fast ? 0.9 : 1.9, () => {
      this.view = 'work';
      this.before = this.snapshot();
      this.setPhase('play');
      this.input.enabled = true;
      this.pushHud(true);
    });
  }

  skipIntro() {
    if (this.phase === 'intro') {
      if (this.cam.moving) {
        this.cam.set(this.workView());
        this.view = 'work';
        this.before = this.snapshot();
        this.setPhase('play');
        this.input.enabled = true;
      } else this.diveIn(true);
    }
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.cb.onPhase(p);
  }

  private makeEnv(): MechanicEnv {
    return {
      W: this.W,
      H: this.H,
      rng: this.rng,
      fx: this.fx,
      audio,
      painting: this.painting,
      focusPx: this.focusPx,
      unit: this.unit,
      stage: this.stage,
      time: () => this.t,
      mistake: (x, y, label = 'Oops!', weight = 1) => {
        if (this.phase !== 'play') return;
        this.mistakes++;
        this.botch.add(weight);
        audio.play('error');
        this.haptic(30);
        this.fx.floatText(x, y - 30, label, '#FFB4A4');
        this.fx.emit('splat', x, y, 6, { color: '#E86F5A', size: 6, speed: 160, gravity: 400 });
        this.cam.shake(0.25);
        for (const c of this.crew) if (!c.busy) { c.state = 'scared'; window.setTimeout(() => { if (c.state === 'scared') c.state = 'idle'; }, 900); }
      },
      reward: (x, y, points, label) => {
        this.bonus += points;
        this.fx.floatText(x, y, label ? `${label} +${points}` : `+${points}`, '#FFE9A8');
        audio.play('coin', { pitch: 0.9 + Math.random() * 0.2 });
      },
      shake: (a) => { if (!this.reduced) this.cam.shake(a); },
      haptic: (ms) => this.haptic(ms),
      toast: (text, tone = 'info') => this.cb.onToast(text, tone),
      reducedMotion: this.reduced,
      drawPainting: (g, variant = 'clean', clip) => this.drawPaintingLogical(g, variant, clip),
      requestView: (v) => this.setView(v),
      refreshTools: () => this.pushHud(true),
      curse: () => this.botch.intensity,
    };
  }

  private haptic(ms = 12) { if (this.hapticsOn) haptic(ms); }

  // ------------------------------------------------------------------ geometry
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.sw = Math.max(1, r.width);
    this.sh = Math.max(1, r.height);
    this.canvas.width = Math.round(this.sw * this.dpr);
    this.canvas.height = Math.round(this.sh * this.dpr);
    if (this.painting) {
      const v = this.view === 'work' && this.phase !== 'intro' ? this.workView() : this.overviewView();
      if (this.cam.moving) this.cam.retarget(this.phase === 'celebrate' ? this.overviewView() : this.workView());
      else this.cam.set(v);
    }
  }

  private viewport(): Rect {
    const i = this.insets();
    return { x: i.left, y: i.top, w: Math.max(50, this.sw - i.left - i.right), h: Math.max(50, this.sh - i.top - i.bottom) };
  }
  private center() {
    const vp = this.viewport();
    return { x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 };
  }
  private frameThickness() { return Math.max(this.painting.w, this.painting.h) * 0.045; }
  overviewView(): View {
    const ft = this.frameThickness();
    return Camera.fit({ x: -ft, y: -ft, w: this.painting.w + ft * 2, h: this.painting.h + ft * 2 }, this.viewport(), 0.94);
  }
  workView(): View { return Camera.fit(this.focusPx, this.viewport(), 0.97); }

  setView(v: 'work' | 'overview') {
    if (this.phase !== 'play' || this.view === v) return;
    this.view = v;
    audio.play('whoosh', { vol: 0.6 });
    this.cam.flyTo(v === 'work' ? this.workView() : this.overviewView(), this.reduced ? 0.25 : 0.7);
    this.input.enabled = v === 'work';
    this.pushHud(true);
  }

  screenToLogical(sx: number, sy: number): Vec {
    const c = this.center();
    const p = this.cam.toPainting(sx, sy, c.x, c.y);
    return { x: (p.x - this.focusPx.x) / this.unit, y: (p.y - this.focusPx.y) / this.unit };
  }

  logicalToScreen(x: number, y: number): Vec {
    const c = this.center();
    const px = this.focusPx.x + x * this.unit, py = this.focusPx.y + y * this.unit;
    return { x: (px - this.cam.cx) * this.cam.scale + c.x, y: (py - this.cam.cy) * this.cam.scale + c.y };
  }

  // ------------------------------------------------------------------ input
  private pointer(kind: 'down' | 'move' | 'up' | 'hover', p: PointerState, tap = false) {
    if (kind === 'hover' || kind === 'move') {
      const c = this.center();
      this.hoverPar = { x: (p.sx - c.x) / this.sw, y: (p.sy - c.y) / this.sh };
    }
    if (this.paused || this.phase !== 'play' || this.view !== 'work' || this.autoplay) return;
    if (kind === 'down') {
      audio.unlock();
      if (!this.interacted) { this.interacted = true; this.cb.onFirstInteraction(); }
      this.mech.onDown(p);
    } else if (kind === 'move') this.mech.onMove(p);
    else if (kind === 'up') this.mech.onUp(p, tap);
    else this.mech.onHover(p);
  }

  selectTool(id: string) {
    if (this.phase !== 'play') return;
    audio.play('click');
    this.mech.selectTool(id);
    this.pushHud(true);
  }

  repairCurse() {
    if (this.botch.repair()) {
      audio.play('sparkle');
      audio.play('chime', { pitch: 1.2 });
      for (let i = 0; i < 18; i++) this.fx.emit('sparkle', this.W / 2 + (Math.random() - 0.5) * 300, this.H / 2 + (Math.random() - 0.5) * 300, 1, { color: '#FFE9A8', size: 10, speed: 120 });
    }
  }

  // ------------------------------------------------------------------ metrics, objectives, stars
  metrics(): Record<string, number> {
    const m = this.mech ? this.mech.metrics() : { progress: 0 };
    return { ...m, mistakes: this.mistakes, curses: this.botch.curses, time: this.playTime };
  }

  objectiveViews(m = this.metrics()): ObjectiveView[] {
    return this.stage.objectives.map((o) => {
      const v = m[o.metric] ?? 0;
      return { id: o.id, label: o.label, value: formatObjective(o, v), done: evalOp(v, o.op ?? '>=', o.target), optional: !!o.optional };
    });
  }

  private allPrimaryDone(m: Record<string, number>) {
    return this.stage.objectives.filter((o) => !o.optional).every((o) => evalOp(m[o.metric] ?? 0, o.op ?? '>=', o.target));
  }

  starResults(m = this.metrics()): StarResult[] {
    const s = (d: StarDef) => ({ label: d.label, ok: evalOp(m[d.metric] ?? 0, d.op, d.value) });
    return [{ label: 'Restore the painting', ok: true }, s(this.stage.stars[0]), s(this.stage.stars[1])];
  }

  private pushHud(force = false) {
    if (!this.mech) return;
    const m = this.metrics();
    this.cb.onHud({
      objectives: this.objectiveViews(m),
      progress: clamp(m.progress ?? 0),
      progressLabel: this.mech.progressLabel(),
      botch: this.botch.level,
      curse: this.botch.curse,
      mistakes: this.mistakes,
      tools: this.mech.tools(),
      time: this.playTime,
      view: this.view,
      phase: this.phase,
    });
    if (force) this.hudTimer = 0;
  }

  // ------------------------------------------------------------------ loop
  private frame = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(1 / 20, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused) this.update(dt);
    this.render();
  };

  /** deterministic stepping for automated tests */
  step(dt: number, n = 1) { for (let i = 0; i < n; i++) this.update(dt); }

  private update(dt: number) {
    this.t += dt;
    this.cam.update(dt);
    this.fx.update(dt);
    this.botch.update(dt);
    for (const c of this.crew) c.update(dt);
    this.cam.parallaxX = damp(this.cam.parallaxX, this.reduced ? 0 : -this.hoverPar.x * 10 + Math.sin(this.t * 0.35) * 3, 2, dt);
    this.cam.parallaxY = damp(this.cam.parallaxY, this.reduced ? 0 : -this.hoverPar.y * 8 + Math.cos(this.t * 0.29) * 2, 2, dt);
    const ov = this.overviewView().scale;
    this.zoomK = clamp(Math.log(this.cam.scale / ov) / Math.log(5));
    if (!this.mech) return;
    if (this.phase === 'play' || this.phase === 'intro') {
      if (this.phase === 'play') {
        this.playTime += dt;
        if (this.autoplay && this.view === 'work') { this.mech.autoplaying = true; this.mech.autoplay(dt); }
      }
      this.mech.update(dt);
      if (this.phase === 'play') {
        const m = this.metrics();
        if (this.allPrimaryDone(m) && this.mech.ready()) this.win();
        else if (this.stage.failIf && evalOp(m[this.stage.failIf.metric] ?? 0, this.stage.failIf.op, this.stage.failIf.value)) this.fail(this.stage.failIf.message);
      }
    } else if (this.phase === 'celebrate') {
      this.mech.update(dt);
      this.celebrateTimer += dt;
      this.veil.wipe = clamp(this.veil.wipe + dt * 0.5);
      if (this.celebrateTimer > (this.reduced ? 1.2 : 3.4) && this.phase === 'celebrate') this.finish();
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0 && this.phase !== 'done') { this.pushHud(); this.hudTimer = 0.1; }
  }

  private win() {
    this.input.enabled = false;
    audio.stopLoops();
    this.mech.onComplete();
    this.setPhase('celebrate');
    this.celebrateTimer = 0;
    audio.play(this.stage.boss ? 'fanfare' : 'success');
    this.haptic(40);
    for (const c of this.crew) { c.path = []; c.state = 'cheer'; }
    for (let i = 0; i < (this.stage.boss ? 120 : 60); i++) {
      this.fx.emit('confetti', Math.random() * this.W, -20 - Math.random() * 100, 1, { speed: 60, dir: Math.PI / 2, gravity: 260, drag: 1.2, size: 14, max: 2.8 });
    }
    // beat 3: pull back to see the whole restored masterpiece
    window.setTimeout(() => {
      if (this.destroyed) return;
      this.view = 'overview';
      audio.play('whoosh', { pitch: 0.8 });
      this.cam.flyTo(this.overviewView(), this.reduced ? 0.5 : 2.2);
    }, this.reduced ? 200 : 900);
  }

  private finish() {
    this.setPhase('done');
    const m = this.metrics();
    const starResults = this.starResults(m);
    const stars = starResults.filter((s) => s.ok).length;
    const score = Math.max(100, Math.round(1000 + (stars - 1) * 250 + this.bonus - this.mistakes * 40 - this.botch.curses * 60));
    const after = this.snapshot();
    this.cb.onWin({
      stage: this.stage, stars, starResults, score, mistakes: this.mistakes, curses: this.botch.curses,
      time: this.playTime, before: this.before, after, metrics: m,
    });
  }

  private fail(msg: string) {
    this.setPhase('failed');
    this.input.enabled = false;
    audio.stopLoops();
    audio.play('thud');
    this.cb.onFail(msg);
  }

  pause(p: boolean) {
    this.paused = p;
    if (p) audio.stopLoops();
  }

  // ------------------------------------------------------------------ decor crew (the watchers)
  private setupDecor() {
    const d = this.stage.visual.decor;
    if (d.includes('crew-watch')) {
      const a = new Walker(56, this.H - 14, 44, 'flag', 60);
      const b = new Walker(this.W - 56, this.H - 14, 44, 'lantern', 60);
      b.facing = -1;
      a.hero = 'pip';
      b.hero = 'zuzu';
      this.crew.push(a, b);
    }
  }

  private renderDecor(g: CanvasRenderingContext2D) {
    const d = this.stage.visual.decor;
    const t = this.t;
    const W = this.W, H = this.H;
    const s = 30;
    g.save();
    // decor sits on the frame "lip" just outside the play area so it never blocks gameplay
    const px = this.cam.parallaxX * 0.6 / Math.max(0.2, this.cam.scale * this.unit);
    g.translate(px, 0);
    // decor hugs the edges of the micro-world: visible in work view, never intercepts input
    if (d.includes('scaffold-left')) { drawScaffold(g, 6, H - 2, 44, Math.min(H * 0.45, 300), s * 0.8); drawLadder(g, 62, H - 4, 120, s * 0.8, 0.12); }
    if (d.includes('scaffold-right')) drawScaffold(g, W - 50, H - 2, 44, Math.min(H * 0.4, 260), s * 0.8);
    if (d.includes('tent')) drawTent(g, W - 64, H - 6, 30, t);
    if (d.includes('bunting')) drawBunting(g, 10, 6, W - 10, 6, 22, t);
    if (d.includes('lanterns')) { drawLantern(g, 24, H * 0.32, 14, t); drawLantern(g, W - 24, H * 0.55, 14, t + 1); }
    g.restore();
    for (const c of this.crew) c.draw(g, t);
  }

  // ------------------------------------------------------------------ rendering
  private drawPaintingLogical(g: CanvasRenderingContext2D, variant: 'clean' | 'aged' | 'varnished', clip?: Rect) {
    const img = variant === 'aged' ? this.painting.aged() : variant === 'varnished' ? this.painting.varnished() : this.painting.image;
    const f = this.focusPx;
    const sx = this.painting.w / (img as HTMLImageElement).width || 1;
    if (clip) {
      const ix = f.x + clip.x * this.unit, iy = f.y + clip.y * this.unit;
      g.drawImage(img, ix / sx, iy / sx, (clip.w * this.unit) / sx, (clip.h * this.unit) / sx, clip.x, clip.y, clip.w, clip.h);
    } else {
      g.drawImage(img, f.x / sx, f.y / sx, f.w / sx, f.h / sx, 0, 0, this.W, this.H);
    }
  }

  private render() {
    const g = this.g;
    const dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // gallery wall
    const wall = g.createRadialGradient(this.sw / 2, this.sh * 0.42, 0, this.sw / 2, this.sh / 2, Math.max(this.sw, this.sh) * 0.8);
    wall.addColorStop(0, '#3A2A20');
    wall.addColorStop(1, '#140E0A');
    g.fillStyle = wall;
    g.fillRect(0, 0, this.sw, this.sh);
    if (!this.painting) return;
    const c = this.center();
    this.cam.apply(g, c.x, c.y, dpr);
    const P = this.painting;
    const ft = this.frameThickness();
    // gilded frame + wall shadow
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(-ft + ft * 0.25, -ft + ft * 0.4, P.w + ft * 2, P.h + ft * 2);
    const fg = g.createLinearGradient(-ft, -ft, P.w + ft, P.h + ft);
    fg.addColorStop(0, '#E8C46A'); fg.addColorStop(0.35, '#9A7330'); fg.addColorStop(0.6, '#D9B25A'); fg.addColorStop(1, '#6E5022');
    g.fillStyle = fg;
    g.fillRect(-ft, -ft, P.w + ft * 2, P.h + ft * 2);
    g.strokeStyle = 'rgba(60,40,15,0.6)';
    g.lineWidth = ft * 0.12;
    g.strokeRect(-ft * 0.55, -ft * 0.55, P.w + ft * 1.1, P.h + ft * 1.1);
    g.fillStyle = '#2A1A10';
    g.fillRect(-ft * 0.12, -ft * 0.12, P.w + ft * 0.24, P.h + ft * 0.24);

    // painting (wobble curse slices it)
    const wob = this.botch.curse === 'wobble';
    if (wob) {
      const slices = 40;
      const img = P.image;
      const iw = (img as HTMLImageElement).width, ih = (img as HTMLImageElement).height;
      for (let i = 0; i < slices; i++) {
        const y0 = (i / slices) * P.h, hh = P.h / slices + 1;
        const off = this.botch.wobble(y0 / this.unit, this.t) * this.unit;
        g.drawImage(img, 0, (y0 / P.h) * ih, iw, (hh / P.h) * ih, off, y0, P.w, hh);
      }
    } else g.drawImage(P.image, 0, 0, P.w, P.h);

    // aged veil outside the play area (radially wiped away on completion)
    const f = this.focusPx;
    const fullVeil = this.phase === 'celebrate' || this.phase === 'done';
    const wipe = ease.inOutCubic(this.veil.wipe);
    const afterA = this.veil.after, beforeA = this.veil.before;
    g.save();
    g.beginPath();
    g.rect(0, 0, P.w, P.h);
    if (!fullVeil) g.rect(f.x + f.w, f.y, -f.w, f.h); // hole (counter-wound)
    g.clip('evenodd');
    if (afterA > 0.01) { g.globalAlpha = afterA; g.drawImage(P.aged(), 0, 0, P.w, P.h); }
    const extra = beforeA - afterA;
    if (extra > 0.01) {
      g.beginPath();
      g.rect(0, 0, P.w, P.h);
      const rr = wipe * Math.hypot(P.w, P.h) * 1.05;
      if (rr > 1) g.arc(f.x + f.w / 2, f.y + f.h / 2, rr, 0, TAU, true);
      g.clip('evenodd');
      g.globalAlpha = extra / Math.max(0.0001, 1 - afterA);
      g.drawImage(P.aged(), 0, 0, P.w, P.h);
    }
    g.restore();
    g.globalAlpha = 1;

    // brushstroke relief appears as you zoom toward the canvas surface
    if (this.strokes && this.zoomK > 0.05) {
      const m = new DOMMatrix().scale(0.42 * (P.w / 1400));
      this.strokes.setTransform?.(m);
      g.save();
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.5 * this.zoomK;
      g.fillStyle = this.strokes;
      const pad = 0;
      g.fillRect(Math.max(0, f.x - f.w * 0.6) - pad, Math.max(0, f.y - f.h * 0.6), Math.min(P.w, f.w * 2.2), Math.min(P.h, f.h * 2.2));
      g.restore();
    }

    // play area (logical coords)
    g.save();
    g.translate(f.x, f.y);
    g.scale(this.unit, this.unit);
    if (this.mech) {
      if (!fullVeil) {
        // dim halo outside the play rect during work view
        g.save();
        g.fillStyle = `rgba(16,10,6,${0.45 * this.zoomK})`;
        g.beginPath();
        g.rect(-this.W * 3, -this.H * 3, this.W * 7, this.H * 7);
        g.rect(this.W, 0, -this.W, this.H);
        g.fill('evenodd');
        g.restore();
      }
      g.save();
      g.beginPath();
      g.rect(-2, -2, this.W + 4, this.H + 4);
      g.clip();
      this.mech.renderBelow(g);
      g.restore();
      this.renderDecor(g);
      this.mech.render(g);
      this.fx.render(g);
      const poi = this.cursePoint();
      this.botch.render(g, poi.x, poi.y, Math.min(this.W, this.H) * 0.35, this.t);
      if (!fullVeil && this.zoomK > 0.3) {
        // soft inner frame on the micro-world edge
        g.strokeStyle = `rgba(232,196,106,${0.35 * this.zoomK})`;
        g.lineWidth = 3;
        g.strokeRect(0, 0, this.W, this.H);
      }
    }
    g.restore();
    const filt = this.botch.cssFilter(this.t);
    if (this.canvas.style.filter !== filt) this.canvas.style.filter = filt;
  }

  private cursePoint(): Vec {
    const pois = this.painting.def.poi;
    const f = this.stage.focus;
    for (const k of Object.keys(pois)) {
      const p = pois[k];
      if (p.x > f.x && p.x < f.x + f.w && p.y > f.y && p.y < f.y + f.h) {
        return { x: ((p.x - f.x) / f.w) * this.W, y: ((p.y - f.y) / f.h) * this.H + this.H * 0.04 };
      }
    }
    return { x: this.W / 2, y: this.H * 0.45 };
  }

  /** before/after thumbnails for the results card */
  snapshot(): HTMLCanvasElement | null {
    if (!this.mech) return null;
    const w = 520, h = Math.round((520 * this.H) / this.W);
    const c = makeCanvas(w, h);
    const g = c.getContext('2d')!;
    g.scale(w / this.W, h / this.H);
    this.drawPaintingLogical(g, 'clean');
    this.mech.snapshotting = true;
    try { this.mech.renderBelow(g); this.mech.render(g); } catch { /* snapshot is cosmetic */ }
    this.mech.snapshotting = false;
    return c;
  }

  hintPoint(): Vec | null {
    const p = this.mech?.hintPoint();
    return p ? this.logicalToScreen(p.x, p.y) : null;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    audio.stopLoops();
    this.mech?.dispose();
    this.canvas.style.filter = '';
  }
}
