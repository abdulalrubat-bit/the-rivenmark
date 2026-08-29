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
| `npm run smoke:play` | 16 checks — the stick, the kit, and the HUD's layout |
| `npm run smoke:fx` | 11 checks — the fight reads, the crescent counted in pixels |
| `npm run smoke:loop` | 15 checks — dying, the outcome, the gate-house, descending again |
| `npm run smoke:forge` | 13 checks — equipping, and that worn gear reaches the hero |
| `npm run smoke:spend` | 13 checks — the vendor and the hall, and that coin buys what it says |
| `npm run smoke` | 13 checks — the proving scene and the diagnostics dump |
| `npm run verify` | the canvas suites against the extracted core |

Each suite builds `public/bundle.js` before it serves it. That is not a
convenience. The suites serve a build artefact, nothing rebuilt it, and so for
a while every one of them was testing whatever bundle happened to be on disk.
It surfaced when a deliberate stub — a `return` at the top of the culling pass,
put there to prove the culling assertions could fail — changed nothing at all:
the browser never saw the edit. A test that cannot see your change cannot fail
on it, and a suite that green-lights a stub is worse than no suite.

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
