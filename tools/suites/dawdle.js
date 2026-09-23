/* IS WAITING A MOVE?
 *
 * The one question Clamour has to answer with a number, and the one the rest
 * of the design cannot answer for itself.
 *
 * Everything in clamour.js is arithmetic about a meter: it rises here, falls
 * there, reaches this far. All of it would pass on a design that had quietly
 * become a creeping simulator, because a stealth game's meter behaves exactly
 * like a non-stealth game's meter. What separates them is whether STOPPING
 * PAYS -- and the only way to know that is to have somebody stop, and count.
 *
 * So this runs the reference player twice over the same rungs. Once as it
 * normally plays. Once as a DAWDLER: identical in every respect except that
 * whenever the Clamour is up it stands still and waits for it to fall before
 * moving on. If the dawdler does better, the game is asking to be played by
 * standing still, and the anti-stealth guarantee is broken however good the
 * meter's arithmetic looks.
 *
 * It is a small sample by design -- this asks a yes/no question about a large
 * effect, not a per-rung one about a small one. winnable.js records the noise
 * floor for the per-rung numbers; the claim here is only that dawdling is not
 * a strategy, and a strategy that wins shows up loudly or is not a strategy.
 */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
/* 'x ' on a failure: run-suites.js surfaces exactly that prefix when it
 * summarises a sweep, so without it a red suite reports its count and none
 * of its reasons — which means re-running it alone to find out why. */
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

const RUNGS = [3, 17, 30];
const TRIES = Math.max(6, +(process.env.DAWDLE_TRIES || 10));

(async () => {
  await pages.serve();
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(pages.core());
  await pages.descend(p); await sleep(300);

  /* One delve, played by a bot that is deliberately as simple as it can be
   * and still finish: walk to the nearest slag-carrying body, tap it, walk to
   * the gate when the quota is met. Not winnable.js's player -- that one is
   * the yardstick for the LADDER and carries a lot of machinery this question
   * does not need. What matters here is that the two runs differ in exactly
   * one thing, and a small bot makes that easy to see.
   */
  /* WHAT IS MEASURED, AND WHY IT IS NOT EXTRACTION.
   *
   * The first version of this counted delves survived, and both runs scored
   * zero: a bot simple enough to differ in exactly one thing is not a bot
   * that can finish a delve, so the comparison was 0 against 0 and proved
   * nothing at all. The control caught it, which is the only reason this note
   * exists rather than a green tick.
   *
   * Extraction is the wrong signal anyway. It is a coarse binary that needs a
   * competent player, and competence is a confound: a better bot extracts
   * more whatever the meter does. The question is not "can it win", it is
   * "does standing still PAY" -- so what is measured is the price of
   * progress. Damage taken per point of slag, and slag per minute.
   *
   * The hero is given an enormous pool so it cannot die. That is not making
   * it easy; it is removing survival from the comparison entirely, so what is
   * left is efficiency and nothing else. If waiting bought safety, it would
   * show here as fewer points of damage per point of slag, and it would show
   * cleanly.
   */
  const play = await p.evaluate(async ({ rungs, tries }) => {
    const out = [];
    const DT = 1 / 30, SECS = 70;

    const one = (idx, dawdle) => {
      stash = blankStash(); stash.level = Math.max(1, Math.round(idx * 1.4));
      saveStash();
      startRun('isaac', LEVELS[idx].id, 'riven');
      run.banner = 0;
      state = 'play';
      // Unkillable, so the only thing separating the two runs is the waiting.
      player.maxHp = 1e7; player.hp = 1e7;
      const hp0 = player.hp;
      let steps = 0, waited = 0;
      while (state === 'play' && steps < 30 * SECS) {
        let want = null, wd = 1e18;
        if (run.tech < LEVEL.quota) {
          for (const e of enemies) {
            if (e.hp <= 0 || !e.tech) continue;
            const dd = dist2(e.x, e.y, player.x, player.y);
            if (dd < wd) { wd = dd; want = e; }
          }
        } else want = portal;

        /* THE ONLY DIFFERENCE BETWEEN THE TWO RUNS.
         * A dawdler will not move or swing while it can be heard: it stands
         * and lets the meter fall, which is precisely the play a stealth game
         * rewards and precisely the play this design must not. */
        const holding = dawdle && (run.clamour || 0) > 0.2;
        if (holding) { waited += DT; stick.active = false; }
        else if (want) {
          const a = Math.atan2(want.y - player.y, want.x - player.x);
          const dd = Math.hypot(want.x - player.x, want.y - player.y);
          if (dd > (want === portal ? 12 : 44)) {
            stick.active = true; stick.dx = Math.cos(a); stick.dy = Math.sin(a); stick.mag = 1;
          } else stick.active = false;
        } else stick.active = false;

        if (!holding && nearestFoe(player.range)) { conduitPress(); conduitRelease(); }

        if (want === portal && run.gateOpen && portal.inside) { stepThrough(); break; }
        update(DT); steps++;
      }
      stick.active = false;
      const took = hp0 - player.hp;
      return { tech: run.tech, took: Math.round(took),
               mins: +(steps * DT / 60).toFixed(2),
               waited: +(waited / 60).toFixed(2) };
    };

    for (const idx of rungs) {
      const plain = [], slow = [];
      for (let n = 0; n < tries; n++) plain.push(one(idx, false));
      for (let n = 0; n < tries; n++) slow.push(one(idx, true));
      const sum = (a, k) => a.reduce((x, r) => x + r[k], 0);
      const price = a => +(sum(a, 'took') / Math.max(1, sum(a, 'tech'))).toFixed(2);
      const rate  = a => +(sum(a, 'tech') / Math.max(0.01, sum(a, 'mins'))).toFixed(1);
      out.push({ idx, n: tries,
        plainSlag: sum(plain, 'tech'), slowSlag: sum(slow, 'tech'),
        plainPrice: price(plain),      slowPrice: price(slow),
        plainRate: rate(plain),        slowRate: rate(slow),
        waited: +(sum(slow, 'waited') / slow.length).toFixed(2) });
    }
    return out;
  }, { rungs: RUNGS, tries: TRIES });

  const sum = k => play.reduce((a, r) => a + r[k], 0);
  const worse = (a, b) => a > b;                 // a higher price is worse
  console.log('\n   WAITING, AGAINST NOT WAITING. ' + TRIES +
              ' delves a rung, each played twice, over the same 70 seconds.');
  console.log('   The hero cannot die: what is compared is the PRICE of progress.');
  for (const r of play)
    console.log('   rung ' + String(r.idx).padStart(2) +
      '   moving: ' + r.plainSlag + ' slag at ' + r.plainPrice + ' damage each, ' +
      r.plainRate + '/min' +
      '   |   waiting: ' + r.slowSlag + ' slag at ' + r.slowPrice + ' damage each, ' +
      r.slowRate + '/min  (' + r.waited + ' min stood still)');

  /* The control first: a dawdler that never actually stopped would score the
   * same as the other run for the least interesting reason there is. */
  ck('the dawdler actually stood still', sum('waited') > 0.3,
     play.map(r => 'r' + r.idx + ' ' + r.waited + ' min').join('  '));
  ck('and both runs actually gathered something', sum('plainSlag') > 50 && sum('slowSlag') > 50,
     'moving ' + sum('plainSlag') + ', waiting ' + sum('slowSlag') +
     ((sum('plainSlag') > 50 && sum('slowSlag') > 50) ? ''
       : ' — NOBODY PLAYED, so the comparison below is between two nothings'));

  /* AND THE CLAIM. Not "dawdling is worse" -- it is allowed to be a wash, and
   * a design where standing still is merely pointless has not asked anyone to
   * creep. What must not happen is that it WINS. */
  /* THE PRICE IS REPORTED AND NOT ASSERTED ON, and this is the measurement
   * that decided it rather than a preference.
   *
   * Damage-per-slag was asserted first and it swung five hundred fold between
   * runs of the identical build: rung 3 came back 19.87 against 10118.60 on
   * one run and the two columns the other way round on the next. The reason
   * is in the fixture's own design -- the hero cannot die, so it stands in
   * burning ground for the full seventy seconds, and total damage is then
   * dominated by how much fire it happened to walk into rather than by
   * anything the meter did. A number that unstable cannot carry a claim, and
   * asserting on it would have produced a check that goes red on a coin.
   *
   * So it is printed above, where a real shift would be visible to anyone
   * reading the run, and the guarantee rests on tempo instead.
   */
  const cheaper = play.filter(r => worse(r.plainPrice, r.slowPrice));
  console.log('   price per slag, reported only (too noisy to assert on): ' +
    play.map(r => 'r' + r.idx + ' ' + r.slowPrice + ' waiting vs ' +
                  r.plainPrice + ' moving').join('   ') +
    (cheaper.length ? '   [cheaper by waiting on ' +
      cheaper.map(r => 'rung ' + r.idx).join(', ') + ' this run]' : ''));

  /* AND THE CLAIM, which is about tempo. Measured over four runs it is large
   * and one-sided -- waiting gathered slag at roughly two thirds the rate at
   * every rung, every time -- because a delve is a race against a quota and a
   * health bar, and a way of playing that gets less done in the same minute
   * is not a better way of playing however safe it feels.
   *
   * Not "dawdling is worse", note. It is allowed to be a wash, and a design
   * where standing still is merely pointless has not asked anyone to creep.
   * What must not happen is that it WINS. */
  /* POOLED, AND COUNTED RATHER THAN DIVIDED.
   *
   * Per rung this was a coin: over three runs of the identical build, rung 3
   * came back at 172%, 92% and 84% of the moving rate, and rung 17 at 104%,
   * 60% and 93%. Ten delves is not enough to resolve one rung -- winnable.js
   * records the same finding about its own per-rung numbers and for the same
   * reason -- so asserting per rung would be asserting on noise.
   *
   * Both arms run the SAME fixed seventy seconds on the same number of
   * delves, so the pooled comparison needs no rate and no division at all:
   * count the slag. That is the whole statistic, it has no denominator to go
   * small on it, and pooled across three rungs and thirty delves a side it
   * came back 1538 against 906 -- a deficit far outside anything the per-rung
   * scatter does.
   */
  const movingSlag = sum('plainSlag'), waitingSlag = sum('slowSlag');
  ck('waiting for the noise to die gets less done in the same time',
     waitingSlag < movingSlag,
     waitingSlag + ' slag by waiting against ' + movingSlag + ' by moving, ' +
     'over ' + (play.length * TRIES) + ' delves a side' +
     (waitingSlag < movingSlag ? ''
       : ' — STANDING STILL IS NOW THE STRATEGY, and this is a stealth game'));

  ck('and the margin is not a rounding error',
     waitingSlag < movingSlag * 0.9,
     Math.round(100 * waitingSlag / Math.max(1, movingSlag)) +
     '% of what moving gathered');

  /* WHAT THIS DOES NOT PROVE, said here rather than left to be assumed.
   *
   * It shows that waiting loses. It does NOT show that Clamour is the reason
   * -- and it is honestly not the only one. A hero who stands still is also
   * standing in burning ground and broken floor for longer, and is not
   * closing on the next pack, so tempo and hazards push the same way the
   * meter does. The mechanism is not isolated here and a version of this that
   * claimed it was would be lying by arrangement.
   *
   * The anti-stealth constraint is about the WHOLE game, though, not about
   * one term in it: the requirement was that waiting must never be better
   * than moving, and that is exactly the claim above. If a later change makes
   * standing still pay -- through Clamour or through anything else -- this
   * goes red, which is what it is for.
   *
   * The absolute damage figures are large and meaningless on their own: the
   * hero is given ten million life so it cannot die, so it stands in
   * everything for the full seventy seconds. Only the ratio between the two
   * columns means anything, and both columns are inflated identically.
   */

  ck('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
