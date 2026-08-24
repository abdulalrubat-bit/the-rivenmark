# Ashen Waygate

Mobile-first top-down dungeon survival prototype. Vanilla HTML5 + canvas 2D,
no libraries, no image assets, no network calls. The whole game is
`index.html` — open it and it runs, including from `file://`.

*(Formerly "Neon Extraction" — same engine, re-skinned from neon cyberpunk to
dark fantasy. The repository still carries the old name.)*

**Play:** open `index.html` in a browser — it runs straight from `file://`.

---

## Core loop

Descend into a procedurally generated 2000×2000 dungeon, hold off a swarming
horde with a warded blade that strikes on its own, draw **essence** from the
dead, and once you have enough, find the waygate and hold its circle for four
seconds to escape.

- **Move** — drag anywhere on the play area (floating virtual joystick), or
  WASD / arrow keys on desktop
- **Strike** — automatic, nearest foe inside reach
- **Boons** — essence doubles as XP; each rank offers a choice of three boons
- **Pause** — the HUD button, or `Esc` / `P`

## Art direction

Dark fantasy, drawn as material rather than light. There is no grid, no glow
rim, no additive flourish — none of the neon-era machinery survived.

**Ground** is a set of eight textured tiles baked once at boot: trodden earth
with grit, half-buried stones, and worn flagstone paths that break up and peter
out. Tiles are chosen by a hash of their coordinates, so the floor never
repeats visibly and costs eight blits a frame.

**Walls** are unlit rock with courses of cut masonry laid along every exposed
face — dressed top edges, mortar joints, pitting, and a shadow thrown onto the
ground. The rock interior stays near-black so lit floor and dead stone separate
at a glance.

**Light** comes only from torches: warm pools that gutter, with cold sconces
here and there. Bodies are painted — a dark mass lit from above with a thin rim
— and the only things that glow are magical: a warded blade, a revenant's
bindings, a mote of essence.

Every rotation in the world is a right angle, so all four orientations of each
prop and masonry course are baked at load. The draw loop never rotates, which
turned resampling blits into straight copies and cut the frame cost roughly in
half.

**The cast**
- *Warden* — cloaked, helmed, blade held out front; the only cold-blue light
- *Wretch* — hunched and shambling, sick green eyes
- *Shade* — fast, tattered, streaming; spectral violet
- *Revenant* — heavy plate held together by orange bindings, slow and hard

---

## Architecture

Single file, sectioned in this order:

| Section | Contents |
|---|---|
| 1 | Config & tuning constants |
| 2 | Math helpers |
| 3 | `SpatialHash` |
| 4 | World generation |
| 5 | Collision |
| 6 | Entities & spawning |
| 7 | Input (virtual joystick) |
| 8 | Simulation |
| 9 | Rendering |
| 10 | UI, state machine & boot |

State lives in module-level variables (`player`, `enemies`, `bullets`, `loot`,
`particles`, `portal`, `run`). The game loop is a standard
`requestAnimationFrame` driving `update(dt)` and `draw(t)`, with `dt` clamped
to 50 ms so a backgrounded tab cannot teleport entities through walls on
resume.

The HUD, modals and upgrade cards are **DOM elements layered over the canvas**,
not canvas-drawn. That keeps text crisp at any DPI and — more importantly —
means a touch on a button is consumed by that button and never reaches the
joystick handler.

---

## What changed from the prototype handover

The four items listed as known limitations, and two of the four next steps,
are addressed here.

### Spatial partitioning (was: O(n²), capped at 40 enemies)

`SpatialHash` buckets entities by grid cell; every broad-phase query — bullet
vs. enemy, enemy separation, auto-target acquisition, wall lookups — now
touches only the cells it overlaps. Buckets are emptied rather than dropped
between frames, so a steady-state frame allocates nothing.

Walls get a coarse static grid (100 px) built once at worldgen; enemies get a
fine one (48 px) rebuilt each frame.

The enemy cap is now 220. Simulation is no longer the bottleneck; drawing is.

Measured under **software rasterization** (headless Chromium on SwiftShader, no
GPU), which is the pessimistic floor — a real device's GPU canvas handles the
full-screen blits and additive blending that dominate here far better:

| ms/frame | realistic load | 220 on screen |
|---|---|---|
| `update()` | — | **0.47** |
| `draw()`, full effects | **12.7** | **23.9** |
| `draw()`, reduced effects | — | **13.5** |

"220 on screen" forces every enemy plus 60 projectiles and 360 particles into
the viewport at once; normal play never reaches it, since the swarm is spread
across the arena and culled. Benchmarks halt the game's own `requestAnimationFrame`
loop first — otherwise its work lands inside the timed window and the numbers
are noise.

### Collision (was: bullets clipping thin walls, enemies snagging corners)

- **Sliding.** `moveEntity()` resolves X and Y as two separate passes. A body
  pressed into a corner keeps whichever component of its motion is
  unobstructed, instead of snagging the way a single-vector push-out does.
- **Tunnelling.** Projectiles are substepped along their path — up to 8 samples,
  never more than ~10 px apart. The thinnest generated wall is 26 px, so even
  the fastest fully-upgraded projectile at the `dt` clamp cannot skip one.

Verified in-browser: with 220 enemies active, zero bodies end a frame embedded
in geometry.

### Resolution scaling (was: blurry on high-DPI displays)

The canvas backing store is sized to `cssSize × devicePixelRatio`, with the
ratio capped at 2 — a 3× phone panel triples fill cost for a difference nobody
can see at arm's length. All drawing is in CSS pixels; the scale lives in the
canvas transform.

### Touch handling

- Floating joystick: the origin is wherever you first touch, and it follows if
  you drag past the ring, so the stick never feels capped.
- Deadzone is 15% of throw, **remapped** rather than clipped — output ramps
  from 0 at the deadzone edge instead of jumping to 0.15.
- The stick locks to one `pointerId`. A second finger cannot steal or disturb
  movement, and UI lives in the DOM layer above the canvas.

### Upgrades & progression

Ten upgrades (damage, fire rate, speed, plating, range, multishot, pierce,
magnet, regen, projectile velocity), most with stack caps. Levels queue if
several are earned at once and are presented one at a time.

### The sprite forge

Nothing detailed is drawn with paths at frame time. Every entity is forged once
into an offscreen canvas at device resolution — gradient body, rim light, inner
detail and baked glow — and the frame loop only blits those bitmaps. A sprite
can carry far more detail than is affordable 220× a frame, and one `drawImage`
beats a dozen path ops, so fidelity and speed come from the same change.

Sprites are supersampled ≥2× and their span is derived back from the rounded
pixel size, so `span × dpr` lands exactly on the source width — an unresampled
blit rather than a filtered one. Rotated blits take a `save`/`restore`; the
high-count unrotated cases (particles, lights) skip it entirely.

On top of that: an additive light pass for the few things that genuinely read
as light sources, expanding shockwave rings on kills, a baked vignette with
scanlines folded into the same bitmap (one screen-sized composite, not two),
and a slow scan sweep across the floor.

This also closes out the handover's "replace vectors with sprite sheets" step,
without needing art that doesn't exist: the sprites are generated procedurally
at boot, so the project stays asset-free and offline. Swapping in authored
sheets later means changing only the forge functions.

### Performance safety net

A frame-cost sampler drops the fill-heavy effects — light pass, vignette,
scan sweep, additive particles — when frames run long. Recovery is deliberately
sticky: restoring costs meaningfully more per frame, so it requires a
comfortable margin held over several samples, otherwise restoring pushes cost
straight back over the threshold and the setting oscillates. Verified to engage
within ~2 s of sustained load and hold without flapping.

---

## Balance

Tuned against a scripted bot playing full runs headless — flees crowding,
drifts toward loot, beelines the portal once it powers up. It is a deliberately
mediocre player, so its results are a floor, not a ceiling.

Current curve: tech quota reached around **80 s**, median run **~2 minutes**,
bot extracts roughly **1 run in 3**. Spawn rate more than doubles while the
portal is being channelled — the last stand is the intended climax.

Tuning constants are grouped at the top of section 1.

---

## Testing

No test framework is committed. Verification was done by driving the built
page in headless Chromium (Playwright) — state transitions, joystick deadzone
curve, auto-fire cadence, geometry embedding, frame cost at load, layout at
320/390/1440 px, and console errors. The bot simulation above runs the same way.
