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

test('title screen shows the crew ensemble and never covers the play button', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const play = page.getByTestId('play');
  await expect(play).toBeVisible();
  await expect(page.getByTestId('open-cast')).toBeVisible();
  await expect.poll(() => painted(page, 'canvas.title-crew')).toBe(true);
  const crew = await page.locator('canvas.title-crew').boundingBox();
  const btn = await play.boundingBox();
  expect(crew && btn && crew.y >= btn.y + btn.height - 1).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
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
