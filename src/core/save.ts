export interface StageRecord {
  completed: boolean;
  stars: number;
  bestScore: number;
  plays: number;
  bestCurses?: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
  haptics: boolean;
}

export interface SaveData {
  version: 1;
  stages: Record<number, StageRecord>;
  settings: Settings;
  tutorialsSeen: number[];
  collection: string[];
  lastStage: number;
  finaleSeen: boolean;
}

const KEY = 'masterpiece-mayhem/save/v1';

export function defaultSave(): SaveData {
  const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    version: 1,
    stages: {},
    settings: { sound: true, music: true, reducedMotion: prefersReduced, haptics: true },
    tutorialsSeen: [],
    collection: [],
    lastStage: 1,
    finaleSeen: false,
  };
}

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export class SaveStore {
  data: SaveData;
  private listeners = new Set<() => void>();
  constructor(private storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.data = this.load();
  }

  private load(): SaveData {
    const base = defaultSave();
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.version !== 1) return base;
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings ?? {}) },
        stages: parsed.stages ?? {},
        tutorialsSeen: parsed.tutorialsSeen ?? [],
        collection: parsed.collection ?? [],
      };
    } catch {
      return base;
    }
  }

  persist() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage full or private mode */ }
    this.listeners.forEach((l) => l());
  }

  onChange(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  record(id: number): StageRecord {
    return this.data.stages[id] ?? { completed: false, stars: 0, bestScore: 0, plays: 0 };
  }

  /** Stage 1 is always open; every later stage opens when its predecessor is completed. */
  isUnlocked(id: number): boolean {
    if (id <= 1) return true;
    return this.record(id - 1).completed;
  }

  completeStage(id: number, stars: number, score: number, curses: number, collectible?: string) {
    const prev = this.record(id);
    this.data.stages[id] = {
      completed: true,
      stars: Math.max(prev.stars, stars),
      bestScore: Math.max(prev.bestScore, score),
      plays: prev.plays + 1,
      bestCurses: Math.min(prev.bestCurses ?? Infinity, curses),
    };
    if (collectible && !this.data.collection.includes(collectible)) this.data.collection.push(collectible);
    this.data.lastStage = Math.min(30, id + 1);
    this.persist();
  }

  notePlay(id: number) {
    const prev = this.record(id);
    this.data.stages[id] = { ...prev, plays: prev.plays + 1 };
    this.data.lastStage = id;
    this.persist();
  }

  totalStars(): number {
    return Object.values(this.data.stages).reduce((s, r) => s + (r.stars || 0), 0);
  }

  highestUnlocked(max = 30): number {
    let n = 1;
    while (n < max && this.isUnlocked(n + 1)) n++;
    return n;
  }

  markTutorial(id: number) {
    if (!this.data.tutorialsSeen.includes(id)) { this.data.tutorialsSeen.push(id); this.persist(); }
  }

  setSetting<K extends keyof Settings>(k: K, v: Settings[K]) { this.data.settings[k] = v; this.persist(); }

  reset() { this.data = defaultSave(); this.persist(); }

  /** Developer / QA helper: unlock everything. */
  unlockAll(max = 30) {
    for (let i = 1; i <= max; i++) {
      const r = this.record(i);
      if (!r.completed) this.data.stages[i] = { ...r, completed: true, stars: Math.max(r.stars, 1) };
    }
    this.persist();
  }
}
