// Dev helper: run the QA autoplay solver on many stages concurrently and report outcomes.
// node scripts/autoplay-all.mjs [ids e.g. 1-30 or 3,5,9] [concurrency] [timeoutSec]
import { chromium } from '@playwright/test';
const [spec = '1-30', conc = '5', tmo = '150', base = 'http://localhost:5199/'] = process.argv.slice(2);
const ids = spec.includes('-') ? (() => { const [a, b] = spec.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })() : spec.split(',').map(Number);
const browser = await chromium.launch();
const results = [];
async function run(id) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const t0 = Date.now();
  let st = null;
  try {
    await page.goto(`${base}?qa&stage=${id}`);
    await page.waitForFunction(() => window.__MM?.state()?.phase === 'play', null, { timeout: 20000 });
    await page.evaluate(() => window.__MM.autoplay(true));
    while (Date.now() - t0 < +tmo * 1000) {
      st = await page.evaluate(() => window.__MM.state());
      if (!st || ['done', 'failed', 'celebrate'].includes(st.phase)) break;
      await page.waitForTimeout(400);
    }
    if (st?.phase === 'celebrate') { await page.waitForTimeout(4200); st = await page.evaluate(() => window.__MM.state()); }
  } catch (e) { errs.push('runner: ' + e.message); }
  const r = { id, phase: st?.phase, secs: Math.round((Date.now() - t0) / 1000), progress: st?.metrics?.progress?.toFixed?.(2), mistakes: st?.metrics?.mistakes, results: await page.locator('[data-testid=results]').count(), errs: errs.slice(0, 3) };
  results.push(r);
  console.log(JSON.stringify(r));
  await ctx.close();
}
const queue = [...ids];
await Promise.all(Array.from({ length: +conc }, async () => { while (queue.length) await run(queue.shift()); }));
await browser.close();
const ok = results.filter((r) => r.results > 0).length;
console.log(`\n${ok}/${results.length} stages completed by autoplay`);
