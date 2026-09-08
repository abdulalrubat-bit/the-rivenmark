/* THE CONDUIT, DRIVEN BY A THUMB.
 *
 * conduit.js proves the state machine. This proves the CONTROL: that a real
 * pointer on a real element produces a tap, an aimed drag and a gather -- the
 * half that lives in the HUD and that no headless test of the core can see.
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'ignore' });
  const PORT = process.env.PORT || '8253';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:' + PORT + '/?nogate');
  let booted = false;
  for (let i = 0; i < 40 && !booted; i++) {
    await sleep(250);
    booted = await p.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
    }).catch(() => false);
  }
  ck('the delve boots', booted);
  if (!booted) { console.log('\nFAIL 1\n  x no boot'); await b.close(); srv.kill(); process.exit(1); }

  const box = await p.evaluate(() => {
    const el = document.querySelector('#hud .conduit');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width };
  });
  ck('the Conduit is on screen and big enough for a thumb',
     !!box && box.w >= 80, box ? box.w + 'px across' : 'NOT FOUND');
  if (!box) { console.log('\nFAIL 1\n  x no conduit'); await b.close(); srv.kill(); process.exit(1); }

  const arm = () => p.evaluate(() => {
    player.hp = player.maxHp = 1e7;
    player.fireTimer = 0; arcs.length = 0;
    player.combo = 0; player.comboT = 0; player.cleave = 0;
    window.__seen = [];
    if (!window.__wrapped) {
      window.__wrapped = 1;
      const of = window.swingAt;
      window.swingAt = function (a, o) {
        const r = of.apply(this, arguments);
        if (window.__seen) window.__seen.push({ a: +a.toFixed(2), bite: (o && o.bite) || null,
                                                heavy: !!(o && o.heavy) });
        return r;
      };
    }
  });
  const seen = () => p.evaluate(() => window.__seen.slice());
  // Clears only what has been recorded. arm() also zeroes the gather, which is
  // wrong to do a frame before testing a release -- the first version did, and
  // only passed because the next frame re-gathered it.
  const clear = () => p.evaluate(() => { window.__seen = []; });
  const beat = await p.evaluate(() => player.fireDelay);

  // --- a tap ---------------------------------------------------------------
  await arm();
  await p.mouse.move(box.x, box.y);
  await p.mouse.down(); await sleep(60); await p.mouse.up();
  await sleep(120);
  const tap = await seen();
  ck('a tap swings the blade', tap.length > 0 && tap[0].bite === 1,
     tap.length ? 'bite ' + tap[0].bite : 'nothing came out of a tap');

  // --- a drag, aimed straight up -------------------------------------------
  await arm();
  await p.mouse.move(box.x, box.y);
  await p.mouse.down();
  await p.mouse.move(box.x, box.y - 30, { steps: 4 });
  /* HELD UNTIL IT HAS SWUNG TWICE, not for a fixed slice of wall clock.
   *
   * This used to sleep for 2.4 beats of real time and assert two swings came
   * out. It measured one, and the mechanism was fine: on the software GL this
   * container renders with, the simulation advances at about a third of real
   * time -- fireTimer was measured falling 0.6 to 0 over 1681ms of wall clock
   * against a 620ms beat -- so 1.5 seconds of sleeping is barely one beat of
   * game time. It only ever passed because the automatic blade was firing
   * during the same window and its swings were being counted too, which means
   * the check was partly measuring a swing nobody asked for.
   *
   * So it waits on the thing it is actually asserting. The cap is wall clock
   * and generous; the claim is the count.
   */
  await p.waitForFunction(() => (window.__seen || []).length >= 2, null, { timeout: 8000 })
        .catch(() => {});
  await p.mouse.up();
  await sleep(120);
  const drag = await seen();
  // Up the screen is -y, which is -PI/2.
  const up = drag.filter(s => Math.abs(s.a + Math.PI / 2) < 0.25);
  ck('a drag aims the blade where the thumb went',
     up.length > 0, drag.length ? drag.map(s => s.a).join(', ') + ' rad' : 'nothing fired');
  ck('and keeps swinging while it is held, on the blade’s own beat', drag.length >= 2,
     drag.length + ' swings over ' + (beat * 2.4).toFixed(1) + 's, at a beat of ' + beat);

  // --- a gather ------------------------------------------------------------
  await arm();
  await p.mouse.move(box.x, box.y);
  await p.mouse.down();
  await p.mouse.move(box.x + 44, box.y, { steps: 5 });
  // Past CONDUIT_HOLD, which is when a gather actually starts -- sampled
  // before it, this read zero and called the control broken.
  await sleep(700);
  const midChg = await p.evaluate(() => ({ chg: +(player.cleave || 0).toFixed(2),
    css: document.querySelector('#hud .conduit').style.getPropertyValue('--chg'),
    lit: document.querySelector('#hud .conduit').classList.contains('gathering') }));
  /* Long enough that the gather is finished by wall time on ANY frame rate,
   * not merely on a fast one. 600ms was cutting it fine against a 1.15s
   * gather, and on software GL under load this read 0.58, 0.74 and 0.9 on
   * three consecutive runs of the same unchanged code. A check whose answer
   * depends on how busy the machine is teaches people to ignore it; the
   * claim here is "a full hold gathers fully", so hold fully. */
  await p.waitForFunction(() => (player.cleave || 0) >= 0.99, null, { timeout: 6000 })
        .catch(() => {});
  const full = await p.evaluate(() => +(player.cleave || 0).toFixed(2));
  await clear();                                // the release, and nothing else
  await p.mouse.up();
  await sleep(150);
  const cleave = await seen();
  ck('holding it at the rim gathers', full > 0.9,
     'gathered ' + full + ' (held until full, or 6s)');
  ck('and the control shows it', midChg.lit === true && midChg.css !== '',
     'wedge at ' + (midChg.css || 'nothing') + ', rim lit ' + midChg.lit);
  ck('and letting go brings it round heavy',
     cleave.length > 0 && cleave[0].heavy === true && cleave[0].bite > 2,
     cleave.length ? 'bite ' + cleave[0].bite.toFixed(2) + ', heavy ' + cleave[0].heavy
       : 'nothing came out of a full gather');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
