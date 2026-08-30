/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
// The crescent is the attack -- the swing is animation, and every point of
// damage rides the arc. So the thing that matters is WHEN it arrives: a blow
// that lands after the swing that threw it has finished reads as two attacks.
// What is checked here is that it now lands inside the swing, and that making
// it fast did not make it start missing.
const { chromium } = require('playwright');
// RIVENMARK_PAGE points the suite at a different page without touching its
// source. verify-core uses it to run the SAME file against index.html and
// against the extracted core; it used to rewrite the URL with a string
// replace, which silently stopped matching the moment this line changed.
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));

(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(900);

  const R = await p.evaluate(()=>{
    const o={};
    // A clear stretch of floor, so nothing under test is decided by geometry.
    const room=(hero)=>{
      stash=blankStash();saveStash();startRun(hero,LEVELS[10].id,'riven');
      run.banner=0; enemies.length=0; arcs.length=0;
      player.hp=player.maxHp=1e7;
      // stand somewhere with a long clear run to the east
      let best=null, bestRun=0;
      for(const c of openCells){
        let n=0;
        while(n<600 && !pointInWalls(c.x+n, c.y, 16)) n+=20;
        if(n>bestRun){bestRun=n;best=c;}
      }
      player.x=best.x; player.y=best.y;
      return bestRun;
    };

    o.clearRun={};
    for(const h of ['isaac','zayd']){
      const clear=room(h);
      o.clearRun[h]=clear;
      // --- when does it arrive? -----------------------------------------
      // One body at the far end of reach, and count the frames until it is hit.
      const far=Math.min(player.range-6, clear-30);
      const e=newBody('thrall', player.x+far, player.y, 0);
      e.awake=true; e.hp=e.maxHp=1e6; enemies.push(e);
      updateEnemies(0.001);
      arcs.length=0;
      releaseCrescent(0, 0);
      let frames=0; const hp0=e.hp;
      while(frames<200 && e.hp===hp0){ updateArcs(1/60); frames++; }
      o[h+'Flight']=+(frames/60).toFixed(3);
      o[h+'Landed']=e.hp<hp0;
      o[h+'Reach']=far;
      o[h+'Speed']=player.arcSpeed;
      o[h+'InSwing']=(frames/60) <= SWING_TIME;
    }

    // --- does it still cut everything it sweeps through? -----------------
    // Both speeds are fired at ONE rank in ONE world. Calling room() per speed
    // looked tidier and was wrong: room() calls startRun(), which regenerates
    // the map, so it compared two different ranks on two different floors and
    // reported a difference of two bodies as a regression.
    const sweep=(dt)=>{
      room('isaac');
      // Only bodies standing on open ground, or the comparison is about
      // geometry rather than about the blade.
      const placed=[];
      for(let i=0;i<14;i++){
        const x=player.x+24+i*11, y=player.y+((i%3)-1)*9;
        if(pointInWalls(x,y,14)) continue;
        const e=newBody('thrall',x,y,0);
        e.awake=true; e.hp=e.maxHp=1e6; enemies.push(e); placed.push(e);
      }
      updateEnemies(0.001);
      const fire=(speed)=>{
        for(const e of placed) e.hp=e.maxHp;
        arcs.length=0;
        player.arcSpeed=speed;
        releaseCrescent(0,0);
        for(let i=0;i<400 && arcs.length;i++) updateArcs(dt);
        return placed.filter(e=>e.hp<e.maxHp).length;
      };
      return { n:placed.length, fast:fire(1480), slow:fire(380) };
    };
    const sw=sweep(1/60);
    o.rankN=sw.n; o.cutNew=sw.fast; o.cutOld=sw.slow;
    // and at the worst frame the loop will ever hand it -- MAX_DT, a 20fps
    // stutter, which is where a fast projectile skips things if it ever will
    const swSlow=sweep(MAX_DT);
    o.cutStutter=swSlow.fast; o.cutStutterOld=swSlow.slow;

    // --- it still stops where it always stopped --------------------------
    room('isaac');
    arcs.length=0; releaseCrescent(0,0);
    const sx=arcs[0].x;
    for(let i=0;i<200 && arcs.length;i++) updateArcs(1/60);
    o.stoppedAt=Math.round(Math.abs((arcs[0]?arcs[0].x:sx+player.range)-sx));
    o.rangeIs=Math.round(player.range);

    // --- and rock still stops it -----------------------------------------
    // --- and rock still consumes it --------------------------------------
    // What the game promises is that the crescent DIES in stone, not that
    // nothing behind stone is ever touched: the arc bulges bow+half+band ahead
    // of its own centre -- about 96 units for Isaac -- and cutting a body
    // inside that bulge before the centre reaches the wall is the documented
    // trade ("it keeps a wide sweep from being cancelled because one horn
    // clipped a corner"). An earlier version of this asserted the stronger
    // thing and failed on two seeds in five, correctly.
    o.wallStops=(function(){
      room('isaac');
      let spot=null, head=0;
      outer:
      for(const c of openCells){
        for(let k=0;k<32;k++){
          const a=k*TAU/32;
          // thick rock, starting well inside reach
          let d=20;
          while(d<player.range*0.7 && !pointInWalls(c.x+Math.cos(a)*d, c.y+Math.sin(a)*d, 4)) d+=5;
          if(d>=player.range*0.7) continue;
          let solid=true;
          for(let q=0;q<=30;q+=5)
            if(!pointInWalls(c.x+Math.cos(a)*(d+q), c.y+Math.sin(a)*(d+q), 3)) { solid=false; break; }
          if(!solid) continue;
          spot=c; head=a; o.rockAt=Math.round(d); break outer;
        }
      }
      if(!spot) return null;
      player.x=spot.x; player.y=spot.y;
      enemies.length=0; arcs.length=0;
      const sx=player.x, sy=player.y;
      releaseCrescent(head,0);
      let far=0;
      for(let i=0;i<200 && arcs.length;i++){
        updateArcs(1/60);
        if(arcs[0]) far=Math.hypot(arcs[0].x-sx, arcs[0].y-sy);
      }
      o.diedAt=Math.round(far);
      // It must have stopped in the stone rather than run its full reach.
      return far < player.range - 20;
    })();

    return o;
  });

  for(const h of ['isaac','zayd']){
    ck(h+'’s crescent lands inside the swing', R[h+'InSwing'] && R[h+'Landed'],
       R[h+'Flight']+'s to cross '+R[h+'Reach']+' units, against a '+
       'swing that finishes in 0.17s');
  }
  ck('it still cuts everything it sweeps through',
     R.cutNew>0 && R.cutNew===R.cutOld,
     R.cutNew+' of '+R.rankN+' at the new speed, '+R.cutOld+' at the old one, same rank');
  ck('and still does on the worst frame the loop allows',
     R.cutStutter>0 && R.cutStutter===R.cutStutterOld,
     R.cutStutter+' against '+R.cutStutterOld+' at a 20fps stutter — a fast arc '+
     'skipping bodies would show here');
  ck('it stops where it always stopped', Math.abs(R.stoppedAt-R.rangeIs)<24,
     'travelled '+R.stoppedAt+' of a '+R.rangeIs+'-unit reach');
  ck('and rock still consumes it', R.wallStops===true,
     R.wallStops===null ? 'NO THICK ROCK IN REACH — fixture proved nothing'
       : 'died at '+R.diedAt+' against rock starting at '+R.rockAt);
  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));

  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
