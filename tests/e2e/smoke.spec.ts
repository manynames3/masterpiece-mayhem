import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

/** True once a canvas has non-transparent pixels, i.e. the characters actually rendered. */
const painted = (page: Page, sel: string) => page.locator(sel).first().evaluate((c: HTMLCanvasElement) => {
  const g = c.getContext('2d');
  if (!g || !c.width) return false;
  const d = g.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 0) return true;
  return false;
});

test('main menu paints the real crew without ever covering the logo or a button', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const play = page.getByTestId('play');
  await expect(play).toBeVisible();
  for (const id of ['open-map', 'open-cast', 'open-settings']) await expect(page.getByTestId(id)).toBeVisible();
  await expect.poll(() => painted(page, 'canvas.menu-crew')).toBe(true);
  await page.waitForTimeout(800); // let the reveal animation settle
  const overlaps = await page.evaluate(() => {
    const boxes = (document.querySelector('canvas.menu-crew') as any).__boxes() as DOMRect[];
    const ui = [...document.querySelectorAll('.mbtn, .menu-logo')].map((e) => e.getBoundingClientRect());
    return { n: boxes.length, hits: boxes.filter((a) => ui.some((u) => a.left < u.right && a.right > u.left && a.top < u.bottom && a.bottom > u.top)).length };
  });
  expect(overlaps.n).toBeGreaterThanOrEqual(7); // 4 heroes + 3 critters
  expect(overlaps.hits).toBe(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('dragging across the menu painting wipes away real grime', async ({ page }) => {
  await page.goto('/');
  const grime = page.getByTestId('menu-grime');
  await expect(grime).toBeVisible();
  await page.waitForTimeout(1600);
  const box = (await grime.boundingBox())!;
  // sample the top-left area: away from Pip's scrubbing and the pre-cleaned face patch
  const alphaAt = () => grime.evaluate((c: HTMLCanvasElement) => {
    const g = c.getContext('2d')!;
    const d = g.getImageData(Math.round(c.width * 0.15), Math.round(c.height * 0.15), Math.round(c.width * 0.2), Math.round(c.height * 0.08)).data;
    let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i];
    return a / (d.length / 4);
  });
  const before = await alphaAt();
  const x0 = box.x + box.width * 0.12, y0 = box.y + box.height * 0.17;
  if (test.info().project.name === 'mobile') {
    // touch drag via pointer events on the canvas
    await grime.dispatchEvent('pointerdown', { clientX: x0, clientY: y0, pointerId: 1, pointerType: 'touch', buttons: 1 });
    for (let i = 1; i <= 12; i++) await grime.dispatchEvent('pointermove', { clientX: x0 + box.width * 0.02 * i, clientY: y0 + (i % 2) * 6, pointerId: 1, pointerType: 'touch', buttons: 1 });
    await grime.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
  } else {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + box.width * 0.02 * i, y0 + (i % 2) * 6, { steps: 2 });
    await page.mouse.up();
  }
  expect(await alphaAt()).toBeLessThan(before * 0.8);
});

test('menu buttons route: Play starts stage 1 for a new player, Settings opens', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('stage-canvas')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__MM.state() !== null), { timeout: 15_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('Crew & Critters showcase lists every character and switches poses', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('open-cast').click();
  await expect(page.getByTestId('cast-screen')).toBeVisible();
  await expect(page.locator('[data-hero]')).toHaveCount(4);
  expect(await page.locator('[data-critter]').count()).toBeGreaterThanOrEqual(5);
  await expect.poll(() => painted(page, '[data-hero="pip"] canvas')).toBe(true);
  const chip = page.locator('[data-critter="smudge"] .chip', { hasText: 'Surrender' });
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('cast-back').click();
  await expect(page.getByTestId('play')).toBeVisible();
  expect(errors).toEqual([]);
});

test('stage 1 loads, accepts a scrub and reports real progress', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?stage=1');
  await page.waitForFunction(() => (window as any).__MM?.state()?.phase === 'play', null, { timeout: 20_000 });
  await page.locator('[data-testid=coach] .btn').click({ timeout: 3000 }).catch(() => {});
  const box = (await page.getByTestId('stage-canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 120, cy - 80);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) await page.mouse.move(cx - 120 + (i % 8) * 30, cy - 80 + Math.floor(i / 8) * 30, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => (await page.evaluate(() => (window as any).__MM.state().metrics.progress)) as number).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('QA autoplay can finish stage 1 and open results', async ({ page }) => {
  await page.goto('/?qa&stage=1');
  await page.waitForFunction(() => (window as any).__MM?.state()?.phase === 'play', null, { timeout: 20_000 });
  await page.evaluate(() => (window as any).__MM.autoplay(true));
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 45_000 });
});
