import { chromium } from '@playwright/test';
const b = await chromium.launch();
const errs = [];
for (const [w, h, name] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: w < 700 });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const bad = []; p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await p.goto('https://masterpiece-mayhem.pages.dev/'); await p.waitForTimeout(3000);
  await p.screenshot({ path: `/tmp/mm_shots/live-${name}.png` });
  const imgOk = await p.evaluate(async () => { const i = new Image(); i.src = 'art/thumbs/mona-lisa.jpg'; await i.decode(); return i.naturalWidth; });
  await p.getByTestId('open-cast').click(); await p.waitForTimeout(1200);
  const heroes = await p.locator('[data-hero]').count();
  console.log(name, 'thumb width', imgOk, 'heroes', heroes, 'bad responses', bad.length ? bad : 'none');
  await p.close();
}
console.log(errs.join('\n') || 'no console errors');
await b.close();
