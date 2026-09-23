# Combat baseline — classic controls

Written by `tools/combat-baseline.js`. Do not edit by hand: run it again.

Each row is one of the problems in the combat analysis, reproduced in the
combat room (`?room=combat`) with the world stepped at 60Hz by the script.
"Present" means the problem still happens with these controls.

| | The claim | Measured | Present |
|---|---|---|---|
| C01 | A still press held past 200ms does nothing. | held 250ms: 0 swings; held 150ms: 1 | yes |
| C02 | A tap while the blade is still coming round is lost, not queued. | second tap 0.1s before ready: 1 swings of 2; at half the 0.62s beat: 1 of 2 (silently) | yes |
| C03 | Aiming out near the edge turns into a gather, stops the swings and slows the stride. | gather began at 0.467s; 1 swings before it, 0 after; stride x0.45 | yes |
| C04 | Reaching the edge after a long press gathers at once. | one frame after reaching the edge (0.5s into the press): gather 0.095 | yes |
| C05 | Back inside the deadzone, the knob centres but the simulation keeps the old aim. | knob centred; simulation aiming: true at 0.41 | yes |
| C06 | A cancelled gesture is treated as a release. | gathering 0.43, then pointercancel: logged "heavy" | yes |
| C07 | Hit-stop freezes the whole world, movement included. | ten kills in a second: 30 of 60 frames frozen (50%) | yes |
| C08 | Assisted aim prefers the avatar over a nearer threat. | thrall at 60, avatar at 160: a tap aims at the avatar (160 away) | yes |
| C09 | An ability can spend before finding it has nothing to act on. | Guillotine with nothing in reach: accepted, charges 3 -> 0 | yes |

No page errors.
