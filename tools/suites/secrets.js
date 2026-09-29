/* HIDDEN ROOMS: a cracked wall, and a sealed room behind it.
 *
 *   - many delves have one, and none on top of the spawn or the gate
 *   - until the wall falls the room is rock: it blocks, it is not in the open
 *     cells, and its coffer is hidden and out of the delve's count
 *   - real blows at the crack bring it down -- not the first, the third
 *   - once down, the room is floor: standable, walkable from where you
 *     stood, on the flow field, and its coffer can be reached and opened
 *   - the chasms survive the walls being rebuilt
 *
 * WHAT WOULD MAKE THIS VACUOUS. "It opened" is one flag; the checks are all on
 * the things read off the grid, since a flag set with the grid left alone is
 * exactly the bug of a door that is open on paper and rock in the world.
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
  await p.waitForFunction(() => typeof placeCracks === 'function', null, { timeout: 30000 });

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
    const cellOf = (x, y) => gi(Math.floor(x / CELL_W), Math.floor(y / CELL_W));
    const isOpenCell = (x, y) => openCells.some(c => cellOf(c.x, c.y) === cellOf(x, y));

    // --- how often, and where ----------------------------------------------
    let runs = 0, withCrack = 0, tooNear = 0;
    for (let t = 0; t < 30; t++) {
      fresh(1 + (t % 10)); runs++;
      if (cracks.length) withCrack++;
      for (const cr of cracks) {
        if (dist2(cr.x, cr.y, player.x, player.y) < 380 * 380 ||
            dist2(cr.x, cr.y, portal.x, portal.y) < 280 * 280) tooNear++;
      }
    }
    o.placed = { runs, withCrack, tooNear };

    // --- one delve with a crack, taken apart ---------------------------------
    let tries = 0;
    do { fresh(2 + (tries % 8)); tries++; } while (!cracks.length && tries < 40);
    const cr = cracks[0];
    if (!cr) return o;
    const box = cr.mid;
    const sealed = chests.filter(c => c.sealed);
    o.before = {
      rock: pointInWalls(box.x, box.y, 0),
      notOpen: !isOpenCell(box.x, box.y),
      allSolid: cr.room.every(k => grid[k] === SOLID),
      sealedChest: sealed.length === 1,
      pits: walls.filter(w => w.pit).length,
      rev: wallRev,
    };
    // The count: the sealed coffer is on top of it, not in it.
    const depth = LEVEL.depth || 0;
    const cap = Math.round((3 + Math.round(depth * 3)) * twist('chests')) + 1;
    o.count = { unsealed: chests.filter(c => !c.sealed && !c.enc).length, cap };

    // Real blows. Stand on the floor in front of it and swing at it.
    const fx = cr.fx * CELL_W + CELL_W / 2, fy = cr.fy * CELL_W + CELL_W / 2;
    const ang = Math.atan2(cr.y - fy, cr.x - fx);
    const blow = () => {
      player.x = fx; player.y = fy; player.vx = player.vy = 0;
      attackAim(ang, 1); attackPress(); step(0.05); attackRelease();
      step(Math.max(0.5, (player.fireDelay || 0.4) + 0.2));
    };
    blow();
    o.first = { open: cr.open, blows: cr.blows };
    let n = 1;
    while (!cr.open && n < 8) { blow(); n++; }
    o.took = n;
    o.after = {
      open: cr.open,
      rock: pointInWalls(box.x, box.y, 0),
      door: !pointInWalls(cr.x, cr.y, 0),
      isOpen: isOpenCell(box.x, box.y),
      allOpen: cr.room.every(k => grid[k] === OPEN),
      unsealed: sealed[0] && !sealed[0].sealed,
      pits: walls.filter(w => w.pit).length,
      rev: wallRev,
      flow: flowDist ? flowDist[cellOf(box.x, box.y)] : -1,
    };
    // And walk in: from where you stood to the coffer, on the core's own
    // movement, by steering down the flow field's gradient.
    player.x = fx; player.y = fy;
    const ch = sealed[0];
    for (let i = 0; i < 600 && !ch.open; i++) {
      const dx = ch.x - player.x, dy = ch.y - player.y, d = Math.hypot(dx, dy) || 1;
      keys.clear();
      if (Math.abs(dx) > 6) keys.add(dx > 0 ? 'd' : 'a');
      if (Math.abs(dy) > 6) keys.add(dy > 0 ? 's' : 'w');
      update(1 / 60);
    }
    keys.clear();
    o.walked = { open: ch.open, dist: Math.round(Math.hypot(ch.x - player.x, ch.y - player.y)) };

    // A blast brings it down in one.
    tries = 0;
    do { fresh(2 + (tries % 8)); tries++; } while (!cracks.length && tries < 40);
    const c2 = cracks[0];
    if (c2) { hurtPropsNear(c2.x, c2.y, 60, 999); o.blast = c2.open; }
    return o;
  });

  const P = R.placed;
  ck('many delves have a cracked wall', P.withCrack >= P.runs * 0.45, P.withCrack + ' of ' + P.runs);
  ck('none beside the spawn or the gate', P.tooNear === 0, P.tooNear + ' too near');
  if (!R.before) { ck('found a delve with one to take apart', false); }
  else {
    ck('before: the room is rock, and not on the open ground',
       R.before.rock && R.before.notOpen && R.before.allSolid, JSON.stringify(R.before));
    ck('before: one coffer waits in it, hidden', R.before.sealedChest);
    ck('its coffer is on top of the delve’s count, the rest still inside it',
       R.count.unsealed <= R.count.cap, JSON.stringify(R.count));
    ck('the first blow does not bring it down', !R.first.open && R.first.blows === 1, JSON.stringify(R.first));
    ck('three real blows do', R.after.open && R.took === 3, 'took ' + R.took);
    ck('after: the room and the gap are floor', !R.after.rock && R.after.door && R.after.allOpen && R.after.isOpen,
       JSON.stringify(R.after));
    ck('after: the flow field reaches in', R.after.flow >= 0, 'flow ' + R.after.flow);
    ck('after: the coffer shows', R.after.unsealed);
    ck('the chasms survive the walls being rebuilt', R.after.pits === R.before.pits, R.before.pits + ' -> ' + R.after.pits);
    ck('the renderer is told to rebake', R.after.rev === R.before.rev + 1);
    ck('you can walk in and open it', R.walked.open, JSON.stringify(R.walked));
    ck('a blast brings one down in one', R.blast === true, String(R.blast));
  }
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
