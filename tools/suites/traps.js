/* GROUND THE ROOM KEEPS.
 *
 * A hazard is spent and gone; a trap is a permanent property of a place, and
 * that is what makes it terrain you can use rather than weather you endure.
 * Spikes in the pillared hall, standing water in the cistern.
 *
 * WHAT "USE" ACTUALLY MEANS HERE, measured rather than assumed. The brief this
 * came from said the player should be able to FORCE the horde into a hazard,
 * and at the knockback this game has they cannot: a plate is a forty-unit
 * cell, and the Anchoring Strike moves a thrall fifteen units, a guard-break
 * twenty-one, an ordinary crescent nine -- and a breaker five. So the play is
 * not shoving. It is LEADING: you choose where to stand, the horde comes to
 * you, and the floor is what it crosses to get there. That is positioning,
 * which is the one tactical input this game's controls express, and it is what
 * these checks are about.
 *
 * The other half of the point is that a trap cuts both ways. A trap only the
 * player can step in is a tax.
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

    // --- which rooms get what ---------------------------------------------
    const seen = { hall: 0, cistern: 0, barracks: 0, collapse: 0 };
    let mismatched = 0, spikeDelves = 0, poolDelves = 0, n = 0;
    for (let i = 0; i < 16; i++) {
      startRun('isaac', LEVELS[[6, 18, 30, 42][i % 4]].id, 'riven'); n++;
      for (const rm of rooms) {
        seen[rm.kind] = (seen[rm.kind] || 0) + 1;
        const near = traps.filter(t => Math.hypot(t.x - rm.x, t.y - rm.y) < 4);
        const want = rm.kind === 'hall' ? 'spike' : rm.kind === 'cistern' ? 'pool' : null;
        if (want ? !near.some(t => t.kind === want) : near.length) mismatched++;
      }
      if (traps.some(t => t.kind === 'spike')) spikeDelves++;
      if (traps.some(t => t.kind === 'pool')) poolDelves++;
    }
    o.rooms = seen; o.mismatched = mismatched; o.delves = n;
    o.spikeDelves = spikeDelves; o.poolDelves = poolDelves;

    // --- the beat ----------------------------------------------------------
    // Sampled across two whole cycles: every phase must appear, and `out` must
    // never follow `down` without a `tell` between them.
    const seq = [];
    for (let t = 0; t < SPIKE_CYCLE * 2; t += 0.02) seq.push(spikePhase(t).phase);
    o.phases = [...new Set(seq)].sort().join(',');
    o.unwarned = seq.filter((ph, i) => i > 0 && ph === 'out' && seq[i - 1] === 'down').length;

    /* --- and the beat quickens as the ladder goes down --------------------
     * The floor is one of the three terms that make a deep delve hostile
     * without touching what a body hits for. What has to hold is not just
     * "the cycle is shorter" -- it is that the shortening comes ENTIRELY out
     * of the rest between risings, and that the tell and the standing, which
     * are the parts the player reads and dodges, are the same at rung 51 as
     * at rung 0. A trap that tells you faster is a trap you gamble on.
     */
    const beatAt = d => {
      const c = spikeBeat(d);
      const step = 0.005, span = [];
      let cur = null, run0 = 0;
      for (let t = 0; t < c; t += step) {
        const ph = spikePhase(t, c).phase;
        if (ph !== cur) { if (cur !== null) span.push([cur, t - run0]); cur = ph; run0 = t; }
      }
      span.push([cur, c - run0]);
      const of = k => span.filter(x => x[0] === k).reduce((a, x) => a + x[1], 0);
      return { cycle: +c.toFixed(3), tell: +of('tell').toFixed(2),
               out: +of('out').toFixed(2), rest: +of('down').toFixed(2) };
    };
    o.beatTop = beatAt(0);
    o.beatDeep = beatAt(1);
    // What the delve itself actually builds, at both ends -- the constant
    // being right proves nothing if placeTraps hands the field another one.
    const cycleIn = idx => {
      for (let i = 0; i < 40; i++) {
        startRun('isaac', LEVELS[idx].id, 'riven');
        const t = traps.find(t => t.kind === 'spike');
        if (t) return +t.cycle.toFixed(3);
      }
      return null;
    };
    o.builtTop = cycleIn(0);
    o.builtDeep = cycleIn(LEVEL_COUNT - 1);

    // --- a spike field, with a matched pair on it and beside it -----------
    let tr = null;
    for (let i = 0; i < 60 && !tr; i++) {
      startRun('isaac', LEVELS[18].id, 'riven');
      tr = traps.find(t => t.kind === 'spike');
    }
    o.foundSpike = !!tr;
    if (tr) {
      enemies.length = 0;
      // A pillared hall is pillars: half the cells in it are STONE, and a body
      // dropped into one is ejected to the nearest face on the first update --
      // by up to seventy units, which is nearly two cells and flips the
      // checkerboard parity under it. The pair has to be found on open floor,
      // and it has to still be where it was put after the world has had a
      // frame to object.
      let onAt = null, offAt = null;
      for (let dy = -3; dy <= 3 && (!onAt || !offAt); dy++) {
        for (let dx = -3; dx <= 3 && (!onAt || !offAt); dx++) {
          const x = tr.x + dx * CELL_W, y = tr.y + dy * CELL_W;
          if (Math.hypot(x - tr.x, y - tr.y) > tr.r - CELL_W) continue;
          if (pointInWalls(x, y, 16)) continue;
          if (onPlate(x, y)) { if (!onAt) onAt = [x, y]; }
          else if (!offAt) offAt = [x, y];
        }
      }
      o.pairFound = !!(onAt && offAt);
      if (!o.pairFound) return o;
      const put = a => { const e = newBody('thrall', a[0], a[1], 0);
                         e.awake = true; e.hp = e.maxHp = 1e6; enemies.push(e); return e; };
      const on = put(onAt), off = put(offAt);
      // A third body on the same plate as `on`, but ASLEEP. A trap that
      // touches the dormant wakes them -- damageEnemy rouses what it hits and
      // the alert chains -- and a pack roused by the floor while the player is
      // somewhere else is the one thing this game's packs exist not to do.
      const dozing = put(onAt); dozing.awake = false;
      // And the avatar's escort, awake and standing on the same plate. His
      // fight has one rule -- break the Lieutenants to reach him -- and a
      // spike field under them breaks it for you.
      const lieut = newBody('lieutenant', onAt[0], onAt[1], 0);
      lieut.awake = true; lieut.hp = lieut.maxHp = 1e6; enemies.push(lieut);
      updateEnemies(0.001);
      o.pairHeld = Math.hypot(on.x - onAt[0], on.y - onAt[1]) < 2 &&
                   Math.hypot(off.x - offAt[0], off.y - offAt[1]) < 2 &&
                   onPlate(on.x, on.y) && !onPlate(off.x, off.y);
      if (!o.pairHeld) return o;
      player.x = tr.x; player.y = tr.y - 4000;    // the hero well out of it
      player.hp = player.maxHp = 1e6;
      tr.t = 0; tr.was = 'down';
      // One whole cycle.
      for (let i = 0; i < Math.ceil(SPIKE_CYCLE * 60); i++) updateTraps(1 / 60);
      o.bitDozing = Math.round(1e6 - dozing.hp);
      o.bitLieut = Math.round(1e6 - lieut.hp);
      o.dozingWoke = !!dozing.awake;
      o.bitOnPlate = Math.round(1e6 - on.hp);
      o.bitBeside = Math.round(1e6 - off.hp);
      o.share = +(o.bitOnPlate / on.maxHp).toFixed(2);
      // Once per rising, not per tick: hold it in the OUT phase and check that
      // nothing more happens while the spikes are still standing.
      // Leave whichever phase the cycle above ended in FIRST. Waiting for
      // 'out' when it is already out returns immediately, one frame from the
      // end, and the check below then passed on a single sample -- which is
      // the same vacuous pass it exists to catch.
      while (spikePhase(tr.t, tr.cycle).phase === 'out') updateTraps(1 / 60);
      while (spikePhase(tr.t, tr.cycle).phase !== 'out') updateTraps(1 / 60);
      const held = on.hp;              // the rising, and its bite, have landed
      let ticks = 0;
      while (spikePhase(tr.t, tr.cycle).phase === 'out') { updateTraps(1 / 60); ticks++; }
      o.whileStandingTicks = ticks;
      o.whileStanding = Math.round(held - on.hp);

      // The hero pays too -- and pays a smaller share, because it is a trap
      // and not a coin flip.
      player.x = onAt[0]; player.y = onAt[1];
      player.hp = player.maxHp = 1000;
      tr.t = 0; tr.was = 'down';
      for (let i = 0; i < Math.ceil(SPIKE_CYCLE * 60); i++) updateTraps(1 / 60);
      o.heroToll = Math.round(1000 - player.hp);
      o.heroShare = +(o.heroToll / 1000).toFixed(2);
    }

    // --- the pool ----------------------------------------------------------
    let pl = null;
    for (let i = 0; i < 60 && !pl; i++) {
      startRun('isaac', LEVELS[18].id, 'riven');
      pl = traps.find(t => t.kind === 'pool');
    }
    o.foundPool = !!pl;
    if (pl) {
      enemies.length = 0;
      const inn = newBody('thrall', pl.x, pl.y, 0);
      const out = newBody('thrall', pl.x + pl.r + 90, pl.y, 0);
      inn.awake = out.awake = true;
      inn.hp = inn.maxHp = out.hp = out.maxHp = 1e6;
      enemies.push(inn, out); updateEnemies(0.001);
      player.x = pl.x; player.y = pl.y; player.hp = player.maxHp = 1e6;
      pl.tick = 0;
      for (let i = 0; i < 120; i++) updateTraps(1 / 60);   // two seconds
      o.poolBitIn = Math.round(1e6 - inn.hp);
      o.poolBitOut = Math.round(1e6 - out.hp);
      o.poolBitHero = Math.round(1e6 - player.hp);
    }

    // --- and it is leading, not shoving -----------------------------------
    // What a blow actually moves, against the size of a plate. Recorded so
    // that if the knockback ever grows enough for shoving to be a real play,
    // this is the number that says so.
    startRun('isaac', LEVELS[18].id, 'riven');
    const shove = force => {
      enemies.length = 0;
      const e = newBody('thrall', player.x + 50, player.y, 0);
      e.awake = true; e.hp = e.maxHp = 1e6; enemies.push(e);
      const x0 = e.x; knock(e, 0, force); return +(e.x - x0).toFixed(1);
    };
    o.cell = CELL_W;
    o.bash = shove(300);
    o.guardBreak = shove(420);
    return o;
  });

  ck('the fixture cut rooms of every kind to check',
     R.rooms.hall > 0 && R.rooms.cistern > 0 &&
     R.rooms.barracks > 0 && R.rooms.collapse > 0,
     JSON.stringify(R.rooms));
  ck('spikes go in the pillared halls and pools in the cisterns, and nothing else is trapped',
     R.mismatched === 0, R.mismatched + ' rooms carried the wrong trap or none');
  // Not "most": a delve dresses three to five rooms out of four kinds, so a
  // hall is likely rather than certain, and asserting otherwise would be
  // asserting a coin lands heads. Often enough to be part of the game.
  ck('and a good share of delves have one', R.spikeDelves > R.delves * 0.3 &&
     R.poolDelves > R.delves * 0.3,
     R.spikeDelves + ' with spikes and ' + R.poolDelves + ' with a pool, of ' + R.delves);

  ck('the spikes have all three phases', R.phases === 'down,out,tell', R.phases);
  ck('and never come up without telling first', R.unwarned === 0,
     R.unwarned + ' risings with no tell before them');

  // --- the beat against depth ---------------------------------------------
  ck('the beat quickens with depth', R.beatDeep.cycle < R.beatTop.cycle - 0.5,
     R.beatTop.cycle + 's at the mouth against ' + R.beatDeep.cycle + 's at the bottom');
  // The control, and the whole point of the lever: every second the cycle
  // loses comes out of the REST. If a future change takes it out of the tell
  // or the standing instead, this is what says so.
  ck('and every second of it comes out of the rest, not the tell or the standing',
     Math.abs(R.beatDeep.tell - R.beatTop.tell) < 0.05 &&
     Math.abs(R.beatDeep.out - R.beatTop.out) < 0.05,
     'tell ' + R.beatTop.tell + '→' + R.beatDeep.tell +
     ', standing ' + R.beatTop.out + '→' + R.beatDeep.out +
     ', rest ' + R.beatTop.rest + '→' + R.beatDeep.rest);
  // A hall you cannot cross is a wall, not a harder hall. A plate is one cell
  // and the hero crosses about 210 units a second, so the rest has to stay
  // long enough to walk off the checkerboard you are standing on.
  ck('and the rest never falls below the time it takes to cross a plate',
     R.beatDeep.rest > R.cell / 210,
     R.beatDeep.rest + 's of rest against ' + (R.cell / 210).toFixed(2) +
     's to cross a ' + R.cell + '-unit plate');
  ck('and the delve builds its fields at the beat its own depth asks for',
     R.builtTop !== null && R.builtDeep !== null &&
     Math.abs(R.builtTop - R.beatTop.cycle) < 0.01 &&
     Math.abs(R.builtDeep - R.beatDeep.cycle) < 0.01,
     R.builtTop === null || R.builtDeep === null
       ? 'NO HALL CUT AT ONE END — the check below proves nothing'
       : 'rung 0 built ' + R.builtTop + 's, the last rung ' + R.builtDeep + 's');

  ck('the fixture found a hall to test in', R.foundSpike);
  ck('a body standing on a plate is spiked', R.bitOnPlate > 0,
     R.bitOnPlate + ' over one cycle, ' + (R.share * 100).toFixed(0) + '% of it');
  // The control. Without it "the spikes bite" would pass on a build where the
  // whole room is lethal, which is a floor that kills rather than a trap.
  ck('the fixture found a plate AND a square beside it, both on open floor',
     R.pairFound === true && R.pairHeld === true,
     !R.pairFound ? 'NO SAFE SQUARE — every check about the checkerboard below would prove nothing'
     : !R.pairHeld ? 'THE PAIR MOVED — a body dropped into a pillar is ejected across the parity line'
     : '');
  ck('and one standing beside it is not', R.pairFound && R.bitBeside === 0,
     R.bitBeside + ' off the plate');
  ck('and a body asleep on one is left alone',
     R.bitDozing === 0 && R.dozingWoke === false,
     R.bitDozing ? 'the floor woke a dormant pack' : 'still asleep, still whole');
  ck('and the avatar’s escort is not ground down by the room',
     R.bitLieut === 0,
     R.bitLieut ? 'the floor was fighting his fight for him' : 'his fight stays his');
  ck('once per rising, not once per frame',
     R.whileStanding === 0 && R.whileStandingTicks > 10,
     R.whileStanding + ' more over ' + R.whileStandingTicks + ' frames of standing spikes');
  ck('the hero pays too, and pays less than a body does',
     R.heroToll > 0 && R.heroShare < R.share,
     'hero ' + (R.heroShare * 100).toFixed(0) + '% against a body’s ' +
     (R.share * 100).toFixed(0) + '%');

  ck('the fixture found a cistern to test in', R.foundPool);
  ck('standing water costs whatever stands in it', R.poolBitIn > 0 && R.poolBitHero > 0,
     'body ' + R.poolBitIn + ', hero ' + R.poolBitHero + ' over two seconds');
  ck('and nothing outside it', R.poolBitOut === 0);

  ck('the trap play is leading, not shoving — recorded, not assumed',
     R.bash < R.cell && R.guardBreak < R.cell,
     'a bash moves a thrall ' + R.bash + ' units and a guard-break ' +
     R.guardBreak + ', against a ' + R.cell + '-unit plate');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); process.exit(fail.length ? 1 : 0);
})();
