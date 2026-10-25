import { RNG } from '../core/math';

export type PaintingId =
  | 'mona-lisa' | 'night-watch' | 'pearl-earring' | 'great-wave' | 'water-lilies'
  | 'starry-night' | 'grande-jatte' | 'garden-delights' | 'arnolfini' | 'creation-of-adam';

export interface PaintingDef {
  id: PaintingId;
  title: string;
  short: string;
  artist: string;
  year: string;
  file: string;
  width: number;
  height: number;
  /** Commons file page — documented in ART_LICENSES.md */
  source: string;
  holder: string;
  palette: string[];
  /** Normalized points of interest used by stages (face, smile, pearl, etc.) */
  poi: Record<string, { x: number; y: number }>;
  fallback: (g: CanvasRenderingContext2D, w: number, h: number) => void;
}

const base = import.meta.env.BASE_URL;

function grad(g: CanvasRenderingContext2D, w: number, h: number, stops: [number, string][], vertical = true) {
  const gr = vertical ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c: string, rot = 0) {
  g.fillStyle = c;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
}
function dabs(g: CanvasRenderingContext2D, w: number, h: number, colors: string[], n: number, size: number, seed: number) {
  const r = new RNG(seed);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.25 + r.next() * 0.35;
    blob(g, r.next() * w, r.next() * h, size * (0.5 + r.next()), size * (0.2 + r.next() * 0.4), r.pick(colors), r.next() * 3);
  }
  g.globalAlpha = 1;
}

/**
 * Original, deliberately stylized stand-ins. These are only used when the bundled public-domain
 * reproduction fails to load (offline cache miss, blocked asset), so the game never shows a
 * broken image.
 */
const FALLBACKS: Record<PaintingId, PaintingDef['fallback']> = {
  'mona-lisa': (g, w, h) => {
    grad(g, w, h, [[0, '#8C9A78'], [0.45, '#6F7A55'], [1, '#2D2416']]);
    dabs(g, w, h * 0.5, ['#A8B08A', '#5E6B4C', '#7C8C78'], 160, w * 0.08, 1);
    blob(g, w * 0.48, h * 0.75, w * 0.42, h * 0.35, '#2B2015');
    blob(g, w * 0.43, h * 0.26, w * 0.12, h * 0.11, '#D5A86A');
    blob(g, w * 0.43, h * 0.2, w * 0.15, h * 0.12, '#2A1C10');
    blob(g, w * 0.43, h * 0.28, w * 0.1, h * 0.09, '#DDB278');
    blob(g, w * 0.44, h * 0.31, w * 0.025, h * 0.006, '#9B5A3C');
    blob(g, w * 0.42, h * 0.53, w * 0.14, h * 0.07, '#C99A5E');
    blob(g, w * 0.43, h * 0.86, w * 0.16, h * 0.05, '#D2A266');
  },
  'night-watch': (g, w, h) => {
    grad(g, w, h, [[0, '#1E160C'], [0.6, '#3A2A14'], [1, '#1A120A']]);
    dabs(g, w, h, ['#5C4220', '#2C1E0E', '#7A5A2A'], 220, w * 0.04, 2);
    blob(g, w * 0.47, h * 0.62, w * 0.06, h * 0.24, '#151010');
    blob(g, w * 0.47, h * 0.5, w * 0.05, h * 0.04, '#B33A22');
    blob(g, w * 0.62, h * 0.64, w * 0.055, h * 0.22, '#D8B868');
    blob(g, w * 0.32, h * 0.6, w * 0.03, h * 0.1, '#E8D088');
  },
  'pearl-earring': (g, w, h) => {
    grad(g, w, h, [[0, '#14130F'], [1, '#0B0A08']]);
    blob(g, w * 0.55, h * 0.9, w * 0.4, h * 0.25, '#B08A4A');
    blob(g, w * 0.43, h * 0.45, w * 0.18, h * 0.2, '#E5C3A0');
    blob(g, w * 0.52, h * 0.24, w * 0.24, h * 0.12, '#3F6BB0', -0.2);
    blob(g, w * 0.8, h * 0.45, w * 0.08, h * 0.28, '#D7B866');
    blob(g, w * 0.62, h * 0.53, w * 0.03, h * 0.03, '#E7ECEE');
    blob(g, w * 0.38, h * 0.55, w * 0.04, h * 0.015, '#B5534A');
  },
  'great-wave': (g, w, h) => {
    grad(g, w, h, [[0, '#E8DCC0'], [1, '#CDBF9C']]);
    g.fillStyle = '#1D3F6E';
    g.beginPath(); g.moveTo(0, h); g.bezierCurveTo(w * 0.1, h * 0.2, w * 0.45, h * 0.05, w * 0.6, h * 0.35);
    g.bezierCurveTo(w * 0.45, h * 0.3, w * 0.4, h * 0.6, w * 0.6, h); g.fill();
    dabs(g, w * 0.6, h, ['#F4F1E6', '#2F5E94'], 160, w * 0.025, 3);
    blob(g, w * 0.65, h * 0.62, w * 0.06, h * 0.06, '#5B6F8A');
    blob(g, w * 0.65, h * 0.58, w * 0.02, h * 0.02, '#F4F1E6');
  },
  'water-lilies': (g, w, h) => {
    grad(g, w, h, [[0, '#5B7FA6'], [0.5, '#7E9FC4'], [1, '#3F6E8C']]);
    dabs(g, w, h, ['#9DB8D8', '#5E8AB1', '#B9C9E2', '#4A7D7A'], 300, w * 0.06, 4);
    dabs(g, w, h, ['#5E8C4A', '#7DA85E', '#3E6B3B'], 120, w * 0.035, 5);
    dabs(g, w, h, ['#E88A9A', '#F1B6B8'], 25, w * 0.012, 6);
  },
  'starry-night': (g, w, h) => {
    grad(g, w, h, [[0, '#1B3570'], [0.65, '#2E5A9E'], [1, '#14253F']]);
    dabs(g, w, h * 0.7, ['#4A7BC7', '#7FA8E0', '#1F3F7A', '#B9CFE8'], 300, w * 0.05, 7);
    [[0.1, 0.05], [0.24, 0.16], [0.34, 0.31], [0.6, 0.05], [0.7, 0.2], [0.13, 0.43], [0.9, 0.17]].forEach(([x, y]) => {
      blob(g, w * x, h * y, w * 0.045, w * 0.045, '#E9D86A');
      blob(g, w * x, h * y, w * 0.022, w * 0.022, '#FFF6C0');
    });
    blob(g, w * 0.9, h * 0.17, w * 0.06, w * 0.06, '#F2CF4A');
    g.fillStyle = '#16231A';
    g.beginPath(); g.moveTo(w * 0.15, h); g.bezierCurveTo(w * 0.12, h * 0.5, w * 0.2, h * 0.2, w * 0.2, h * 0.05); g.bezierCurveTo(w * 0.26, h * 0.4, w * 0.32, h * 0.7, w * 0.36, h); g.fill();
    g.fillStyle = '#1F2E4A'; g.fillRect(0, h * 0.82, w, h * 0.18);
  },
  'grande-jatte': (g, w, h) => {
    grad(g, w, h, [[0, '#9CB3B8'], [0.25, '#7FA86A'], [1, '#4E8A3C']]);
    dabs(g, w, h, ['#C9D88E', '#5E9A48', '#E8E2A0', '#3E6E3A'], 500, w * 0.012, 8);
    blob(g, w * 0.84, h * 0.6, w * 0.06, h * 0.28, '#3B3550');
    blob(g, w * 0.5, h * 0.42, w * 0.03, h * 0.14, '#E7A27A');
  },
  'garden-delights': (g, w, h) => {
    grad(g, w, h, [[0, '#7FA0B8'], [0.25, '#7EA05A'], [1, '#5B7A3C']]);
    dabs(g, w, h, ['#E8D8C8', '#C24A3A', '#3A6EA5', '#E8C46A', '#F1E2D2'], 500, w * 0.01, 9);
    g.fillStyle = 'rgba(20,10,5,0.75)'; g.fillRect(w * 0.75, 0, w * 0.25, h);
    g.fillStyle = 'rgba(100,140,80,0.35)'; g.fillRect(0, 0, w * 0.25, h);
  },
  arnolfini: (g, w, h) => {
    grad(g, w, h, [[0, '#4C3A24'], [1, '#2B2016']]);
    blob(g, w * 0.3, h * 0.6, w * 0.15, h * 0.35, '#2A1F26');
    blob(g, w * 0.7, h * 0.65, w * 0.2, h * 0.32, '#2F6B35');
    blob(g, w * 0.84, h * 0.4, w * 0.12, h * 0.3, '#8E2A20');
    blob(g, w * 0.505, h * 0.29, w * 0.045, w * 0.045, '#B6A27C');
    blob(g, w * 0.505, h * 0.29, w * 0.032, w * 0.032, '#5E5040');
  },
  'creation-of-adam': (g, w, h) => {
    grad(g, w, h, [[0, '#D8D2C2'], [1, '#B9B19C']]);
    blob(g, w * 0.18, h * 0.62, w * 0.18, h * 0.22, '#C8946A', 0.2);
    blob(g, w * 0.75, h * 0.38, w * 0.22, h * 0.32, '#9E3D32');
    blob(g, w * 0.7, h * 0.4, w * 0.15, h * 0.18, '#E3D6C8');
    g.strokeStyle = '#C8946A'; g.lineWidth = h * 0.035; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.22, h * 0.5); g.lineTo(w * 0.355, h * 0.42); g.stroke();
    g.beginPath(); g.moveTo(w * 0.55, h * 0.42); g.lineTo(w * 0.41, h * 0.42); g.stroke();
  },
};

export const PAINTINGS: Record<PaintingId, PaintingDef> = {
  'mona-lisa': {
    id: 'mona-lisa', title: 'Mona Lisa', short: 'Mona Lisa', artist: 'Leonardo da Vinci', year: 'c. 1503–1519',
    file: 'mona-lisa.jpg', width: 1073, height: 1600, holder: 'Musée du Louvre, Paris',
    source: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg',
    palette: ['#5E6B4C', '#C99A5E', '#2B2015', '#8C9A78'],
    poi: { face: { x: 0.435, y: 0.25 }, smile: { x: 0.445, y: 0.305 }, hands: { x: 0.42, y: 0.86 }, landscape: { x: 0.14, y: 0.38 } },
    fallback: FALLBACKS['mona-lisa'],
  },
  'night-watch': {
    id: 'night-watch', title: 'The Night Watch', short: 'Night Watch', artist: 'Rembrandt van Rijn', year: '1642',
    file: 'night-watch.jpg', width: 1600, height: 1341, holder: 'Rijksmuseum, Amsterdam',
    source: 'https://commons.wikimedia.org/wiki/File:The_Night_Watch_-_HD.jpg',
    palette: ['#2C1E0E', '#B33A22', '#D8B868', '#5C4220'],
    poi: { captain: { x: 0.47, y: 0.6 }, lieutenant: { x: 0.62, y: 0.65 }, girl: { x: 0.32, y: 0.62 } },
    fallback: FALLBACKS['night-watch'],
  },
  'pearl-earring': {
    id: 'pearl-earring', title: 'Girl with a Pearl Earring', short: 'Pearl Earring', artist: 'Johannes Vermeer', year: 'c. 1665',
    file: 'pearl-earring.jpg', width: 1351, height: 1600, holder: 'Mauritshuis, The Hague',
    source: 'https://commons.wikimedia.org/wiki/File:1665_Girl_with_a_Pearl_Earring.jpg',
    palette: ['#3F6BB0', '#E5C3A0', '#D7B866', '#14130F'],
    poi: { pearl: { x: 0.62, y: 0.535 }, face: { x: 0.42, y: 0.44 }, turban: { x: 0.53, y: 0.26 }, lips: { x: 0.385, y: 0.535 } },
    fallback: FALLBACKS['pearl-earring'],
  },
  'great-wave': {
    id: 'great-wave', title: 'The Great Wave off Kanagawa', short: 'Great Wave', artist: 'Katsushika Hokusai', year: 'c. 1831',
    file: 'great-wave.jpg', width: 1600, height: 1076, holder: 'Woodblock print (many impressions)',
    source: 'https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg',
    palette: ['#1D3F6E', '#F4F1E6', '#E8DCC0', '#2F5E94'],
    poi: { crest: { x: 0.42, y: 0.22 }, boat: { x: 0.72, y: 0.75 }, fuji: { x: 0.64, y: 0.66 } },
    fallback: FALLBACKS['great-wave'],
  },
  'water-lilies': {
    id: 'water-lilies', title: 'Water Lilies', short: 'Water Lilies', artist: 'Claude Monet', year: '1906',
    file: 'water-lilies.jpg', width: 1600, height: 1537, holder: 'Art Institute of Chicago',
    source: 'https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg',
    palette: ['#5B7FA6', '#7DA85E', '#E88A9A', '#B9C9E2'],
    poi: { lilies: { x: 0.45, y: 0.78 }, pads: { x: 0.75, y: 0.4 } },
    fallback: FALLBACKS['water-lilies'],
  },
  'starry-night': {
    id: 'starry-night', title: 'The Starry Night', short: 'Starry Night', artist: 'Vincent van Gogh', year: '1889',
    file: 'starry-night.jpg', width: 1600, height: 1266, holder: 'Museum of Modern Art, New York',
    source: 'https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
    palette: ['#1B3570', '#E9D86A', '#4A7BC7', '#16231A'],
    poi: { swirl: { x: 0.52, y: 0.36 }, moon: { x: 0.9, y: 0.17 }, village: { x: 0.7, y: 0.85 } },
    fallback: FALLBACKS['starry-night'],
  },
  'grande-jatte': {
    id: 'grande-jatte', title: 'A Sunday on La Grande Jatte', short: 'La Grande Jatte', artist: 'Georges Seurat', year: '1884–1886',
    file: 'grande-jatte.jpg', width: 1600, height: 1065, holder: 'Art Institute of Chicago',
    source: 'https://commons.wikimedia.org/wiki/File:A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg',
    palette: ['#5E9A48', '#E8E2A0', '#3B3550', '#E7A27A'],
    poi: { parasol: { x: 0.5, y: 0.2 }, lady: { x: 0.85, y: 0.55 }, monkey: { x: 0.68, y: 0.85 } },
    fallback: FALLBACKS['grande-jatte'],
  },
  'garden-delights': {
    id: 'garden-delights', title: 'The Garden of Earthly Delights', short: 'Garden of Delights', artist: 'Hieronymus Bosch', year: 'c. 1490–1510',
    file: 'garden-delights.jpg', width: 1600, height: 911, holder: 'Museo del Prado, Madrid',
    source: 'https://commons.wikimedia.org/wiki/File:The_Garden_of_earthly_delights.jpg',
    palette: ['#7EA05A', '#C24A3A', '#3A6EA5', '#E8D8C8'],
    poi: { fountain: { x: 0.5, y: 0.2 }, pond: { x: 0.5, y: 0.45 } },
    fallback: FALLBACKS['garden-delights'],
  },
  arnolfini: {
    id: 'arnolfini', title: 'The Arnolfini Portrait', short: 'Arnolfini', artist: 'Jan van Eyck', year: '1434',
    file: 'arnolfini.jpg', width: 1169, height: 1600, holder: 'National Gallery, London',
    source: 'https://commons.wikimedia.org/wiki/File:Van_Eyck_-_Arnolfini_Portrait.jpg',
    palette: ['#2F6B35', '#8E2A20', '#2A1F26', '#B6A27C'],
    poi: { mirror: { x: 0.505, y: 0.292 }, chandelier: { x: 0.5, y: 0.12 }, dog: { x: 0.45, y: 0.88 } },
    fallback: FALLBACKS.arnolfini,
  },
  'creation-of-adam': {
    id: 'creation-of-adam', title: 'The Creation of Adam', short: 'Creation of Adam', artist: 'Michelangelo', year: 'c. 1508–1512',
    file: 'creation-of-adam.jpg', width: 1600, height: 726, holder: 'Sistine Chapel, Vatican City',
    source: 'https://commons.wikimedia.org/wiki/File:Michelangelo_-_Creation_of_Adam_(cropped).jpg',
    palette: ['#C8946A', '#9E3D32', '#D8D2C2', '#E3D6C8'],
    poi: { adamFinger: { x: 0.355, y: 0.425 }, godFinger: { x: 0.405, y: 0.415 }, god: { x: 0.72, y: 0.35 } },
    fallback: FALLBACKS['creation-of-adam'],
  },
};

export const PAINTING_ORDER: PaintingId[] = [
  'mona-lisa', 'night-watch', 'pearl-earring', 'great-wave', 'water-lilies',
  'starry-night', 'grande-jatte', 'garden-delights', 'arnolfini', 'creation-of-adam',
];

export const thumbUrl = (id: PaintingId) => `${base}art/thumbs/${PAINTINGS[id].file}`;
export const fullUrl = (id: PaintingId) => `${base}art/${PAINTINGS[id].file}`;

export interface LoadedPainting {
  def: PaintingDef;
  /** clean image (or fallback canvas) at native size */
  image: HTMLCanvasElement | HTMLImageElement;
  w: number;
  h: number;
  fromFallback: boolean;
  aged(): HTMLCanvasElement;
  varnished(): HTMLCanvasElement;
}

const cache = new Map<PaintingId, Promise<LoadedPainting>>();

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function buildFallback(def: PaintingDef): HTMLCanvasElement {
  const w = def.width, h = def.height;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  def.fallback(g, w, h);
  return c;
}

function decorate(def: PaintingDef, image: HTMLCanvasElement | HTMLImageElement, fromFallback: boolean): LoadedPainting {
  const w = def.width, h = def.height;
  let agedC: HTMLCanvasElement | null = null;
  let varnC: HTMLCanvasElement | null = null;
  return {
    def, image, w, h, fromFallback,
    /** Yellowed, dimmed, speckled "neglected" version used for the before-state overview. */
    aged() {
      if (agedC) return agedC;
      agedC = makeCanvas(w, h);
      const g = agedC.getContext('2d')!;
      g.drawImage(image, 0, 0, w, h);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = '#B49A6A';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(60,40,20,0.28)';
      g.fillRect(0, 0, w, h);
      const r = new RNG(def.id.length * 977);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${40 + r.int(0, 30)},${28 + r.int(0, 20)},${14},${0.08 + r.next() * 0.25})`;
        g.beginPath();
        g.arc(r.next() * w, r.next() * h, 1 + r.next() * 4, 0, Math.PI * 2);
        g.fill();
      }
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(30,18,8,0.55)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
      return agedC;
    },
    /** Heavy amber varnish version (used by the Night Watch peel stages). */
    varnished() {
      if (varnC) return varnC;
      varnC = makeCanvas(w, h);
      const g = varnC.getContext('2d')!;
      g.drawImage(image, 0, 0, w, h);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = '#9C6A22';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#7A5A30';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      return varnC;
    },
  };
}

export function loadPainting(id: PaintingId): Promise<LoadedPainting> {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = PAINTINGS[id];
  const p = new Promise<LoadedPainting>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      resolve(decorate(def, buildFallback(def), true));
    };
    const timer = window.setTimeout(fail, 12000);
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(decorate(def, img, false));
    };
    img.onerror = () => { clearTimeout(timer); fail(); };
    img.src = fullUrl(id);
  });
  cache.set(id, p);
  return p;
}
