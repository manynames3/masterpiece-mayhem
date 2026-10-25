/**
 * Tiny Verlet truss solver for the "Bridge the Gap" stage. Pure logic (no DOM) so it can be
 * unit-tested: an unbraced deck must fail under load, a triangulated truss must hold.
 */
export interface TNode { x: number; y: number; px: number; py: number; ox: number; oy: number; fixed: boolean; load: number }
export interface TBeam { a: number; b: number; rest: number; broken: boolean; strain: number; deck: boolean }

export const TRUSS = {
  gravity: 1400,
  iterations: 14,
  damping: 0.985,
  breakTension: 0.03,
  breakCompression: 0.05,
  maxSag: 0.55, // in grid spacings
};

export function makeNode(x: number, y: number, fixed = false): TNode {
  return { x, y, px: x, py: y, ox: x, oy: y, fixed, load: 0 };
}

export function makeBeam(nodes: TNode[], a: number, b: number, deck: boolean): TBeam {
  return { a, b, rest: Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y), broken: false, strain: 0, deck };
}

export function resetTruss(nodes: TNode[], beams: TBeam[]) {
  for (const n of nodes) { n.x = n.px = n.ox; n.y = n.py = n.oy; n.load = 0; }
  for (const b of beams) { b.broken = false; b.strain = 0; }
}

/** advance one fixed step; returns the first beam index that broke (or -1) */
export function stepTruss(nodes: TNode[], beams: TBeam[], dt: number): number {
  const g = TRUSS.gravity;
  for (const n of nodes) {
    if (n.fixed) continue;
    const vx = (n.x - n.px) * TRUSS.damping, vy = (n.y - n.py) * TRUSS.damping;
    n.px = n.x; n.py = n.y;
    n.x += vx;
    n.y += vy + g * (1 + n.load) * dt * dt;
  }
  for (let it = 0; it < TRUSS.iterations; it++) {
    for (const b of beams) {
      if (b.broken) continue;
      const A = nodes[b.a], B = nodes[b.b];
      const dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = (d - b.rest) / d;
      const wa = A.fixed ? 0 : 1, wb = B.fixed ? 0 : 1;
      const w = wa + wb;
      if (!w) continue;
      const ka = (diff * wa) / w, kb = (diff * wb) / w;
      A.x += dx * ka; A.y += dy * ka;
      B.x -= dx * kb; B.y -= dy * kb;
    }
  }
  let broke = -1;
  beams.forEach((b, i) => {
    if (b.broken) return;
    const A = nodes[b.a], B = nodes[b.b];
    b.strain = (Math.hypot(B.x - A.x, B.y - A.y) - b.rest) / b.rest;
    if (b.strain > TRUSS.breakTension || b.strain < -TRUSS.breakCompression) { b.broken = true; if (broke < 0) broke = i; }
  });
  return broke;
}

/** max downward displacement of non-fixed nodes, in units of `spacing` */
export function maxSag(nodes: TNode[], spacing: number) {
  let m = 0;
  for (const n of nodes) if (!n.fixed) m = Math.max(m, (n.y - n.oy) / spacing);
  return m;
}

export interface WalkResult { ok: boolean; reason: 'crossed' | 'collapse' | 'nodeck' | 'sag'; progress: number }

/**
 * Walk a load (the courier worker) across deck beams from xStart to xEnd, simulating as it goes.
 * Used by both the live stage and the unit tests.
 */
export function walkTest(nodes: TNode[], beams: TBeam[], xStart: number, xEnd: number, spacing: number, load = 6, steps = 360, onStep?: (x: number, y: number) => void): WalkResult {
  resetTruss(nodes, beams);
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) { if (stepTruss(nodes, beams, dt) >= 0) return { ok: false, reason: 'collapse', progress: 0 }; }
  for (let s = 0; s <= steps; s++) {
    const x = xStart + ((xEnd - xStart) * s) / steps;
    for (const n of nodes) n.load = 0;
    const deck = beams.find((b) => b.deck && !b.broken && Math.min(nodes[b.a].x, nodes[b.b].x) - 1 <= x && Math.max(nodes[b.a].x, nodes[b.b].x) + 1 >= x);
    if (!deck) return { ok: false, reason: 'nodeck', progress: s / steps };
    const A = nodes[deck.a], B = nodes[deck.b];
    const span = B.x - A.x || 1e-6;
    const u = Math.min(1, Math.max(0, (x - A.x) / span));
    A.load += load * (1 - u);
    B.load += load * u;
    if (stepTruss(nodes, beams, dt) >= 0) return { ok: false, reason: 'collapse', progress: s / steps };
    if (maxSag(nodes, spacing) > TRUSS.maxSag) return { ok: false, reason: 'sag', progress: s / steps };
    onStep?.(x, A.y + (B.y - A.y) * u);
  }
  return { ok: true, reason: 'crossed', progress: 1 };
}
