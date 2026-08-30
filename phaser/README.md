# phaser/

The Rivenmark, moving from hand-written canvas 2D to Phaser — developed
on-device under Termux.

**This is a proving ground, not the game yet.** What runs today is one scene
that loads the real art, animates every kind, and reports its own frame cost.
It exists to settle two questions before nine thousand lines get moved, and
both are now settled — see *Where it stands*.

## Why move at all

The canvas build draws every body with its own `drawImage`, and the cost of a
frame is per-call, not per-pixel: measured on a software rasteriser, 158 wall
tiles cost 4.5ms while a single blit of a 1548×2456 image cost nothing
measurable. A GPU renderer batches draws that share a texture, which is the
one thing hand-written canvas 2D cannot be made to do.

That is the whole argument. Everything else Phaser offers — scenes, tweens,
input, physics — this game already has, written to fit it.

## What actually has to be rewritten

Less than it looks. Measured against `../index.html`, 13,601 lines:

| | lines | moves across |
|---|---:|---|
| Config, data, tuning tables | ~950 | as-is |
| Math, spatial hash, world generation | ~880 | as-is |
| Collision, entities, spawning, the kit | ~1,960 | as-is |
| Input, simulation | ~1,290 | as-is |
| **Rendering — `draw*` / `forge*`** | **~3,990** | **rewritten** |
| DOM UI, menus, the loop | ~2,400 | mostly as-is; it is already DOM over the canvas |

The split is clean because it was already clean: **every `ctx.` reference in
the entire game lives inside a function named `draw*`, `forge*` or `paint*`.**
The simulation section contains none at all, nor does world generation, nor
input. The game logic never learned what it was being drawn with, so it does
not have to unlearn it.

## Where it stands

Done, and verified by `phasersmoke.js`:

- **`art/` drives Phaser directly.** 226 frames packed into one 2048×1501
  atlas, all eleven bestiary kinds plus both heroes animating on their
  eight-pose gait, no art re-drawn.
- **It runs on WebGL**, and holds a 16.7ms median frame at 300 bodies — on a
  *software* GL rasteriser, where the canvas build was labouring at 54. A
  phone GPU is the real test, but the direction is not in doubt.

**It is playable.** The delve draws — walls, scenery, the horde and the hero,
off the core's own state, at 60fps with a ~19ms one-off bake. The stick moves
the hero, the kit casts, the HUD reads the run.

| | |
|---|---|
| `npm run smoke:delve` | 14 checks — the world draws and is dressed, the gait is distance-driven |
| `npm run smoke:world` | 18 checks — the waygate, the coffers, the slag, the beacons |
| `npm run smoke:overlay` | 22 checks — the map, the arrow out, the boss bar, the crystal |
| `npm run smoke:air` | 19 checks — light, haze, ash, the dark, and the governor |
| `npm run smoke:prof` | 10 checks — the layer profiler finds a planted cost |
| `npm run smoke:pwa` | 13 checks — installable, and it opens with the network cut |
| `npm run smoke:play` | 16 checks — the stick, the kit, and the HUD's layout |
| `npm run smoke:fx` | 16 checks — the fight reads, the crescent and the tells in pixels |
| `npm run smoke:loop` | 15 checks — dying, the outcome, the gate-house, descending again |
| `npm run smoke:forge` | 13 checks — equipping, and that worn gear reaches the hero |
| `npm run smoke:spend` | 13 checks — the vendor and the hall, and that coin buys what it says |
| `npm run smoke` | 13 checks — the proving scene and the diagnostics dump |
| `npm run verify` | the canvas suites against the extracted core |

One thing never sheds, and the numbers are the second: `floatDmg` and
`floatWord` used to bail on `lowFx` too, which was invisible for as long as
nothing set the flag. The governor sets it for real, and the first thing it did
was take every damage number off the screen on exactly the device that needed
them most. A number is information — the whole ranked-floater hierarchy exists
so a scratch reads differently from a heavy landing — and it costs nothing
worth having: floaters are capped at 22, merged on the way in, and pooled Text
objects here.

Each suite builds `public/bundle.js` before it serves it. That is not a
convenience. The suites serve a build artefact, nothing rebuilt it, and so for
a while every one of them was testing whatever bundle happened to be on disk.
It surfaced when a deliberate stub — a `return` at the top of the culling pass,
put there to prove the culling assertions could fail — changed nothing at all:
the browser never saw the edit. A test that cannot see your change cannot fail
on it, and a suite that green-lights a stub is worse than no suite.

The build also copies `src/core/core.js` to `public/core.js`, which the page
actually loads. That was a hand copy, and a hand copy that is forgotten leaves
the game running the previous core with nothing to say so — the same hazard,
and worse: a stale bundle is stale presentation, a stale core is stale rules.

The HUD is DOM over the canvas, as it is in the canvas build: text stays crisp
at any dpr without a font atlas, a button is a real 44px touch target, and none
of it goes down with the renderer. The game is what needs the GPU; a life bar
does not.

The fight reads: crescents, sparks, rings, ranked damage numbers, and the
telegraphs that matter in play — hazards, Null-Zones, totems, ruptures and
slam wind-ups. All of it is drawn from the core's own pools, because most of
it is not decoration: a hazard burns, a pool slows, a slam telegraph is the
only warning you get.

The loop closes: a run ends, the outcome says what happened, the gate-house
takes you back, and you descend again. Every word of the outcome is written by
the core's own endRun — the host reads it back out of the store it gives the
core rather than writing the same sentences twice.

The Forge equips what the delve drops, and it reaches the hero: a blade with
a damage affix takes him from 43.8 to 55.8 before he descends.

The Vendor and the Hall spend it: commissions, tempers, reliquaries, and four
stations of three tiers that outlast every delve. Prices come from the core,
so the number on the button is the number that will be taken.

The room has weather. Torches light the stone around them, haze drifts against
the camera, ash hangs in the air, a vignette closes the frame down to what the
Vanguard's own light reaches, and the Riftborn takes even that. Phaser has no
gradients, so the three this needs — a light blob, a fog tile, a vignette — are
baked once into canvas textures at boot and then drawn as ordinary images. A
gradient rasterised once is free; a gradient built per frame is what made the
canvas build slow.

**And a profiler, so the two builds can be compared.** `profile`, next to
*copy diagnostics*, ablates each layer in turn — walls, dressing, scenery,
bodies, pickups, gate, fx, beacons, numbers, overlay, fog, motes, vignette,
light — and reports the median delivered frame with each one switched off. The
canvas build has the same thing in `tools/debug-overlay.js`, deliberately with
the same method, statistics and report shape, so a profile taken from each on
the SAME phone reads side by side. That comparison is the only thing that can
say whether moving engines bought anything.

Ablation, because no clock in the process can see rasterising — the same
finding as the governor below. Vsync clamps the result from underneath, so a
layer big enough to reach the refresh ceiling alone has its saving cut off and
is marked `>=`; the noise band comes from the drift between two baselines
rather than being picked. `smoke:prof` plants a known cost in one layer and
asserts the profile names that layer and clears the other twelve.

The dump says whether the mood was ON for the numbers beside it. It did not,
and that was the one omission that could invert a reading: 60fps at full
effects and 60fps with the atmosphere already shed are different findings
about the same number. `effects` now reports `full` or `LOW (mood shed)`, how
many times the governor dropped and restored this session, and its last
sample.

**And the governor that takes it away.** The port had none: `lowFx` is read all
over — by the atmosphere, and by the core's own budgets — and nothing ever set
it, so a device that could not hold the frame simply did not. Measured here,
the atmosphere took this box from 60fps to 30 with `lowFx` false throughout.

It watches two things, because either alone is blind to half the ways a frame
goes wrong. CPU work, timed from the top of update to POST_RENDER — which under
canvas 2D was the whole story, since the rasteriser *is* the CPU. And delivered
intervals, because under WebGL it is not: the atmosphere moved CPU work from
2.56ms to 2.84ms while halving the frame rate. The cost was entirely fill rate.
The driver takes the calls and returns; the bill arrives at the swap, where no
CPU timer can see it.

Intervals have their own trap and the canvas build fell in it: a display is
vsync-locked, so 16.7ms means "keeping up" and nothing about by how much. The
old code compared against a fixed 11ms — 90fps, unreachable on 60Hz hardware —
so once the glow came off it never went back on. Here everything is judged
against **the display's own period**, the tenth percentile of a long window,
which reads the same at 60, 90 and 120Hz. That is capped at 17ms, and the cap
is the whole thing working: learned purely from observation it is circular, and
with the atmosphere on this box never once beat 33.3ms, so the governor
concluded the screen ran at 30Hz and was being hit perfectly — while sitting at
half frame rate.

Restoring costs about 40% more per frame, so it needs several good windows, and
the number of them **grows** each time a restore is followed by another drop. A
device that genuinely cannot afford the mood stops being asked every three
quarters of a second whether it has changed its mind.

One thing never sheds: the light pass. Without it the tunnels read as flat
black and a torch is a sprite of a torch that lights nothing.

The Deceiver's encounter reads. A Lieutenant's agony winds as a cone on the
floor that brightens as it comes, and his siphon runs to his master as a
crawling dashed line with its own bar over his head, because that is the one
you are meant to reach in time. The False Dawn hangs under the map as a column
of light in a flawed crystal — placed by the core's own `dawnCrystalRect()`,
which reads `minimapBox()`, so the two cannot drift apart the way they did once
in the canvas build — restless at the surface, and past four fifths the rim
stops being trim and starts flashing. Zayd's lance draws the line it cut.

Phaser's Graphics has no gradients, so every gradient in the port is banded:
the crystal's glass, the beacons' shafts, the agony cone. That is what a
gradient is once it is rasterised, and at these sizes the banding is invisible
while the cost is a handful of quads instead of a texture upload a frame.

You can tell where you are. The map plots the rock, whatever has noticed you
— and nothing that has not, because plotting every dormant body hands over the
location of every pack before you set out — the coffers until they are opened,
the invader always, and your own corpse always. An arrow rides the edge of the
play area when the waygate is off screen, and the compass points south, which
is one of the Final Signs and drawn as it reads rather than as it ought to.

The boss bar names whoever owns the frame and says when the Deceiver is held,
so a bar that will not move reads as a fight with an order to it rather than
as a bug. The map steps down out from under it — `bossBarDrop()` is the one
answer both read, and the toast reads it too. The delve names itself again on
the way in: the port only ever looked at `run.bannerText`, which is empty on
the opening banner, so it opened a delve and said nothing.

The delve is navigable. The waygate is drawn dormant and lit, its rune ring
turning against its sigil and the channel closing round the kerb as you stand
in it; coffers open; slag lies on the floor; a drop and your own corpse each
throw a shaft of light, and a drop's height is its rarity, which is how you
know from across a room whether it is worth the walk.

Bodies sort by y and so does the hero — at a fixed depth he drew through
everything standing in front of him — and so does anything standing: a barrel
is something you walk behind, while rubble is something you walk over. Every
one of them casts a shadow, all thrown the same way, off the core's own LIGHT.

The walls wear their stone. The coursed ashlar was procedural canvas art, so
the forge output is exported into the atlas — six lit top faces and three
courses in each of four orientations — and the delve lays them with the canvas
build's own cell hash, then steps courses along every exposed face, stretching
each to exactly one step so they butt with no seam.

That dressing costs about 1700 images, and Phaser does not cull ordinary game
objects: every one of them was submitted every frame. Measured, that took p90
from 16.7ms to 33.3ms with a quarter of frames over budget. Visibility is now
set by hand against the camera, recomputed only when the camera has moved far
enough to change the answer, which puts p90 back to 16.7ms and over-budget
frames to 1%. `smoke-delve` asserts both halves — that the stone is there, and
that most of it is switched off — because either one passes while the other is
broken.

## Getting it onto a phone

`npm run deploy <dir>` copies the thirteen files a player actually needs into a
directory something else serves, and nothing else — not the 11MB source map,
not the core-test harness. It builds first, always: every hard lesson in this
folder is the same one, and a stale deploy is the worst of them because it
lands on a device you cannot reach and gives no sign at all.

What lands is an installable app. `app.webmanifest` and `sw.js` make it one:
add it to the home screen and it opens fullscreen, in portrait, with no browser
chrome — and it opens **with no network**, because the service worker holds the
whole 3.4MB shell. That is the difference between a game and a web page: the
atlas alone is 1.6MB, and fetching it over a phone connection every launch is
felt every single time.

The worker's cache key is a hash of the content being shipped, stamped by the
deploy step. A key bumped by hand is a key someone forgets, and a forgotten one
leaves an installed player on an old build for ever — their browser keeps
serving the cached shell and never asks. Same class of mistake as the stale
bundle and the stale core, with the longest blast radius of the three.

`smoke:pwa` deploys to a temp directory, serves *that*, installs the worker,
then cuts the network and reloads. Everything else about a PWA can pass while
that fails, and it fails on a train rather than at a desk.

The icons are drawn in arithmetic — pure pngjs, no browser — so they can be
regenerated under Termux like everything else here. The mark is the crescent,
because it is the whole of the hero's attack and the one shape a player of this
game would know at 48 pixels. The first cut of it was the difference of two
circles, which is a lune: a fat moon, exactly what the comment above it warned
against. It is a thin tapering band now, the way the game draws it.

An APK is a separate step and not done: a Trusted Web Activity wraps this
manifest, but the wrapping needs an Android SDK.

## On the phone

```sh
pkg install -y git
git clone <this repo> && cd <repo>/phaser
./tools/termux-setup.sh
npm run dev
```

Then open `http://localhost:8080`.

Serve it rather than opening the file — a WebGL context over `file://` is
refused on some Android WebView builds, and that failure presents as a black
screen rather than as an error.

| | |
|---|---|
| `npm run dev` | rebuild on save + serve on 8080 |
| `npm run build` | one-off bundle into `public/` |
| `npm run atlas` | repack `public/atlas.png` from `../art` |
| `npm run icons` | redraw the app icons |
| `npm run deploy <dir>` | build, then copy what a player needs into `<dir>` |

Nothing compiles on the device: Phaser has a single dependency and it is not
native, pngjs is pure JS, and esbuild ships an `android-arm64` binary.

## Two things that cannot run on the phone

- **`../tools/export-art.js`** needs Chromium to re-forge the sprites from the
  drawing code. `art/` is committed, so a phone never needs to run it — but
  after changing a forge function in `../index.html` you must re-export on a
  desktop and re-run `npm run atlas`.
- **The Playwright suites**, for the same reason. The canvas build's 29 suites
  stay a desktop job.

## `public/` is generated

`atlas.png`, `atlas.json`, `manifest.json` and `bundle.js` are all built.
Do not hand-edit them; `index.html` in there is the shell and is written by
hand.

## The core

`src/core/core.js` is **generated** by `npm run core` from `../index.html`. Do
not edit it; edit the canvas build and re-run. The canvas build is still the
live game, and a port that forks the logic by hand drifts the moment anything
is tuned.

What comes across: config and tuning, maths, the spatial hash, world
generation, collision, entities and spawning, the kit, input, the whole
simulation, and the enemy ecosystem and Deceiver encounter that live in the
canvas build's UI section but are simulation wherever they sit. 493 statements,
271kB. What stays behind: 16 drawing functions and 47 page-bound ones.

At the foot of the generated file is a list of what the host must supply —
generated too, so it cannot go stale. `src/host/stubs.js` provides them.

### It is verified, not asserted

`npm run verify` runs the canvas build's own suites against the extracted core
and compares them, suite by suite, in the same session. A suite that asserts
about the renderer or the DOM is reported as not comparable rather than quietly
dropped — deciding that by hand, one failure at a time, is indistinguishable
from excluding whatever happens to be failing.

Six suites are comparable, and all six match assertion for assertion:

| suite | |
|---|---|
| roles | 25/25 |
| lieuts | 16/16 |
| bosses | 24/24 |
| invader | 19/19 |
| eco | 25/25 |
| crescent | 7/7 |

That is 116 assertions about spawning, roles, bosses, the invader, the enemy
ecosystem and the blade, all holding against a core with no renderer at all.
