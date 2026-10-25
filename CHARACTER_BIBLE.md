# Character Bible — Masterpiece Mayhem: Tiny Restorers

All characters are original and drawn procedurally in Canvas 2D (`src/art/crew.ts`, `src/art/grimelings.ts`, shared material and face kit in `src/art/draw.ts`). No sprites, no downloads, no image generation.

## 1. Choosing a visual language

Before building anything, three directions were compared as written design studies (only the winner was then built in code). Each was scored 1–5 on the brief's criteria.

| Criterion | A. Flat sticker ink | B. Art-supply folk (characters *are* sponges, brushes, tubes) | **C. Felt & clay diorama toys** |
|---|---|---|---|
| 2-second legibility | 5 | 3 (an object with a face reads as a prop) | 4 |
| Collectible / toy appeal | 3 | 4 | **5** |
| Reaction-GIF potential (squash, faces) | 3 | 3 | **5** |
| Originality | 2 (generic mobile-game look) | 5 | 4 |
| Expressive animation | 3 | 2 (rigid shapes) | **5** |
| Fidelity at 20 / 48 / 200 px | 4 / 4 / 2 | 2 / 4 / 4 | **4 / 5 / 5** |
| Fit with a museum-workshop world | 2 | 4 | **5** |
| **Total** | 22 | 24 | **33** |

**Chosen: C, with B's motifs layered on top.** The heroes are soft, one-piece "gumdrop vinyl" toys lit like a stop-motion set: key light from the top left, warm bounce on the lower right, felt-fibre texture, and a dark toy-sticker outline so they stay readable at 20px. Each hero carries one art-supply motif as a signature accessory: a sponge hat, brush-tip hair, a paint-drop raincoat. Animation runs at **12 fps stop-motion steps**, so motion feels handmade instead of tweened.

### Rendering rules
- **Silhouette first.** Every hero has a different body shape (gumdrop, tall capsule, pillow, paint-drop), height and accessory, so you can tell them apart in black-fill alone.
- **Level of detail.** `lodFor()` measures on-screen size, camera zoom included. Under 10px it draws a flat sticker (shape, eyes, outline). Up to 20px it adds shading. Above that it adds felt texture, rim light, freckles, stitching and catch-lights.
- **Eyes sell it.** Large sclera, coloured iris, two catch-lights, blinks, and eyes that follow the pointer (`lookX/lookY`). Brows tilt from −1 (determined/angry) to +1 (worried/surprised).
- **Contact.** Soft radial contact shadows that shrink when a character hops, plus squash and stretch on landings.
- **Cost.** A handful of gradients and paths per character, and a felt pattern cached once per canvas context. No offscreen sprite caches or downloads.

## 2. The Tiny Restorers (heroes)

| | Pip Sudsworth | Professor Bristlebrow | Big Mo Brogan | Zuzu Glimmer |
|---|---|---|---|---|
| Role | Rookie scrubber | Senior conservator | Lifter & scaffold boss | Lamplighter & pigment courier |
| Silhouette | Gumdrop, medium | Tall capsule (tallest) | Wide pillow (widest) | Paint-drop, smallest |
| Motif | Sponge hat, freckles, bubbles | Brush-tip hair dipped in coral paint, walrus moustache, brass loupe | Polka-dot bandana, hard hat three sizes too small, mitten gloves | Coral raincoat hood, antenna lantern, bouncing pigtails, rain boots |
| Default tool | Sponge | Brush | Bucket | Lantern |
| Personality | Eager, too fast, always humming | Fussy, kind, theatrical | Strong, soft-spoken, sentimental | Fearless, chatty, sparkly |
| Signature (`cheer` / `signature`) | **Bubble Bounce**: big hop, the sponge hat spins off, a stream of bubbles | **Eureka Loupe**: leans in, loupe eye swells, eyebrows dance, brush conducts | **Gentle Giant Flex**: squishy crouch, double-bicep flex, a heart pops out | **Twinkle Twirl**: a spinning hop inside an orbit of stars |

Shared acting states: `idle` (breathing and blinks), `walk`, `carry`, `work` (tongue-out concentration), `lift` (strain, sweat), `scared` (shaking, wide eyes), `dizzy` (spiral eyes, orbiting stars) and `cheer`/`signature`. Gameplay win reactions use `cheer`, so every stage ends with each hero's own signature move.

## 3. The Grimelings (critters)

| Name | Species / grime kind | Silhouette & material | Personality |
|---|---|---|---|
| **Smudge** | Soot Smudger (`soot`) | Lumpy pear of soot with a smoke-curl quiff, ember-glow cheeks, thumbprint smudges | Grumpy until tickled |
| **Blotto** | Wobbly Ink Stain (`ink`) | See-through jelly dome, wavy dripping hem, inner bubbles, wet highlight, puddle | Nervous jiggler |
| **Crackle** | Craquelure Critter (`crack`) | Faceted plaster shard, zig-zag fault line that gapes when it laughs or panics, asymmetric eyes, flying chips | Opinionated, castanet-snapper |
| **Puffington** | Dust Puff (`dust`) | Cloud of overlapping puffs, untrimmed fringe over the eyes, pink nose, periodic *achoo* burst | Moves mostly by sneezing |
| **King Gloopus** (boss) | Slime Boss (`slime`) | Glossy translucent drop, crown, swallowed paintbrush and button visible inside, spreading puddle | Pompous, dramatic, sticky |
| Scorch | Ember Imp (`fire`) | Flickering three-tongue flame, hot core, rising embers | Hot-headed |
| Nibs | Crumb Goblin (`crumb`) | Toasted crumb with pores and sesame seeds | No regrets |
| Buzzby | Varnish Fly (`fly`) | Round iridescent body, aviator goggles, veined flapping wings | Stunt-flyer |
| Mossy | Pond-Scum Jelly (`algae`) | Blotto's green cousin with a lily-pad hat | Burbly |
| Glint | Gilded Helper (`gold`) | Rounded gold-leaf star with orbiting sparkles; the friendly one you must *not* catch | Cheerleader |

Moods (`Mood`): `grump`, `giggle`, `sleepy`, `sneak`, `angry`, plus the acting set `surprised` (! mark), `panic`/`scared` (shake, sweat, waving arms), `surrender` (teary eyes, white flag) and `celebrate`/`happy` (star eyes, hop, sparkles).

Where the moods show up in play:
- Stage 1: soot smudgers look `surprised` when the sponge gets close and `panic` when evicted.
- Critter stages: caught critters `surrender`, flung or vacuumed ones `panic`, nearby ones are `surprised`.
- Stage 24 boss: King Gloopus goes from angry → sleepy → panicked when hit → surprised (shrunk) → surrenders when bottled.

## 4. Originality guardrails
- No circular soot balls with stick legs (avoids the well-known film soot-sprite look). Smudge is a pear-shaped lump with a smoke quiff and ember cheeks, and the in-game wording is "soot smudgers".
- No round yellow henchmen, plumbers, pocket monsters or other franchise silhouettes. Heroes are one-piece toys with art-supply motifs unique to this game.
- Names are original coinages.

## 5. Where to see them
- **Title screen:** a large hero line-up on the restoration desk. They take turns doing signature moves and their eyes follow the pointer. Smudge and Puffington sneak in from the edges.
- **Crew & Critters** (title → *Crew & Critters*): large live portraits, personality copy, pose/mood switches, and a 20px/48px scale-check strip.
- **In game:** the `drawWorker` / `drawCritter` APIs are unchanged, so all 30 stages use the new cast. Walkers keep a stable hero identity (`Walker.hero`, from the seed). Explicit `hero` and `mood` options override it.

## 6. API cheatsheet
```ts
drawWorker(g, x, y, s, { t, hero?: 'pip'|'bristle'|'mo'|'zuzu', seed?, state?, tool?, facing?, lookX?, lookY?, overalls?, badge?, carry?, alpha? })
drawCritter(g, x, y, r, kind, { t, seed?, mood?, hat?, legs?, squash?, lookX?, lookY?, alpha? })
```
