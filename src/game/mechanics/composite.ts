import type { PointerState } from '../../core/input';
import { clamp } from '../../core/math';
import { Mechanic, type MechanicEnv, type ToolDef } from '../mechanic';
import type { MechanicParams } from './params';

export interface CompositeParams {
  type: 'composite';
  phases: { title: string; goal: { metric: string; target: number; label: string }; params: MechanicParams }[];
}

/**
 * Composite (stage 30 "The Final Touch"): chains earlier mechanic families in sequence —
 * cleaning, pigment routing, fresco mending, a structural bridge, then the timed final touch.
 */
export class CompositeMechanic extends Mechanic {
  private idx = 0;
  private sub!: Mechanic;
  private between = 0;
  private done = false;

  constructor(readonly p: CompositeParams, private factory: (p: MechanicParams) => Mechanic) { super(); }

  init() { this.start(0); }

  private subEnv(): MechanicEnv {
    const ph = this.p.phases[this.idx];
    const env = this.env;
    return {
      ...env,
      stage: { ...env.stage, objectives: [{ id: 'phase', label: ph.goal.label, metric: ph.goal.metric, target: ph.goal.target, format: ph.goal.metric === 'clean' ? 'pct' : 'count' }] },
      refreshTools: () => env.refreshTools(),
    };
  }

  private start(i: number) {
    this.idx = i;
    this.sub = this.factory(this.p.phases[i].params);
    this.sub.bind(this.subEnv());
    this.sub.init();
    this.env.toast(`Part ${i + 1}/${this.p.phases.length}: ${this.p.phases[i].title}`, 'good');
    this.env.audio.play('chime', { pitch: 0.8 + i * 0.1 });
    this.env.refreshTools();
  }

  private goalMet() {
    const g = this.p.phases[this.idx].goal;
    return (this.sub.metrics()[g.metric] ?? 0) >= g.target && this.sub.ready();
  }

  tools(): ToolDef[] { return this.between > 0 ? [] : this.sub.tools(); }
  selectTool(id: string) { this.sub.selectTool(id); }
  progressLabel() { return `Part ${this.idx + 1}/${this.p.phases.length} · ${this.p.phases[this.idx].title}`; }

  metrics() {
    const sm = this.sub.metrics();
    const n = this.p.phases.length;
    const phasesDone = this.idx + (this.done ? 1 : 0);
    return { progress: clamp((phasesDone + (this.done ? 0 : clamp(sm.progress ?? 0))) / n), phases: phasesDone, phasesTotal: n };
  }

  ready() { return this.done && this.sub.ready(); }
  hintPoint() { return this.sub.hintPoint(); }

  onDown(p: PointerState) { if (this.between <= 0 && !this.done) this.sub.onDown(p); }
  onMove(p: PointerState) { if (this.between <= 0 && !this.done) this.sub.onMove(p); }
  onUp(p: PointerState, tap: boolean) { if (this.between <= 0 && !this.done) this.sub.onUp(p, tap); }
  onHover(p: PointerState) { this.sub.onHover(p); }

  update(dt: number) {
    this.sub.snapshotting = this.snapshotting;
    this.sub.update(dt);
    if (this.between > 0) {
      this.between -= dt;
      if (this.between <= 0) { this.sub.dispose(); this.start(this.idx + 1); }
      return;
    }
    if (!this.done && this.goalMet()) {
      this.sub.onComplete();
      this.env.audio.play('success');
      if (this.idx >= this.p.phases.length - 1) this.done = true;
      else this.between = 1.6;
      this.env.refreshTools();
    }
  }

  renderBelow(g: CanvasRenderingContext2D) { this.sub.snapshotting = this.snapshotting; this.sub.renderBelow(g); }
  render(g: CanvasRenderingContext2D) { this.sub.render(g); }
  onComplete() { /* the final sub-mechanic already celebrated */ }

  autoplay(dt: number) {
    if (this.between > 0 || this.done) return;
    this.sub.autoplaying = true;
    this.sub.autoplay(dt);
  }

  dispose() { this.sub?.dispose(); }
}
