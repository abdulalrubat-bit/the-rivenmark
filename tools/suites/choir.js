/* THE SILENT CHOIR: won by moving and interrupting, not by standing and cutting.
 *
 * Every rule of the encounter, measured on the core: the ring it stands in,
 * the note (what it costs you and the three ways to break it), the chord,
 * the fall and the rise, the stilling in runs of three, the silence at the
 * end, and where on the ladder it waits.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A Choir that never sang would pass every
 * "the note was broken" check, so each break is measured beside the same
 * note left alone and landing. A singer that never fell would pass "it did
 * not stay down", so the rise is timed from a fall that happened. And a
 * stilling rule that stilled everything would pass "three together are
 * stilled", so two apart are checked NOT to be.
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
  await p.waitForFunction(() => typeof spawnChoir === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    const step = secs => { for (let i = 0, n = Math.round(secs * 60); i < n; i++) update(1 / 60); };
    const fresh = (idx = CHOIR_FROM) => {
      setControls('new');
      startRun('isaac', LEVELS[idx].id, 'riven');
      for (const e of enemies) e.hp = 0;
      enemies.length = 0; slams.length = 0; hazards.length = 0;
      player.hp = player.maxHp = 1e9; player.invuln = 1e9;
      run.tech = LEVEL.quota; run.bossCalled = true;
      spawnBoss();
      player.x = run.choir.x; player.y = run.choir.y;
      run.choir.beat = 1e9;                        // no breath unless a check asks
    };
    const C = () => run.choir;
    const breathe = (i = 0) => { const s = C().singers[i].e;
      s.casting = CHOIR_WIND; s.castMax = CHOIR_WIND; s.note = true; return s; };

    // --- where it waits ---------------------------------------------------------
    o.ladder = { first: LEVELS[CHOIR_FROM].boss, firstName: LEVELS[CHOIR_FROM].name,
                 before: LEVELS.slice(0, CHOIR_FROM).some(L => L.boss === 'choir'),
                 count: LEVELS.filter(L => L.boss === 'choir').length,
                 finale: LEVELS[CURVE_DEEP].boss === 'choir' && LEVELS[CURVE_DEEP].finale === true,
                 crucibleKept: LEVELS.filter(L => L.boss === 'crucible').length,
                 noEpithets: LEVELS.filter(L => L.boss === 'choir').every(L => !L.mutators.length) };

    // --- the ring ------------------------------------------------------------------
    fresh();
    const S = C().singers;
    const dists = S.map(s => Math.hypot(s.e.x - C().x, s.e.y - C().y));
    o.ring = { n: S.length, near: Math.min(...dists), far: Math.max(...dists),
               barIsSum: Math.abs(run.boss.hp - S.reduce((t, s) => t + s.e.hp, 0)) < 1,
               anchored: S.every(s => s.e.speed === 0) };
    const x0 = S.map(s => s.e.x); step(2);
    o.ring.stood = S.every((s, i) => Math.abs(s.e.x - x0[i]) < 0.01);

    // --- a note, left alone ------------------------------------------------------
    fresh(); player.invuln = 0;
    const hit0 = (() => { const h = player.hp; hurtPlayerBy(10); const t = h - player.hp; player.invuln = 0; return t; })();
    breathe(0); step(CHOIR_WIND + 0.1);
    o.note = { notes: C().notes, slam: slams.length > 0 && Math.hypot(slams[0].x - player.x, slams[0].y - player.y) < 5,
               dark: (run.gloom || 0) > 0 };
    const hit1 = (() => { const h = player.hp; hurtPlayerBy(10); return h - player.hp; })();
    o.note.bite = +(hit1 / hit0).toFixed(3);
    player.invuln = 1e9;

    // --- and broken three ways ------------------------------------------------------
    fresh(); let s = breathe(1); step(0.5); silence(s, 3); step(CHOIR_WIND);
    o.decrypt = C().notes;
    fresh(); s = breathe(1); step(0.3);
    const drag0 = s.casting;
    nulls.push({ x: s.x, y: s.y, r: 96, life: 7, max: 7, pulse: 0 }); step(1.0);
    o.nullzone = { dragged: s.casting > drag0 - 1.0 + 0.3, notes: C().notes };
    fresh(); s = breathe(2); step(0.3);
    arcs.push({ x: s.x, y: s.y, dx: 1, dy: 0, a: 0, speed: 0, dmg: 1, half: 60, bow: 70, band: 40,
                delay: 0, swingNo: 999, breaks: true, life: 0.1, maxLife: 0.1, hit: [], dead: false });
    step(CHOIR_WIND);
    o.heavy = { notes: C().notes, casting: s.casting };

    // --- the chord --------------------------------------------------------------------
    fresh(); player.invuln = 0; player.hp = player.maxHp = 5000;
    for (let k = 0; k < CHOIR_FULL; k++) { breathe(k % C().singers.length); step(CHOIR_WIND + 0.05);
      slams.length = 0; if (state !== 'play') break; player.invuln = 0; }
    o.chord = { state, hp: Math.round(player.hp) };

    // --- the fall, and the rise ---------------------------------------------------------
    fresh();
    const one = C().singers[0], slag0 = loot.length;
    damageEnemy(one.e, 1e9, player.x, player.y); step(0.1);
    o.fall = { state: one.state, inWorld: enemies.includes(one.e), slag: loot.length - slag0 };
    step(CHOIR_REVIVE + 0.2);
    o.rise = { state: one.state, back: enemies.includes(one.e), half: Math.abs(one.e.hp / one.e.maxHp - 0.5) < 0.01 };

    // --- stilled in runs of three -- and two apart are not -------------------------------
    fresh();
    const T = C().singers;
    damageEnemy(T[0].e, 1e9, player.x, player.y); damageEnemy(T[2].e, 1e9, player.x, player.y); step(0.1);
    o.apart = [T[0].state, T[2].state];
    step(CHOIR_REVIVE + 0.2);
    o.apartRose = T[0].state === 'up' && T[2].state === 'up';
    fresh();
    const U = C().singers;
    for (const i of [0, 1, 2]) damageEnemy(U[i].e, 1e9, player.x, player.y);
    step(0.1);
    o.three = U.slice(0, 3).map(x => x.state);
    step(CHOIR_REVIVE + 0.5);
    o.threeStay = U.slice(0, 3).every(x => x.state === 'stilled');

    // --- the silence ----------------------------------------------------------------------
    // The last two are each flanked by a stilled voice, so both together still them.
    damageEnemy(U[3].e, 1e9, player.x, player.y); damageEnemy(U[4].e, 1e9, player.x, player.y);
    step(0.2);
    o.silent = { choir: run.choir === null, bossDown: run.bossDown === true, boss: run.boss === null };
    portal.x = player.x; portal.y = player.y;
    for (let i = 0; i < 60 * 6 && !run.gateOpen; i++) update(1 / 60);
    o.silent.gate = run.gateOpen;

    // --- the finale -------------------------------------------------------------------------
    fresh(CURVE_DEEP);
    o.finale = { n: C().singers.length, title: run.boss.title };
    return o;
  });

  const L = R.ladder;
  ck('the Choir first waits on the rung named for it', L.first === 'choir' && /Silent Choir/.test(L.firstName),
     L.firstName);
  ck('and never before it', L.before === false);
  ck('then every third rung, with the Crucible-Mass kept where it was', L.count >= 11 && L.crucibleKept >= 15,
     L.count + ' Choir rungs, ' + L.crucibleKept + ' Crucible');
  ck('and the bottom of the ladder is its finale', L.finale === true);
  ck('a Choir rung rolls no epithets (they are the Deceiver’s)', L.noEpithets === true);
  ck('five singers stand in a ring round the gate', R.ring.n === 5 && R.ring.near > 150 && R.ring.far < 320,
     R.ring.n + ' at ' + Math.round(R.ring.near) + '-' + Math.round(R.ring.far));
  ck('and never move', R.ring.anchored && R.ring.stood);
  ck('the bar is the voices still standing', R.ring.barIsSum === true);
  ck('a note left alone lands: the chord climbs', R.note.notes === 1, R.note.notes + ' notes');
  ck('...a slam comes down where you stand', R.note.slam === true);
  ck('...the room darkens', R.note.dark === true);
  ck('...and the delve bites harder', R.note.bite > 1.05 && R.note.bite < 1.3, 'x' + R.note.bite);
  ck('Decrypt snaps a note', R.decrypt === 0, R.decrypt + ' notes');
  ck('a Null-Zone drags a breath out', R.nullzone.dragged === true && R.nullzone.notes === 0,
     JSON.stringify(R.nullzone));
  ck('a gathered blow breaks a note mid-breath', R.heavy.notes === 0 && R.heavy.casting === 0,
     JSON.stringify(R.heavy));
  ck('five notes are the whole chord, and nothing survives it', R.chord.state === 'over' || R.chord.hp <= 0,
     JSON.stringify(R.chord));
  ck('a singer struck to nothing falls', R.fall.state === 'down' && R.fall.inWorld === false);
  ck('...drops no slag (it would be a well otherwise)', R.fall.slag === 0, R.fall.slag + ' lumps');
  ck('...and rises again at half its voice', R.rise.state === 'up' && R.rise.back && R.rise.half,
     JSON.stringify(R.rise));
  ck('two singers apart are not stilled -- they rise', R.apart.join() === 'down,down' && R.apartRose === true,
     R.apart.join() + ', rose ' + R.apartRose);
  ck('three side by side are stilled together', R.three.every(x => x === 'stilled'), R.three.join());
  ck('...and stay stilled', R.threeStay === true);
  ck('every voice stilled is silence: the avatar is down', R.silent.choir && R.silent.bossDown && R.silent.boss,
     JSON.stringify(R.silent));
  ck('...and the gate answers', R.silent.gate === true);
  ck('the finale is the whole Choir: seven voices', R.finale.n === 7 && /Whole/.test(R.finale.title),
     R.finale.n + ', ' + R.finale.title);
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
