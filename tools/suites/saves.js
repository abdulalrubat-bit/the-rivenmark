/* WHAT A SAVE IS ALLOWED TO SAY.
 *
 * A save on disk is last session's data. It may predate a change to the slots,
 * the affix table, the ladder or the hall, and on a phone it may simply be
 * damaged. So it is filtered on the way in, never trusted -- and the build that
 * ships did not do that: its loadStash was a bare Object.assign, so everything
 * on disk came straight through. Both builds now call the core's sanitizeStash,
 * and because verify-core runs this file against both, a loader that goes back
 * to trusting the disk in EITHER build fails here.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A sanitiser that throws everything away passes
 * every "the bad part is gone" check, so the same load is required to keep the
 * good parts that were written beside the bad ones, and a clean save has to
 * come back whole.
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
    const KEY = 'rivenmark.stash.v1';
    const o = {};
    localStorage.clear();
    try { setHardcore(false); } catch (e) { /* already off */ }
    hardcore = false;

    // --- a save with something wrong in every field, and something right ---
    const [s0, s1, s2] = SLOTS;
    const good = rollItem(0.6, s0.id);
    const badAffix = rollItem(0.6, s1.id);
    badAffix.affixes = [{ id: 'no-such-affix', v: 3 }];
    const wrongSlot = rollItem(0.6, s0.id);            // worn in s2's place
    const gear = {}; for (const sl of SLOTS) gear[sl.id] = null;
    gear[s0.id] = good; gear[s1.id] = badAffix; gear[s2.id] = wrongSlot;
    const vault = [null, {}, 'junk'];
    for (let i = 0; i < 500; i++) vault.push(rollItem(0.5));
    const hall = { vault: 99, forge: -4, 'no-such-station': 3 };
    const loadouts = [];
    for (let i = 0; i < 40; i++) loadouts.push({ name: 'x'.repeat(80), hero: 'nobody', slots: {} });
    localStorage.setItem(KEY, JSON.stringify({
      gear, vault, hall, loadouts,
      hero: 'nobody', xp: 0, level: 99, coins: -50, pity: 400,
      region: 'nowhere', seq: 12,
      corpse: { level_id: 'no-such-rung', items: [rollItem(0.5)], coins: 90 }
    }));
    const st = loadStash();
    o.bad = {
      goodKept: !!(st.gear[s0.id] && st.gear[s0.id].uid === good.uid),
      badAffix: st.gear[s1.id], wrongSlot: st.gear[s2.id],
      vault: st.vault.length, cap: vaultCap(), vaultAllValid: st.vault.every(it => validItem(it)),
      hallVault: st.hall.vault, hallForge: st.hall.forge, hallMax: HALL_MAX,
      strayStation: 'no-such-station' in st.hall,
      loadouts: st.loadouts.length, loadoutCap: loadoutCap(),
      loadoutName: (st.loadouts[0] || {}).name, loadoutHero: (st.loadouts[0] || {}).hero,
      hero: st.hero, level: st.level, coins: st.coins, pity: st.pity,
      region: st.region, corpse: st.corpse, seq: st.seq
    };

    // --- a save that is not a save at all ----------------------------------
    localStorage.setItem(KEY, '{not json');
    const garbled = loadStash();
    localStorage.setItem(KEY, '"a string"');
    const str = loadStash();
    o.garbledBlank = JSON.stringify(garbled) === JSON.stringify(blankStash()) &&
                     JSON.stringify(str) === JSON.stringify(blankStash());

    // --- the control: a clean save comes back whole -------------------------
    const clean = blankStash();
    for (const sl of SLOTS) clean.gear[sl.id] = rollItem(0.6, sl.id);
    clean.vault = [rollItem(0.5), rollItem(0.5)];
    clean.xp = 5200; clean.level = levelForXp(5200); clean.coins = 640; clean.pity = 7;
    clean.hero = 'zayd';
    for (const h of HALL) clean.hall[h.id] = 1;
    localStorage.setItem(KEY, JSON.stringify(clean));
    const back = loadStash();
    o.clean = {
      gear: SLOTS.filter(sl => back.gear[sl.id] &&
                               back.gear[sl.id].uid === clean.gear[sl.id].uid).length,
      slots: SLOTS.length, vault: back.vault.length, coins: back.coins, xp: back.xp,
      level: back.level, want: clean.level, hero: back.hero, pity: back.pity,
      hall: HALL.reduce((a, h) => a + back.hall[h.id], 0), halls: HALL.length
    };
    localStorage.clear();
    return o;
  });

  const B = R.bad, C = R.clean;
  ck('a piece that still validates is kept', B.goodKept === true);
  ck('a piece with an affix that no longer exists is dropped', B.badAffix === null);
  ck('a piece worn in the wrong slot is dropped', B.wrongSlot === null);
  ck('the vault is held to its cap, and only real items get in',
     B.vault === B.cap && B.vaultAllValid, B.vault + ' kept against a cap of ' + B.cap);
  ck('hall tiers are clamped to what exists',
     B.hallVault === B.hallMax && B.hallForge === 0 && !B.strayStation,
     'vault ' + B.hallVault + ', forge ' + B.hallForge);
  ck('loadouts are capped, named sanely and name a real hero',
     B.loadouts <= B.loadoutCap && (B.loadoutName || '').length <= 18 && B.loadoutHero === 'isaac',
     B.loadouts + ' loadouts, hero ' + B.loadoutHero);
  ck('the level is worked out from the xp, not read off the disk', B.level === 1,
     'level ' + B.level);
  ck('coin and pity cannot be negative or absurd', B.coins === 0 && B.pity <= 20,
     'coins ' + B.coins + ', pity ' + B.pity);
  ck('an unknown hero or region falls back', B.hero === 'isaac' && B.region === null);
  ck('a corpse on a rung that no longer exists is not owed', B.corpse === null);
  ck('a save that is not a save starts clean', R.garbledBlank === true);

  ck('the control: a clean save comes back whole',
     C.gear === C.slots && C.vault === 2 && C.coins === 640 && C.xp === 5200 &&
     C.level === C.want && C.hero === 'zayd' && C.pity === 7 && C.hall === C.halls,
     JSON.stringify(C));

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); process.exit(fail.length ? 1 : 0);
})();
