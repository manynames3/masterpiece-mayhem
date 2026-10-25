import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/math';
import { CourierMechanic, bfsPath } from '../../src/game/mechanics/courier';
import { getStage } from '../../src/data/stages';
import type { MechanicEnv } from '../../src/game/mechanic';

function fakeEnv(seed: number, W = 1000, H = 1123): MechanicEnv {
  return { W, H, rng: new RNG(seed), stage: getStage(8)!, refreshTools() {}, toast() {}, audio: { play() {} }, fx: { emit() {} } } as unknown as MechanicEnv;
}

describe('courier generator', () => {
  it('bfsPath respects used edges', () => {
    const edges = [{ a: 0, b: 1, used: -1 }, { a: 1, b: 2, used: 5 }, { a: 0, b: 2, used: -1 }];
    expect(bfsPath(3, edges, 0, 2)).toEqual([0, 2]);
    expect(bfsPath(3, edges, 1, 2)).toEqual([1, 0, 2]);
  });

  it('always produces a full, edge-disjoint solution for stage 8', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const m = new CourierMechanic(getStage(8)!.mechanic as never);
      m.bind(fakeEnv(seed));
      m.init();
      const sol = (m as unknown as { solution: { nodes: number[] }[] }).solution;
      expect(sol.length, `seed ${seed}`).toBe(6);
      const used = new Set<string>();
      for (const s of sol) for (let i = 0; i < s.nodes.length - 1; i++) {
        const k = [s.nodes[i], s.nodes[i + 1]].sort((a, b) => a - b).join('-');
        expect(used.has(k)).toBe(false);
        used.add(k);
      }
    }
  });
});
