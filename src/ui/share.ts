/**
 * "Share my restoration": renders a short square clip in the browser (grimy painting → wipe reveal →
 * restored with stars and the game's address) and hands it to the device's own share sheet, or
 * downloads it. Nothing is uploaded by the game; sharing only happens when the player taps.
 */

const SITE = 'masterpiece-mayhem.pages.dev';
const SIZE = 720;

export interface ShareInput { before: HTMLCanvasElement; after: HTMLCanvasElement; painting: string; artist: string; stars: number }

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return null;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = on ? '#E8C46A' : 'rgba(246,239,227,0.2)';
  g.fill();
  if (on) { g.strokeStyle = '#8A6524'; g.lineWidth = 2; g.stroke(); }
}

/** Draw one frame. t in seconds: 0–0.8 grimy, 0.8–2.8 wipe, then restored + stars. */
function frame(g: CanvasRenderingContext2D, s: ShareInput, t: number) {
  const W = SIZE, H = SIZE;
  const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, W * 0.75);
  bg.addColorStop(0, '#3B1A13'); bg.addColorStop(1, '#160B07');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // picture area with a gilt frame
  const ar = s.after.width / s.after.height;
  const boxW = W * 0.74, boxH = H * 0.55;
  let pw = boxW, ph = pw / ar;
  if (ph > boxH) { ph = boxH; pw = ph * ar; }
  const px = (W - pw) / 2, py = H * 0.135 + (boxH - ph) / 2;
  const m = 16;
  const fg = g.createLinearGradient(px - m, py - m, px + pw + m, py + ph + m);
  fg.addColorStop(0, '#F1D07A'); fg.addColorStop(0.35, '#9A7330'); fg.addColorStop(0.6, '#E2BD62'); fg.addColorStop(1, '#6E5022');
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(px - m + 6, py - m + 10, pw + m * 2, ph + m * 2);
  g.fillStyle = fg; g.fillRect(px - m, py - m, pw + m * 2, ph + m * 2);
  g.fillStyle = '#1A0E08'; g.fillRect(px - 3, py - 3, pw + 6, ph + 6);
  g.drawImage(s.after, px, py, pw, ph);
  const k = Math.min(1, Math.max(0, (t - 0.8) / 2));
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  if (e < 1) {
    g.save();
    g.beginPath(); g.rect(px + pw * e, py, pw * (1 - e), ph); g.clip();
    g.drawImage(s.before, px, py, pw, ph);
    g.restore();
    if (e > 0) {
      const x = px + pw * e;
      g.fillStyle = '#FFF6DA'; g.fillRect(x - 2, py, 4, ph);
      g.fillStyle = 'rgba(255,240,190,0.35)'; g.fillRect(x - 14, py, 28, ph);
    }
  }
  // text
  g.textAlign = 'center';
  g.fillStyle = '#E8C46A';
  g.font = '800 24px "Nunito Variable", system-ui, sans-serif';
  g.fillText(t < 2.8 ? 'BEFORE → AFTER' : 'MASTERPIECE RESTORED', W / 2, H * 0.085);
  g.fillStyle = '#F6EFE3';
  g.font = '600 40px "Fraunces Variable", Georgia, serif';
  const title = `I restored ${s.painting}!`;
  let fs = 40;
  while (g.measureText(title).width > W * 0.92 && fs > 22) { fs -= 2; g.font = `600 ${fs}px "Fraunces Variable", Georgia, serif`; }
  g.fillText(title, W / 2, H * 0.862);
  g.font = 'italic 400 22px "Fraunces Variable", Georgia, serif';
  g.fillStyle = 'rgba(246,239,227,0.75)';
  g.fillText(s.artist, W / 2, H * 0.908);
  if (t > 2.8) {
    for (let i = 0; i < 3; i++) {
      const pop = Math.min(1, Math.max(0, (t - 2.9 - i * 0.2) / 0.25));
      if (pop > 0) star(g, W / 2 + (i - 1) * 56, H * 0.775, 22 * (0.6 + pop * 0.4), i < s.stars);
    }
  }
  g.fillStyle = 'rgba(232,196,106,0.85)';
  g.font = '800 20px "Nunito Variable", system-ui, sans-serif';
  g.fillText(`Play free: ${SITE}`, W / 2, H * 0.965);
}

async function makeClip(s: ShareInput, mime: string): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const g = c.getContext('2d')!;
  frame(g, s, 0);
  const stream = (c as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(200);
  const total = 4.4;
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      frame(g, s, Math.min(t, total));
      if (t < total) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await done;
  return new Blob(chunks, { type: mime.split(';')[0] });
}

function makeImage(s: ShareInput): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  frame(c.getContext('2d')!, s, 5);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/png'));
}

/** Build the clip (or a still image where recording isn't supported) and share or download it. */
export async function shareRestoration(s: ShareInput): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const mime = pickMime();
  let blob: Blob;
  try { blob = mime ? await makeClip(s, mime) : await makeImage(s); } catch { blob = await makeImage(s); }
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : 'png';
  const name = `restored-${s.painting.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?(d: ShareData): boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Masterpiece Mayhem', text: `I restored ${s.painting}! Play free at ${SITE}` });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

/** QA: render a still of the final frame. */
export const shareStill = makeImage;
