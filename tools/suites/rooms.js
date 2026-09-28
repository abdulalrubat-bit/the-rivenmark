/* SET-PIECE ROOMS: the Slag-Moors are built of places, not empty boxes.
 *
 * Playtested: "it feels like a full game but hollow; the delves need more
 * stuff and proper layouts." Asked of many generated delves at once, because
 * a layout is dice and one map proves nothing:
 *
 *   - a Slag-Moors delve holds several named set pieces, and over enough
 *     delves every template turns up
 *   - dressing a room never seals it: most of its floor, and the gate, are
 *     still reachable from the spawn
 *   - the rooms are furnished: far more scenery inside a set piece than the
 *     same area of plain floor carries
 *   - walking into one says its name, once
 *   - a region that has not opted in is untouched (the old archetypes)
 *
 * WHAT WOULD MAKE THIS VACUOUS. A room that "is reachable" because the
 * flood fill turned it to rock would pass a check that only looked at the
 * cells still open -- so reachability is counted against the room's own
 * rectangle, and a room that lost its floor fails it.
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
  await p.waitForFunction(() => typeof dressSetPieces === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const slagRungs = LEVELS.map((L, i) => i).filter(i => LEVELS[i].regions.includes('slag') && i > 0).slice(0, 6);
    const out = { templates: Object.keys(ROOM_SETS).length, runs: 0, perRun: [], kinds: {}, sealed: [], gateCut: 0, dens: [], names: 0, errs: [] };
    const open = new Set();
    for (let t = 0; t < 30; t++) {
      const idx = slagRungs[t % slagRungs.length];
      stash = blankStash(); stash.region = 'slag';
      startRun('isaac', LEVELS[idx].id, 'riven');
      if (REGION.id !== 'slag') continue;
      out.runs++;
      const sets = rooms.filter(r => r.set);
      out.perRun.push(sets.length);
      open.clear();
      for (const c of openCells) open.add(Math.floor(c.x / CELL_W) + ',' + Math.floor(c.y / CELL_W));
      if (!open.has(Math.floor(portal.x / CELL_W) + ',' + Math.floor(portal.y / CELL_W))) out.gateCut++;
      for (const r of sets) {
        out.kinds[r.set] = (out.kinds[r.set] || 0) + 1;
        if (!r.name) out.errs.push('unnamed ' + r.set);
        // The room's floor is still ground you can reach from the spawn: a
        // room its shaping had sealed would have been filled in as rock by
        // the flood, and lost all of it.
        const bx = r.box, area = ((bx.x1 - bx.x0) / CELL_W) * ((bx.y1 - bx.y0) / CELL_W);
        let got = 0;
        for (let y = bx.y0 / CELL_W; y < bx.y1 / CELL_W; y++)
          for (let x = bx.x0 / CELL_W; x < bx.x1 / CELL_W; x++) if (open.has(x + ',' + y)) got++;
        // Against the floor the room had once it was shaped (a cut corner is
        // rock on purpose). Chasms are kept out of set pieces; the gate's
        // landmark, built after, may clip a cell or two of a room near it.
        if (got < r.floor * 0.9) out.sealed.push(r.set + ' ' + got + '/' + r.floor);
        // Scenery per open cell inside the room, against the floor outside
        // every set piece (the rooms themselves are a large share of the map,
        // so the delve's own average would be mostly them).
        const b = r.box;
        const inside = pr => pr.x > b.x0 && pr.x < b.x1 && pr.y > b.y0 && pr.y < b.y1;
        const inAny = pr => sets.some(s => pr.x > s.box.x0 && pr.x < s.box.x1 && pr.y > s.box.y0 && pr.y < s.box.y1);
        const cells = openCells.filter(inside).length || 1;
        const outCells = openCells.filter(c => !inAny(c)).length || 1;
        out.dens.push({ room: props.filter(inside).length / cells, all: props.filter(q => !inAny(q)).length / outCells });
      }
    }
    // Walking in says its name, once.
    stash = blankStash(); stash.region = 'slag';
    startRun('isaac', slagRungs[0] !== undefined ? LEVELS[slagRungs[0]].id : LEVELS[1].id, 'riven');
    const rm = rooms.find(r => r.set);
    if (rm) {
      player.hp = player.maxHp = 1e9; player.invuln = 1e9;
      for (const e of enemies) e.awake = false;
      run.toast = null;
      player.x = rm.x; player.y = rm.y;
      update(1 / 60);
      const first = run.toast && run.toast.text;
      run.toast = null;
      update(1 / 60);
      out.named = { first, again: run.toast && run.toast.text, want: rm.name };
    }
    // Another region keeps the older archetypes.
    stash = blankStash(); stash.region = 'vaelk';
    const deep = LEVELS.findIndex(L => L.regions.includes('vaelk'));
    startRun('isaac', LEVELS[deep].id, 'riven');
    out.other = { region: REGION.id, sets: rooms.filter(r => r.set).length };
    return out;
  });

  const avg = R.perRun.reduce((a, b) => a + b, 0) / Math.max(1, R.perRun.length);
  ck('Slag-Moors delves were generated', R.runs >= 20, R.runs + ' delves');
  ck('each holds several named set pieces', Math.min(...R.perRun) >= 3 && avg >= 4,
     'min ' + Math.min(...R.perRun) + ', mean ' + avg.toFixed(1));
  ck('over enough delves every template turns up',
     Object.keys(R.kinds).length === R.templates, JSON.stringify(R.kinds));
  ck('every one is named', R.errs.length === 0, R.errs.slice(0, 3).join(', '));
  ck('dressing a room never seals it', R.sealed.length === 0, R.sealed.length + ' sealed: ' + R.sealed.slice(0, 5).join(', '));
  ck('and the gate is always reachable', R.gateCut === 0, R.gateCut + ' cut off');
  const ratio = R.dens.map(d => d.room / Math.max(0.01, d.all)).sort((a, b) => a - b);
  const median = ratio[ratio.length >> 1] || 0, lowest = ratio[0] || 0;
  ck('a set piece is furnished well beyond the floor outside it', median >= 2 && lowest >= 1.25,
     'median ' + median.toFixed(1) + 'x, lowest ' + lowest.toFixed(1) + 'x');
  ck('walking in says its name', R.named && R.named.first === R.named.want, JSON.stringify(R.named));
  ck('...once', R.named && !R.named.again);
  ck('a region that has not opted in keeps the old rooms', R.other.region === 'vaelk' && R.other.sets === 0,
     JSON.stringify(R.other));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
