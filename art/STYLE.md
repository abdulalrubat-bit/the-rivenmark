# The Rivenmark — art style

Companion to `SPEC.md`. That one is generated and says *what frames exist*;
this one is written and says *what they should look like*. Hand both to an
artist, or check a pack against them.

## The style, in searchable words

**Flat vector, chunky silhouettes, dark earthy palette with hot emissive
accents. Top-down floor, front-facing characters.**

If you are searching a marketplace, the useful terms are: *2D top-down
dungeon crawler*, *flat vector*, *chunky/blocky character*, *dark fantasy*,
*hand-painted* — and NOT *pixel art*. The current art is smooth and
anti-aliased, drawn with gradients and soft shadows. A pixel pack would be a
different game, not a better-looking one.

Reference points that read the way this does: *Nuclear Throne* and *Enter the
Gungeon* for the front-facing-character-on-a-top-down-floor convention,
*Darkest Dungeon* for the palette and the mood, *Children of Morta* for the
level of interior detail worth aiming at.

## What is already right — keep it

- **Silhouette first.** Every creature is identifiable by outline and accent
  colour alone, at 44 world units on a phone. The breaker is wide with heavy
  arms, the gorger is a maw, the cantor is a hood with a floating gem, the
  shaman is a robe and a flame. Do not add detail that muddies an outline.
- **Muted base, hot accent.** Bodies sit in desaturated olive, brown and
  near-black. Colour is spent only on what matters: Sun-Gold on Isaac, Azure
  on Zayd, ember on a shaman's flame, red on a gorger's teeth. That contrast
  is what makes a dark room readable.
- **One light, from the north.** Everything is lit the same way and throws a
  soft offset shadow ellipse. It is the reason a flat scene reads as having a
  floor.
- **Front-facing on a top-down floor.** Characters face the camera, the floor
  is seen from above. It is not isometric and not true top-down; do not mix in
  art that is either.

## What "more detailed" means here

The current art is *shape only* — a body is four to six flat forms with almost
nothing inside them. Detail should go in, in this order:

1. **Interior structure.** Armour plates, cloth folds, straps, belts, a
   hood's opening, ribs on a husk. Enough to read as a made thing rather than
   a coloured shape.
2. **Materials that differ.** Right now steel, cloth, bone and stone are all
   the same matte finish. Metal should catch a hard highlight, cloth should
   not, bone should be dry and pale, wet stone should be darker than dry.
3. **A rim light.** A single bright edge along the lit side lifts a body off a
   dark floor. This is the cheapest thing on the list and the most effective.
4. **Wear.** Chipped edges, rust, stained hems, moss on the low stone. The
   walls already do this and the bodies do not, so the bodies look newer than
   the room they are in.

Resist: outlines that read as cartoon ink, busy noise textures, and anything
that lowers contrast between a body and the floor.

## What "more alive" means here — and the honest gap

**There is no idle animation. A standing body is a single frozen frame.**
`bestiary/<kind>-rest` is one image, and the game shows it whenever a body is
not moving. Nothing breathes, sways, or blinks. This is the single biggest
reason the scene reads as static, and no amount of added detail fixes it.

What would fix it, roughly in order of value for effort:

1. **An idle cycle.** 4–6 frames of breathing, weight shift, a hood stirring.
   Needs a small code change too: the gait picks `-rest` below a movement
   threshold, and would instead run an idle loop on a clock. Ask for
   `<kind>-idle-0..N` alongside `-rest` and it can be wired up.
2. **Secondary motion in the run.** Capes, hems, chains and hair that lag
   behind the body. The current run cycles move the whole figure rigidly.
3. **A hit pose.** Bodies currently flash white when struck. A one-frame
   recoil reads far better.
4. **Death frames.** Bodies presently just stop being drawn.

## The palette

Base, from the game's own `PAL`:

| use | hex |
|---|---|
| lit flagstone underfoot | `#2b2118` |
| wall, top face | `#161a1c` |
| wall, mid | `#0c0f11` |
| wall, base | `#050708` |
| bone | `#c4b795` |
| coin | `#c99a3e` |

Accents, spent sparingly:

| use | hex |
|---|---|
| Isaac — Sun-Gold | `#ffc24d` |
| Zayd — Azure | `#5fd0ff` |
| arcane | `#8fb9d6` |
| ember / torchlight | `#e5761f` |
| gold | `#d9a441` |
| blood | `#8e2b20` |

Each bestiary kind has its own accent, listed with its stats in `SPEC.md`.
That colour is how a player tells one thing from another in a crowd, so it
should survive whatever else changes.

## Scale, and the trap in it

Bodies are **38 to 96 world units** — on a 384-wide phone screen a thrall is
about 44 pixels tall. Art authored for a bigger presentation will lose exactly
the detail it was drawn for. Draw at 2× or 4× by all means (any resolution
works, see `art-custom/README.md`), but **judge it at final size**, on a dark
background, with three of them overlapping.
