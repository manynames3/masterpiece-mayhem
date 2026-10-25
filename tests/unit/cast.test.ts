import { describe, expect, it } from 'vitest';
import { CRITTER_PROFILES, HEROES, HERO_ORDER, SPECIES_FOR_KIND, heroForSeed, heroHeight } from '../../src/art/characters';

describe('character cast', () => {
  it('has four distinct named heroes with complete profiles', () => {
    expect(HERO_ORDER).toHaveLength(4);
    const names = new Set(HERO_ORDER.map((id) => HEROES[id].name));
    expect(names.size).toBe(4);
    for (const id of HERO_ORDER) {
      const p = HEROES[id];
      for (const k of ['name', 'role', 'tagline', 'personality', 'signature', 'motif'] as const) expect(p[k].length).toBeGreaterThan(5);
    }
  });

  it('maps seeds to heroes deterministically, including negative/non-integer seeds', () => {
    for (let s = -8; s < 16; s++) expect(heroForSeed(s)).toBe(heroForSeed(s + 4));
    expect(HERO_ORDER).toContain(heroForSeed(2.4));
  });

  it('gives heroes genuinely different heights (silhouettes)', () => {
    const hs = HERO_ORDER.map(heroHeight);
    expect(new Set(hs.map((h) => h.toFixed(2))).size).toBe(4);
  });

  it('covers every grime kind with a species, and has at least five mascots incl. a boss', () => {
    for (const kind of ['soot', 'dust', 'slime', 'algae', 'fire', 'crumb', 'fly', 'crack', 'gold', 'ink'] as const) expect(SPECIES_FOR_KIND[kind]).toBeTruthy();
    expect(CRITTER_PROFILES.length).toBeGreaterThanOrEqual(5);
    expect(CRITTER_PROFILES.some((p) => p.boss)).toBe(true);
    expect(new Set(CRITTER_PROFILES.map((p) => p.name)).size).toBe(CRITTER_PROFILES.length);
  });
});
