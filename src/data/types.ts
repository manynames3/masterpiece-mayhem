import type { PaintingId } from '../art/paintings';
import type { Rect } from '../core/math';
import type { MechanicParams } from '../game/mechanics/params';

export type Gesture = 'scrub' | 'tap' | 'drag' | 'hold' | 'circle' | 'swipe' | 'lasso' | 'trace' | 'aim' | 'steer';

export type MetricOp = '>=' | '<=';

/** A live objective bound to a metric that the mechanic reports from real game state. */
export interface ObjectiveDef {
  id: string;
  label: string;
  metric: string;
  target: number;
  op?: MetricOp;
  format?: 'pct' | 'count';
  /** optional objectives never block completion; they usually feed a star */
  optional?: boolean;
}

export interface StarDef {
  label: string;
  metric: string;
  op: MetricOp;
  value: number;
}

export type DecorId = 'scaffold-left' | 'scaffold-right' | 'tent' | 'bunting' | 'lanterns' | 'ladder' | 'crew-watch' | 'huts';

export interface StageDef {
  id: number;
  slug: string;
  title: string;
  painting: PaintingId;
  gallery: 1 | 2 | 3 | 4 | 5;
  /** 1 (gentle) … 10 (fiendish) */
  difficulty: number;
  /** short mechanic family label for UI */
  family: string;
  blurb: string;
  /** normalized focus rectangle inside the painting — the "micro-world" play area */
  focus: Rect;
  tutorial: { gesture: Gesture; text: string };
  hint: string;
  objectives: ObjectiveDef[];
  /** stars 2 and 3 (star 1 = completion) */
  stars: [StarDef, StarDef];
  failIf?: { metric: string; op: MetricOp; value: number; message: string };
  mechanic: MechanicParams;
  visual: { decor: DecorId[]; strokeAngle?: number; swirl?: boolean; tiltShift?: boolean; ambience?: 'warm' | 'cool' | 'night' | 'fresco' };
  reward: { collectible: string; note: string };
  /** painting finale (every third stage) — bigger payoff */
  boss?: boolean;
  seed: number;
}

export interface GalleryDef {
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  subtitle: string;
  difficulty: string;
  color: string;
}
