# Masterpiece Mayhem — Design 4 Premium Main Menu Upgrade

## User instruction (October 25, 2026)
"Do #4. But characters dont match the ones in actual gameplay. What should we do? Which one is better for actual gameplay or viral worthy?"

The user selected **Design #4** from four previously generated cinematic menu renderings. It is NOT a reference to some unrelated "step 4." They want an ACTUAL game menu, but specifically flag that the Concept Design #4 character figures (generic adorable storybook human kids) are INCONSISTENT with the actual game.

GPT and independent Claude Opus both concluded: **retain the four ORIGINAL established gameplay mascots and upscale the art**, don't import unfamiliar human children or maintain divergent menu/game casts. The existing in-game cast has original distinctive silhouettes and real game mechanics; Design4 concept wins only because it has far more expensive 3D-like lighting/material rendering. Neither the existing crew nor game should be completely rewritten. This work is a UI/UX art direction implementation, not a generic homepage.

## Exact Design #4 art/interaction direction
The chosen mockup: cinematic warm-gold antique European gallery hall, deep red velvet curtains and rich wood, huge close-up of Vermeer's Girl with a Pearl Earring inside a very large ornate gilded frame at right (~55% width). Painting partially encrusted in amber grime with an entertaining wipe-to-reveal patch, tiny scaffolds, soot creatures lurking along frame, handsome warm side light, museum statues out of focus. On left (~38%), boldly bespoke title lock-up with gold-foil serif "MASTERPIECE", a striking brush-stroke treatment "MAYHEM" underneath, "TINY RESTORERS" small. Art-directed vertical stack of large physically dimensional etched/buttons: burgundy/oxblood primary PLAY CTA, cream/gold frames for CREW & CRITTERS, GALLERY MAP / CONTINUE, SETTINGS (and optional How It Works), icons purpose-built not generic SaaS. Play button largest; intentional typography, spacing and responsive alignment, hover/focus/tap feedback. Treat concept art as inspirational only; do NOT use a flat screenshot with fake buttons. The game already has responsive real buttons and accessible navigation in src/ui/title.ts; preserve functional routes.

## Character mandate
In the new menu the actual 4 in-game heroes MUST appear, same visible silhouettes, colors and art-supply signature props:
- Pip Sudsworth: gumdrop teal toy, yellow sponge hat, freckles, bubbly gesture.
- Professor Bristlebrow: tall cream capsule, coral dipped brush-tip hair, loupe.
- Big Mo Brogan: broad blue pillow body, red bandana, comically small hardhat; heavy lifter.
- Zuzu Glimmer: small coral paint-drop with antenna lantern, sparkly messenger.
- Actual soot/smudge creatures from src/art/grimelings.ts, not generic black fluffy lookalikes.
Use EXACT shared canvas character renderers from src/art/crew.ts and src/art/grimelings.ts (or deliberately create SHARED scaled asset/sprite output for both menu and gameplay). The new menu may render heroes larger and add depth/shading/parallax but DO NOT falsely depict humans or unrelated stock characters. Improve silhouettes/material with careful layered rendering at menu and gameplay resolutions, but don't deteriorate 24px readability or current 30 levels. If art is not fully 3D cinema quality, prefer a beautifully intentional game-native 2.5D illustration over a photoreal render with bait-and-switch. Give heroes distinct actions: Pip scrubs, Professor examines frame, Mo holds ladder, Zuzu holds a lantern and follows a soot critter. Animate in-place with real drawWorker/drawCritter poses/particles/small eye tracking, avoid silly fake footage. Core user hook: show that painting art contains a living tiny restoration crew.

## Implementation in current repository
Project: /Users/aiden/Developer/masterpiece-mayhem; Git remote github.com/manynames3/masterpiece-mayhem; live Cloudflare Pages masterpiece-mayhem.pages.dev.
1. Inspect actual current code, app routing, design system, title and other screenshots. Build a concise independent /menu-ui-notes.md with the design decisions and honest feasibility limitations. Then ACTUALLY IMPLEMENT new menu, not a design note only.
2. Use available original public-domain game painting art from public/art and documented credits, lean CSS layers / SVG ornamental frame and Canvas 2D characters; DO NOT use the AI mockup as a single fake-clickable background. No assets that visually depict inconsistent humans.
3. Establish compositional hierarchy (brand/logo, CTA, navigation), clear action labels matching app routes, naturally animated large crew. Dramatic hand-wipe on painting has to be light, performant and preferably clickable/interactive; do not hijack taps on navigation. Game menu transition to first stage should feel connected. A small animated preview of next/current artwork may be used instead of fixed Vermeer if helpful, but respect Design4's Vermeer mood as much as realistic.
4. Target modern responsive desktop 1440x900/1280x800 AND phone 390x844 and 375x667; make large controls thumb-friendly, avoid characters covering text.
5. Avoid replacing custom cast, breaking progress, changing the 30-stage data, or recreating stack. Don't overwrite unrelated projects/cloudflare. Check performance Canvas raster + DPR. Reduced motion and accessibility focus visible.
6. Run npm run build, npm test, npm run test:e2e and Playwright screenshot QA. Compare new desktop/mobile screenshots to existing screenshots/title-desktop.jpg and title-mobile.jpg; inspect actual images. Add screenshot files to screenshots as references and visual proof. Keep production ready.
7. Keep GitHub and Cloudflare Pages in sync with release as user previously requested, only after verified tests, with README/About as already configured. GitHub Pages is not in scope; target Cloudflare Pages; if deployment blocked, report.
8. Do not claim a photorealistic Design4 realization that is visually nowhere close. Iterate scene until it feels uniquely art-directed at runtime; no "vibe-coded" generic gradients/layout. If cannot achieve cinematic quality solely with existing procedural Canvas2D, create a durable modular menu architecture and explicitly document future art asset needs (shared character turnaround sprite sheets, environment layers, retained silhouettes).
9. Consider initial 10sec retention: cold open spot with critter peek + Pip cleaning stripe, warm responsive UI reveal, camera micro-zoom CTA. Don't delay first click with splash animation. Avoid repetitive menu motion.

## Prior game/cast quality notes
Actual existing title screenshot: screenshots/title-desktop.jpg is flat brown gradient with small logo and pill buttons, framed Mona Lisa on right and four gumdrop heroes aligned in bottom 20%, too much empty negative space. It doesn't live up to cinematic Design 4. Existing cast Bible CHARACTER_BIBLE.md. Current screens include save/map/showcase/title; don't break their navigation or state.

## Prior Claude independent opinion
"Your gumdrop crew wins on three of four counts. Franchise identity, 30-stage playability and long-term virality favor crew. Concept #4 wins TikTok screenshot conversion only due to render quality. Redraw crew in high-fidelity felt/clay, keeping proportions; never split menu/game casts. Use parallax museum hall layers, rays, grime mask revealing true painting, shared sprites between game and menu. Biggest red flags: menu fidelity outruns game; texture kills small-scale readability; randomly generated inconsistent character art."

## Your next action
Start implementation now. Focus on finished, bespoke responsive title + matching actual characters. Keep original gameplay functional. Make commits and deploy if tests pass. No generic written proposal as substitute.
