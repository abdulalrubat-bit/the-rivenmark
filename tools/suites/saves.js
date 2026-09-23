/* WHAT A SAVE IS ALLOWED TO SAY.
 *
 * A save on disk is last session's data. It may predate a change to the slots,
 * the affix table, the ladder or the hall, and on a phone it may simply be
 * damaged. So it is filtered on the way in, never trusted -- and the build that
 * ships did not do that: its loadStash was a bare Object.assign, so everything
 * on disk came straight through. It calls the core's sanitizeStash now, and
 * this runs against the host the game ships with (core-test.html loads the same
 * host-real.js), so a loader that goes back to trusting the disk fails here.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A sanitiser that throws everything away passes
 * every "the bad part is gone" check, so the same load is required to keep the
 * good parts that were written beside the bad ones, and a clean save has to
 * come back whole.
 */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  await pages.serve();
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(pages.core()); await sleep(900);

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
    // Nothing to fall back on: the backup a clean read leaves is tested below.
    localStorage.removeItem(KEY + '.bak');
    localStorage.setItem(KEY, '{not json');
    const garbled = loadStash();
    localStorage.removeItem(KEY + '.bak');
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
    // --- malformed records inside an otherwise good save -------------------
    // The crash in the audit: one null in an affix list threw inside the
    // loader, and with it every startup. Each bad record here sits beside a
    // good one, and the good one has to come through.
    const keep = rollItem(0.6, s0.id);
    const bads = [
      Object.assign(rollItem(0.5), { affixes: [null] }),
      Object.assign(rollItem(0.5), { affixes: [{}] }),
      Object.assign(rollItem(0.5), { affixes: [{ id: 'constructor', v: 1 }] }),
      Object.assign(rollItem(0.5), { affixes: [{ id: SLOT_AFFIXES.blade[0], v: '3' }] }),
      Object.assign(rollItem(0.5), { affixes: [{ id: SLOT_AFFIXES.blade[0], v: 1e300 }] }),
      Object.assign(rollItem(0.5), { slot: 'constructor' }),
      Object.assign(rollItem(0.5), { affixes: 'lots' }),
      [], 7, 'a string'
    ];
    const noName = Object.assign(rollItem(0.5), { name: 42, uid: 'x' });
    let threw = null, mal = null;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        gear: { [s0.id]: keep }, vault: [...bads, noName],
        hero: 'constructor', region: 'toString', coins: 'Infinity', xp: '1e999', seq: 3,
        loadouts: [null, 'x', { name: 99, hero: 'toString', slots: null },
                   { name: 'ok', hero: 'zayd', slots: { [s0.id]: keep.uid } }],
        corpse: { level_id: 'constructor', items: [keep], coins: 5 },
        hall: { vault: 'Infinity', forge: null }
      }));
      mal = loadStash();
    } catch (e) { threw = e.message; }
    o.mal = mal && {
      threw, keptWorn: !!(mal.gear[s0.id] && mal.gear[s0.id].uid === keep.uid),
      vault: mal.vault.length, mended: mal.vault[0] || null,
      hero: mal.hero, region: mal.region, coins: mal.coins, xp: mal.xp,
      loadouts: mal.loadouts.map(L => L.name + '/' + L.hero),
      corpse: mal.corpse, hallVault: mal.hall.vault, seq: mal.seq,
      uids: [...Object.values(mal.gear).filter(Boolean), ...mal.vault].map(it => it.uid)
    };
    if (!mal) o.mal = { threw };

    // --- versions -----------------------------------------------------------
    const v0 = blankStash(); delete v0.v; v0.coins = 12;
    localStorage.setItem(KEY, JSON.stringify(v0));
    const l0 = loadStash();
    const v9 = blankStash(); v9.v = 99; v9.coins = 34;
    localStorage.setItem(KEY, JSON.stringify(v9));
    let l9 = null; try { l9 = loadStash(); } catch (e) {}
    o.ver = { current: blankStash().v, fromOld: l0.v, oldCoins: l0.coins,
              future: l9 && l9.coins };

    // --- the backup ----------------------------------------------------------
    const lastGood = blankStash(); lastGood.coins = 777; lastGood.xp = 999;
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify(lastGood));
    loadStash();                                   // a clean read leaves a backup
    localStorage.setItem(KEY, '{"coins": 5, "vault": [');     // cut off mid-write
    const rec = loadStash();
    o.bak = { coins: rec.coins, xp: rec.xp, flagged: window.stashRecovered === true };
    localStorage.clear(); window.stashRecovered = false;
    const fresh = loadStash();
    o.bak.freshBlank = fresh.coins === 0 && window.stashRecovered === false;
    localStorage.setItem('rivenmark.hc.stash.v1', '{}');
    localStorage.setItem('rivenmark.hc.stash.v1.bak', '{}');
    dropHardcoreStash();
    o.bak.hcGone = localStorage.getItem('rivenmark.hc.stash.v1.bak') === null;

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

  // --- malformed records ----------------------------------------------------
  const M = R.mal && !R.mal.threw ? R.mal : null;   // null: the load itself threw
  ck('a null inside an affix list does not crash the load', !!M, R.mal && R.mal.threw);
  ck('and the good piece beside the bad ones is kept', M && M.keptWorn === true);
  ck('every malformed piece is dropped, and only those', M && M.vault === 1,
     M && M.vault + ' left in the vault of ' + 11);
  ck('a piece with a broken name or id is repaired, not thrown away',
     M && M.mended && typeof M.mended.name === 'string' && Number.isFinite(M.mended.uid),
     M && JSON.stringify(M.mended && { name: M.mended.name, uid: M.mended.uid }));
  ck('and its new id collides with nothing, and the counter is past it',
     M && new Set(M.uids).size === M.uids.length && M.uids.every(u => u <= M.seq),
     M && 'uids ' + M.uids.join(',') + ', seq ' + M.seq);
  ck('an id borrowed from the language (constructor, toString) is not a hero or region',
     M && M.hero === 'isaac' && M.region === null, M && M.hero + ' / ' + M.region);
  ck('Infinity from disk is not a number the game will hold',
     M && M.coins === 0 && M.xp === 0 && M.hallVault === 0,
     M && 'coins ' + M.coins + ', xp ' + M.xp + ', hall ' + M.hallVault);
  ck('junk loadouts are dropped and the real one kept',
     M && M.loadouts.length === 2 && M.loadouts.includes('ok/zayd') && M.loadouts.includes('Kit/isaac'),
     M && M.loadouts.join(', '));
  ck('a corpse on a rung named "constructor" is not owed', M && M.corpse === null);
  // --- versions ----------------------------------------------------------------
  ck('a save written now carries its version', R.ver.current >= 1, 'v' + R.ver.current);
  ck('a save from before versions walks forward and keeps its contents',
     R.ver.fromOld === R.ver.current && R.ver.oldCoins === 12, JSON.stringify(R.ver));
  ck('a save from a newer build still loads what it can', R.ver.future === 34);
  // --- the backup ---------------------------------------------------------------
  ck('a save cut off mid-write comes back from the last good one',
     R.bak.coins === 777 && R.bak.xp === 999, JSON.stringify(R.bak));
  ck('and says it was recovered', R.bak.flagged === true);
  ck('no save at all is a blank stash, not a recovery', R.bak.freshBlank === true);
  ck('a Hardcore death takes the backup with it', R.bak.hcGone === true);

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
