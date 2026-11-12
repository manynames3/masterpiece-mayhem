import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '../../src/core/audioAssets';
import { compileSong, sceneForStage, type SceneId } from '../../src/core/music';

const SCENES: SceneId[] = ['menu', 'g1', 'g2', 'g3', 'g4', 'g5', 'boss', 'finale'];

describe('music score', () => {
  for (const scene of SCENES) {
    const song = compileSong(scene);

    it(`${scene}: compiles to a sorted, non-empty loop`, () => {
      expect(song.events.length).toBeGreaterThan(50);
      expect(song.loopBeats % song.meter).toBe(0);
      for (let i = 1; i < song.events.length; i++) expect(song.events[i].beat).toBeGreaterThanOrEqual(song.events[i - 1].beat);
      expect(song.events.every((e) => e.beat >= 0 && e.beat < song.loopBeats)).toBe(true);
    });

    it(`${scene}: every pitched note is in the arrangement's key`, () => {
      const inKey = new Set(song.scale.map((s) => (song.tonic + s) % 12));
      const pitched = song.events.filter((e) => e.midi !== undefined);
      const off = pitched.filter((e) => !inKey.has(((e.midi! % 12) + 12) % 12));
      // the main theme's chords are diatonic; the boss theme is harmonic minor
      expect(off.map((e) => `${e.inst}@${e.beat}:${e.midi}`)).toEqual([]);
    });

    it(`${scene}: no note is stretched more than a fifth from its nearest recorded sample`, () => {
      for (const e of song.events) {
        if (!e.inst || e.midi === undefined) continue;
        const nearest = Math.min(...INSTRUMENTS[e.inst].map((z) => Math.abs(z.midi - e.midi!)));
        expect(nearest, `${scene} ${e.inst} ${e.midi}`).toBeLessThanOrEqual(7);
      }
    });
  }

  it('routes stages to the right arrangement', () => {
    expect(sceneForStage(1, 'scrub', 1)).toBe('g1');
    expect(sceneForStage(3, 'flow', 15)).toBe('g3');
    expect(sceneForStage(4, 'boss', 24)).toBe('boss');
    expect(sceneForStage(5, 'composite', 30)).toBe('finale');
  });
});
