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
const pages = require('./_pages.js');

// Into a delve: see pages.descend.
async function beginRun(p, hero, diff) {
  await pages.descend(p, { hero, diff });
  await new Promise(r => setTimeout(r, 300));
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[];
/* 'x ' on a failure: run-suites.js surfaces exactly that prefix when it
 * summarises a sweep, so without it a red suite reports its count and none
 * of its reasons — which means re-running it alone to find out why. */
const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core());
  await beginRun(p);

  // --- population across many generated delves ------------------------------
  const pop = await p.evaluate(()=>{
    const rows=[];
    for(let r=0;r<12;r++){
      resetRun('isaac');
      const slag = enemies.reduce((a,e)=>a+e.tech,0);
      const awake = enemies.filter(e=>e.awake).length;
      let minD=1e9;
      for(const e of enemies) minD=Math.min(minD,Math.hypot(e.x-player.x,e.y-player.y));
      const wedged = enemies.filter(e=>pointInWalls(e.x,e.y,e.r)).length;
      rows.push({ n:enemies.length, slag, awake, minD:Math.round(minD), wedged,
                  region:REGION.id });
    }
    return rows;
  });
  const tot=a=>a.reduce((x,y)=>x+y,0);
  const { PACK_SAFE_EXPECT, AGGRO_FAR_EXPECT } =
    await p.evaluate(()=>({ PACK_SAFE_EXPECT: PACK_SAFE, AGGRO_FAR_EXPECT: AGGRO_FAR }));
  ck('every delve is populated', pop.every(r=>r.n>=25), 'counts ' + pop.map(r=>r.n).join(','));
  ck('slag on the map clears the quota', pop.every(r=>r.slag>=100),
     'min ' + Math.min(...pop.map(r=>r.slag)) + ', quota 70');
  ck('nothing starts awake', tot(pop.map(r=>r.awake))===0, 'awake ' + tot(pop.map(r=>r.awake)));
  // What actually matters: nothing is close enough to notice you at spawn.
  ck('spawn pocket is clear', pop.every(r=>r.minD>=PACK_SAFE_EXPECT),
     'nearest body ' + Math.min(...pop.map(r=>r.minD)) +
     ' units, aggro reaches ' + AGGRO_FAR_EXPECT);
  ck('no body placed inside rock', tot(pop.map(r=>r.wedged))===0,
     'wedged ' + tot(pop.map(r=>r.wedged)));

  // The gate is the objective; loading it inside a wall makes a delve
  // unfinishable, so this checks the whole circle, not just its centre.
  const gate = await p.evaluate(()=>{
    let bad=0, worst=0, runs=0;
    for(let r=0;r<20;r++){
      resetRun('isaac'); runs++;
      let hits=0;
      if(pointInWalls(portal.x, portal.y, 8)) hits++;
      for(let a=0;a<24;a++){
        const t=a/24*TAU;
        for(const rad of [PORTAL_R*0.5, PORTAL_R*0.85, PORTAL_R]){
          if(pointInWalls(portal.x+Math.cos(t)*rad, portal.y+Math.sin(t)*rad, 6)) hits++;
        }
      }
      if(hits){ bad++; worst=Math.max(worst,hits); }
    }
    return { bad, runs, worst };
  });
  // A chasm is impassable, so one cut in the wrong place severs the delve.
  const pits = await p.evaluate(()=>{
    let cut=0, severed=0, runs=0, reachAll=0;
    for(let r=0;r<14;r++){
      resetRun('isaac'); runs++;
      const n = walls.filter(w=>w.pit).length;
      cut += n;
      // every open cell must still be walkable from where the player stands
      const seen=new Uint8Array(GW*GH);
      const sx=Math.floor(player.x/CELL_W), sy=Math.floor(player.y/CELL_W);
      const st=[sy*GW+sx]; seen[st[0]]=1; let got=1, total=0;
      for(let i=0;i<grid.length;i++) if(grid[i]===0) total++;
      while(st.length){ const k=st.pop(); const cx=k%GW, cy=(k/GW)|0;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=cx+dx, ny=cy+dy;
          if(nx<0||ny<0||nx>=GW||ny>=GH) continue;
          const nk=ny*GW+nx;
          if(seen[nk]||grid[nk]===1) continue;
          seen[nk]=1; got++; st.push(nk); } }
      if(got===total) reachAll++; else severed++;
      // and a pit must actually stop a body
      for(const w of walls){ if(!w.pit) continue;
        if(!pointInWalls(w.x+w.w/2, w.y+w.h/2, 4)) severed += 100; }
    }
    return { cut, severed, runs, reachAll };
  });
  ck('chasms are cut', pits.cut>0, pits.cut+' across '+pits.runs+' delves');
  ck('a chasm never severs the delve', pits.severed===0 && pits.reachAll===pits.runs,
     pits.reachAll+'/'+pits.runs+' delves fully reachable');

  ck('the ley-gate never loads inside rock', gate.bad===0,
     gate.bad+' of '+gate.runs+' delves had rock in the gate circle'+
     (gate.worst?' (worst '+gate.worst+' sample points)':''));

  // --- waking behaviour -----------------------------------------------------
  const wake = await p.evaluate(async ()=>{
    resetRun('isaac');
    const o={};
    // stand still a while: nothing should stir
    for(let i=0;i<60*8;i++) update(1/60);
    o.idleWake = enemies.filter(e=>e.awake).length;

    // walk the player onto a pack and let the alarm run
    const far = enemies.slice().sort((a,b)=>
      Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
    const target = far[0];
    const pack = enemies.filter(e=>Math.hypot(e.x-target.x,e.y-target.y)<130);
    player.x=target.x+40; player.y=target.y;
    rebuildFlow();
    for(let i=0;i<60*3;i++) update(1/60);
    o.packWoke = pack.filter(e=>e.awake||e.hp<=0).length;
    o.packSize = pack.length;
    // bodies far from the player should still be asleep
    o.distantAsleep = enemies.filter(e=>e.hp>0 &&
      Math.hypot(e.x-player.x,e.y-player.y)>900 && !e.awake).length;
    o.distantTotal = enemies.filter(e=>e.hp>0 &&
      Math.hypot(e.x-player.x,e.y-player.y)>900).length;
    return o;
  });
  ck('standing still wakes nothing', wake.idleWake===0, wake.idleWake+' woke');
  ck('walking into a pack wakes the pack', wake.packWoke===wake.packSize,
     wake.packWoke+'/'+wake.packSize);
  ck('distant bodies stay dormant', wake.distantAsleep===wake.distantTotal,
     wake.distantAsleep+'/'+wake.distantTotal);

  /* --- and the alarm carries further the deeper the delve is --------------
   * ALERT_GROWTH is one of the three terms that make a deep delve hostile
   * without touching what a body hits for: at the bottom of the ladder a
   * roused pack reaches 229 units instead of 155, which is most of the way to
   * the next pack site, so waking one room means fighting two.
   *
   * Measured rather than asserted from the constant, because the constant
   * being right proves nothing about what the chain does with it. The hero is
   * dropped on the nearest pack and the delve is left to run; what is counted
   * is how many bodies are awake AT ONCE at the peak. Off the lever that is
   * 12 at rung 44; on it, it is 46, which is HORDE_LIVE -- the chain now
   * reaches the cap that exists to stop it reaching the whole map.
   *
   * WHAT THIS DOES NOT DO, recorded here because it is the more useful half:
   * quadrupling the horde at rung 44 moved the reference player's extraction
   * rate from 12/16 to 13/16, which is nothing. See winnable.js.
   */
  const chain = await p.evaluate(async () => {
    const peakAwake = idx => {
      const peaks = [];
      for (let n = 0; n < 6; n++) {
        startRun('isaac', LEVELS[idx].id, 'riven');
        const near = enemies.filter(e => e.hp > 0).sort((a, b) =>
          Math.hypot(a.x-player.x, a.y-player.y) - Math.hypot(b.x-player.x, b.y-player.y))[0];
        if (!near) continue;
        // The hero is a bystander here, not a fighter: unkillable so the
        // sample is not cut short, and the count is of bodies AWAKE, so
        // anything it happens to kill leaves the tally rather than inflating
        // it.
        player.x = near.x; player.y = near.y;
        player.hp = player.maxHp = 1e7;
        let peak = 0;
        for (let i = 0; i < 60 * 20; i++) {
          update(1/60);
          const n = enemies.filter(e => e.awake && e.hp > 0).length;
          if (n > peak) peak = n;
        }
        peaks.push(peak);
      }
      return peaks.sort((a,b)=>a-b)[peaks.length >> 1];
    };
    return { top: peakAwake(0), deep: peakAwake(LEVEL_COUNT - 1),
             rTop: Math.round(ALERT_R), rDeep: Math.round(ALERT_R * (1 + ALERT_GROWTH)),
             cap: HORDE_LIVE };
  });
  ck('the alarm carries further at the bottom of the ladder than at the top',
     chain.rDeep > chain.rTop * 1.3,
     chain.rTop + ' units at rung 0 against ' + chain.rDeep + ' at the last rung');
  // The one that matters: the radius is a number, this is what the delve does
  // with it. A deep delve must bring MEANINGFULLY more of itself at once.
  ck('and a deep delve brings far more of itself at once',
     chain.deep > chain.top * 2,
     chain.top + ' bodies awake at the peak at rung 0 against ' + chain.deep +
     ' at the last rung, cap ' + chain.cap);
  // The control. If the chain ever runs past HORDE_LIVE the cap has broken,
  // and a delve that wakes end to end is not a harder delve -- it is one
  // fight with the whole map in it and nothing dormant left to walk into.
  ck('and never past the cap that stops it taking the whole map',
     chain.deep <= chain.cap, chain.deep + ' awake against a cap of ' + chain.cap);

  // --- struck from range, and rock blocks notice ---------------------------
  const more = await p.evaluate(()=>{
    resetRun('isaac'); const o={};
    const e = enemies.find(x=>x.hp>0);
    o.hitWakes = (damageEnemy(e,1), e.awake);

    // a body whose path back to the player is long should not hear them, even
    // if the straight line is short
    let found=null, checked=0, blocked=0;
    for(let r=0;r<10 && !found;r++){
      resetRun('isaac'); rebuildFlow();
      // walk the player next to a body so plenty of others fall inside the
      // straight-line radius, then look for one the rock keeps deaf
      const t0=enemies[0]; player.x=t0.x+40; player.y=t0.y; rebuildFlow();
      for(const x of enemies){
        const straight=Math.hypot(x.x-player.x,x.y-player.y);
        if(straight>=x.aggro) continue;
        checked++;
        const path=noticeDist(x,straight);
        if(path>=x.aggro){ blocked++;
          if(!found) found={straight:Math.round(straight),path:Math.round(path)}; }
      }
    }
    o.rockBlocks=found; o.checked=checked; o.blocked=blocked;
    return o;
  });
  ck('a struck body wakes', more.hitWakes);
  ck('notice is path distance, not line of sight', more.blocked>0,
     more.rockBlocks ? more.blocked+' of '+more.checked+
     ' bodies inside line-of-sight range stay deaf behind rock; e.g. line '+
     more.rockBlocks.straight+' but path '+more.rockBlocks.path
     : 'no body was ever blocked by rock in '+more.checked+' chances');

  /* --- a cleared room stays cleared ----------------------------------------
   *
   * THIS USED TO FAIL ABOUT TWO RUNS IN FIVE, and the reason turned out to be
   * the check rather than the game.
   *
   * The count really did grow -- by one to three bodies over two minutes of
   * standing still, in a game whose design statement is that nothing is
   * pushed at the player. But teaching the failure to name what arrived
   * answered it in one run: "1 deceiver, 2 mirage; an invader is up". That is
   * THE UNINVITED, which is a designed event with its own roll (rollInvasion,
   * odds rising with depth) and its own section in the design document. It is
   * not a wave. It is the one thing in the game that is supposed to come and
   * find you.
   *
   * So the claim is narrowed to what it always meant: no ORDINARY HORDE BODY
   * arrives on a timer. An invasion is allowed, and is asserted to be the
   * only thing that may arrive -- so a real wave regression, which would show
   * up as thralls and gorgers appearing, still fails this.
   *
   * Two lessons kept because both cost time. First: a check that says "it
   * grew by three" and cannot say three of WHAT is a check that costs an hour
   * every time it goes red -- naming the kinds turned an afternoon's
   * suspicion into a one-line answer. Second: a suite is a page with history,
   * and this fixture runs after twenty others; the invasion was rolled by an
   * earlier one, which is why a fresh page never reproduced it.
   */
  const cleared = await p.evaluate(()=>{
    resetRun('isaac');
    const tally=()=>{const m={};for(const e of enemies)m[e.kind]=(m[e.kind]||0)+1;return m;};
    const b4=tally(); const n0=enemies.length;
    for(let i=0;i<60*120;i++) update(1/60);
    const now=tally();
    const grew=[];
    for(const k of new Set([...Object.keys(b4),...Object.keys(now)])){
      const d=(now[k]||0)-(b4[k]||0);
      if(d>0) grew.push(d+' '+k);
    }
    // The uninvited and what he brings with him. Anything else appearing is
    // the horde being pushed, which is the thing this forbids.
    const UNINVITED = { deceiver:1, mirage:1, lieutenant:1 };
    const pushed = grew.filter(g => !UNINVITED[g.split(' ').slice(1).join(' ')]);
    return { n0, n1:enemies.length, waves:!!LEVEL.waves, grew, pushed,
             boss:run.boss?run.boss.kind:null, invader:!!run.invader };
  });
  const say = cleared.n0+' -> '+cleared.n1+' after 2 min standing still' +
     (cleared.grew.length ? '; arrived: '+cleared.grew.join(', ') : '') +
     (cleared.invader ? '; an invader is up, which is allowed' : '');
  ck('no horde body is pushed at the player',
     cleared.pushed.length===0 && !cleared.waves, say);
  // The control. Without it the check above passes on a delve that generated
  // nothing to begin with, or on a fixture that never stepped the sim.
  ck('and the control: the delve it stood in was populated',
     cleared.n0 > 25, cleared.n0 + ' bodies placed');

  ck('no console errors', errs.length===0, errs.slice(0,2).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
