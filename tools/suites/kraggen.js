/* KRAGGEN-TOR: its own rooms, and the rift that erupts.
 *
 *   - a Kraggen delve builds the rift: a lava fissure run the length of the
 *     room, joined cell to cell, and nothing furnished on top of it
 *   - the crack tells before it erupts, and does nothing while quiet
 *   - erupting, it burns whoever stands on it -- the hero once an eruption,
 *     for a share of their life -- and nobody standing beside it
 *   - it burns the horde too: bait a pack across it
 *   - every Kraggen room has its own air, and its event
 *
 * WHAT WOULD MAKE THIS VACUOUS. "Nobody beside it" is asked one cell off the
 * crack, not across the room, and "nothing on it" of every prop in the delve.
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
  await p.waitForFunction(() => typeof KRAG_SETS === 'object', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = { delves: 0, rifts: 0, short: [], broken: 0, propsOn: 0 };
    const rungs = LEVELS.map((L, i) => i).filter(i => LEVELS[i].regions.includes('kraggen') && i > 0).slice(0, 6);
    const C = CELL_W;
    let keep = false;
    for (let t = 0; t < 40 && !keep; t++) {
      stash = blankStash(); stash.region = 'kraggen';
      startRun('isaac', LEVELS[rungs[t % rungs.length]].id, 'riven');
      if (REGION.id !== 'kraggen') continue;
      o.delves++;
      for (const rm of rooms.filter(r => r.set === 'rift')) {
        o.rifts++;
        const L = rm.meta.lava;
        const long = Math.max(rm.box.x1 - rm.box.x0, rm.box.y1 - rm.box.y0) / C;
        if (L.length < long * 0.8) o.short.push(L.length + '/' + long);
        // Joined: every cell touches another (4-way).
        const S = new Set(L.map(([x, y]) => x + ',' + y));
        for (const [x, y] of L)
          if (L.length > 1 && ![[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => S.has((x + dx) + ',' + (y + dy)))) o.broken++;
        for (const pr of props) if (S.has(Math.floor(pr.x / C) + ',' + Math.floor(pr.y / C))) o.propsOn++;
        keep = true;
      }
    }
    o.found = keep;
    if (!keep) return o;

    const rm = rooms.find(r => r.set === 'rift');
    const tr = traps.find(t => t.kind === 'lava');
    o.hasTrap = !!tr;
    if (!tr) return o;
    for (const e of enemies) e.hp = 0;
    enemies.length = 0; encounters.length = 0;
    // Hazards and slams go through the i-frames too; one left burning where
    // the delve was built would be counted as the crack's.
    hazards.length = 0; slams.length = 0;
    for (let i = traps.length - 1; i >= 0; i--) if (traps[i] !== tr) traps.splice(i, 1);
    player.maxHp = 1000; player.hp = 1000;
    const step = n => { for (let i = 0; i < n; i++) update(1 / 60); };
    const toTell = () => { tr.t = LAVA_CYCLE - LAVA_OUT - LAVA_TELL - 0.02; tr.was = 'down'; };
    // A cell in the middle of the crack, and the floor one step off it.
    const [cx, cy] = tr.list[tr.list.length >> 1];
    const on = { x: cx * C + C / 2, y: cy * C + C / 2 };
    const offCell = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx, dy]) => [cx + dx, cy + dy])
      .find(([x, y]) => !tr.cells.has(gi(x, y)) && cellAt(x, y) !== SOLID);
    const off = { x: offCell[0] * C + C / 2, y: offCell[1] * C + C / 2 };
    // Immune to everything but the floor: the rift takes its toll through the
    // hero's invulnerability (as the spikes and the wind do), and whatever
    // else wanders up mid-measurement does not -- so only the lava is counted.
    const pin = q => { player.x = q.x; player.y = q.y; player.invuln = 1e9; };

    // Quiet: standing on it costs nothing.
    tr.t = 0.1; tr.was = 'down'; pin(on);
    step(30); o.quietHurt = 1000 - player.hp;
    // The tell comes first, and costs nothing either.
    player.hp = 1000; toTell(); pin(on); step(3);
    o.tellPhase = lavaPhase(tr.t).phase;
    step(Math.round(LAVA_TELL * 60) - 8); o.tellHurt = 1000 - player.hp;
    // Erupting: once, on the crack.
    player.hp = 1000; toTell(); pin(on);
    for (let i = 0; i < Math.round((LAVA_TELL + LAVA_OUT) * 60) + 4; i++) { player.x = on.x; player.y = on.y; player.invuln = 1e9; update(1 / 60); }
    o.burn = 1000 - player.hp; o.toll = player.maxHp * LAVA_TOLL;
    // One step off it: nothing.
    player.hp = 1000; toTell(); pin(off);
    for (let i = 0; i < Math.round((LAVA_TELL + LAVA_OUT) * 60) + 4; i++) { player.x = off.x; player.y = off.y; player.invuln = 1e9; update(1 / 60); }
    o.besideHurt = 1000 - player.hp;
    // The horde, on the crack; the hero well clear.
    player.x = rm.x + 2000; player.y = rm.y;
    const e = placeEnemy('thrall', on.x, on.y, 0.5);
    e.awake = true; e.speed = 0;
    const eh = e.maxHp;
    toTell();
    for (let i = 0; i < Math.round((LAVA_TELL + LAVA_OUT) * 60) + 4; i++) { e.x = on.x; e.y = on.y; update(1 / 60); }
    o.enemyLost = (eh - Math.max(0, e.hp)) / eh;

    o.moods = Object.keys(KRAG_SETS).filter(id => !ROOM_MOODS[id]);
    o.events = Object.keys(KRAG_SETS).filter(id => !ENCOUNTERS[id]);
    return o;
  });

  ck('Kraggen delves build the rift', R.found, R.rifts + ' rift(s) in ' + R.delves + ' delve(s)');
  ck('the fissure runs the length of the room', R.short.length === 0, R.short.join(', '));
  ck('and is one crack, joined cell to cell', R.broken === 0, R.broken + ' loose cells');
  ck('nothing is furnished on top of it', R.propsOn === 0, R.propsOn + ' props on the crack');
  ck('the rift carries its eruption', R.hasTrap);
  ck('quiet, the crack costs nothing', R.quietHurt === 0, String(R.quietHurt));
  ck('it tells before it erupts, and the tell costs nothing', R.tellPhase === 'tell' && R.tellHurt === 0,
     R.tellPhase + ', ' + R.tellHurt);
  ck('erupting, it burns what stands on it, once', Math.abs(R.burn - R.toll) < R.toll * 0.35,
     (R.burn || 0).toFixed(0) + ' against ' + (R.toll || 0).toFixed(0));
  ck('and nothing one step off it', R.besideHurt === 0, String(R.besideHurt));
  ck('it burns the horde too', R.enemyLost >= 0.35, ((R.enemyLost || 0) * 100).toFixed(0) + '%');
  ck('every Kraggen room has its own air', R.moods && R.moods.length === 0, JSON.stringify(R.moods));
  ck('every Kraggen room has its event', R.events && R.events.length === 0, JSON.stringify(R.events));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
