/* THE CONDUIT: tap, drag, hold.
 *
 * The blade swung itself. That was the whole of the attack -- an auto-target,
 * a timer, and no input at all -- which is why the note kept coming back that
 * the attack button felt meaningless and the fight felt hollow. The blow was
 * not weak. Nobody threw it.
 *
 * One control with three states, told apart by how it is touched, and all of
 * it in the core so both builds drive the same machine and this suite drives
 * it with no pointer at all.
 *
 * Every claim below is a number a future change can quietly break -- the bite
 * a tap is worth, the window a chain lives in, the aim overriding the target,
 * what a gather costs and what it pays -- so every one of them is measured,
 * and the ones that could pass on an empty room carry their own control.
 */
const { chromium } = require('playwright');
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(PAGE('index.html')); await sleep(900);

  const R = await p.evaluate(() => {
    const o = {};
    localStorage.clear(); hardcore = false; stash = blankStash(); saveStash();

    /* A room with open ground either side of the hero. Both matter: rock stops
     * a crescent, so a body behind it is not a target at all, and a fixture
     * that lets that happen reads the wall as a broken swing. */
    const room = () => {
      startRun('isaac', LEVELS[0].id, 'riven');
      enemies.length = 0; arcs.length = 0;
      for (let k = 0; k < 300; k++) {
        const nx = 400 + Math.random() * (WORLD.w - 800);
        const ny = 400 + Math.random() * (WORLD.h - 800);
        if (pointInWalls(nx, ny, 40)) continue;
        if (pointInWalls(nx + 70, ny, 20) || pointInWalls(nx - 70, ny, 20)) continue;
        player.x = nx; player.y = ny; break;
      }
      player.hp = player.maxHp = 1e7;
      player.conDown = false; player.conAim = false; player.cleave = 0;
      player.combo = 0; player.comboT = 0; player.fireTimer = 0;
    };
    // A body, and one frame so the spatial hash knows it is there: nearestFoe
    // reads the grid and the grid is filled by update().
    const foe = dx => {
      const e = newBody('thrall', player.x + dx, player.y, 0);
      e.awake = true; e.hp = e.maxHp = 1e6; enemies.push(e);
      const wx = player.x, wy = player.y;
      update(1 / 60);
      player.x = wx; player.y = wy; e.x = wx + dx; e.y = wy;
      player.fireTimer = 0; arcs.length = 0;
      return e;
    };
    const dmg = () => arcs.length ? +arcs[0].dmg.toFixed(2) : null;
    const wide = () => arcs.length ? +arcs[0].half.toFixed(2) : null;
    const reach = () => arcs.length ? +arcs[0].maxLife.toFixed(3) : null;

    /* --- 1. THE BLADE DOES NOT SWING ITSELF ------------------------------
     *
     * This used to compare a tap against the idle blade and assert the tap
     * was worth more. There is no idle blade now, so the claim is the
     * stronger one: left alone with a body in reach and the beat ready, for
     * four seconds, NOTHING comes out of it.
     *
     * The control is the same room and the same body, tapped -- because
     * "no arcs appeared" would also be what a broken fixture looks like, and
     * the pair together cannot both be explained by one.
     */
    room(); foe(70);
    for (let i = 0; i < 60 * 4; i++) updateConduit(1 / 60);
    o.unaskedArcs = arcs.length;
    room(); foe(70); conduitPress(); conduitRelease();
    o.tapDmg = dmg();
    o.tapArcs = arcs.length;

    /* --- 2. THE CHAIN ---------------------------------------------------- */
    room(); foe(70);
    o.chain = [];
    for (let n = 0; n < 4; n++) {
      player.fireTimer = 0; arcs.length = 0;
      conduitPress(); conduitRelease();
      o.chain.push({ at: player.combo, sweep: wide() });
      updateConduit(0.05);
    }
    // ...and it lapses if you are slow, which is what makes it a rhythm.
    room(); foe(70);
    conduitPress(); conduitRelease();
    o.afterOne = player.combo;
    for (let i = 0; i < 60 * 4; i++) updateConduit(1 / 60);
    o.lapsed = player.combo === 0;
    // The window is the blade's own beat, not the ability beat. Reported so
    // the reason is visible when someone comes to change it.
    o.window = +(player.fireDelay * COMBO_WINDOW).toFixed(2);
    o.gcd = GCD_TIME;

    /* --- 3. THE DRAG TAKES THE AIM OFF THE AUTO-TARGET ------------------- */
    // The body is to the LEFT and the drag points RIGHT. If the swing goes
    // left, the aim is decoration.
    room(); foe(-70);
    conduitPress(); conduitAim(0, 0.5); updateConduit(0.001);
    o.aimed = arcs.length ? +arcs[0].a.toFixed(2) : null;
    /* The control: the same room, TAPPED instead of dragged, swings the other
     * way -- at the body, because aimAngle still finds one for an undirected
     * blow. Without this the check above would pass on a blade that always
     * swings right, whatever anyone points at. It used to be the idle blade;
     * the idle blade is gone, and the tap makes the same point better, since
     * it is a swing somebody asked for either way. */
    room(); foe(-70); conduitPress(); conduitRelease();
    o.autoAimed = arcs.length ? +Math.abs(arcs[0].a).toFixed(2) : null;
    // And it keeps firing while held, on the blade's own beat rather than
    // once per press.
    room(); foe(-70);
    conduitPress(); conduitAim(0, 0.5);
    let shots = 0;
    for (let i = 0; i < 60 * 3; i++) { const n = arcs.length; updateConduit(1 / 60); if (arcs.length > n) shots++; }
    o.heldShots = shots;
    o.expectShots = Math.floor(3 / player.fireDelay);

    /* --- 4. THE GATHER --------------------------------------------------- */
    room(); foe(70);
    conduitPress(); conduitAim(0, 1);
    let strideSeen = 1, movedSlow = 0;
    for (let i = 0; i < Math.ceil(60 * 1.4); i++) {
      updateConduit(1 / 60);
      if ((player.cleave || 0) > 0) strideSeen = CLEAVE_STRIDE;
    }
    o.gathered = +player.cleave.toFixed(2);
    o.stride = strideSeen;
    // Nothing fires while it gathers: the trade is throughput for one blow.
    arcs.length = 0;
    for (let i = 0; i < 60; i++) updateConduit(1 / 60);
    o.firedWhileGathering = arcs.length;
    conduitRelease();
    o.cleaveDmg = dmg(); o.cleaveSweep = wide(); o.cleaveReach = reach();
    // A flick is not a cleave.
    room(); foe(70);
    conduitPress(); conduitAim(0, 1);
    for (let i = 0; i < Math.ceil(60 * 0.35); i++) updateConduit(1 / 60);
    arcs.length = 0; conduitRelease();
    o.flick = dmg();
    // Nor is a drag that never reaches the edge.
    room(); foe(70);
    conduitPress(); conduitAim(0, 0.4);
    for (let i = 0; i < Math.ceil(60 * 1.4); i++) updateConduit(1 / 60);
    o.gatheredInside = +(player.cleave || 0).toFixed(2);

    /* --- 5. AND A THUMB THAT DOES NOTHING KILLS NOTHING ------------------
     *
     * The inverse of what this used to say. Four seconds of the full update
     * loop -- not just updateConduit, so anything else that might quietly
     * swing gets its chance too -- against a body in reach, with no input.
     * It must come out untouched.
     */
    room(); const t5 = foe(70);
    const hp0 = t5.hp;
    for (let i = 0; i < 60 * 4; i++) update(1 / 60);
    o.idleKilled = hp0 - t5.hp;
    // ...and a tap in an empty room still swings, rather than silently
    // doing nothing, which is the whole complaint this answers.
    room();
    conduitPress(); conduitRelease();
    o.tapInTheDark = arcs.length > 0;
    return o;
  });

  ck('the blade does not swing itself', R.unaskedArcs === 0,
     R.unaskedArcs + ' crescent(s) in four seconds with a body in reach and ' +
     'nobody touching it');
  ck('and the control: the same room, tapped, does swing',
     R.tapArcs > 0 && R.tapDmg > 0,
     R.tapArcs ? 'tap put out ' + R.tapDmg + ' damage, so the silence above is ' +
                 'the blade and not the fixture'
               : 'NOTHING FIRED EITHER WAY — the check above proves nothing');
  ck('and a thumb that does nothing kills nothing', R.idleKilled === 0,
     Math.round(R.idleKilled) + ' off a body over four seconds of the whole ' +
     'update loop');
  ck('and a tap in an empty room still swings', R.tapInTheDark === true);

  ck('taps chain, and the chain resets when it finishes',
     R.chain.length === 4 && R.chain[0].at === 1 && R.chain[1].at === 2 &&
     R.chain[2].at === 0 && R.chain[3].at === 1,
     R.chain.map(c => c.at).join(' → '));
  ck('and the strike that finishes it comes round wider',
     R.chain[2].sweep > R.chain[0].sweep * 1.15,
     R.chain[0].sweep + ' → ' + R.chain[2].sweep + ' on the third');
  ck('and the chain lapses if you are slow, which is what makes it a rhythm',
     R.afterOne === 1 && R.lapsed === true,
     'window ' + R.window + 's, off the blade’s own beat rather than the ' +
     R.gcd + 's ability beat');

  ck('a drag aims the blade away from what it would have picked',
     R.aimed !== null && Math.abs(R.aimed) < 0.02,
     R.aimed === null ? 'NOTHING FIRED' : 'aimed ' + R.aimed + ' rad');
  ck('and the control: tapped instead, the same room swings the other way',
     R.autoAimed !== null && Math.abs(R.autoAimed - Math.PI) < 0.02,
     R.autoAimed === null ? 'THE TAP NEVER FIRED — the aim above proves nothing'
       : 'the tap went ' + R.autoAimed + ' rad, at the body');
  ck('and holding it fires down that line on the blade’s beat',
     R.heldShots >= R.expectShots - 1 && R.heldShots <= R.expectShots + 1,
     R.heldShots + ' crescents in three seconds against a beat of ' + R.expectShots);

  ck('held at the edge, the blade gathers', R.gathered > 0.9, R.gathered + ' of a full one');
  ck('and gathering costs stride', R.stride < 0.6, '×' + R.stride + ' while it does');
  ck('and stops the firing, so it is throughput traded for one blow',
     R.firedWhileGathering === 0, R.firedWhileGathering + ' crescents mid-gather');
  ck('and pays for it', R.cleaveDmg > R.tapDmg * 3 && R.cleaveSweep > R.tapDmg,
     R.cleaveDmg + ' damage (×' + (R.cleaveDmg / R.tapDmg).toFixed(1) +
     ' a tap), ' + R.cleaveSweep + ' wide, ' + R.cleaveReach + 's of reach');
  ck('a flick is not a cleave', R.flick === null,
     R.flick === null ? 'nothing came out of a third of a second'
       : 'it threw a ' + R.flick + ' damage blow for nothing');
  ck('and neither is a drag that never reaches the edge',
     R.gatheredInside === 0,
     R.gatheredInside ? 'gathered ' + R.gatheredInside + ' from the middle of the ring' : '');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); process.exit(fail.length ? 1 : 0);
})();
