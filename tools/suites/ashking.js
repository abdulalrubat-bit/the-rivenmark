/* THE SLAG-MOORS' OWN: the Ash-King, and his ember imps.
 *
 *   - on a Deceiver's rung past the teaching ramp, a delve cut from the Moors
 *     meets the Ash-King instead; the ramp, other ground, and the Crucible's
 *     and the Choir's rungs keep what they had
 *   - his wave is lines of fire rolled OUT from him (each block a beat after
 *     the one inside it), with safe ground between the lines, and more lines
 *     once he is below half
 *   - he calls his imps, and no more than the cap
 *   - he is an avatar: putting him down opens the gate, and his imps go out
 *   - the imps walk only the Moors, and leave embers where they die
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
  await p.waitForFunction(() => typeof spawnRegionBoss === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    // A rung that is the Deceiver's, past the ramp, that the Moors can cut.
    const idx = LEVELS.findIndex((L, i) => L.boss === 'deceiver' && !L.lesson && L.regions.includes('slag') && L.regions.length > 1);
    const ramp = LEVELS.findIndex((L, i) => i > 0 && L.boss === 'deceiver' && L.lesson && L.regions.includes('slag'));
    const cru = LEVELS.findIndex(L => L.boss === 'crucible' && L.regions.includes('slag'));
    const other = LEVELS[idx].regions.find(r => r !== 'slag');
    const meet = (i, reg) => {
      stash = blankStash(); stash.region = reg;
      startRun('isaac', LEVELS[i].id, 'riven');
      if (REGION.id !== reg) return 'wrong region ' + REGION.id;
      for (const e of enemies) e.hp = 0; enemies.length = 0;
      spawnBoss();
      return run.boss ? (run.boss.kind || run.boss.title) : 'none';
    };
    o.moors = meet(idx, 'slag');
    o.otherGround = meet(idx, other);
    o.ramp = ramp >= 0 ? meet(ramp, 'slag') : 'no ramp rung';
    o.crucible = cru >= 0 ? meet(cru, 'slag') : 'crucible';
    o.card = bossNote(LEVELS[idx]);

    // --- the king ----------------------------------------------------------
    meet(idx, 'slag');
    const k = run.boss;
    o.avatar = isAvatar(k);
    player.hp = player.maxHp = 1e9; player.invuln = 1e9;
    player.x = k.x + 900; player.y = k.y;
    // The wave.
    slams.length = 0;
    k.wave = 0.001; k.call = 99;
    ashKingTick(k, 0.01);
    const S = slams.filter(q => q.molten);
    o.blocks = S.length;
    const ang = q => Math.atan2(q.y - k.y, q.x - k.x);
    const angles = [...new Set(S.map(q => Math.round(ang(q) * 10) / 10))];
    o.lines = angles.length;
    // Rolls outward: a block further out lands later.
    const byLine = {};
    for (const q of S) (byLine[Math.round(ang(q) * 10)] = byLine[Math.round(ang(q) * 10)] || []).push(q);
    o.outward = Object.values(byLine).every(L => {
      L.sort((a, c) => Math.hypot(a.x - k.x, a.y - k.y) - Math.hypot(c.x - k.x, c.y - k.y));
      return L.every((q, i) => i === 0 || q.wind > L[i - 1].wind);
    });
    // Safe ground between two lines, at 200 out.
    const a0 = Math.min(...S.map(ang));
    const mid = a0 + Math.PI / o.lines;
    const sx = k.x + Math.cos(mid) * 200, sy = k.y + Math.sin(mid) * 200;
    o.gapSafe = !S.some(q => Math.hypot(q.x - sx, q.y - sy) < q.r + 14);
    // Below half: more lines.
    slams.length = 0; k.hp = k.maxHp * 0.4; k.wave = 0.001;
    ashKingTick(k, 0.01);
    o.linesHalf = new Set(slams.filter(q => q.molten).map(q => Math.round(ang(q) * 10) / 10)).size;
    // The call, and its cap.
    const before = enemies.filter(q => q.kind === 'imp').length;
    k.wave = 99; k.call = 0.001; ashKingTick(k, 0.01);
    o.called = enemies.filter(q => q.kind === 'imp').length - before;
    for (let i = 0; i < 6; i++) { k.call = 0.001; ashKingTick(k, 0.01); }
    o.impsCapped = enemies.filter(q => q.kind === 'imp' && q.called && q.hp > 0).length;
    // An imp dies: embers where it fell.
    const imp = enemies.find(q => q.kind === 'imp' && q.hp > 0);
    const hz0 = hazards.length;
    damageEnemy(imp, 1e6, imp.x, imp.y);
    o.embers = hazards.length > hz0 && Math.hypot(hazards[hazards.length - 1].x - imp.x, hazards[hazards.length - 1].y - imp.y) < 1;
    // Down: the gate answers, his imps go out.
    damageEnemy(k, 1e9, k.x, k.y);
    o.down = run.bossDown === true && !run.boss;
    o.impsLeft = enemies.filter(q => q.kind === 'imp' && q.called && q.hp > 0).length;

    // --- the imps walk only the Moors ---------------------------------------
    stash = blankStash(); stash.region = 'slag'; startRun('isaac', LEVELS[idx].id, 'riven');
    o.impOnMoors = rosterHere().includes('imp');
    stash = blankStash(); stash.region = other; startRun('isaac', LEVELS[idx].id, 'riven');
    o.impElsewhere = rosterHere().includes('imp');
    return o;
  });

  ck('a Deceiver rung cut from the Moors meets the Ash-King', R.moors === 'ashking', R.moors);
  ck('the same rung on other ground keeps the Deceiver', R.otherGround === 'deceiver', R.otherGround);
  ck('the teaching ramp keeps the Deceiver, even on the Moors', R.ramp === 'deceiver', R.ramp);
  ck('the Crucible keeps its own rungs', R.crucible === 'crucible', R.crucible);
  ck('the rung card says the ground may have a lord', /lord/.test(R.card), R.card);
  ck('he is an avatar', R.avatar);
  ck('his wave is four lines of fire', R.lines === 4 && R.blocks >= 16, R.lines + ' lines, ' + R.blocks + ' blocks');
  ck('rolled outward, each block a beat after the one inside it', R.outward);
  ck('with safe ground between the lines', R.gapSafe);
  ck('six lines once he is below half', R.linesHalf === 6, String(R.linesHalf));
  ck('he calls three imps', R.called === 3, String(R.called));
  ck('and never more than eight', R.impsCapped <= 8, String(R.impsCapped));
  ck('an imp leaves embers where it dies', R.embers);
  ck('putting him down opens the gate', R.down);
  ck('and his imps go out with him', R.impsLeft === 0, String(R.impsLeft));
  ck('imps walk the Moors', R.impOnMoors);
  ck('and nowhere else', !R.impElsewhere);
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
