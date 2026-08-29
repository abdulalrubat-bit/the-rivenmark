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

Not started: the core extraction, the DOM UI, the delve itself.

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
