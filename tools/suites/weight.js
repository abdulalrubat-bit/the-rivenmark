/* WEIGHT: what a blow does besides subtract a number.
 *
 * Written after a play test said the combat did not feel impactful, and after
 * measuring why: every freeze() and shake() in the build sat inside an ability
 * handler, and damageEnemy -- the one path the ordinary swing travels, and 55
 * of the hero's 60 dps in a measured delve -- did a hit-flash, a floater and
 * two particles. The blow you land all the time was the one with nothing
 * behind it.
 *
 * Each check here is paired with its own control, because every one of these
 * is easy to pass vacuously: a recoil "works" if the body was drifting anyway,
 * a hit-stop "fires" if something else in the frame set it, and a camera
 * "answers" if it was already shaking from the last thing that happened.
 */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  await pages.serve();
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(pages.core()); await sleep(900);

  const R = await p.evaluate(() => {
    const o = {};
    stash = blankStash(); saveStash();

    // Open floor with room on every side. Not "room around the player" -- the
    // first version asked that and put the body seventy units east with twenty
    // units of floor behind it, so the very first recoil pushed it into rock
    // and every recoil after that measured zero. The clearance has to cover
    // where the BODY stands and where a recoil sends it.
    //
    // A delve is cut fresh every time and some cuts simply have no hall this
    // open in them, so this asks for a new one rather than reporting failure
    // on a roll of the dice -- the first version did, and failed the suite one
    // run in a handful with "NO CLEAR FLOOR".
    let spot = null;
    for (let cut = 1; cut <= 8 && !spot; cut++) {
      o.cuts = cut;
      startRun('isaac', LEVELS[10].id, 'riven');
      run.banner = 0;
      player.hp = player.maxHp = 1e7;
      for (const c of openCells) {
        let clear = true;
        for (let a = 0; a < 16 && clear; a++) {
          const th = a * (Math.PI / 8);
            // Sampled where the bodies ACTUALLY stand and where a recoil sends
          // them -- seventy units out, radius up to twenty-six, pushed a
          // handful further. Two rings at sixty and a hundred and fifteen left
          // a gap at ninety, and one run in a few dozen put the breaker's
          // landing spot in stone: the recoil measured zero and the check
          // correctly reported that its own control had proved nothing.
          for (const d of [55, 80, 105, 130]) {
            if (pointInWalls(c.x + Math.cos(th) * d, c.y + Math.sin(th) * d, 28))
              { clear = false; break; }
          }
        }
        if (clear) { spot = c; break; }
      }
    }
    o.room = !!spot;
    if (!spot) return o;                       // no floor: report it, prove nothing
    player.x = spot.x; player.y = spot.y;

    // A body of a given kind, standing still, at a fixed offset east.
    const body = (kind, hp) => {
      enemies.length = 0; particles.length = 0; arcs.length = 0;
      const e = newBody(kind, spot.x + 70, spot.y, 0);
      e.awake = true; e.stun = 0; e.vx = e.vy = 0;
      if (hp) { e.hp = e.maxHp = hp; }
      enemies.push(e);
      // The spatial hash is what the crescent queries, and pushing onto
      // `enemies` does not touch it. Without this the arc sweeps through an
      // empty grid and the fixture reports that nothing was hit.
      updateEnemies(0.001);
      e.x = spot.x + 70; e.y = spot.y; e.vx = e.vy = 0;
      return e;
    };
    const still = () => { cam.shake = 0; hitStop = 0; };

    // --- the recoil ---------------------------------------------------------
    // The blow comes from the hero's side, so a recoil rides east. Measured on
    // the SECOND hit: the first is what tells damageEnemy which way the blow
    // travelled, and a body that has never been hit has no direction to give.
    {
      const e = body('thrall', 1e6);
      const x0 = e.x, y0 = e.y;
      // A THIRD of the body each time, not a half: two halves is a kill, and
      // knock() refuses a body that is already dead -- which is how the first
      // version of this measured a recoil of zero and blamed the recoil.
      damageEnemy(e, e.maxHp / 3, player.x, player.y);
      o.knockFirst = +(e.x - x0).toFixed(2);
      const x1 = e.x;
      damageEnemy(e, e.maxHp / 3, player.x, player.y);
      o.knock = +(e.x - x1).toFixed(2);
      o.knockSideways = +Math.abs(e.y - y0).toFixed(2);
    }
    // The control: a body nothing has ever hit, damaged from nowhere, does not
    // move. Without this the check above passes on any body that drifts.
    {
      const e = body('thrall', 1e6);
      const x0 = e.x, y0 = e.y;
      damageEnemy(e, e.maxHp / 3);
      o.driftNoSource = +Math.hypot(e.x - x0, e.y - y0).toFixed(2);
    }
    // Mass divides it. Same SHARE of each body, so the two blows are equally
    // heavy and only the mass differs.
    {
      const t = body('thrall', 1e6);
      damageEnemy(t, t.maxHp / 3, player.x, player.y);
      const tx = t.x; damageEnemy(t, t.maxHp / 3, player.x, player.y);
      o.lightBody = +(t.x - tx).toFixed(2); o.lightMass = t.mass;
      const g = body('gorger', 1e6);
      damageEnemy(g, g.maxHp / 3, player.x, player.y);
      const gx = g.x; damageEnemy(g, g.maxHp / 3, player.x, player.y);
      o.heavyBody = +(g.x - gx).toFixed(2); o.heavyMass = g.mass;
    }
    // A braced anchor eats the blow and does not move: it cannot, and backing
    // off rather than pushing it is the whole answer to one.
    {
      const e = body('breaker', 1e6);
      damageEnemy(e, e.maxHp / 3, player.x, player.y);
      const x1 = e.x;
      damageEnemy(e, e.maxHp / 3, player.x, player.y);
      o.bracedControl = +(e.x - x1).toFixed(2);   // unbraced, it moves
      e.braced = true;
      const x2 = e.x;
      damageEnemy(e, e.maxHp / 3, player.x, player.y);
      o.braced = +(e.x - x2).toFixed(2);
    }

    // The killing blow does not push the corpse. knock() refuses a body that
    // is already dead, and the topple pivots on its feet -- a corpse sliding
    // away from the blow that ended it would fight the death pose. Stated
    // here because it is a rule, not an oversight, and the recoil checks
    // above had to work around it.
    {
      const e = body('thrall', 1e6);
      damageEnemy(e, e.maxHp / 3, player.x, player.y);   // give it a direction
      const x1 = e.x;
      damageEnemy(e, 1e9, player.x, player.y);
      o.corpseMoved = +Math.abs(e.x - x1).toFixed(2);
      o.corpseDead = e.hp <= 0;
    }

    // --- the hit-stop -------------------------------------------------------
    // Spent on the kill and NOT on the hit. At the measured rate -- two and a
    // half landings a second against about four fifths of a kill -- a freeze
    // per landing is a stutter, and a freeze per kill is punctuation.
    //
    // THAT WAS THE CLASSIC RULE, and it is kept under the classic controls so
    // the two can be compared. The combat analysis measured what it cost --
    // ten kills in a second stopped the world, movement and all, for half the
    // frames -- so under the new controls an ordinary kill does not freeze at
    // all, and has to carry its weight in the shake, the spray, the recoil and
    // the sound. Both are measured here, each against the other.
    const stops = scheme => {
      setControls(scheme);
      const r = {};
      let e = body('thrall', 1e6);
      still();
      damageEnemy(e, e.maxHp * 0.9, player.x, player.y);   // nearly all of it
      r.onHit = +hitStop.toFixed(4);
      still();
      damageEnemy(e, e.maxHp * 10, player.x, player.y);    // and now it dies
      r.onKill = +hitStop.toFixed(4);
      r.underCap = hitStop <= HITSTOP_MAX + 1e-9;
      e = body('thrall'); still();
      damageEnemy(e, 1e6, player.x, player.y);
      r.small = +hitStop.toFixed(4);
      e = body('gorger'); still();
      damageEnemy(e, 1e6, player.x, player.y);
      r.big = +hitStop.toFixed(4);
      still();
      return r;
    };
    o.classic = stops('classic');
    o.fresh = stops('new');
    o.frozeOnHit = Math.max(o.classic.onHit, o.fresh.onHit);

    // --- the camera ---------------------------------------------------------
    // A heavy landing moves it; a scratch leaves it alone, or a fight against
    // thralls would never let it settle.
    {
      const e = body('gorger', 1e6); still();
      damageEnemy(e, e.maxHp * 0.02, player.x, player.y);   // a scratch
      o.shakeScratch = +cam.shake.toFixed(3);
      still();
      damageEnemy(e, e.maxHp * 0.6, player.x, player.y);    // heavy, not fatal
      o.shakeHeavy = +cam.shake.toFixed(3);
      const e2 = body('thrall'); still();
      damageEnemy(e2, 1e6, player.x, player.y);
      o.shakeKill = +cam.shake.toFixed(3);
    }

    // --- the spray ----------------------------------------------------------
    // It grows with the share the blow took.
    {
      const e = body('gorger', 1e6);
      particles.length = 0;
      damageEnemy(e, e.maxHp * 0.02, player.x, player.y);
      o.pScratch = particles.length;
      particles.length = 0;
      damageEnemy(e, e.maxHp * 0.9, player.x, player.y);
      o.pHeavy = particles.length;
      particles.length = 0;
      damageEnemy(e, 1e6, player.x, player.y);
      o.pKill = particles.length;
    }

    // --- and it is the ORDINARY swing that gets all of this ------------------
    // The whole point. A crescent -- no ability, no button -- carried through
    // updateArcs must freeze, shake and recoil like anything else.
    for (const scheme of ['classic', 'new']) {
      setControls(scheme);
      const e = body('thrall');
      e.hp = e.maxHp = 12;                     // one crescent kills it
      still();
      const x0 = e.x;
      const before = particles.length;
      releaseCrescent(0, 0);                   // due east, at the standing body
      for (let i = 0; i < 40 && e.hp > 0; i++) updateArcs(1 / 60);
      o['arc_' + scheme] = { killed: e.hp <= 0, froze: +hitStop.toFixed(4), shook: +cam.shake.toFixed(3),
                             particles: particles.length - before, moved: +(e.x - x0).toFixed(2) };
      still();
    }
    setControls('new');
    o.arcKilled = o.arc_new.killed && o.arc_classic.killed;
    return o;
  });

  ck('there is open floor to test on', R.room === true,
     R.room ? 'found it in cut ' + R.cuts + ' of 8'
            : 'NO CLEAR FLOOR IN EIGHT CUTS — every check below proves nothing');

  ck('a landing recoils the body along the blow', R.knock > 1 && R.knockFirst > 1,
     R.knockFirst + ' units east on the first, ' + R.knock + ' on the second');
  ck('and a body nothing has hit does not drift', R.driftNoSource < 0.01,
     R.driftNoSource + ' units with no source given');
  ck('the recoil goes where the blow went, not sideways',
     R.knockSideways < R.knock * 0.4, 'sideways ' + R.knockSideways);
  ck('mass divides it', R.heavyBody < R.lightBody * 0.5 && R.lightBody > 1,
     'mass ' + R.lightMass + ' moved ' + R.lightBody + ', mass ' +
     R.heavyMass + ' moved ' + R.heavyBody);
  ck('a braced guard takes the blow without being pushed',
     R.braced < 0.01 && R.bracedControl > 1,
     R.bracedControl > 1 ? R.braced + ' braced against ' + R.bracedControl + ' unbraced'
       : 'the control did not move either — fixture proved nothing');

  ck('and the killing blow leaves the corpse where it fell',
     R.corpseDead === true && R.corpseMoved < 0.01,
     R.corpseDead ? R.corpseMoved + ' units' : 'it did not die — proves nothing');

  ck('the ordinary hit does NOT freeze the world', R.frozeOnHit === 0,
     'hitStop ' + R.frozeOnHit + ' after a blow taking 90% of a body');
  ck('classic controls: the kill does', R.classic.onKill > 0, 'hitStop ' + R.classic.onKill);
  ck('and never past the cap', R.classic.underCap === true, 'cap is HITSTOP_MAX');
  ck('classic controls: a big body breaking is worth a longer beat than a thrall',
     R.classic.big > R.classic.small,
     R.classic.small + 's for a thrall, ' + R.classic.big + 's for a gorger');
  ck('new controls: an ordinary kill does NOT stop the world, thrall or gorger',
     R.fresh.onKill === 0 && R.fresh.small === 0 && R.fresh.big === 0,
     'hitStop ' + R.fresh.onKill + ' / ' + R.fresh.small + ' / ' + R.fresh.big);

  ck('a scratch leaves the camera alone', R.shakeScratch === 0,
     'shake ' + R.shakeScratch + ' off 2% of a body');
  ck('a heavy landing moves it', R.shakeHeavy > 0, 'shake ' + R.shakeHeavy);
  ck('and a kill moves it further', R.shakeKill > R.shakeHeavy,
     R.shakeHeavy + ' heavy against ' + R.shakeKill + ' on the kill');

  ck('the spray grows with the share the blow took',
     R.pHeavy > R.pScratch && R.pKill > R.pHeavy,
     R.pScratch + ' scratch → ' + R.pHeavy + ' heavy → ' + R.pKill + ' kill');

  ck('a plain crescent kills with all of it', R.arcKilled === true);
  const A = R.arc_new, C = R.arc_classic;
  ck('a plain crescent’s kill still lands with weight: shake, spray and recoil',
     A.shook > 0 && A.particles > 6 && C.shook > 0 && C.particles > 6,
     'new: shook ' + A.shook + ', ' + A.particles + ' particles; classic: shook ' + C.shook +
     ', ' + C.particles);
  ck('...frozen under the classic controls, not under the new',
     C.froze > 0 && A.froze === 0, 'classic ' + C.froze + 's, new ' + A.froze + 's');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
