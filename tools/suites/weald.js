/* THE ROT-WEALD: its own rooms, and the spore pods.
 *
 *   - a Weald delve grows the grove: several pods, on bare floor, each on
 *     its own clock so the grove is never all clear or all cloud at once
 *   - a pod swells before it bursts, and neither costs anything
 *   - burst, its cloud poisons whoever stands in it, about a tenth of the
 *     hero's life a second, and nobody standing clear of it
 *   - the horde breathes it too
 *   - the spawning pool carries the cistern's poison water
 *   - every Weald room has its own air, and its event
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
  await p.waitForFunction(() => typeof WEALD_SETS === 'object', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = { delves: 0, groves: 0, pods: [], propsOn: 0, pools: 0, poolTrapped: 0 };
    const rungs = LEVELS.map((L, i) => i).filter(i => LEVELS[i].regions.includes('weald') && i > 0).slice(0, 6);
    const C = CELL_W;
    let keep = false;
    for (let t = 0; t < 40; t++) {
      stash = blankStash(); stash.region = 'weald';
      startRun('isaac', LEVELS[rungs[t % rungs.length]].id, 'riven');
      if (REGION.id !== 'weald') continue;
      o.delves++;
      for (const rm of rooms.filter(r => r.set === 'spawnpool')) {
        o.pools++;
        if (traps.some(tr => tr.kind === 'pool' && Math.hypot(tr.x - rm.x, tr.y - rm.y) < 4)) o.poolTrapped++;
      }
      for (const rm of rooms.filter(r => r.set === 'grove')) {
        o.groves++;
        const P = rm.meta.pods || [];
        o.pods.push(P.length);
        const S = new Set(P.map(([x, y]) => x + ',' + y));
        for (const pr of props) if (S.has(Math.floor(pr.x / C) + ',' + Math.floor(pr.y / C))) o.propsOn++;
        keep = keep || P.length >= 3;
      }
      if (keep && o.pools > 0 && t > 8) break;
    }
    o.found = keep;
    if (!keep) return o;

    stash = blankStash(); stash.region = 'weald';
    let tr = null;
    for (let t = 0; t < 40 && !tr; t++) {
      startRun('isaac', LEVELS[rungs[t % rungs.length]].id, 'riven');
      tr = REGION.id === 'weald' ? traps.find(q => q.kind === 'spore' && q.pods.length >= 3) : null;
    }
    o.hasTrap = !!tr;
    if (!tr) return o;
    // Their own clocks.
    o.distinct = new Set(tr.pods.map(pd => (pd.t % SPORE_CYCLE).toFixed(2))).size;
    for (const e of enemies) e.hp = 0;
    enemies.length = 0; encounters.length = 0;
    for (let i = traps.length - 1; i >= 0; i--) if (traps[i] !== tr) traps.splice(i, 1);
    player.maxHp = 1000; player.hp = 1000;
    // One pod to measure, the rest held quiet so only it can be the cloud.
    const pd = tr.pods[0];
    const hush = () => { for (const q of tr.pods) if (q !== pd) { q.t = 0.05; q.was = 'down'; } };
    const at = (x, y, secs) => { for (let i = 0, n = Math.round(secs * 60); i < n; i++) {
      player.x = x; player.y = y; player.invuln = 1e9; hush(); update(1 / 60); } };
    const toTell = () => { pd.t = SPORE_CYCLE - SPORE_CLOUD - SPORE_TELL - 0.02; pd.was = 'down'; };

    // Quiet, then swelling: nothing.
    pd.t = 0.1; pd.was = 'down'; at(pd.x, pd.y, 0.5); o.quiet = 1000 - player.hp;
    player.hp = 1000; toTell(); at(pd.x, pd.y, 0.05); o.tellPhase = sporePhase(pd.t).phase;
    at(pd.x, pd.y, SPORE_TELL - 0.15); o.tellHurt = 1000 - player.hp;
    // Burst: standing in it for two seconds.
    player.hp = 1000; pd.t = SPORE_CYCLE - SPORE_CLOUD + 0.02; pd.was = 'tell';
    at(pd.x, pd.y, 2); o.cloudHurt = 1000 - player.hp; o.want = 1000 * SPORE_DPS * 2;
    // Clear of it (a cloud's reach and a body away): nothing.
    player.hp = 1000; pd.t = SPORE_CYCLE - SPORE_CLOUD + 0.02; pd.was = 'tell';
    const away = openCells.filter(c => Math.hypot(c.x - pd.x, c.y - pd.y) > SPORE_R + 40 &&
      tr.pods.every(q => Math.hypot(c.x - q.x, c.y - q.y) > SPORE_R + 40))
      .sort((a, c) => Math.hypot(a.x - pd.x, a.y - pd.y) - Math.hypot(c.x - pd.x, c.y - pd.y))[0];
    at(away.x, away.y, 2); o.clearHurt = 1000 - player.hp;
    // The horde breathes it.
    player.x = pd.x + 3000;
    const e = placeEnemy('thrall', pd.x, pd.y, 0.5);
    e.awake = true; e.speed = 0;
    const eh = e.maxHp;
    pd.t = SPORE_CYCLE - SPORE_CLOUD + 0.02; pd.was = 'tell';
    for (let i = 0; i < 120; i++) { e.x = pd.x; e.y = pd.y; player.invuln = 1e9; hush();
      enemyGrid.clear(); for (const q of enemies) enemyGrid.insert(q, q.x, q.y); update(1 / 60); }
    o.enemyLost = (eh - Math.max(0, e.hp)) / eh;

    o.moods = Object.keys(WEALD_SETS).filter(id => !ROOM_MOODS[id]);
    o.events = Object.keys(WEALD_SETS).filter(id => !ENCOUNTERS[id]);
    return o;
  });

  ck('Weald delves grow the grove', R.found, R.groves + ' grove(s) in ' + R.delves + ' delve(s)');
  ck('with several pods', R.pods.length && Math.min(...R.pods) >= 3, R.pods.join(' '));
  ck('on bare floor', R.propsOn === 0, R.propsOn + ' props on a pod');
  ck('the grove carries its spores', R.hasTrap);
  ck('each pod keeps its own clock', R.distinct >= 3, R.distinct + ' distinct');
  ck('quiet, a pod costs nothing', R.quiet === 0, String(R.quiet));
  ck('it swells before it bursts, and the swelling costs nothing', R.tellPhase === 'tell' && R.tellHurt === 0,
     R.tellPhase + ', ' + R.tellHurt);
  ck('burst, the cloud poisons whoever stands in it', Math.abs(R.cloudHurt - R.want) < R.want * 0.35,
     (R.cloudHurt || 0).toFixed(0) + ' over two seconds against ' + (R.want || 0).toFixed(0));
  ck('and nobody clear of it', R.clearHurt === 0, String(R.clearHurt));
  ck('the horde breathes it too', R.enemyLost >= 0.15, ((R.enemyLost || 0) * 100).toFixed(0) + '%');
  ck('the spawning pool carries the poison water', R.pools === 0 || R.poolTrapped === R.pools,
     R.poolTrapped + '/' + R.pools);
  ck('every Weald room has its own air', R.moods && R.moods.length === 0, JSON.stringify(R.moods));
  ck('every Weald room has its event', R.events && R.events.length === 0, JSON.stringify(R.events));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
