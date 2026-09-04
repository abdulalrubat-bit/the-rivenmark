/* THE CRUCIBLE-MASS: the second avatar, and the other half of the question.
 *
 * The Gilded Deceiver is a fight about TARGET PRIORITY -- he moves, he lies,
 * and while a Lieutenant stands he takes almost nothing, so what the fight
 * asks is what you are hitting. This one cannot move at all and asks where
 * you are standing: a burning ring on a clock, and totems that mend it faster
 * than you can cut it down.
 *
 * WHAT THIS SUITE IS FOR. Every claim in that paragraph is a number somewhere
 * in index.html, and each one has a way of quietly stopping being true: the
 * ring can end up a disc, the totems can plant out of range and mend nothing,
 * the anchor can come loose the next time knockback is retuned. So each is
 * measured, and each measurement that could pass on an empty room carries its
 * own control -- a fixture that finds nothing has to FAIL, not report zero.
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

    /* --- where it stands on the ladder ---------------------------------- */
    o.rungs = LEVELS.filter(L => L.boss === 'crucible').length;
    o.total = LEVELS.length;
    o.rampClean = LEVELS.slice(0, 8).every(L => L.boss === 'deceiver');
    // Its epithets are the Deceiver's -- blink, mirages, guard -- and none of
    // them means anything to a body that cannot move.
    o.noEpithets = LEVELS.filter(L => L.boss === 'crucible')
                         .every(L => (L.mutators || []).length === 0);
    // The control: the OTHER rungs must still roll them, or "no epithets" is
    // true of a build where the mutator table stopped working entirely.
    o.otherRungsRoll = LEVELS.filter(L => L.boss === 'deceiver' && !RAMP[LEVELS.indexOf(L)])
                             .some(L => (L.mutators || []).length > 0);
    const cru = LEVELS.findIndex(L => L.boss === 'crucible');
    o.card = bossTitle(LEVELS[cru]) + bossNote(LEVELS[cru]);

    // A helper: bring one up at a given rung, alone in its arena.
    const arena = (idx, opts) => {
      startRun('isaac', LEVELS[idx].id, 'riven');
      run.tech = LEVEL.quota; updatePortal(0.001);
      const boss = run.boss;
      if (!boss || boss.kind !== 'crucible') return null;
      if (!(opts && opts.keepHorde)) { enemies.length = 0; enemies.push(boss); }
      totems.length = 0; slams.length = 0; hazards.length = 0;
      player.hp = player.maxHp = 1e7;
      return boss;
    };

    /* --- 1. THE ANCHOR --------------------------------------------------- */
    let e = arena(cru);
    o.spawned = !!e;
    if (!e) return o;
    o.placed = !pointInWalls(e.x, e.y, e.r);
    o.big = e.r;
    o.biggestElse = Math.max(...Object.keys(ENEMY_TYPES)
      .filter(k => k !== 'crucible').map(k => ENEMY_TYPES[k].r));
    const ax = e.x, ay = e.y;
    knock(e, 0, 1e6);                       // far past anything the kit throws
    o.shoved = +Math.hypot(e.x - ax, e.y - ay).toFixed(2);
    // The control. Same call, same force, on a body that is NOT anchored --
    // otherwise "it did not move" would pass on a build where knock() itself
    // had been broken.
    const t = newBody('thrall', e.x + 200, e.y, 0); t.awake = true; enemies.push(t);
    const tx = t.x; knock(t, 0, 1e6);
    o.shovedControl = +Math.abs(t.x - tx).toFixed(2);
    t.hp = 0;
    // And it stays put through a fight, not just through one call.
    player.x = e.x + 120; player.y = e.y;
    for (let i = 0; i < 60 * 20; i++) update(1 / 60);
    o.driftedInAFight = +Math.hypot(e.x - ax, e.y - ay).toFixed(2);
    // It does not break off and retreat the way every other heavy body does.
    e.hp = e.maxHp * 0.05;
    for (let i = 0; i < 60 * 3; i++) update(1 / 60);
    o.calcified = !!e.calcified;
    // The control for THAT: a gorger at the same fraction must calcify, or
    // the check above passes on a build where calcify stopped running.
    const g = newBody('gorger', e.x + 240, e.y, 0);
    g.awake = true; g.hp = g.maxHp * 0.05; enemies.push(g);
    for (let i = 0; i < 60 * 3; i++) update(1 / 60);
    o.gorgerCalcified = !!g.calcified;

    /* --- 2. THE FURNACE IS A RING, NOT A DISC ---------------------------- */
    e = arena(cru);
    e.hp = e.maxHp = 1e9;
    player.x = e.x + 1e5; player.y = e.y;      // the hero far out of it
    let thrown = null, casts = 0;
    for (let i = 0; i < 60 * 30 && casts < 3; i++) {
      const before = slams.length;
      update(1 / 60);
      if (slams.length > before) {
        casts++;
        if (!thrown) thrown = slams.slice().map(s => ({
          d: +Math.hypot(s.x - e.x, s.y - e.y).toFixed(1), r: s.r, frac: !!s.fracture }));
      }
    }
    o.castsIn30s = casts;
    o.blocks = thrown ? thrown.length : 0;
    o.wantBlocks = FURNACE_ARC;
    o.blocksBurn = thrown ? thrown.every(s => s.frac) : false;
    // Every block at the same radius, and that radius well clear of the boss:
    // this is what makes it a ring rather than a disc centred on it.
    if (thrown && thrown.length) {
      o.ringMin = Math.min(...thrown.map(s => s.d));
      o.ringMax = Math.max(...thrown.map(s => s.d));
      o.ringInner = +(o.ringMin - thrown[0].r).toFixed(1);   // the safe eye
    }
    // And the gaps MOVE. Two casts with the same angles is a ring you learn
    // once and then stand in the same gap forever.
    const angles = [];
    for (let n = 0; n < 6; n++) {
      slams.length = 0; e.furnace = 0;
      for (let i = 0; i < 6 && !slams.length; i++) update(1 / 60);
      if (slams.length) angles.push(+Math.atan2(slams[0].y - e.y, slams[0].x - e.x).toFixed(3));
    }
    o.castAngles = angles.length;
    o.distinctAngles = new Set(angles).size;

    /* --- 3. THE RING BURNS THE FLOOR AND COSTS THE HERO ------------------
     * Three stations, twenty-five seconds each, and ONLY the fire measured:
     * the boss's own swing is switched off for these, because it reaches into
     * the eye and would otherwise drown the thing being asked about. (It is
     * measured on its own further down -- the eye is safe from the FIRE, and
     * emphatically not safe, which is the point of standing there.)
     */
    const station = at => {
      const bb = arena(cru);
      bb.hp = bb.maxHp = 1e9;
      bb.call = 1e9;                  // no escort, so no ember from a shaman
      bb.cd = 1e9; bb.atk = 1e9;      // and no melee: the fire alone
      player.hp = player.maxHp = 1e6;
      let haz = 0;
      for (let i = 0; i < 60 * 25; i++) {
        player.x = bb.x + at; player.y = bb.y;
        update(1 / 60);
        haz = Math.max(haz, hazards.length);
      }
      return { toll: Math.round(1e6 - player.hp), haz: haz };
    };
    const onRing = station(FURNACE_R);
    o.tollOnTheRing = onRing.toll;
    o.hazardsLeft = onRing.haz;
    // The eye: inside the ring, at melee reach. Safe from the fire only.
    o.tollInTheEye = station(ENEMY_TYPES.crucible.r + 8).toll;
    // And well outside it, past the far edge of the burning band.
    o.tollOutside = station(FURNACE_R + FURNACE_BLOCK + 70).toll;

    // What the eye costs when the boss is NOT switched off -- the reason the
    // safe-from-fire square is not a safe square.
    {
      const bb = arena(cru);
      bb.hp = bb.maxHp = 1e9; bb.call = 1e9; bb.furnace = 1e9;
      player.hp = player.maxHp = 1e6;
      for (let i = 0; i < 60 * 25; i++) {
        player.x = bb.x + bb.r + 8; player.y = bb.y;
        update(1 / 60);
      }
      o.tollInReach = Math.round(1e6 - player.hp);
    }

    /* --- 4. THE TOTEMS MEND IT, AND CUTTING THEM STOPS THAT -------------- */
    // Called, planted, in range, and mending -- each step separately, because
    // any one of them failing looks identical from the outside: a bar that
    // does not move.
    e = arena(cru);
    player.x = e.x + 1e5; player.y = e.y;
    let tenders = 0, tendTotems = 0;
    for (let i = 0; i < 60 * 45; i++) {
      update(1 / 60);
      tenders = Math.max(tenders, enemies.filter(x => x.tender && x.hp > 0).length);
      tendTotems = Math.max(tendTotems, totems.filter(t => t.tender).length);
    }
    o.tendersCalled = tenders;
    o.tenderCap = CRUCIBLE_KEEP;
    o.totemsPlanted = tendTotems;
    o.tendedNow = e.tended || 0;
    // In the fire it is throwing: the errand has to cost something or it is
    // not an errand. Measured against the ring the Furnace actually lands on.
    o.totemsOnTheRing = totems.filter(t => t.tender).map(t =>
      +Math.hypot(t.x - e.x, t.y - e.y).toFixed(0));
    // The band a block of the ring actually covers, so the check below is
    // against the fire and not against a number typed in twice.
    o.burnBand = [FURNACE_R - FURNACE_BLOCK, FURNACE_R + FURNACE_BLOCK];
    o.tendRange = CRUCIBLE_TEND;

    // The mend itself, against a boss that is not being hit.
    /* The mend, per second, as a share of its own life.
     *
     * Started at five per cent and sampled for a second and a half, and both
     * numbers matter: hp is CLAMPED at maxHp, so a sample long enough for the
     * full escort to top it off measures the clamp instead of the mend. The
     * first version ran four seconds from forty per cent and reported three
     * totems at 15%/s when they were really doing 28.5 -- it had simply run
     * out of room to heal into, and the check that three mend three times as
     * fast as one failed on the fixture's own ceiling.
     */
    const mendRate = n => {
      const bb = arena(cru);
      player.x = bb.x + 1e5; player.y = bb.y;
      bb.call = 1e9;                            // no more arriving mid-sample
      bb.hp = bb.maxHp * 0.05;
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * TAU;
        plantTotem(bb.x + Math.cos(a) * 200, bb.y + Math.sin(a) * 200, true);
        totems[totems.length - 1].life = 1e9;   // hold them for the sample
      }
      const h0 = bb.hp;
      for (let i = 0; i < 90; i++) update(1 / 60);
      const got = +(((bb.hp - h0) / 1.5) / bb.maxHp).toFixed(4);
      // Say so rather than reporting a number that is really the ceiling.
      return bb.hp >= bb.maxHp - 1 ? -1 : got;
    };
    o.mend0 = mendRate(0);
    o.mend1 = mendRate(1);
    o.mend3 = mendRate(3);

    /* What the hero does back, at the same rung, geared to it: the number the
     * mend was solved against. Standing in reach, bar on cooldown.
     *
     * MEDIAN OF FIVE GEAR ROLLS, not one. rollItem is a lottery, and at the
     * deepest rung a single roll came back anywhere from 24%/s to 37%/s -- so
     * a one-roll sample made the design claim below pass or fail on the dice
     * rather than on the tuning. The claim is about a hero of the rung's
     * expected power; a hero who has rolled unusually well SHOULD be able to
     * out-damage a full escort, and this measures the typical one.
     */
    const heroShare = idx => {
      const runs = [];
      for (let n = 0; n < 7; n++) runs.push(oneHeroShare(idx));
      if (runs.some(v => v === null)) return null;
      runs.sort((a, b) => a - b);
      // The spread is reported, not averaged away: it is the finding.
      return { lo: runs[0], mid: runs[3], hi: runs[6] };
    };
    const oneHeroShare = idx => {
      stash = blankStash();
      for (const sl of SLOTS) stash.gear[sl.id] = rollItem(LEVELS[idx].depth, sl.id);
      stash.level = Math.max(1, Math.round(idx * 1.4));
      saveStash();
      const bb = arena(idx);
      if (!bb) return null;
      bb.call = 1e9; bb.furnace = 1e9;          // damage alone, no interference
      const max = bb.maxHp;
      bb.hp = bb.maxHp = 1e9;
      player.hp = player.maxHp = 1e7;
      const order = ['guillotine','aegis','truth','nullzone','mass','decrypt','anchor'];
      const h0 = bb.hp;
      for (let i = 0; i < 60 * 15; i++) {
        for (const id of order) {
          const a = ABILITY_BY_ID[id];
          if (!a || !ABILITIES[player.hero].some(x => x.id === id)) continue;
          if (!abilityBlock(a)) { castAbility(id); break; }
        }
        update(1 / 60);
        player.x = bb.x + bb.r + player.r + 4; player.y = bb.y;
      }
      return +(((h0 - bb.hp) / 15) / max).toFixed(4);
    };
    const deep = LEVELS.map((L, i) => L.boss === 'crucible' ? i : -1)
                       .filter(i => i > 0).pop();
    o.heroShallow = heroShare(cru);
    o.heroDeep = heroShare(deep);
    o.deepRung = deep;
    o.shallowRung = cru;

    /* --- 4b. AND IT ALWAYS HAS ROOM TO THROW A WHOLE ONE -----------------
     * The Furnace drops any block that would land off the map, so a boss
     * parked near an edge keeps a quadrant it can never reach -- and because
     * it never moves, that quadrant is safe for the entire fight. This is the
     * check that found it: the ring toll came back as a flat zero about one
     * run in four, whenever the gate happened to sit within 250 units of a
     * wall of the world. Asked across many delves, because it depends on
     * where the gate landed and most gates are nowhere near an edge.
     */
    let worst = FURNACE_ARC, shortAt = null, tried = 0, edgy = 0;
    for (let n = 0; n < 40; n++) {
      const bb = arena(cru);
      if (!bb) continue;
      tried++;
      const room = FURNACE_R + 40;
      if (portal.x < room || portal.y < room ||
          portal.x > WORLD.w - room || portal.y > WORLD.h - room) edgy++;
      bb.furnace = 0; slams.length = 0;
      for (let i = 0; i < 8 && !slams.length; i++) update(1 / 60);
      if (slams.length < worst) { worst = slams.length; shortAt = [Math.round(bb.x), Math.round(bb.y)]; }
    }
    o.ringTried = tried;
    o.thinnestRing = worst;
    o.thinnestAt = shortAt;
    // The control: some of those gates HAVE to have been near an edge, or
    // "every ring was whole" is a fact about forty gates in the middle.
    o.edgyGates = edgy;
    o.worldEdge = [WORLD.w, WORLD.h];

    /* --- 5. IT DIES, AND THE GATE ANSWERS -------------------------------- */
    stash = blankStash(); saveStash();
    e = arena(cru);
    o.gateShutBefore = !run.bossDown;
    damageEnemy(e, e.maxHp * 10, e.x, e.y);
    o.gateOpen = !!run.bossDown;
    o.bossCleared = run.boss === null;
    o.loot = drops.length;
    return o;
  });

  /* ---------------------------------------------------------------------- */
  ck('the fixture brought one up at all', R.spawned === true,
     R.spawned ? '' : 'NOTHING BELOW PROVES ANYTHING');
  if (!R.spawned) { console.log('\nFAIL 1\n  x no Crucible-Mass spawned'); await b.close(); process.exit(1); }

  ck('it holds a real share of the ladder',
     R.rungs > 8 && R.rungs < R.total * 0.5,
     R.rungs + ' of ' + R.total + ' rungs');
  ck('and none of the teaching ramp, which is the Deceiver’s alone',
     R.rampClean === true);
  ck('it rolls no epithets, which are the Deceiver’s own',
     R.noEpithets === true);
  ck('and the control: the Deceiver’s rungs still roll them',
     R.otherRungsRoll === true,
     R.otherRungsRoll ? '' : 'THE MUTATOR TABLE IS DEAD — the check above proves nothing');
  ck('its rung card names it and says what it is', /Crucible-Mass/.test(R.card),
     R.card);

  // --- the anchor ---------------------------------------------------------
  ck('it is placed on ground that takes it', R.placed === true);
  ck('and it is bodily bigger than anything else in the game',
     R.big > R.biggestElse * 1.5, R.big + ' units against ' + R.biggestElse);
  ck('the Anchoring Strike cannot move it', R.shoved === 0, R.shoved + ' units');
  ck('and the control: the same shove moves a thrall',
     R.shovedControl > 10,
     R.shovedControl > 10 ? 'thrall moved ' + R.shovedControl
       : 'KNOCKBACK IS DEAD — “it cannot be moved” proves nothing');
  ck('and it does not drift through a whole fight either',
     R.driftedInAFight < 1, R.driftedInAFight + ' units over 20s');
  ck('it does not break off and retreat at low life', R.calcified === false);
  ck('and the control: a gorger at the same fraction does',
     R.gorgerCalcified === true,
     R.gorgerCalcified ? '' : 'CALCIFY IS DEAD — the check above proves nothing');

  // --- the Furnace --------------------------------------------------------
  ck('the Furnace throws on a clock', R.castsIn30s >= 3, R.castsIn30s + ' casts in 30s');
  ck('and throws a ring of blocks, not one', R.blocks >= 5, R.blocks + ' blocks');
  ck('a whole one, wherever in the delve it is standing',
     R.thinnestRing === R.wantBlocks,
     R.thinnestRing === R.wantBlocks
       ? 'all ' + R.wantBlocks + ' blocks across ' + R.ringTried + ' delves'
       : 'thinnest ring was ' + R.thinnestRing + '/' + R.wantBlocks + ' at ' +
         (R.thinnestAt || []).join(',') + ' in a ' + R.worldEdge.join('x') +
         ' world — that boss has a quadrant it can never reach');
  // Without this the check above is forty gates that happened to be central.
  ck('and the control: some of those gates were near a wall of the world',
     R.edgyGates > 0,
     R.edgyGates + ' of ' + R.ringTried + ' gates sat within a ring of the edge');
  ck('every one of which leaves the floor burning', R.blocksBurn === true);
  ck('the ring is at one radius, so it is a ring and not a spray',
     R.ringMax - R.ringMin < 2, R.ringMin + ' to ' + R.ringMax + ' units out');
  ck('and it leaves an eye at the middle, which is where the boss is',
     R.ringInner > 100, R.ringInner + ' units of clear ground inside it');
  ck('the gaps turn, so standing in one is not the answer',
     R.distinctAngles === R.castAngles && R.castAngles >= 5,
     R.distinctAngles + ' distinct angles over ' + R.castAngles + ' casts');

  ck('standing on the ring costs the hero', R.tollOnTheRing > 0,
     R.tollOnTheRing + ' over 25s');
  ck('and it leaves burning ground behind it', R.hazardsLeft > 0,
     R.hazardsLeft + ' patches at the peak');
  // The one that makes "ring" mean something in play rather than in geometry:
  // the fire is a BAND, so both the middle and the outside are clear of it.
  ck('the eye at the middle is clear of the fire',
     R.tollInTheEye < R.tollOnTheRing * 0.25,
     'eye ' + R.tollInTheEye + ' against the ring’s ' + R.tollOnTheRing);
  ck('and so is the ground outside it',
     R.tollOutside < R.tollOnTheRing * 0.25,
     'outside ' + R.tollOutside + ' against the ring’s ' + R.tollOnTheRing);
  // ...and the eye still is not somewhere to stand, because it is inside the
  // reach of the thing throwing the ring. That is the whole shape of the
  // encounter: the safe band is neither the middle nor the edge.
  ck('but the eye is inside its reach, so being clear of the fire is not safety',
     R.tollInReach > R.tollOnTheRing,
     'standing in reach costs ' + R.tollInReach + ' against the ring’s ' +
     R.tollOnTheRing);

  // --- the totems ---------------------------------------------------------
  ck('it calls an escort of shamans', R.tendersCalled > 0,
     R.tendersCalled + ' at once');
  ck('and no more than it is owed', R.tendersCalled <= R.tenderCap,
     R.tendersCalled + ' against a cap of ' + R.tenderCap);
  ck('they plant, and what they plant is its own',
     R.totemsPlanted > 0, R.totemsPlanted + ' standing at the peak');
  ck('and they plant in the fire it is throwing, so the errand costs something',
     R.totemsOnTheRing.length > 0 &&
     R.totemsOnTheRing.every(d => d > R.burnBand[0] && d < R.burnBand[1]) &&
     R.totemsOnTheRing.every(d => d < R.tendRange),
     R.totemsOnTheRing.length
       ? R.totemsOnTheRing.join(', ') + ' units out, against a burning band of ' +
         R.burnBand.join('–') + ' and a mend range of ' + R.tendRange
       : 'NO TOTEM PLANTED — nothing to measure');
  ck('a totem standing mends it', R.mend1 > 0, (R.mend1 * 100).toFixed(1) + '% of its life a second');
  ck('and the control: with none standing it mends nothing',
     R.mend0 === 0,
     R.mend0 === 0 ? '' : 'IT MENDS ANYWAY — cutting the totems would change nothing');
  ck('the fixture measured the mend and not its own ceiling',
     R.mend1 > 0 && R.mend3 > 0,
     R.mend1 < 0 || R.mend3 < 0
       ? 'THE SAMPLE TOPPED IT OFF — the rates below are the health cap, not the mend'
       : 'neither sample reached full life');
  ck('three mend three times as fast, so cutting some is worth the walk',
     R.mend3 > R.mend1 * 2.5, (R.mend3 * 100).toFixed(1) + '% against ' +
     (R.mend1 * 100).toFixed(1) + '%');

  /* The whole encounter in a few numbers, and the thing most likely to rot:
   * retune the blade, or the boss's life, or CRUCIBLE_MEND, and the fight
   * silently becomes either a health bar you chew through while ignoring the
   * adds, or one you cannot beat at all.
   *
   * WHAT IS ACTUALLY TRUE, seven gear rolls a rung rather than one. At the
   * shallow end the full escort out-mends the Vanguard outright. At the
   * deepest Crucible rung it does not reliably, because a deep hero's damage
   * against this boss runs anywhere from about a fifth to a third of its pool
   * a second depending on what the gear rolled -- a 1.5x spread, with the
   * escort's 28.5% sitting inside it.
   *
   * That is the ladder's own valley showing up inside one encounter: the
   * boss's life scales at (1 + d*1.6) and the hero's damage scales faster, so
   * the escort is worth less every rung exactly as the horde is. It is
   * recorded here rather than papered over by nudging CRUCIBLE_MEND, because
   * there is no value that works -- lifting it far enough to beat a lucky
   * deep hero puts a SINGLE totem above a shallow one, and the errand stops
   * being finishable at the rung that teaches it. See winnable.js.
   */
  const pc = v => (v * 100).toFixed(1) + '%/s';
  const spread = h => pc(h.mid) + ' (' + pc(h.lo) + '–' + pc(h.hi) + ')';
  ck('with its full escort standing it out-mends the Vanguard it is taught on',
     R.mend3 > R.heroShallow.hi,
     'mends ' + pc(R.mend3) + ' against the best of seven heroes at rung ' +
     R.shallowRung + ': ' + spread(R.heroShallow));
  // Not "out-mends" at the deep end -- it does not, and saying so would be a
  // test asserting something the game does not do. What it must still be is a
  // real drag rather than decoration.
  ck('and at the deepest rung it is still most of what a Vanguard can do',
     R.mend3 > R.heroDeep.mid * 0.7,
     'mends ' + pc(R.mend3) + ' against a typical hero at rung ' + R.deepRung +
     ': ' + spread(R.heroDeep));
  ck('and with one standing it never out-mends anyone, so the errand can be finished',
     R.mend1 < R.heroShallow.lo && R.mend1 < R.heroDeep.lo,
     'one totem mends ' + pc(R.mend1) + ' against the WEAKEST of seven at each rung: ' +
     pc(R.heroShallow.lo) + ' and ' + pc(R.heroDeep.lo));
  // The control the three above need: a hero doing nothing satisfies the
  // first two trivially.
  ck('and the control: the hero is actually hitting it',
     R.heroShallow && R.heroDeep && R.heroShallow.lo > 0.02 && R.heroDeep.lo > 0.02,
     !R.heroShallow || !R.heroDeep ? 'NO ARENA — the checks above prove nothing'
       : spread(R.heroShallow) + ' and ' + spread(R.heroDeep));
  // And that the ladder is doing to this fight what it does to the delve.
  ck('the deep hero out-damages the shallow one, which is the ladder’s own valley again',
     R.heroDeep.mid > R.heroShallow.mid,
     'rung ' + R.shallowRung + ' ' + spread(R.heroShallow) +
     ' against rung ' + R.deepRung + ' ' + spread(R.heroDeep));

  // --- and it ends --------------------------------------------------------
  ck('the gate is shut while it stands', R.gateShutBefore === true);
  ck('and answers when it falls', R.gateOpen === true && R.bossCleared === true);
  ck('and it pays like an avatar', R.loot > 0, R.loot + ' pieces on the floor');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); process.exit(fail.length ? 1 : 0);
})();
