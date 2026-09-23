/* THE LADDER CAN GROW WITHOUT MOVING.
 *
 * Every rung's difficulty used to be its index over the number of rungs, so a
 * fifty-third would have made all fifty-two easier. It is pinned to the rung
 * now (CURVE_DEEP), and this holds it there: a ladder built longer must agree
 * with today's, field for field, on every rung today's has -- and the new
 * rungs past it must keep climbing rather than flattening or wrapping.
 *
 * WHAT WOULD MAKE THIS VACUOUS. Two ladders built the same length agree
 * trivially, so the comparison is 52 against 70; and the rolls a rung makes
 * (its mutators) are random, so both are built from the same seed.
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
  await p.waitForFunction(() => typeof buildLevels === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const seed = s => { let a = s; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const keep = L => JSON.stringify({ id: L.id, name: L.name, depth: L.depth, power: L.power, quota: L.quota,
      horde: L.horde, boss: L.boss, mutators: L.mutators, elites: L.elites, regions: L.regions });
    seed(9); const short = buildLevels(52);
    seed(9); const long = buildLevels(70);
    const moved = [];
    for (let i = 0; i < short.length; i++) if (keep(short[i]) !== keep(long[i])) moved.push(i);
    const tail = long.slice(51);
    const climbs = tail.every((L, k) => k === 0 || (L.depth > tail[k - 1].depth && L.quota >= tail[k - 1].quota &&
                                                    L.power >= tail[k - 1].power));
    return {
      moved, count: LEVELS.length, deep: LEVELS[LEVELS.length - 1].depth, curve: CURVE_DEEP,
      depthsExact: LEVELS.every((L, i) => Math.abs(L.depth - i / CURVE_DEEP) < 1e-12),
      climbs, past: long.slice(52).map(L => +L.depth.toFixed(3)).slice(0, 3),
      names: long.map(L => L.name).filter(n => !n || /undefined/.test(n)).length,
      lastName: long[69].name
    };
  });

  ck('the ladder is still fifty-two rungs, reaching 1 at the deepest', R.count === 52 && R.deep === 1,
     R.count + ' rungs, deepest ' + R.deep);
  ck('each rung’s depth is its own number over CURVE_DEEP', R.depthsExact);
  ck('a ladder built longer leaves every existing rung exactly as it was', R.moved.length === 0,
     R.moved.length ? 'rungs that moved: ' + R.moved.slice(0, 8).join(',') : '52 of 52 unchanged against a 70-rung ladder');
  ck('and the rungs past the old bottom keep climbing', R.climbs, 'depths ' + R.past.join(', ') + ', ...');
  ck('every rung has a name, however long the ladder', R.names === 0, 'rung 70: ' + R.lastName);
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
