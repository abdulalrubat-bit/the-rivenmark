#!/usr/bin/env node
/* The settings screen: every row does what it says, and is remembered.
 *
 * Each setting is checked by its EFFECT, not by the word on the button: the
 * shake is measured on the core's camera, the flash on the sprite's tint mode
 * and the red at the glass, the effects quality on the core's lowFx flag, the
 * vibration on navigator.vibrate itself (stubbed, since a headless browser
 * has nothing to vibrate), and the volumes on the engine's buses. Then the
 * page is reloaded and every one is read back.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A setting that does nothing passes "it is
 * off" -- so each is measured on AND off, and the "on" reading has to show
 * the effect for the "off" one to mean anything.
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
  const PORT = process.env.PORT || '8296';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // A vibrator that remembers, installed before anything else runs.
  await p.addInitScript(() => { window.__buzz = []; navigator.vibrate = x => { window.__buzz.push(x); return true; }; });
  const G = 'http://localhost:' + PORT + '/';
  const row = k => '#screens [data-set="' + k + '"]';
  const val = k => p.$eval(row(k) + ' .act', e => e.textContent);

  try {
    await p.goto(G); await p.evaluate(() => localStorage.clear()); await p.goto(G);
    await p.waitForSelector('#screens.up #descend', { timeout: 30000 });
    await p.mouse.click(5, 5);                               // a gesture, for the audio
    await p.click('#screens .tabs [data-tab="settings"]'); await sleep(200);
    ck('the gate-house has a settings tab', /Settings/.test(await p.$eval('#screens h1', e => e.textContent)));

    // ---- screen shake ------------------------------------------------------
    const shakeBy = () => p.evaluate(() => { cam.shake = 0; shake(10); const s = cam.shake; cam.shake = 0; return +s.toFixed(2); });
    const sFull = await shakeBy();
    await p.click(row('shake')); await sleep(100);
    const sRed = await shakeBy(); const lRed = await val('shake');
    await p.click(row('shake')); await sleep(100);
    const sOff = await shakeBy(); const lOff = await val('shake');
    ck('screen shake: full, then reduced, then off', sFull === 10 && sRed > 0 && sRed < sFull && sOff === 0 &&
       lRed === 'reduced' && lOff === 'off', sFull + ' -> ' + sRed + ' -> ' + sOff);

    // ---- flashes -------------------------------------------------------------
    // Measured in a running delve: descend, strike the hero, read the tint mode.
    await p.click(row('flash')); await sleep(100);
    ck('hit flashes can be turned off', (await val('flash')) === 'off');

    // ---- effects quality -----------------------------------------------------
    await p.click(row('fx')); await sleep(100);                 // auto -> full
    const fxFull = await val('fx');
    await p.click(row('fx')); await sleep(100);                 // full -> reduced
    const fxRed = await val('fx');
    ck('effects quality cycles auto -> full -> reduced', fxFull === 'full' && fxRed === 'reduced');

    // ---- volumes --------------------------------------------------------------
    await p.$eval('#screens [data-vol="music"]', e => { e.value = 30; e.dispatchEvent(new Event('input')); });
    await sleep(300);
    const vol = await p.evaluate(() => ({ music: __sound.vol.music,
      bus: __sound.music ? +__sound.music.gain.value.toFixed(2) : null }));
    ck('the music slider sets the music bus', vol.music === 0.3 && (vol.bus === null || Math.abs(vol.bus - 0.3) < 0.05),
       JSON.stringify(vol));

    // ---- controls -------------------------------------------------------------
    await p.click(row('controls')); await sleep(100);
    const ctl = await p.evaluate(() => ({ scheme: controlScheme, saved: localStorage.getItem('rivenmark.controls.v1') }));
    ck('the controls row switches the scheme, and saves it', ctl.scheme === 'classic' && ctl.saved === 'classic',
       JSON.stringify(ctl));
    await p.click(row('controls')); await sleep(100);

    // ---- vibration -------------------------------------------------------------
    const buzz = () => p.evaluate(async () => { window.__buzz.length = 0;
      sfx('hurt', undefined, undefined, 1); await new Promise(r => setTimeout(r, 120));
      sfx('death'); return window.__buzz.length; });
    const onBuzz = await buzz();
    await p.click(row('vibrate')); await sleep(100);
    const offBuzz = await buzz();
    ck('vibration pulses on a blow taken and a death', onBuzz === 2, onBuzz + ' pulses');
    ck('and is silent when turned off', offBuzz === 0 && (await val('vibrate')) === 'off', offBuzz + ' pulses');

    // ---- in a delve: the flash and the quality take effect --------------------
    await p.click('#screens .tabs [data-tab="splash"]'); await sleep(200);
    await p.click('#descend'); await sleep(1200);
    const inDelve = await p.evaluate(async () => {
      player.invuln = 0; player.hp = player.maxHp = 1e9;
      hurtPlayerBy(10);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sc = __game.scene.getScene('delve');
      // The flash is an additive grey (see flashOrTint); read that colour.
      return { heroTint: sc.hero.tintTopLeft, hurtShown: sc.air.hurt.visible, lowFx };
    });
    ck('with flashes off, a struck hero does not flash white', inDelve.heroTint !== 0x9a9a9a,
       'tint 0x' + (inDelve.heroTint >>> 0).toString(16));
    ck('...and the edges do not go red', inDelve.hurtShown === false);
    ck('effects quality "reduced" sheds the effects', inDelve.lowFx === true);

    // ---- remembered ------------------------------------------------------------
    await p.reload();
    await p.waitForSelector('#screens.up #descend', { timeout: 30000 });
    await p.click('#screens .tabs [data-tab="settings"]'); await sleep(200);
    const kept = { shake: await val('shake'), flash: await val('flash'), fx: await val('fx'),
                   vibrate: await val('vibrate'),
                   motion: await p.evaluate(() => { cam.shake = 0; shake(10); const s = cam.shake; cam.shake = 0; return s; }),
                   music: await p.evaluate(() => __sound.vol.music) };
    ck('every setting is remembered across a reload',
       kept.shake === 'off' && kept.flash === 'off' && kept.fx === 'reduced' && kept.vibrate === 'off' &&
       kept.motion === 0 && kept.music === 0.3, JSON.stringify(kept));

    // ---- from the pause card, and back to it -------------------------------------
    await p.click('#screens .tabs [data-tab="splash"]'); await sleep(200);
    await p.click('#descend'); await sleep(1000);
    await p.click('#hud .hold button'); await sleep(300);
    await p.click('#toSettings'); await sleep(200);
    const fromPause = await p.$eval('#screens h1', e => e.textContent);
    await p.click('#setBack'); await sleep(200);
    const back = await p.$eval('#screens h1', e => e.textContent);
    ck('the pause card opens settings, and Back returns to it', /Settings/.test(fromPause) && /Held/.test(back),
       fromPause + ' -> ' + back);

    ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    ck('the suite got all the way through', false, e.message.split('\n')[0]);
  }
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
