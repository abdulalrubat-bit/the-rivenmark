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
    // Rendered offline, one at a time and at full size, through the chain the
    // game uses: the recipe's own volume, the master and the limiter. A voice
    // can run past 1.0 on its own -- Web Audio is floating point until the
    // speaker -- so what has to stay under it is what reaches the speaker.
    // Several renders each, because the noise is random and one render can
    // miss the loud draw.
    const rend = await p.evaluate(async () => {
      const out = {};
      for (const name of Object.keys(__sound.recipes)) {
        if (name.startsWith('smoke-')) continue;
        let peak = 0, last = 0, len = 0;
        for (let k = 0; k < 4; k++) {
          const sr = 22050, oc = new OfflineAudioContext(1, sr * 3, sr);
          const n = oc.createBuffer(1, sr, sr), d = n.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          const g = oc.createGain(), lim = __sound.limiter(oc);
          g.gain.value = __sound.recipes[name].vol * __sound.MASTER;
          g.connect(lim); lim.connect(oc.destination);
          len = __sound.recipes[name].make(oc, g, 0, 1, n);
          const x = (await oc.startRendering()).getChannelData(0);
          for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]);
            if (v > peak) peak = v; if (v > 0.002) last = Math.max(last, i / sr); }
        }
        out[name] = { peak: +peak.toFixed(3), len: +len.toFixed(3), ends: +last.toFixed(3) };
      }
      return out;
    });
    const names = Object.keys(rend);
    ck('every recipe is heard', names.length >= 8 && names.every(n => rend[n].peak > 0.01),
       names.map(n => n + ' ' + rend[n].peak).join(', '));
    ck('and none reaches the speaker clipped', names.every(n => rend[n].peak < 0.95),
       names.filter(n => rend[n].peak >= 0.95).map(n => n + ' ' + rend[n].peak).join(', ') ||
       'loudest ' + Math.max(...names.map(n => rend[n].peak)));
    ck('each says truthfully how long it lasts (so its voice is freed on time)',
       names.every(n => rend[n].ends <= rend[n].len + 0.08),
       names.filter(n => rend[n].ends > rend[n].len + 0.08).map(n => n + ' ' + JSON.stringify(rend[n])).join(', '));

    /* ---- the fight is heard ------------------------------------------------ */
    // The events are the core's own: nothing here calls sfx() for the fight.
    const heard = () => p.evaluate(() => __sound.log.map(l => l.name));
    const since = async (f, arg) => { const n0 = await p.evaluate(() => __sound.played);
      await sleep(260); await p.evaluate(f, arg);
      return p.evaluate(n0 => __sound.log.filter(l => l.n > n0).map(l => l.name), n0); };
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

    /* ---- the run is heard ----------------------------------------------------- */
    const last = n => p.evaluate(n => __sound.log.filter(l => l.name === n).slice(-1)[0] || null, n);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await p.evaluate(() => { run.bossCalled = true; run.tech = 0; player.bag = []; });
    const drop = (tech) => since(async tech => { run.tech = tech;
      loot.push({ x: player.x, y: player.y, vx: 0, vy: 0, value: 1, r: 6, spin: 0, life: 0, pulled: true });
      await new Promise(r => setTimeout(r, 200)); }, tech);
    const s0 = await drop(0), m0 = (await last('slag') || {}).mag;
    const s1 = await drop(Math.round(await p.evaluate(() => LEVEL.quota * 0.8))), m1 = (await last('slag') || {}).mag;
    ck('slag picked up is heard', s0.includes('slag') && s1.includes('slag'), s0.join() + ' / ' + s1.join());
    ck('and climbs as the quota fills', m1 > m0, m0 + ' -> ' + m1);
    const qt = await since(() => { run.tech = LEVEL.quota - 1; collectTech(1); });
    ck('meeting the quota has its own sound', qt.includes('quota'), qt.join());
    const qt2 = await since(() => { collectTech(1); });
    ck('and only the once', !qt2.includes('quota'), qt2.join());
    const cf = await since(() => { openChest({ x: player.x + 30, y: player.y, kind: Object.keys(CHEST_KINDS)[0],
      open: false }); });
    ck('a coffer opening is heard', cf.includes('coffer'), cf.join());
    const gearAt = rid => since(async rid => { player.bag = []; const it = rollItem(0.5); it.rarity = rid;
      drops.push({ x: player.x, y: player.y, vx: 0, vy: 0, item: it, r: 9, life: 0, pulled: true });
      await new Promise(r => setTimeout(r, 200)); }, rid);
    const g0 = await gearAt('worn'), gm0 = (await last('gear') || {}).mag;
    await wait(200);
    const g1 = await gearAt('riven'), gm1 = (await last('gear') || {}).mag;
    ck('gear into the bag is heard', g0.includes('gear') && g1.includes('gear'), g0.join() + ' / ' + g1.join());
    ck('and a rarer piece sounds bigger', gm1 > gm0, gm0 + ' -> ' + gm1);
    const bf = await since(async () => { player.bag = []; while (player.bag.length < bagCap()) player.bag.push(rollItem(0.3));
      run.bagWarned = 0;
      drops.push({ x: player.x, y: player.y, vx: 0, vy: 0, item: rollItem(0.3), r: 9, life: 0, pulled: true });
      await new Promise(r => setTimeout(r, 200)); });
    ck('a full bag says so', bf.includes('deny'), bf.join());
    await p.evaluate(() => { player.bag = []; drops.length = 0; });
    const slam = kind => since(async kind => { const s = { x: player.x + 120, y: player.y, r: 40, wind: 0, t: 0,
      dmg: 0, struck: false }; if (kind) s[kind] = true; slams.push(s);
      await new Promise(r => setTimeout(r, 150)); }, kind);
    const sb = await slam('barrel');
    ck('a barrel going off is a blast', sb.includes('blast'), sb.join());
    await wait(200);
    const sp = await slam('pillar');
    ck('a pillar coming down crumbles', sp.includes('crumble'), sp.join());
    await wait(200);
    const ss = await slam(null);
    ck('a body’s slam is heard', ss.includes('slam'), ss.join());
    await p.evaluate(() => { hazards.length = 0; slams.length = 0; });

    // The gate, far across the map: heard anyway.
    const gw = await since(async () => { portal.x = player.x + 3000; portal.y = player.y;
      run.forcedOpen = true; await new Promise(r => setTimeout(r, 200)); });
    const gv = await last('gate');
    ck('the gate waking is heard across the delve', gw.includes('gate') && gv && gv.vol >= 0.44,
       gw.join() + ' ' + JSON.stringify(gv));
    ck('and from the side it is on', gv && gv.pan > 0.5, gv && 'pan ' + gv.pan);
    // Waited on the game's own clock, not the wall's: headless frames are slow.
    const wd = await since(async () => { portal.x = player.x; portal.y = player.y; portal.channel = 0;
      const t0 = performance.now();
      while (!run.gateOpen && performance.now() - t0 < 15000) {
        portal.x = player.x; portal.y = player.y;
        await new Promise(r => setTimeout(r, 100)); }
      await new Promise(r => setTimeout(r, 150)); });
    const winds = wd.filter(n => n === 'wind').length;
    ck('winding it open is heard in steps', winds >= 2 && winds <= 3, winds + ' steps: ' + wd.join());
    ck('and it opening is heard', wd.includes('gateopen'), wd.join());
    const sg = await since(async () => { run.holdTime = HOLD_WAVE - HOLD_LULL - 0.02;
      await new Promise(r => setTimeout(r, 200)); });
    ck('a surge held is heard', sg.includes('surge'), sg.join());
    await p.evaluate(() => { portal.x = player.x + 5000; for (const e of enemies) e.hp = 0; enemies.length = 0; });
    const cp = await since(() => { run.corpse = { x: player.x + 20, y: player.y, items: [], coins: 0, taken: 0 };
      claimCorpse(); });
    ck('reclaiming your corpse is heard', cp.includes('corpse'), cp.join());
    await p.evaluate(() => { for (const e of enemies) e.hp = 0; enemies.length = 0; run.corpse = null; });

    /* ---- a hundred die at once ---------------------------------------------- */
    await sleep(600);
    const mass = await p.evaluate(() => {
      const n0 = __sound.played, d0 = __sound.dropped, body = [];
      for (let i = 0; i < 100; i++) { const e = newBody('thrall', player.x + 40 + (i % 10) * 6,
        player.y + Math.floor(i / 10) * 6, 0); e.awake = false; enemies.push(e); body.push(e); }
      const t0 = performance.now();
      for (const e of body) damageEnemy(e, 1e6, player.x, player.y);
      return { kills: __sound.log.filter(l => l.n > n0 && l.name === 'kill').length,
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

    /* ---- the ends of a delve -------------------------------------------------- */
    const endHeard = async won => {
      await p.goto(URL);
      await p.waitForFunction(() => state === 'play' && window.__sound, null, { timeout: 30000 });
      await p.mouse.click(195, 330); await sleep(400);
      return p.evaluate(w => { const n0 = __sound.played; endRun(w);
        return __sound.log.filter(l => l.n > n0).map(l => l.name); }, won);
    };
    const ex = await endHeard(true);
    ck('getting out is heard', ex.includes('extract') && !ex.includes('death'), ex.join());
    const dd = await endHeard(false);
    ck('dying is heard', dd.includes('death') && !dd.includes('extract'), dd.join());

    /* ---- the bosses ------------------------------------------------------------ */
    await p.goto(URL);
    await p.waitForFunction(() => state === 'play' && window.__sound, null, { timeout: 30000 });
    await p.mouse.click(195, 330); await sleep(400);
    await p.evaluate(() => { for (const e of enemies) e.awake = false;
      player.hp = player.maxHp = 1e9; player.invuln = 1e9; });
    // Waits of a second and more: the boss sounds are long and space themselves.
    const boss = async (f, arg) => { await sleep(1100); return since(f, arg); };
    const ar = await boss(() => { portal.x = player.x + 200; portal.y = player.y; spawnDeceiver(); });
    ck('the Deceiver arriving is heard', ar.includes('arrive'), ar.join());
    const bl = await boss(async () => { run.boss.blink = 0; await new Promise(r => setTimeout(r, 300)); });
    ck('his blink is heard', bl.includes('blink'), bl.join());
    const mi = await boss(async () => { run.boss.split = 0; await new Promise(r => setTimeout(r, 300)); });
    ck('his mirages are heard', mi.includes('mirage'), mi.join());
    const gd = await boss(async () => { run.boss.guardCd = 5; run.boss.braced = false; run.boss.guardT = 0;
      await new Promise(r => setTimeout(r, 300)); run.boss.guardCd = 0; run.boss.braced = false; });
    ck('his guard coming up is heard', gd.includes('guard'), gd.join());
    const br = await boss(() => { beginBreath(run.boss); });
    ck('the Breath is heard', br.includes('breath'), br.join());
    const nl = await boss(() => { tryNullify(run.boss.x, run.boss.y, 96); });
    ck('and snuffing it is heard', nl.includes('nullified'), nl.join());
    const fl = await boss(() => { for (const e of enemies) if (e.kind === 'lieutenant') e.hp = 0;
      run.boss.hp = 1; damageEnemy(run.boss, 1e6, player.x, player.y); });
    ck('his fall is heard', fl.includes('fall'), fl.join());
    await p.evaluate(() => { for (const e of enemies) e.hp = 0; enemies.length = 0; });
    const cr = await boss(() => { portal.x = player.x + 300; portal.y = player.y; spawnCrucible(); });
    ck('the Crucible arriving is heard', cr.includes('arrive'), cr.join());
    const fu = await boss(async () => { run.boss.furnace = 0; await new Promise(r => setTimeout(r, 300)); });
    ck('its Furnace ring is heard as it is thrown', fu.includes('furnace'), fu.join());
    await p.evaluate(() => { slams.length = 0; hazards.length = 0; });
    const inv = await boss(() => { run.boss.hp = 1; damageEnemy(run.boss, 1e6, player.x, player.y);
      for (const e of enemies) e.hp = 0; enemies.length = 0; spawnInvader(); });
    ck('the uninvited arriving is heard', inv.includes('arrive'), inv.join());
    const dw = await boss(() => { run.boss = run.invader; wipeRoom('test'); });
    ck('False Dawn is heard', dw.includes('dawn'), dw.join());

    /* ---- the menus -------------------------------------------------------------- */
    const G = 'http://localhost:' + PORT + '/';
    await p.goto(G + '?norun');
    await p.waitForFunction(() => typeof blankStash === 'function', null, { timeout: 30000 });
    await p.evaluate(() => { stash = blankStash(); stash.coins = 99999; saveStash(); });
    await p.goto(G);
    await p.waitForSelector('#screens.up #descend', { timeout: 30000 });
    await p.mouse.click(5, 5); await sleep(400);            // unlock, on nothing
    const menu = async (sel, f) => { const n0 = await p.evaluate(() => __sound.played);
      await sleep(250); if (sel) await p.click(sel); if (f) await f(); await sleep(250);
      return p.evaluate(n0 => __sound.log.filter(l => l.n > n0).map(l => l.name), n0); };
    const tb = await menu('#screens .tabs [data-tab="vendor"]');
    ck('a tab tapped clicks', tb.includes('tap'), tb.join());
    const by = await menu('#screens [data-buy="reliquary"]');
    ck('buying is heard', by.includes('buy'), by.join());
    await menu('#screens .tabs [data-tab="hall"]');
    const bd = await menu('#screens [data-hall]:not([disabled])');
    ck('building in the Hall is heard', bd.includes('build'), bd.join());
    await menu('#screens .tabs [data-tab="gear"]');
    const eq = await menu('#screens [data-on]');
    ck('equipping is heard', eq.includes('equip'), eq.join());
    const uq = await menu('#screens [data-off]:not([disabled])');
    ck('taking a piece off is heard', uq.includes('unequip'), uq.join());
    const d1 = await menu('#screens [data-drop]');
    ck('a first tap on discard only arms it', !d1.includes('discard'), d1.join());
    const d2 = await menu('#screens [data-drop].armed');
    ck('the second throws it out, and is heard', d2.includes('discard'), d2.join());
    await menu('#screens .tabs [data-tab="splash"]');
    const ds = await menu('#descend');
    ck('descending is heard', ds.includes('descend'), ds.join());
    const hd = await menu('#hud .hold .bag');
    ck('the HUD’s buttons click too', hd.includes('tap'), hd.join());

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
