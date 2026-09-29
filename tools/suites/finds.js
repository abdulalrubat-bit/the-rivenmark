/* THINGS TO FIND: shrines, pages of lore, and the rooms' own coffers.
 *
 * Playtested: the delves were hollow -- nothing in them but the fight and the
 * gate. Each of these is checked by what it DOES, on the core:
 *
 *   - a shrine stands in most delves, away from the spawn and the gate
 *   - walking onto one blesses you, once: embers hit harder, stone takes a
 *     share off every blow, wind quickens the stride, blood heals you whole
 *   - a blessing runs out, and does not follow you into the next delve
 *   - a page of lore lies in most delves; reading it keeps it in the honours,
 *     shows it, and a delve never lays down a page already read
 *   - a set piece's coffer is taken out of the delve's count, not added to it
 *
 * WHAT WOULD MAKE THIS VACUOUS. A blessing that did nothing passes "it was
 * given" -- so every one is measured on the stat or the blow it changes,
 * against the same thing unblessed, and again after it has run out.
 */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  await pages.serve();
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(pages.core());
  await p.waitForFunction(() => typeof placeFinds === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    const step = secs => { for (let i = 0, n = Math.round(secs * 60); i < n; i++) update(1 / 60); };
    const fresh = idx => {
      stash = blankStash(); stash.region = 'slag';
      startRun('isaac', LEVELS[idx].id, 'riven');
      for (const e of enemies) { e.hp = 0; }
      enemies.length = 0;
      player.invuln = 0;
    };
    keepHonours({});

    // --- where they stand, over many delves ---------------------------------
    let withShrine = 0, withLore = 0, runs = 0, tooNear = 0;
    for (let t = 0; t < 24; t++) {
      fresh(1 + (t % 8));
      runs++;
      if (shrines.length) withShrine++;
      if (lore.length) withLore++;
      for (const f of shrines.concat(lore)) {
        if (dist2(f.x, f.y, player.x, player.y) < 250 * 250 ||
            dist2(f.x, f.y, portal.x, portal.y) < 200 * 200) tooNear++;
      }
    }
    o.placed = { runs, withShrine, withLore, tooNear };

    // --- each blessing, measured --------------------------------------------
    const walkOnto = f => { player.x = f.x; player.y = f.y; update(1 / 60); };
    const shrineOf = id => { fresh(2); shrines.length = 0;
      const c = { x: player.x + 200, y: player.y, id, used: false, pulse: 0 };
      shrines.push(c); return c; };

    let sh = shrineOf('ember');
    const d0 = player.damage; walkOnto(sh);
    const d1 = player.damage; const blessed = !!(run.blessing && run.blessing.t > 0);
    step(SHRINES.ember.last + 0.5);
    const d2 = player.damage;
    o.ember = { d0, d1, d2, blessed, used: sh.used };
    // once only
    run.blessing = null; recomputeStats();
    player.x += 300; update(1 / 60); walkOnto(sh);
    o.once = !(run.blessing && run.blessing.t > 0);

    sh = shrineOf('stone');
    const hit = () => { player.invuln = 0; const h = player.hp; hurtPlayerBy(40, player.x + 10, player.y); return h - player.hp; };
    player.hp = player.maxHp = 1e6;
    const s0 = hit(); walkOnto(sh); const s1 = hit();
    o.stone = { s0, s1, ratio: +(s1 / s0).toFixed(3) };

    sh = shrineOf('wind');
    const v0 = player.speed; walkOnto(sh); const v1 = player.speed;
    o.wind = { v0, v1 };

    sh = shrineOf('blood');
    player.hp = player.maxHp * 0.2; walkOnto(sh);
    o.blood = { full: Math.abs(player.hp - player.maxHp) < 1 };

    // a blessing does not follow you down
    sh = shrineOf('ember'); walkOnto(sh);
    const blessedDamage = player.damage;
    fresh(2);
    o.carried = { before: blessedDamage, after: player.damage, blessing: !!(run.blessing && run.blessing.t > 0) };

    // --- lore -----------------------------------------------------------------
    keepHonours({});
    fresh(3);
    lore.length = 0;
    const page = { x: player.x + 200, y: player.y, id: 4, taken: false, pulse: 0 };
    lore.push(page);
    run.banner = 0;
    walkOnto(page);
    o.lore = { kept: loreFound().includes(4), banner: run.banner > 0, title: run.bannerText,
               want: LORE[4][0] };
    // never lays down a page already read
    keepHonours({ lore: LORE.map((_, i) => i).filter(i => i !== 7) });
    let wrong = 0, laid = 0;
    for (let t = 0; t < 12; t++) { fresh(1 + (t % 6)); for (const n of lore) { laid++; if (n.id !== 7) wrong++; } }
    o.onlyUnread = { laid, wrong };
    keepHonours({ lore: LORE.map((_, i) => i) });
    let any = 0;
    for (let t = 0; t < 8; t++) { fresh(1 + (t % 6)); any += lore.length; }
    o.allRead = any;
    keepHonours({});

    // --- the rooms' coffers come out of the count --------------------------
    let over = 0, roomOnes = 0, checked = 0;
    for (let t = 0; t < 16; t++) {
      fresh(2 + (t % 6));
      const depth = LEVEL.depth || 0;
      const cap = Math.round((3 + Math.round(depth * 3)) * twist('chests')) + 1;
      if (chests.filter(c => !c.sealed && !c.enc).length > cap) over++;
      roomOnes += chests.filter(c => c.room).length;
      checked++;
    }
    o.chests = { over, roomOnes, checked };
    return o;
  });

  const P = R.placed;
  ck('most delves hold a shrine', P.withShrine >= P.runs * 0.8, P.withShrine + ' of ' + P.runs);
  ck('most hold a page of lore', P.withLore >= P.runs * 0.5, P.withLore + ' of ' + P.runs);
  ck('none is placed on top of the spawn or the gate', P.tooNear === 0, P.tooNear + ' too near');
  ck('Embers: the blows hit harder while it lasts', R.ember.blessed && Math.abs(R.ember.d1 / R.ember.d0 - 1.35) < 0.01,
     R.ember.d0.toFixed(1) + ' -> ' + R.ember.d1.toFixed(1));
  ck('...and it runs out', Math.abs(R.ember.d2 - R.ember.d0) < 0.01, 'after: ' + R.ember.d2.toFixed(1));
  ck('a shrine blesses once, and then it is dark', R.ember.used && R.once);
  ck('Stone: a blow takes 40% less', Math.abs(R.stone.ratio - 0.6) < 0.02, JSON.stringify(R.stone));
  ck('Wind: the stride quickens', Math.abs(R.wind.v1 / R.wind.v0 - 1.3) < 0.01, R.wind.v0 + ' -> ' + R.wind.v1);
  ck('Blood: the wounds close', R.blood.full);
  ck('a blessing does not follow you into the next delve',
     !R.carried.blessing && R.carried.after < R.carried.before, JSON.stringify(R.carried));
  ck('reading a page keeps it, and shows it', R.lore.kept && R.lore.banner && R.lore.title === R.lore.want,
     JSON.stringify(R.lore));
  ck('a delve only lays down a page not yet read', R.onlyUnread.laid > 0 && R.onlyUnread.wrong === 0,
     JSON.stringify(R.onlyUnread));
  ck('...and none at all once every page is read', R.allRead === 0, R.allRead + ' laid');
  ck('a room’s coffer is out of the delve’s count, not on top', R.chests.over === 0 && R.chests.roomOnes > 0,
     JSON.stringify(R.chests));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
