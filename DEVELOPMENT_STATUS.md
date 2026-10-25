# Development status — 2026-10-25

## Main menu redesign (Design #4) — 2026-10-25 afternoon
- New gallery-hall main menu (`src/ui/title.ts`, `src/ui/menu/scene.ts`, `src/styles/menu.css`). Rationale, limitations and the visual QA log are in `menu-ui-notes.md`.
- The cast is the real in-game cast: same `drawHero` / `drawCritter` renderers. `drawHero` now also returns the front-hand position (rendering unchanged).
- Verified: `npm run build` ✅, `npm test` ✅ (9 tests), `npm run test:e2e` ✅ 12/12 (desktop + Pixel 7). New menu tests: no character overlaps the logo or buttons, wiping removes grime, Play starts stage 1 and Settings opens.
- Screenshots: `screenshots/title-*.jpg` (new) vs `screenshots/before/title-*.jpg` (old).

## What shipped in this update
- **New character system.** Four named heroes (`src/art/crew.ts`) and ten Grimeling species including the King Gloopus boss (`src/art/grimelings.ts`), sharing a felt-and-clay material and face kit (`src/art/draw.ts`). The legacy `drawWorker` / `drawCritter` APIs are unchanged, so every stage uses the new art automatically. Rationale and API: `CHARACTER_BIBLE.md`.
- **Acting in gameplay.** Hero signature moves play on every win. Critters look surprised when the tool gets close, panic when flung or vacuumed, surrender when caught or bottled (King Gloopus included), and celebrate in the showcase.
- **Title screen** has a large hero line-up on the desk (pointer-tracking eyes, rotating signature moves) and a new **Crew & Critters** button.
- **Crew & Critters showcase** (`src/ui/cast.ts`): large live portraits, personality copy, pose/mood switches, and a 20px/48px scale check.
- **Bug fixes found during regression:**
  - Flow-puzzle generator (stages 15 and 18) failed on every seed, because one source could not feed more sinks than it has free neighbours. Paths may now branch off a colour's existing network. Stage 17's layout changed as a side effect.
  - Lasso autoplay (stage 22) never advanced: a shared timer was decremented and incremented in the same frame.
- **Tooling.** Playwright now has its own config (`playwright.config.ts`, `tests/e2e/`) and no longer picks up Vitest files. Smoke tests run on desktop and mobile viewports against the production build.
- In-game wording "soot sprites" is now "soot smudgers".

## Verification evidence (this session)
| Check | Result |
|---|---|
| `npm run build` (tsc + vite) | ✅ passes |
| `npm test` (Vitest) | ✅ 3 files, 9 tests |
| `npm run test:e2e` (Playwright, desktop + Pixel 7) | ✅ 8/8: title ensemble paints and sits below the Play button with no horizontal overflow; showcase lists 4 heroes and ≥5 critters and mood chips work; stage 1 scrub raises real progress; autoplayed stage 1 reaches results. No console errors. |
| QA autoplay solver, all 30 stages (`scripts/autoplay-all.mjs`) | ✅ 27/30 reach the results screen (1–24, 26, 27, 28) ❌ 25, 29, 30 do not finish (see below) |
| Screenshots reviewed by eye | title (1440×900, 390×844, 375×667), Crew & Critters (desktop + phone), stages 1, 2, 22, 24, 25 mid-play, stage 1 win |

## Known gaps / not verified
- **Stage 25 (Clean the Reflection):** the autoplay solver plateaus around 60% cleaned with many fragile-zone mistakes. It's unclear whether the stage needs tuning or the solver is too clumsy. Needs a human playtest.
- **Stage 29 (Bridge the Gap):** the solver reaches about 90% and keeps failing bridge tests. Human winnability not confirmed.
- **Stage 30 (The Final Touch):** the solver stalls around 75%, so the finale cinematic is reachable only if a human can finish. Not confirmed this session.
- **No full human playtest** of all 30 stages, and no testing on physical iOS/Android devices. Mobile was checked only with emulated viewports.
- Frog crews (`drawFrog`), boats and village props still use the original simpler art. They work, but they aren't upgraded to the new material yet.
- Hero identity in crowds is derived from the walker seed, so crowds mix all four heroes. Teams in stage 23 keep their team colour as the outfit.
- **Licensing:** no open-source licence has been chosen for the code. Paintings need a rights review before any commercial sale (see `ART_LICENSES.md`).

## Deployment
- Cloudflare Pages project `masterpiece-mayhem`, deployed by **manual Wrangler direct upload** of `dist/` (`npx wrangler pages deploy dist --project-name masterpiece-mayhem --branch main`). Pushing to GitHub does **not** redeploy yet. To make it automatic, connect the GitHub repo in the Cloudflare dashboard (Workers & Pages → project → Settings → Builds, with build command `npm run build` and output `dist`), or add a GitHub Action with a scoped Cloudflare API token stored as a repo secret.

## Suggested next steps
1. Human-playtest stages 25, 29 and 30. Tune difficulty, or fix the solvers so all 30 are regression-covered.
2. Bring frogs, boats and huts onto the felt-and-clay material, and add hero callouts (named speech bubbles) during tutorials.
3. Add per-stage hero assignments (e.g. Mo on lifting stages, Zuzu on courier stages) so the cast's jobs match their bios.
4. Make deploys automatic via Git integration.
