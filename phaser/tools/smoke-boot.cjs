/* THE WAY IN.
 *
 * Every other Phaser suite enters through ?nogate, which drops a delve on the
 * screen -- because each of them is about one thing that happens INSIDE a
 * delve and none of them should fail because a menu moved. This one is the
 * other half of that bargain: it is the only suite that opens the game the way
 * a player does, on a phone-shaped viewport at a phone's pixel ratio, and
 * presses the real buttons the whole way down.
 *
 * It exists because the Phaser build spent its whole life booting straight
 * into rung 4 as somebody called Isaac, with none of that chosen. Everything
 * the gate-house offers was built, and none of it was reachable, and no test
 * noticed for a month -- because every test skipped the front door.
 *
 * WHAT WOULD MAKE THIS VACUOUS, AND WHAT STOPS IT.
 *   - "the card is up before the bundle" would pass trivially if the bundle
 *     had in fact already run, so the same sample records __game and the
 *     check fails unless it was genuinely absent.
 *   - "the bar moves" would pass on a bar someone animated, so it is measured
 *     against a HELD atlas and asserted to start at the sliver.
 *   - "Descend takes you to the rung you chose" would pass on the default
 *     rung whatever the button did, so it picks one that is NOT the default
 *     and names it.
 *   - "the canvas is sharp" would pass if every number were the same, so the
 *     CSS size is checked against the viewport as well as the buffer against
 *     the ratio.
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

// A phone, and a phone's pixel ratio. Not a default desktop context: half of
// what this suite is about only differs from 1 when the ratio does.
const VIEW = { width: 390, height: 844 };
const DPR = 3;

/* Every field is optional-chained. If the card is reduced to a bare div --
 * which is what removing it from the shell and rebuilding it in the bundle
 * looks like -- these must come back null and be reported as named failures,
 * not throw and take the rest of the suite with them. */
const cardState = () => {
  const b = document.getElementById('boot');
  const bar = b && b.querySelector('.bar');
  return {
    t: Math.round(performance.now()),
    up: !!b,
    game: !!window.__game,
    out: b ? b.classList.contains('out') : null,
    title: b?.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    say: b?.querySelector('.say')?.textContent ?? null,
    /* Measured off the screen, not off the inline style. The sliver the bar
     * starts at is set in the shell's stylesheet and there IS no inline
     * style until title.js first writes one -- so reading style.width made
     * "it starts at a sliver" report 0% for the very case it exists to
     * check, the card standing there with no bundle behind it. */
    bar: bar && bar.querySelector('i')
      ? Math.round(100 * bar.querySelector('i').getBoundingClientRect().width /
                   (bar.getBoundingClientRect().width || 1))
      : null
  };
};

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'ignore' });
  const PORT = process.env.PORT || '8267';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...{ viewport: VIEW }, deviceScaleFactor: DPR,
                                   isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  /* A short leash on every click. The default is thirty seconds, and this
   * suite's whole job is to notice when a control the player needs is not
   * there -- so a missing one should be a named failure in a few seconds, not
   * a stack trace half a minute later with none of the checks printed. */
  const tap = sel => p.click(sel, { timeout: 4000 });

  const report = () => {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  };

  try {

  /* ---- 1. the card, over a load that is deliberately slow ----------------
   * Both big files are held back, and for two different reasons.
   *
   * bundle.js, because the first claim here is that the card does not wait
   * for the bundle -- and on a warm local server the bundle has arrived and
   * run inside 200ms, so a check timed against it would pass or fail on the
   * speed of the machine rather than on where the markup lives. Held, the
   * claim is proved by construction: the card is looked at while the bundle
   * is demonstrably still in flight.
   *
   * atlas.png, because the loading phase is otherwise too short to sample
   * twice and "the bar moved" would have nowhere to take its two readings.
   *
   * This is also what a phone on a bad connection actually does.
   */
  await p.route('**/bundle.js', async r => { await sleep(1400); await r.continue(); });
  await p.route('**/atlas.png', async r => { await sleep(2200); await r.continue(); });
  const base = 'http://localhost:' + PORT + '/';
  // commit, not load: the point is to be looking at the page while it loads.
  await p.goto(base, { waitUntil: 'commit' });
  await sleep(120);
  const first = await p.evaluate(cardState);
  ck('the title card is up while the bundle that would draw it is still in flight',
     first.up && first.game === false,
     'at ' + first.t + 'ms: card ' + (first.up ? 'up' : 'absent') +
     ', __game ' + (first.game ? 'ALREADY THERE' : 'not yet') +
     ', bundle held 1400ms');
  ck('and it names the game',
     /THE\s*RIVENMARK/i.test(first.title || ''), JSON.stringify(first.title));
  ck('and its bar starts at a sliver, not at nothing and not at a number it made up',
     first.bar !== null && first.bar > 0 && first.bar < 20, 'bar ' + first.bar + '%');

  await p.waitForFunction(
    () => document.querySelector('#boot .say')?.textContent === 'forging the delve…',
    null, { timeout: 20000 }).catch(() => {});
  await sleep(1100);
  const mid = await p.evaluate(cardState);
  ck('the bar tracks the load rather than an animation',
     mid.up && mid.bar > first.bar + 10 && mid.bar < 100,
     'sliver ' + first.bar + '% -> ' + (mid.bar === null ? 'card gone' : mid.bar + '%') +
     ' while the atlas was held');
  ck('and it says what it is waiting for', mid.say === 'forging the delve…', mid.say);

  await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30000 });
  const goneAt = await p.evaluate(() => Math.round(performance.now()));
  ck('the card comes down once the game is behind it', goneAt > 3600 && goneAt < 25000,
     'gone at ' + goneAt + 'ms, with the bundle held 1400ms and the atlas 2200ms');

  /* ---- 2. the game opens at the gate-house, not in a delve --------------- */
  const gate = await p.evaluate(() => ({
    state: state,
    screensUp: document.getElementById('screens').classList.contains('up'),
    h1: document.querySelector('#screens h1')?.textContent,
    tabs: [...document.querySelectorAll('#screens .tabs button')].map(t => t.textContent),
    heroes: [...document.querySelectorAll('#screens [data-hero]')].map(h => h.dataset.hero),
    rungs: [...document.querySelectorAll('#screens [data-level]')].map(r => r.dataset.level),
    descend: !!document.getElementById('descend'),
    runTime: run ? +(run.time || 0).toFixed(1) : null
  }));
  ck('the game opens at the gate-house and not in a delve',
     gate.state === 'menu' && gate.screensUp && /Gate-House/i.test(gate.h1 || ''),
     'state ' + gate.state + ', showing ' + JSON.stringify(gate.h1));
  ck('and no run has been started behind it', gate.runTime === 0,
     'run.time ' + gate.runTime);
  ck('and every station is on the rail',
     ['Descend', 'Forge', 'Vendor', 'Hall'].every(t => gate.tabs.includes(t)),
     gate.tabs.join(' / '));
  ck('and there is a hero and a rung to choose',
     gate.heroes.length >= 2 && gate.rungs.length >= 4,
     gate.heroes.length + ' heroes, ' + gate.rungs.length + ' rungs');

  /* ---- 3. the stations open --------------------------------------------- */
  const station = async (tab, want) => {
    await tap('#screens .tabs button[data-tab="' + tab + '"]');
    await sleep(220);
    const h = await p.evaluate(() => document.querySelector('#screens h1')?.textContent || '');
    ck('the ' + tab + ' station opens', want.test(h), JSON.stringify(h));
  };
  await station('gear', /Forge/i);
  await station('vendor', /Vendor|Ashen|Trader|Stall/i);
  await station('hall', /Hall/i);
  await station('splash', /Gate-House/i);

  /* ---- 4. Descend, on a rung that is NOT the default --------------------- */
  const want = gate.rungs[2];
  await tap('#screens [data-level="' + want + '"]');
  await sleep(200);
  await tap('#descend');
  await sleep(1400);
  const delve = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    return { state, level: LEVEL.id, screensUp: document.getElementById('screens').classList.contains('up'),
             bodies: sc.pool.length, walls: walls.length, hp: Math.round(player.hp),
             hud: !!document.querySelector('#hud .conduit'),
             kit: document.querySelectorAll('#hud .kit button').length };
  });
  ck('Descend takes you into the rung you chose, not the one it defaulted to',
     delve.state === 'play' && delve.level === want && want !== gate.rungs[0],
     'asked for ' + want + ', got ' + delve.level +
     ' (default was ' + gate.rungs[0] + ')');
  ck('and the gate-house is out of the way', delve.screensUp === false);
  ck('and there is a delve under it',
     delve.walls > 10 && delve.bodies > 20 && delve.hp > 0,
     delve.walls + ' walls, ' + delve.bodies + ' bodies, ' + delve.hp + ' hp');
  ck('and the HUD came with it', delve.hud && delve.kit >= 3,
     'conduit ' + (delve.hud ? 'up' : 'MISSING') + ', ' + delve.kit + ' kit buttons');

  /* ---- 5. hold, press on, abandon --------------------------------------- */
  await tap('#hud .hold button');
  await sleep(300);
  const held = await p.evaluate(() => ({
    state, h1: document.querySelector('#screens h1')?.textContent,
    up: document.getElementById('screens').classList.contains('up') }));
  ck('the delve can be held', held.state === 'pause' && held.up && /Held/i.test(held.h1 || ''),
     'state ' + held.state + ', showing ' + JSON.stringify(held.h1));

  await tap('#screens .go');
  await sleep(300);
  const back = await p.evaluate(() => ({
    state, up: document.getElementById('screens').classList.contains('up') }));
  ck('and pressed on again', back.state === 'play' && back.up === false, 'state ' + back.state);

  await tap('#hud .hold button');
  await sleep(300);
  await tap('#screens .alt');
  await sleep(900);
  const home = await p.evaluate(() => ({
    state, h1: document.querySelector('#screens h1')?.textContent,
    up: document.getElementById('screens').classList.contains('up'),
    walls: walls.length }));
  ck('and abandoning it comes back to the gate-house',
     home.state === 'menu' && home.up && /Gate-House/i.test(home.h1 || ''),
     'state ' + home.state + ', showing ' + JSON.stringify(home.h1));
  ck('with ground under the menu rather than the corpse of the last delve',
     home.walls > 10, home.walls + ' walls');

  /* ---- 6. the frame the whole thing was drawn into ----------------------- */
  const px = await p.evaluate(() => {
    const g = window.__game, c = g.canvas;
    return { buffer: [c.width, c.height], css: [Math.round(c.getBoundingClientRect().width),
                                                Math.round(c.getBoundingClientRect().height)],
             dpr: window.devicePixelRatio,
             cam: g.scene.getScene('delve').cameras.main.zoom };
  });
  ck('the canvas is filled at the device’s own resolution',
     px.buffer[0] === Math.round(px.css[0] * px.dpr) &&
     px.buffer[1] === Math.round(px.css[1] * px.dpr) && px.dpr === DPR,
     'buffer ' + px.buffer.join('x') + ', css ' + px.css.join('x') + ' at dpr ' + px.dpr);
  ck('and shown at the size of the phone, so the two are not the same number',
     px.css[0] === VIEW.width && px.css[1] === VIEW.height && px.buffer[0] !== px.css[0],
     'css ' + px.css.join('x') + ' against a ' + VIEW.width + 'x' + VIEW.height + ' viewport');
  ck('and a world unit is still a CSS pixel', Math.abs(px.cam - DPR) < 0.01,
     'camera zoom ' + px.cam);

  /* ---- 7. the debug entrance still bypasses all of it -------------------- */
  await p.unroute('**/atlas.png');
  await p.unroute('**/bundle.js');
  await p.goto(base + '?nogate');
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await p.evaluate(() => !!(window.__game && typeof state !== 'undefined' && state === 'play'))
          .catch(() => false)) break;
  }
  const dbg = await p.evaluate(() => ({
    state, boot: !!document.getElementById('boot'),
    up: document.getElementById('screens')?.classList.contains('up') }));
  ck('?nogate still drops straight into a delve, with no card in the way',
     dbg.state === 'play' && dbg.boot === false && dbg.up === false,
     'state ' + dbg.state + ', card ' + (dbg.boot ? 'STILL UP' : 'gone'));

  ck('no console errors anywhere on the way in', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    // A throw is a finding, not a crash: something the path needs was not
    // there. Name it and print everything that DID get checked first.
    ck('the way in got all the way through', false, e.message.split('\n')[0]);
  }

  report();
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
