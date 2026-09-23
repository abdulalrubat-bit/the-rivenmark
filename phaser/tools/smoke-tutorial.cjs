#!/usr/bin/env node
/* The first delve teaches itself: each step is finished by doing it.
 *
 * Played through the way a new player would: walk, strike, aim, the heavy
 * blow, an ability, and the card about getting out. Then the edges: it does
 * not come back once seen, Skip ends it for good, Settings brings it back,
 * the practice room never shows it, a delve that ends mid-lesson brings it
 * back next time, and in Hardcore the last card says what one life means.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A tutorial that advanced on a timer would
 * pass "it moved on", so each step is checked NOT to move on before the
 * thing is done, as well as to move on after.
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();
  const PORT = process.env.PORT || '8299';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const G = 'http://localhost:' + PORT + '/';
  const step = () => p.evaluate(() => { const t = document.querySelector('#tut');
    return t ? { n: +(t.querySelector('.row span').textContent.split(' ')[0]), text: t.textContent,
                 point: document.querySelector('.tut-point') ? document.querySelector('.tut-point').className : '' }
             : null; });
  const descend = async () => {
    await p.waitForSelector('#screens.up #descend', { timeout: 30000 });
    await p.click('#descend'); await sleep(900);
    await p.evaluate(() => { for (const e of enemies) e.awake = false; player.invuln = 1e9; player.hp = player.maxHp = 1e9; });
  };
  // Out of the delve and back at the gate-house, by the buttons' own words:
  // pause, abandon (or leave practice), and "To the gate-house" if an
  // outcome card is in the way.
  const leave = async () => {
    await p.click('#hud .hold button'); await sleep(250);
    await p.click('#screens button.alt >> text=/Abandon|Leave practice/'); await sleep(400);
    const home = await p.$('#screens button >> text=To the gate-house');
    if (home) { await home.click(); await sleep(400); }
    await p.waitForSelector('#screens.up #descend', { timeout: 15000 });
  };

  try {
    await p.goto(G); await p.evaluate(() => localStorage.clear()); await p.goto(G);
    await descend();
    let s = await step();
    ck('the first delve opens with the lesson, step 1 of 6', s && s.n === 1, s && s.text.slice(0, 60));

    // 1: walk
    await sleep(400);
    ck('...and it waits for you to walk', (await step()).n === 1);
    await p.evaluate(() => { player.x += 200; }); await sleep(250);
    s = await step();
    ck('walking moves it on, to the Conduit, and points at it', s.n === 2 && /conduit/.test(s.point), s.point);

    // 2: strike
    await p.evaluate(() => { attackPress(); }); await sleep(2200); await p.evaluate(() => attackRelease());
    s = await step();
    ck('holding the Conduit to strike moves it on', s.n === 3, 'step ' + s.n);

    // 3: aim
    await sleep(300);
    ck('...and aiming waits for an aimed blow', (await step()).n === 3);
    await p.evaluate(() => { attackPress(); attackAim(1.2, 0.7); }); await sleep(1800);
    await p.evaluate(() => { attackRelease(); attackNeutral(); });
    s = await step();
    ck('two blows aimed by hand move it on, to the heavy button', s.n === 4 && /heavy/.test(s.point), s.point);

    // 4: heavy
    await p.evaluate(() => heavyPress()); await sleep(900); await p.evaluate(() => heavyRelease()); await sleep(250);
    s = await step();
    ck('a heavy blow moves it on, to the kit', s.n === 5 && /kit/.test(s.point), s.point);

    // 5: an ability -- and the kit has been filled for it
    const full = await p.evaluate(() => (player.charges || 0) >= CHARGE_MAX);
    await p.click('#hud .kit button:not([disabled])'); await sleep(300);
    s = await step();
    ck('the kit is full for the lesson, and using it moves it on', full && s.n === 6, 'step ' + s.n);
    ck('the last card says what is kept and lost', /worn gear is always kept/.test(s.text) &&
       /bag and coin stay/.test(s.text), s.text.slice(0, 80));

    // 6: understood
    await p.click('#tut .go'); await sleep(200);
    const seen = await p.evaluate(() => JSON.parse(localStorage.getItem('rivenmark.settings.v1')).tutorialSeen);
    ck('Understood ends it, and it is remembered', !(await step()) && seen === true);

    // It does not come back.
    await leave(); await descend();
    ck('the next delve has no lesson', !(await step()));

    // Settings brings it back, and Skip ends it for good.
    await leave();
    await p.click('#screens .tabs [data-tab="settings"]'); await sleep(200);
    await p.click('#screens [data-set="tutorial"]'); await sleep(100);
    await p.click('#screens .tabs [data-tab="splash"]'); await sleep(200);
    await descend();
    ck('"teach the controls again" brings it back on the next delve', (await step())?.n === 1);
    await p.click('#tut .skip'); await sleep(200);
    ck('Skip ends it at once', !(await step()));
    await leave(); await descend();
    ck('and a skipped lesson stays skipped', !(await step()));

    // A delve that ends mid-lesson brings it back; practice never shows it.
    await leave();
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('rivenmark.settings.v1'));
      s.tutorialSeen = false; localStorage.setItem('rivenmark.settings.v1', JSON.stringify(s));
      window.__replayTutorial(); });
    await p.click('#practice'); await sleep(900);
    ck('the practice room never shows the lesson', !(await step()));
    await leave();
    await descend();
    ck('a real delve does', (await step())?.n === 1);
    await leave(); await descend();
    ck('and one that ended mid-lesson brings it back', (await step())?.n === 1);

    // Hardcore's last card.
    await p.evaluate(() => { hardcore = true; const t = window.__tutorial; while (t.i < 5) t.next(); });
    s = await step();
    ck('in Hardcore the last card says what one life means', /Hardcore: one life/.test(s.text) &&
       /close the game mid-delve/.test(s.text), s.text.slice(0, 90));
    await p.evaluate(() => { hardcore = false; });

    ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    ck('the suite got all the way through', false, e.message.split('\n')[0]);
  }
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
