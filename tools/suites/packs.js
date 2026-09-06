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
// The gate-house is behind the splash now: the stations live on a tab bar and
// the bar does not exist until you have entered. Idempotent, so it is safe to
// call before every station click however the test got there.
async function enterHub(pg){
  const onSplash = await pg.$eval('#splash', e=>e.classList.contains('on')).catch(()=>false);
  if (!onSplash) return;
  await pg.click('#toGatehouse');
  await new Promise(r=>setTimeout(r,220));
}

// The hero picker moved behind the Descend button when the menus were
// redesigned; starting a run is two taps now.
async function beginRun(p, hero, diff) {
  await enterHub(p); await p.click('#toDelve');
  await new Promise(r => setTimeout(r, 150));
  if (hero) { await p.click('#heroPick .card[data-hero="' + hero + '"]');
              await new Promise(r => setTimeout(r, 80)); }
  if (diff) { await p.click('#diffPick .card[data-diff="' + diff + '"]');
              await new Promise(r => setTimeout(r, 80)); }
  await p.click('#beginRun');
  await new Promise(r => setTimeout(r, 500));
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push(n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html'));
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

  // --- a cleared room stays cleared ----------------------------------------
  const cleared = await p.evaluate(()=>{
    resetRun('isaac');
    const n0=enemies.length;
    for(let i=0;i<60*120;i++) update(1/60);
    return { n0, n1:enemies.length, waves:!!LEVEL.waves };
  });
  ck('no waves are pushed at the player', cleared.n1<=cleared.n0 && !cleared.waves,
     cleared.n0+' -> '+cleared.n1+' after 2 min standing still');

  ck('no console errors', errs.length===0, errs.slice(0,2).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
