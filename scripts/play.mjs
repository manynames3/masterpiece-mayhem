// Dev helper: open a stage, do some real pointer drags, then let the QA autoplay finish it.
// node scripts/play.mjs <stageId> [w] [h] [outPrefix]
import { chromium } from '@playwright/test';
const [id = '1', w = '1280', hgt = '800', prefix = '/tmp/mmshots/p'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +hgt }, hasTouch: +w < 700 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`error: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:5199/?qa&stage=${id}`);
await page.waitForFunction(() => window.__MM?.state()?.phase === 'play', null, { timeout: 15000 });
const box = await page.locator('[data-testid=stage-canvas]').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx - 150, cy - 100);
await page.mouse.down();
for (let i = 0; i < 40; i++) await page.mouse.move(cx - 150 + (i % 2 ? 300 : 0), cy - 100 + i * 5, { steps: 6 });
await page.mouse.up();
await page.mouse.click(cx, cy);
await page.waitForTimeout(300);
console.log('after drags:', JSON.stringify(await page.evaluate(() => window.__MM.state())));
await page.screenshot({ path: `${prefix}${id}-a.png` });
await page.evaluate(() => window.__MM.autoplay(true));
const t0 = Date.now();
let st;
while (Date.now() - t0 < 90000) {
  st = await page.evaluate(() => window.__MM.state());
  if (!st || st.phase === 'done' || st.phase === 'failed' || st.phase === 'celebrate') break;
  await page.waitForTimeout(500);
}
console.log('final:', JSON.stringify(st), 'secs', (Date.now() - t0) / 1000);
await page.waitForTimeout(4500);
await page.screenshot({ path: `${prefix}${id}-b.png` });
console.log(logs.join('\n') || 'no errors');
await browser.close();
