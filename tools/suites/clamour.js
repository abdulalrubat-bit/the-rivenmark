/* CLAMOUR: how much of the delve can hear you.
 *
 * The design this belongs to was written against a delve that does not
 * exist -- it said the fight is unreadable because forty-six bodies are up at
 * once, and winnable.js measured three to thirteen at the median. So Clamour
 * does not make the delve sleep. It makes the sleeping visible, puts it under
 * the hand, and gives it consequences.
 *
 * WHAT THIS SUITE IS REALLY FOR is the anti-stealth guarantee. Every check
 * about reach and decay is arithmetic and would pass on a design that turns
 * the game into a creeping simulator; the checks that matter are the ones
 * that say waiting is not a move and walking is not a noise. Those are last,
 * and they are the reason the rest is here.
 */
const { chromium } = require('playwright');
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
async function enterHub(pg){
  const onSplash = await pg.$eval('#splash', e=>e.classList.contains('on')).catch(()=>false);
  if (!onSplash) return;
  await pg.click('#toGatehouse');
  await new Promise(r=>setTimeout(r,220));
}
async function beginRun(p){
  await enterHub(p); await p.click('#toDelve');
  await new Promise(r => setTimeout(r, 150));
  await p.click('#beginRun');
  await new Promise(r => setTimeout(r, 500));
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// 'x ' on a failure, because run-suites.js surfaces exactly that prefix when
// it summarises a sweep -- without it a red suite reports its count and none
// of its reasons.
const pass=[],fail=[];
const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));

(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html'));
  await beginRun(p);

  /* An empty room with one sleeping body a fixed distance off, so every
   * reading below is about the meter and not about what the generator
   * happened to lay down. */
  const R = await p.evaluate(async () => {
    const o = {};
    const room = () => {
      resetRun('isaac');
      state = 'play';
      enemies.length = 0; arcs.length = 0;
      run.clamour = 0;
      player.hp = player.maxHp = 1e7;
      player.fireTimer = 0; player.combo = 0; player.comboT = 0; player.cleave = 0;
    };
    /* A sleeper at a chosen NOTICE distance -- which is not the same as a
     * chosen straight-line distance, and the difference is why the first
     * version of this fixture measured nothing.
     *
     * noticeDist walks the flow field: a body hears you along the floor you
     * could actually walk, not through the rock between you. Measured, a body
     * 198 units away in a straight line was 280 away by path, so a fixture
     * that placed one "just inside aggro" at 210 put it comfortably outside
     * and then reported that nothing ever wakes. The mechanic was fine; the
     * ruler was straight and the world is not.
     *
     * So this searches the real floor for a cell whose NOTICE distance is
     * where the test wants it, and returns null rather than guessing if the
     * generated map has nowhere suitable -- a check that silently tested a
     * body in a wall is worse than a check that says it could not run.
     */
    const place = wantNotice => {
      rebuildFlow();
      let best = null, bd = 1e9;
      for (const c of openCells) {
        if (pointInWalls(c.x, c.y, 16)) continue;
        const nd = noticeDist({ x: c.x, y: c.y }, Math.hypot(c.x - player.x, c.y - player.y));
        if (!isFinite(nd)) continue;
        const off = Math.abs(nd - wantNotice);
        if (off < bd) { bd = off; best = { c, nd }; }
      }
      return (!best || bd > 45) ? null : best;
    };
    /* Maps are generated, and not every one has floor at every distance from
     * where the hero happens to stand. So it rolls a few before giving up --
     * and when it does give up it returns null, which every check below turns
     * into a NAMED failure saying the map had nowhere to stand rather than a
     * silent pass or a claim about the mechanic. A fixture that cannot run is
     * a thing to say out loud, not a thing to round down. */
    const sleeper = wantNotice => {
      let best = place(wantNotice);
      for (let tries = 0; !best && tries < 6; tries++) {
        const keep = run.clamour;
        resetRun('isaac'); state = 'play'; enemies.length = 0;
        run.clamour = keep;
        player.hp = player.maxHp = 1e7;
        best = place(wantNotice);
      }
      if (!best) return null;
      const e = newBody('thrall', best.c.x, best.c.y, 0);
      e.awake = false; e.alert = 0; e.hp = e.maxHp = 1e6;
      e.home = { x: e.x, y: e.y };
      e.aggro = AGGRO_NEAR;
      e.noticeWas = Math.round(best.nd);
      enemies.push(e);
      enemyGrid.clear(); enemyGrid.insert(e, e.x, e.y);
      return e;
    };

    o.AGGRO_NEAR = AGGRO_NEAR;
    o.CLAMOUR_REACH = CLAMOUR_REACH;
    o.CLAMOUR_DECAY = CLAMOUR_DECAY;
    o.CLAMOUR_SWING = CLAMOUR_SWING;
    o.SETTLE_WAIT = SETTLE_WAIT;

    /* --- 1. A QUIET HERO IS NOTICED AT THE OLD RANGE ---------------------
     * The control for everything else: with the meter at zero the game does
     * exactly what it did before Clamour existed. Just outside aggro, and
     * just inside. */
    room(); const a1 = sleeper(AGGRO_NEAR + 60);
    for (let i = 0; i < 60; i++) updateEnemies(1/60);
    o.quietFarStaysDown = a1 ? !a1.awake : null;
    o.farAt = a1 ? a1.noticeWas : null;
    room(); const a2 = sleeper(AGGRO_NEAR - 60);
    for (let i = 0; i < 60; i++) updateEnemies(1/60);
    o.quietNearWakes = a2 ? a2.awake : null;
    o.nearAt = a2 ? a2.noticeWas : null;

    /* --- 2. ...AND A LOUD ONE IS NOTICED FURTHER OFF --------------------
     * The same body, at the same distance that left it asleep, with the meter
     * full. This is the whole mechanic in one pair of readings. */
    room(); const a3 = sleeper(AGGRO_NEAR + 60);
    run.clamour = 1;
    for (let i = 0; i < 60; i++) updateEnemies(1/60);
    o.loudFarWakes = a3 ? a3.awake : null;
    o.loudAt = a3 ? a3.noticeWas : null;
    o.reachAt1 = Math.round(AGGRO_NEAR * (1 + CLAMOUR_REACH));

    /* --- 3. WHAT IS LOUD, AND WHAT IS NOT -------------------------------
     * Swinging and spending are loud. MOVING IS NOT, at any speed, and that
     * is the check this whole file exists to hold: the moment walking costs
     * Clamour, the game is asking the player to creep. */
    room(); sleeper(AGGRO_NEAR * 3);
    const c0 = run.clamour;
    conduitPress(); conduitRelease();
    o.swingIsLoud = run.clamour - c0;

    room(); sleeper(AGGRO_NEAR * 3);
    player.cds = {}; player.charges = CHARGE_MAX; player.gcd = 0;
    const c1 = run.clamour;
    castAbility(ABILITIES[player.hero][0].id);
    o.castIsLoud = run.clamour - c1;

    room(); sleeper(AGGRO_NEAR * 3);
    // Run flat out for four seconds, touching nothing else.
    const c2 = run.clamour;
    for (let i = 0; i < 60 * 4; i++) {
      stick.active = true; stick.dx = 1; stick.dy = 0; stick.mag = 1;
      update(1/60);
    }
    stick.active = false;
    o.walkIsLoud = run.clamour - c2;
    o.walkedFor = 4;

    room(); sleeper(AGGRO_NEAR * 3);
    // And taking a blow is not loud either: it is not a thing you chose.
    const c3 = run.clamour;
    player.invuln = 0; player.ward = 0;
    hurtPlayerBy(12, player.x, player.y);
    o.beingHitIsLoud = run.clamour - c3;

    /* --- 4. IT FALLS ON A CLOCK, NOT ON STILLNESS -----------------------
     * Measured twice over the same span: once standing, once running. If
     * these differ the meter is rewarding one of them, and the one it would
     * reward is standing. */
    room(); sleeper(AGGRO_NEAR * 3);
    run.clamour = 1;
    for (let i = 0; i < 60 * 5; i++) update(1/60);
    o.decayStanding = +(1 - run.clamour).toFixed(4);

    room(); sleeper(AGGRO_NEAR * 3);
    run.clamour = 1;
    for (let i = 0; i < 60 * 5; i++) {
      stick.active = true; stick.dx = 1; stick.dy = 0; stick.mag = 1;
      update(1/60);
    }
    stick.active = false;
    o.decayRunning = +(1 - run.clamour).toFixed(4);

    /* --- 7. A LONG FIGHT IS A LOUD FIGHT --------------------------------
     *
     * The half of the guarantee that section 3 leaves open. Everything there
     * is a noise the player MADE, and a meter that only hears the hero's own
     * blade has an obvious exploit: stop swinging, circle, let it drain, come
     * back. That is creeping, arrived at from the other direction, and it
     * would make the slowest fight the quietest one.
     *
     * So the fight makes noise on its own clock, and the readings below are
     * about that clock rather than about any blow. The hero is unhurtable and
     * the bodies unkillable throughout: this measures the meter, not who wins.
     *
     * THE BODIES STAND STILL (speed 0) everywhere except the last pair. A
     * body that chases changes the very distance the tally is reading, so a
     * fixture that let them run would be measuring the chase and reporting it
     * as the rule. Where the check is about the hero moving, they keep their
     * real speed instead, because there the chase is the point.
     */
    o.CLAMOUR_CRY = CLAMOUR_CRY;
    o.CLAMOUR_VOICES = CLAMOUR_VOICES;
    o.CLAMOUR_NEAR = CLAMOUR_NEAR;

    const brawl = (n, at, still) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 * 1.618;   // spread, not a neat ring
        const r = at + (i % 5) * 26;               // ...and not all at one radius
        const e = newBody('thrall', player.x + Math.cos(a) * r,
                                    player.y + Math.sin(a) * r, 0);
        e.awake = true; e.alert = 0; e.hp = e.maxHp = 1e6;
        e.home = { x: e.x, y: e.y };
        if (still !== false) e.speed = 0;
        enemies.push(e);
      }
      enemyGrid.clear();
      for (const e of enemies) enemyGrid.insert(e, e.x, e.y);
    };
    /* Hold for `secs` doing nothing but exist, in the engine's own order --
     * updatePlayer reads the tally updateEnemies wrote on the frame before,
     * exactly as update() does. Stepping the two by hand rather than calling
     * update() keeps the horde's drip out of the room: one body arriving
     * unasked would change the very count being measured.
     *
     * Returns the smallest cry seen, so a check that quietly lost its crowd
     * says so instead of reporting a clean number about nothing.
     */
    const hold = (secs, moving) => {
      let least = 1e9;
      for (let i = 0; i < 60 * secs; i++) {
        if (moving) { stick.active = true; stick.dx = 1; stick.dy = 0; stick.mag = 1; }
        updatePlayer(1/60); updateEnemies(1/60);
        least = Math.min(least, run.inCry || 0);
      }
      stick.active = false;
      return least;
    };

    // The control first: an empty room, so every number below has something
    // to be different from.
    room(); run.clamour = 0.6; hold(5);
    o.emptyRoom = +(0.6 - run.clamour).toFixed(4);

    // A full cry. At CLAMOUR_VOICES bodies the rise is one decay's worth, so
    // the meter should sit where it was put: you cannot wait out a fight you
    // are standing in the middle of.
    room(); brawl(CLAMOUR_VOICES, 110); run.clamour = 0.6;
    o.fullCryLeast = hold(5);
    o.fullCry = +(0.6 - run.clamour).toFixed(4);

    // One body is not a brawl. It should still drain, only slower.
    room(); brawl(1, 110); run.clamour = 0.6;
    o.oneBodyLeast = hold(5);
    o.oneBody = +(0.6 - run.clamour).toFixed(4);

    // And it saturates. Forty bodies must be no louder than four, or the deep
    // rungs are deafening through nothing the player did.
    room(); brawl(40, 110); run.clamour = 0.6;
    o.hordeLeast = hold(5);
    o.horde = +(0.6 - run.clamour).toFixed(4);

    // A fight across the room is not your fight.
    room(); brawl(CLAMOUR_VOICES, CLAMOUR_NEAR + 260); run.clamour = 0.6;
    o.farBrawlLeast = hold(5);
    o.farBrawl = +(0.6 - run.clamour).toFixed(4);

    // The HUD's tell is for discrete noises. A fight feeding the meter every
    // frame must not pin it, or the flash stops meaning anything.
    room(); brawl(CLAMOUR_VOICES, 110); run.clamour = 0.3;
    hold(2);
    o.popDuringFight = +(run.clamourPop || 0).toFixed(3);
    conduitPress(); conduitRelease();
    o.popOnSwing = +(run.clamourPop || 0).toFixed(3);

    /* AND THE GUARANTEE, UNDER THE NEW TERM. This is the check the section
     * exists for. Adding a per-second noise is exactly the kind of change
     * that quietly makes standing still the better move, so it is measured
     * the same way section 4 measures the decay: the same fight, once stood
     * through and once run through. These bodies keep their real speed, so
     * both heroes are in the same brawl.
     *
     * Short and close on purpose: 1.5 seconds at the hero's own speed cannot
     * carry anyone out of CLAMOUR_NEAR from 40 units off, so a difference
     * here is the rule and not the ruler. The least-cry readings are printed
     * either way, so a fixture that DID lose its crowd cannot pass by it.
     */
    room(); brawl(CLAMOUR_VOICES, 40, false); run.clamour = 0.5;
    o.fightStandingLeast = hold(1.5);
    o.fightStanding = +run.clamour.toFixed(4);

    room(); brawl(CLAMOUR_VOICES, 40, false); run.clamour = 0.5;
    o.fightRunningLeast = hold(1.5, true);
    o.fightRunning = +run.clamour.toFixed(4);

    /* --- 5. THE SETTLE ---------------------------------------------------
     * A body that has lost you walks home and lies down. Without it Clamour
     * is a ratchet and the meter is only a slower road to the same fully
     * woken delve. */
    room(); const s1 = sleeper(AGGRO_NEAR - 90);
    for (let i = 0; i < 60; i++) updateEnemies(1/60);
    o.settleWoke = s1 ? s1.awake : null;
    /* ITS BED, not where it happened to be standing when we looked. Captured
     * from e.home rather than from e.x/e.y: by this line the body has already
     * woken and chased for a second, so its position is where it STOPPED --
     * which is the exact thing the check below says it must not lie down at.
     * The first version measured against that and reported 88 units of drift
     * from a body that had walked all the way back. */
    const homeAt = { x: s1.home.x, y: s1.home.y };
    // Walk the hero a long way off, then let it look for a while.
    player.x += 1600;
    let settled = 0;
    for (let i = 0; i < 60 * (SETTLE_WAIT + 14); i++) {
      updateEnemies(1/60);
      if (!s1.awake) { settled = i / 60; break; }
    }
    o.settledAfter = settled ? +settled.toFixed(1) : null;
    o.settledHome = settled
      ? Math.round(Math.hypot(s1.x - homeAt.x, s1.y - homeAt.y)) : null;

    /* And the control: a body that can still hear you does NOT settle,
     * however long you leave it. Without this "it went to sleep" would pass
     * on a body that goes to sleep no matter what. */
    room(); const s2 = sleeper(AGGRO_NEAR - 90);
    for (let i = 0; i < 60; i++) updateEnemies(1/60);
    let stayed = true;
    for (let i = 0; i < 60 * (SETTLE_WAIT + 14); i++) {
      player.x = s2.x + 40; player.y = s2.y;    // stood right on top of it
      updateEnemies(1/60);
      if (!s2.awake) { stayed = false; break; }
    }
    o.stayedUp = stayed;

    /* A LOUD hero is harder to shake: the settle uses the same notice test,
     * so a body that would have lost a quiet hero at this range still has
     * one at full Clamour. */
    room(); const s3 = sleeper(AGGRO_NEAR - 90);
    for (let i = 0; i < 60; i++) updateEnemies(1/60);
    player.x += Math.round(AGGRO_NEAR * (1 + CLAMOUR_REACH * 0.5));
    run.clamour = 1;
    let loudSettled = false;
    for (let i = 0; i < 60 * (SETTLE_WAIT + 8); i++) {
      run.clamour = 1;                          // held up, as a fight would
      updateEnemies(1/60);
      if (!s3.awake) { loudSettled = true; break; }
    }
    o.loudKeepsItUp = !loudSettled;

    /* --- 6. WHAT MUST NEVER SETTLE --------------------------------------
     * A boss you can walk away from and come back to fresh is not a boss. */
    room();
    const boss = newBody('gorger', player.x + 60, player.y, 0);
    boss.awake = true; boss.hp = boss.maxHp = 1e6;
    boss.home = { x: boss.x, y: boss.y };
    boss.anchored = true;
    enemies.push(boss);
    enemyGrid.clear(); enemyGrid.insert(boss, boss.x, boss.y);
    player.x += 2000;
    for (let i = 0; i < 60 * (SETTLE_WAIT + 14); i++) updateEnemies(1/60);
    o.anchoredStaysUp = boss.awake;

    /* A body with no home -- a reinforcement the run dripped in -- has
     * nowhere to walk back to, and stays up rather than wandering off to a
     * corner the delve never placed it in. */
    room();
    const drifter = newBody('thrall', player.x + 60, player.y, 0);
    drifter.awake = true; drifter.hp = drifter.maxHp = 1e6;
    delete drifter.home;
    enemies.push(drifter);
    enemyGrid.clear(); enemyGrid.insert(drifter, drifter.x, drifter.y);
    player.x += 2000;
    for (let i = 0; i < 60 * (SETTLE_WAIT + 14); i++) updateEnemies(1/60);
    o.homelessStaysUp = drifter.awake;

    return o;
  });

  // --- 1 and 2: the reach ---------------------------------------------------
  const nowhere = 'THE MAP HAD NOWHERE TO STAND at that distance — this ' +
                  'fixture could not run, which is not a finding about Clamour';
  ck('a quiet hero is not noticed past the old range',
     R.quietFarStaysDown === true,
     R.quietFarStaysDown === null ? nowhere
       : 'asleep at ' + R.farAt + ' units of notice with the meter at zero');
  ck('and the control: inside it, the same body wakes',
     R.quietNearWakes === true,
     R.quietNearWakes === null ? nowhere
       : R.quietNearWakes ? 'woke at ' + R.nearAt
       : 'NOTHING EVER WAKES — the check above proves nothing');
  ck('a loud one is noticed from further off',
     R.loudFarWakes === true,
     R.loudFarWakes === null ? nowhere
       : 'a body at ' + R.loudAt + ' units of notice woke with the meter full, ' +
         'which reaches ' + R.reachAt1);

  // --- 3: what is loud ------------------------------------------------------
  ck('a swing is loud', R.swingIsLoud > 0,
     '+' + R.swingIsLoud.toFixed(3) + ' on the meter');
  ck('and so is spending from the bar', R.castIsLoud > 0,
     '+' + R.castIsLoud.toFixed(3));
  ck('BUT WALKING IS NOT, which is what keeps this from being a stealth game',
     R.walkIsLoud === 0,
     R.walkIsLoud === 0 ? R.walkedFor + 's at a flat run cost nothing'
       : 'RUNNING COST ' + R.walkIsLoud.toFixed(3) + ' — the game is now asking ' +
         'the player to creep');
  ck('and neither is being hit, which nobody chose',
     R.beingHitIsLoud === 0, '+' + R.beingHitIsLoud.toFixed(3) + ' off a blow taken');

  // --- 4: the decay ---------------------------------------------------------
  ck('the meter falls while you play',
     R.decayStanding > 0.3 && R.decayStanding < 0.7,
     'lost ' + R.decayStanding.toFixed(3) + ' of a full meter over 5s');
  ck('AND IT FALLS AT THE SAME RATE WHETHER YOU STAND OR RUN',
     Math.abs(R.decayStanding - R.decayRunning) < 0.001,
     'standing ' + R.decayStanding.toFixed(4) + ', running ' + R.decayRunning.toFixed(4) +
     (Math.abs(R.decayStanding - R.decayRunning) < 0.001 ? ' — waiting buys nothing'
       : ' — WAITING IS NOW A MOVE, and the game is a stealth game'));

  // --- 5: the settle --------------------------------------------------------
  ck('the fixture woke a body to settle', R.settleWoke === true,
     R.settleWoke === null ? nowhere
       : R.settleWoke ? '' : 'NOTHING WOKE — nothing below proves anything');
  ck('a body that has lost you goes back to sleep',
     R.settledAfter !== null,
     R.settledAfter === null ? 'IT NEVER SETTLED — Clamour is a ratchet'
       : 'down after ' + R.settledAfter + 's, ' + R.settledHome +
         ' units from where it was placed');
  ck('and it lay down where it was standing, not where it stopped',
     R.settledHome !== null && R.settledHome < 60,
     R.settledHome + ' units from home');
  ck('and the control: one that can still hear you does not settle at all',
     R.stayedUp === true,
     R.stayedUp ? 'still up with the hero on top of it'
       : 'IT SLEPT THROUGH A FIGHT — the settle is on a timer, not on losing you');
  ck('a loud hero is harder to shake than a quiet one',
     R.loudKeepsItUp === true,
     R.loudKeepsItUp ? 'still up at a range that would have lost a quiet hero'
       : 'the meter does not reach the settle');

  // --- 6: what must never settle -------------------------------------------
  ck('an anchored thing never wanders off', R.anchoredStaysUp === true,
     R.anchoredStaysUp ? '' : 'A BOSS WENT BACK TO SLEEP');
  ck('and neither does a body the run dripped in, which has no bed',
     R.homelessStaysUp === true);

  // --- 7: a long fight is a loud fight -------------------------------------
  ck('the control: an empty room drains',
     R.emptyRoom > 0.3 && R.emptyRoom < 0.6,
     'lost ' + R.emptyRoom.toFixed(3) + ' over 5s with nothing up');
  ck('the fixture kept its crowd', R.fullCryLeast >= R.CLAMOUR_VOICES,
     R.fullCryLeast + ' bodies in cry at the thinnest' +
     (R.fullCryLeast >= R.CLAMOUR_VOICES ? '' : ' — NOTHING BELOW MEANS ANYTHING'));
  ck('YOU CANNOT WAIT OUT A FIGHT YOU ARE STANDING IN',
     Math.abs(R.fullCry) < 0.03,
     'a full cry moved the meter ' + (R.fullCry <= 0 ? '+' : '-') +
     Math.abs(R.fullCry).toFixed(3) + ' over 5s, against ' +
     R.emptyRoom.toFixed(3) + ' lost in an empty room');
  ck('one body is not a brawl',
     R.oneBody > 0.2 && R.oneBody < R.emptyRoom,
     'lost ' + R.oneBody.toFixed(3) + ' with one up, ' +
     R.emptyRoom.toFixed(3) + ' with none — it drains, only slower');
  /* These next two say a number is the SAME as another number, and that is a
   * shape a broken mechanic satisfies for free: with the fight's noise turned
   * off entirely, forty bodies are trivially no louder than four and a distant
   * brawl is trivially no louder than an empty room. Both passed that way when
   * the term was ablated, which is a check reporting on nothing.
   *
   * So each one now also carries the live reading it is a shape OF: that a
   * near brawl is audibly different from an empty room. If the term dies, the
   * sameness still holds and the control fails, which is the right way round.
   */
  const termIsLive = R.emptyRoom - R.fullCry > 0.2;
  ck('and it saturates: forty are no louder than four',
     termIsLive && Math.abs(R.horde - R.fullCry) < 0.02,
     'four ' + R.fullCry.toFixed(3) + ', forty ' + R.horde.toFixed(3) +
     ' (' + R.hordeLeast + ' in cry), against ' + R.emptyRoom.toFixed(3) +
     ' in an empty room' +
     (!termIsLive ? ' — BOTH ARE JUST THE DECAY: the fight makes no noise at all'
       : Math.abs(R.horde - R.fullCry) < 0.02 ? ''
       : ' — THE DEEP RUNGS ARE DEAFENING BY DEPTH ALONE'));
  ck('a fight across the room is not your fight',
     termIsLive && R.farBrawlLeast === 0 && Math.abs(R.farBrawl - R.emptyRoom) < 0.02,
     R.farBrawlLeast + ' in cry at ' + (R.CLAMOUR_NEAR + 260) + ' units: drained ' +
     R.farBrawl.toFixed(3) + ' against ' + R.emptyRoom.toFixed(3) +
     ' with nothing up and ' + R.fullCry.toFixed(3) + ' with the same four near' +
     (!termIsLive ? ' — WHICH ARE ALL THE SAME NUMBER: the term is dead' : ''));
  ck('the fight moves the meter without flashing the tell',
     R.popDuringFight < 0.05 && R.popOnSwing > 0.9,
     'pop ' + R.popDuringFight.toFixed(2) + ' after two seconds of fighting, ' +
     R.popOnSwing.toFixed(2) + ' the moment a blow is struck');
  ck('the fixture kept its crowd through the moving pair',
     R.fightStandingLeast >= R.CLAMOUR_VOICES && R.fightRunningLeast >= R.CLAMOUR_VOICES,
     'standing ' + R.fightStandingLeast + ', running ' + R.fightRunningLeast +
     ' in cry at the thinnest');
  ck('AND A FIGHT COSTS THE SAME WHETHER YOU STAND IN IT OR RUN THROUGH IT',
     Math.abs(R.fightStanding - R.fightRunning) < 0.002,
     'standing ' + R.fightStanding.toFixed(4) + ', running ' +
     R.fightRunning.toFixed(4) +
     (Math.abs(R.fightStanding - R.fightRunning) < 0.002
       ? ' — the new term did not make stillness a move'
       : ' — THE FIGHT NOISE REWARDS ONE OF THEM, and it is the wrong one'));

  ck('no console errors', errs.length===0, errs.slice(0,2).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
