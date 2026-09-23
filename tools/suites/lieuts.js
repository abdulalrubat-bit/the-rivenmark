/* Run through tools/run-suites.js, or alone with node. Which page it drives --
 * the core, the game or the forge -- is in ./_pages.js. */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core()); await sleep(700);

  // ---- the escort ---------------------------------------------------------
  const esc = await p.evaluate(()=>{
    stash=blankStash(); saveStash();
    startRun('isaac', LEVELS[30].id, 'riven');
    run.tech = LEVEL.quota;
    updatePortal(1/60);                       // reaching the quota calls him
    const guard = enemies.filter(e=>e.kind==='lieutenant');
    const boss = run.boss;
    const inRock = guard.some(g=>pointInWalls(g.x,g.y,g.r));
    // read the arrival banner before the fight, or killing him below replaces it
    const note = run.bannerNote;
    const h0 = boss.hp; damageEnemy(boss, 1000); const held = h0-boss.hp;
    for(const g of guard) g.hp = 0;
    const h1 = boss.hp; damageEnemy(boss, 1000); const open = h1-boss.hp;
    return { called: !!boss, n: guard.length, inRock, held, open, note,
             slams: guard.every(g=>g.slam), tech: guard[0] && guard[0].tech };
  });
  ck('the Deceiver arrives with an escort', esc.called && esc.n>=2, esc.n+' Lieutenants');
  ck('and none of them in rock', !esc.inRock);
  ck('they hold him up', esc.held < esc.open*0.25,
     Math.round(esc.held)+' through the escort vs '+Math.round(esc.open)+' once it is down');
  ck('the banner says so', /Lieutenants/.test(esc.note||''), esc.note);
  ck('they are worth killing', esc.tech >= 10, esc.tech+' slag each');
  ck('and they slam', esc.slams);

  // ---- the slam -----------------------------------------------------------
  const slam = await p.evaluate(()=>{
    startRun('isaac', LEVELS[30].id, 'riven');
    enemies.length=0; slams.length=0;
    // Both ends of the pair have to be on clear ground: dropped in rock the
    // body is shoved out on its first frame and can land outside slam range,
    // which is a bad fixture rather than a bad slam.
    let c=null, ex=0, ey=0;
    for (const o of openCells) {
      if (pointInWalls(o.x,o.y,30)) continue;
      let got=false;
      for (let a=0; a<TAU && !got; a+=0.35) {
        const x=o.x+Math.cos(a)*SLAM_R*1.6, y=o.y+Math.sin(a)*SLAM_R*1.6;
        if (x<40||y<40||x>WORLD.w-40||y>WORLD.h-40) continue;
        if (pointInWalls(x,y,ENEMY_TYPES.lieutenant.r+4)) continue;
        ex=x; ey=y; got=true;
      }
      if (got) { c=o; break; }
    }
    if (!c) return { thrown:false, skip:true };
    player.x=c.x; player.y=c.y; player.invuln=0;
    player.hp = player.maxHp = 100000;
    const e = newBody('lieutenant', ex, ey, 0); e.awake=true; e.slamCd=0;
    enemies.push(e);
    updateEnemies(1/60);
    const thrown = slams.length===1 ? {...slams[0]} : null;
    if(!thrown) return {thrown:false};
    // it must not land immediately
    const hp0=player.hp;
    for(let i=0;i<Math.floor(60*(SLAM_WIND-0.15));i++) updateSlams(1/60);
    const earlyHit = player.hp < hp0;
    // stand still and take it
    for(let i=0;i<30;i++) updateSlams(1/60);
    const took = hp0 - player.hp;
    // now walk out of the next one
    slams.length=0; e.slamCd=0; player.invuln=0;
    updateEnemies(1/60);
    const s2 = slams[0];
    const hp1 = player.hp;
    if (!s2) return { thrown:true, earlyHit, took, dodged:false, noSecond:true,
                      wind:SLAM_WIND, r:SLAM_R, marked:true, cleared:true };
    player.x = s2.x + s2.r + 40;              // step off the marked ground
    for(let i=0;i<Math.ceil(60*(SLAM_WIND+0.4));i++) updateSlams(1/60);
    const dodged = player.hp === hp1;
    return { thrown:true, earlyHit, took, dodged, wind:SLAM_WIND, r:SLAM_R,
             marked: Math.hypot(thrown.x-c.x, thrown.y-c.y) < 4,
             cleared: slams.length===0 };
  });
  ck('a lieutenant throws a slam at range', slam.thrown, slam.skip?'no clear pair on this map':'');
  ck('and throws another once its cooldown is up', !slam.noSecond);
  ck('it lands where it was aimed, not where you are', slam.marked);
  ck('it does not land before its wind-up', !slam.earlyHit, slam.wind+'s of warning');
  ck('standing in it hurts', slam.took>0, Math.round(slam.took)+' damage');
  ck('stepping off it does not', slam.dodged, 'reach '+slam.r+' units');
  ck('and the slam clears itself up', slam.cleared);

  // ---- a slam already thrown still lands ---------------------------------
  const posth = await p.evaluate(()=>{
    slams.length=0; player.invuln=0; player.hp=player.maxHp=100000;
    const e=enemies[0]; e.slamCd=0; player.x=e.x-SLAM_R*1.6; player.y=e.y;
    updateEnemies(1/60);
    const had = slams.length===1;
    e.hp = 0;                                   // killed mid-wind
    const hp0=player.hp;
    for(let i=0;i<Math.ceil(60*(SLAM_WIND+0.4));i++) updateSlams(1/60);
    return { had, landed: player.hp < hp0 };
  });
  ck('a blow already committed to lands even if the thrower dies',
     posth.had && posth.landed);

  // ---- the horde never rolls one -----------------------------------------
  const roster = await p.evaluate(()=>{
    let seen=0;
    for(let i=0;i<3000;i++){ const {out}=typeWeights(300);
      if(out.some(o=>o.k==='lieutenant')) seen++; }
    return { seen, weight: ENEMY_TYPES.lieutenant.weight };
  });
  ck('Lieutenants never turn up in the ordinary horde',
     roster.seen===0 && roster.weight===0);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
