/* THE RENDING GORGES: their own rooms, and the wind down the span.
 *
 *   - a Gorges delve builds the span: a real chasm across the room (holes,
 *     not masonry) with a bridge over it, and the far side still reachable
 *   - the wind tells before it blows, and blows along the chasm
 *   - on solid ground it only shoves you; on the bridge it throws you at the
 *     edge, once a gust, for a share of your life
 *   - the horde is lighter: one caught on the bridge goes over for most of
 *     its life
 *   - every Gorges room has its own air, and its events are laid in
 *
 * WHAT WOULD MAKE THIS VACUOUS. "The bridge is reachable" is asked of the
 * cells past the chasm, not of the bridge itself, so a span that cut the room
 * in two -- or a chasm that never got cut -- fails it.
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
  await p.waitForFunction(() => typeof GORGE_SETS === 'object', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = { spans: 0, cut: [], farCut: 0, encs: 0, delves: 0 };
    const rungs = LEVELS.map((L, i) => i).filter(i => LEVELS[i].regions.includes('vaelk') && i > 0).slice(0, 6);
    const C = CELL_W;
    let keep = null;
    for (let t = 0; t < 40; t++) {
      stash = blankStash(); stash.region = 'vaelk';
      startRun('isaac', LEVELS[rungs[t % rungs.length]].id, 'riven');
      if (REGION.id !== 'vaelk') continue;
      o.delves++;
      o.encs += encounters.length;
      const open = new Set(openCells.map(c => Math.floor(c.x / C) + ',' + Math.floor(c.y / C)));
      for (const rm of rooms.filter(r => r.set === 'span')) {
        o.spans++;
        const g = rm.meta.gust, br = g.bridge;
        const at = (bb, a) => g.axis === 'y' ? [bb, a] : [a, bb];
        let holes = 0;
        for (const bb of [br.b0, br.b1])
          for (const a of [br.a - 2, br.a - 3, br.a + 2, br.a + 3]) {
            const [x, y] = at(bb, a);
            if (pitGrid[gi(x, y)]) holes++;
          }
        o.cut.push(holes);
        // Past the chasm: the cell beyond the bridge, on the far side.
        const [fx, fy] = at(br.b1 + 1, br.a);
        if (!open.has(fx + ',' + fy)) o.farCut++;
        if (!keep && holes === 8) keep = true;
      }
      if (keep) break;
    }
    o.found = !!keep;
    if (!keep) return o;

    // The wind, on the span we kept.
    const rm = rooms.find(r => r.set === 'span');
    const tr = traps.find(t => t.kind === 'gust');
    o.hasTrap = !!tr;
    if (!tr) return o;
    for (const e of enemies) e.hp = 0;
    enemies.length = 0;
    // The span's own event would raise a pack the moment the hero walks in,
    // and their blows would be counted as the wind's. And no other trap.
    encounters.length = 0;
    for (let i = traps.length - 1; i >= 0; i--) if (traps[i] !== tr) traps.splice(i, 1);
    player.hp = player.maxHp = 1000;
    const g = rm.meta.gust, br = g.bridge;
    const W = (bb, a) => g.axis === 'y' ? { x: bb * C + C, y: a * C + C / 2 } : { x: a * C + C / 2, y: bb * C + C };
    const toTell = () => { tr.t = GUST_CYCLE - GUST_OUT - GUST_TELL - 0.02; tr.was = 'down'; };
    const step = n => { for (let i = 0; i < n; i++) update(1 / 60); };

    // The tell comes first, and nothing moves in it.
    const floor = openCells.filter(c => inBox(rm.box, c.x, c.y, 50) && !pointInWalls(c.x, c.y, 40) &&
      Math.abs((g.axis === 'y' ? c.x : c.y) - W(br.b0, br.a)[g.axis === 'y' ? 'x' : 'y']) > C * 2.5);
    const spot = floor[0];
    player.x = spot.x; player.y = spot.y; player.invuln = 0;
    toTell(); step(3);
    o.tellPhase = gustPhase(tr.t).phase;
    const x0 = player.x, y0 = player.y;
    step(Math.round(GUST_TELL * 60) - 6);
    o.tellMoved = Math.hypot(player.x - x0, player.y - y0);
    const hp0 = player.hp;
    step(Math.round(GUST_OUT * 60) + 4);
    o.pushed = (player.x - x0) * tr.dx + (player.y - y0) * tr.dy;
    o.sideways = Math.abs((player.x - x0) * tr.dy) + Math.abs((player.y - y0) * tr.dx);
    o.groundHurt = hp0 - player.hp;

    // On the bridge.
    const mid = W(br.b0, br.a);
    player.x = mid.x; player.y = mid.y; player.hp = 1000; player.invuln = 0;
    toTell(); step(Math.round((GUST_TELL + GUST_OUT) * 60) + 6);
    o.bridgeHurt = 1000 - player.hp;
    o.toll = player.maxHp * GUST_TOLL;

    // A body of the horde on the bridge, the hero well clear.
    player.x = spot.x; player.y = spot.y; player.hp = 1000;
    const e = placeEnemy('thrall', mid.x, mid.y, 0.5);
    e.awake = true; e.speed = 0;
    const eh = e.maxHp;
    toTell(); step(Math.round((GUST_TELL + GUST_OUT) * 60) + 6);
    o.enemyLost = (eh - Math.max(0, e.hp)) / eh;

    o.moods = Object.keys(GORGE_SETS).filter(id => !ROOM_MOODS[id]);
    o.events = Object.keys(GORGE_SETS).filter(id => !ENCOUNTERS[id]);
    return o;
  });

  ck('Gorges delves build the span', R.spans >= 1, R.spans + ' span(s) in ' + R.delves + ' delve(s)');
  ck('the chasm is cut: holes either side of the bridge', R.found, JSON.stringify(R.cut.slice(0, 8)));
  ck('and the far side is still reachable across it', R.farCut === 0, R.farCut + ' cut off');
  ck('the span carries its wind', R.hasTrap);
  ck('the wind tells before it blows', R.tellPhase === 'tell' && R.tellMoved < 2,
     R.tellPhase + ', moved ' + (R.tellMoved || 0).toFixed(1));
  ck('it shoves you down the chasm, not across it', R.pushed > 40 && R.sideways < 10,
     'along ' + (R.pushed || 0).toFixed(0) + ', across ' + (R.sideways || 0).toFixed(0));
  ck('on solid ground it only shoves', R.groundHurt === 0, String(R.groundHurt));
  ck('on the bridge it throws you at the edge, once', Math.abs(R.bridgeHurt - R.toll) < R.toll * 0.35,
     (R.bridgeHurt || 0).toFixed(0) + ' against ' + (R.toll || 0).toFixed(0));
  ck('the horde goes over for most of its life', R.enemyLost >= 0.55, ((R.enemyLost || 0) * 100).toFixed(0) + '%');
  ck('every Gorges room has its own air', R.moods && R.moods.length === 0, JSON.stringify(R.moods));
  ck('every Gorges room has its event', R.events && R.events.length === 0, JSON.stringify(R.events));
  ck('and the delves lay them in', R.encs >= R.delves, R.encs + ' in ' + R.delves + ' delves');
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
