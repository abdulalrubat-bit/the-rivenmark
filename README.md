# Neon Extraction

Mobile-first top-down arena survival prototype. Vanilla HTML5 + canvas 2D,
no libraries, no image assets, no network calls. The whole game is
`index.html` — open it and it runs, including from `file://`.

**Play:** open `index.html` in a browser — it runs straight from `file://`.

---

## Core loop

Spawn in a procedurally generated 2000×2000 arena, survive a swarming horde
with an auto-firing weapon, harvest **tech** from kills, and once you have
enough, reach the extraction portal and hold it for four seconds to win.

- **Move** — drag anywhere on the play area (floating virtual joystick), or
  WASD / arrow keys on desktop
- **Fire** — automatic, nearest target inside weapon range
- **Level up** — tech doubles as XP; each level offers a choice of three upgrades
- **Pause** — the HUD button, or `Esc` / `P`

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

Measured on the packed worst case — 220 enemies, 60 projectiles and 360
particles all simultaneously on screen, which normal play does not reach:

| | ms/frame |
|---|---|
| `update()` at 220 enemies | **0.30** |
| `draw()`, full effects | **13.2** |
| `draw()`, reduced effects | **9.6** |

The enemy cap is now 220. Simulation is no longer the bottleneck; drawing is.

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

### Performance safety net

Neon bloom is drawn as a wide translucent stroke under a crisp one rather than
`shadowBlur`, which costs roughly 3× as much and is the single most expensive
thing you can do 200 times a frame. Replacing it halved worst-case frame cost
(28.2 ms → 13.2 ms).

A frame-cost sampler drops bloom entirely if frames run long. Restoring it is
deliberately sticky — it costs ~40% more per frame, so recovery requires a
comfortable margin held over several samples, otherwise restoring pushes cost
straight back over the threshold and the setting oscillates.

### Still open

**Sprite integration** is not done — it needs art that doesn't exist yet, and
the studio's "no external assets" position makes that a deliberate call rather
than an oversight. The renderer is factored for it: every entity has its own
draw function taking world coordinates, and no call site knows how a drone is
drawn. Swapping vectors for sprite sheets means rewriting those function
bodies and nothing else.

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
