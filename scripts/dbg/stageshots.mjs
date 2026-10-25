// node scripts/dbg/stageshots.mjs <ids> <outdir> [w] [h]
import { chromium } from '@playwright/test';
const [ids = '1,2,5,8,14,22,24', out = '/tmp/mm_shots', w = '1280', hh = '800'] = process.argv.slice(2);
const b = await chromium.launch();
for (const id of ids.split(',')) {
  const p = await b.newPage({ viewport: { width: +w, height: +hh }, hasTouch: +w < 700 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:5199/?qa&stage=${id}`);
  await p.waitForFunction(() => window.__MM?.state()?.phase === 'play', null, { timeout: 20000 }).catch(() => {});
  await p.locator('[data-testid=coach] .btn').click({ timeout: 1500 }).catch(() => {});
  await p.evaluate(() => window.__MM.autoplay(true));
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/stage${id}_${w}.png` });
  console.log(id, errs.join(' | ') || 'ok');
  await p.close();
}
await b.close();
