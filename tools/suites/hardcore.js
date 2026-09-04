/* ONE LIFE.
 *
 * The whole mode is three promises and each one is a way to lose a player for
 * good if it is broken:
 *
 *   the ordinary game is untouchable. A Hardcore death must not be able to
 *   reach it, and the reason it cannot is structural rather than careful --
 *   two localStorage keys, so the wipe removes a key rather than editing a
 *   shared record and hoping it takes the right half.
 *
 *   the death is total. Gear, vault, coin, ranks, pity: everything the
 *   Vanguard owned. A field somebody adds next year must be wiped too, which
 *   is why the hook starts again from blankStash rather than clearing a list
 *   of things it knows about.
 *
 *   and the trophy outlives it. A Regalia carried out of one life is the only
 *   permanent thing in the game -- so it lives in a third key that nothing
 *   can wipe, and it is worn afterwards in either mode.
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
    const STD = 'rivenmark.stash.v1', HC = 'rivenmark.hc.stash.v1',
          HON = 'rivenmark.honours.v1';
    const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
    // A kit worth losing: gear in every slot, coin, ranks, a vault and a pity
    // count. Anything the wipe misses shows up as a survivor.
    const furnish = () => {
      for (const sl of SLOTS) stash.gear[sl.id] = rollItem(0.6, sl.id);
      stash.coins = 640; stash.xp = 5200; stash.level = levelForXp(5200);
      stash.pity = 7;
      stash.vault = [rollItem(0.5), rollItem(0.5), rollItem(0.5)];
      for (const h of HALL) stash.hall[h.id] = 2;
      saveStash();
    };
    const worth = () => ({ gear: SLOTS.filter(sl => stash.gear[sl.id]).length,
                           coins: stash.coins, xp: stash.xp, pity: stash.pity,
                           vault: stash.vault.length,
                           hall: HALL.reduce((a, h) => a + stash.hall[h.id], 0) });

    localStorage.clear();
    try { setHardcore(false); } catch (e) { /* already off */ }
    hardcore = false;
    stash = blankStash(); furnish();
    o.soft = worth();
    o.softOnDisk = !!read(STD);

    // --- two keys, and the flag decides which -----------------------------
    setHardcore(true);
    o.hcStartsEmpty = worth();
    stash.coins = 91; saveStash();
    o.hcOnDisk = (read(HC) || {}).coins;
    o.softStillOnDisk = (read(STD) || {}).coins;

    // --- the rates ---------------------------------------------------------
    o.hardRates = { loot: lootMult(), relic: relicMult() };
    setHardcore(false); o.softRates = { loot: lootMult(), relic: relicMult() };
    setHardcore(true);

    // --- the death ---------------------------------------------------------
    stash = blankStash(); furnish();
    o.beforeDeath = worth();
    startRun('isaac', LEVELS[4].id, 'riven');
    run.coins = 300; run.tech = 55;
    player.bag = [rollItem(0.6)];
    player.hp = 0; endRun(false);
    o.afterDeath = worth();
    o.corpseLeft = !!stash.corpse;
    o.hcKeyAfterDeath = read(HC);
    o.softAfterHcDeath = (read(STD) || {}).coins;
    setHardcore(false);
    o.softIntact = worth();

    // The control: an ordinary death takes NOTHING but the bag.
    stash = blankStash(); furnish();
    const before = worth();
    startRun('isaac', LEVELS[4].id, 'riven');
    run.coins = 300; player.bag = [rollItem(0.6)];
    player.hp = 0; endRun(false);
    o.softDeath = { before, after: worth(), corpse: !!stash.corpse };

    // --- the trophy --------------------------------------------------------
    localStorage.removeItem(HON);
    o.hueBefore = { isaac: crescentHue('isaac'), zayd: crescentHue('zayd') };
    // Softcore first: the same feat must NOT earn it.
    setHardcore(false); stash = blankStash(); saveStash();
    startRun('isaac', LEVELS[4].id, 'riven');
    for (const sl of SLOTS) player.gear[sl.id] = rollSetPiece(sl.id);
    endRun(true);
    o.softEarned = honoured();
    // And a Hardcore extraction that is NOT a whole set must not either.
    setHardcore(true); stash = blankStash(); saveStash();
    startRun('isaac', LEVELS[4].id, 'riven');
    for (const sl of SLOTS.slice(0, 7)) player.gear[sl.id] = rollSetPiece(sl.id);
    endRun(true);
    o.sevenEarned = honoured();
    // Eight does.
    stash = blankStash(); saveStash();
    startRun('isaac', LEVELS[4].id, 'riven');
    for (const sl of SLOTS) player.gear[sl.id] = rollSetPiece(sl.id);
    endRun(true);
    o.eightEarned = honoured();
    o.hueAfter = { isaac: crescentHue('isaac'), zayd: crescentHue('zayd') };
    // It survives the next death, and is worn in the ordinary game.
    stash = blankStash(); saveStash();
    startRun('isaac', LEVELS[4].id, 'riven'); player.hp = 0; endRun(false);
    o.afterLaterDeath = honoured();
    setHardcore(false);
    o.wornInSoftcore = honoured();
    o.honoursKey = !!read(HON);
    localStorage.clear();
    return o;
  });

  ck('the ordinary game keeps its own key', R.softOnDisk && R.soft.gear === 8,
     R.soft.gear + ' pieces, ' + R.soft.coins + ' coin');
  ck('taking up one life hands you nothing of it',
     R.hcStartsEmpty.gear === 0 && R.hcStartsEmpty.coins === 0 &&
     R.hcStartsEmpty.hall === 0,
     JSON.stringify(R.hcStartsEmpty));
  ck('and the two are written to different keys',
     R.hcOnDisk === 91 && R.softStillOnDisk === 640,
     'hardcore ' + R.hcOnDisk + ' coin, ordinary ' + R.softStillOnDisk);

  ck('one life pays half again in loot and in Regalia',
     R.hardRates.loot === R.softRates.loot * 1.5 &&
     R.hardRates.relic === R.softRates.relic * 1.5,
     'loot ' + R.softRates.loot + '→' + R.hardRates.loot +
     ', Regalia ' + R.softRates.relic + '→' + R.hardRates.relic);

  ck('the fixture had something to lose', R.beforeDeath.gear === 8 &&
     R.beforeDeath.vault === 3 && R.beforeDeath.hall === 8 && R.beforeDeath.pity > 0,
     JSON.stringify(R.beforeDeath));
  ck('and death takes every last piece of it',
     R.afterDeath.gear === 0 && R.afterDeath.coins === 0 && R.afterDeath.xp === 0 &&
     R.afterDeath.vault === 0 && R.afterDeath.hall === 0 && R.afterDeath.pity === 0,
     JSON.stringify(R.afterDeath));
  ck('the key itself is emptied, not edited around',
     R.hcKeyAfterDeath && R.hcKeyAfterDeath.coins === 0 &&
     !Object.values(R.hcKeyAfterDeath.gear).some(Boolean));
  ck('no corpse is left, because there is nobody to come back for it',
     R.corpseLeft === false);
  ck('and the ordinary game did not feel it',
     R.softAfterHcDeath === 640 && R.softIntact.gear === 8 && R.softIntact.hall === 8,
     R.softIntact.gear + ' pieces and ' + R.softIntact.coins + ' coin still there');
  // The control. Without it "death takes everything" would pass on a build
  // where death always took everything, in both modes.
  ck('an ordinary death still takes only the bag',
     R.softDeath.after.gear === 8 && R.softDeath.after.coins === R.softDeath.before.coins &&
     R.softDeath.after.hall === 8 && R.softDeath.corpse === true,
     'kept ' + R.softDeath.after.gear + ' pieces and left a corpse');

  ck('the crescent is the hero’s own colour to begin with',
     R.hueBefore.isaac !== R.hueBefore.zayd && R.hueBefore.isaac !== R.hueAfter.isaac,
     R.hueBefore.isaac + ' / ' + R.hueBefore.zayd);
  ck('carrying the Regalia out of the ordinary game earns nothing',
     R.softEarned === false);
  ck('nor does seven pieces out of one life', R.sevenEarned === false);
  ck('eight does', R.eightEarned === true);
  ck('and the edge answers in crimson for both Vanguards after it',
     R.hueAfter.isaac === R.hueAfter.zayd && R.hueAfter.isaac !== R.hueBefore.isaac,
     R.hueAfter.isaac);
  ck('the trophy outlives the character', R.afterLaterDeath === true && R.honoursKey);
  ck('and is worn in the ordinary game too', R.wornInSoftcore === true);

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); process.exit(fail.length ? 1 : 0);
})();
