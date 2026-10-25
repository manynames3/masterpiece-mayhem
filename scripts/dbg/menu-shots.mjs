// Main-menu visual QA: node scripts/dbg/menu-shots.mjs [outdir] [baseUrl]
// Captures desktop + phone menus, reports console errors and any hero/critter box overlapping a button or the logo.
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://localhost:5199/';
const sizes = [[1440, 900, 'desktop', 1], [1280, 800, 'desktop-1280', 1], [390, 844, 'mobile', 3], [375, 667, 'mobile-small', 2]];
const b = await chromium.launch();
const errs = [];
for (const [w, h, name, dpr] of sizes) {
  const touch = w < 700;
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errs.push(`${name}: ${m.text()}`));
  await p.goto(base);
  await p.waitForTimeout(3800);
  await p.screenshot({ path: `${out}/menu-${name}.png` });
  const report = await p.evaluate(() => {
    const crew = document.querySelector('canvas.menu-crew');
    const boxes = crew.__boxes();
    const ui = [...document.querySelectorAll('.mbtn, .menu-logo')].map((e) => e.getBoundingClientRect());
    const hit = boxes.filter((a) => ui.some((u) => a.left < u.right && a.right > u.left && a.top < u.bottom && a.bottom > u.top));
    return { overlaps: hit.length, overflow: document.documentElement.scrollWidth > innerWidth + 1, boxes: boxes.length };
  });
  console.log(name, JSON.stringify(report));
  await p.close();
}
console.log(errs.join('\n') || 'no console errors');
await b.close();
