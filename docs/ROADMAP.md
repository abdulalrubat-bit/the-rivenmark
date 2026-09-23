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
      the core's `sanitizeStash` now, and both builds use it (`saves`)
- [ ] Corpse loot vanishes if you pick it up and then abandon or close the app
- [ ] WebView debugging is switched on in release builds
- [ ] Release workflow pastes its inputs straight into shell (use `env:`)
- [ ] `npm run verify` needs Playwright but `package.json` does not list it
- [ ] Dev server: `public`-prefix path check, crash on a malformed `%`
- [ ] Dev builds: the service worker caches `dev` forever on localhost
- [ ] Remove `w2.txt`–`w5.txt` and `debug.html` from the repo

## Phase 2 — Sound

Synthesised with Web Audio, no files. One small engine, one switch.

- [ ] The engine: a master volume, a limiter, voices that cannot pile up
      when a hundred thralls die in one frame
- [ ] Combat: the swing, the crescent, a hit, a kill, a hit taken
- [ ] The kit: each ability, charges/tension filling, a cooldown ready
- [ ] The run: slag pickup, a coffer opening, the gate waking, stepping through,
      death, extraction
- [ ] Bosses: arrival, their big moves, their fall
- [ ] Menus: taps, buying, forging
- [ ] Ambience, then music — last, once the effects are right

## Phase 3 — Settings and learning to play

- [ ] A settings screen: sound, music, vibration, effects quality
- [ ] Vibration on the moments that matter (hit taken, kill, gate)
- [ ] Teach the controls on the first delve — the stick and the Conduit's
      three touches — shown once, skippable, replayable from settings

## Phase 4 — Content

- [ ] The third boss: design, then build (the canvas build is where the
      behaviour goes; `phaser/src` is where it is drawn)
- [ ] Rung 52 as a milestone: a proper moment when you reach the bottom,
      without closing the ladder
- [ ] **Before any rung past 52:** difficulty is `d = i / (LEVEL_COUNT - 1)`,
      so adding a rung silently makes every existing rung easier. Pin the
      curve to the rung number first.

## Phase 5 — Balance

- [ ] The mid-ladder bump (rungs 3–17), measured with `winnable.js` either
      side of each change

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
