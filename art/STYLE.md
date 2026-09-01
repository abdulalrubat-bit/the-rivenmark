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

**The game can now animate a standing body, and almost nothing uses it.**

It could not before: the gait advances by DISTANCE TRAVELLED, so a body that
stopped moving stopped animating, and `bestiary/<kind>-rest` — one image — was
what it held. That is fixed. Drop `bestiary/<kind>-idle-0.png`,
`-idle-1.png`, … into `art-custom/bestiary/` and that kind breathes on a clock
whenever it is standing still, at 420ms a frame, each body starting somewhere
different in the loop so a pack does not breathe in unison. A kind with no
idle frames still holds its one rest pose, exactly as before, so this arrives
one creature at a time.

The flayer has a ten-frame breath; four other kinds have a two-frame pulse.
Everything else is still a frozen frame, and that is still the single biggest
reason the scene reads as static.

Two things the cycle player works out for itself, so nothing has to be
declared:

- **How fast to run.** What is held constant is the length of the breath
  (~2.8s), not the length of a frame. A ten-frame cycle at a two-frame cycle's
  pace would take seven and a half seconds — not a creature resting, a creature
  in a coma. Short cycles keep the old 420ms a frame; long ones speed up.
- **Whether to loop or to go there and back.** A breath is an open path: the
  body rises from one extreme to the other, and playing it as a ring snaps
  back once a cycle. A true cycle — a guttering flame, a turning orb — is a
  ring, and reversing it would be wrong. The packer tells them apart by
  measuring whether the wrap is bigger than the largest step inside the chain,
  and prints the ratio it used every time it runs.

What would fix the rest, roughly in order of value for effort:

1. **Idles for the other six kinds, and longer ones for the four on two
   frames.** 4–6 frames of breathing, weight shift, a hood stirring. Two
   frames reads as a pulse; ten reads as breath — the flayer is the proof.
   `thrall`, `breaker`, `gorger`, `lieutenant`, `mirage`, `deceiver` have none
   at all, and neither hero does.
2. **Secondary motion in the run.** Capes, hems, chains and hair that lag
   behind the body. The current run cycles move the whole figure rigidly.
3. **A hit pose.** Bodies currently flash white when struck. A one-frame
   recoil reads far better.
3b. **A cast or strike pose.** There is no frame for a body attacking: it
   plays its walk or its idle and the blow simply lands. The core already
   knows — `casting` on the cantor, `chanting` on the shaman, `run` on the
   flayer — so the state is there to hang art on, and only the art is
   missing. This is the one place where authored frames currently exist with
   nowhere to go.
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

## Delivering a frame

`node tools/import-art.js bestiary/husk-idle a.png b.png` takes reference art
at any size — a figure floating in a mostly transparent sheet is fine, that is
how it arrives — and lands it as a game frame. Give it several sources and it
treats them as one cycle, trimming them to a COMMON bounding box so the figure
does not shift by a pixel between frames.

Three things it makes true, all of which are checked by `npm run smoke:art`
and none of which are optional:

- **The output canvas matches the forged frame's**, so the frame is a drop-in
  with the same registration. The game centres a sprite on the body's
  position; a tight-trimmed frame centres its own bounding box there instead,
  and the body floats.
- **The figure stands the same height as the forged figure** — the figure, not
  the canvas. A forged body fills 47–83% of its square frame and the rest is
  margin. Fitting to the margin made the imported husk 27% taller than the
  husk that walks, and it is the same husk: it grew every time it stopped.
- **The feet land on the forged foot line.** A top-down crowd reads as standing
  on a floor only while every pair of feet is on the same one.

Author at 2× the forged resolution (the default). A body is 38–96 world units
and a phone renders at dpr ~2.8, so 2× is about pixel parity on the device and
anything more is texture nobody can see.

**Author a whole kind, not a pose.** The coherent unit is the creature. Give a
body an authored idle and leave its run cycle forged and it changes art style
the instant it takes a step — which is not a subtle regression, it is a
different creature. `pack-atlas.js` prints which kinds are in that state every
time it runs; five of them are, right now.
