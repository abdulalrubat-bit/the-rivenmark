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
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:390,height:780}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.forge()); await sleep(800);

  await p.evaluate(()=>{
    window.requestAnimationFrame=()=>0;
    // Somewhere with room, so nothing under test is fighting a wall.
    window.clearGround = (pad) => {
      for (const c of openCells) if (!pointInWalls(c.x, c.y, pad || 90)) return c;
      return null;
    };
  });

  // ---- the ramp introduces them one at a time ----------------------------
  const ramp = await p.evaluate(()=>{
    const rows = LEVELS.slice(0,7).map(L=>L.horde.join(','));
    const deep = LEVELS[20].horde.slice().sort().join(',');
    const full = FULL_HORDE.slice().sort().join(',');
    return {rows, deep, full,
            huskFrom: LEVELS.findIndex(L=>L.horde.indexOf('husk')>=0),
            cantorFrom: LEVELS.findIndex(L=>L.horde.indexOf('cantor')>=0)};
  });
  ck('the husk is introduced on its own rung', ramp.huskFrom===3, 'delve '+ramp.huskFrom);
  ck('and the cantor on the next', ramp.cantorFrom===4, 'delve '+ramp.cantorFrom);
  // Pinned to FULL_HORDE rather than a literal, so adding an archetype is one
  // edit in the game and not a spurious failure here.
  ck('deep delves carry the whole roster',
     ramp.deep===ramp.full && ramp.full.split(',').length===8, ramp.deep);

  // ---- the husk ----------------------------------------------------------
  const husk = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[20].id, 'riven');
    const open=clearGround(120); player.x=open.x; player.y=open.y;
    const mk=(dx,dy)=>{ const e=newBody('husk', player.x+dx, player.y+dy, 0);
      e.awake=true; enemies.push(e); return e; };

    // it commits only once you are close
    enemies.length=0; slams.length=0;
    const far=mk(300,0);
    for(let i=0;i<40;i++) updateEnemies(1/60);
    const heldOff = far.fuse===0;
    // and it does commit when you are
    enemies.length=0; slams.length=0;
    const near=mk(HUSK_NEAR-14,0);
    updateEnemies(1/60);
    const lit = near.fuse>0;
    // The ground is marked the instant it commits, so the presence of a slam
    // no longer means it has gone off -- what matters is how long the marked
    // ground stands before it is taken, which is the time there is to leave.
    const marked = slams.length===1;
    let struckAt=-1;
    for(let i=0;i<120 && struckAt<0;i++){
      updateEnemies(1/60); updateSlams(1/60);
      if(slams.length && slams[0].struck) struckAt=i;
    }
    const fuseFrames = struckAt;
    const died = near.hp<=0;

    // killed at range it still comes apart -- and only once
    enemies.length=0; slams.length=0;
    const shot=mk(600,0);
    damageEnemy(shot, 9999);
    const oneSlam = slams.length===1;
    damageEnemy(shot, 9999);
    const stillOne = slams.length===1;

    // the blast reaches you when it is on you and not when it is not
    enemies.length=0; slams.length=0; player.invuln=0; player.hp=player.maxHp;
    const close=mk(24,0); damageEnemy(close, 9999);
    for(let i=0;i<80;i++) updateSlams(1/60);
    const hurtClose = player.hp < player.maxHp;
    player.hp=player.maxHp; player.invuln=0;
    enemies.length=0; slams.length=0;
    const away=mk(520,0); damageEnemy(away, 9999);
    for(let i=0;i<80;i++) updateSlams(1/60);
    const safeFar = player.hp === player.maxHp;
    return {heldOff, lit, marked, fuseFrames, died, oneSlam, stillOne, hurtClose, safeFar};
  });
  ck('a husk holds its fuse while you are away', husk.heldOff);
  ck('and lights it when you are close', husk.lit);
  ck('the ground is marked from the moment it commits', husk.marked);
  // 94 units of blast at a stride of 196/s needs about half a second to clear.
  ck('the marked ground stands long enough to leave',
     husk.fuseFrames >= 26, husk.fuseFrames+' frames of warning');
  ck('it dies to its own burst', husk.died);
  ck('broken at range it still comes apart', husk.oneSlam);
  ck('and only once, however many times it is hit', husk.stillOne);
  ck('the burst reaches you at your feet', husk.hurtClose);
  ck('and does not across the room', husk.safeFar);

  // ---- the cantor --------------------------------------------------------
  const cantor = await p.evaluate(()=>{
    enemies.length=0; bolts.length=0;
    const open=clearGround(150); player.x=open.x; player.y=open.y;
    const mk=(dx,dy)=>{ const e=newBody('cantor', player.x+dx, player.y+dy, 0);
      e.awake=true; e.cast=0; enemies.push(e); return e; };

    // too close: it gives ground
    const near=mk(70,0);
    const d0=Math.hypot(near.x-player.x, near.y-player.y);
    for(let i=0;i<70;i++) updateEnemies(1/60);
    const gaveGround = Math.hypot(near.x-player.x, near.y-player.y) > d0 + 20;

    // at range with a line: it casts, then a bolt exists
    enemies.length=0; bolts.length=0;
    const at=mk(200,0); at.cast=0;
    let cast=false, threw=false;
    for(let i=0;i<200 && !threw;i++){
      updateEnemies(1/60);
      if(at.casting>0) cast=true;
      if(bolts.length) threw=true;
    }
    // it does not throw through rock. Put the two of them on opposite sides
    // of a block thick enough that no line exists, rather than hunting for a
    // blocked cell near a player who is standing in the open on purpose --
    // that search found nothing and the check passed on its own default.
    enemies.length=0; bolts.length=0;
    // Not every cut happens to contain a block with clear floor on both
    // sides, so keep cutting until one does rather than reporting "no case
    // found" as if it were "the rule held".
    let w=null;
    for(let cut=0; cut<12 && !w; cut++){
      if(cut) startRun('isaac', LEVELS[10+cut].id, 'riven');
      for(let i=4;i<walls.length;i++){
        const q=walls[i];
        if(q.w<100||q.h<100||q.pit) continue;
        const py=q.y+q.h/2, px=q.x-40, ex=q.x+q.w+40;
        if(px<30||ex>WORLD.w-30) continue;
        if(pointInWalls(px,py,20)||pointInWalls(ex,py,16)) continue;
        if(clearShot(px,py,ex,py)) continue;      // must actually be blocked
        w={px,py,ex};
        break;
      }
    }
    enemies.length=0; bolts.length=0;
    let blind=null;
    if(w){
      player.x=w.px; player.y=w.py;
      const c=newBody('cantor', w.ex, w.py, 0);
      c.awake=true; c.cast=0; enemies.push(c);
      for(let i=0;i<240;i++) updateEnemies(1/60);
      blind = bolts.length===0;
    }
    return {gaveGround, cast, threw, blind, hadWalled:!!w};
  });
  ck('a cantor gives ground when you close', cantor.gaveGround);
  ck('it winds a cast up where you can see it', cantor.cast);
  ck('and throws', cantor.threw);
  // blind === null means the fixture never set up the case, which is a failure
  // of the check and not a pass: a search that finds nothing must not read as
  // evidence that the rule holds.
  ck('it will not throw through rock', cantor.blind === true,
     cantor.hadWalled ? 'blocked line held' : 'FIXTURE: no blocked pair found');

  // ---- bolts -------------------------------------------------------------
  const bolt = await p.evaluate(()=>{
    enemies.length=0; bolts.length=0; player.hp=player.maxHp; player.invuln=0;
    // Both ends have to be on real floor. clearGround only clears a radius
    // around the player, so a caster parked beyond it can be standing in rock
    // -- and then the bolt dies on its first substep and the check reads as
    // "a bolt does not hurt" when nothing was ever thrown across open ground.
    let open=null, ex=0;
    for(const c of openCells){
      if(pointInWalls(c.x,c.y,60)) continue;
      if(pointInWalls(c.x+170,c.y,20)) continue;
      if(!clearShot(c.x,c.y,c.x+170,c.y)) continue;
      open=c; ex=c.x+170; break;
    }
    if(!open) return {struck:null, why:'FIXTURE: no clear line found'};
    player.x=open.x; player.y=open.y;
    const e=newBody('cantor', ex, player.y, 0); e.awake=true; enemies.push(e);
    fireBolt(e);
    const born=bolts.length;
    let frames=0;
    for(let i=0;i<120 && bolts.length;i++){ updateBolts(1/60); frames=i; }
    const struck = player.hp < player.maxHp;
    const why = 'born '+born+' frames '+frames+' left '+bolts.length+
                ' invuln '+player.invuln.toFixed(2)+' hp '+Math.round(player.hp)+
                '/'+Math.round(player.maxHp);
    // one fired into a wall dies there rather than passing through
    bolts.length=0; player.hp=player.maxHp; player.invuln=0;
    let w=null;
    for(let i=4;i<walls.length;i++){ const q=walls[i];
      if(q.w>=140&&q.h>=140&&q.x>80&&q.y>80){ w=q; break; } }
    let stopped=false;
    if(w){
      bolts.push({x:w.x-40,y:w.y+w.h/2,dx:1,dy:0,dmg:5,colour:'#48d0c0',
                  life:3,spin:0,dead:false});
      for(let i=0;i<60 && bolts.length;i++) updateBolts(1/60);
      stopped = bolts.length===0;
    }
    // and a bolt into open air expires rather than living forever
    bolts.length=0;
    bolts.push({x:player.x,y:player.y-600,dx:0,dy:-1,dmg:5,colour:'#48d0c0',
                life:BOLT_RANGE/BOLT_SPEED,spin:0,dead:false});
    for(let i=0;i<200 && bolts.length;i++) updateBolts(1/60);
    const expired = bolts.length===0;
    // the cap holds
    bolts.length=0;
    for(let i=0;i<200;i++) fireBolt(e);
    const capped = bolts.length<=MAX_BOLTS;
    return {struck, stopped, expired, capped, hadWall:!!w, why};
  });
  ck('a bolt that reaches you hurts', bolt.struck === true, bolt.why);
  ck('rock stops one', bolt.stopped, bolt.hadWall?'':'no big wall found');
  ck('and one that hits nothing expires', bolt.expired);
  ck('the bolt count is capped', bolt.capped);

  // ---- coffers -----------------------------------------------------------
  const chest = await p.evaluate(()=>{
    let inRock=0, tooNear=0, tot=0, warded=0, tooClose=0, minN=99, maxN=0;
    for(let lv=0; lv<24; lv++){
      startRun('isaac', LEVELS[lv].id, 'riven');
      tot+=chests.length; minN=Math.min(minN,chests.length); maxN=Math.max(maxN,chests.length);
      warded+=chests.filter(c=>c.kind==='warded').length;
      for(let i=0;i<chests.length;i++){
        const c=chests[i];
        if(pointInWalls(c.x,c.y,20)) inRock++;
        if(Math.hypot(c.x-player.x,c.y-player.y)<CHEST_SAFE-1) tooNear++;
        for(let k=i+1;k<chests.length;k++)
          if(Math.hypot(c.x-chests[k].x,c.y-chests[k].y)<CHEST_APART-1) tooClose++;
      }
    }
    return {tot, per:+(tot/24).toFixed(1), warded, inRock, tooNear, tooClose, minN, maxN};
  });
  ck('every delve carries coffers', chest.minN>=3, chest.minN+'..'+chest.maxN+
     ', '+chest.per+' on average');
  ck('none of them is in rock', chest.inRock===0, chest.inRock+' of '+chest.tot);
  ck('none is inside the spawn pocket', chest.tooNear===0);
  ck('and they are kept apart', chest.tooClose===0);
  ck('some delves carry a warded one', chest.warded>0 && chest.warded<chest.tot,
     chest.warded+' of '+chest.tot);

  const opened = await p.evaluate(()=>{
    startRun('isaac', LEVELS[18].id, 'riven');
    const c=chests[0];
    const coin0=run.coins, drops0=drops.length;
    // walking onto it opens it
    player.x=c.x; player.y=c.y;
    updateChests(1/60);
    const isOpen=c.open, paid=run.coins>coin0;
    // the lid comes up over four frames rather than snapping
    const frames=new Set();
    for(let i=0;i<60;i++){
      updateChests(1/60);
      frames.add(Math.min(CHEST_FRAMES-1,
        Math.floor((c.t||0)/CHEST_OPEN*CHEST_FRAMES)));
    }
    const played=frames.size;
    const coin1=run.coins;
    for(let i=0;i<10;i++) updateChests(1/60);
    const onlyOnce = run.coins===coin1;
    // a warded one always carries gear
    let gearRuns=0, coffRuns=0, gearHits=0, coffHits=0;
    for(let t=0;t<40;t++){
      const w={x:player.x,y:player.y,kind:'warded',open:false,q:0,pulse:0};
      const d0=drops.length; openChest(w); if(drops.length>d0) gearHits++; gearRuns++;
      const k={x:player.x,y:player.y,kind:'coffer',open:false,q:0,pulse:0};
      const d1=drops.length; openChest(k); if(drops.length>d1) coffHits++; coffRuns++;
    }
    return {isOpen, paid, onlyOnce, played, want:CHEST_FRAMES, warded:gearHits+'/'+gearRuns,
            coffer:coffHits+'/'+coffRuns,
            wardedAlways:gearHits===gearRuns, cofferSometimes:coffHits>0&&coffHits<coffRuns};
  });
  // The art has to actually arrive, and the fallback has to actually work --
  // the sheet decodes asynchronously and a coffer you walk onto before it
  // lands must still be a coffer rather than nothing.
  const art = await p.evaluate(async ()=>{
    const img = new Image();
    await new Promise(r => { img.onload = img.onerror = r; img.src = CHEST_SHEET; });
    const rows = Object.keys(CHEST_ROW).length;
    return { embedded: /^data:image\/png;base64,/.test(CHEST_SHEET),
             decoded: img.naturalWidth > 0,
             w: img.naturalWidth, h: img.naturalHeight,
             fitsFrames: img.naturalWidth === CHEST_C * CHEST_FRAMES,
             fitsRows: img.naturalHeight === CHEST_C * rows,
             forged: Object.keys(CHEST_KINDS).every(k =>
               SPR['ch_'+k] && SPR['ch_'+k+'_open']) };
  });
  ck('the coffer sheet travels inside the page', art.embedded);
  ck('and decodes to the frames the code asks for',
     art.decoded && art.fitsFrames && art.fitsRows,
     art.w+'x'+art.h);
  ck('a forged coffer still stands in until it lands', art.forged);

  ck('walking onto a coffer opens it', opened.isOpen);
  ck('and it pays', opened.paid);
  ck('the lid comes up over its frames', opened.played===opened.want,
     opened.played+' of '+opened.want+' frames drawn');
  ck('but only the once', opened.onlyOnce);
  ck('a warded one always carries a piece', opened.wardedAlways, opened.warded);
  ck('a plain one sometimes does', opened.cofferSometimes, opened.coffer);

  // ---- both new kinds actually turn up in a real delve --------------------
  const seen = await p.evaluate(()=>{
    const found={};
    for(let lv=6; lv<20; lv++){
      startRun('isaac', LEVELS[lv].id, 'riven');
      for(const e of enemies) found[e.kind]=(found[e.kind]||0)+1;
    }
    return found;
  });
  ck('husks are seeded onto the map', (seen.husk||0)>0, (seen.husk||0)+' over 14 delves');
  ck('cantors are seeded onto the map', (seen.cantor||0)>0, (seen.cantor||0)+' over 14 delves');

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
