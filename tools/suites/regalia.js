/* WHERE THE REGALIA LIES.
 *
 * The set was sundered across the five regions and each one kept what fell in
 * it, so farming a single rung for eight random slots is no longer the fastest
 * way to finish it. Three things have to hold for that to be true rather than
 * merely said:
 *
 *   every slot is claimed by exactly one region, or some piece has nowhere to
 *   come from and the set cannot be completed at all;
 *
 *   the ground a delve is cut from actually biases what drops in it -- and
 *   does NOT lock it, because a player who cannot beat the Rot-Weald must
 *   still be able to finish, which is what the reliquary's pity price is for;
 *
 *   and the choice reaches the delve. Naming a region's pieces is advice
 *   nobody can act on unless asking for that ground is a thing you can do.
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
    const o = {};
    stash = blankStash(); saveStash();

    // --- the table -------------------------------------------------------
    const claimed = [];
    for (const id in REGION_RELIC) claimed.push(...REGION_RELIC[id]);
    o.claimed = claimed.slice().sort();
    o.slots = SLOTS.map(s => s.id).sort();
    o.regions = Object.keys(REGION_RELIC).sort();
    o.allRegions = REGIONS.map(r => r.id).sort();

    // --- the bias --------------------------------------------------------
    // Rolled through rollSetPiece, not relicSlotFor, so this measures the
    // path a real drop takes rather than the helper underneath it.
    const roll = (regionId, n) => {
      REGION = REGION_BY_ID[regionId];
      const got = {};
      for (let i = 0; i < n; i++) {
        const it = rollSetPiece();
        got[it.slot] = (got[it.slot] || 0) + 1;
      }
      return got;
    };
    const share = (got, slots, n) =>
      slots.reduce((a, s) => a + (got[s] || 0), 0) / n;
    const N = 4000;
    o.here = {}; o.elsewhere = {};
    for (const id in REGION_RELIC) {
      const got = roll(id, N);
      o.here[id] = +share(got, REGION_RELIC[id], N).toFixed(3);
      // What that same set of slots is worth in a region that does NOT keep
      // them. Without this, "70% of drops were rings in the Rot-Weald" could
      // just mean rings are 70% of everything.
      const other = Object.keys(REGION_RELIC).find(r => r !== id);
      o.elsewhere[id] = +share(roll(other, N), REGION_RELIC[id], N).toFixed(3);
      // And every slot must still be reachable from anywhere, or the set is
      // hostage to one delve.
      o[id + 'Slots'] = Object.keys(roll(id, N)).length;
    }

    // --- the choice reaches the delve -------------------------------------
    // A deep rung, which is the only kind cut from more than one region.
    const deep = LEVELS.find(l => l.regions.length >= 3);
    o.deepId = deep && deep.id;
    o.deepPool = deep ? deep.regions.slice() : [];
    const cut = (want, id, n) => {
      stash.region = want;
      const seen = {};
      for (let i = 0; i < n; i++) { startRun('isaac', id, 'riven'); seen[REGION.id] = 1; }
      return Object.keys(seen).sort();
    };
    if (deep) {
      o.asked = cut(deep.regions[deep.regions.length - 1], deep.id, 12);
      o.rolled = cut(null, deep.id, 40);
      // Asking for ground this rung is not cut from must be ignored rather
      // than obeyed -- otherwise a stale choice from a deeper rung silently
      // reskins a shallow delve into a region it has no business being.
      const shallow = LEVELS.find(l => l.regions.length === 1 &&
                                       l.regions[0] !== deep.regions[deep.regions.length - 1]);
      o.shallowId = shallow && shallow.id;
      o.ignored = shallow
        ? cut(deep.regions[deep.regions.length - 1], shallow.id, 8) : null;
      o.shallowPool = shallow ? shallow.regions.slice() : [];
    }
    stash.region = null;
    return o;
  });

  ck('every Regalia slot is kept by exactly one region',
     R.claimed.join(',') === R.slots.join(','),
     R.claimed.length + ' claimed against ' + R.slots.length + ' slots: ' + R.claimed.join(' '));
  ck('and every region keeps something', R.regions.join(',') === R.allRegions.join(','),
     R.regions.join(' ') + ' against ' + R.allRegions.join(' '));

  for (const id of R.regions) {
    ck('the ' + id + ' ground favours what it keeps',
       R.here[id] > R.elsewhere[id] * 1.6 && R.here[id] > 0.5,
       (R.here[id] * 100).toFixed(0) + '% of its drops, against ' +
       (R.elsewhere[id] * 100).toFixed(0) + '% of the same slots elsewhere');
  }
  ck('but no region locks the rest of the set away',
     R.regions.every(id => R[id + 'Slots'] === R.slots.length),
     R.regions.map(id => id + ' ' + R[id + 'Slots'] + '/' + R.slots.length).join(', '));

  ck('a rung cut from several regions exists to choose between',
     R.deepPool.length >= 3, R.deepId + ': ' + R.deepPool.join(' '));
  ck('asking for one ground gets that ground, every time',
     R.asked && R.asked.length === 1 &&
     R.asked[0] === R.deepPool[R.deepPool.length - 1],
     'twelve delves came out as ' + (R.asked || []).join(' '));
  ck('and asking for none still rolls', R.rolled && R.rolled.length > 1,
     'forty delves came out as ' + (R.rolled || []).join(' '));
  ck('a choice the rung cannot honour is ignored, not obeyed',
     R.ignored && R.ignored.length === 1 && R.ignored[0] === R.shallowPool[0],
     R.shallowId + ' is cut from ' + (R.shallowPool || []).join(' ') +
     ' and came out as ' + (R.ignored || []).join(' '));

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
