#!/usr/bin/env node
/* The sound engine: when it may play, how much at once, where from, and the
 * switch that turns it off.
 *
 * Headless Chromium has a real AudioContext with a silent output, so what is
 * measured here is the engine's own bookkeeping -- what it agreed to play and
 * what it refused -- and the context's state, not what came out of a speaker.
 * Whether a sound is GOOD is for a person with headphones.
 *
 * WHAT WOULD MAKE THIS VACUOUS. An engine that plays nothing passes every
 * "it was dropped" check, so each refusal is measured beside the same call
 * being accepted: the flood lets exactly one through, the far sound is refused
 * where the near one plays, and muted is checked against unmuted.
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
  const PORT = process.env.PORT || '8295';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const ctxB = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctxB.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const S = () => p.evaluate(() => __sound.stats());
  const URL = 'http://localhost:' + PORT + '/?nogate&nogov';

  try {
    await p.goto(URL);
    await p.evaluate(() => { try { localStorage.removeItem('rivenmark.sound.v1'); } catch (e) {} });
    await p.goto(URL);
    await p.waitForFunction(() => state === 'play' && window.__sound, null, { timeout: 30000 });
    await p.evaluate(() => { for (const e of enemies) e.awake = false;
      player.hp = player.maxHp = 1e9; player.invuln = 1e9; });

    /* ---- nothing before a gesture ---------------------------------------- */
    ck('no sound is possible before the page is touched',
       (await S()).state === 'locked' && await p.evaluate(() => sfx('ui') === false));

    // A tap on the middle of the playfield: a gesture, and nothing it lands on.
    await p.mouse.click(195, 330);
    await p.waitForFunction(() => __sound.stats().state === 'running', null, { timeout: 5000 })
      .catch(() => {});
    ck('the first tap wakes it', (await S()).state === 'running', (await S()).state);
    ck('and it starts unmuted', (await S()).muted === false);

    /* ---- the core's hook reaches it ---------------------------------------- */
    const before = (await S()).played;
    const took = await p.evaluate(() => sfx('ui'));
    ck('sfx() from the core plays a sound', took === true && (await S()).played === before + 1);
    ck('an unknown sound is refused, not thrown',
       await p.evaluate(() => sfx('no-such-sound') === false));

    /* ---- a flood is thinned ------------------------------------------------ */
    await sleep(200);
    const flood = await p.evaluate(() => {
      let n = 0; for (let i = 0; i < 100; i++) if (sfx('ui')) n++; return n; });
    ck('a hundred of the same sound in one frame plays once', flood === 1, flood + ' played');

    // The engine-wide cap, with a recipe whose own limits are out of the way.
    const capped = await p.evaluate(() => {
      __sound.define('smoke-long', { max: 1000, gap: 0, make: (ctx, out, t) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.0001;
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 2); return 2; } });
      let n = 0; for (let i = 0; i < 100; i++) if (sfx('smoke-long')) n++;
      return { n, voices: __sound.stats().voices, cap: __sound.stats().cap };
    });
    ck('everything at once is held to the voice cap',
       capped.voices <= capped.cap && capped.n > 1, capped.n + ' played, cap ' + capped.cap);
    await sleep(2200);          // let the long voices finish

    /* ---- where a sound is -------------------------------------------------- */
    const place = await p.evaluate(() => {
      __sound.define('smoke-here', { max: 1000, gap: 0, make: () => 0.05 });
      const at = dx => { const ok = sfx('smoke-here', player.x + dx, player.y);
        return ok ? __sound.log[__sound.log.length - 1] : null; };
      return { here: at(0), right: at(400), left: at(-400), far: at(3000) };
    });
    ck('a sound at the hero is full and centred',
       place.here && place.here.vol === 1 && place.here.pan === 0, JSON.stringify(place.here));
    ck('one to the right is heard on the right, and quieter',
       place.right && place.right.pan > 0.5 && place.right.vol < 1, JSON.stringify(place.right));
    ck('one to the left is heard on the left',
       place.left && place.left.pan < -0.5, JSON.stringify(place.left));
    ck('one far across the map is not played at all', place.far === null);

    /* ---- every recipe makes a sound, and none clips ------------------------ */
    // Rendered offline, one at a time and at full size, so this is the recipe
    // itself and not the engine's caps or the limiter.
    const rend = await p.evaluate(async () => {
      const out = {};
      for (const name of Object.keys(__sound.recipes)) {
        if (name.startsWith('smoke-')) continue;
        const sr = 44100, oc = new OfflineAudioContext(1, sr * 1.5, sr);
        const n = oc.createBuffer(1, sr, sr), d = n.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const len = __sound.recipes[name].make(oc, oc.destination, 0, 1, n);
        const buf = await oc.startRendering(), x = buf.getChannelData(0);
        let peak = 0, last = 0;
        for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]);
          if (v > peak) peak = v; if (v > 0.003) last = i; }
        out[name] = { peak: +peak.toFixed(3), len: +len.toFixed(3), ends: +(last / sr).toFixed(3) };
      }
      return out;
    });
    const names = Object.keys(rend);
    ck('every recipe is heard', names.length >= 8 && names.every(n => rend[n].peak > 0.02),
       names.map(n => n + ' ' + rend[n].peak).join(', '));
    ck('and none clips on its own', names.every(n => rend[n].peak < 1),
       names.filter(n => rend[n].peak >= 1).join(', '));
    ck('each says truthfully how long it lasts (so its voice is freed on time)',
       names.every(n => rend[n].ends <= rend[n].len + 0.08),
       names.filter(n => rend[n].ends > rend[n].len + 0.08).map(n => n + ' ' + JSON.stringify(rend[n])).join(', '));

    /* ---- the fight is heard ------------------------------------------------ */
    // The events are the core's own: nothing here calls sfx() for the fight.
    const heard = () => p.evaluate(() => __sound.log.map(l => l.name));
    const since = async f => { const n0 = (await heard()).length;
      await sleep(260); await p.evaluate(f); return (await heard()).slice(n0); };
    const sw = await since(() => { swingAt(0); });
    ck('a swing is heard, blade and magic', sw.includes('swing') && sw.includes('crescent'), sw.join());
    await sleep(200);
    const hit = await since(() => { const e = newBody('thrall', player.x + 60, player.y, 0);
      e.awake = false; e.hp = e.maxHp = 1e6; enemies.push(e); window.__dummy = e;
      damageEnemy(e, 10, player.x, player.y); });
    ck('a blow landing is heard', hit.includes('hit') && !hit.includes('kill'), hit.join());
    const blk = await since(() => { __dummy.braced = true; damageEnemy(__dummy, 10, player.x, player.y);
      __dummy.braced = false; });
    ck('a blow into a guard sounds different', blk.includes('block') && !blk.includes('hit'), blk.join());
    const kill = await since(() => { __dummy.hp = 1; damageEnemy(__dummy, 50, player.x, player.y); });
    ck('a killing blow is a kill, not also a hit', kill.includes('kill') && !kill.includes('hit'), kill.join());
    const hurt = await since(() => { player.invuln = 0; hurtPlayerBy(20); player.invuln = 1e9; });
    ck('taking a blow is heard', hurt.includes('hurt'), hurt.join());

    /* ---- the kit is heard ---------------------------------------------------- */
    // Every ability through castAbility, the path a button press takes.
    const ready = () => p.evaluate(() => { player.gcd = 0; player.channel = null;
      player.cds = {}; });
    const kit = async f => { await ready(); await sleep(320); return since(f); };
    const tick = await kit(() => { player.charges = 0; gainCharge(1); });
    ck('a charge gained ticks', tick.includes('charge') && !tick.includes('charged'), tick.join());
    const full = await kit(() => { player.charges = CHARGE_MAX - 1; gainCharge(1); });
    ck('the last charge is a chord, not a tick', full.includes('charged') && !full.includes('charge'), full.join());
    const aeg = await kit(() => { player.charges = CHARGE_MAX; castAbility('aegis'); });
    ck('Aegis is heard', aeg.includes('aegis'), aeg.join());
    const no = await kit(() => { player.charges = 0; castAbility('guillotine'); });
    ck('a press that cannot fire says "not yet"', no.includes('deny') && !no.includes('guillotine'), no.join());
    const fz = await kit(() => { for (const e of enemies) e.hp = 0; enemies.length = 0;
      player.charges = CHARGE_MAX; castAbility('guillotine'); });
    ck('Guillotine on nothing fizzles', fz.includes('fizzle'), fz.join());
    // A body pushed now is not in the spatial grid until the next frame, and
    // the kit finds its targets through the grid -- so place, then wait.
    const place1 = (dx, casting) => p.evaluate(([dx, casting]) => {
      const e = newBody('thrall', player.x + dx, player.y, 0);
      e.awake = false; e.hp = e.maxHp = 1e6; if (casting) e.casting = 1e6;
      enemies.push(e); }, [dx, casting]);
    await place1(40, false);
    const gl = await kit(() => { player.charges = CHARGE_MAX; castAbility('guillotine'); });
    ck('Guillotine on a body is heard', gl.includes('guillotine'), gl.join());
    const pg = await kit(() => { castAbility('purge'); });
    ck('Purge starting is heard', pg.includes('purge'), pg.join());
    const md = await since(async () => { player.channel.left = 0.02;
      await new Promise(r => setTimeout(r, 250)); });
    ck('held to the end, it mends', md.includes('mend'), md.join());
    const lp = await kit(() => { castAbility('purge'); breakChannel('hurt'); });
    ck('broken, it lapses', lp.includes('lapse'), lp.join());
    const rd = await kit(async () => { player.cds = { purge: 0.05 };
      await new Promise(r => setTimeout(r, 250)); });
    ck('a cooldown coming round chimes', rd.includes('ready'), rd.join());
    const other = await kit(async () => { player.cds = { nullzone: 0.05 };
      await new Promise(r => setTimeout(r, 250)); });
    ck('but not for the other hero’s kit', !other.includes('ready'), other.join());
    const tn = await kit(() => { player.tension = TENSION_MAX * 0.35; gainTension(TENSION_MAX * 0.1); });
    ck('Tension crossing a Null-Zone’s worth ticks', tn.includes('charge'), tn.join());
    const tq = await kit(() => { player.tension = TENSION_MAX * 0.5; gainTension(TENSION_MAX * 0.05); });
    ck('but not every little gain', !tq.includes('charge') && !tq.includes('charged'), tq.join());
    const nz = await kit(() => { player.tension = TENSION_MAX; castAbility('nullzone'); });
    ck('Null-Zone is heard', nz.includes('nullzone'), nz.join());
    const dc = await kit(() => { castAbility('decrypt'); });
    ck('Decrypt with nothing casting fizzles', dc.includes('fizzle') && !dc.includes('decrypt'), dc.join());
    await place1(60, true);
    const dh = await kit(() => { player.tension = 0; castAbility('decrypt'); });
    ck('Decrypt snapping a cast is heard, and the Tension it gives back',
       dh.includes('decrypt') && dh.includes('charged'), dh.join());
    const jr = await kit(() => { player.jars = 1; castAbility('jars'); });
    ck('the Jars are heard', jr.includes('jars'), jr.join());
    await p.evaluate(() => { for (const e of enemies) e.hp = 0; enemies.length = 0; });

    /* ---- a hundred die at once ---------------------------------------------- */
    await sleep(600);
    const mass = await p.evaluate(() => {
      const n0 = __sound.log.length, d0 = __sound.dropped, body = [];
      for (let i = 0; i < 100; i++) { const e = newBody('thrall', player.x + 40 + (i % 10) * 6,
        player.y + Math.floor(i / 10) * 6, 0); e.awake = false; enemies.push(e); body.push(e); }
      const t0 = performance.now();
      for (const e of body) damageEnemy(e, 1e6, player.x, player.y);
      return { kills: __sound.log.slice(n0).filter(l => l.name === 'kill').length,
               dropped: __sound.dropped - d0, ms: performance.now() - t0,
               voices: __sound.stats().voices, failed: __sound.failed || 0 };
    });
    ck('a hundred kills in one frame are a few kill sounds, not a hundred',
       mass.kills >= 1 && mass.kills <= 4 && mass.dropped >= 90, JSON.stringify(mass));
    ck('and cost the frame next to nothing', mass.ms < 40, mass.ms.toFixed(1) + 'ms for 100 kills');
    ck('no recipe has failed', mass.failed === 0);

    /* ---- the switch on the HUD --------------------------------------------- */
    const btn = '#hud .hold .snd';
    ck('the HUD has a sound switch, showing on',
       await p.$eval(btn, e => !e.classList.contains('off') && e.getAttribute('aria-pressed') === 'true'));
    await p.click(btn); await sleep(300);
    const off = await S();
    ck('pressing it mutes', off.muted === true);
    ck('and puts the context to sleep, not just at zero', off.state === 'suspended', off.state);
    ck('and the switch shows it',
       await p.$eval(btn, e => e.classList.contains('off') && e.getAttribute('aria-pressed') === 'false'));
    ck('nothing plays while muted', await p.evaluate(() => sfx('ui') === false));
    ck('the game is not paused by it', await p.evaluate(() => state === 'play'));

    /* ---- remembered -------------------------------------------------------- */
    await p.reload();
    await p.waitForFunction(() => state === 'play' && window.__sound, null, { timeout: 30000 });
    await p.mouse.click(195, 330); await sleep(300);
    ck('muted is remembered across a reload', (await S()).muted === true);
    ck('and the switch comes back showing it',
       await p.$eval(btn, e => e.classList.contains('off')));
    ck('and a tap does not wake a muted engine', (await S()).state !== 'running', (await S()).state);

    /* ---- the switch on the pause screen, agreeing with the HUD ------------- */
    await p.click('#hud .hold button'); await sleep(300);
    const pl = () => p.$eval('#screens .snd', e => e.textContent);
    ck('the pause screen has the switch too, reading off', /off/i.test(await pl()), await pl());
    const n0 = (await S()).played;
    await p.click('#screens .snd'); await sleep(400);
    ck('turning it on there turns it on', (await S()).muted === false && (await S()).state === 'running');
    ck('the label follows', /on/i.test(await pl()), await pl());
    ck('the HUD switch agrees', await p.$eval(btn, e => !e.classList.contains('off')));
    ck('and turning it on answers with a sound', (await S()).played === n0 + 1);
    // Re-opening the card must not stack a watcher per visit.
    for (let i = 0; i < 5; i++) {
      await p.click('#screens .go'); await sleep(150);
      await p.click('#hud .hold button'); await sleep(150);
    }
    const w = await p.evaluate(() => __sound.watchers.length);
    ck('opening the pause screen again and again does not pile up listeners', w <= 3, w + ' watchers');
    await p.click('#screens .go'); await sleep(200);

    /* ---- the background ----------------------------------------------------- */
    const vis = async hidden => {
      await p.evaluate(h => { Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
        document.dispatchEvent(new Event('visibilitychange')); }, hidden);
      await sleep(300); return (await S()).state; };
    ck('sent to the background, it sleeps', await vis(true) === 'suspended');
    ck('and wakes when it comes back', await vis(false) === 'running');

    /* ---- the rules page stays silent ---------------------------------------- */
    const t = await ctxB.newPage();
    await t.goto('http://localhost:' + PORT + '/core-test.html');
    await t.waitForFunction(() => typeof resetRun === 'function', null, { timeout: 15000 });
    ck('the core-only page has the hook as a silent no-op',
       await t.evaluate(() => typeof sfx === 'function' && sfx('ui') === undefined && !window.__sound));
    await t.close();

    ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    ck('the suite got all the way through', false, e.message.split('\n')[0]);
  }
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
