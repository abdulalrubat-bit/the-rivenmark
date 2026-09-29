/* TALENTS: three trees a hero, points from levels, coin to take them back.
 *
 * Checked by what they do to the hero, measured on the sheet against the
 * same hero without them:
 *
 *   - a hero has (level - 1) points, and each hero spends their own
 *   - a rank changes the stat it says, by what it says, and stacks per rank
 *   - a tier stays shut until enough is in that tree; a talent built on
 *     another waits for that one to be mastered; no rank past the max, and
 *     nothing without a point
 *   - life on a kill heals on a kill; a longer blessing lasts longer
 *   - taking them all back costs coin, refunds every point, and the sheet
 *     goes back to what it was; without the coin it refuses
 *   - they are kept in the stash, and survive a save and a load
 *   - every tree's `req` points at a talent in the same column, above it
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
  await p.waitForFunction(() => typeof learnTalent === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    const fresh = (hero, level) => {
      stash = blankStash(); stash.level = level; stash.coins = 0;
      startRun(hero || 'isaac', LEVELS[1].id, 'riven');
      for (const e of enemies) e.hp = 0;
      enemies.length = 0;
    };

    // --- points ---------------------------------------------------------------
    fresh('isaac', 12);
    o.points = { isaac: talentPoints('isaac'), zayd: talentPoints('zayd') };
    learnTalent('isaac', 'ironhide');
    o.separate = { isaac: talentPoints('isaac').free, zayd: talentPoints('zayd').free };

    // --- a rank does what it says --------------------------------------------
    fresh('isaac', 30);
    const hp0 = player.maxHp, dmg0 = player.damage, fd0 = player.fireDelay, ward0 = player.ward;
    for (let i = 0; i < 5; i++) learnTalent('isaac', 'ironhide');
    const hp5 = player.maxHp;
    for (let i = 0; i < 5; i++) learnTalent('isaac', 'keen');
    for (let i = 0; i < 5; i++) learnTalent('isaac', 'quick');
    for (let i = 0; i < 5; i++) learnTalent('isaac', 'steadfast');
    o.stats = { hp: +(hp5 / hp0).toFixed(3), dmg: +(player.damage / dmg0).toFixed(3),
                fd: +(player.fireDelay / fd0).toFixed(3), ward: +(player.ward - ward0).toFixed(3) };

    // --- the gates --------------------------------------------------------------
    fresh('isaac', 30);
    o.tierShut = talentBlock('isaac', 'lastlight');         // tier 2, nothing in Bulwark
    o.reqShut = (() => {
      for (let i = 0; i < 5; i++) learnTalent('isaac', 'steadfast');
      for (let i = 0; i < 3; i++) learnTalent('isaac', 'mending');   // 8 in: tier 2 open
      learnTalent('isaac', 'ironhide');
      return { lastlight: talentBlock('isaac', 'lastlight'), oathward: talentBlock('isaac', 'oathward'),
               shieldwall: talentBlock('isaac', 'shieldwall') };
    })();
    o.overMax = (() => { for (let i = 0; i < 9; i++) learnTalent('isaac', 'mending'); return talentRanks('isaac').mending; })();
    fresh('isaac', 3);
    learnTalent('isaac', 'keen'); learnTalent('isaac', 'keen');
    o.noPoints = { third: talentBlock('isaac', 'keen'), rank: talentRanks('isaac').keen };

    // --- life on a kill, a longer blessing -------------------------------------
    fresh('isaac', 30);
    for (let i = 0; i < 5; i++) learnTalent('isaac', 'steadfast');
    for (let i = 0; i < 3; i++) learnTalent('isaac', 'mending');
    for (let i = 0; i < 3; i++) learnTalent('isaac', 'lastlight');
    player.hp = 10; player.regen = 0;
    const kind = Object.keys(ENEMY_TYPES).find(k => ENEMY_TYPES[k].speed > 0 && k !== 'mirage');
    const e = newBody(kind, player.x + 60, player.y, 0);
    enemies.push(e);
    const before = player.hp;
    damageEnemy(e, 1e9, e.x, e.y);
    o.killHeal = +(player.hp - before).toFixed(2);
    fresh('isaac', 30);
    for (let i = 0; i < 5; i++) learnTalent('isaac', 'windstep');
    for (let i = 0; i < 3; i++) learnTalent('isaac', 'shrinekept');
    bless({ x: player.x, y: player.y, id: 'ember', used: false, pulse: 0 });
    o.bless = +(run.blessing.max / SHRINES.ember.last).toFixed(3);

    // --- taking them back ---------------------------------------------------------
    fresh('isaac', 30);
    const base = player.maxHp;
    for (let i = 0; i < 5; i++) learnTalent('isaac', 'ironhide');
    const cost = talentResetCost('isaac');
    stash.coins = cost - 1;
    o.broke = resetTalents('isaac');
    stash.coins = cost + 7;
    o.reset = { why: resetTalents('isaac'), coins: stash.coins, free: talentPoints('isaac').free,
                total: talentPoints('isaac').total, back: Math.abs(player.maxHp - base) < 1e-6, cost };

    // --- kept -------------------------------------------------------------------------
    // Through the loader the real save goes through (sanitizeStash), which
    // keeps only what it knows: a field it forgets is a field every restart
    // throws away. The level is derived from XP on load, so XP is set to match.
    fresh('zayd', 20);
    stash.xp = xpForLevel(20);
    for (let i = 0; i < 4; i++) learnTalent('zayd', 'honed');
    const round = sanitizeStash(JSON.parse(JSON.stringify(stash)));
    o.kept = (round.talents && round.talents.zayd && round.talents.zayd.honed) || 0;
    // More ranks than the level gives: handed back, not kept.
    const bent = JSON.parse(JSON.stringify(stash)); bent.xp = 0;
    o.overspent = Object.keys(sanitizeStash(bent).talents.zayd || {}).length;
    const odd = JSON.parse(JSON.stringify(stash)); odd.talents.zayd.honed = 99; odd.talents.zayd.nosuch = 3;
    const oc = sanitizeStash(odd).talents.zayd;
    o.clamped = { honed: oc.honed, nosuch: oc.nosuch };

    // --- the trees are well formed ---------------------------------------------
    const bad = [];
    for (const h in TALENTS) for (const tr of TALENTS[h]) {
      const seen = new Set();
      for (const t of tr.talents) {
        const key = t.tier + ',' + t.col;
        if (seen.has(key)) bad.push(h + '/' + t.id + ' shares a cell');
        seen.add(key);
        if (t.req) {
          const q = tr.talents.find(x => x.id === t.req);
          if (!q) bad.push(h + '/' + t.id + ' req outside its tree');
          else if (q.col !== t.col || q.tier >= t.tier) bad.push(h + '/' + t.id + ' req not straight above');
        }
      }
    }
    o.shape = { trees: Object.fromEntries(Object.entries(TALENTS).map(([h, v]) => [h, v.length])), bad };
    return o;
  });

  ck('a hero has a point a level past the first', R.points.isaac.total === 11 && R.points.isaac.free === 11,
     JSON.stringify(R.points));
  ck('and each hero spends their own', R.separate.isaac === 10 && R.separate.zayd === 11, JSON.stringify(R.separate));
  ck('Ironhide x5: +20% life', Math.abs(R.stats.hp - 1.2) < 0.005, JSON.stringify(R.stats));
  ck('Keen Edge x5: +20% damage', Math.abs(R.stats.dmg - 1.2) < 0.005);
  ck('Quick Hand x5: the blade 15% faster', Math.abs(R.stats.fd - 0.85) < 0.005);
  ck('Steadfast x5: +7.5% ward', Math.abs(R.stats.ward - 0.075) < 0.002);
  ck('a tier is shut until enough is in the tree', /points in Bulwark/.test(R.tierShut || ''), R.tierShut);
  ck('a talent built on another waits for it to be mastered',
     R.reqShut.lastlight === null && /Steadfast/.test('') === false && R.reqShut.oathward === null &&
     /master Ironhide/.test(R.reqShut.shieldwall || ''), JSON.stringify(R.reqShut));
  ck('no rank past the max', R.overMax === 3, String(R.overMax));
  ck('nothing without a point', /no points/.test(R.noPoints.third || '') && R.noPoints.rank === 2,
     JSON.stringify(R.noPoints));
  ck('Last Light x3: 6 life back on a kill', Math.abs(R.killHeal - 6) < 0.01, String(R.killHeal));
  ck('Shrine-Kept x3: blessings last 45% longer', Math.abs(R.bless - 1.45) < 0.005, String(R.bless));
  ck('taking them back without the coin is refused', /costs/.test(R.broke || ''), R.broke);
  ck('with it: every point back, the coin taken, the sheet as it was',
     R.reset.why === null && R.reset.coins === 7 && R.reset.free === R.reset.total && R.reset.back,
     JSON.stringify(R.reset));
  ck('talents survive a save and a load', R.kept === 4, String(R.kept));
  ck('a save with more ranks than its level gives has them handed back', R.overspent === 0, String(R.overspent));
  ck('a rank past the max is clamped, an unknown talent dropped',
     R.clamped.honed === 5 && R.clamped.nosuch === undefined, JSON.stringify(R.clamped));
  ck('three trees a hero, and every arrow runs straight down',
     R.shape.trees.isaac === 3 && R.shape.trees.zayd === 3 && !R.shape.bad.length, JSON.stringify(R.shape));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
