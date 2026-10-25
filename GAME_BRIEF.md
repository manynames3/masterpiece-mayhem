# MASTERPIECE MAYHEM — FULL GAME BUILD BRIEF
Prepared 2026-10-24. This is an implementation mandate, not just a brainstorm. The user explicitly requested that Claude BUILD the game using this complete conversation handoff.

## North star
Create a polished, original, browser-playable (desktop AND touch/mobile) game called **Masterpiece Mayhem: Tiny Restorers**: a fanciful macro-zoom adventure where miniature cleaning crews, expressive germs, pigment couriers, strange creatures and animated tools restore famous public-domain paintings. Inside each painting is a hidden 3D-ish painterly micro-world. The player must be able to zoom between (1) original painting overview, (2) tilt-shift miniature community on brushstrokes, (3) microscopic cracks/grime/pigment. There must be visible user agency, satisfying particles, cinematic transitions, responsive audio/juice and real objectives. Do NOT just create a landing page or a gallery of mockups; implement an ACTUALLY PLAYABLE GAME, with distinct mechanics, win/loss/score, persistence, level select, tools, unlocks, and polished UX.

## Context: creative research and two-agent critique
User originally asked for 10 viral-worthy restoration game ideas: macro zoom, a village of germs, faded spots, mini pressure-washers, mopping, funny creatures. ChatGPT created high-detail gameplay concept renderings for all 10 as painterly cinematic dioramas with inset painting thumbnails, miniature workers in helmets, scaffold networks, near-photoreal colorful materials, grime monsters with googly eyes, tool HUD and progress bars. User then requested a 30-STAGE campaign that makes moving to different famous paintings feel compelling, with easy-to-hard progression and diverse restoration activities. Claude previously reviewed concepts and ranked optical pointillism, dramatic varnish peel, and paint-crack logistics as stronger durable GAME mechanics than simple washing. Use these conclusions.

### Artistic visual target
Premium 2026 custom-quality game UI (not generic vibe-coded dashboard, not neon SaaS). Exquisitely designed editorial museum-meets-whimsical-workshop world: warm ivory/museum stone/chocolate brown/gold highlights, dark gallery framing for art, brilliant painterly blues/corals/greens inside the canvas, small expressive crew members and wonderfully grotesque but charming soot/grime critters, squash/stretch animation, delightfully tactile cleaning. Clearly indicate mission, stage, tools, progress, interaction tutorial, mini paintings, campaign map, medals, settings. Responsive for portrait mobile and landscape desktop, playable with mouse/touch, accessible reduced-motion and sound mute. Images of artwork: use verified public-domain/CC0 sources WITH documented attribution as appropriate, or create stylized original painted stand-ins if network unavailable. Some museums restrict photographic copies even when old original artworks are PD. Do not depend on image generation APIs. Implement procedural/illustrated original foregrounds, rich visual texture, lighting, expressive critters and satisfying particles. Neither ignore art direction nor block progress on source artwork.

## Full campaign exact ordering: 5 galleries, 10 paintings, 30 STAGES (three per painting)
**Gallery 1: Discovery (easy)**
1 Mona Lisa — First Wipe: touch/mouse scrub simple dirt mask to reveal skin pigments. Learn controls; reward.
2 Mona Lisa — Germ Town: zoom into a brown spot to reveal a tiny village of grime critters; vacuum target dirt, avoid innocent workers.
3 Mona Lisa — Save the Smile: organize little workers, mend fine cracks via drag paths/scaffold mini actions; pullback and reveal smile.
4 Rembrandt The Night Watch — Golden Peel: drag/squeegee translucent amber varnish sheet; massive day-vs-night reveal.
5 Night Watch — Dust Invaders: precision brush, whisk away mobile dust characters around armor/clothes without touching fragile marked zones.
6 Night Watch — Let There Be Light: coordinate team lifts / peel patches to expose bright scene and awaken painted characters. Gallery celebration.
**Gallery 2: Restoration Workshop (easy-medium)**
7 Vermeer Girl with a Pearl Earring — Pearl Polish: circular buff gesture, fast satisfying reflection reaction, precise cloth use.
8 Pearl Earring — Crack Couriers: choose and route color-delivery crews along an actual branching craquelure road network; logistics puzzle.
9 Pearl Earring — Mirror Finish: align light directions / polish reflective micro-spots for highlight puzzle.
10 Hokusai Great Wave — Foam Blaster: aim spray, reactive foam, knock off grime critters, avoid damaged sections.
11 Great Wave — Rescue the Boats: tap/swipe to navigate workers on miniature boats through swirling channels and timed obstacles.
12 Great Wave — Release the Wave: connect blocked wave channels, trigger huge cascading animated cleaning wave.
**Gallery 3: Living Canvas (medium)**
13 Monet Water Lilies — Algae Vacuum: underwater fake-paint pond; steer vacuum, avoid fragile lily roots.
14 Water Lilies — Frog Workers: use creature-team skill buttons to direct different cleaners to special grime.
15 Water Lilies — The Great Bloom: reconnect water channels and sequence abilities to restore full bloom.
16 Van Gogh Starry Night — Brushstroke Surfing: worker slides/surfs raised impasto channel, directional inputs collect color droplets and avoid hazards.
17 Starry Night — Color Rivers: rotate channel junctions to route animated pigment currents.
18 Starry Night — Relight the Stars: route pigment through multiple nodes with simultaneous timing, fireworks reveal.
**Gallery 4: Color Kingdom (medium-hard)**
19 Seurat A Sunday Afternoon on the Island of La Grande Jatte — Missing Dots: pick pigment spheres and drag them into holes.
20 Seurat — Optical Illusions: place neighboring red/blue/yellow etc dot colors that BLEND into target at zoomed-out view; meaningful color-solving loop.
21 Seurat — Giant Dot Puzzle: restore multiple districts with limited dots/worker routes, evaluate hue from afar.
22 Bosch Garden of Earthly Delights — Creature Roundup: trap and release naughty grime creatures without catching helpful ones.
23 Bosch — Monster Factory: choose appropriate team/abilities for differing contamination challenges (slime/fire/crumb/crack).
24 Bosch — Slime Rebellion: manage team and stop mobile oversized grime boss, multiple goals and phases.
**Gallery 5: Impossible Gallery (hard)**
25 van Eyck Arnolfini Portrait — Clean the Reflection: precision brush convex mirror, identify hidden objects.
26 Arnolfini — Painting Within Painting: dive through an illustrated recursive mirror and solve changes affecting the main scene.
27 Arnolfini — Infinite Restoration: multi-layer interconnected mirror puzzle across depth, not just reskinned scrub.
28 Michelangelo Creation of Adam — Fresco Rescue: lay plaster patches and fix complex cracked branches with careful path placement.
29 Creation of Adam — Bridge the Gap: build a scaffolding support / bridge between giant fingertips; balance/structural physics puzzle.
30 Creation of Adam — The Final Touch: combine cleaning, crews, pigments, structural puzzle and final tap to connect fingertips; cinematic golden wave flies back through every completed painting.

## Game design and systems
- Not 30 copies of cleaning. Implement genuinely distinguishable, teachable gameplay mechanics and variations. Reuse a small clean core framework (~8-12 mechanic families), data-driven stages and composable objectives. Put stage configurations in typed structured objects, including objectives, tool inventory, allowed mistakes, completion thresholds, difficulty, mechanics, visual treatment, rewards, win conditions. First six stages especially polished.
- Portrait/mobile thumb-friendly touch and mouse. Intro scene "museum restoration desk", world map with five galleries and paintings plus per-stage stars, fluid progression, load/resume localStorage. Cinematic zoom overlay into current target, stage-specific tool options, stop-motion cute inhabitants, before/after slider or zoom-out button.
- Restoring a painting has three dramatic beats: initial dirt overview; discovery of hidden micro-village; satisfying completion that reveals repaired artwork. Stages 3/6/9 etc have a boss-size payoff. Stars based on skill, not arbitrary speed only; optional objective completion and "no accident" criteria. Replay, level unlocking; keep no frustrating timers for early stages.
- Special mechanic: **Botch Meter** — mistakes over-scrubbing cause silly temporary "cursed" distortions; can repair them, humorous shareable clip potential. This should be playful, no hard punishing fail.
- Workers physically perform tasks, have jobs rather than purely decorative sprites. Main crew has a recognizable style; grime monsters have personalities. Add gentle camera parallax, particles, satisfying path feedback, clear done state.
- At least 30 main stages defined, ideally playable. If can't make all unique fully in one iteration, deliver excellent playable stages 1-6 and a real scalable game engine, then expand rest systematically; DO NOT hide non-working content behind misleading UI. Clearly note implementation status.
- Additional future stretch: 30 master challenges, creature collection, workshop upgrades, random contamination events. These are secondary to game quality and 30-stage base.

## Critical game qualities / success gates
1. Within 2 seconds of play, user recognizes a familiar painting and sees miniature workers/germs DOING something interesting.
2. First interaction in < 10 sec; first restoration payoff in < 60 sec. Three distinctly different early stages, even if shared inputs.
3. Clean input: pointer/touch support, drag interpolation so strokes do not skip on fast swipe; anti-accidental page scroll on game canvas; pause, retry, hints.
4. Objective counter and progress must reflect actual state, not preset increments or fake UI. Winning gates next stage. Tutorial contextual, fast to dismiss.
5. Cinematic zoom should show painting -> brushstroke -> critter city with no sudden broken asset jump; robust fallback illustrations.
6. Performance target smooth on modern iPhone/mobile Safari and ordinary desktop, no huge unstable texture downloads.
7. Responsive designed UI, no default developer debug UI. Feel visually finished at first load.
8. No mandatory sign-in, backend costs or external APIs for MVP. Offline-capable if feasible.
9. Real tests: npm install, npm run build, basic gameplay interaction smoke tests using available browser automation or Playwright screenshots (or compile and script proof if browser unavailable). Fix errors, verify 30 levels config and level completion.
10. Documentation: README, GAME_DESIGN.md, ARCHITECTURE.md, ART_LICENSES.md (origin/attribution and legal uncertainty), DEVELOPMENT_STATUS.md (honest implemented vs stubbed levels, next steps), screenshots if browser accessible. Commit to local Git. Do not push/create PUBLIC repo without explicit permission.
11. Use local project at /Users/aiden/Developer/masterpiece-mayhem. Build everything there and do not modify unrelated repos, account settings, credentials or infrastructure.
12. Prefer Vite + TypeScript + PixiJS or Phaser 3 for 2.5D canvas interaction; Three.js if you can make a genuinely better game in scope. Avoid slow full 3D overengineer. High-quality architecture and visual effects and original procedural art.

## Painting/reference safety
The original artworks are generally historic public-domain works, but digitized museum photography and some uses can involve rights/policies. Use appropriately licensed art files if verified (Rijksmuseum/Mauritshuis, Wikimedia Commons PD/CC0), cite source URL per asset; otherwise original hand-drawn evocative stylizations; no hotlink to dubious domains. Especially Michelangelo/Italian collections, use appropriate legal review before commercial release. Make game clearly fantastical, not instructions for actual real-world conservation (no realistic pressure washing authentic paintings). Avoid copying PowerWash Simulator visual UI.

## Winning priorities
BUILD rather than write an essay. Ship a cohesive delightfully polished working playable experience as the proof. Start immediately without clarification; decide reasonable technical assumptions. The 30-stage campaign is the design backbone. On completion or handoff, state exactly what works, what is incomplete, how to start the game locally, tests run, and next implementation steps.
