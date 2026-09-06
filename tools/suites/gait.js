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
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(800);

  // Every pose named by the frame pickers must actually exist in the atlas.
  const atlas = await p.evaluate(()=>{
    const miss=[];
    for (const hid in HEROES){
      if(!SPR['h_'+hid]) miss.push('h_'+hid);
      for(let i=0;i<GAIT_N;i++){
        if(!SPR['h_'+hid+'w'+i]) miss.push('h_'+hid+'w'+i);
        if(!SPR['h_'+hid+'r'+i]) miss.push('h_'+hid+'r'+i);
      }
    }
    // Kinds with no run cycle, and why each one has none: the Deceiver and his
    // mirages blink rather than walk, and anything anchored cannot walk at
    // all. Every one of them still needs its REST pose, which is the frame
    // they are actually drawn in, so that check stays above the skip.
    const still = [];
    for (const k in ENEMY_TYPES){
      if(!SPR[k]) miss.push(k);
      if(k==='deceiver'||k==='mirage'||ENEMY_TYPES[k].anchored){ still.push(k); continue; }
      for(let i=0;i<GAIT_N;i++) if(!SPR[k+'r'+i]) miss.push(k+'r'+i);
    }
    // And the other half of it: a kind excused a run cycle must not have one
    // forged anyway, or the excuse is costing the atlas without saving it.
    const wasted = still.filter(k => SPR[k+'r0']);
    let bytes=0;
    for(const k in SPR){const c=SPR[k]; if(c&&c.width) bytes+=c.width*c.height*4;}
    return {miss, wasted, still, MB:+(bytes/1048576).toFixed(2), n:GAIT_N};
  });
  ck('every gait pose is forged', atlas.miss.length===0, atlas.miss.slice(0,4).join(','));
  ck('and nothing that cannot walk carries one', atlas.wasted.length===0,
     atlas.wasted.length ? atlas.wasted.join(',') + ' have run cycles they can never draw'
       : 'no run cycle for ' + atlas.still.join(', '));
  ck('the whole atlas stays under 12MB', atlas.MB<12, atlas.MB+'MB');

  // Poses must be distinct. Six samples of a sine repeat in pairs, which is
  // how the first cycle came out as four poses shown twice.
  const distinct = await p.evaluate(()=>{
    const sig=s=>{const c=newCanvas(s.width,s.height);const g=c.getContext('2d');
      g.drawImage(s,0,0);const d=g.getImageData(0,0,s.width,s.height).data;
      let h=0; for(let i=3;i<d.length;i+=4) h=(h*31+d[i])|0; return h;};
    const out={};
    for(const set of ['thrallr','breakerr','h_isaacr','h_isaacw']){
      const seen=new Set();
      for(let i=0;i<GAIT_N;i++) seen.add(sig(SPR[set+i]));
      out[set]=seen.size;
    }
    return out;
  });
  for (const k in distinct)
    ck(k+': all '+atlas.n+' poses differ', distinct[k]===atlas.n, distinct[k]+' distinct');

  // Walking must actually play, and it must play off ground covered.
  const walk = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[6].id, 'riven');
    window.requestAnimationFrame=()=>0;
    let open=null;
    for(const c of openCells){ if(!pointInWalls(c.x,c.y,60)){open=c;break;} }
    player.x=open.x; player.y=open.y; player.gait=0; player.pace=0;
    const rev=new Map(); for(const k in SPR) if(!rev.has(SPR[k])) rev.set(SPR[k],k);
    const seen=new Set();
    // full push: a run. He accelerates from a stand, so the first strides are
    // legitimately a walk -- only what he settles into is asserted on.
    // He paces back and forth: run him one way until the rock stops him and
    // he turns round, so the sample is of a body in motion rather than of one
    // that jammed on a wall forty frames in and coasted to a stand.
    stick.active=true; stick.dx=1; stick.dy=0; stick.mag=1;
    for(let i=0;i<400;i++){
      const bx=player.x, by=player.y;
      updatePlayer(1/60);
      if (Math.hypot(player.x-bx, player.y-by) < 0.4) { stick.dx = -stick.dx; }
      if (i>60) seen.add(rev.get(heroFrame(player)));
    }
    const ranFrames=[...seen].filter(k=>k.indexOf('h_isaacr')===0).length;
    const walkedFrames=[...seen].filter(k=>k.indexOf('h_isaacw')===0).length;
    return {ranFrames, walkedFrames, pace:+player.pace.toFixed(2)};
  });
  ck('a full push plays the run cycle', walk.ranFrames===atlas.n,
     walk.ranFrames+' of '+atlas.n+' run poses, pace '+walk.pace);
  ck('and settles out of the walk cycle', walk.walkedFrames===0,
     walk.walkedFrames+' walk poses once up to speed');

  const amble = await p.evaluate(()=>{
    let open=null;
    for(const c of openCells){ if(!pointInWalls(c.x,c.y,60)){open=c;break;} }
    player.x=open.x; player.y=open.y; player.gait=0; player.pace=0;
    stick.active=true; stick.dx=1; stick.dy=0; stick.mag=0.35;
    const rev=new Map(); for(const k in SPR) if(!rev.has(SPR[k])) rev.set(SPR[k],k);
    const seen=new Set();
    for(let i=0;i<500;i++){
      const bx=player.x, by=player.y;
      updatePlayer(1/60);
      if (Math.hypot(player.x-bx, player.y-by) < 0.2) { stick.dx = -stick.dx; }
      if (i>60) seen.add(rev.get(heroFrame(player))); }
    return {w:[...seen].filter(k=>k.indexOf('h_isaacw')===0).length,
            r:[...seen].filter(k=>k.indexOf('h_isaacr')===0).length,
            pace:+player.pace.toFixed(2)};
  });
  ck('easing the stick over plays the walk cycle', amble.w===atlas.n,
     amble.w+' of '+atlas.n+' walk poses, pace '+amble.pace);
  ck('and never the run cycle', amble.r===0, amble.r+' run poses');

  // Standing still, and walking into rock, are the same thing: no stride.
  const still = await p.evaluate(()=>{
    stick.active=false; stick.mag=0;
    for(let i=0;i<90;i++) updatePlayer(1/60);
    const standing = heroFrame(player)===SPR['h_'+player.hero];
    // now shove him into a wall at full push and hold there
    let w=null;
    for(let i=4;i<walls.length;i++){ const q=walls[i];
      if(q.w>=120&&q.h>=120&&q.x>60&&!pointInWalls(q.x-player.r-2,q.y+q.h/2,player.r)){w=q;break;} }
    if(!w) return {standing, jammed:null};
    player.x=w.x-player.r-1; player.y=w.y+w.h/2;
    player.gait=0; player.pace=0;
    stick.active=true; stick.dx=1; stick.dy=0; stick.mag=1;
    for(let i=0;i<20;i++) updatePlayer(1/60);   // let pace spin up on contact
    const g0=player.gait;
    for(let i=0;i<120;i++) updatePlayer(1/60);
    stick.active=false; stick.mag=0;
    return {standing, jammed:+(player.gait-g0).toFixed(1)};
  });
  ck('standing still wears the standing pose', still.standing);
  ck('and a body held against rock does not stride on the spot',
     still.jammed !== null && still.jammed < 4, still.jammed+' units of stride');

  // Enemies: dormant is still, woken is running.
  const foe = await p.evaluate(()=>{
    enemies.length=0;
    let c=openCells[(Math.random()*openCells.length)|0];
    for(let i=0;i<400&&pointInWalls(c.x,c.y,25);i++)c=openCells[(Math.random()*openCells.length)|0];
    const e=newBody('thrall',c.x,c.y,0); e.awake=false; e.pace=0; enemies.push(e);
    // The furthest open cell there is, not a fixed offset: +900 from a body
    // near an edge can land somewhere that rouses it, and then the body is
    // correctly walking and the check reads as the pose being wrong.
    let far=c, fd=0;
    for(const q of openCells){
      const d=Math.hypot(q.x-c.x, q.y-c.y);
      if(d>fd && !pointInWalls(q.x,q.y,20)){ fd=d; far=q; }
    }
    player.x=far.x; player.y=far.y;
    for(let i=0;i<60;i++) updateEnemies(1/60);
    const stillAsleep = !e.awake;
    const dormant = stillAsleep && bodyFrame(e)===SPR.thrall;
    // Keep it chasing: whenever it closes, the player is moved to another
    // cell that has actually been checked for clearance. Shoving the player a
    // fixed distance sideways parks them in rock, the body jams on the wall,
    // and then it correctly refuses to stride -- which reads as this test
    // failing when it is the fixture that broke.
    const clear = () => {
      for (let t=0;t<400;t++){
        const q=openCells[(Math.random()*openCells.length)|0];
        if (!pointInWalls(q.x,q.y,30) && Math.hypot(q.x-e.x,q.y-e.y)>300) return q;
      }
      return null;
    };
    e.awake=true;
    const rev=new Map(); for(const k in SPR) if(!rev.has(SPR[k])) rev.set(SPR[k],k);
    const seen=new Set();
    const want=GAIT_STEP*GAIT_N*2.5;
    const g0=e.gait;
    let moves=0;
    for(let i=0;i<3000 && e.gait-g0<want;i++){
      if(Math.hypot(e.x-player.x,e.y-player.y)<220){
        const q=clear(); if(!q) break;
        player.x=q.x; player.y=q.y; moves++;
      }
      updateEnemies(1/60);
      seen.add(rev.get(bodyFrame(e)));
    }
    return {dormant, stillAsleep, farBy:Math.round(fd), travelled:Math.round(e.gait-g0), want:Math.round(want), moves,
            frames:[...seen].filter(k=>k&&k.indexOf('thrallr')===0).length};
  });
  ck('a dormant body wears the standing pose', foe.dormant,
     foe.stillAsleep ? foe.farBy+' units away' : 'FIXTURE: it woke up');
  ck('a woken one runs through its cycle', foe.frames===atlas.n,
     foe.frames+' of '+atlas.n+' poses over '+foe.travelled+' units');

  // The hit flash is an additive pass now, not a second sprite.
  const flash = await p.evaluate(()=>{
    const before=errs=>0;
    enemies.length=0;
    const e=newBody('breaker',player.x+70,player.y,0); e.awake=true; e.hitFlash=0.2;
    enemies.push(e);
    player.hitFlash=0.2;
    draw(2);
    return ctx.globalCompositeOperation==='source-over' && ctx.globalAlpha===1;
  });
  ck('drawing a struck body leaves the context clean', flash);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
