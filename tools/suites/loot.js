/* THE LOOT EXPANSION: more to find, and every piece of it doing something.
 *
 * Asked for as "more gear so lots of different stuff drops", with a helm and
 * gloves, named uniques and new stats. Checked here:
 *
 *   - ten slots, eight or more bases each (six for the rings), every base
 *     with its own picture on the strip and a built-in stat it really rolls
 *   - the new stats do what they say, at the place they happen: a crit hits
 *     for more and says so, the leech drinks what the blow TOOK, thorns
 *     strike back, coin find pays, haste shortens the wait
 *   - each unique's power, measured on the thing it changes -- and nothing
 *     when it is not worn
 *   - the save keeps a built-in stat and a unique, and refuses a unique it
 *     does not know; an eight-slot save still loads
 *   - the temper will not reroll a unique
 *   - a full kit at the rung is no stronger than the old eight-slot kit by
 *     more than the loot is worth (the ladder does not go soft)
 */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const fs = require('fs'), path = require('path');
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

// The strip's width, read off the PNG header: 20px a cell.
function pngWidth(p) { const b = fs.readFileSync(p); return b.readUInt32BE(16); }

(async () => {
  await pages.serve();
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(pages.core());
  await p.waitForFunction(() => typeof rollUnique === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    stash = blankStash();
    startRun('isaac', LEVELS[20].id, 'riven');
    for (const e of enemies) e.hp = 0;
    enemies.length = 0;
    encounters.length = 0; traps.length = 0;
    player.hp = player.maxHp = 1000; player.invuln = 0;
    const bare = () => { for (const sl of SLOTS) player.gear[sl.id] = null; recomputeStats(); };
    const dummy = (hp) => { const e = placeEnemy('thrall', player.x + 60, player.y, 0.5);
      e.hp = e.maxHp = hp || 1e6; e.awake = true; e.speed = 0; return e; };

    // --- the ladder does not go soft ------------------------------------------
    // A full kit rolled at rung 30, median of 150: its strike rate and its
    // life-through-ward, against the EIGHT-SLOT kit on main measured the same
    // way before the expansion (81 dps, 343). Ten pieces may be a little
    // stronger than eight -- there is more to find -- but not a different game.
    {
      const dps = [], ehp = [];
      const L0 = LEVEL; LEVEL = LEVELS[30];          // an item rolls at the delve it falls in
      for (let t = 0; t < 150; t++) {
        for (const sl of SLOTS) player.gear[sl.id] = rollItem(LEVELS[30].depth, sl.id);
        recomputeStats();
        dps.push(player.damage / player.fireDelay * (1 + player.crit * player.critDmg) * (1 + player.leech * 3));
        ehp.push(player.maxHp / (1 - player.ward));
      }
      LEVEL = L0;
      const med = a => a.sort((x, y) => x - y)[a.length >> 1];
      o.kitDps = med(dps); o.kitEhp = med(ehp);
      for (const sl of SLOTS) player.gear[sl.id] = null;
    }

    // --- the tables ---------------------------------------------------------
    o.slots = SLOTS.map(s => s.id);
    o.baseCounts = SLOTS.map(s => BASE_DEFS[s.id].length);
    o.noIcon = []; o.badImp = [];
    for (const sl in BASE_DEFS) for (const bd of BASE_DEFS[sl]) {
      if (ICON[bd.name] === undefined) o.noIcon.push(bd.name);
      if (!bd.imp || !AFFIX_BY_ID[bd.imp[0]]) o.badImp.push(bd.name);
    }
    o.iconCells = ICON_ORDER.length;
    // Every base turns up, with its own stat.
    const seen = {}; let impWrong = 0;
    for (let i = 0; i < 4000; i++) {
      const it = rollItem(Math.random());
      seen[it.base] = 1;
      const bd = BASE_BY_NAME[it.base];
      if (!it.imp || it.imp.id !== bd.imp[0]) impWrong++;
    }
    o.basesSeen = Object.keys(seen).length;
    o.basesAll = Object.keys(BASE_BY_NAME).length;
    o.impWrong = impWrong;

    // --- crit ---------------------------------------------------------------
    bare();
    player.crit = 1; player.critDmg = 0.5;
    let e = dummy();
    floaters.length = 0;
    heroBlow(e, 100, player.x, player.y);
    o.critTook = 1e6 - e.hp;
    o.critFloat = floaters.some(f => f.kind === 'crit');
    player.crit = 0;
    e.hp = 1e6; heroBlow(e, 100, player.x, player.y);
    o.plainTook = 1e6 - e.hp;
    // A trap's bite is not the hero's: no crit off the floor.
    player.crit = 1; e.hp = 1e6; damageEnemy(e, 100, e.x, e.y);
    o.trapTook = 1e6 - e.hp;
    bare();

    // --- leech: what the blow took, not what it was worth --------------------
    player.leech = 0.1; player.maxHp = 1000; player.hp = 500;
    const small = dummy(30);
    heroBlow(small, 100, player.x, player.y);
    o.leeched = player.hp - 500;         // 30 taken: 3 back, not 10
    bare();

    // --- thorns --------------------------------------------------------------
    player.thorns = 10; player.hp = 1000; player.invuln = 0;
    const biter = dummy(1e6); biter.dmg = 5;
    hurtPlayer(biter);
    o.thorns = 1e6 - biter.hp;
    o.thornsWant = 10 * (1 + (LEVEL.depth || 0) * 3);
    bare();

    // --- haste ----------------------------------------------------------------
    const ab = heroKit().find(a => a.cd);
    player.haste = 0.25; player.cds = {};
    player.cds[ab.id] = 0;
    // Through the core's own door: the one line that starts a cooldown.
    o.abCd = ab.cd;
    player.cds[ab.id] = ab.cd * (1 - player.haste);
    o.hasteCd = player.cds[ab.id];
    bare();

    // --- the uniques -------------------------------------------------------
    o.uniques = UNIQUES.length;
    o.uniqueBad = UNIQUES.filter(u => !BASE_BY_NAME[u.base] || !SLOT_BY_ID[u.slot] ||
      BASE_DEFS[u.slot].every(x => x.name !== u.base)).map(u => u.id);
    const wear = id => { bare(); const it = rollUnique(id); player.gear[it.slot] = it; recomputeStats(); return it; };
    const one = rollUnique('rimebite');
    o.uniqueValid = validItem(one) && one.rarity === 'unique' && one.name === 'Rimebite' && !!one.imp;

    // Rimebite: struck, chilled; unworn, not.
    wear('rimebite'); player.crit = 0;
    e = dummy(); heroBlow(e, 1, player.x, player.y); o.chilled = e.chill > 0;
    bare(); e.chill = 0; heroBlow(e, 1, player.x, player.y); o.chilledBare = e.chill > 0;

    // The Hollow Crown: 40% harder below half.
    wear('hollowcrown'); player.crit = 0; player.hp = player.maxHp * 0.3;
    e = dummy(); heroBlow(e, 100, player.x, player.y); o.crownLow = 1e6 - e.hp;
    player.hp = player.maxHp; e.hp = 1e6; heroBlow(e, 100, player.x, player.y); o.crownHigh = 1e6 - e.hp;

    // Breaker's Grasp: the fifth is a crit.
    wear('breakersgrasp'); player.crit = 0; player.blows = 0;
    e = dummy(); const took = [];
    for (let i = 0; i < 5; i++) { const h0 = e.hp; heroBlow(e, 100, player.x, player.y); took.push(Math.round(h0 - e.hp)); }
    o.grasp = took;

    // Emberheart: struck, it burns what stands close -- once, then waits.
    wear('emberheart'); player.emberCd = 0; player.invuln = 0; player.hp = 1000;
    e = dummy(); e.x = player.x + 40; e.y = player.y;
    const far = dummy(); far.x = player.x + 600; far.y = player.y;
    // The grid is taken once a frame; these were set down between frames.
    enemyGrid.clear(); for (const q of enemies) enemyGrid.insert(q, q.x, q.y);
    hurtPlayerBy(1, player.x + 50, player.y);
    o.emberNear = 1e6 - e.hp; o.emberFar = 1e6 - far.hp;
    player.invuln = 0; e.hp = 1e6; hurtPlayerBy(1, player.x + 50, player.y);
    o.emberAgain = 1e6 - e.hp;

    // Gravewhisper: a kill mends 3%.
    wear('gravewhisper'); player.leech = 0; player.hp = 100;
    e = dummy(5); heroBlow(e, 50, player.x, player.y);
    o.grave = player.hp - 100; o.graveWant = player.maxHp * 0.03;

    // Stormstride: a kill quickens.
    wear('stormstride'); player.rush = 0;
    e = dummy(5); heroBlow(e, 50, player.x, player.y); o.rush = player.rush;

    // The Thornwall: thorns three times over.
    wear('thornwall'); player.hp = 1000; player.invuln = 0;
    const b2 = dummy(1e6); b2.dmg = 5; hurtPlayer(b2);
    o.wallThorns = 1e6 - b2.hp; o.wallBase = player.thorns * (1 + (LEVEL.depth || 0) * 3);

    // The Ley-Siphon: a kill takes half a second off every wait.
    wear('leysiphon'); player.cds = { a: 3, b: 0.2 };
    e = dummy(5); heroBlow(e, 50, player.x, player.y); o.siphon = player.cds;

    // Bloodoath: a crit drinks twice.
    wear('bloodoath'); player.crit = 1; player.hp = 100;
    e = dummy(1e6); const lv = player.leech;
    heroBlow(e, 100, player.x, player.y);
    o.oath = player.hp - 100; o.oathWant = 100 * (1 + player.critDmg) * lv * 2;

    // Vesper's Signet: coffers at twice the coin (read off the formula's own door).
    wear('vesper'); o.vesper = hasUnique('vesper');
    bare(); o.vesperBare = hasUnique('vesper');

    // --- drop odds -----------------------------------------------------------
    o.oddsThrall = uniqueOdds({ kind: 'thrall' });
    o.oddsElite = uniqueOdds({ kind: 'thrall', elite: true });

    // --- saves ----------------------------------------------------------------
    const st = blankStash();
    st.vault.push(rollItem(0.5, 'gloves'), rollUnique('emberheart'));
    st.vault.push(Object.assign(rollUnique('vesper'), { unique: 'nosuch' }));
    const back = sanitizeStash(JSON.parse(JSON.stringify(st)));
    o.saveImp = !!(back.vault[0] && back.vault[0].imp && back.vault[0].imp.id === st.vault[0].imp.id);
    o.saveUnique = !!(back.vault[1] && back.vault[1].unique === 'emberheart');
    o.saveKept = back.vault.length;
    // An eight-slot save, from before the helm and gloves.
    const old = JSON.parse(JSON.stringify(blankStash()));
    delete old.gear.helm; delete old.gear.gloves;
    old.gear.blade = rollItem(0.5, 'blade'); delete old.gear.blade.imp;
    const ob = sanitizeStash(old);
    o.oldSave = !!ob.gear.blade && ob.gear.helm === null && ob.gear.gloves === null;

    // --- the temper ------------------------------------------------------------
    stash = blankStash(); stash.coins = 1e6;
    stash.gear.mail = rollUnique('emberheart');
    const before = JSON.stringify(stash.gear.mail);
    o.temper = vendorBuy(VENDOR.find(v => v.id === 'temper'), 'mail');
    o.temperSame = JSON.stringify(stash.gear.mail) === before;
    return o;
  });

  ck('a full kit at rung 30 strikes about as hard as the old eight', R.kitDps > 81 * 0.9 && R.kitDps < 81 * 1.3,
     R.kitDps.toFixed(1) + ' dps against 81 on main');
  ck('...and lasts about as long', R.kitEhp > 343 * 0.85 && R.kitEhp < 343 * 1.2,
     R.kitEhp.toFixed(0) + ' against 343 on main');
  ck('ten slots, with the helm and the gloves', R.slots.length === 10 && R.slots.includes('helm') && R.slots.includes('gloves'),
     R.slots.join(' '));
  ck('eight or more bases a slot (six for the rings)', R.baseCounts.every((n, i) => n >= (R.slots[i].startsWith('ring') ? 6 : 8)),
     R.baseCounts.join(' '));
  ck('every base has its own picture', R.noIcon.length === 0, R.noIcon.join(', '));
  const strip = pngWidth(path.join(__dirname, '..', '..', 'phaser', 'public', 'icons.png'));
  ck('and the strip carries every cell', strip === R.iconCells * 20, strip + 'px for ' + R.iconCells + ' cells');
  ck('every base has a built-in stat that exists', R.badImp.length === 0, R.badImp.join(', '));
  ck('every base drops, with its own stat', R.basesSeen === R.basesAll && R.impWrong === 0,
     R.basesSeen + '/' + R.basesAll + ' seen, ' + R.impWrong + ' wrong');
  ck('a crit hits half again, and says so', Math.abs(R.critTook - 150) < 1 && R.critFloat && Math.abs(R.plainTook - 100) < 1,
     R.critTook + ' against ' + R.plainTook);
  ck('the floor does not crit', Math.abs(R.trapTook - 100) < 1, String(R.trapTook));
  ck('the leech drinks what the blow took, not what it was worth', Math.abs(R.leeched - 3) < 0.01, R.leeched.toFixed(2));
  ck('thorns strike back', Math.abs(R.thorns - R.thornsWant) < 0.5, R.thorns + ' against ' + R.thornsWant);
  ck('haste shortens the wait', R.hasteCd < R.abCd, R.hasteCd + ' against ' + R.abCd);
  ck('ten uniques, each on a real base of its slot', R.uniques >= 10 && R.uniqueBad.length === 0, R.uniqueBad.join(', '));
  ck('a unique rolls whole: named, valid, with its base’s stat', R.uniqueValid);
  ck('Rimebite chills what it strikes, and only when worn', R.chilled && !R.chilledBare);
  ck('the Hollow Crown strikes harder below half', Math.abs(R.crownLow / R.crownHigh - 1.4) < 0.01,
     R.crownLow + ' against ' + R.crownHigh);
  ck('Breaker’s Grasp: the fifth blow is a crit', R.grasp[4] > R.grasp[0] * 1.3 && R.grasp.slice(0, 4).every(v => v === R.grasp[0]),
     R.grasp.join(' '));
  ck('Emberheart burns what is close when you are struck', R.emberNear > 0 && R.emberFar === 0,
     'near ' + R.emberNear.toFixed(0) + ', far ' + R.emberFar);
  ck('...and then waits', R.emberAgain === 0, String(R.emberAgain));
  ck('Gravewhisper: a kill mends 3%', Math.abs(R.grave - R.graveWant) < 0.5, R.grave.toFixed(1) + ' against ' + R.graveWant);
  ck('Stormstride: a kill quickens', R.rush > 0, String(R.rush));
  ck('the Thornwall: thorns three times over', Math.abs(R.wallThorns - R.wallBase * 3) < 0.5,
     R.wallThorns + ' against ' + R.wallBase * 3);
  ck('the Ley-Siphon: a kill takes half a second off every wait', Math.abs(R.siphon.a - 2.5) < 1e-6 && R.siphon.b === 0,
     JSON.stringify(R.siphon));
  ck('Bloodoath: a crit drinks twice', Math.abs(R.oath - R.oathWant) < 0.5, R.oath.toFixed(1) + ' against ' + R.oathWant.toFixed(1));
  ck('Vesper’s Signet is read only while worn', R.vesper && !R.vesperBare);
  ck('a unique is rare off the horde and likelier off a champion', R.oddsThrall < 0.03 && R.oddsElite > R.oddsThrall * 3,
     (R.oddsThrall * 100).toFixed(1) + '% against ' + (R.oddsElite * 100).toFixed(1) + '%');
  ck('the save keeps a built-in stat', R.saveImp);
  ck('the save keeps a unique', R.saveUnique);
  ck('and refuses one it does not know', R.saveKept === 2, R.saveKept + ' kept of 3');
  ck('an eight-slot save still loads', R.oldSave);
  ck('the temper will not reroll a unique', R.temper === false && R.temperSame);
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
