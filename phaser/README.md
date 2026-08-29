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

The delve draws now — walls, scenery, the horde and the hero, off the core's
own state, at 60fps with a 4ms one-off bake. `npm run smoke:delve`, 10 checks.

Not started: input, the HUD, the DOM menus, and the stone dressing on the
walls (the coursed ashlar is procedural canvas art and is not in the atlas
yet, so walls show as their lit top face).

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
