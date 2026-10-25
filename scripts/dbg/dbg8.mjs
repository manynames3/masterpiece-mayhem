import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 800 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:5199/?qa&stage=8');
await p.waitForFunction(() => window.__MM?.state()?.phase === 'play');
await p.evaluate(() => window.__MM.autoplay(true));
for (let i = 0; i < 8; i++) {
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => { const m = window.__MM.runtime().mech; return JSON.stringify({ autoIdx: m.autoIdx, sol: m.solution.map(s => s.nodes.join('-') + ':' + s.color + '>' + s.dest), routes: m.routes.map(r => r.nodes.join('-') + (r.arrived ? '✓' : '…')), dests: m.dests.map(d => d.node + '/' + d.color + (d.filled ? 'F' : '') + (d.claimed ? 'C' : '')), depots: m.depots }); }));
}
await b.close();
