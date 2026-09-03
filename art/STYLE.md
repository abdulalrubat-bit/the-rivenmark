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

**Every standing body breathes.** The gait advances by distance travelled, so a
body that stopped moving used to stop animating and a room of stopped bodies
was a room of statues. Standing bodies now swell horizontally about 3% over a
2.6-second cycle, each starting somewhere different in it so a pack does not
breathe in unison.

It is a transform, not artwork, and deliberately so. Six forged idle poses per
creature was tried first and measured **3.95MB — a third of the whole sprite
budget** — to say that a body is alive; it also animated worse than it looked,
because a breath driven by one sine is symmetric and six frames held three
distinct poses. Scaling only in x costs nothing, is continuous rather than
stepped, and needs no vertical compensation: the feet stay exactly where they
were planted. Authored `-idle-` frames still work and breathe on top of their
own cycle.

**Every body is lit.** One pass over each finished sprite adds two things,
both built by punching a mask out of itself offset down-light — which works on
eleven hand-painted creatures that share no paths, and adds nothing outside the
silhouette already there, so nothing moves, resizes or parts company with its
own shadow.

- **A rim** along the lit edge. Measured on the light-facing boundary, contrast
  against the floor went from **1.07:1 to 2.44:1** — and five of the eleven had
  a lit edge *darker than the floor they stand on*, which is to say they read
  as holes rather than as bodies. The gorger was worst at 0.18:1.
- **A sharper highlight on the materials that would carry one.** Plate and rag
  read alike at fifty pixels because every material here is a soft
  top-to-bottom ramp, and a soft ramp is matte. The forge cannot be asked which
  path was armour, but it does not need to be: in this bestiary the armour IS
  the light-valued material — the breaker's helm ramps to 112 where its rags
  sit at 34 — so the rule is stated as exactly that. Banded below by cloth,
  above by anything already emitting, and by saturation, which is what really
  separates reflecting from emitting: the void-brand sits at luminance 135,
  squarely inside the value band, and came out with a white highlight down a
  glowing rune. Value range inside the silhouette went **107 to 127**.

It costs 190ms at boot (65ms → 257ms for every body and hero), paid once when
the pixel ratio is settled, not per run and not per frame.

**Every killed body falls over.** A body used to stop being drawn on the frame
its hp reached zero, which is the cheapest possible death and reads as one: a
thrall did not die, it was deleted. It now topples over 480ms — pivoted on the
FEET, because a body turned about the middle of its sprite swings its legs out
from under it and looks thrown rather than felled — holds its colour until it
is most of the way down, and is then gone. Gone rather than lying there: a
floor of corpses is a different game and a different culling cost.

A transform again, for the same reason the breath is one, and it needs no art
at all — so every kind gets it, including the Deceiver and his mirages, who
are forged by a different function entirely. `<kind>-die-0..N` still works and
only changes what a body falls over *with*.

**And a struck body flinches.** It used to flash white and be otherwise
unmoved, which says *that* it was hit and nothing about from where. It now
shoves a few units away from the blow and recovers — out in 0.04s, back over
the next 0.08 — riding `hitFlash`, which the core already counts down, so it
cannot drift out of step with the flash it accompanies.

The direction is *recorded*, not guessed: `damageEnemy` takes where the blow
came from, and all six call sites say — the blast centre, the arc's position,
the hero. Guessing "away from the player" would be wrong for a hazard
underfoot or a blade swung past. A blow with no recorded source still flashes
and simply does not flinch.

It moves the **sprite**, never the body. Where a body actually is belongs to
the simulation, and a renderer that quietly moved things would put a hitbox
somewhere the player cannot see — which the fixture asserts directly.

What is still missing, roughly in order of value for effort:

1. **Wear.** Chipped edges, rust, stained hems, moss on the low stone. The
   walls already do this and the bodies do not, so the bodies look newer than
   the room they are in. Unlike the rim and the highlight this cannot be a
   global pass — wear is *placed*, and a uniform noise over everything is the
   busy texture this document already says to resist. It is per-creature work.
2. **Secondary motion in the run.** Capes, hems, chains and hair that lag
   behind the body. The current run cycles move the whole figure rigidly.
4. **Wear on the bodies to match the room.** See above — this is now the top of
   the list.
5. **A cast pose.** `<kind>-cast-0..N` plays across a wind-up, driven by how
   far through it is rather than by a clock, so the last frame lands as the
   blow does. The mechanism works and no forged creature has one; the core
   already knows — `casting` on the cantor, `chanting` on the shaman.

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

A cast or a death is imported exactly like an idle — `bestiary/<kind>-cast`,
`bestiary/<kind>-die` — with the frames in the order they play. Neither is a
loop and neither is ever reversed: a cast runs once across the wind-up, a death
runs once and then the body is gone.

**A cycle is registered on its FIRST frame**, which stands in for the pose the
body was already in; every frame after it keeps whatever offset the artist gave
it inside the shared box. That is what lets a death sink as it falls and a
takeoff leave the ground. Registering on the box instead put a dying body 3
world units in the air at the instant it died and set it down only once it was
flat — it hopped up in order to fall over.

If a creature is broader than the body it replaces, its canvas is widened
rather than the figure shrunk. The forged frames are square and cut for narrow
bodies — the shaman's figure is 57×101 in a 108×108 frame — and squeezing a
winged reference into that costs the one thing the sizing rule protects, and
costs a different amount per pose, so the body changed height when it started
casting.

**Author a whole kind, not a pose.** The coherent unit is the creature. Give a
body an authored idle and leave its run cycle forged and it changes art style
the instant it takes a step — which is not a subtle regression, it is a
different creature. `pack-atlas.js` prints which kinds are in that state every
time it runs; five of them are, right now.
