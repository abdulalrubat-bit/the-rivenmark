/* THE DEAD FIRTH: its own rooms, and the ash that holds you.
 *
 *   - a Firth delve lays the shoals: banks of deep ash, on bare floor, with
 *     hard ground between them
 *   - wading a drift costs the hero a bit under half their stride, and a
 *     body of the horde the same -- and nobody on the hard floor beside it
 *   - the ash holds; it never hurts
 *   - every Firth room has its own air, and its event
 *
 * Measured on a single frame's step, so the body cannot leave the cell it is
 * being measured in.
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
  await p.waitForFunction(() => typeof FIRTH_SETS === 'object', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = { delves: 0, shoals: 0, cells: [], propsOn: 0 };
    const rungs = LEVELS.map((L, i) => i).filter(i => LEVELS[i].regions.includes('firth') && i > 0).slice(0, 6);
    const C = CELL_W;
    let keep = false;
    for (let t = 0; t < 40 && !keep; t++) {
      stash = blankStash(); stash.region = 'firth';
      startRun('isaac', LEVELS[rungs[t % rungs.length]].id, 'riven');
      if (REGION.id !== 'firth') continue;
      o.delves++;
      for (const rm of rooms.filter(r => r.set === 'shoals')) {
        o.shoals++;
        const A = rm.meta.ash || [];
        o.cells.push(A.length);
        const S = new Set(A.map(([x, y]) => x + ',' + y));
        for (const pr of props) if (S.has(Math.floor(pr.x / C) + ',' + Math.floor(pr.y / C))) o.propsOn++;
        keep = keep || A.length >= 8;
      }
    }
    o.found = keep;
    if (!keep) return o;
    const tr = traps.find(q => q.kind === 'ash');
    o.hasTrap = !!tr && ashCells.size > 0;
    if (!tr) return o;
    for (const e of enemies) e.hp = 0;
    enemies.length = 0; encounters.length = 0;
    for (let i = traps.length - 1; i >= 0; i--) if (traps[i] !== tr) traps.splice(i, 1);
    player.maxHp = 1000; player.hp = 1000; player.invuln = 1e9;

    // A drift cell with drift either side along x, and a hard-floor cell
    // clear of all of it, with floor either side.
    const ashAt = (cx, cy) => ashCells.has(gi(cx, cy));
    const deep = tr.list.find(([x, y]) => ashAt(x - 1, y) && ashAt(x + 1, y)) || tr.list[0];
    const hard = openCells.map(c => [Math.floor(c.x / C), Math.floor(c.y / C)])
      .find(([x, y]) => !ashAt(x, y) && !ashAt(x - 1, y) && !ashAt(x + 1, y) &&
            cellAt(x - 1, y) !== SOLID && cellAt(x + 1, y) !== SOLID && !pointInWalls(x * C + C / 2, y * C + C / 2, 30));
    const centre = ([x, y]) => ({ x: x * C + C / 2, y: y * C + C / 2 });
    const step = at => {
      player.x = at.x; player.y = at.y; player.channel = null; player.cleave = 0; player.rush = 0;
      stick.active = true; stick.dx = 1; stick.dy = 0; stick.mag = 1;
      const x0 = player.x; update(1 / 60);
      stick.active = false; stick.mag = 0;
      return player.x - x0;
    };
    o.heroAsh = step(centre(deep));
    o.heroHard = step(centre(hard));
    o.hurt = 1000 - player.hp;

    // A body of the horde, one frame, walking at the hero off to the east.
    const walk = at => {
      for (const e of enemies) e.hp = 0; enemies.length = 0;
      const e = placeEnemy('thrall', at.x, at.y, 0.5);
      e.awake = true;
      player.x = at.x + 600; player.y = at.y;
      const x0 = e.x, y0 = e.y;
      enemyGrid.clear(); enemyGrid.insert(e, e.x, e.y);
      update(1 / 60);
      return Math.hypot(e.x - x0, e.y - y0);
    };
    const ea = [], eh = [];
    for (let i = 0; i < 6; i++) { ea.push(walk(centre(deep))); eh.push(walk(centre(hard))); }
    const med = a => a.sort((x, y) => x - y)[a.length >> 1];
    o.enemyAsh = med(ea); o.enemyHard = med(eh);

    o.moods = Object.keys(FIRTH_SETS).filter(id => !ROOM_MOODS[id]);
    o.events = Object.keys(FIRTH_SETS).filter(id => !ENCOUNTERS[id]);
    return o;
  });

  ck('Firth delves lay the shoals', R.found, R.shoals + ' shoal(s) in ' + R.delves + ' delve(s)');
  ck('with banks of drift', R.cells.length && Math.min(...R.cells) >= 8, R.cells.join(' '));
  ck('on bare floor', R.propsOn === 0, R.propsOn + ' props on the ash');
  ck('the shoals carry their ash', R.hasTrap);
  const hr = R.heroAsh / R.heroHard;
  ck('wading a drift costs the hero a bit under half their stride', Math.abs(hr - 0.55) < 0.06,
     (R.heroAsh || 0).toFixed(2) + ' against ' + (R.heroHard || 0).toFixed(2) + ' a frame (' + (hr || 0).toFixed(2) + 'x)');
  const er = R.enemyAsh / R.enemyHard;
  ck('and the horde the same', er > 0.4 && er < 0.7,
     (R.enemyAsh || 0).toFixed(2) + ' against ' + (R.enemyHard || 0).toFixed(2) + ' (' + (er || 0).toFixed(2) + 'x)');
  ck('the ash holds, it never hurts', R.hurt === 0, String(R.hurt));
  ck('every Firth room has its own air', R.moods && R.moods.length === 0, JSON.stringify(R.moods));
  ck('every Firth room has its event', R.events && R.events.length === 0, JSON.stringify(R.events));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
