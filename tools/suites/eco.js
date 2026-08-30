/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
// The horde does something about dying now: it closes, it mends itself, and it
// eats its own dead. Each of those is a thing the player has to go and stop
// rather than out-damage, so what is checked here is mostly that stopping it
// works and that leaving it alone costs you.
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
    const fresh=(lvl)=>{stash=blankStash();saveStash();startRun('isaac',LEVELS[lvl||10].id,'riven');
      run.banner=0;enemies.length=0;totems.length=0;corpsesFresh.length=0;
      player.hp=player.maxHp=1e6;
      for(const c of openCells){if(!pointInWalls(c.x,c.y,170)){player.x=c.x;player.y=c.y;break;}}};
    const mob=(k,dx,dy)=>{const e=newBody(k,player.x+dx,player.y+(dy||0),0);e.awake=true;
      enemies.push(e);updateEnemies(0.001);return e;};

    // ---- calcification --------------------------------------------------
    fresh(); const g=mob('gorger',150); g.hp=g.maxHp*0.25; updateEnemies(1/60);
    o.calcBegan=g.calcify>0;
    for(let i=0;i<Math.ceil(CALCIFY_TIME*60)+6;i++) updateEnemies(1/60);
    o.calcHealed=Math.abs(g.hp-g.maxHp)<0.01;
    o.calcOnce=(g.calcified===true);
    // and having used it, it does not do it again
    g.hp=g.maxHp*0.2; updateEnemies(1/60);
    o.calcNoRepeat=!(g.calcify>0);

    fresh(); const light=mob('thrall',120); light.hp=light.maxHp*0.2;
    updateEnemies(1/60);
    o.calcHeavyOnly=!(light.calcify>0);

    fresh(); const g2=mob('gorger',150); g2.hp=g2.maxHp*0.25; updateEnemies(1/60);
    damageEnemy(g2, g2.maxHp*CALCIFY_BREAK*1.1);
    o.calcBrokeByBlow=g2.calcify===0;
    fresh(); const g3=mob('gorger',150); g3.hp=g3.maxHp*0.25; updateEnemies(1/60);
    damageEnemy(g3, g3.maxHp*0.01);
    o.calcSurvivesScratch=g3.calcify>0;
    fresh(); const g4=mob('gorger',150); g4.hp=g4.maxHp*0.25; updateEnemies(1/60);
    o.calcIsACast=isCasting(g4);
    silence(g4,3); o.calcSnapped=g4.calcify===0;

    // ---- totems ---------------------------------------------------------
    fresh(); const hurt=mob('thrall',60); hurt.hp=hurt.maxHp*0.4; const was=hurt.hp;
    const pHp=player.hp;
    plantTotem(player.x+70, player.y);
    o.totemPlanted=totems.length===1;
    for(let i=0;i<60;i++) updateTotems(1/60);
    o.totemMends=hurt.hp>was;
    o.totemNotForYou=player.hp<=pHp;
    const th0=totems[0].hp;
    hurtTotemsNear(totems[0].x, totems[0].y, 20, 40);
    o.totemTakesDamage=totems[0].hp<th0;
    totems[0].hp=0; updateTotems(1/60);
    o.totemFalls=totems.length===0;
    // and a shaman is what plants one
    o.shamanPlants=(function(){
      fresh(); const sh=mob('shaman',100);
      sh.spell=2; sh.chanting=0.001; sh.chant=0;
      for(let i=0;i<20;i++) updateEnemies(1/60);
      return totems.length>0;
    })();

    // ---- consumption ----------------------------------------------------
    fresh(); const el=mob('breaker',80); makeElite(el); el.hp=el.maxHp*0.5;
    noteFallen(el.x+20, el.y);
    const eh=el.hp;
    tryConsume(el,1/60); o.consumeBegan=el.consume>0;
    // Drain the feed to the floor rather than for a fixed count: CONSUME_TIME
    // in 1/60ths lands a float hair ABOVE zero, and a leftover of 3e-15 keeps
    // tryConsume returning true from its first branch whatever e.fed says --
    // which is a harness reading its own rounding as a second meal.
    for(let i=0;i<600 && el.consume>0;i++) tryConsume(el,1/60);
    o.consumeDrained=el.consume<=0;
    o.consumeHealed=el.hp>eh;
    noteFallen(el.x+20, el.y);
    o.consumeOnce=(el.fed===true) && !tryConsume(el,1/60) && !(el.consume>0);
    fresh(); const rank=mob('thrall',80); rank.hp=rank.maxHp*0.5;
    noteFallen(rank.x+20, rank.y);
    o.consumeElitesOnly=!tryConsume(rank,1/60);

    // ---- the horde's mass -----------------------------------------------
    fresh();
    const a1=mob('thrall',0,0), a2=mob('thrall',6,0);
    a1.x=player.x+200; a1.y=player.y; a2.x=a1.x+8; a2.y=a1.y;
    const bx=a2.x;
    for(let i=0;i<10;i++) updateEnemies(1/60);
    o.mutualShove=Math.abs(a2.x-bx)>0.5;

    return o;
  });

  ck('a heavy body breaks off when it is nearly down', R.calcBegan);
  ck('and comes back whole if it is left alone', R.calcHealed, 'four seconds');
  ck('it only ever does it once', R.calcOnce && R.calcNoRepeat,
     'a champion that can keep retreating never dies');
  ck('a light body does not do it at all', R.calcHeavyOnly);
  ck('a real blow shatters the shell', R.calcBrokeByBlow);
  ck('a scratch does not', R.calcSurvivesScratch,
     'you have to commit to stopping it, not graze it');
  ck('it counts as a cast', R.calcIsACast, 'which gives Zayd something to snap');
  ck('and the interrupt snaps it', R.calcSnapped);

  ck('a totem stands where it is planted', R.totemPlanted);
  ck('it mends the horde', R.totemMends);
  ck('and not you', R.totemNotForYou, 'standing in it is not a gift');
  ck('it can be broken', R.totemTakesDamage && R.totemFalls);
  ck('and a shaman is what plants one', R.shamanPlants);

  ck('an elite over a fresh corpse stops to feed', R.consumeBegan);
  ck('and it heals for it', R.consumeHealed && R.consumeDrained, 'the feed runs out');
  ck('once each, and no more', R.consumeOnce, 'or a field of dead is a full heal');
  ck('the rank and file do not feed', R.consumeElitesOnly);

  ck('bodies shove each other, not only themselves', R.mutualShove,
     'a crowd that only repels the one stepping slides past itself');

  // ---- the cap, and the thing it must not break -------------------------
  // The brief asked for a horde cap of 40-60. Applied to bodies PLACED it
  // breaks extraction: a delve holds 1.42x its own quota in slag and the quota
  // runs to 270 at about a slag a thrall, so the map would stop containing
  // enough to open its own gate. Applied to bodies AWAKE it gives the same
  // wall in front of you and leaves the delve full behind it.
  const cap = await p.evaluate(()=>{
    const out={};
    stash=blankStash();saveStash();startRun('isaac',LEVELS[24].id,'riven');
    run.banner=0; player.hp=player.maxHp=1e7;
    out.cap=HORDE_LIVE;
    out.placed=enemies.length;
    out.slagOnMap=enemies.reduce((n,e)=>n+(e.hp>0?e.tech:0),0);
    out.quota=LEVEL.quota;
    // Walk the hero the length of the delve, sampling how many are up.
    //
    // NOT down the game's own flow field: rebuildFlow() seeds that AT the
    // player, so the player's cell is its minimum and walking downhill is
    // standing still. Build a second field from the far end of the delve
    // instead and descend THAT, which walks the hero away from the gate and
    // through everything between.
    rebuildFlow();
    let far=-1, farD=-1;
    for(let i=0;i<flowDist.length;i++) if(flowDist[i]>farD){farD=flowDist[i];far=i;}
    out.farCells=farD;
    const away=new Int32Array(GW*GH).fill(-1);
    const q=new Int32Array(GW*GH); let head=0,tail=0;
    q[tail++]=far; away[far]=0;
    while(head<tail){
      const k=q[head++], cx=k%GW, cy=(k/GW)|0, nd=away[k]+1;
      for(let i=0;i<4;i++){
        const nx=cx+(i===0?1:i===1?-1:0), ny=cy+(i===2?1:i===3?-1:0);
        if(nx<0||ny<0||nx>=GW||ny>=GH) continue;
        const nk=gi(nx,ny);
        if(grid[nk]===SOLID||away[nk]>=0) continue;
        away[nk]=nd; q[tail++]=nk;
      }
    }
    const sx0=player.x, sy0=player.y;
    let peak=0, travelled=0;
    for(let step=0;step<4000;step++){
      const px=player.x, py=player.y;
      const cx=clamp(Math.floor(player.x/CELL_W),0,GW-1),
            cy=clamp(Math.floor(player.y/CELL_W),0,GH-1);
      const here=away[gi(cx,cy)];
      let bx=-1, by=-1, best=here;
      if(here>0){
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy) continue;
          const nx=cx+dx, ny=cy+dy;
          if(nx<0||ny<0||nx>=GW||ny>=GH) continue;
          if(dx&&dy&&(cellAt(cx+dx,cy)===SOLID||cellAt(cx,cy+dy)===SOLID)) continue;
          const v=away[gi(nx,ny)];
          if(v<0||v>=best) continue;
          best=v; bx=nx; by=ny;
        }
      }
      if(bx<0) break;                       // arrived, or nowhere left to go
      const tx=bx*CELL_W+CELL_W/2, ty=by*CELL_W+CELL_W/2;
      const vx=tx-player.x, vy=ty-player.y, m=Math.hypot(vx,vy)||1;
      moveEntity(player,(vx/m)*player.speed/60,(vy/m)*player.speed/60);
      updateEnemies(1/60);
      travelled+=Math.hypot(player.x-px,player.y-py);
      peak=Math.max(peak, run.awake||0);
    }
    out.peakAwake=peak;
    out.travelled=Math.round(travelled);
    out.endDist=Math.round(Math.hypot(player.x-sx0,player.y-sy0));

    return out;
  });

  // The walk above peaks well under the ceiling, so on its own it would pass
  // with the cap deleted: a real delve is spread out enough that ordinary
  // play never reaches 54. Pack a crowd by hand instead, where more bodies
  // are inside their own notice than the cap allows and the ceiling is the
  // only thing that can hold the number down.
  //
  // NOTE newBody() hands back a body already on its feet -- it is the
  // generator that puts them down -- so a probe that forgets to lay them out
  // dormant measures nothing at all and reads as a broken cap.
  const crowd = await p.evaluate(()=>{
    stash=blankStash();saveStash();startRun('isaac',LEVELS[24].id,'riven');
    run.banner=0; player.hp=player.maxHp=1e7; enemies.length=0;
    let n=0;
    for(const c of openCells){
      if(dist2(c.x,c.y,player.x,player.y) > 400*400) continue;
      const e=newBody('thrall',c.x,c.y,0);
      e.awake=false; e.alert=0;
      enemies.push(e);
      if(++n>=140) break;
    }
    const out={placed:n, cap:HORDE_LIVE};
    let peak=0;
    for(let i=0;i<600;i++){ updateEnemies(1/60); peak=Math.max(peak, run.awake||0); }
    out.peak=peak;
    out.inNotice=enemies.filter(e=>e.hp>0 &&
      noticeDist(e, Math.hypot(player.x-e.x, player.y-e.y)) < e.aggro).length;
    // And the escape hatch: over the cap, a body you actually hit still rises.
    const asleep=enemies.filter(e=>e.hp>0 && !e.awake);
    out.overCap = run.awake>=HORDE_LIVE && asleep.length>0;
    if(out.overCap){ damageEnemy(asleep[0],1); out.struckWoke=asleep[0].awake===true; }
    return out;
  });
  ck('the delve still holds more slag than its own gate asks for',
     cap.slagOnMap >= cap.quota,
     cap.slagOnMap+' on the map against a quota of '+cap.quota);
  ck('and it is still populated', cap.placed > 100, cap.placed+' bodies placed');
  // A walk that goes nowhere would meet nothing and pass the cap trivially,
  // so the walk itself has to be shown to have happened before its result
  // means anything.
  ck('the walk actually crosses the delve',
     cap.travelled > cap.farCells * 40 * 0.6 && cap.endDist > 500,
     cap.travelled+'px walked of '+(cap.farCells*40)+'px of path, ending '+cap.endDist+'px from the gate');
  ck('a walk down the delve never puts more than the cap on their feet',
     cap.peakAwake > 0 && cap.peakAwake <= cap.cap,
     'peak '+cap.peakAwake+' of '+cap.cap);
  // The walk above peaked under the ceiling, so on its own it would pass with
  // the cap deleted. Stand in the thick of them instead, where more bodies are
  // inside their own notice than the cap allows, and the ceiling is the only
  // thing that can be holding the number down.
  ck('and packed in tight, the ceiling is what holds the number down',
     crowd.peak <= crowd.cap && crowd.inNotice > crowd.cap,
     crowd.peak+' up at the peak of '+crowd.placed+' packed in, '+crowd.inNotice+
     ' of them inside their own notice');
  ck('but a body you actually hit gets up regardless',
     crowd.overCap && crowd.struckWoke,
     'or the cap could lock a delve\u2019s slag away behind bodies that never rouse');

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
