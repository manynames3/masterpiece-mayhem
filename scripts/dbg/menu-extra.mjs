// Menu interaction QA (dev server on :5199): manual wipe screenshot, frame timing, returning-player Continue route.

import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5199/'); await p.waitForTimeout(2500);
const box = await p.getByTestId('menu-grime').boundingBox();
await p.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.75); await p.mouse.down();
for (let i = 0; i < 40; i++) await p.mouse.move(box.x + box.width * (0.1 + (i % 10) * 0.035), box.y + box.height * (0.62 + Math.floor(i / 10) * 0.07), { steps: 3 });
await p.waitForTimeout(150);
await p.screenshot({ path: '/tmp/mm-shots/wipe.png' });
await p.mouse.up();
// frame timing over 3s
const ft = await p.evaluate(() => new Promise((res) => { const ts = []; let s = performance.now(); const f = (n) => { ts.push(n); if (n - s < 3000) requestAnimationFrame(f); else { const d = ts.slice(1).map((t, i) => t - ts[i]); d.sort((a, b) => a - b); res({ frames: d.length, median: d[d.length >> 1].toFixed(2), p95: d[Math.floor(d.length * 0.95)].toFixed(2) }); } }; requestAnimationFrame(f); }));
console.log('frame timing', JSON.stringify(ft));
// returning player
await p.evaluate(() => { window.__MM.app.save.completeStage(1, 3, 1200, 0, 'x'); window.__MM.app.save.completeStage(2, 2, 900, 0, 'y'); window.__MM.app.showTitle(); });
await p.waitForTimeout(1800);
console.log('play label:', await p.getByTestId('play').innerText());
await p.screenshot({ path: '/tmp/mm-shots/continue.png', clip: { x: 0, y: 250, width: 720, height: 420 } });
await p.getByTestId('play').click(); await p.waitForTimeout(900);
console.log('after continue ->', await p.evaluate(() => document.querySelector('.screen')?.className));
await b.close();
