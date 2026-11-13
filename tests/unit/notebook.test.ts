import { describe, expect, it } from 'vitest';
import { PAINTING_ORDER } from '../../src/art/paintings';
import { NOTEBOOK, restorerNote } from '../../src/data/notebook';
import { MECHANIC_FAMILIES } from '../../src/game/mechanics/registry';

// Kid-facing text must stay short and easy: roughly 2nd-grade English.
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const words = (t: string) => t.replace(/[^A-Za-z0-9'\s-]/g, ' ').split(/\s+/).filter(Boolean);
function syllables(w: string) {
  const s = w.toLowerCase().replace(/[^a-z]/g, '');
  if (s.length <= 3) return 1;
  const groups = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}
/** Flesch–Kincaid grade level */
function grade(text: string) {
  const ss = sentences(text), ws = words(text);
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  return 0.39 * (ws.length / ss.length) + 11.8 * (syl / ws.length) - 15.59;
}

describe('Conservator\'s Notebook reads at an early-reader level', () => {
  for (const id of PAINTING_ORDER) {
    const n = NOTEBOOK[id];
    const kidText = [n.hook, ...n.facts, ...n.hotspots.flatMap((h) => [h.title + '.', h.text])];

    it(`${id}: short sentences, short facts, a few hotspots`, () => {
      for (const t of kidText) for (const s of sentences(t)) expect(words(s).length, s).toBeLessThanOrEqual(14);
      for (const f of n.facts) {
        expect(sentences(f).length, f).toBeLessThanOrEqual(2);
        expect(words(f).length, f).toBeLessThanOrEqual(20);
      }
      expect(n.hotspots.length).toBeLessThanOrEqual(3);
      for (const h of n.hotspots) expect(words(h.text).length, h.text).toBeLessThanOrEqual(18);
    });

    it(`${id}: overall reading grade is about 3 or lower`, () => {
      expect(grade(kidText.join(' '))).toBeLessThanOrEqual(3.5);
    });

    it(`${id}: hotspots sit on the painting`, () => {
      for (const h of n.hotspots) {
        expect(h.x).toBeGreaterThanOrEqual(0); expect(h.x).toBeLessThanOrEqual(1);
        expect(h.y).toBeGreaterThanOrEqual(0); expect(h.y).toBeLessThanOrEqual(1);
      }
    });
  }

  it('every kind of stage has a one-line restorer tip', () => {
    for (const m of MECHANIC_FAMILIES) {
      const note = restorerNote(999, m);
      expect(sentences(note.text).length, m).toBeLessThanOrEqual(2);
      expect(words(note.text).length, m).toBeLessThanOrEqual(20);
    }
  });
});
