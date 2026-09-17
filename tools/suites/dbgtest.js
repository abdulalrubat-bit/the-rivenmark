/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
const { chromium } = require('playwright');
// RIVENMARK_PAGE points the suite at a different page without touching its
// source. verify-core uses it to run the SAME file against index.html and
// against the extracted core; it used to rewrite the URL with a string
// replace, which silently stopped matching the moment this line changed.
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
// The gate-house is behind the splash now: the stations live on a tab bar and
// the bar does not exist until you have entered. Idempotent, so it is safe to
// call before every station click however the test got there.
async function enterHub(pg){
  const onSplash = await pg.$eval('#splash', e=>e.classList.contains('on')).catch(()=>false);
  if (!onSplash) return;
  await pg.click('#toGatehouse');
  await new Promise(r=>setTimeout(r,220));
}

// The hero picker moved behind the Descend button when the menus were
// redesigned; starting a run is two taps now.
async function beginRun(p, hero, diff) {
  await enterHub(p); await p.click('#toDelve');
  await new Promise(r => setTimeout(r, 150));
  if (hero) { await p.click('#heroPick .card[data-hero="' + hero + '"]');
              await new Promise(r => setTimeout(r, 80)); }
  if (diff) { await p.click('#diffPick .card[data-diff="' + diff + '"]');
              await new Promise(r => setTimeout(r, 80)); }
  await p.click('#beginRun');
  await new Promise(r => setTimeout(r, 500));
}
const OUT = '/tmp/claude-0/-home-user-abdulalrubat-bit-github-io/4bff2945-7328-5fd1-8354-f2ea6e41425c/scratchpad/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
/* 'x ' on a failure: run-suites.js surfaces exactly that prefix when it
 * summarises a sweep, so without it a red suite reports its count and none
 * of its reasons — which means re-running it alone to find out why. */
const ck = (name, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + name + (note ? '  [' + note + ']' : ''));

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport:{width:430,height:900}, deviceScaleFactor:2 })).newPage();
  const errs = [], logs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { logs.push(m.text()); if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(PAGE('debug.html'));
  await sleep(700);

  ck('loads clean', errs.length === 0, errs.join(' | '));
  ck('banner logged', logs.some(l => l.includes('debug build')));
  ck('title marked', (await p.title()).includes('debug'));
  ck('toggle button present', await p.$('#dbgToggle') !== null);
  ck('panel present', await p.$('#dbg') !== null);
  ck('panel out of the way on start screen',
     await p.$eval('#dbg', e => getComputedStyle(e).display) === 'none');

  // pinning it on the start screen (for the seed box) and letting go again
  await p.click('#dbgToggle'); await sleep(120);
  ck('toggle pins panel over start screen',
     await p.$eval('#dbg', e => getComputedStyle(e).display) !== 'none');
  ck('pinned panel still paints',
     /region/.test(await p.$eval('#dbgStats', e => e.innerText)));
  await p.click('#dbgToggle'); await sleep(120);
  ck('toggle unpins',
     await p.$eval('#dbg', e => getComputedStyle(e).display) === 'none');

  await p.screenshot({ path: OUT + 'dbg-menu.png' });

  await beginRun(p);   // must not be intercepted by the panel
  await sleep(700);
  ck('panel returns during play',
     await p.$eval('#dbg', e => getComputedStyle(e).display) !== 'none');

  // ---- stats panel is live -------------------------------------------------
  const stats = await p.$eval('#dbgStats', e => e.innerText);
  ck('stats render', /fps/.test(stats) && /region/.test(stats) && /walls/.test(stats), stats.replace(/\n/g,' | '));

  // ---- toggles -------------------------------------------------------------
  const tog = await p.evaluate(async () => {
    const btn = l => [...document.querySelectorAll('#dbgTog button')].find(b => b.textContent === l);
    const r = {};
    // god: player must take no damage from a touching enemy
    btn('god').click();
    player.hp = player.maxHp;
    const e = enemies[0] || (spawnEnemy(run.time), enemies[enemies.length-1]);
    e.x = player.x; e.y = player.y; e.hitCd = 0;
    for (let i=0;i<90;i++) update(1/60);
    r.godHeld = player.hp === player.maxHp;
    btn('god').click();
    e.x = player.x; e.y = player.y; e.hitCd = 0;
    for (let i=0;i<90;i++) update(1/60);
    r.godOffHurts = player.hp < player.maxHp;

    // no spawn
    btn('no spawn').click();
    const n0 = enemies.length;
    for (let i=0;i<60*20;i++) update(1/60);
    r.noSpawnHeld = enemies.length <= n0;
    btn('no spawn').click();

    // 1-shot
    btn('1-shot').click();
    spawnEnemy(run.time);
    const tgt = enemies[enemies.length-1];
    damageEnemy(tgt, 1);
    r.oneShotKills = tgt.hp <= 0;
    btn('1-shot').click();

    r.classOn = btn('god').classList.contains('on') === false;
    return r;
  });
  ck('god blocks damage', tog.godHeld);
  ck('god off restores damage', tog.godOffHurts);
  ck('no-spawn holds count', tog.noSpawnHeld);
  ck('1-shot kills', tog.oneShotKills);
  ck('button state class tracks', tog.classOn);

  // ---- overlays draw without error -----------------------------------------
  errs.length = 0;
  await p.keyboard.press('h'); await p.keyboard.press('f');
  await sleep(600);
  await p.screenshot({ path: OUT + 'dbg-overlays.png' });
  ck('flow + hitbox overlays draw clean', errs.length === 0, errs.join(' | '));
  await p.keyboard.press('h'); await p.keyboard.press('f');

  // ---- force low -----------------------------------------------------------
  const low = await p.evaluate(async () => {
    const btn = l => [...document.querySelectorAll('#dbgTog button')].find(b => b.textContent === l);
    btn('force low').click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = lowFx;
    btn('force low').click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { on, off: lowFx };
  });
  ck('force low engages', low.on === true);
  ck('force low releases', low.off === false);

  // ---- actions -------------------------------------------------------------
  errs.length = 0;
  const act = await p.evaluate(async () => {
    const btn = l => [...document.querySelectorAll('#dbgAct button')].find(b => b.textContent === l);
    const r = {};
    btn('+25 slag').click();  r.slag25 = run.tech >= 25;
    btn('fill slag').click(); r.slagFull = run.tech >= EXTRACT_QUOTA;
    btn('heal').click();      r.healed = player.hp === player.maxHp;
    const lv0 = stash.level || 1;
    btn('+5 levels').click(); r.ranked = (stash.level || 1) > lv0;
    btn('+50 horde').click(); const n = enemies.length; r.horde = n >= 50;
    // a crescent only leaves the edge if something is inside the blade's
    // reach -- horde spawns land past the viewport, so plant one close
    spawnEnemy(run.time);
    const t2 = enemies[enemies.length-1];
    t2.x = player.x + 60; t2.y = player.y;
    // A tap: the automatic blade is gone, so a crescent only leaves the hero
    // when the Conduit is pressed.
    r.arcsFire = (conduitPress(), conduitRelease(), arcs.length > 0);
    btn('wipe horde').click(); r.wiped = enemies.filter(e=>e.kind!=='deceiver').length === 0;
    btn('to gate').click();   r.atGate = Math.hypot(player.x-portal.x, player.y-portal.y) < 1;
    btn('summon boss').click();
    r.bossUp = !!(run.boss && run.boss.hp > 0);
    r.bossKind = run.boss && run.boss.kind;
    btn('kill boss').click();
    r.bossDead = !run.boss || run.boss.hp <= 0;
    const reg0 = REGION.id, w0 = walls.length;
    btn('remake map').click();
    r.remade = walls.length > 0;
    return r;
  });
  Object.entries(act).forEach(([k,v]) => ck('action ' + k, v !== false, String(v)));
  ck('actions ran clean', errs.length === 0, errs.join(' | '));

  // ---- region jump ---------------------------------------------------------
  errs.length = 0;
  const reg = await p.evaluate(async () => {
    const out = [];
    for (const btn of [...document.querySelectorAll('#dbgReg button')]) {
      const want = btn.textContent;
      btn.click();
      out.push([want, REGION.id, state]);
    }
    return out;
  });
  reg.forEach(([w,g,s]) => ck('region jump ' + w, w === g && s === 'play', g + '/' + s));
  ck('region jumps clean', errs.length === 0, errs.join(' | '));

  // ---- seeded determinism --------------------------------------------------
  const det = await p.evaluate(async () => {
    const fp = () => {
      let h = 2166136261;
      for (let i=0;i<grid.length;i++) { h ^= grid[i]; h = Math.imul(h, 16777619); }
      return (h>>>0) + ':' + walls.length + ':' + props.length + ':' + REGION.id;
    };
    const use = s => {
      document.querySelector('#dbgSeed').value = s;
      document.querySelector('#dbgSeedGo').click();
      return fp();
    };
    const a1 = use(12345);
    const b1 = use(999);
    const a2 = use(12345);
    return { a1, a2, b1, same: a1 === a2, differs: a1 !== b1 };
  });
  ck('same seed reproduces map', det.same, det.a1 + ' vs ' + det.a2);
  ck('different seed differs', det.differs, det.a1 + ' vs ' + det.b1);

  // ---- panel show/hide -----------------------------------------------------
  const vis = await p.evaluate(async () => {
    const r = {};
    document.querySelector('#dbgToggle').click();
    r.hidden = getComputedStyle(document.querySelector('#dbg')).display === 'none';
    document.querySelector('#dbgToggle').click();
    r.shown = getComputedStyle(document.querySelector('#dbg')).display !== 'none';
    return r;
  });
  ck('panel hides', vis.hidden);
  ck('panel reshows', vis.shown);

  // level-up cards must be clickable too
  const boon = await p.evaluate(async () => {
    run.pendingLevels = 1; update(1/60);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { state, panel: getComputedStyle(document.querySelector('#dbg')).display };
  });
  ck('panel clears the boon screen', boon.state !== 'levelup' || boon.panel === 'none',
     boon.state + '/' + boon.panel);
  if (boon.state === 'levelup') {
    await p.click('#levelup .card'); await sleep(300);
    ck('boon card clickable', await p.evaluate(() => state) === 'play');
  }

  // ---- soak: play a while with panel up -----------------------------------
  errs.length = 0;
  await p.evaluate(() => { for (let i=0;i<60*45;i++) update(1/60); });
  await sleep(900);
  await p.screenshot({ path: OUT + 'dbg-play.png' });
  ck('45s soak clean', errs.length === 0, errs.join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close();
  process.exit(fail.length ? 1 : 0);
})();
