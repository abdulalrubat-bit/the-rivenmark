/* =============================================================================
   THE RIVENMARK — debug overlay
   Injected into debug.html by tools/build-debug.js. Never shipped in the
   release page, and never edited by hand: edit this file and rebuild.

   It touches the game only by wrapping global functions, so the release code
   carries no debug branches at all.
   ========================================================================== */
(function () {
  'use strict';

  // --- deterministic worlds -------------------------------------------------
  // The generator is all Math.random, so seeding it here makes any map
  // reproducible without threading an RNG through the game. Note the seed,
  // reproduce the bug.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const realRandom = Math.random;
  let seed = (Math.random() * 1e9) | 0;
  let seeded = false;
  function applySeed() { Math.random = seeded ? mulberry32(seed) : realRandom; }

  // --- state ----------------------------------------------------------------
  const D = {
    open: true, pinned: false, god: false, oneShot: false, noSpawn: false,
    showFlow: false, showHits: false, forceLow: false, slowmo: false
  };

  // The panel is a fixed box over the left edge of the page, so on a phone it
  // sits squarely on top of the centred hero cards and boon cards and eats the
  // taps meant for them. Keep it off screen whenever a menu is up; the toggle
  // pins it back when you actually want the seed box on the start screen.
  const screenUp = () => state !== 'play';
  let fps = 0, frames = 0, fpsT = 0, updMs = 0, drawMs = 0;
  // Jitter is not a slow average, and an average is the one statistic that
  // cannot show it: a second holding fifty-eight good frames and two
  // half-second stalls averages out to something that looks fine and feels
  // terrible. So the delivered frame-to-frame interval is kept as a window,
  // and what is reported off it is the WORST one and how many missed the
  // 60Hz budget -- which is what the hand actually feels.
  const IVAL_N = 180;
  let ivals = [], lastFrameAt = 0, worstMs = 0, jankPct = 0;

  // --- wrap the loop for timings -------------------------------------------
  const _update = update, _draw = draw;
  update = function (dt) {
    const t0 = performance.now();
    _update(D.slowmo ? dt * 0.35 : dt);
    updMs = updMs * 0.9 + (performance.now() - t0) * 0.1;
  };
  draw = function (t) {
    if (D.forceLow) lowFx = true;
    const t0 = performance.now();
    _draw(t);
    drawMs = drawMs * 0.9 + (performance.now() - t0) * 0.1;
    if (D.showFlow) overlayFlow();
    if (D.showHits) overlayHits();
    frames++;
    const now = performance.now();
    if (lastFrameAt) {
      ivals.push(now - lastFrameAt);
      if (ivals.length > IVAL_N) ivals.shift();
    }
    lastFrameAt = now;
    if (now - fpsT > 500) {
      fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
      if (ivals.length > 8) {
        worstMs = 0;
        let over = 0;
        for (let i = 0; i < ivals.length; i++) {
          if (ivals[i] > worstMs) worstMs = ivals[i];
          if (ivals[i] > 20) over++;
        }
        jankPct = 100 * over / ivals.length;
      }
    }
    syncPanel();
    if (D.open && !screenUp()) paint();
  };

  // --- cheats, as wrappers --------------------------------------------------
  const _hurt = hurtPlayer;
  hurtPlayer = function (e) { if (!D.god) _hurt(e); };

  const _damage = damageEnemy;
  damageEnemy = function (e, dmg) { _damage(e, D.oneShot ? 1e9 : dmg); };

  const _spawn = spawnEnemy;
  spawnEnemy = function (t) { if (!D.noSpawn) _spawn(t); };

  const _reset = resetRun;
  resetRun = function (h) { applySeed(); _reset(h); };

  // --- world overlays -------------------------------------------------------
  function overlayFlow() {
    if (!flowDist) return;
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.translate(-cam.x, -cam.y);
    const c0x = Math.max(0, Math.floor(cam.x / CELL_W));
    const c1x = Math.min(GW - 1, Math.ceil((cam.x + view.w) / CELL_W));
    const c0y = Math.max(0, Math.floor(cam.y / CELL_W));
    const c1y = Math.min(GH - 1, Math.ceil((cam.y + view.h) / CELL_W));
    ctx.lineWidth = 1;
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const d = flowDist[cy * GW + cx];
        if (d < 0) continue;
        const x = cx * CELL_W + CELL_W / 2, y = cy * CELL_W + CELL_W / 2;
        ctx.fillStyle = 'rgba(90,200,255,' + Math.max(0.05, 0.5 - d * 0.006) + ')';
        ctx.fillRect(x - 3, y - 3, 6, 6);
        const probe = { x, y };
        if (typeof flowDir === 'function' && flowDir(probe, { x: 0, y: 0 })) {
          const o = { x: 0, y: 0 };
          flowDir(probe, o);
          ctx.strokeStyle = 'rgba(120,220,255,.5)';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + o.x * 13, y + o.y * 13);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function overlayHits() {
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.translate(-cam.x, -cam.y);
    ctx.strokeStyle = 'rgba(255,90,90,.55)';
    ctx.lineWidth = 1;
    const x0 = cam.x - 40, y0 = cam.y - 40, x1 = cam.x + view.w + 40, y1 = cam.y + view.h + 40;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.x > x1 || w.y > y1 || w.x + w.w < x0 || w.y + w.h < y0) continue;
      ctx.strokeRect(w.x + .5, w.y + .5, w.w - 1, w.h - 1);
    }
    ctx.strokeStyle = 'rgba(120,255,140,.8)';
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,230,120,.9)';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,120,.35)';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.range, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // --- panel ----------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
  /* The panel has grown as the game has. Cap it against the viewport and let
     it scroll, or the seed box at the bottom ends up off-screen on a phone. */
  #dbg{position:fixed;left:6px;top:88px;z-index:9999;width:216px;
    max-height:calc(100vh - 104px);overflow-y:auto;overscroll-behavior:contain;
    font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#d8e6c8;
    background:rgba(6,10,8,.9);border:1px solid #2f4a34;border-radius:4px;
    padding:7px 8px;pointer-events:auto;-webkit-user-select:none;user-select:none}
  #dbg.hid{display:none}
  #dbg h5{margin:6px 0 3px;font:600 9px/1 ui-monospace,monospace;letter-spacing:1.4px;
    color:#6f9c72;text-transform:uppercase}
  #dbg .row{display:flex;justify-content:space-between;gap:6px}
  #dbg .row b{color:#f0f6e8;font-weight:600}
  #dbg .warn b{color:#ffb35c}
  #dbg .grid{display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:4px}
  #dbg button{font:600 10px/1 ui-monospace,monospace;color:#cfe4c4;
    background:#14211a;border:1px solid #2f4a34;border-radius:3px;padding:6px 4px;
    cursor:pointer;touch-action:manipulation}
  #dbg button:active{background:#24382a}
  #dbg button.on{background:#2c5a33;border-color:#5fa768;color:#eaffe4}
  #dbgToggle{position:fixed;left:6px;top:60px;z-index:10000;width:26px;height:24px;
    font:600 11px/1 ui-monospace,monospace;color:#cfe4c4;background:rgba(6,10,8,.9);
    border:1px solid #2f4a34;border-radius:3px;cursor:pointer;touch-action:manipulation}
  #dbg input{width:88px;font:11px ui-monospace,monospace;color:#eaffe4;
    background:#0d1611;border:1px solid #2f4a34;border-radius:3px;padding:2px 4px}`;
  document.head.appendChild(css);

  const tog = document.createElement('button');
  tog.id = 'dbgToggle'; tog.textContent = 'D';
  document.body.appendChild(tog);

  const panel = document.createElement('div');
  panel.id = 'dbg';
  panel.innerHTML =
    '<div id="dbgStats"></div>' +
    '<h5>Toggles</h5><div class="grid" id="dbgTog"></div>' +
    '<h5>Actions</h5><div class="grid" id="dbgAct"></div>' +
    '<h5>Level</h5><div class="grid" id="dbgLev"></div>' +
    '<h5>Region</h5><div class="grid" id="dbgReg"></div>' +
    '<h5>Seed</h5><div class="row" style="margin-top:3px">' +
    '<input id="dbgSeed"><button id="dbgSeedGo" style="flex:1">use</button></div>';
  document.body.appendChild(panel);
  function syncPanel() {
    panel.classList.toggle('hid', !(D.open && (!screenUp() || D.pinned)));
  }
  function togglePanel() {
    if (screenUp()) { D.pinned = !D.pinned; D.open = true; }
    else { D.open = !D.open; D.pinned = false; }
    syncPanel();
  }
  tog.onclick = togglePanel;

  function mkButtons(host, defs) {
    defs.forEach(([label, fn, key]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { fn(); if (key) b.classList.toggle('on', D[key]); };
      if (key && D[key]) b.classList.add('on');
      host.appendChild(b);
    });
  }

  mkButtons(panel.querySelector('#dbgTog'), [
    ['god', () => D.god = !D.god, 'god'],
    ['1-shot', () => D.oneShot = !D.oneShot, 'oneShot'],
    ['no spawn', () => D.noSpawn = !D.noSpawn, 'noSpawn'],
    ['slow-mo', () => D.slowmo = !D.slowmo, 'slowmo'],
    ['flow', () => D.showFlow = !D.showFlow, 'showFlow'],
    ['hitboxes', () => D.showHits = !D.showHits, 'showHits'],
    ['force low', () => { D.forceLow = !D.forceLow; if (!D.forceLow) lowFx = false; }, 'forceLow'],
    ['seeded', () => { seeded = !seeded; applySeed(); }, 'seeded']
  ]);

  mkButtons(panel.querySelector('#dbgAct'), [
    ['+25 slag', () => collectTech(25)],
    ['fill slag', () => collectTech(Math.max(0, LEVEL.quota - run.tech))],
    ['to gate', () => { player.x = portal.x; player.y = portal.y; }],
    ['summon boss', () => { if (!run.bossCalled) { run.bossCalled = true; spawnBoss(); } }],
    ['kill boss', () => { if (run.boss) { damageEnemy(run.boss, 1e9); compactEnemies(); } }],
    ['wipe horde', () => { for (const e of enemies) if (e.kind !== 'deceiver') e.hp = 0;
                           compactEnemies(); }],
    ['+50 horde', () => { for (let i = 0; i < 50; i++) _spawn(run.time); }],
    ['+5 levels', () => { stash.xp = xpForLevel(Math.min(HERO_MAX_LEVEL,
        (stash.level || 1) + 5)); stash.level = levelForXp(stash.xp);
        player.level = stash.level; recomputeStats(); saveStash(); }],
    ['+200 coins', () => { stash.coins = (stash.coins || 0) + 200; saveStash(); }],
    ['heal', () => { player.hp = player.maxHp; }],
    ['remake map', () => resetRun(run.hero)],
    ['drop item', () => { if (player.bag.length < BAG_MAX) {
        const it = rollItem(Math.random());
        player.bag.push(it); toast(it.name, rarityOf(it).colour); syncBagBadge(); } }],
    ['best kit', () => { for (const sl of SLOTS) player.gear[sl.id] = rollItem(1, sl.id);
        recomputeStats(); }],
    ['strip kit', () => { for (const sl of SLOTS) player.gear[sl.id] = null;
        player.bag.length = 0; recomputeStats(); syncBagBadge(); }],
    ['open bag', () => openGear()]
  ]);

  // Levels own their region pool, so the region buttons are rebuilt whenever
  // the level changes rather than being baked once from the full table.
  const levHost = panel.querySelector('#dbgLev');
  const regHost = panel.querySelector('#dbgReg');
  function buildRegionButtons() {
    regHost.innerHTML = '';
    LEVEL.regions.forEach(id => {
      const b = document.createElement('button');
      b.textContent = id;
      b.onclick = () => {
        // resetRun rolls at random; re-roll until it lands on the one asked for.
        for (let i = 0; i < 200 && REGION.id !== id; i++) resetRun(run.hero, LEVEL.id);
        state = 'play'; showScreen(null);
      };
      regHost.appendChild(b);
    });
  }
  LEVELS.forEach(L => {
    const b = document.createElement('button');
    b.textContent = L.id;
    b.onclick = () => {
      resetRun(run.hero, L.id);
      buildRegionButtons();
      state = 'play'; showScreen(null);
    };
    levHost.appendChild(b);
  });
  buildRegionButtons();

  const seedIn = panel.querySelector('#dbgSeed');
  seedIn.value = seed;
  panel.querySelector('#dbgSeedGo').onclick = () => {
    const v = parseInt(seedIn.value, 10);
    if (!isNaN(v)) { seed = v; seeded = true; applySeed(); resetRun(run.hero);
                     state = 'play'; showScreen(null); }
  };

  const statsHost = panel.querySelector('#dbgStats');
  function row(k, v, warn) {
    return '<div class="row' + (warn ? ' warn' : '') + '"><span>' + k +
           '</span><b>' + v + '</b></div>';
  }
  function paint() {
    const ms = updMs + drawMs;
    statsHost.innerHTML =
      row('fps', fps.toFixed(0), fps < 50) +
      // Read these two before the average. A worst frame over about 50ms is a
      // visible hitch however good the fps line looks.
      row('worst frame', worstMs.toFixed(0) + 'ms', worstMs > 50) +
      row('over budget', jankPct.toFixed(0) + '%', jankPct > 5) +
      row('draw / upd', drawMs.toFixed(1) + ' / ' + updMs.toFixed(2) + 'ms', ms > 16.7) +
      row('lowFx', lowFx, lowFx) +
      row('delve', LEVEL.id) +
      row('hero lv / power', (player ? player.level : 1) + ' / ' + stashPower()) +
      row('coins', stash ? (stash.coins || 0) : 0) +
      row('region', REGION.id) +
      row('hero', (run && run.hero) || '-') +
      row('enemies', enemies.length) +
      row('arcs / parts', arcs.length + ' / ' + particles.length) +
      row('props / lamps', props.length + ' / ' + lamps.length) +
      row('walls / edges', walls.length + ' / ' + edges.length) +
      row('slag', (run ? run.tech : 0) + '/' + LEVEL.quota) +
      row('gear worn', (player ? SLOTS.filter(sl => player.gear[sl.id]).length : 0) + '/8') +
      row('bag / found', (player ? player.bag.length : 0) + ' / ' + (run ? run.found : 0)) +
      row('boss', run && run.boss ? Math.round(100 * run.boss.hp / run.boss.maxHp) + '%'
                                  : (run && run.bossDown ? 'down' : '-')) +
      row('seed', seeded ? seed : 'off');
  }

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === '`') togglePanel();
    if (k === 'g') D.god = !D.god;
    if (k === 'h') D.showHits = !D.showHits;
    if (k === 'f') D.showFlow = !D.showFlow;
  });

  syncPanel();
  paint();
  console.log('[rivenmark] debug build — ` panel, g god, h hitboxes, f flow');
})();
