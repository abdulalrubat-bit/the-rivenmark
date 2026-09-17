/* THE DAILY.
 *
 * One delve a day, named in advance, on ground that has been changed. Both the
 * twist and the rung fall out of the DATE, so nothing has to be synchronised
 * and the only thing stored is whether you have taken it -- which is also the
 * only thing that can go wrong in a way a player would notice, so most of what
 * is checked here is about claiming rather than about the twists.
 *
 * The brief called these mutators. The game already has a thing by that name --
 * the Deceiver's epithets, rolled per rung, which are what make the ladder
 * learnable -- so these are bounties: they change the DELVE, they last a day,
 * and they are the same for everybody.
 */
const { chromium } = require('playwright');
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(PAGE('index.html')); await sleep(900);

  const R = await p.evaluate(() => {
    const o = {};
    const fresh = () => { localStorage.clear(); hardcore = false;
                          stash = blankStash(); saveStash(); };
    fresh();

    // --- it is a property of the day -------------------------------------
    const DAY = 86400000;
    const t0 = Date.now();
    o.same = todaysBounty(t0).id + '@' + todaysBounty(t0).level_id ===
             todaysBounty(t0 + 3600000).id + '@' + todaysBounty(t0 + 3600000).level_id;
    const month = [];
    for (let i = 0; i < 30; i++) {
      const b2 = todaysBounty(t0 + i * DAY);
      month.push(b2.id + '@' + b2.level_id);
    }
    o.distinctDays = new Set(month).size;
    o.distinctTwists = new Set(month.map(m => m.split('@')[0])).size;
    o.twistsAvailable = BOUNTIES.length;
    // A daily nobody can reach is a daily nobody does.
    o.deepest = Math.max(...month.map(m =>
      LEVELS.findIndex(l => l.id === m.split('@')[1])));
    o.rungs = LEVELS.length;
    // And the two must not march up the ladder together.
    o.sameSeed = month.filter((m, i) => i > 0 && m.split('@')[0] === month[i - 1].split('@')[0] &&
                                        m.split('@')[1] === month[i - 1].split('@')[1]).length;

    // --- it twists the delve, on its own rung and nowhere else ------------
    const b = todaysBounty();
    const measure = () => {
      let hp = 0, sp = 0, tech = 0, n = 0;
      for (const e of enemies) { hp += e.maxHp; sp += e.speed; tech += e.tech; n++; }
      return { bodies: n, speed: +(sp / n).toFixed(1), hp: +(hp / n).toFixed(1),
               slag: tech, chests: chests.length };
    };
    fresh();
    stash.bountyArmed = false;
    startRun('isaac', b.level_id, 'riven');
    o.plain = measure(); o.plainArmed = !!run.bounty;
    stash.bountyArmed = true;
    startRun('isaac', b.level_id, 'riven');
    o.twisted = measure(); o.twistedId = run.bounty && run.bounty.id;
    o.twist = b.twist;
    // Armed, but on a rung the bounty did not name.
    const other = LEVELS.find(l => l.id !== b.level_id);
    startRun('isaac', other.id, 'riven');
    o.wrongRung = !!run.bounty;

    // --- claiming ---------------------------------------------------------
    fresh(); stash.bountyArmed = true; saveStash();
    // Dying pays nothing and spends nothing.
    startRun('isaac', b.level_id, 'riven'); player.hp = 0; endRun(false);
    o.afterDeath = { done: bountyDone(), armed: stash.bountyArmed,
                     vault: stash.vault.length };
    fresh(); stash.bountyArmed = true; saveStash();
    startRun('isaac', b.level_id, 'riven');
    endRun(true);
    const got = stash.vault[stash.vault.length - 1];
    o.paid = { done: bountyDone(), armed: stash.bountyArmed, vault: stash.vault.length,
               rarity: got && got.rarity, affixes: got && got.affixes.length };
    // ...once.
    stash.bountyArmed = true;
    startRun('isaac', b.level_id, 'riven');
    o.secondArmed = !!run.bounty;
    const v = stash.vault.length; endRun(true);
    o.secondPaid = stash.vault.length - v;

    // A full vault must not spend the day for nothing.
    fresh();
    while (stash.vault.length < vaultCap()) stash.vault.push(rollItem(0.3));
    stash.bountyArmed = true; saveStash();
    startRun('isaac', b.level_id, 'riven'); endRun(true);
    // run.bountyHeld, not the outcome copy: the FACT belongs to the run and
    // the sentence belongs to whichever build is drawing the card. Reading the
    // DOM here also made the whole suite incomparable against the extracted
    // core, which has no DOM -- and this is simulation, so it should be.
    o.full = { done: bountyDone(), armed: stash.bountyArmed, held: !!run.bountyHeld };
    stash.vault.length = 2; saveStash();
    startRun('isaac', b.level_id, 'riven');
    const v2 = stash.vault.length; endRun(true);
    o.afterRoom = { paid: stash.vault.length - v2, done: bountyDone(),
                    flag: !!run.bountyPaid };

    // Yesterday's claim is not today's.
    fresh();
    stash.bounty = { day: dayStamp() - 1, done: true };
    saveStash();
    stash = loadStash();
    // The BEHAVIOUR, not the representation. bountyDone() compares the day, so
    // a stale record is already harmless whether or not loadStash tidies it
    // away -- and the two builds tidy differently. Asserting "the record is
    // gone" made this suite claim a difference between them that no player
    // could ever observe.
    o.staleDropped = !bountyDone();
    o.staleKeptRecord = !!stash.bounty;
    fresh();
    stash.bounty = { day: dayStamp(), done: true }; saveStash();
    stash = loadStash();
    o.todaysKept = bountyDone();
    fresh();
    return o;
  });

  ck('the bounty is the same all day', R.same);
  ck('and a different one across a month', R.distinctDays > 12,
     R.distinctDays + ' distinct bounty-and-rung pairs in 30 days');
  ck('every twist comes up', R.distinctTwists === R.twistsAvailable,
     R.distinctTwists + ' of ' + R.twistsAvailable);
  ck('the twist and the rung are drawn separately',
     R.sameSeed < 6, R.sameSeed + ' days repeated the previous day exactly');
  ck('and never on a rung most players cannot reach',
     R.deepest < R.rungs * 0.6,
     'deepest in 30 days: rung ' + R.deepest + ' of ' + R.rungs);

  ck('the fixture measured an untwisted delve first', R.plainArmed === false,
     JSON.stringify(R.plain));
  ck('taking the bounty twists the ground it named', R.twistedId,
     R.twistedId + ': ' + JSON.stringify(R.twist));
  // Measured against the same rung unarmed, so this cannot pass on a delve
  // that was simply bigger that day.
  const moved = Object.keys(R.twist).some(k => {
    const map = { speed: 'speed', hp: 'hp', slag: 'slag', chests: 'chests', tech: 'slag' };
    const f = map[k]; if (!f) return false;
    return Math.abs(R.twisted[f] - R.plain[f]) > R.plain[f] * 0.1;
  });
  ck('and the delve is measurably different for it', moved,
     'plain ' + JSON.stringify(R.plain) + ' → ' + JSON.stringify(R.twisted));
  ck('but a rung it did not name is untouched', R.wrongRung === false);

  ck('dying pays nothing and spends nothing',
     R.afterDeath.done === false && R.afterDeath.armed === true &&
     R.afterDeath.vault === 0);
  /* This flaked about one run in three and it was right to: rollItem rolls its
   * own rarity, sometimes above Hallowed, and the reward stamped the tier over
   * the top while only topping the affixes UP -- so a five-affix Riven came
   * out labelled Hallowed. The check was correct and the game was wrong, which
   * is worth saying because a check that fails intermittently is the easiest
   * thing in the world to write off as noise. */
  ck('extracting pays a Hallowed piece',
     R.paid.done && R.paid.vault === 1 && R.paid.rarity === 'hallowed' &&
     R.paid.affixes === 4,
     R.paid.rarity + ' with ' + R.paid.affixes + ' affixes');
  ck('and only once a day', R.secondArmed === false && R.secondPaid === 0);
  ck('a full vault holds the bounty rather than spending it',
     R.full.done === false && R.full.armed === true && R.full.held,
     R.full.held ? 'and the run records that it was held'
                 : 'THE RUN DOES NOT RECORD IT, so no build can say so');
  ck('and it pays as soon as there is room',
     R.afterRoom.paid === 1 && R.afterRoom.done && R.afterRoom.flag);

  ck('yesterday’s claim does not lock out today', R.staleDropped,
     R.staleKeptRecord ? 'the record is still on disk, and correctly ignored'
                       : 'and the record is dropped on load');
  ck('but today’s survives a reload', R.todaysKept);

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); process.exit(fail.length ? 1 : 0);
})();
