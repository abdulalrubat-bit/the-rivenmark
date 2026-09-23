/* THE ATTACK CONTRACT: every input is carried out, held a moment, or refused
 * with a reason -- never silently lost, never turned into something else.
 *
 * The new controls, held to the acceptance list of the combat analysis
 * (docs/COMBAT_BASELINE.md has the old controls failing the same things):
 * a press strikes on the next step; a hold keeps striking; an early press
 * inside the buffer strikes exactly once when the blade is ready; holding at
 * the rim never gathers and never slows the walk; the middle means the
 * assist; a cancelled touch, a pause, a swap, a death or a new delve drops
 * the intent; an ordinary kill does not stop the world; and the simulation
 * comes out the same at 30, 60 and 120 frames a second.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A scheme that never swings passes every "did
 * not fire" check, so each of those sits beside the same input firing; and
 * the new rules are run against the classic controls too, which must still
 * fail them -- or the switch between the two is not a switch.
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
  await p.waitForFunction(() => typeof resetRun === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    const seed = s => { let a = s; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const fresh = (scheme, s) => {
      seed(s || 1);
      setControls(scheme);
      resetRun('isaac', LEVELS[0].id, 'riven');
      state = 'play';
      for (const e of enemies) e.hp = 0;
      enemies.length = 0;
      player.hp = player.maxHp = 1e9; player.invuln = 1e9;
      hitStop = 0;
    };
    const step = secs => { let lost = 0; for (let i = 0, n = Math.round(secs * 60); i < n; i++)
      if (!stepDelve(STEP)) lost++; return lost; };
    const sw = () => player.swingNo || 0;

    // 1. a press strikes on the next step
    fresh('new'); let s0 = sw(); attackPress(); step(STEP); o.pressNext = sw() - s0; attackRelease();
    // 2. a still press held past the old tap window still strikes (C01)
    fresh('new'); s0 = sw(); attackPress(); step(0.25); attackRelease(); o.held250 = sw() - s0;
    // 3. a hold keeps striking, on the beat
    fresh('new'); s0 = sw(); attackPress(); step(2.0); attackRelease();
    o.hold2 = sw() - s0; o.hold2want = 1 + Math.floor(2.0 / player.fireDelay + 1e-6);
    // 4. an early press inside the buffer strikes once, when the blade is ready (C02)
    fresh('new'); s0 = sw(); attackPress(); step(STEP); attackRelease();
    step(player.fireDelay - 0.1); attackPress(); step(STEP); attackRelease();
    step(0.3); o.early = sw() - s0;
    //    ...and one far too early has expired, and says so
    fresh('new'); s0 = sw(); attackPress(); step(STEP); attackRelease();
    step(player.fireDelay * 0.3); attackPress(); step(STEP); attackRelease();
    step(player.fireDelay); o.tooEarly = sw() - s0;
    o.expiredLogged = combatLog.some(e => e.k === 'press' && e.r === 'expired');
    //    two quick early presses are still one strike, not a backlog
    fresh('new'); s0 = sw(); attackPress(); step(STEP); attackRelease();
    step(player.fireDelay - 0.1); attackPress(); attackRelease(); attackPress(); attackRelease();
    step(0.5); o.noBacklog = sw() - s0;
    // 5. held at the rim for two seconds: no gather, and the walk is the walk (C03, C04)
    const walk = held => { fresh('new'); stick.dx = 1; stick.dy = 0; stick.mag = 1; stick.active = true;
      const x0 = player.x; if (held) { attackPress(); attackAim(0, 0.95); } step(1.0);
      const out = { dx: player.x - x0, cleave: player.cleave || 0 }; attackRelease();
      stick.mag = 0; stick.dx = 0; stick.active = false; return out; };
    const wHeld = walk(true), wFree = walk(false);
    o.rim = { cleave: wHeld.cleave, held: +wHeld.dx.toFixed(1), free: +wFree.dx.toFixed(1) };
    // 6. the middle means the assist; a drag means your aim, over the assist
    fresh('new');
    const t = newBody('thrall', player.x + 60, player.y, 0); t.awake = false; enemies.push(t);
    step(STEP);
    attackPress(); attackAim(Math.PI, 0.6); step(STEP); attackRelease();
    o.manualA = +(player.swingA || 0).toFixed(2);
    step(player.fireDelay + 0.05);
    attackPress(); attackAim(Math.PI, 0.6); attackNeutral(); step(STEP); attackRelease();
    o.assistA = +(player.swingA || 0).toFixed(2);
    // 7. a cancelled touch drops the intent and fires nothing heavy (C06)
    fresh('new'); attackPress(); step(0.1); s0 = sw(); attackCancel('pointer');
    step(1.5); o.afterCancel = sw() - s0; o.cancelHeavy = combatLog.some(e => e.r === 'heavy');
    // 8. pause, swap, death, a new delve: each drops a held attack
    const drops = {};
    for (const [name, f] of [['pause', () => pauseRun()], ['swap', () => { player.swapCd = 0; swapHero(); }],
                             ['end', () => endRun(false)], ['restart', () => resetRun('isaac', LEVELS[0].id)]]) {
      fresh('new'); attackPress(); step(0.05); f();
      drops[name] = !player.atkHeld && !player.atkQ;
    }
    o.drops = drops;
    // 9. an ordinary kill does not stop the world (C07); the classic controls still do
    const kills = scheme => { fresh(scheme); let lost = 0;
      for (let k = 0; k < 10; k++) { const e = newBody('thrall', player.x + 50, player.y, 0);
        enemies.push(e); damageEnemy(e, 1e6, player.x, player.y); lost += step(0.1); } return lost; };
    o.frozenNew = kills('new'); o.frozenClassic = kills('classic');
    //    and the big moments share a budget
    fresh('new'); let bigLost = 0;
    for (let k = 0; k < 8; k++) { freeze(0.08, 'major'); bigLost += step(0.125); }
    o.bigFrozen = +(bigLost / 60).toFixed(3);
    // 10. the same inputs at 30, 60 and 120 frames a second come out the same
    const run30 = hz => { fresh('new', 7); stick.dx = 0.6; stick.dy = 0.8; stick.mag = 1; stick.active = true;
      attackPress(); const frames = hz * 2; for (let i = 0; i < frames; i++) advanceDelve(1 / hz);
      attackRelease(); stick.mag = 0; stick.active = false;
      return [Math.round(player.x), Math.round(player.y), sw(), +player.fireTimer.toFixed(3)].join(','); };
    o.rates = { r30: run30(30), r60: run30(60), r120: run30(120) };
    // 11. a two-second stall is not paid back as a burst
    fresh('new'); const n0 = combatLog.length; const steps = advanceDelve(2.0);
    o.stall = { steps, logged: combatLog.slice(n0).some(e => e.k === 'stall') };
    // --- B02: the heavy button ----------------------------------------------
    const heavy = hero => {
      const r = {};
      fresh('new'); if (hero === 'zayd') { player.swapCd = 0; swapHero(); }
      // It gathers, slows the walk, and holds the light attack while it is up.
      stick.dx = 1; stick.dy = 0; stick.mag = 1; stick.active = true;
      let x0 = player.x; step(0.5); const free = player.x - x0;
      attackPress(); step(STEP); attackRelease(); step(player.fireDelay + 0.05);
      let s1 = sw();
      heavyPress(); attackPress();
      x0 = player.x; step(0.5); const slowed = player.x - x0;
      step(0.4); r.full = +player.cleave.toFixed(2);
      r.lightWhileCharging = sw() - s1;
      r.stride = +(slowed / free).toFixed(2);
      attackRelease(); stick.mag = 0; stick.active = false;
      const n0 = combatLog.length;
      heavyRelease(); step(STEP);
      const log = combatLog.slice(n0);
      r.struck = log.some(e => e.k === 'heavy' && e.r === 'strike');
      r.breaks = log.some(e => e.k === 'heavy' && e.r === 'strike' && e.breaks);
      r.clearedGather = (player.cleave || 0) === 0;
      return r;
    };
    o.heavyIsaac = heavy('isaac'); o.heavyZayd = heavy('zayd');
    //    undercharged: a light strike if the blade is ready...
    fresh('new'); s0 = sw(); heavyPress(); step(0.1); heavyRelease(); step(STEP);
    o.shortReady = { swings: sw() - s0, logged: combatLog.some(e => e.k === 'heavy' && e.r === 'short-light') };
    //    ...and a logged cancel, not silence, if it is not
    attackPress(); step(STEP); attackRelease(); s0 = sw();
    heavyPress(); step(0.05); heavyRelease(); step(STEP);
    o.shortBusy = { swings: sw() - s0, logged: combatLog.some(e => e.k === 'heavy' && e.r === 'short-cancelled') };
    //    cancelled or paused mid-gather: no blow
    fresh('new'); heavyPress(); step(0.8); s0 = sw(); heavyCancel('pointer'); step(0.5);
    o.heavyCancel = { swings: sw() - s0, gather: player.cleave || 0 };
    fresh('new'); heavyPress(); step(0.8); pauseRun(); o.heavyPaused = !player.hvy && (player.cleave || 0) === 0;
    state = 'play';

    // --- B02: the assist --------------------------------------------------------
    const body = (kind, dx, dy) => { const e = newBody(kind, player.x + dx, player.y + dy, 0);
      e.awake = false; e.hp = e.maxHp = 1e6; enemies.push(e); return e; };
    const aimAt = () => { step(STEP); const t = assistTarget(player.range); return t; };
    // C08: a thrall close in front, the avatar further off
    fresh('new'); player.angle = 0;
    const th = body('thrall', 60, 0), av = body('deceiver', 0, 110);
    o.assistNear = aimAt() === th;
    setControls('classic'); step(STEP); const ca = nearestFoe(player.range); setControls('new');
    o.classicAvatar = ca === av;
    // retention: a near-tie does not flip it; a clear winner does
    // Two bodies on nearly the same bearing; the second is nudged just nearer
    // than the first -- without retention the aim would flip to it.
    fresh('new'); player.angle = 0;
    const A = body('thrall', 80, 0), Bb = body('thrall', 84, 14);
    const first = aimAt();
    const other = first === A ? Bb : A;
    const mv = (e, d) => { const a = Math.atan2(e.y - player.y, e.x - player.x);
      e.x = player.x + Math.cos(a) * d; e.y = player.y + Math.sin(a) * d; };
    const dFirst = Math.hypot(first.x - player.x, first.y - player.y);
    mv(other, dFirst - 4); const kept = aimAt() === first;
    mv(other, 30); const moved = aimAt() === other;
    o.retain = { kept, moved };
    // threat: the body winding a blow at you over one standing idle a little nearer
    fresh('new'); player.angle = 0;
    const idle = body('thrall', 55, 0), winding = body('thrall', 0, 72);
    winding.tell = 0.5; winding.tellMax = 0.5;
    o.threat = aimAt() === winding;

    // --- B02: a finisher with nothing to finish spends nothing (C09) ------------
    fresh('new'); player.charges = CHARGE_MAX; const n1 = combatLog.length;
    const took = castAbility('guillotine');
    o.c09 = { took, charges: player.charges,
              why: (combatLog.slice(n1).find(e => e.k === 'ability') || {}).why };
    body('thrall', 50, 0); step(STEP);
    o.c09.withTarget = castAbility('guillotine') && player.charges === 0;

    // --- the practice room is sealed off: even in Hardcore, nothing lasts ---------
    {
      setHardcore(true);
      stash = blankStash(); stash.coins = 321; stash.xp = 777; saveStash();
      const before = JSON.stringify(loadStash());
      startPractice('isaac');
      const markedDelving = !!stash.delving;
      for (const e of enemies) if (!e.dummy) damageEnemy(e, 1e9, player.x, player.y);
      step(1); endRun(false);
      const after = loadStash();
      o.practice = { room: run.room, markedDelving, wiped: after.coins !== 321,
                     same: JSON.stringify(after) === before, over: state };
      setHardcore(false);
    }

    // 12. the classic controls are still the classic controls
    fresh('classic'); s0 = sw(); conduitPress(); step(0.25); conduitRelease(); o.classic250 = sw() - s0;
    setControls('new');
    return o;
  });

  ck('a press strikes on the next step', R.pressNext === 1, R.pressNext + ' swings');
  ck('a still press held past 200ms still strikes (C01)', R.held250 >= 1, R.held250 + ' swings');
  ck('a hold keeps striking, on the beat', R.hold2 === R.hold2want, R.hold2 + ' swings in 2s, want ' + R.hold2want);
  ck('an early press inside the buffer strikes once when the blade is ready (C02)', R.early === 2,
     R.early + ' swings from 2 presses');
  ck('one far too early has expired, and does not strike', R.tooEarly === 1, R.tooEarly + ' swings');
  ck('...and the log says it expired', R.expiredLogged === true);
  ck('two quick early presses are one strike, not a backlog', R.noBacklog === 2, R.noBacklog + ' swings');
  ck('held at the rim, it never gathers (C03, C04)', R.rim.cleave === 0, 'gather ' + R.rim.cleave);
  ck('and the walk is not slowed by attacking', Math.abs(R.rim.held - R.rim.free) < 1,
     'moved ' + R.rim.held + ' attacking, ' + R.rim.free + ' not');
  ck('a drag aims by hand, over the assist', Math.abs(Math.abs(R.manualA) - Math.PI) < 0.1,
     'swung at ' + R.manualA + ' with a body at 0');
  ck('back in the middle, the assist aims (C05)', Math.abs(R.assistA) < 0.2, 'swung at ' + R.assistA);
  ck('a cancelled touch strikes nothing more (C06)', R.afterCancel === 0, R.afterCancel + ' swings after');
  ck('and fires no heavy', R.cancelHeavy === false);
  for (const k of Object.keys(R.drops))
    ck(k + ' drops a held attack', R.drops[k] === true);
  ck('an ordinary kill does not stop the world (C07)', R.frozenNew === 0, R.frozenNew + ' of 60 frames');
  ck('...where the classic controls still do (the switch is a switch)', R.frozenClassic > 0,
     R.frozenClassic + ' of 60 frames');
  // Paid in whole 60Hz steps, so the budget can round up by one frame and no more.
  ck('the big moments share a budget: at most 0.12s (and one step) stopped a second',
     R.bigFrozen <= 0.12 + 1 / 60 + 1e-9,
     R.bigFrozen + 's stopped in 1s of eight 0.08s freezes');
  ck('the same inputs come out the same at 30, 60 and 120 fps',
     R.rates.r30 === R.rates.r60 && R.rates.r60 === R.rates.r120, JSON.stringify(R.rates));
  ck('a two-second stall is one step, not a burst, and is logged',
     R.stall.steps <= 1 && R.stall.logged, JSON.stringify(R.stall));
  for (const [who, H] of [['Isaac', R.heavyIsaac], ['Zayd', R.heavyZayd]]) {
    ck(who + ': the heavy gathers to full', H.full === 1, 'gather ' + H.full);
    ck(who + ': and gathering slows the walk, on purpose', H.stride > 0.3 && H.stride < 0.6,
       'x' + H.stride + ' of the free walk');
    ck(who + ': and the light attack waits while it is up', H.lightWhileCharging === 0,
       H.lightWhileCharging + ' light swings while charging');
    ck(who + ': let go, it lands, and a full one breaks a guard', H.struck && H.breaks && H.clearedGather);
  }
  ck('an undercharged heavy with the blade ready is a light strike, and says so',
     R.shortReady.swings === 1 && R.shortReady.logged, JSON.stringify(R.shortReady));
  ck('...with the blade busy, a logged cancel -- not silence', R.shortBusy.swings === 0 && R.shortBusy.logged,
     JSON.stringify(R.shortBusy));
  ck('a cancelled heavy throws nothing', R.heavyCancel.swings === 0 && R.heavyCancel.gather === 0,
     JSON.stringify(R.heavyCancel));
  ck('a pause mid-gather drops it', R.heavyPaused === true);
  ck('the assist takes the thrall at arm\u2019s length over the avatar across the room (C08)',
     R.assistNear === true);
  ck('...where the classic aim still took the avatar', R.classicAvatar === true);
  ck('the assist keeps its target through a near-tie', R.retain.kept === true);
  ck('...and changes when another is clearly closer', R.retain.moved === true);
  ck('the assist prefers the body winding a blow at you', R.threat === true);
  ck('a Guillotine with nothing in reach is refused before it spends (C09)',
     R.c09.took === false && R.c09.charges === 3 && R.c09.why === 'no-target', JSON.stringify(R.c09));
  ck('...and with a body in reach it goes', R.c09.withTarget === true);
  ck('practice in Hardcore does not mark a delve begun', R.practice.markedDelving === false);
  ck('and dying in it wipes nothing and banks nothing', !R.practice.wiped && R.practice.same,
     JSON.stringify(R.practice));
  ck('the classic controls are still there (C01 still happens in them)', R.classic250 === 0,
     R.classic250 + ' swings');
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
