# The Rivenmark

Mobile-first top-down survival prototype set in the Rivenmark, after the Aegis
shattered. Vanilla HTML5 + canvas 2D, no libraries, no image assets, no network
calls. The whole game is `index.html` — open it and it runs, from `file://`.

Everything shipped so far is **the test level** — a proving ground. Levels
are a first-class structure (see below), so further levels with their own maps
and environments are data entries rather than a rewrite.

---

## Core loop

Play one of the Guided Vanguard. Raw magic is lethal unless it runs through
Spirit-wrought Steel, so the blade is the conduit: you swing, and the magic
leaves the edge as a **crescent** of Sun-Gold or Azure that carries a short way
and cuts whatever it sweeps through. Cut **Arcane Slag** from the
Hollow-Thralls, then find a **ley-gate** and hold it open long enough to carry
the haul out from under the Shroud of Dúath.

- **Move** — drag anywhere (floating stick), or WASD / arrows
- **Strike** — automatic, nearest thrall in reach
- **Boons** — slag doubles as XP; each rank offers three
- **Pause** — HUD button, or `Esc` / `P`

## The Guided Vanguard

Two of the Clear-Sighted, both fighting **unhelmeted** — the compendium is
explicit that they look the darkness in the eye, so the sprites show the face
and the weapon carries the order.

| | Isaac, The Unyielding Shield | Zayd, The Piercing Truth |
|---|---|---|
| Order | Hearth-Wardens | Frost-Scholars of Kael |
| School | Sun-Gold | Azure |
| Arms | Sun-emblazoned shield, golden sword | Sapphire Glaive |
| Play | 125 life, heavy slow cleave | 92 life, fast narrow lance |
| Reach | 178 | 206 |
| Sweep (half-width) | 33 | 21 |
| Damage / swing | 22 every 0.56 s | 17 every 0.42 s |

Isaac throws a broad, slow, heavy crescent; Zayd a thin fast one that carries
further. Neither has a pierce limit — a crescent is an edge, so it cuts
everything in its path, each body once.

## The blade

The strike is not a projectile weapon dressed up. A swing plays on the hero —
a streak trailing the edge — and releases a crescent that travels `range` and
expires. Geometry is an arc of radius `bow` centred behind the crescent, so it
bulges forward the way a swung edge does; a body is cut when it falls within
`band` of that radius and inside the arc's angular span.

That makes the collision two cheap tests (radial distance, angular offset)
rather than a swept-polygon intersection, and it means the sweep can widen with
a boon without re-forging anything — which is also why crescents are stroked
live rather than blitted from a forged sprite.

Crescents are drawn as four stacked translucent strokes under `lighter`, each
spanning slightly less of the arc than the last so it tapers to points at the
horns. They carry **no `shadowBlur`**: measured on this software rasteriser, the
blur cost **7.1 ms per crescent** against **0.6 ms** for the strokes, and it was
the only thing that made them expensive at all.

## The horde

The **Hollow-Thralls** — people who surrendered their will, every one carrying
the asymmetrical void-brand that binds them to the silent hive-mind.

- *Hollow-Thrall* — stooped, long-armed, dragging itself forward
- *Eclipse-Marked* — fast, hooded, fraying into tatters
- *Ghor-Breaker* — planted and over-armoured, held together by burning seams

## Levels

A **level** is the unit the player actually plays. It owns which regions it can
be cut from, what walks its halls, what has to be killed before the ley-gate
answers, and how much slag buys passage out:

```js
{ id:'test', name:'The Test Delve', tag:'TEST LEVEL',
  regions:['slag','vaelk','kraggen','weald','firth'],
  horde:['thrall','eclipse','breaker'],
  boss:'deceiver', quota:70, channel:4.0 }
```

Regions (below) are the environment table levels draw from. Because the quota,
the channel time, the spawn table and the boss are all read from `LEVEL` rather
than from constants, a second level is a new entry in `LEVELS` — not a change
to the generator, the spawner or the extraction logic. `resetRun(hero, levelId)`
is the seam; a level naming no `boss` simply opens its gate on quota.

Only **The Test Delve** exists so far, and it is labelled as such on the opening
banner. It deliberately rolls all five regions, because its job is to exercise
every environment the generator can build.

## The sundered geography

Each delve falls in one of the five regions from the map, and they generate
differently rather than merely differently coloured — corridor pitch, braiding,
chamber count and roughness all shift, and Vaelk is torn across by rifts with
single crossings:

| Region | Landmark | Character |
|---|---|---|
| Slag-Moors of Drak-Hald | The Weeping Keep of Tor-Varden | wide bays, ruined curtain wall |
| Rending Gorges of Vaelk | The Kael-Dorm Redoubt | long rifts, few crossings |
| Kraggen-Tor | The Shatter-Gate of Ghor | tight, rough, broken |
| The Rot-Weald | The Heart-Rot Clearing | dense, looping, no sightlines |
| The Dead Firth | The Ash-Shoals | open ground, drifting bars |

The ley-gate stands inside the region's landmark, so the objective is somewhere
rather than a circle on blank ground. Landmarks are built *after* the widening
and despeckle passes — those exist to remove one-cell walls, which is exactly
what a curtain wall is made of — and a reachability repair then proves the gate
can be walked to, cutting the shortest link only if it cannot.

The minimap compass points **south**. The realm's natural order has inverted —
one of the Final Signs — and the needle is drawn as it reads.

## The Gilded Deceiver

Reaching the slag quota does not open the gate. It draws Mal-Ghorath's avatar
to it, and he holds it shut.

His two lore properties are both mechanics. He offers **false salvation**, so
he splits into mirages — harmless, one hit each, and worth nothing. And he is
**identifiable by his shattered void-gem right eye**, so that gem is the tell
the mirages lack. Isaac, immune to the illusion, sees them faded and marked and
his auto-aim ignores them outright; Zayd has to read the eye.

He does not walk. A body that wide wedges on corners, and an avatar stepping
out of one place into another near you is both the fix and the character.

Auto-aim gives him priority while he is in reach. Nearest-target alone cannot
fight a boss: while he is escorted, every strike lands in the escort and he
takes nothing — measured at 100% health in 7 runs of 10 before the change.

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
- *Warden* — helm and crest, pauldrons, tabard, shield and raised blade. Drawn
  front-on and mirrored by heading rather than rotated with it: a human seen
  from directly overhead is a shoulders-and-hat blob, and every rotated attempt
  read as a face, because concentric round masses always do. The swing streak
  and the crescent carry the aim instead.
- *Wretch* — stooped, long-armed, dragging itself forward on sick green eyes
- *Shade* — hangs rather than stands; a hood over nothing, fraying into tatters
- *Revenant* — planted and over-armoured, held together by burning seams

Every figure is drawn front-on and mirrored by heading, never rotated, and each
has a distinct posture so they are told apart by silhouette before colour. That
also made them cheap: 220 straight copies a frame instead of 220 rotated blits.

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

Ten boons, most with stack caps, offered three at a time. Levels queue if
several are earned at once and are presented one at a time.

Four of them are shaped by the blade rather than by a projectile: **Long Reach**
carries the crescent further, **Broad Sweep** widens the swathe (measured at
66 → 97 units across at three stacks), **Twin Crescent** adds a second crescent
staggered behind the first, and **Swift Edge** speeds the arc. There is no
pierce boon — a crescent already cuts everything in its path.

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

Current curve, over 80 bot runs per hero: quota reached around **85 s**, median
run **105–115 s**, bot extracts **25/80 as Isaac (31%)** and **20/80 as Zayd
(25%)**. Zayd running harder is intended — he is the 92-life glass cannon. Spawn
rate more than doubles while the gate is being channelled; the last stand is the
intended climax.

Sixteen runs cannot tell 31% from 56% apart on this bot — the same tuning
returned 5/16 and then 9/16 — so tuning decisions here are made on 40-run
batches at minimum.

Moving from bolts to crescents made the game *easier*, not harder, despite reach
dropping by about a third: a bolt died on the first body it hit, where a crescent
cuts everything in its path. The crude bot's escape rate jumped from 1/10 to
7/10 before retuning. Width turned out to be a weak lever (13/16 → 11/16 across a
44% sweep cut); damage and cadence did the work.

Tuning constants are grouped at the top of section 1.

---

## Debug build

`debug.html` is a generated page: the shipped game plus an inspection panel.
Rebuild it after any change to the game with

    node tools/build-debug.js

Never edit `debug.html` by hand — edit `tools/debug-overlay.js` and rebuild, so
the debug build cannot drift from the release page. The overlay touches the game
only by wrapping global functions (`update`, `draw`, `hurtPlayer`, `damageEnemy`,
`spawnEnemy`, `resetRun`), which is why `index.html` carries no debug branches at
all: strip the injected `<script>` out of `debug.html` and what remains is
byte-identical to `index.html`.

**Panel** — tap the `D` button top-left, or press `` ` ``. It stays out of the way
while a menu is up so it can never swallow a tap meant for a hero or boon card;
tap `D` on the start screen to pin it there anyway when you want the seed box.

**Live stats** — fps, draw/update cost, whether `lowFx` has engaged, level,
region, hero, enemy/crescent/particle counts, prop and lamp counts, wall and edge
counts, slag against quota, boss health, active seed.

**Toggles** — `god`, `1-shot`, `no spawn`, `slow-mo` (0.35×), `flow` (BFS field
and its gradient), `hitboxes` (wall rects, enemy circles, player radius and
range), `force low` (pin reduced effects on, rather than waiting for the adaptive
sampler), `seeded`. Shortcuts: `g` god, `h` hitboxes, `f` flow.

**Actions** — `+25 slag`, `fill slag`, `to gate`, `summon boss`, `kill boss`,
`wipe horde`, `+50 horde`, `rank up`, `heal`, `remake map`, a jump button per
level, and a jump button per region so an encounter can be reached without
playing to it. The region buttons are rebuilt from `LEVEL.regions` whenever the
level changes, so they always show what the current level can actually roll.

**Seeds** — world generation is all `Math.random`, so the overlay swaps in a
seeded `mulberry32` around `resetRun`. Type a seed, press *use*, and the same map
comes back every time — note the seed, reproduce the bug. Turning `seeded` off
restores the real generator.

---

## Testing

No test framework is committed. Verification was done by driving the built
page in headless Chromium (Playwright) — state transitions, joystick deadzone
curve, auto-fire cadence, geometry embedding, frame cost at load, layout at
320/390/1440 px, and console errors. The bot simulation above runs the same way.
The debug build is verified the same way: panel visibility across menus, every
toggle and action, both world overlays, the region jumps, and seed reproducibility
(same seed → identical grid/wall/prop fingerprint; different seed → different).

Combat has its own harness (16 checks) covering the crescent's geometry and the
boons that reshape it: that a swing releases one, that it cuts a rank of three
abreast, that it spares what is behind and to the flank, that each body is cut
exactly once rather than ground down frame after frame, that it dies at the
blade's reach and not past it, and that each of the four blade boons measurably
changes the arc. Geometry checks cast along a fixed heading rather than going
through auto-aim, and the fixture demands a verified clear lane on a fixed seed —
letting auto-aim pick the target, or letting the map fall where it may, made
these tests report failures that were the harness's fault rather than the
game's.
