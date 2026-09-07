#!/usr/bin/env node
/* The screen-space layer: the map, the arrow to the way out, the boss bar,
 * the toast and the banner.
 *
 * These answer where am I, which way is out, what is this thing, what did I
 * just pick up and where am I going. None of them are decoration and none of
 * them were in the port, so a delve was a dark room you wandered until the
 * timer ran down.
 *
 * The layout checks are the ones with history behind them. The map, the boss
 * bar and the toast all hang off the same top-right corner, and the whole
 * reason bossBarDrop() exists is that they stacked on each other; the canvas
 * build drew the False Dawn crystal straight through the map for exactly this
 * reason. So overlap is asserted, not eyeballed.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:overlay
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();                       // the suite must test src/, not a stale bundle
  const PORT = process.env.PORT || '8216';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  /* ?noatmos&nogov: the map and the crystal are measured as differences
   * against a frozen frame, and a drifting fog or a guttering torch under the
   * box is noise the measurement cannot tell from the thing being measured.
   * The atmosphere is the subject of smoke:air, not the weather here. */
  await p.goto('http://localhost:' + PORT + '/?noatmos&nogov&nogate');
  let booted = false;
  for (let i = 0; i < 40 && !booted; i++) {
    await sleep(250);
    booted = await p.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
    }).catch(() => false);
  }
  ck('the delve boots', booted);
  if (!booted) { report(); await b.close(); srv.kill(); return; }
  await sleep(1500);

  const box = at => p.screenshot({ clip: at }).then(buf => PNG.sync.read(buf));
  const moved = (a, b2) => {
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (Math.abs(a.data[i] - b2.data[i]) +
          Math.abs(a.data[i + 1] - b2.data[i + 1]) +
          Math.abs(a.data[i + 2] - b2.data[i + 2]) > 24) n++;
    }
    return n;
  };

  // --- the map -------------------------------------------------------------
  // The map is drawn every frame from live state, so it is never still. What
  // is asserted is that it is THERE, that it is where minimapBox says it is,
  // and that it plots what it is supposed to plot -- checked by moving one
  // marker and watching the picture change, which no static screenshot of a
  // "map-shaped rectangle" would catch.
  const m0 = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    /* Held, not over. This wants the delve to stop moving so the map can be
     * diffed against a still world -- and it used to say 'over', which is
     * the word for a run that has ENDED, chosen only because at the time
     * nothing read `state` except the step. Something does now: the HUD
     * hides itself when there is no run under it, so 'over' took the boss
     * bar, the toast and the banner away and ten checks below here went
     * looking for text on elements that were no longer being drawn.
     *
     * 'pause' is what the suite actually means. update() is skipped exactly
     * the same way, the scene keeps drawing every frame, and the run is
     * still a run -- which is the truth, and is why the HUD stays. */
    state = 'pause';                      // freeze; the map still redraws
    for (const e of enemies) e.awake = false;
    run.corpse = null; run.boss = null; run.invader = null; run.toast = null;
    // The host ships a placeholder minimapBox that returns a zero-sized box at
    // the origin, and the core places the False Dawn crystal by calling it.
    // If the overlay has not replaced it, the crystal lands in the corner --
    // so prove the live one is installed by making the viewport move it.
    const before = window.minimapBox();
    window.__setView(700, 844, 1);
    const wide = window.minimapBox();
    window.__setView(390, 844, 1);
    return { box: window.minimapBox(), hasOverlay: !!sc.overlay,
             tracks: wide.s !== before.s && wide.x !== before.x,
             wide: wide.s + '@' + wide.x, narrow: before.s + '@' + before.x };
  });
  ck('the map has a box, under the HUD and inside the screen',
     m0.box.s > 80 && m0.box.x + m0.box.s + m0.box.over <= 390 && m0.box.y >= 78,
     m0.box.s + 'px at ' + m0.box.x + ',' + m0.box.y);
  ck('and the core reads the live box, not the host placeholder',
     m0.hasOverlay && m0.tracks,
     'box is ' + m0.narrow + ' on a phone and ' + m0.wide + ' on a wider screen');

  const mapClip = { x: m0.box.x, y: m0.box.y, width: m0.box.s, height: m0.box.s };
  const mapBefore = await box(mapClip);
  await p.evaluate(() => {
    // Wake the pack nearest the player: only what has noticed you is plotted,
    // which is the rule that keeps a map from handing over the whole delve.
    let woke = 0;
    for (const e of enemies) {
      if (e.hp > 0 && woke < 25) { e.awake = true; woke++; }
    }
  });
  await sleep(500);
  const mapWoken = await box(mapClip);
  const wokeDelta = moved(mapBefore, mapWoken);
  ck('waking a pack puts it on the map', wokeDelta > 40,
     wokeDelta + ' pixels changed inside the map when 25 bodies woke');

  await p.evaluate(() => { run.corpse = { x: 300, y: 300, taken: false }; });
  await sleep(400);
  const mapCorpse = await box(mapClip);
  ck('and your corpse is marked on it', moved(mapWoken, mapCorpse) > 8,
     moved(mapWoken, mapCorpse) + ' pixels changed when the corpse was set');

  // --- the arrow to the way out --------------------------------------------
  // In pixels, and as a difference. Counting Graphics draw commands was the
  // first version and it is a Phaser internal that says nothing about whether
  // anything reached the screen; an arrow drawn transparent would pass it.
  const arrowAt = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const c = sc.cameras.main;
    // Under the hero: an arrow pointing at something you can already see is
    // noise, so nothing should be drawn.
    portal.x = c.scrollX + c.width / 2; portal.y = c.scrollY + c.height / 2;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    // The arrow rides the edge of the PLAY area, not the window: the HUD owns
    // the top strip and the kit the bottom, and an arrow under a thumb is an
    // arrow nobody sees. This is where it should land due east.
    const m = 48, mTop = 96;
    return { x: Math.round(c.width / 2 + (c.width / 2 - m)),
             y: Math.round((mTop + (c.height - m)) / 2) };
  });
  const arrowClip = { x: arrowAt.x - 30, y: arrowAt.y - 30, width: 60, height: 60 };
  const arrowOff = await box(arrowClip);
  await p.evaluate(async () => {
    const c = window.__game.scene.getScene('delve').cameras.main;
    portal.x = c.scrollX + c.width + 900; portal.y = c.scrollY + c.height / 2;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
  });
  await sleep(400);
  const arrowOn = await box(arrowClip);
  const arrowDelta = moved(arrowOff, arrowOn);
  ck('the way out is signposted when it is off screen', arrowDelta > 200,
     arrowDelta + ' pixels changed at the play area’s east edge (' +
     arrowAt.x + ',' + arrowAt.y + ') when the gate went out of view');

  // --- the boss bar --------------------------------------------------------
  const boss = await p.evaluate(async () => {
    const r = sel => { const e = document.querySelector(sel); if (!e) return null;
                       const b = e.getBoundingClientRect();
                       return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom,
                                hidden: e.hidden, text: e.textContent }; };
    const off = r('#hud .boss');
    run.boss = { x: player.x, y: player.y, hp: 640, maxHp: 900,
                 title: 'The Deceiver, the Unbroken and the Unblinking' };
    for (let i = 0; i < 6; i++) await new Promise(rr => requestAnimationFrame(rr));
    const on = r('#hud .boss');
    return { off, on,
             name: document.querySelector('#hud .boss .name').textContent,
             count: document.querySelector('#hud .boss .count').textContent,
             fill: document.querySelector('#hud .boss .bar i').style.width,
             droppedBox: window.minimapBox() };
  });
  ck('no boss, no bar', boss.off && boss.off.hidden, 'hidden with run.boss unset');
  ck('a boss raises one, named and counted',
     !boss.on.hidden && /Deceiver/.test(boss.name) && boss.count === '640 / 900',
     boss.name + '  ' + boss.count + ', bar at ' + boss.fill);
  // 640/900 is 71.1%. A bar that shows the title but not the number is the
  // failure that looks fine in a screenshot.
  ck('and the bar is the fraction', Math.abs(parseFloat(boss.fill) - 71.1) < 0.6,
     boss.fill + ' for 640 of 900');
  ck('the map drops out from under it',
     boss.droppedBox.y > m0.box.y + 40,
     'map at y ' + m0.box.y + ' with no boss, ' + boss.droppedBox.y + ' with one');

  // --- the False Dawn crystal ----------------------------------------------
  // The fight's second clock, and the only one that matters: full is a wipe.
  // It is placed by the CORE's dawnCrystalRect(), which reads minimapBox() --
  // in the canvas build the arithmetic was written out twice and the crystal
  // was drawn straight through the map, so where it lands is asserted too.
  const crystal = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    run.dawn = 0; run.breath = 0; run.dawnPop = 0;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    const empty = sc.overlay.dawnPct.visible;
    run.dawn = 62;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    return { empty, rect: dawnCrystalRect(), map: window.minimapBox(),
             pct: sc.overlay.dawnPct.text, shown: sc.overlay.dawnPct.visible,
             label: sc.overlay.dawnLabel.text, vh: innerHeight };
  });
  ck('an empty crystal is not drawn at all', crystal.empty === false,
     'the meter reads 0 and nothing is on screen');
  ck('and a climbing one says how far it has come',
     crystal.shown && crystal.pct === '62%' && /FALSE DAWN/.test(crystal.label),
     crystal.label + '  ' + crystal.pct);
  ck('it hangs under the map, not through it',
     crystal.rect.y >= crystal.map.y + crystal.map.s + crystal.map.over &&
     crystal.rect.y + crystal.rect.h < crystal.vh,
     'crystal ' + crystal.rect.y + '-' + (crystal.rect.y + crystal.rect.h) +
     ' under a map ending at ' + (crystal.map.y + crystal.map.s + crystal.map.over));

  const cClip = { x: crystal.rect.x - 4, y: crystal.rect.y,
                  width: crystal.rect.w + 8, height: crystal.rect.h };
  const cLow = await box(cClip);
  await p.evaluate(async () => {
    run.dawn = 96;                                // past the alarm threshold
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
  });
  await sleep(400);
  const cHigh = await box(cClip);
  ck('and it fills as the meter climbs', moved(cLow, cHigh) > 400,
     moved(cLow, cHigh) + ' pixels of glass changed between 62% and 96%');

  const hot = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    return { colour: sc.overlay.dawnPct.style.color, pct: sc.overlay.dawnPct.text };
  });
  ck('past four fifths it stops being trim and starts warning',
     hot.colour.toLowerCase() === '#ffbe8c' && hot.pct === '96%',
     'the readout turns ' + hot.colour + ' at ' + hot.pct);
  await p.evaluate(() => { run.dawn = 0; });

  // --- the toast -----------------------------------------------------------
  const toast = await p.evaluate(async () => {
    run.toast = { text: "A warded coffer — Warden's Sash", colour: '#8fb8ff', life: 3 };
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    const e = document.querySelector('#hud .toast');
    const b2 = e.getBoundingClientRect();
    return { hidden: e.hidden, text: e.textContent, colour: e.style.color,
             rect: { x: b2.x, y: b2.y, r: b2.right, b: b2.bottom } };
  });
  ck('a pickup says what it was, in its rarity',
     !toast.hidden && /Warden/.test(toast.text) && /143|8fb8ff/.test(toast.colour),
     toast.text + ' in ' + toast.colour);
  const bb = boss.on, mb = boss.droppedBox;
  const hits = (a, c) => a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b;
  const mapRect = { x: mb.x - mb.over, y: mb.y - mb.over,
                    r: mb.x + mb.s + mb.over, b: mb.y + mb.s + mb.over };
  // A hidden toast has a zero rect and overlaps nothing, so it must be shown
  // for this to mean anything.
  ck('and it lands clear of the boss bar and the map',
     !toast.hidden && toast.rect.r > toast.rect.x &&
     !hits(toast.rect, { x: bb.x, y: bb.y, r: bb.r, b: bb.b }) && !hits(toast.rect, mapRect),
     'toast ' + Math.round(toast.rect.x) + ',' + Math.round(toast.rect.y) + '-' +
     Math.round(toast.rect.r) + ' against a map from x ' + Math.round(mapRect.x));

  // --- the banner ----------------------------------------------------------
  // A delve that never names itself. run.bannerText is empty on the opening
  // banner, and the port read only that -- so it showed nothing at all.
  const banner = await p.evaluate(async () => {
    run.bannerText = ''; run.bannerNote = ''; run.banner = 2.0;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    const e = document.querySelector('#hud .banner');
    const opening = { hidden: e.hidden, text: e.textContent };
    run.bannerText = 'The gate is open'; run.bannerNote = 'Stand in it';
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    const raised = { hidden: e.hidden, text: e.textContent };
    run.banner = 0;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    return { opening, raised, gone: document.querySelector('#hud .banner').hidden,
             level: LEVEL.name };
  });
  ck('the opening banner names the delve',
     !banner.opening.hidden && banner.opening.text.includes(banner.level),
     JSON.stringify(banner.opening.text) + ' for ' + banner.level);
  ck('and anything the run raises replaces it',
     !banner.raised.hidden && /gate is open/.test(banner.raised.text) &&
     !banner.raised.text.includes(banner.level),
     JSON.stringify(banner.raised.text));
  ck('and it goes when it is done', banner.gone);

  /* --- NOT TWICE, AND NOT ON TOP OF ANYTHING ------------------------------
   * Three pieces of chrome and three ways they were in each other's way, all
   * found by looking at one screenshot of a boss fight on a phone:
   *
   *   the avatar's name was written twice in the same frame -- once in the
   *   boss bar and once in nineteen-pixel serif across the middle of the
   *   fight, because arriving raises the bar and the banner together;
   *
   *   HELD -- the line that says why his health is not moving -- was drawn
   *   across the bar's own gold hatching, in gold;
   *
   *   and the banner sat at a fixed 38% of the screen, which is where the
   *   map's bottom edge is exactly when the boss bar has pushed it down,
   *   which is exactly when there is a banner.
   */
  const stacked = await p.evaluate(async () => {
    run.bossCalled = true;
    if (!run.boss || run.boss.hp <= 0) spawnBoss();
    // Two Lieutenants standing, so the bar is HELD and the pips have a count.
    for (let i = 0; i < 2; i++) {
      const L = newBody('lieutenant', player.x + 150 + i * 40, player.y - 60, 0);
      L.awake = true; enemies.push(L);
    }
    const bs = run.boss;
    const title = (bs && bs.title) || 'The Gilded Deceiver';
    run.bannerText = title;
    run.bannerNote = 'His Lieutenants hold him. Break them first.';
    run.banner = 3.0;
    for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
    const box = sel => { const e = document.querySelector(sel);
      if (!e || e.hidden) return null; const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const hit = (a, c) => !!(a && c && a.x < c.r && a.r > c.x && a.y < c.b && a.b > c.y);
    const banner = box('#hud .banner');
    const held = box('#hud .boss .held');
    const bar = box('#hud .boss .bar');
    const mb = window.__game.scene.getScene('delve').overlay ? null : null;
    // The map is drawn by the scene, not the DOM, so its rect comes from the
    // same function the scene uses -- which is the whole point of minimapBox.
    const m = minimapBox();
    const map = { x: m.x - m.over, y: m.y - m.over,
                  r: m.x + m.s + m.over, b: m.y + m.s + m.over };
    void mb;
    return {
      title,
      bannerText: (document.querySelector('#hud .banner') || {}).textContent || '',
      heldText: (document.querySelector('#hud .boss .held') || {}).textContent || '',
      pips: document.querySelectorAll('#hud .boss .held span').length,
      overBar: hit(held, bar),
      overMap: hit(banner, map),
      bannerShown: !!banner, heldShown: !!held,
      barShown: !!bar
    };
  });
  ck('the fixture has the bar, the held tag and the banner all up',
     stacked.bannerShown && stacked.heldShown && stacked.barShown,
     'banner ' + stacked.bannerShown + ', held ' + stacked.heldShown +
     ', bar ' + stacked.barShown);
  ck('the avatar’s name is written once, not twice',
     stacked.heldShown && !stacked.bannerText.includes(stacked.title),
     JSON.stringify(stacked.bannerText) + ' beside a bar already saying ' +
     JSON.stringify(stacked.title));
  ck('and the banner still says what to do about him',
     /Lieutenants/.test(stacked.bannerText), JSON.stringify(stacked.bannerText));
  ck('HELD is beside the bar, not written across it', !stacked.overBar,
     stacked.heldText + ' with ' + stacked.pips + ' pip(s)');
  ck('and one pip for each Lieutenant still standing', stacked.pips === 2,
     stacked.pips + ' pips');
  ck('the banner clears the map instead of running under it', !stacked.overMap);

  const perf = await p.evaluate(() => {
    const s = window.__game.scene.getScene('delve').log.stats();
    return s ? { p50: s.p50, p90: s.p90 } : null;
  });
  ck('and it still holds a frame', perf && perf.p90 < 34,
     perf ? 'median ' + perf.p50 + 'ms, p90 ' + perf.p90 + 'ms (software GL here)' : 'no samples');
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  await p.screenshot({ path: path.join(__dirname, '..', 'overlay.png') });
  report();
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);

  function report() {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  }
})();
