# The Rivenmark — road to 1.0

One list, worked top to bottom. Each item is finished, tested and pushed
before the next one starts. Tick it here when it lands.

**Decided:** Google Play only · no ads in 1.0 · sound generated in code, like
the art · a third boss · rung 52 is a milestone, not the end — the ladder will
grow past it later.

---

## Phase 1 — Fix what is broken

- [x] Stick, minimap and gate arrow on high-DPR phones (`smoke:dpr`)
- [x] Hardcore can be escaped: *Abandon the delve*, or closing the app mid-fight,
      skips the death wipe — both now count as death (`hardcore`, `smoke:boot`)
- [x] Saves are loaded unchecked in the build that ships — the validation is
      the core's `sanitizeStash` now (`saves`)
- [x] Corpse loot vanishes if you pick it up and then abandon or close the app
      — the claim is settled when the run ends now (`extract`)
- [x] WebView debugging is switched on in release builds — debug builds only
      (compiles in CI; there is no Android SDK in the dev container)
- [x] Release workflow pastes its inputs straight into shell (use `env:`) —
      also fixed a syntax error that failed its version step on every run
- [x] `npm run verify` needs Playwright but `package.json` does not list it
- [x] Dev server: `public`-prefix path check, crash on a malformed `%`
- [x] Dev builds: the service worker caches `dev` forever on localhost
- [x] Remove `w2.txt`–`w5.txt`

## Phase 1½ — One engine

- [x] The game is Phaser only. The canvas build (`index.html`, `debug.html`)
      is retired; `phaser/src/core/core.js` is the hand-edited simulation,
      guarded by `check-core.js` and the rules suites
- [x] What only the old UI could do, rebuilt: difficulty choice, kit presets,
      discard, the bag mid-delve
- [x] What the port had quietly lost, restored: hit-stop, camera shake, hit
      flash, the hurt vignette, broken props, keyboard and Back, ramp lessons,
      comparisons, vault sort and filter (`smoke:feel`, `smoke:kit`, suites)
- [x] Swap sits above the kit, clear of it at every phone width
- [x] The sprite forge kept as an art tool (`tools/forge/`)

## Phase 2 — Sound

Synthesised with Web Audio, no files. One small engine, one switch.

- [x] The engine: a master volume, a limiter, voices that cannot pile up
      when a hundred thralls die in one frame — plus a mute switch on the HUD
      and the pause card (`smoke:sound`)
- [x] Combat: the swing, the crescent, a hit, a kill, a hit taken — and a
      blow into a guard, and one on the tethered Deceiver
- [x] The kit: each ability, charges/tension filling, a cooldown ready — and
      a press that cannot fire, an ability used on nothing, a channel held or
      broken
- [x] The run: slag pickup, a coffer opening, the gate waking, stepping through,
      death, extraction — and the quota, gear by rarity, a full bag, blasts,
      slams, a surge held and a corpse reclaimed
- [x] Bosses: arrival, their big moves, their fall
- [x] Menus: taps, buying, building, equipping, discarding, descending
- [x] Ambience, then music — a bed per region and the hearth; a generative score that follows the game (hearth, delve, boss, hold)

## Polish, found on the way

- [x] Item icons in the Forge and the bag (the canvas build had a pixel-icon
      strip per base; the Phaser menus name pieces with glyphs only)
- [x] The display face (Cinzel, fonts/) is not used by the Phaser menus,
      which fall back to Georgia
- [x] The gate arrow can sit over the minimap's corner (`smoke:overlay`)
- [ ] Gloom "closes in from the edges" has no Phaser check yet (newkinds.js)
- [ ] `clamour`'s "a loud hero is harder to shake" fails about one run in
      six, on `main` too: its fixture sits near a range edge that the
      generated room sometimes moves. Find why before trusting it
- [ ] `crucible`'s "the escort is the same gate at both ends" fails about one
      run in three: the rung-50 hero median rides the gear lottery (single
      rolls 19%/s to 76%/s). Seeded, it reads identically under both control
      schemes, so it is the dice, not the controls. Seed the gear rolls, or
      widen the sample
- [ ] A dev panel (god mode, seeds, jump to a region) — the canvas build's
      `debug.html` had one; Phaser has the diagnostics dump, the profiler and
      the `?nogate` / `?nogov` / `?norun` flags

## Phase 3 — Settings and learning to play

- [x] A settings screen: sound, effects and music volumes, vibration, screen
      shake, hit flashes, effects quality, controls (`smoke:settings`)
- [x] Vibration on the moments that matter (hit taken, big kill, gate, a boss
      falling, death), its own switch; the APK declares VIBRATE
- [x] Teach the controls on the first delve — walk, strike, aim, the heavy,
      an ability, and what getting out keeps and dying loses (Hardcore spelled
      out) — each step finished by doing it; skippable, replayable from
      settings, never in practice (`smoke:tutorial`)

## Phase 4 — Content

- [x] The third boss: the Silent Choir — five anchored singers round the
      gate, notes to break, three together to still; rung 19, then every third
      (`choir`)
- [x] Rung 52 as a milestone: the whole Choir (seven voices); silencing it
      and getting out is the ending — told on the card, kept in the Hall, and
      the ladder stays open (`ending`)
- [x] **Before any rung past 52:** difficulty was `d = i / (LEVEL_COUNT - 1)`,
      so adding a rung silently made every existing rung easier. Pinned to the
      rung (`CURVE_DEEP`); a 70-rung ladder leaves all 52 unchanged (`ladder`)

## Phase 5 — Balance

- [x] The mid-ladder bump (rungs 3–17), measured with `winnable.js` either
      side of each change: burning ground and bursts hurt the hero less while
      they are being learned (0.4 at rung 2, whole by 27). Reference player,
      40 a rung: 3 7→11, 9 8→13, 17 12→21, 30 20→29; overall 42%→56%

## Phase 6 — Google Play

- [ ] Raise `targetSdk` to what Play currently requires for new apps (34
      today; check the current rule at submission)
- [ ] Upload key and Play App Signing set up; the release workflow's secrets
- [ ] Privacy policy (the game collects nothing — it says so)
- [ ] Store listing: short and long description, icon, feature graphic,
      phone screenshots
- [ ] Content rating questionnaire, data-safety form
- [ ] Internal testing track → closed testing → production. A new personal
      Play developer account has to run a closed test with a minimum number
      of testers for a set period before production is unlocked — check the
      current numbers and line the testers up early, it is the slowest step
