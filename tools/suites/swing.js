/* THE BLOW.
 *
 * An ordinary body used to hurt you by STANDING NEXT TO YOU:
 *
 *     e.atk -= dt; if (e.atk <= 0) { e.atk = e.cd; hurtPlayer(e); }
 *
 * A private timer, no wind-up, no pose, no tell, and nothing drawn on the
 * body at all -- the only thing you ever saw was blood on the hero, after the
 * fact. Measured by winnable.js, that path was NINE TENTHS of everything that
 * hit you in the first delve anyone plays.
 *
 * That single line is most of why the fight read as hollow, boring and
 * confusing at once. You cannot feel a blow you never saw start; you cannot
 * answer one that has no moment; and a screen with forty-six bodies on it is
 * unreadable when not one of them is visibly doing anything.
 *
 * A body's attack is an event now -- commit, tell, strike -- and this suite
 * holds every part of that, because every part of it can rot back into a
 * timer without anything else in the tree noticing.
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

    /* One body, put in reach of an unkillable hero, on open ground. Everything
     * below drives this rather than a live delve: a fixture that has to find
     * its subject in a crowd measures the crowd. */
    const alone = (kind, opts) => {
      startRun('isaac', LEVELS[(opts && opts.rung) || 0].id, 'riven');
      enemies.length = 0; slams.length = 0; hazards.length = 0;
      player.hp = player.maxHp = 1e7;
      // Open floor, so a shove or a step is not a wall test.
      let px = player.x, py = player.y;
      for (let k = 0; k < 80; k++) {
        const nx = 400 + Math.random() * (WORLD.w - 800);
        const ny = 400 + Math.random() * (WORLD.h - 800);
        if (pointInWalls(nx, ny, 90)) continue;
        px = nx; py = ny; break;
      }
      player.x = px; player.y = py;
      const e = newBody(kind, px + 26, py, 0);
      e.awake = true; e.hp = e.maxHp = 1e6; e.atk = 0;
      enemies.push(e);
      return e;
    };

    /* --- 1. IT WINDS UP BEFORE IT HITS ---------------------------------- */
    {
      const e = alone('thrall');
      const before = player.hp;
      let sawTell = false, tellAt = -1, hitAt = -1;
      for (let i = 0; i < 240; i++) {
        update(1 / 60);
        if ((e.tell || 0) > 0 && !sawTell) { sawTell = true; tellAt = i; }
        if (player.hp < before && hitAt < 0) hitAt = i;
        if (hitAt >= 0) break;
      }
      o.sawTell = sawTell;
      o.tellFirst = sawTell && hitAt > tellAt;
      o.landed = hitAt >= 0;
      o.windFrames = hitAt - tellAt;
    }

    /* --- 2. AND IT DOES NOT MOVE WHILE IT DOES --------------------------- */
    // The whole promise: where it stands when the swing starts is where the
    // blow comes from. A body shoved mid-swing makes the tell a lie about
    // where the danger is, and stepping out of it a coin toss.
    {
      const e = alone('thrall');
      /* The blade disarmed for this one, and it matters. A committed body must
       * not WALK -- but it must still be SHOVED, because the weight pass gives
       * every landed blow a recoil and taking that away from a winding body
       * would make the swing a safe place to stand. The first version of this
       * check left the hero swinging, measured 2.85 units of drift, and was
       * reading its own knockback as a failure of the root.
       */
      player.range = 1;
      let drift = 0, frames = 0;
      for (let i = 0; i < 60 * 12; i++) {
        const x = e.x, y = e.y, was = (e.tell || 0) > 0;
        update(1 / 60);
        if (was && (e.tell || 0) > 0) { drift = Math.max(drift, Math.hypot(e.x - x, e.y - y)); frames++; }
      }
      o.windDrift = +drift.toFixed(2);
      o.windFramesSeen = frames;
    }
    /* ...and the other half: a blow DOES still move it mid-swing.
     *
     * The blade has to be ASKED now. This loop used to rely on the automatic
     * swing to land the blows it is measuring the recoil of, and when the
     * automatic swing was deleted it measured zero and reported that a
     * winding body cannot be shoved -- which would have been a real and
     * alarming finding if it had been true. It is the fixture that changed,
     * so the fixture taps, which is what a player would be doing anyway.
     */
    {
      const e = alone('thrall');
      let shoved = 0;
      for (let i = 0; i < 60 * 12; i++) {
        const x = e.x, y = e.y, was = (e.tell || 0) > 0;
        conduitPress(); conduitRelease();       // a tap, every frame it is ready
        update(1 / 60);
        if (was && (e.tell || 0) > 0) shoved = Math.max(shoved, Math.hypot(e.x - x, e.y - y));
      }
      o.windShove = +shoved.toFixed(2);
    }
    // The control: the same body, NOT winding, must move plenty -- or "it
    // stays put" is true of a build where nothing moves at all.
    {
      const e = alone('thrall');
      e.atk = 1e9;                       // never winds, so it only ever walks
      player.x += 600;
      const x0 = e.x, y0 = e.y;
      for (let i = 0; i < 120; i++) update(1 / 60);
      o.walkDrift = +Math.hypot(e.x - x0, e.y - y0).toFixed(1);
    }

    /* --- 3. STEP OUT DURING THE WIND AND IT HITS THE AIR ----------------- */
    {
      const e = alone('thrall');
      const before = player.hp;
      let stepped = false, whiffed = false;
      for (let i = 0; i < 60 * 8 && !whiffed; i++) {
        if (!stepped && (e.tell || 0) > 0 && e.tell < e.tellMax * 0.6) {
          player.x += 260;               // a step, taken mid-swing
          stepped = true;
        }
        update(1 / 60);
        if ((e.whiffed || 0) > 0) whiffed = true;
      }
      o.stepped = stepped;
      o.whiffed = whiffed;
      o.whiffCostNothing = player.hp === before;
    }
    // The control: stand still through the same swing and it lands.
    {
      const e = alone('thrall');
      const before = player.hp;
      for (let i = 0; i < 60 * 8 && player.hp === before; i++) update(1 / 60);
      o.stillGetsHit = player.hp < before;
    }

    /* --- 4. THE TELL IS LONG ENOUGH TO BE AN ANSWER ---------------------- */
    // The one that decides whether any of this is real: a wind the hero
    // cannot cover the reach of is a tell you watch rather than answer.
    o.kinds = [];
    for (const k in ENEMY_TYPES) {
      const d = ENEMY_TYPES[k];
      if (d.weight === 0 && k !== 'crucible' && k !== 'lieutenant') continue;
      const wind = meleeWind(d);
      const reach = d.r + BASE_PLAYER.r + MELEE_BITE;
      o.kinds.push({ k, wind: +wind.toFixed(2), reach,
                     run: Math.round(BASE_PLAYER.speed * wind),
                     ok: BASE_PLAYER.speed * wind > reach });
    }

    /* --- 5. AND A BOSS SWINGS THE SAME WAY ------------------------------- */
    // A boss's blows should be the most readable in the game, not the one
    // place that still hurts you without warning.
    {
      const cru = LEVELS.findIndex(L => L.boss === 'crucible');
      startRun('isaac', LEVELS[cru].id, 'riven');
      run.tech = LEVEL.quota; updatePortal(0.001);
      const boss = run.boss;
      o.bossIsMass = !!boss && boss.kind === 'crucible';
      if (boss) {
        enemies.length = 0; enemies.push(boss);
        boss.call = 1e9; boss.furnace = 1e9;      // the swing alone
        boss.hp = boss.maxHp = 1e9;
        player.hp = player.maxHp = 1e6;
        player.x = boss.x + boss.r + 8; player.y = boss.y;
        let tell = false;
        const before = player.hp;
        for (let i = 0; i < 60 * 10; i++) {
          player.x = boss.x + boss.r + 8; player.y = boss.y;
          update(1 / 60);
          if ((boss.tell || 0) > 0) tell = true;
          if (player.hp < before) break;
        }
        o.bossWinds = tell;
        o.bossLands = player.hp < before;
      }
    }
    return o;
  });

  ck('a body in reach winds up', R.sawTell === true);
  ck('and the wind-up comes before the blow, not after it',
     R.tellFirst === true && R.landed === true,
     R.landed ? R.windFrames + ' frames of tell before it landed'
       : 'IT NEVER LANDED — nothing below proves a blow exists');

  ck('a body that has committed does not walk',
     R.windDrift < 0.5 && R.windFramesSeen > 30,
     R.windDrift + ' units of drift over ' + R.windFramesSeen + ' winding frames');
  // But it is not a safe place to stand: the recoil the weight pass gives
  // every landed blow still reaches it, which is what keeps hitting a winding
  // body worth doing.
  ck('though a blow still shoves it, so a swing is not cover',
     R.windShove > 0.5,
     R.windShove + ' units when the blade is landing');
  ck('and the control: the same body walks plenty when it is not swinging',
     R.walkDrift > 40,
     R.walkDrift > 40 ? 'walked ' + R.walkDrift + ' units'
       : 'NOTHING MOVES AT ALL — “it stays put” proves nothing');

  ck('the fixture actually stepped out of a swing', R.stepped === true);
  ck('and stepping out of one makes it miss',
     R.whiffed === true && R.whiffCostNothing === true,
     R.whiffed ? 'the blow cost nothing' : 'it followed the hero');
  ck('and the control: standing still through the same swing is hit',
     R.stillGetsHit === true,
     R.stillGetsHit ? '' : 'NOTHING HITS AT ALL — the dodge above proves nothing');

  const short = R.kinds.filter(k => !k.ok);
  ck('every kind’s tell is long enough for the hero to leave its reach',
     short.length === 0,
     short.length ? short.map(k => k.k + ' winds ' + k.wind + 's = ' + k.run +
                                   ' units against a reach of ' + k.reach).join(', ')
       : R.kinds.length + ' kinds, tightest ' +
         Math.min(...R.kinds.map(k => Math.round(k.run / k.reach * 100))) + '% of the reach to spare');
  // ...and the fast ones are genuinely harder to read than the heavy ones,
  // which is what makes the roster feel like a roster.
  const winds = R.kinds.map(k => k.wind);
  ck('and a fast body is harder to read than a heavy one',
     Math.max(...winds) > Math.min(...winds) * 1.6,
     R.kinds.slice().sort((a, b) => a.wind - b.wind)
       .map(k => k.k + ' ' + k.wind + 's').join(', '));

  ck('the fixture brought a boss up', R.bossIsMass === true);
  ck('and a boss swings by the same rules as the horde',
     R.bossWinds === true && R.bossLands === true,
     R.bossWinds ? 'it wound up and it landed' : 'it hit with no warning');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); process.exit(fail.length ? 1 : 0);
})();
