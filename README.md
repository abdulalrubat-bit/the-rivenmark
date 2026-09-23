# The Rivenmark

Mobile-first top-down survival prototype set in the Rivenmark, after the Aegis
shattered. No image assets and no network calls; every sprite in it is drawn
from paths in code.

Levels are a first-class structure (see below), so further levels with their
own maps and environments are data entries rather than a rewrite.

---

## One game, one engine

The game is the Phaser build in `phaser/`. It is what the APK carries and what
is deployed to the web. It is also the only build there is.

There used to be two. The game began as a single hand-written canvas 2D file,
`index.html`, and the Phaser build started as a port that lifted that file's
simulation out mechanically (`extract-core.js`). For a while both lived side
by side, and `npm run verify` proved they agreed. The canvas build could not
hold 60fps on a phone (20fps on an Adreno 840, against a locked 60 for
Phaser), so it has been retired:

- **The simulation** now lives in `phaser/src/core/core.js`. It is
  hand-edited, and it is the file you change to change how the game
  *behaves*. `phaser/tools/check-core.js` runs as part of every build and
  refuses a core that reaches for the page.
- **Everything drawn** lives in `phaser/src/`: the HUD, the menus, the delve.
- **The sprite forge** that drew every body and prop is kept as an art tool
  at `tools/forge/`. It is not part of the game. `tools/export-art.js` uses
  it to regenerate `art/`.
- **The four things only the old UI could do** were rebuilt as Phaser
  screens: the difficulty choice, kit presets, discarding from the vault,
  and looking in the bag mid-delve.

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

### Packs, not waves

The delve is **populated at generation time and cleared by walking into it**.
Nothing is pushed at the player on a timer; the only bodies that arrive mid-run
are the ones the Deceiver calls. A cleared room stays cleared.

`placePacks` scatters ~20 pack sites across the reachable floor, kept `PACK_APART`
(250) from each other and `PACK_SAFE` (430) from the spawn pocket — enforced on
each **body**, not on the site, since members scatter off-site and one drifting
back inside its own aggro radius would have the delve waking on you at spawn.
Packs lean on heavier archetypes the deeper they sit, and placement runs until
`PACK_SLAG` (132) is on the map against a quota of 100.

Difficulty comes from **depth, not the clock**. Waves used to ramp enemy health
with run time; a placed dungeon ramps it with distance from the spawn pocket
(`PACK_DEPTH_HP`).

### Waking

A body waits where the generator put it until one of three things happens: you
come inside its notice, you hit it, or a neighbour that already woke passes the
alarm along (`ALERT_R` 155, one `ALERT_DELAY` beat later, so a pack rouses in
sequence rather than snapping awake together).

Notice is **path distance, not line of sight** — `noticeDist` reads the BFS flow
field that already exists for pathing, so a pack one wall away stays deaf. Cheap
(one array read) and it stops the whole map hearing you through rock. Measured on
a live map: a body 132 units away by line, 680 by path, stays asleep.

Dormant bodies skip the seek and the separation pass entirely, which is most of
the per-enemy cost — so a delve holding ~110 placed bodies runs at the cost of
the handful actually awake.

- *Hollow-Thrall* — stooped, long-armed, dragging itself forward
- *Eclipse-Marked* — fast, hooded, fraying into tatters
- *Ghor-Breaker* — planted and over-armoured, held together by burning seams

## The menus

Three screens rather than one. The **gate-house** is the title: two ways in, and a
line telling you what is in the kit so it is not a door you must open to find out
whether anything is behind it. **Descend** opens the delve screen — who, where,
and how hard it bites, each a card with its selection state visible. **The Kit**
opens the same screen the in-delve bag uses.

That last one is the piece worth knowing about: the bag screen serves both the
bag you are carrying and the kit you keep between delves. A `gearCtx` says which,
so none of the rendering, comparison or equip logic is written twice, and the
menu shows real derived numbers by standing up a throwaway player wearing the
stash rather than touching the one in the delve.

## Difficulty

Harder ground pays better — the bargain the genre runs on. Threat scales enemy
health and damage; the loot rates scale how often gear falls and how often a
Regalia piece is among it.

| Delve | Threat | Loot | Regalia | Bot extracts (fresh, Isaac) |
|---|---|---|---|---|
| Harrowed | ×1.00 | ×0.85 | ×0.6 | 16/25 (64%) |
| Riven | ×1.42 | ×1.00 | ×1.0 | 13/40 (33%) |
| Sundered | ×1.95 | ×1.35 | ×1.8 | 6/25 (24%) |

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

## Rooms

A braided maze is uniform corridor and near-uniform chamber — nothing you would
recognise on the way back. `carveRooms` stamps 3–5 rooms per delve with a shape
you can name, each recording itself so the stain layer and the scenery pass can
dress it to match:

| Room | Shape | Reads as |
|---|---|---|
| Pillared hall | rectangle, pillars on a 3-cell grid | built rather than eroded; cover to break sightlines in a fight |
| Cistern | disc | standing water, dark pool with a dried-back rim, moss and grates |
| Barracks | rectangle, stub partition walls off one side | bunk rows; crates and barrels |
| Collapse | rectangle, scattered loose blocks | a caved-in ceiling; pale dust thrown out from the fall |

They are carved **after** the widening and despeckle passes — despeckle exists to
remove lone one-cell blocks, which is exactly what a hall's pillars are — and each
one cuts a corridor back toward the gate so no room generates stranded. Verified
over 12 delves: 0 unreachable.

## The floor

Tiled ground alone is noise at one density everywhere, so nothing draws the eye.
The **stain layer** is a single world-scale canvas baked once per delve at quarter
resolution, carrying everything that depends on the *layout* rather than the tile
grid: paths worn along the corridors (a cell walled on two or more sides is a
route, open chamber floor is not), damp banked at the foot of walls, broad dry and
damp zones, hard wear at the spawn pocket and the gate, and each room's signature
staining.

It costs one `drawImage` a frame, drawn with **`imageSmoothingEnabled = false`**.
Bilinear upscaling it to full screen measured **3.8 ms a frame** on the software
rasteriser — it is a whole-viewport resample — against roughly nothing for point
sampling, and the layer is nothing but soft gradients, so the two look the same.

## The walls

Merged wall rects are all axis-aligned, so the silhouette where rock meets floor
was an unbroken straight line and the map read as a tileset. A **rubble skirt** of
chipped, faceted stones is blitted along the foot of every fourth course, spilling
outward onto the floor. Which course gets rubble is chosen by **position hash, not
`Math.random`** — a per-frame roll makes the stones crawl. Every third measured
2.9 ms a frame in a busy corridor, which is a lot for a silhouette detail; a
quarter of the faces breaks the line just as well.

Faces are built per direction (`buildEdges` merges collinear runs), so where a
horizontal run meets a vertical one, **neither covers the corner square** and the
near-black wall interior showed through as a notch — which reads as a hole in the
masonry rather than as a join. Each course run is therefore laid past both of its
ends. The overhang lands on the perpendicular face's own dressed band and never on
open floor, because a wall that ends has a face there too.

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

The minimap sits **top-right, under the HUD bar**. The bottom corners are where
the thumbs live on a phone, so a map there is under a hand for most of a run;
it also scales with viewport width (96–132px) instead of sitting at a fixed
94px, because the whole 2000-unit world squeezed into that was too small to
read a corridor from.

Its compass points **south**. The realm's natural order has inverted — one of
the Final Signs — and the needle is drawn as it reads.

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

## The repository

| Path | What it is |
|---|---|
| `phaser/` | **The game.** `src/` is everything drawn, `src/core/core.js` is the simulation (hand-edited), `public/` is what is served. `phaser/README.md` has its own commands. |
| `tools/suites/` | The rules suites. `node tools/run-suites.js` builds the game and runs them all. See *Testing*. |
| `tools/forge/` | The sprite forge, as an art tool: `forge.html` draws every forged sprite. Not shipped. |
| `art/` | Generated by `tools/export-art.js` from the forge: every forged sprite as PNGs, which `phaser/tools/pack-atlas.js` packs into the atlas. See `art/README.md`. |
| `docs/compendium.html` | A world-building reference: the fiction, the five regions, the bestiary, the Deceiver's epithets, the Regalia, and the named-but-unexplained ground left open. |
| `docs/ROADMAP.md` | The road to 1.0, worked top to bottom. |
| `assets/` | Source sheets, cut into the core and the forge by `tools/build-art.py`. **Licence unconfirmed**. See below. |
| `fonts/` | The licence for the display face. |
| `android/` | Gradle + WebView shell. `android/sync-assets.js` runs the Phaser deploy and bundles THAT into the APK. |

### Generated artefacts, and what rebuilds them

Half this tree is generated, and a generated file is only safe if the thing
that **consumes** it also **rebuilds** it. Anything else is a step someone has
to remember, and a step someone has to remember is a build that is one day
stale with nothing to say so. That failure is quiet by construction: the file
is there, it parses, the suites go green against it, and the first sign of
trouble is a device you cannot reach running rules that no longer exist.

It is not a hypothetical. Three of these were open at once, and all three
would have shipped:

| Artefact | Generated by | Rebuilt before use by |
|---|---|---|
| `phaser/public/core.js` | copied from `src/core/`, after `check-core.js` passes it | `phaser/tools/build.js` |
| `phaser/public/bundle.js` | `phaser/tools/build.js` (esbuild) | `build-once.cjs`, i.e. every smoke suite; `deploy.js` |
| `phaser/public/atlas.png`, `atlas.json`, `manifest.json` | `phaser/tools/pack-atlas.js` | `phaser/tools/deploy.js`, `smoke-art.cjs` |
| `android/app/src/main/assets/` | `android/sync-assets.js` | Gradle's `syncGameAssets`, which `preBuild` depends on |
| `<site>/rivenmark/` | `phaser/tools/deploy.js` | — it *is* the deploy; it builds and packs first |

**What was wrong.** The extraction that made the Phaser core from the canvas
build was run by nothing at all. It was `npm run core`, by hand, so an edit
that nobody followed with that command left the web build, the APK and every
smoke suite running the *previous* rules while reporting green against the
new ones. (The extraction is gone now, and the core is edited directly.)
`deploy.js` checked the atlas *existed* rather than packing it, which cannot
catch an atlas older than `art/`. And nothing made Gradle run
`sync-assets.js`, so `assembleRelease` packaged whatever was sitting in a
gitignored directory. When this was written, that was a `core.js` still
carrying auto-fire the game had already deleted.

**What is deliberately still manual**, because the generator needs something
the build cannot assume:

- **`art/`** — `tools/export-art.js` needs Chromium to re-forge the sprites
  from `tools/forge/`. It is committed, so a clean clone can pack an atlas
  without it; re-run it by hand when the forge code changes.
- **The cut sheets** in the core and the forge. `tools/build-art.py` is an
  authoring step, not a build step.
- **`phaser/public/icon-*.png`** — `make-icons.js` draws them by arithmetic,
  they are committed, and they change only when the mark does.

### The display face

Headings are set in **Cinzel** by Natanael Gama — cut from first-century Roman
inscriptions, the same well Friz Quadrata was drawn from. One variable file
covering weights 400–900. The canvas build embedded it as a data URI. The
Phaser menus do not use it yet and fall back to Georgia; bringing it back is
on the roadmap.

It is under the **SIL Open Font License 1.1**, which permits embedding and
redistribution — including inside the APK — so unlike `assets/` there is
nothing here to resolve. Copyright 2020 The Cinzel Project Authors. The full
licence travels with the repository at `fonts/OFL-Cinzel.txt`, as the OFL
requires.

Body copy stays a system serif: Cinzel has no true lowercase, and prose set in
it is unreadable.

### A note on `assets/`

The sheets in `assets/` came from royalty-free art packs, confirmed by the
project owner as cleared for redistribution. This repository builds an APK,
which is redistribution, so that clearance is what the build rests on.

Keep the pack licences and their terms somewhere in the repo as this grows —
"royalty-free" covers a range of terms, and some packs still ask for
attribution or forbid resale of the assets as assets. Nothing here needs it
today; a future contributor will.

Nothing in `art/` is affected either way: it exports only the code-drawn
sprites, and the handful of things that have a sheet-backed version export
their forged fallback instead.

---

## Architecture

This is the shape of `phaser/src/core/core.js`, the simulation. It kept the
section order of the canvas file it was cut from:

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
joystick handler. The Phaser build made the same choice for the same reasons,
which is why `phaser/src/hud.js` and `phaser/src/screens.js` are DOM as well;
sections 9 and 10 here are the two the port did NOT take wholesale, and they
are the two that have since diverged.

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

### Gear

Power comes from two places that stack: **boons**, chosen on rank-up and fixed
for the run, and **gear**, found on the floor and swapped freely.

Eight slots — blade, off-hand, mail, girdle, boots, amulet, two rings. No helm:
the compendium is explicit that the Clear-Sighted fight unhelmeted, so there is
nowhere to put one.

Five rarities (Worn, Tempered, Spirit-wrought, Hallowed, Riven) carrying one to
five affixes. Both the rarity roll and the affix rolls scale with how deep the
body was standing when it died, so pushing further in is what pays — a deep drop
is *better*, not merely more likely. Affixes are restricted per slot, so a blade
rolls like a blade.

**Nothing accumulates on the player.** Gear comes off as easily as it goes on, so
every derived stat is rebuilt from the hero's base by `recomputeStats`: base,
then boons re-applied from their tally, then gear — additive terms first, then
multiplicative, so the order two items were equipped in cannot change the result.
Current life is preserved and only clamped, or swapping a +life item would be a
free heal. This is the invariant most likely to rot, so it is the one the harness
leans on hardest: removing all gear must return *exactly* to base, equip order
must not matter, and recompute must be idempotent.

`ward` is the one new stat — flat damage reduction, capped at 75% so a full kit
of it can never reach immunity.

### Line of sight

Rock stops a crescent, so a body with a wall in the way is **not a target at all**
— the blade holds rather than swinging at stone. `clearShot` samples the line at
14-unit steps, which nothing thinner than half a cell can hide between, and runs
only for bodies already inside reach.

An earlier version kept blocked bodies as a fallback "once nothing clear is left",
which is precisely the case where the player is behind cover and every swing goes
into rock for nothing. Holding costs nothing: `fireTimer` is only consumed on a
swing that happens, so the blade answers the instant a target steps clear.

Measured over 1,566 vantage points across six delves, **8%** had a body in reach
but none with a clear line — low enough that the blade rarely goes quiet, and
those are exactly the moments where a swing would have been wasted anyway.

### The Sundered Regalia

One mythic set, eight pieces, one per slot, with fixed better-than-random affixes
and bonuses at 2/4/6/8 worn — the last granting a second crescent with every
strike. Pieces drop **only from champions and the Deceiver**, never from the
ordinary table, so the set is a reason to fight the thing you could have walked
past. Set bonuses ride into `recomputeStats` on the same additive/multiplicative
piles as affixes, so they cannot be applied twice or in the wrong order.

### Champions

Some packs are led by an **elite**: 2.6× health, harder hitting, slower, bigger,
worth four times the slag, and ringed with a lit void-brand so you can see what
you have walked into. They are where the good gear is — 85% drop chance against a
thrall's 5.5%, with a quality floor so a champion never hands you rags.

A champion is bodily bigger than the body it was promoted from, which is a trap:
the spot was chosen for the smaller radius, so growing it blind can wedge the
elite in rock it used to fit through. The size is taken only if the ground still
takes it.

### Drops, and finding them

Gear on the floor stands under a **beacon** — a shaft of light whose height and
colour follow rarity, from a low grey glow for Worn to a tall red one for a
Regalia piece. A lozenge alone is a few pixels in a dark room full of debris and
goes straight past you; the shaft is what carries across a chamber, and it says
what the thing is worth before you cross the room for it.

### The bag

The bag button pauses the delve and opens a full screen: worn slots and derived
stats down one side, a 20-cell bag on the other. There is **no drag-and-drop** —
on a phone that is a fight with the touch target. Selection is a tap, equipping
is a second tap on a button big enough to hit, and anything selected in the bag
is shown measured **per stat** against whatever is in its slot already, because
"is this better" is the only question the screen exists to answer.

A full bag leaves the item on the floor rather than binning it silently, and says
so once rather than on every frame it is touched.

### The stash

Gear outlives a delve, but only what you carried out:

| | Equipped | Bag |
|---|---|---|
| Extract | kept | **kept** |
| Die | kept | **lost where you fell** |

Losing the kit off your back to one bad tap would make every delve a decision
about whether to risk playing at all, so what is worn always survives; the bag is
what the gate is for.

The stash is `localStorage`, and everything read back is **filtered, not
trusted** — a save may predate a change to the slots, the rarities or the affix
table. `validItem` checks every field and a corrupt save is discarded rather than
obeyed. Verified by feeding the game a deliberately malformed save: it boots to a
clean stash instead of breaking.

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

## Scenery

Props arrive in **knots**, not scatter. An independent roll per cell produces an
even sprinkle however it is weighted, because that is what it is — so the per-cell
pass is now thin background texture only (cracks, moss, loose rubble), and the
loud objects come from `scatterKnots`, which seeds clusters where debris would
actually collect: jammed into dead ends (a cell walled on three sides), banked
into corners, and dressed through each room to match what it was. Roughly 590
props a delve, and the middle of a chamber stays clear so a fight reads.

## Balance

Tuned against a scripted bot playing full runs headless — flees crowding,
drifts toward loot, beelines the portal once it powers up. It is a deliberately
mediocre player, so its results are a floor, not a ceiling.

Current curve on **Riven**, from an empty stash, over 40 bot runs per hero:
median run **57 s**, ~60 kills, 10 items found and 6/8 slots filled by the end,
bot extracts **13/40 as Isaac (33%)** and **17/40 as Zayd (43%)**.

**Persistence broke the old measurement, and that is worth stating plainly.**
Once gear carries between delves, runs in one session stop being independent
samples: by the fifth the bot is a kitted veteran, and the number describes a
different game from the one a new player meets. Measured with the stash carried
forward, Isaac extracts **33/40 (83%)** with all eight slots filled and a 40 s
median. Both numbers are real; they just answer different questions, so the
harness wipes the stash between runs by default and keeps it only when the geared
case is what is being asked about.

Enforcing line of sight made the game harder, as it should: you can no longer
damage anything through a wall. It cost roughly 2 points for Isaac and 15 for
Zayd, along with a third of the kills and half the loot found, so `LEVEL.threat`
came down from 1.45 to 1.42 to meet it.

**Threat responds steeply.** 1.45 put the bot at 28%/20% and 1.28 at 68%/50% — a
40-point swing for a 12% change — because gear snowballs: survive the first packs,
get kitted, and the rest follows. Anything in 1.38–1.45 is "roughly a third", and
40-run samples carry about ±7 points of noise, so chasing a tighter number than
that would be measuring the sampler rather than the game. The bot wears what it finds — a greedy per-slot score —
because a measurement that ignores gear says nothing about a game where gear is
half the power.

Gear is a large power budget: switching it from inert to live moved the bot from
43% to 60%. That was met by **raising the opposition** (`LEVEL.threat`, 1.45)
rather than by nerfing the loot, which would defeat the point of the loot.
Affix magnitude turned out to be a weak lever — 1.0, 0.6 and 0.4 all landed
within noise of each other — so it stays at 1.0 and threat does the work.

**Quota is the difficulty lever, not enemy health.** The depth health ramp scales
the fragile hero far harder than the tank — measured twice, before and after the
rooms went in: at 0.55, Zayd 3/30 against Isaac 14/40; at 0.65, Zayd 7/40 against
Isaac 15/40. Quota moves both together, so the ramp stays at 0.30 and the quota
does the work. It sits at 125 against the ~185 slag the generator places, about a
two-thirds clear.

Adding rooms made the delve **easier** (Isaac 35% → 53%) — open ground and pillar
cover both favour the player — which is why the quota went up with them.

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

## Debugging

The canvas build had a debug page, `debug.html`, with god mode, seeds and
jump-to-region buttons. It went with that build. What the Phaser build has:

- **The diagnostics dump.** The *copy diagnostics* button puts fps,
  frame costs, the governor's state and the run on the clipboard.
- **The layer profiler.** `profile`, next to it, switches each drawing layer
  off in turn and measures the delivered frame. `phaser/README.md` explains
  how to read it, and `npm run smoke:prof` proves it can find a planted cost.
- **URL flags.** `?nogate` drops straight into a delve. `?nogov` holds the
  effects governor off. `?norun` leaves the world ungenerated, to isolate
  where a frame goes.
- **The core, from the console.** Everything in `core.js` is a global, so
  `player.hp = 1e9` or `resetRun('zayd', LEVELS[3].id)` works from DevTools.

A proper dev panel for the Phaser build is on the roadmap.

---

## Android

`android/` wraps the game in a WebView and packages it as a debug APK.

**The APK carries the Phaser build**, and on a phone that difference is the
whole story. Measured in the APK on a Galaxy S26 Ultra (Adreno 840), fullscreen
at 1080x2340, 130 bodies: the canvas build ran at **20fps, worst frame 118ms,
99% of frames over budget and its effects already shed**; the Phaser build
holds **60fps, p99 16.8ms, 0% over budget, atmosphere at full**, with the
frame governor never once needing to fire and a layer profiler that cannot
find anything worth removing.

    cd android && gradle assembleDebug
    # -> app/build/outputs/apk/debug/app-debug.apk

That is the whole command. `sync-assets.js` empties `assets/` and runs
`phaser/tools/deploy.js`, which packs the atlas and builds first, always — so
the APK cannot ship a stale page, and cannot ship a leftover from the build it
used to carry. The whole folder is gitignored for the same reason it always
was: it is generated.

It used to be run by hand, ahead of Gradle, and that is a step to forget. The
`syncGameAssets` task runs it now and `preBuild` depends on it, so there is no
order to get right and no way to package a directory nobody rebuilt. Two
escape hatches, both of which you have to type: `-Privenmark.node=<path>` if
Node is not on `PATH`, and `-Privenmark.skipAssetSync=true` to iterate on the
Java shell without it — which says plainly in the log that the APK carries
whatever was already there.

**The page is served, not opened.** It used to load straight off
`file:///android_asset/index.html`, which worked while the game was one
self-contained HTML file. The Phaser build fetches `atlas.json` and
`manifest.json`, and XHR from a `file://` origin is refused by every current
WebView — `setAllowFileAccessFromFileURLs` was the old way round that and is
ignored on modern ones. `WebViewAssetLoader` serves the same assets over
`https://appassets.androidplatform.net` instead, which fixes the fetches and
gives three things with them: a secure context, so the clipboard works for the
diagnostics dump; a stable origin for the stash in `localStorage`; and no
`file://` access to grant at all.

The APK is **not committed** either. `.github/workflows/android-debug.yml` builds
it on every push and uploads it as an artifact, and asserts along the way that
EVERY asset inside the APK hashes identically to what `sync-assets.js` built
from source — a green build is therefore evidence the APK matches its source,
which a binary in git could never be. File for file, because checking only
`index.html` would pass an APK with a stale bundle or no atlas in it at all.

### The release bundle

Play stores an **app bundle** and generates the APKs devices download, so an
`.aab` is the only artefact the console takes for a release.
`.github/workflows/android-release.yml` builds one — by hand from the Actions
tab, or off a `v*` tag. Not on push: a bundle is uploaded once under a
`versionCode` that can never be reused.

    cd android && gradle :app:bundleRelease       -Privenmark.versionCode=1001       -Privenmark.keystore=/path/to/rivenmark.jks       -Privenmark.storePassword=… -Privenmark.keyAlias=… -Privenmark.keyPassword=…
    # -> app/build/outputs/bundle/release/app-release.aab

`versionCode` and `versionName` are properties with defaults in `build.gradle`,
because Play accepts a `versionCode` exactly once and refuses a repeat *after*
the upload — a number hard-coded in the file means a commit per release whose
only purpose is incrementing an integer. CI defaults to `1000 + run_number`.

**CI needs four secrets**, and the key never reaches the workspace — it is
decoded to `$RUNNER_TEMP`, checked with `keytool` before Gradle sees it, and
shredded in an `always()` step, so no glob and no artefact upload can carry it
out and a failed build does not leave it behind:

| secret | what |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 rivenmark.jks` |
| `KEYSTORE_PASSWORD` | the store password |
| `KEY_ALIAS` | the key alias |
| `KEY_PASSWORD` | the key password |

> **The workflow checks the bundle is signed, and that check is not the obvious
> one.** With no key, `build.gradle` leaves the bundle unsigned rather than
> falling back to the debug key — and an unsigned bundle comes out under the
> *same filename*, `app-release.aab`, so the name says nothing. Measured on
> this repo's own output: `jarsigner -verify` **exits 0 for both**, printing
> "jar verified." for one and "no manifest." for the other, so its exit status
> is not a gate; and `-strict` exits 4 on a perfectly good self-signed release
> key, so that is not a gate either. What separates them is the signature
> block — two `META-INF/*.SF`/`*.RSA` entries when signed, none when not — so
> that is what the workflow tests, together with jarsigner's actual verdict
> text. A missing secret fails the build unless you tick `allow_unsigned`.

The bundle's assets are verified the same way the APK's are, at `base/assets/`
rather than `assets/`, and the `versionCode` that reached the merged manifest is
read back and compared — a mistyped property would otherwise ship the default
and Play would reject the upload for a reason pointing at the wrong thing.

What the shell has to get right:

- **Edge to edge.** The page is authored `viewport-fit=cover` and reads
  `env(safe-area-inset-*)` to keep the HUD and minimap clear of a notch. Those
  resolve to zero unless the app draws behind the system bars, so
  `setDecorFitsSystemWindows(false)` is what makes the game's own safe-area
  handling mean anything.
- **DOM storage on**, or the best-delve record cannot persist.
- **Text zoom pinned to 100%**, or the system font scale resizes the UI.
- **Long-press swallowed**, or text selection fires mid-fight.
- **Losing focus pauses the run**, rather than leaving the Vanguard standing in
  a crowd.
- **Back pauses a run but still exits** from a menu — pausing unconditionally
  leaves the home button as the only way out of the app.

Debug specifics: package `com.rivenmark.game.debug`, `minSdk 24`, `targetSdk 34`,
signed with the standard Android debug key, and `setWebContentsDebuggingEnabled`
so `chrome://inspect` can attach. **No permissions are requested** — the game
makes no network calls and needs none.

---

## New art

`art/SPEC.md` is generated by `node tools/art-spec.js` and is the document to
draw to or check a pack against: every frame the game loads, measured from the
file itself so it cannot drift, with the bestiary's radius, role and colour
beside it so the art can say what a thing is before it hits you.

Replacements go in **`art-custom/`**, mirroring `art/`'s folders and frame
names, and win over the forged art of the same name. Frame by frame, on
purpose: replacing 244 frames before anything renders is not a project anyone
finishes, so one authored thrall means a delve with one authored thrall in it
and 243 forged ones, still running.

Any resolution. `pack-atlas.js` records each replacement's ratio to the frame
it replaces into `manifest.frame_scale`, and the game divides by it, so a 4×
thrall occupies exactly the world space the 2× one did. The packer also names
any replacement that changes SHAPE rather than just resolution — the game
positions by centre and sorts by foot, so a different aspect ratio does not sit
where the old frame sat.

`npm run smoke:art` proves the whole path: it plants a deliberately 4× frame,
repacks, and asserts it draws at the size of the 2× one it replaced while the
forged frames around it are untouched — then removes it and checks the forged
art comes back.

## Testing

    node tools/run-suites.js            # all of them
    node tools/run-suites.js eco gait   # only these

The rules suites live in `tools/suites/`. `run-suites.js` builds the game,
serves `phaser/public/`, and drives it in headless Chromium. Each suite asks
for one of two pages through `tools/suites/_pages.js`:

- `core()` is `core-test.html`: the core alone, with no Phaser. Used by
  suites that assert rules (the horde ramp, the roles and packs, the bosses,
  the loop, the economy).
- `game(q)` is the game itself. Used by suites that need a screen: the forge,
  the vendor, the hall, the gate-house, the bag.

The Phaser build's own smoke suites (`npm run smoke:*` in `phaser/`) measure
what is drawn: the camera, the HUD's layout, the effects, the atlas.

They lived in a scratch directory under `/tmp` until recently, which is one
container restart from gone. Moving them in immediately caught a regression:
`combat3` still asserted that `lowFx` suppressed damage numbers, a rule
deliberately changed when the frame governor started setting that flag for
real.

DESKTOP ONLY: Playwright does not run under Termux. The game does; its tests
do not, and that is the one seam in this project between what the phone can do
and what it cannot.

Verification beyond the suites was done the same way, by driving the built
page in headless Chromium (Playwright) — state transitions, joystick deadzone
curve, auto-fire cadence, geometry embedding, frame cost at load, layout at
320/390/1440 px, and console errors. The bot simulation above runs the same way.
Combat has its own harness (21 checks) covering the crescent's geometry and the
boons that reshape it: that a swing releases one, that it cuts a rank of three
abreast, that it spares what is behind and to the flank, that each body is cut
exactly once rather than ground down frame after frame, that it dies at the
blade's reach and not past it, and that each of the four blade boons measurably
changes the arc. Geometry checks cast along a fixed heading rather than going
through auto-aim, and the fixture demands a verified clear lane on a fixed seed —
letting auto-aim pick the target, or letting the map fall where it may, made
these tests report failures that were the harness's fault rather than the
game's.
