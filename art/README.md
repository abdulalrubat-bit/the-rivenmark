# art/

Every sprite the game draws, as PNG files.

**This folder is generated. Do not hand-edit anything in it.** The art lives in
`index.html` as drawing code; running the exporter deletes this folder and
rebuilds it, so a hand-edit is a change that disappears the next time anyone
runs it. To change how something looks, change the forge function in
`index.html` and re-export.

```
node tools/export-art.js
```

## What is in here

| Folder | Files | What it holds |
|---|---:|---|
| `heroes/` | 36 | Isaac and Zayd: rest, an 8-frame walk cycle, an 8-frame run cycle, and each one's weapon. |
| `bestiary/` | 83 | Every body: rest plus an 8-frame run cycle, for all nine horde archetypes, the lieutenant, the Deceiver and a mirage. |
| `props/` | 100 | Twenty pieces of scenery — barrels, pillars, bones, tombs, banners, chains — at four random variants each, plus the base. |
| `chests/` | 4 | The coffer and the warded coffer, shut and open. |
| `cycles/` | 13 | One strip per subject: the whole gait cycle laid out left to right in a single file. Start here if you just want to look at it. |
| `misc/` | 3 | Loot glints and the body shadow. |
| `manifest.json` | — | What was exported, and the stat block for every kind, straight off `ENEMY_TYPES`. |

## Resolution

Everything is exported at **2×**, which is native. The game clamps its
supersample factor to 2 on purpose — the in-memory atlas is already about ten
megabytes at that size — so 2× is the largest these sprites are ever forged at.
Nothing here has been downscaled, and exporting at 3× is not possible without
changing the game.

All frames are transparent PNGs with the body's cast shadow baked in, lit from
the north-west, which is where every shadow in the game comes from.

## The gait

Eight poses per cycle, advanced by **distance travelled** rather than by a
clock, so a body slowed by anything takes shorter steps instead of moonwalking.
Heroes get a walk cycle and a run cycle and blend between them with the stick;
enemies only ever run.

The frames are numbered in cycle order, so `thrall-run-0` through
`thrall-run-7` loop cleanly. The `-rest` frame is the standing pose and is not
part of the loop — it is what a body shows when it is not moving.

## Provenance, and what is deliberately missing

Everything here is **drawn in code**. There is no source art behind any of it,
which is why the exporter is the only way to get it out.

Some things the game draws are *not* here, on purpose. The gear and item icons,
the coffer frames and some of the scenery are cut from the sheets in
`assets/` — art packs whose licence has not been confirmed for redistribution.
Those are drawn straight from their embedded data and are not exported.

Every one of those sheet-backed things keeps a code-drawn fallback, and **it is
the fallback that appears here**. So `chests/coffer-shut.png` is the forged
coffer, not the one cut from the sheet. If the licence question is ever
settled one way or the other, that is the line to revisit.
