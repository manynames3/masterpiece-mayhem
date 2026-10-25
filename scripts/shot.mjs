// Dev helper: screenshot a URL at a viewport, optionally running steps. Usage:
// node scripts/shot.mjs <url> <out.png> [w] [h] [waitMs] [jsToEval]
import { chromium } from '@playwright/test';
const [url, out, w = '1280', hgt = '800', wait = '1500', js] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +hgt }, deviceScaleFactor: 1, hasTouch: +w < 700 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForTimeout(+wait);
if (js) { const r = await page.evaluate(js); if (r !== undefined) console.log('eval:', JSON.stringify(r)); await page.waitForTimeout(+wait); }
await page.screenshot({ path: out });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
