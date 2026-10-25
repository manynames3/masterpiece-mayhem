import { drawCritter, drawHero, drawLadder, drawScaffold, heroHeight, type HeroId, type WorkerState } from '../../art/characters';
import { drawBubble, drawSparkle } from '../../art/draw';
import { drawSponge } from '../../art/props';
import { PAINTINGS, fullUrl, thumbUrl, type PaintingId } from '../../art/paintings';
import { GRIME, canvas, grimeTexture } from '../../art/textures';
import { RNG, TAU, clamp, smoothstep } from '../../core/math';

/**
 * The Design #4 gallery scene: a gilded Vermeer under amber varnish, with the real Tiny Restorers
 * (the same `drawHero` / `drawCritter` renderers used in every stage) working on and around the frame.
 *
 * Layers, back to front:
 *   DOM   gilt frame (CSS mouldings + SVG ornaments) holding the painting <img>
 *   2D    grime canvas inside the frame — amber varnish + soot; the player and Pip wipe it away
 *   DOM   varnish sheen / inner frame shadow
 *   2D    crew canvas over the whole scene — heroes, critters, scaffold, ladder, light pass, particles
 */

export interface MenuSceneEls {
  scene: HTMLElement;
  frame: HTMLElement;
  img: HTMLImageElement;
  grime: HTMLCanvasElement;
  crew: HTMLCanvasElement;
  plaque?: HTMLElement;
  hint?: HTMLElement;
}

export interface MenuScene {
  destroy(): void;
  /** client-space boxes of every character drawn last frame (used by layout QA) */
  boxes(): DOMRect[];
}

const PAINTING: PaintingId = 'pearl-earring';
/** where the eye should land when the painting is cropped */
const FOCUS = { x: 0.47, y: 0.46 };

interface Layout {
  W: number; H: number;        // scene size, CSS px
  ox: number; oy: number;      // outer frame top-left
  ow: number; oh: number;      // outer frame size
  m: number;                   // moulding thickness
  ix: number; iy: number;      // inner (painting) top-left
  iw: number; ih: number;
  crop: { x: number; y: number; w: number; h: number }; // visible part of the painting, normalised
  s: number;                   // hero unit size
  compact: boolean;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; kind: 'bubble' | 'spark' | 'mote' }

export function mountMenuScene(els: MenuSceneEls, reduced: boolean): MenuScene {
  const { scene, frame, img, grime, crew } = els;
  const def = PAINTINGS[PAINTING];
  const pa = def.width / def.height;
  const g = crew.getContext('2d')!;
  const gg = grime.getContext('2d')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  // progressive image: small thumb first, full-res once decoded
  img.src = thumbUrl(PAINTING);
  const full = new Image();
  full.decoding = 'async';
  full.src = fullUrl(PAINTING);
  full.onload = () => { if (img.isConnected) img.src = full.src; };

  let L: Layout | null = null;
  let regrowSrc: HTMLCanvasElement | null = null;  // full grime minus the protected "already cleaned" patch; creeps back in
  const gk = Math.min(1.25, dpr);                  // grime canvas resolution per CSS px (it's soft, no need for 2x)

  // ------------------------------------------------------------------ layout
  const layout = () => {
    const r = scene.getBoundingClientRect();
    const W = r.width, H = r.height;
    if (W < 40 || H < 40) return;
    const compact = W < 620;
    const plaqueRoom = els.plaque && !compact && H > 420 ? 46 : 0;
    // fit the inner painting window: headroom for Zuzu on the top moulding, side room for peeking critters
    const head = 0.24, side = compact ? 0.1 : 0.09, mk = 0.075;
    const aspect = clamp((W / Math.max(1, H - plaqueRoom)) * 0.9, 0.8, compact ? 1.25 : 1.12);
    const foot = 0.05; // room under the frame for the corner ornaments + cast shadow
    let ih = (H - plaqueRoom - 6) / (1 + 2 * mk + head + foot);
    ih = Math.min(ih, W / (aspect + 2 * mk + 2 * side));
    const iw = ih * aspect;
    const m = Math.max(12, ih * mk);
    const ow = iw + 2 * m, oh = ih + 2 * m;
    const ox = compact ? (W - ow) / 2 : Math.min((W - ow) / 2 + W * 0.02, W - ow - ih * side);
    const oy = ih * head + Math.max(0, H - plaqueRoom - oh - ih * (head + foot)) * 0.5;
    // crop: keep the face in view
    let cw = 1, ch = 1;
    if (aspect > pa) ch = pa / aspect; else cw = aspect / pa;
    const crop = { x: clamp(FOCUS.x - cw / 2, 0, 1 - cw), y: clamp(FOCUS.y - ch / 2, 0, 1 - ch), w: cw, h: ch };
    L = { W, H, ox, oy, ow, oh, m, ix: ox + m, iy: oy + m, iw, ih, crop, s: ih * 0.1, compact };
    frame.style.cssText = `left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;--m:${m}px`;
    img.style.objectPosition = `${cw < 1 ? (crop.x / (1 - cw)) * 100 : 50}% ${ch < 1 ? (crop.y / (1 - ch)) * 100 : 50}%`;
    if (els.plaque) {
      els.plaque.hidden = !plaqueRoom;
      els.plaque.style.cssText = `left:${ox + ow / 2}px;top:${oy + oh + 12}px`;
    }
    if (els.hint) els.hint.style.cssText = `left:${ox + ow / 2}px;top:${oy + m + ih * 0.035}px`;
    crew.width = Math.round(W * dpr); crew.height = Math.round(H * dpr);
    buildGrime(Math.round(iw * gk), Math.round(ih * gk));
  };

  // ------------------------------------------------------------------ grime: amber varnish, soot, craquelure
  const toInner = (px: number, py: number) => {
    const l = L!;
    return { x: ((px - l.crop.x) / l.crop.w) * l.iw, y: ((py - l.crop.y) / l.crop.h) * l.ih };
  };

  function buildGrime(w: number, h: number) {
    if (w < 8 || h < 8) return;
    grime.width = w; grime.height = h;
    const src = canvas(w, h);
    const s = src.getContext('2d')!;
    // aged varnish: amber, deeper toward the edges
    const vg = s.createRadialGradient(w * 0.45, h * 0.42, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(128,84,26,0.90)');
    vg.addColorStop(0.6, 'rgba(96,60,18,0.94)');
    vg.addColorStop(1, 'rgba(40,22,8,0.98)');
    s.fillStyle = vg; s.fillRect(0, 0, w, h);
    s.globalAlpha = 0.7;
    s.drawImage(grimeTexture(w, h, { ...GRIME.soot, seed: 11 }), 0, 0);
    s.globalAlpha = 1;
    // soot blooms and drips — the encrusted bits
    const rb = new RNG(17);
    for (let i = 0; i < 26; i++) {
      const x = rb.next() * w, y = rb.next() * h, r = Math.min(w, h) * rb.range(0.04, 0.14);
      const sg = s.createRadialGradient(x, y, 0, x, y, r);
      sg.addColorStop(0, `rgba(28,16,6,${rb.range(0.25, 0.5)})`); sg.addColorStop(1, 'rgba(28,16,6,0)');
      s.fillStyle = sg; s.beginPath(); s.arc(x, y, r, 0, TAU); s.fill();
    }
    s.strokeStyle = 'rgba(40,24,8,0.35)'; s.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const x = rb.next() * w, y = rb.next() * h * 0.6;
      s.lineWidth = w * rb.range(0.004, 0.01);
      s.beginPath(); s.moveTo(x, y); s.lineTo(x + rb.range(-2, 2), y + h * rb.range(0.08, 0.3)); s.stroke();
    }
    // a warm highlight where the gallery light catches the varnish
    const hl = s.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, w * 0.6);
    hl.addColorStop(0, 'rgba(255,200,110,0.18)'); hl.addColorStop(1, 'rgba(255,200,110,0)');
    s.fillStyle = hl; s.fillRect(0, 0, w, h);
    // craquelure: a web of hairline cracks in the old varnish
    const rng = new RNG(29);
    s.strokeStyle = 'rgba(30,16,6,0.35)'; s.lineWidth = Math.max(0.6, w / 900);
    for (let i = 0; i < 70; i++) {
      let x = rng.next() * w, y = rng.next() * h, a = rng.next() * TAU;
      s.beginPath(); s.moveTo(x, y);
      for (let k = 0; k < 5; k++) { a += rng.range(-0.9, 0.9); x += Math.cos(a) * w * 0.03; y += Math.sin(a) * w * 0.03; s.lineTo(x, y); }
      s.stroke();
    }
    // the patch the crew already cleaned before we arrived — a ragged sponge swirl over the face
    const hole = canvas(w, h);
    const hg = hole.getContext('2d')!;
    const face = toInner(0.43, 0.43);
    const k = w / L!.iw;
    const R = Math.min(L!.iw, L!.ih) * 0.21 * k;
    const r2 = new RNG(5);
    for (let i = 0; i < 90; i++) {
      const a = r2.next() * TAU, d = Math.sqrt(r2.next()) * R;
      const x = face.x * k + Math.cos(a) * d * 1.05, y = face.y * k + Math.sin(a) * d * 1.2;
      const rr = R * r2.range(0.18, 0.36);
      const gr = hg.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.65, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      hg.fillStyle = gr; hg.beginPath(); hg.arc(x, y, rr, 0, TAU); hg.fill();
    }
    // sponge streaks trailing out of the patch
    hg.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      hg.strokeStyle = `rgba(0,0,0,${0.18 + i * 0.05})`; hg.lineWidth = R * 0.16;
      hg.beginPath();
      const y0 = face.y * k + R * (0.7 + i * 0.12);
      hg.moveTo(face.x * k - R * 0.9, y0); hg.quadraticCurveTo(face.x * k, y0 + R * 0.25, face.x * k + R * (0.7 + i * 0.1), y0 - R * 0.1);
      hg.stroke();
    }
    const rg = canvas(w, h);
    const rgc = rg.getContext('2d')!;
    rgc.drawImage(src, 0, 0);
    rgc.globalCompositeOperation = 'destination-out';
    rgc.drawImage(hole, 0, 0);
    regrowSrc = rg;
    gg.globalCompositeOperation = 'source-over';
    gg.clearRect(0, 0, w, h);
    gg.drawImage(rg, 0, 0);
  }

  /** Soft sponge stamp, in inner-painting CSS px. */
  const wipe = (x: number, y: number, r: number, strength: number) => {
    if (!L) return;
    const k = grime.width / L.iw;
    x *= k; y *= k; r *= k;
    const gr = gg.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${strength})`); gr.addColorStop(0.7, `rgba(0,0,0,${strength * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    gg.globalCompositeOperation = 'destination-out';
    gg.fillStyle = gr; gg.beginPath(); gg.arc(x, y, r, 0, TAU); gg.fill();
    gg.globalCompositeOperation = 'source-over';
  };
  const grimeAt = (x: number, y: number) => {
    if (!L) return 1;
    const k = grime.width / L.iw;
    const d = gg.getImageData(clamp(Math.round(x * k), 0, grime.width - 1), clamp(Math.round(y * k), 0, grime.height - 1), 1, 1).data;
    return d[3] / 255;
  };

  // ------------------------------------------------------------------ player wipe (only on the painting)
  const pointer = { x: -1, y: -1, active: 0, down: false, lastWipe: -10, px: 0, py: 0 };
  const parts: Particle[] = [];
  const innerPoint = (e: PointerEvent) => {
    const r = grime.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * L!.iw, y: ((e.clientY - r.top) / r.height) * L!.ih };
  };
  const stroke = (e: PointerEvent) => {
    if (!L) return;
    const p = innerPoint(e);
    const r = Math.max(14, L.iw * 0.06);
    const d = Math.hypot(p.x - pointer.px, p.y - pointer.py);
    const n = Math.min(24, Math.ceil(d / (r * 0.3)));
    for (let i = 1; i <= n; i++) wipe(pointer.px + ((p.x - pointer.px) * i) / n, pointer.py + ((p.y - pointer.py) * i) / n, r, 0.5);
    pointer.px = p.x; pointer.py = p.y;
    pointer.lastWipe = time;
    if (parts.length < 120 && Math.random() < 0.6) spawn(L.ix + p.x, L.iy + p.y, Math.random() < 0.5 ? 'bubble' : 'spark', L.s);
  };
  const onDown = (e: PointerEvent) => {
    if (!L) return;
    pointer.down = true;
    grime.setPointerCapture?.(e.pointerId);
    const p = innerPoint(e);
    pointer.px = p.x; pointer.py = p.y;
    stroke(e);
  };
  const onMove = (e: PointerEvent) => { if (pointer.down) stroke(e); };
  const onUp = () => { pointer.down = false; };
  grime.addEventListener('pointerdown', onDown);
  grime.addEventListener('pointermove', onMove);
  grime.addEventListener('pointerup', onUp);
  grime.addEventListener('pointercancel', onUp);
  const onLook = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = time; };
  window.addEventListener('pointermove', onLook, { passive: true });
  window.addEventListener('pointerdown', onLook, { passive: true });

  const ro = new ResizeObserver(() => layout());
  ro.observe(scene);
  layout();

  function spawn(x: number, y: number, kind: Particle['kind'], s: number) {
    const a = Math.random() * TAU;
    const sp = kind === 'mote' ? 4 : s * (0.4 + Math.random() * 0.8);
    parts.push({
      x, y, kind,
      vx: Math.cos(a) * sp * (kind === 'bubble' ? 0.4 : 1), vy: kind === 'bubble' ? -s * (0.5 + Math.random() * 0.6) : Math.sin(a) * sp,
      life: 0, max: kind === 'mote' ? 6 + Math.random() * 6 : 0.7 + Math.random() * 0.8,
      r: kind === 'bubble' ? s * (0.05 + Math.random() * 0.07) : kind === 'spark' ? s * (0.08 + Math.random() * 0.08) : 0.6 + Math.random() * 1.4,
    });
  }

  // ------------------------------------------------------------------ the loop
  let time = 0, last = performance.now(), raf = 0, frameNo = 0, pearlClean = 0;
  let boxes: DOMRect[] = [];
  const tick = (now: number) => {
    if (!crew.isConnected) { destroy(); return; }
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += reduced ? dt * 0.4 : dt;
    frameNo++;
    if (!L) return;
    draw(dt);
  };

  function look(cx: number, cy: number, fallback: { x: number; y: number }) {
    if (time - pointer.active > 3 || pointer.x < 0) return fallback;
    const r = crew.getBoundingClientRect();
    return { x: clamp((pointer.x - r.left - cx) / 220, -1, 1), y: clamp((pointer.y - r.top - cy) / 220, -1, 1) };
  }

  function draw(dt: number) {
    const l = L!;
    const { s } = l;
    const t = time;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, l.W, l.H);
    const nb: DOMRect[] = [];
    const cr = crew.getBoundingClientRect();
    const box = (id: HeroId | null, x: number, y: number, w: number, hh: number) => nb.push(new DOMRect(cr.left + x - w / 2, cr.top + y - hh, w, hh));

    const ledge = l.iy + l.ih + l.m * 0.42;   // feet on the bottom moulding
    const top = l.oy + l.m * 0.12;            // feet on the top moulding
    const innerX = (u: number) => l.ix + u * l.iw;
    const userWiping = t - pointer.lastWipe < 1.2;

    // ---- regrowth: soot creeps back while nobody is scrubbing
    if (regrowSrc && t - pointer.lastWipe > 4 && frameNo % 2 === 0) {
      gg.globalAlpha = Math.min(0.02, dt * 0.05);
      gg.drawImage(regrowSrc, 0, 0);
      gg.globalAlpha = 1;
    }

    // ---- light: warm key from the upper-left window, falling across the frame
    if (!l.compact) {
      const kx = l.ix + l.iw * 0.25, ky = l.oy - l.ih * 0.1;
      const kl = g.createRadialGradient(kx, ky, 0, kx, ky, l.ih * 1.2);
      kl.addColorStop(0, 'rgba(255,214,150,0.10)'); kl.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = kl; g.fillRect(0, 0, l.W, l.H);
    }

    // ---- Zuzu with the lantern, tailing Smudge along the top of the frame
    const span = l.iw * 0.72;
    const wander = (tt: number) => 0.5 + 0.5 * Math.sin(tt * 0.33) * (0.75 + 0.25 * Math.sin(tt * 0.11));
    const cu = wander(t), zu = wander(t - 1.5);
    const cx = l.ix + l.iw * 0.14 + cu * span;
    const zx = l.ix + l.iw * 0.14 + zu * span;
    const cv = Math.cos(t * 0.33), zv = Math.cos((t - 1.5) * 0.33);
    const near = Math.abs(cx - zx) < s * 1.9;
    const cr0 = s * 0.42;
    // Smudge ducks behind the top moulding when it turns around
    const duck = smoothstep(0.82, 1, 1 - Math.abs(cv)) * cr0 * 1.6;
    g.save();
    g.beginPath(); g.rect(0, 0, l.W, top + 0.5); g.clip();
    drawCritter(g, cx, top - cr0 * 0.9 + duck, cr0, 'soot', { t, seed: 3, mood: near ? 'panic' : duck > cr0 ? 'giggle' : 'sneak', hat: 'none', lookX: zx < cx ? -1 : 1, lookY: 0.2 });
    g.restore();
    box(null, cx, top, cr0 * 2, cr0 * 1.9 - duck);
    const zs = s * 0.92;
    const zLook = look(zx, top - zs, { x: cx > zx ? 1 : -1, y: 0.1 });
    const zState: WorkerState = Math.abs(zv) > 0.25 ? 'walk' : near ? 'scared' : 'idle';
    // lantern glow spilling onto the frame and wall
    const glow = g.createRadialGradient(zx, top - zs * 0.8, 0, zx, top - zs * 0.8, zs * 3.2);
    glow.addColorStop(0, 'rgba(255,214,120,0.30)'); glow.addColorStop(0.5, 'rgba(255,190,90,0.10)'); glow.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(zx, top - zs * 0.8, zs * 3.2, 0, TAU); g.fill();
    drawHero(g, zx, top, zs, { t, hero: 'zuzu', seed: 3, state: zState, tool: 'lantern', facing: zv >= 0 ? 1 : -1, lookX: zLook.x, lookY: zLook.y });
    box('zuzu', zx, top, zs * 1.5, zs * heroHeight('zuzu'));

    // ---- Puffington and a second Smudge peeking from behind the side mouldings
    const peekR = (Math.sin(t * 0.7) * 0.5 + 0.5) * (0.6 + 0.4 * Math.sin(t * 0.23));
    const pr = s * 0.5;
    g.save(); g.beginPath(); g.rect(l.ox + l.ow - 0.5, 0, l.W, l.H); g.clip();
    const pX = l.ox + l.ow - pr * 0.4 + peekR * pr * 1.4, pY = l.iy + l.ih * 0.36;
    drawCritter(g, pX, pY, pr, 'dust', { t: t + 1, seed: 5, mood: userWiping ? 'surprised' : 'giggle', hat: 'none', lookX: -1, lookY: 0.4 });
    g.restore();
    box(null, Math.max(l.ox + l.ow, pX), pY + pr, pr * 1.6, pr * 2);
    const scared = userWiping && pointer.px < l.iw * 0.35;
    const peekL = scared ? 0 : smoothstep(0.2, 0.8, Math.sin(t * 0.41 + 2) * 0.5 + 0.5);
    const sr = s * 0.44;
    g.save(); g.beginPath(); g.rect(0, 0, l.ox + 0.5, l.H); g.clip();
    const sX = l.ox + sr * 0.5 - peekL * sr * 1.6, sY = l.iy + l.ih * 0.5;
    drawCritter(g, sX, sY, sr, 'ink', { t: t + 2, seed: 7, mood: scared ? 'panic' : 'sneak', hat: 'none', lookX: 1, lookY: -0.2 });
    g.restore();
    box(null, Math.min(l.ox, sX), sY + sr, sr * 1.6, sr * 2);

    // ---- scaffold + ladder on the bottom moulding
    const scH = l.ih * 0.36;
    const scX0 = innerX(0.56), scW = l.iw * 0.27;
    const plank = ledge - scH;
    drawScaffold(g, scX0, ledge, scW, scH, s * 0.55);
    const ladX = innerX(0.94);
    const ladLean = -Math.atan2(ladX - (scX0 + scW), scH);
    drawLadder(g, ladX, ledge, Math.hypot(ladX - (scX0 + scW), scH) * 1.02, s * 0.62, ladLean);

    // ---- Pip scrubbing a stripe toward the pearl, pacing the plank
    const pipU = 0.5 + 0.5 * Math.sin(t * 0.42);
    const pipX = scX0 + scW * (0.2 + pipU * 0.7);
    const pipV = Math.cos(t * 0.42);
    const pipLook = look(pipX, plank - s, { x: -1, y: -0.25 });
    const hand = drawHero(g, pipX, plank, s, { t, hero: 'pip', seed: 0, state: 'work', tool: 'sponge', facing: -1, lookX: pipLook.x, lookY: pipLook.y });
    box('pip', pipX, plank, s * 1.4, s * heroHeight('pip'));
    // the sponge really cleans: wipe where the hand landed
    const hx = hand.x - l.ix, hy = hand.y - l.iy;
    if (hx > 0 && hx < l.iw && hy > 0 && hy < l.ih) {
      wipe(hx - s * 0.12, hy - s * 0.05, s * 0.5, Math.min(0.5, dt * (reduced ? 2 : 5)));
      if (!reduced && frameNo % 5 === 0) spawn(hand.x, hand.y - s * 0.1, 'bubble', s);
    }

    // ---- Professor Bristlebrow examining the frame's corner through the loupe
    const bx = innerX(0.11);
    const bs = s * 0.88;
    const eureka = !reduced && (t % 11) > 8.6;
    const bLook = look(bx, ledge - bs * 2, { x: -1, y: -0.35 });
    drawHero(g, bx, ledge, bs, { t, hero: 'bristle', seed: 1, state: eureka ? 'signature' : 'idle', tool: eureka ? 'none' : 'brush', facing: -1, lookX: bLook.x, lookY: bLook.y });
    box('bristle', bx, ledge, bs * 1.2, bs * heroHeight('bristle'));

    // ---- Big Mo steadying the ladder (and flexing whenever Pip finishes a pass)
    const mx = ladX - s * 0.15;
    const ms = s * 1.02;
    const flex = !reduced && Math.abs(pipV) > 0.985 && (t % 30) > 15;
    const mLook = look(mx, ledge - ms, { x: -0.6, y: -0.9 });
    drawHero(g, mx, ledge, ms, { t, hero: 'mo', seed: 2, state: flex ? 'signature' : 'lift', tool: 'none', facing: -1, lookX: mLook.x, lookY: mLook.y });
    box('mo', mx, ledge, ms * 1.7, ms * heroHeight('mo'));

    // ---- light pass on everything drawn so far: warm key from upper-left, umber falloff low-right
    g.globalCompositeOperation = 'source-atop';
    const kg = g.createLinearGradient(l.ox, l.oy - l.ih * 0.3, l.ox + l.ow, l.oy + l.oh);
    kg.addColorStop(0, 'rgba(255,226,170,0.16)'); kg.addColorStop(0.55, 'rgba(255,226,170,0)'); kg.addColorStop(1, 'rgba(40,16,4,0.30)');
    g.fillStyle = kg; g.fillRect(0, 0, l.W, l.H);
    const lg = g.createRadialGradient(zx, top - zs * 0.8, 0, zx, top - zs * 0.8, zs * 2.6);
    lg.addColorStop(0, 'rgba(255,220,140,0.22)'); lg.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = lg; g.fillRect(0, 0, l.W, l.H);
    g.globalCompositeOperation = 'source-over';

    // ---- the pearl catches the light once it's clean
    if (frameNo % 20 === 0) {
      const pp = toInner(def.poi.pearl.x, def.poi.pearl.y);
      pearlClean = 1 - grimeAt(pp.x, pp.y);
    }
    if (pearlClean > 0.55) {
      const pp = toInner(def.poi.pearl.x, def.poi.pearl.y);
      const tw = 0.5 + 0.5 * Math.sin(t * 3.1);
      g.globalAlpha = (pearlClean - 0.55) * 2.2 * (0.4 + tw * 0.6);
      drawSparkle(g, l.ix + pp.x, l.iy + pp.y - s * 0.05, s * (0.16 + tw * 0.1));
      g.globalAlpha = 1;
    }

    // ---- particles: soap bubbles, sparkles, dust motes in the light
    if (!reduced && !l.compact && parts.filter((p) => p.kind === 'mote').length < 26 && frameNo % 6 === 0) {
      spawn(l.ox + Math.random() * l.ow * 0.8, l.oy + Math.random() * l.oh, 'mote', s);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life > p.max) { parts.splice(i, 1); continue; }
      const k = p.life / p.max;
      if (p.kind === 'mote') { p.x += Math.sin(t * 0.7 + i) * dt * 3; p.y += dt * 2.5; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; }
      g.globalAlpha = p.kind === 'mote' ? Math.sin(k * Math.PI) * 0.5 : 1 - k;
      if (p.kind === 'bubble') drawBubble(g, p.x, p.y, p.r * (0.7 + k * 0.6));
      else if (p.kind === 'spark') drawSparkle(g, p.x, p.y, p.r * (1 - k * 0.5));
      else { g.fillStyle = '#FFE6B0'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); }
    }
    g.globalAlpha = 1;

    // ---- sponge cursor while hovering/dragging the painting with a mouse
    if (hoverPainting && (time - pointer.active < 2)) {
      const r = crew.getBoundingClientRect();
      drawSponge(g, pointer.x - r.left, pointer.y - r.top, Math.max(22, s * 0.7), pointer.down ? 0.6 : 0, -0.3 + Math.sin(t * 9) * (pointer.down ? 0.12 : 0));
    }
    boxes = nb;
  }

  let hoverPainting = false;
  const onEnter = (e: PointerEvent) => { hoverPainting = e.pointerType === 'mouse'; };
  const onLeave = () => { hoverPainting = false; };
  grime.addEventListener('pointerenter', onEnter);
  grime.addEventListener('pointerleave', onLeave);

  raf = requestAnimationFrame(tick);

  function destroy() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('pointermove', onLook);
    window.removeEventListener('pointerdown', onLook);
  }
  return { destroy, boxes: () => boxes };
}
