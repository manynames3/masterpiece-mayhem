import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
await p.goto('http://localhost:5199/'); await p.waitForTimeout(800);
await p.evaluate(() => window.__MM.cast());
await p.waitForTimeout(600);
const moods = ['Surprise','Panic','Surrender','Celebrate','Mischief'];
const cards = await p.$$('[data-critter]');
for (let i = 0; i < cards.length; i++) { const btns = await cards[i].$$('.chip'); await btns[(i % 4) + 1].click(); }
const heroes = await p.$$('[data-hero]');
const hs = [0,1,3,4];
for (let i = 0; i < heroes.length; i++) { const btns = await heroes[i].$$('.chip'); await btns[hs[i]].click(); }
await p.waitForTimeout(500);
await p.locator('[data-critter="smudge"]').scrollIntoViewIfNeeded();
await p.screenshot({ path: '/tmp/mm_shots/critters1.png', fullPage: false });
await p.locator('.cast-scale').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/mm_shots/critters2.png' });
await p.locator('[data-hero="pip"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/mm_shots/heroposes.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
