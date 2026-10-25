// Captures README / review screenshots from the dev server: node scripts/dbg/readme-shots.mjs <outdir>
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? 'screenshots';
const base = 'http://localhost:5199/';
const b = await chromium.launch();
const errs = [];
async function page(w, h, touch = false) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  return p;
}
let p = await page(1440, 900);
await p.goto(base); await p.waitForTimeout(3600);
await p.screenshot({ path: `${out}/title-desktop.png` });
await p.evaluate(() => window.__MM.cast()); await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/crew-desktop.png` });
await p.locator('[data-critter="smudge"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/critters-desktop.png` });
await p.locator('[data-critter="gloop"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/boss-card.png` });
await p.goto(`${base}?qa&stage=1`);
await p.waitForFunction(() => window.__MM?.state()?.phase === 'play');
await p.locator('[data-testid=coach] .btn').click({ timeout: 1500 }).catch(() => {});
await p.evaluate(() => window.__MM.autoplay(true)); await p.waitForTimeout(6000);
await p.screenshot({ path: `${out}/stage1-play.png` });
await p.waitForFunction(() => window.__MM.state()?.phase === 'celebrate', null, { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/stage1-win.png` });
await p.goto(`${base}?qa&stage=24`);
await p.waitForFunction(() => window.__MM?.state()?.phase === 'play');
await p.locator('[data-testid=coach] .btn').click({ timeout: 1500 }).catch(() => {});
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/stage24-boss.png` });
await p.close();
for (const [w, h, name] of [[390, 844, 'mobile'], [375, 667, 'mobile-small']]) {
  p = await page(w, h, true);
  await p.goto(base); await p.waitForTimeout(3200);
  await p.screenshot({ path: `${out}/title-${name}.png` });
  await p.evaluate(() => window.__MM.cast()); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/crew-${name}.png` });
  await p.goto(`${base}?qa&stage=2`);
  await p.waitForFunction(() => window.__MM?.state()?.phase === 'play');
  await p.locator('[data-testid=coach] .btn').click({ timeout: 1500 }).catch(() => {});
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/stage2-${name}.png` });
  await p.close();
}
console.log(errs.join('\n') || 'no console errors');
await b.close();
