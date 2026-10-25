import { describe, expect, it } from 'vitest';
import { TRUSS, makeBeam, makeNode, walkTest, type TBeam, type TNode } from '../../src/game/truss';

/** 7 columns, deck row y=0, chord row y=s. Anchors fixed at both ends of both rows. */
function grid(s = 60) {
  const nodes: TNode[] = [];
  const id = (c: number, r: number) => r * 7 + c;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) nodes.push(makeNode(c * s, r * s, c === 0 || c === 6));
  return { nodes, id, s };
}

describe('truss solver', () => {
  it('an unbraced deck sags or snaps under the courier', () => {
    const { nodes, id, s } = grid();
    const beams: TBeam[] = [];
    for (let c = 0; c < 6; c++) beams.push(makeBeam(nodes, id(c, 0), id(c + 1, 0), true));
    const r = walkTest(nodes, beams, 0, 6 * s, s);
    expect(r.ok).toBe(false);
  });

  it('a Warren truss carries the courier across', () => {
    const { nodes, id, s } = grid();
    const beams: TBeam[] = [];
    for (let c = 0; c < 6; c++) {
      beams.push(makeBeam(nodes, id(c, 0), id(c + 1, 0), true));
      beams.push(makeBeam(nodes, id(c, 1), id(c + 1, 1), false));
      beams.push(c % 2 === 0 ? makeBeam(nodes, id(c, 0), id(c + 1, 1), false) : makeBeam(nodes, id(c, 1), id(c + 1, 0), false));
    }
    for (let c = 1; c < 6; c++) beams.push(makeBeam(nodes, id(c, 0), id(c, 1), false));
    const r = walkTest(nodes, beams, 0, 6 * s, s);
    expect(r).toMatchObject({ ok: true });
  });

  it('a deck with a missing plank drops the courier', () => {
    const { nodes, id, s } = grid();
    const beams: TBeam[] = [];
    for (let c = 0; c < 6; c++) if (c !== 3) beams.push(makeBeam(nodes, id(c, 0), id(c + 1, 0), true));
    const r = walkTest(nodes, beams, 0, 6 * s, s);
    expect(r.ok).toBe(false);
    expect(TRUSS.iterations).toBeGreaterThan(4);
  });
});
