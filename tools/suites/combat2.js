/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
const { chromium } = require('playwright');
// RIVENMARK_PAGE points the suite at a different page without touching its
// source. verify-core uses it to run the SAME file against index.html and
// against the extracted core; it used to rewrite the URL with a string
// replace, which silently stopped matching the moment this line changed.
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
const OUT = '/tmp/claude-0/-home-user-abdulalrubat-bit-github-io/4bff2945-7328-5fd1-8354-f2ea6e41425c/scratchpad/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass=[], fail=[];
const ck=(n,ok,note)=>(ok?pass:fail).push(n+(note?'  ['+note+']':''));

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({viewport:{width:430,height:900},deviceScaleFactor:2})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('debug.html'));
  await sleep(600);
  // Fixed seed: the geometry fixture needs a specific clear lane, and a
  // rerun should reproduce whatever it found.
  await p.evaluate(() => {
    document.querySelector('#dbgToggle').click();
    document.querySelector('#dbgSeed').value = '20260824';
  });
  await p.locator('#dbgSeedGo').scrollIntoViewIfNeeded();
  await p.click('#dbgSeedGo');
  await sleep(600);

  // Helper installed in-page: clear the field, plant enemies, swing once.
  await p.evaluate(() => {
    /* A TAP, WHERE THIS SUITE USED TO CALL fire().
     *
     * The automatic blade is gone, so the only way a crescent leaves the
     * hero is the Conduit. Returns whether one did, which is what fire()
     * returned. The chain is reset first: every third tap in a chain comes
     * round a fifth wider, and this suite is about geometry, so a wider
     * finisher would read as the geometry changing.
     */
    window.tap = () => {
      /* The beat, zeroed. fire() ignored fireTimer entirely -- it was called
       * by the game's own clock, which had already decided the blade was
       * ready -- whereas a tap is refused while the beat is running. This
       * suite drives the sim by hand and is not testing the beat, so it
       * hands the blade over ready, exactly as fire() found it. Without
       * this, six checks read "the blade did not swing" when what had
       * happened is that it declined to swing early. */
      player.fireTimer = 0;
      player.combo = 0; player.comboT = 0;
      const before = arcs.length;
      conduitPress(); conduitRelease();
      return arcs.length > before;
    };

    window.T = {
      clear() { enemies.length = 0; arcs.length = 0; compactEnemies && compactEnemies(); },
      // put a dummy at an offset from the player, out of the walls' way
      plant(dx, dy, hp) {
        const e = { kind:'thrall', x:player.x+dx, y:player.y+dy, r:13, speed:0,
                    hp:hp||9999, maxHp:hp||9999, dmg:0, tech:1, cd:9, mass:1,
                    color:'#9dbb5a', halo:'rgba(0,0,0,0)', atk:9, hitFlash:0,
                    wob:0, angle:0, face:1 };
        enemies.push(e); return e;
      },
      // release along a fixed heading, so geometry is tested independently of
      // which body auto-aim would have chosen
      cast(ang, secs) {
        arcs.length = 0;
        releaseCrescent(ang || 0, 0);
        for (let i=0;i<Math.ceil((secs||1.2)*60);i++) {
          enemyGrid = new SpatialHash(ENEMY_CELL);
          for (const e of enemies) if (e.hp>0) enemyGrid.insert(e, e.x, e.y);
          updateArcs(1/60);
        }
      },
      // widest perpendicular offset the blade still reaches, by bisection
      reachAcross(HP) {
        let lo = 0, hi = 260;
        for (let k=0;k<12;k++) {
          const q = (lo+hi)/2;
          T.clear(); const e = T.plant(110, q, HP); T.cast(0);
          if (e.hp < HP) lo = q; else hi = q;
        }
        return Math.round(lo);
      },
      // rebuild the hash then swing, and let the arc fly its whole life
      swing(secs) {
        enemyGrid = new SpatialHash(ENEMY_CELL);
        for (const e of enemies) enemyGrid.insert(e, e.x, e.y);
        const ok = tap();
        for (let i=0;i<Math.ceil((secs||1.0)*60);i++) {
          enemyGrid = new SpatialHash(ENEMY_CELL);
          for (const e of enemies) if (e.hp>0) enemyGrid.insert(e, e.x, e.y);
          updateArcs(1/60);
        }
        return ok;
      }
    };
    // park the player somewhere with clear ground around them
    // Geometry tests cast along +x, so demand a lane that is clear the whole
    // way out past the blade's reach -- and clear behind and to the flank too,
    // since the "spares what is behind" test plants bodies there.
    let best=null;
    for (const c of openCells) {
      let clear = true;
      for (let d=10; d<=360 && clear; d+=10) if (pointInWalls(c.x+d, c.y, 12)) clear=false;
      for (let d=10; d<=110 && clear; d+=10) if (pointInWalls(c.x-d, c.y, 12)) clear=false;
      if (clear) { best=c; break; }
    }
    if (!best) throw new Error('no clear test lane on this map');
    player.x=best.x; player.y=best.y;
  });

  const r = await p.evaluate(() => {
    const o = {};
    const HP = 100000;

    // 1. a swing releases a crescent
    T.clear(); T.plant(70, 0, HP);
    o.releases = (enemyGrid = new SpatialHash(ENEMY_CELL),
                  enemies.forEach(e=>enemyGrid.insert(e,e.x,e.y)), tap()) && arcs.length === 1;
    o.arcHasSweep = arcs[0] && arcs[0].half > 0 && arcs[0].bow > 0;

    // 2. it damages what it sweeps
    T.clear(); const a1 = T.plant(90, 0, HP); T.swing();
    o.damagesAhead = a1.hp < HP;

    // 3. it cuts a swathe -- several bodies abreast, all in one swing
    T.clear();
    const row = [T.plant(90,-34,HP), T.plant(95,0,HP), T.plant(90,34,HP)];
    T.swing();
    o.cutsSwathe = row.filter(e => e.hp < HP).length;

    // 4. it does not hit what it never sweeps past
    T.clear();
    const front = T.plant(90, 0, HP);     // dead ahead of the cast
    const back  = T.plant(-90, 0, HP);    // directly behind
    const side  = T.plant(0, 200, HP);    // off to one flank
    T.cast(0, 2.0);
    o.sparesBehind = back.hp === HP && side.hp === HP && front.hp < HP;

    // 5. each body is cut once, not ground down frame after frame
    T.clear(); const once = T.plant(60,0,HP);
    T.cast(0, 2.0);
    o.hitsOnce = Math.round((HP - once.hp) / player.damage);

    // 6. the crescent dies at the blade's reach, not past it
    T.clear(); const far = T.plant(player.range + 140, 0, HP);
    T.cast(0, 2.0);
    o.stopsAtReach = far.hp === HP;
    T.clear(); const near = T.plant(player.range - 30, 0, HP);
    T.cast(0, 2.0);
    o.reachesRange = near.hp < HP;

    return o;
  });

  ck('a swing releases one crescent', r.releases);
  ck('crescent carries sweep + bow', r.arcHasSweep);
  ck('crescent damages what it sweeps', r.damagesAhead);
  ck('crescent cuts a swathe (3 abreast)', r.cutsSwathe === 3, r.cutsSwathe + '/3');
  ck('crescent spares what is behind', r.sparesBehind);
  ck('each body cut exactly once', r.hitsOnce === 1, r.hitsOnce + ' hits');
  ck('crescent stops beyond reach', r.stopsAtReach);
  ck('crescent reaches full range', r.reachesRange);

  // ---- boons actually change the blade ------------------------------------
  const boon = await p.evaluate(() => {
    const o = {}, HP = 100000;
    const U = id => UPGRADES.find(u=>u.id===id).apply(player);
    o.narrowBefore = T.reachAcross(HP);
    U('pierce'); U('pierce'); U('pierce');            // Broad Sweep x3
    o.wideAfter = T.reachAcross(HP);

    T.clear(); T.plant(80,0,HP);
    const n0 = (enemyGrid = new SpatialHash(ENEMY_CELL),
                enemies.forEach(e=>enemyGrid.insert(e,e.x,e.y)), tap(), arcs.length);
    U('split');                                        // Twin Crescent
    T.clear(); T.plant(80,0,HP);
    const n1 = (enemyGrid = new SpatialHash(ENEMY_CELL),
                enemies.forEach(e=>enemyGrid.insert(e,e.x,e.y)), tap(), arcs.length);
    o.shots = [n0, n1];

    const r0 = player.range; U('range'); o.reach = [r0, player.range];
    const s0 = player.arcSpeed; U('vel'); o.speed = [s0, player.arcSpeed];
    o.noPierceStat = player.pierce === undefined;
    return o;
  });
  ck('Broad Sweep widens the swathe', boon.wideAfter > boon.narrowBefore * 1.3,
     'reaches ' + boon.narrowBefore + ' -> ' + boon.wideAfter + ' units across');
  ck('Twin Crescent adds a crescent', boon.shots[1] === boon.shots[0] + 1, boon.shots.join(' -> '));
  ck('Long Reach extends range', boon.reach[1] > boon.reach[0], boon.reach.map(Math.round).join(' -> '));
  ck('Swift Edge speeds the arc', boon.speed[1] > boon.speed[0], boon.speed.map(Math.round).join(' -> '));
  ck('pierce stat is gone', boon.noPierceStat);

  // ---- both heroes swing --------------------------------------------------
  for (const hero of ['isaac','zayd']) {
    const h = await p.evaluate(async (hero) => {
      resetRun(hero); state='play'; showScreen(null);
      // Park where the ground is verifiably clear all the way along +x, so a
      // wall between blade and body cannot make this flake by map luck.
      let best=null;
      for (const c of openCells) {
        let clear = true;
        for (let d=10; d<=180 && clear; d+=10) if (pointInWalls(c.x+d, c.y, 12)) clear=false;
        if (clear) { best=c; break; }
      }
      if (!best) return { skip:true };
      player.x=best.x; player.y=best.y;
      enemies.length=0;
      const e = { kind:'thrall', x:player.x+80, y:player.y, r:13, speed:0, hp:1e6, maxHp:1e6,
                  dmg:0, tech:1, cd:9, mass:1, color:'#9dbb5a', halo:'rgba(0,0,0,0)',
                  atk:9, hitFlash:0, wob:0, angle:0, face:1 };
      enemies.push(e);
      enemyGrid = new SpatialHash(ENEMY_CELL); enemyGrid.insert(e, e.x, e.y);
      const fired = tap();
      const swung = player.swing > 0;
      const arcN = arcs.length;
      for(let i=0;i<60;i++){ enemyGrid=new SpatialHash(ENEMY_CELL);
                             enemyGrid.insert(e, e.x, e.y); updateArcs(1/60); }
      return { fired, swung, hurt: e.hp < 1e6, range: player.range, sweep: player.sweep,
               arcs: arcN, dist: Math.round(Math.hypot(e.x-player.x, e.y-player.y)) };
    }, hero);
    ck(hero + ' swings and cuts', !h.skip && h.fired && h.swung && h.hurt,
       (h.skip ? 'no clear lane on this map' : 'fired ' + h.fired + ', swung ' + h.swung + ', hurt ' + h.hurt +
       ', reach ' + Math.round(h.range) + ', sweep ' + Math.round(h.sweep) +
       ', arcs ' + h.arcs + ', dist ' + h.dist));
  }

  // ---- line of sight -------------------------------------------------------
  const los = await p.evaluate(() => {
    const o = {}, HP = 1e6;
    // a body in the open, inside reach: the blade must swing
    T.clear(); const open = T.plant(90, 0, HP);
    enemyGrid = new SpatialHash(ENEMY_CELL); enemyGrid.insert(open, open.x, open.y);
    o.firesInOpen = tap();

    // A body on the far side of rock: the blade must hold, not swing at stone.
    // The fixture parks the player in a deliberately clear lane, so the pair
    // has to be found anywhere on the map rather than around the fixture.
    const home = { x: player.x, y: player.y };
    let pair = null;
    for (const a of openCells) {
      if (pair) break;
      for (const b of openCells) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < 60 || d > player.range * 0.9) continue;
        if (clearShot(a.x, a.y, b.x, b.y)) continue;
        pair = { a, b, d: Math.round(d) }; break;
      }
    }
    if (pair) {
      player.x = pair.a.x; player.y = pair.a.y;
      T.clear(); const e = T.plant(pair.b.x - player.x, pair.b.y - player.y, HP);
      enemyGrid = new SpatialHash(ENEMY_CELL); enemyGrid.insert(e, e.x, e.y);
      arcs.length = 0;
      /* WHAT CHANGED HERE, AND WHY THE CLAIM MOVED.
       *
       * This used to assert that the blade HELD -- that fire() looked at a
       * body behind rock, found no clear shot, and declined to swing at all.
       * That was the right thing for an automatic blade: it was spending
       * itself on your behalf, so wasting a swing on stone was its mistake.
       *
       * A tap is not that. The design is explicit that a tap ALWAYS swings,
       * because a button that silently does nothing is the complaint the
       * whole Conduit exists to answer -- so a hero who taps at a wall gets
       * a crescent, and should.
       *
       * What must still be true is that the blade does not TARGET through
       * stone: the swing goes where the hero is facing rather than curving
       * to a body it cannot reach, and that body takes nothing. That is the
       * claim now, and it is the one that would matter if it broke.
       */
      const hp0 = e.hp;
      o.swingsAtRock = tap();
      for (let i = 0; i < 60; i++) updateArcs(1 / 60);
      o.rockBodyUntouched = e.hp >= hp0;
      o.walledDist = pair.d;
      player.x = home.x; player.y = home.y;
    } else { o.swingsAtRock = 'no walled pair anywhere on this map';
             o.rockBodyUntouched = 'no walled pair anywhere on this map'; }

    // a body pressed right up against the player is always hittable
    T.clear(); const near = T.plant(26, 0, HP);
    enemyGrid = new SpatialHash(ENEMY_CELL); enemyGrid.insert(near, near.x, near.y);
    o.firesPointBlank = tap();

    // and the blocked one is not merely deprioritised -- it is not a target
    T.clear();
    const far = T.plant(90, 0, HP);
    enemyGrid = new SpatialHash(ENEMY_CELL); enemyGrid.insert(far, far.x, far.y);
    o.stillFiresWhenOneIsClear = tap();
    return o;
  });
  ck('swings at a body in the open', los.firesInOpen);
  ck('a tap swings even at rock, because you asked for it',
     los.swingsAtRock === true,
     typeof los.swingsAtRock === 'string' ? los.swingsAtRock
       : 'blocked body at ' + los.walledDist + ' units');
  ck('but the blade does not reach through it', los.rockBodyUntouched === true,
     typeof los.rockBodyUntouched === 'string' ? los.rockBodyUntouched
       : 'the body behind the rock took nothing over a full arc life');
  ck('point blank still swings', los.firesPointBlank);
  ck('a clear body is still found', los.stillFiresWhenOneIsClear);

  // how often does the blade go quiet with something in reach? A high number
  // would mean the LOS rule has made the game feel unresponsive.
  // Sample the geometry directly rather than waiting for a stationary player to
  // be approached: stand next to each placed body, in every open spot within
  // reach of it, and ask whether anything at all is hittable from there.
  const idle = await p.evaluate(() => {
    let inReach = 0, held = 0;
    for (let r = 0; r < 6; r++) {
      resetRun('isaac');
      for (const tgt of enemies) {
        if (tgt.hp <= 0) continue;
        // a few vantage points around this body, on real floor
        for (let k = 0; k < 4; k++) {
          const a = Math.random() * TAU, d = 40 + Math.random() * (player.range - 60);
          const px = tgt.x + Math.cos(a) * d, py = tgt.y + Math.sin(a) * d;
          if (pointInWalls(px, py, player.r)) continue;
          let any = false, clear = false;
          for (const e of enemies) {
            if (e.hp <= 0 || e.kind === 'mirage') continue;
            if (Math.hypot(e.x - px, e.y - py) > player.range) continue;
            any = true;
            if (clearShot(px, py, e.x, e.y)) { clear = true; break; }
          }
          if (!any) continue;
          inReach++;
          if (!clear) held++;
        }
      }
    }
    return { inReach, held, pct: inReach ? Math.round(100 * held / inReach) : 0 };
  });
  ck('the blade rarely goes quiet with a body in reach', idle.pct <= 25,
     idle.held + ' of ' + idle.inReach + ' vantage points (' + idle.pct +
     '%) had a body in reach but none with a clear line');

  ck('no console errors', errs.length === 0, errs.join(' | '));
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close();
  process.exit(fail.length?1:0);
})();
