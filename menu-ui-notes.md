# Main menu — Design #4 implementation notes

**Date:** 2026-10-25
**Code:** `src/ui/title.ts` (DOM, buttons, ornaments, icons), `src/ui/menu/scene.ts` (grime and crew canvases), `src/styles/menu.css`
**Before / after:** `screenshots/before/title-*.jpg` → `screenshots/title-*.jpg`

## What Design #4 asked for, and what shipped

| Design #4 element | Implementation |
|---|---|
| Warm antique gallery hall, red velvet, rich wood | Layered CSS: a damask wall (inline SVG pattern) under two warm radial key lights, a blurred diagonal light beam in `screen` blend, wainscot panelling with a gilt chair rail, a parquet floor, swaying velvet side curtains with gold tie-backs, a scalloped valance, and a vignette with film grain. |
| Huge Vermeer in an ornate gilt frame at right | The real public-domain *Girl with a Pearl Earring* (`public/art/pearl-earring.jpg`; the thumbnail shows first, then the full image swaps in). The frame is pure CSS: a metallic gradient plus eight inset rings that model the moulding profile (bead, cove, flat, sight edge), lit top-left. On top sit four SVG acanthus corner cartouches, a shell crest, and a brass museum plaque. The painting is cropped around the face so it stays recognisable at every aspect ratio. |
| Amber grime and a wipe-to-reveal patch | `menu-grime` canvas: amber varnish, the game's own soot `grimeTexture`, soot blooms, drips, craquelure and a varnish highlight. The crew has already cleaned a ragged sponge-swirl patch over the face before the screen opens, so the first frame is recognisable. **It's interactive:** drag or touch anywhere on the painting to scrub (a sponge cursor appears for mouse users, plus bubbles and sparkles). Soot creeps back slowly once you stop, but never over the face patch. |
| Tiny scaffolds, soot creatures on the frame | Uses the game's own `drawScaffold` / `drawLadder` props on the bottom moulding. Critters are real Grimelings: **Smudge** (soot) on the top moulding, **Puffington** (dust) peeking from behind the right edge, **Blotto** (ink) from behind the left. They are clip-masked, so they really sit *behind* the frame. |
| Gold-foil MASTERPIECE, brush-stroke MAYHEM, small TINY RESTORERS | Fraunces 700 caps with gradient foil, stacked drop-shadow emboss and a periodic foil glint. MAYHEM is Fraunces 900 italic in streaked cream, set on an oxblood SVG brush swipe whose edges are frayed with `feTurbulence` displacement. TINY RESTORERS is tracked caps between gilt rules. The `<h1>` has a single accessible name. |
| Oxblood PLAY CTA, cream/gold secondary plates, bespoke icons | Real `<button>`s with the same routes and test IDs as before (`play`, `open-map`, `open-cast`, plus new `open-settings`). Play is the largest: oxblood lacquer, gilt bezel and a breathing glow. Secondary buttons are parchment plates with an etched triple bevel. Each has a brass medallion holding a purpose-drawn icon: a brush-tipped play triangle, a gallery floor plan, Pip's gumdrop beside a soot puff, and a palette dial. Hover gives a lift and a light sweep; press sinks the button; `:focus-visible` shows a 3px gold ring; arrow keys walk the menu. |

## Character fidelity (the main decision)

The concept art's storybook human children were **not** used. No human figure appears anywhere in the menu, including statues; the out-of-focus depth comes from a distant gilt-framed *Starry Night* instead. Every hero and critter is drawn by the **exact same renderers the stages use**: `drawHero` from `src/art/crew.ts` and `drawCritter` / `drawGrimeling` from `src/art/grimelings.ts`. Silhouettes, colours, props, 12 fps stop-motion timing and eye tracking are therefore identical to gameplay.

Each hero has the action the brief asked for:
- **Pip Sudsworth** paces the scaffold plank in the `work` pose with the sponge. `drawHero` now returns where the front hand landed, and the menu wipes the grime *at that point*, so Pip really cleans a stripe toward the pearl. Once the pearl is clean, it twinkles.
- **Professor Bristlebrow** stands at the lower-left corner peering at the moulding through the loupe, and plays the *Eureka Loupe* signature every 11 seconds.
- **Big Mo Brogan** braces the ladder in the `lift` pose (strained face, sweat) and occasionally does the *Gentle Giant Flex*.
- **Zuzu Glimmer** walks the top moulding with a lantern, tailing Smudge. The lantern throws a warm glow on the frame and wall. Smudge panics when Zuzu catches up, and ducks behind the moulding at each turn.
- All four look at the pointer for three seconds after it moves, then go back to their task. Critters react when the player scrubs near them.

The only shared-renderer change is that `drawHero` now **returns** the front-hand position. Drawing output is unchanged, so 24px gameplay readability and all 30 stages are untouched.

**Lighting upgrade without forking the art:** after the cast is drawn, a `source-atop` pass on the crew canvas lights only pixels that already hold characters or props. It adds a warm key from the upper left, an umber falloff toward the lower right, and lantern bounce near Zuzu. The heroes look lit by the gallery while keeping their game silhouettes.

## Layout

- **Desktop (≥861px):** a two-column grid, with brand and actions at 38% and the scene in the rest. `scene.ts` fits the frame each resize, leaving headroom for Zuzu on the top moulding, side room for the peekers and space for the plaque. Measured at 1440×900 and 1280×800.
- **Phone (≤860px):** brand → scene → thumb-zone actions. Play is a full-width 72px bar. Map / Crew / Settings sit in a 3-up row of 74px tiles with icons above labels. The footer flows below the buttons instead of floating over them. Measured at 390×844 and 375×667; the 375×667 view drops the eyebrow, subtitle and stats line to make room.
- **Landscape phones (≤520px tall):** a compact two-column layout.
- **Guarantee:** the crew canvas publishes per-character boxes, and the e2e suite asserts none of them overlaps a button or the logo. The QA script reports the same check for all four sizes.

## Motion and first 10 seconds

- No splash and no blocking intro: buttons work from the first frame.
- Reveal order: the brand rises (0.05s), Play (0.12s), the secondary buttons follow in 50ms steps, and the scene eases in from a 4% zoom. The pre-cleaned face shows at once, and Pip is already scrubbing with bubbles. The "Drag to wipe" hint appears at 2.4s and leaves at 9s.
- Hovering or focusing Play pushes the camera toward the painting by 1.2%. Pressing it zooms into the painting and fades out for 340ms before the stage mounts, so the hand-off into the stage feels continuous. Reduced motion skips the delay.
- To avoid a looping feel, the motion runs on several timers that don't line up: Zuzu and Smudge wander on two combined sine waves, and the signatures repeat every 11s and 30s.
- **Reduced motion** (the in-game setting or the OS preference): the cast runs at 40% speed, signatures, bubbles and dust motes are off, CSS animations are suppressed, and the Play transition is instant.

## Performance

- The painting is a plain `<img>` (GPU-composited). The grime canvas stays at about 1–1.25 px per CSS px and is updated incrementally (sponge stamps, plus a throttled regrowth blit every other frame).
- Only the crew canvas is redrawn each frame, with DPR capped at 2: 4 heroes, 3 critters, two props and capped particle counts.
- The pearl's cleanliness is sampled with a 1-pixel `getImageData` every 20 frames.
- The loop stops when the menu is removed.
- Headless Chromium at 1440×900 (software rendering) measured a median frame of 16.7ms and a p95 of 33ms.

## Visual QA log (screenshots inspected by eye)

1. **First pass.** Problems: the frame sat too low and clipped the plaque at 1440×900; the heroes read small; the grime looked like a flat sepia filter; on phones the absolutely-positioned footer collided with the button row and the stats line, the frame's bottom ornaments touched Play, and the left soot peeker was nearly invisible on the dark wall.
2. **Fixes.** Vertical fitting now centres the frame with a fixed foot margin. Hero unit size went from 0.088 to 0.10 of the painting height. The grime is denser, with soot blooms, drips and a varnish highlight. The phone footer is now in normal flow and the phone tile labels use a clamp. The left peeker became Blotto (ink blue reads against oxblood). The blurred *Night Watch* and the foreground stanchion rope were removed because they read as clutter. The desktop scene got more width, and the crop can go up to 1.12:1.
3. **Final.** `screenshots/title-desktop.jpg` (1440×900), `title-desktop-1280.jpg`, `title-mobile.jpg` (390×844), `title-mobile-small.jpg` (375×667) and `title-wipe.jpg` (mid-wipe: sponge cursor, bubbles, Puffington's surprise mark). In all four sizes there are 0 overlaps with controls and no horizontal overflow. Compared with `screenshots/before/`, the menu fills the screen with one composed scene instead of a small logo, pill buttons and a strip of heroes, and the CTA hierarchy is clear.

## Honest limitations

- This is **not** a photoreal or 3D render of the Design #4 concept. It is a deliberate 2.5D, game-native illustration: CSS materials, SVG ornament and the game's procedural felt-and-clay Canvas cast. The frame, hall and lighting get close to the concept's mood. The characters are flatter than the concept's rendered figures, by design, so the menu never promises art the stages can't deliver.
- *Girl with a Pearl Earring* is portrait-format, so the frame takes about 42–45% of the width on desktop rather than the concept's ~55%. Cropping harder would cut off the turban or the pearl.
- Big Mo's `lift` pose uses the game's strained face (comedy effort). A calmer "steadying" pose would need a new pose state in `crew.ts`.
- The out-of-focus statues from the concept were left out on purpose (no human figures).

## Future art assets that would raise fidelity (shared by menu and gameplay)

1. **Hero turnaround sprite sheets** (front, ¾ and side; idle, work and signature) rendered from a clay or 3D sculpt, using the existing silhouettes and colours. Load them into both `drawHero` and the menu so the casts can never diverge, and keep the procedural renderer as the 24px LOD.
2. **Critter sheets** for the ten Grimelings in the same material pass.
3. **Environment plates:** a painted gallery-hall back wall, a curtain alpha plate and a carved gilt-frame nine-slice at 2× and 3×, to replace the CSS mouldings where higher fidelity is wanted.
4. **A "steadying" pose for Mo**, and a carry pose that doesn't walk.
5. Optional: a short pre-rendered parallax loop of the hall (background only, never characters) for store and video capture.
