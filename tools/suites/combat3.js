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
  const errs=[];

  // ---- the gear screen must be reachable at every phone size --------------
  // Flex children default to shrinkable, so a screen taller than the viewport
  // squeezed each row under its own content: the item card kept its 96px floor
  // while 200px of text carried on past the border and put Equip underneath
  // the Back button, outside the flow where scrolling could not reach it.
  for (const [w,h] of [[430,932],[412,846],[390,780],[360,720],[320,568]]) {
    const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();
    p.on('pageerror',e=>errs.push(e.message));
    await p.goto(PAGE('index.html')); await sleep(600);
    const r=await p.evaluate(()=>{
      stash=blankStash();
      stash.vault=[{uid:1,slot:'ring1',base:'Signet',rarity:'hallowed',
        affixes:[{id:'zaydReach',v:0.10},{id:'isaacWard',v:0.0395273706},
                 {id:'cadence',v:-0.04},{id:'damageP',v:0.16}],
        name:'Glaive-Cut Signet'}];
      for(let i=0;i<12;i++) stash.vault.push(rollItem(0.95,['ring1','offhand','mail','boots'][i%4]));
      saveStash(); openGear('stash');
      document.querySelectorAll('#bagGrid .cellbtn')[0].click();
      const g=document.getElementById('gear');
      const det=document.getElementById('gearDetail');
      const acts=det.querySelector('.gear-acts');
      const equip=acts?acts.querySelector('button'):null;
      const close=document.getElementById('gearClose');
      const dr=det.getBoundingClientRect();
      const ar=acts?acts.getBoundingClientRect():null;
      const cr=close.getBoundingClientRect();
      // scroll all the way down, the way a player would, then ask whether the
      // Equip button is actually on screen and actually on top
      g.scrollTop = g.scrollHeight;
      const ar2 = acts?acts.getBoundingClientRect():null;
      let onTop=false;
      if (ar2) {
        const hit=document.elementFromPoint((ar2.left+ar2.right)/2, (ar2.top+ar2.bottom)/2);
        onTop = !!(hit && equip && (hit===equip || equip.contains(hit) || hit.contains(equip)));
      }
      return { spills: det.scrollHeight > Math.round(dr.height)+1,
               actsInsideCard: ar ? ar.bottom <= dr.bottom+1 : false,
               // Not "above it" -- "not on top of it". The close control was a
               // full-width slab under the card and is a corner boss at the
               // top of the screen now, so an ordering test only ever
               // measured where it happened to be that month.
               clearsClose: ar ? (ar.right <= cr.left || ar.left >= cr.right ||
                                  ar.bottom <= cr.top || ar.top >= cr.bottom) : false,
               canScroll: g.scrollHeight > g.clientHeight - 1,
               equipVisible: ar2 ? (ar2.top >= 0 && ar2.bottom <= innerHeight) : false,
               equipOnTop: onTop };
    });
    const tag=w+'x'+h;
    ck(tag+': the item card holds its own content', !r.spills);
    ck(tag+': Equip stays inside the card', r.actsInsideCard);
    ck(tag+': and does not collide with the close control', r.clearsClose);
    ck(tag+': scrolled to the bottom, Equip is on screen', r.equipVisible);
    ck(tag+': and nothing is covering it', r.equipOnTop);
    await p.close();
  }

  const p=await (await b.newContext({viewport:{width:390,height:780},deviceScaleFactor:2})).newPage();
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(700);

  // ---- affixes read as numbers a person would write ----------------------
  const af = await p.evaluate(()=>{
    const bad=[];
    for(let i=0;i<6000;i++){
      const it=rollItem(Math.random(),
        ['blade','offhand','mail','girdle','boots','amulet','ring1','ring2'][i%8]);
      for(const a of it.affixes){
        for(const hero of ['isaac','zayd']){
          const t=affixText(a,hero);
          if(/\d\.\d{3,}/.test(t)) bad.push(t);
        }
      }
    }
    // and both ward affixes specifically, since the synergy one is not `ward`
    const w1=affixText({id:'ward',v:0.0612345},'isaac');
    const w2=affixText({id:'isaacWard',v:0.0395273706},'isaac');
    return {bad:bad.slice(0,3), n:bad.length, w1, w2};
  });
  ck('no affix prints a raw float', af.n===0, af.n+' of 6000 rolls, e.g. '+af.bad[0]);
  ck('both ward affixes read as a percentage',
     /^\d+% harm turned/.test(af.w1) && /^\d+% harm turned/.test(af.w2),
     af.w1+' | '+af.w2);

  // ---- floating combat text ---------------------------------------------
  const fl = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[14].id, 'riven');
    window.requestAnimationFrame=()=>0;
    lowFx=false;
    floaters.length=0;
    floatDmg(100,100,10,'hit'); floatDmg(104,102,15,'hit');   // same spot, at once
    const merged = floaters.length===1 && floaters[0].n===25;
    floaters.length=0;
    floatDmg(100,100,10,'hit');
    for(let i=0;i<40;i++) updateFloaters(1/60);               // past the merge window
    floatDmg(100,100,10,'hit');
    const separate = floaters.length===2;
    floaters.length=0;
    for(let i=0;i<80;i++) floatDmg(i*40, 100, 5, 'hit');      // flood it
    const capped = floaters.length<=MAX_FLOATERS;
    floaters.length=0;
    // one rises and fades rather than sitting still
    floatDmg(300,300,12,'hit');
    const f0=floaters[0], y0=f0.y;
    for(let i=0;i<20;i++) updateFloaters(1/60);
    const rose = f0.y < y0 - 10;
    for(let i=0;i<80;i++) updateFloaters(1/60);
    const gone = floaters.length===0;
    // and lowFx does NOT skip them. It used to, and that was invisible for as
    // long as nothing set the flag; the Phaser build's frame governor sets it
    // for real, and the first thing it did on a slow device was take every
    // damage number off the screen -- on exactly the device that needed them
    // most. A number is information, not decoration, and it costs almost
    // nothing: they are capped at MAX_FLOATERS and merged on the way in.
    lowFx=true; floaters.length=0; floatDmg(1,1,9,'hit'); floatWord(2,2,'X','tether');
    const kept = floaters.length===2; lowFx=false;
    return {merged, separate, capped, rose, gone, kept};
  });
  ck('two hits in the same instant merge into one number', fl.merged);
  ck('and two a moment apart do not', fl.separate);
  ck('a flood is capped', fl.capped, 'cap holds');
  ck('a number rises off the body', fl.rose);
  ck('and clears itself', fl.gone);
  ck('and lowFx does not take them away', fl.kept,
     'the mood sheds under lowFx; the readout does not');

  // A soaked hit has to be legible as soaked, or the player keeps hitting the
  // wrong thing and is told nothing.
  const soak = await p.evaluate(()=>{
    enemies.length=0; floaters.length=0;
    const a=newBody('breaker', player.x+60, player.y, 0);
    a.awake=true; a.braced=true; enemies.push(a);
    damageEnemy(a, 100);
    const braced = floaters.length===1 && floaters[0].kind==='soaked';
    floaters.length=0;
    const b2=newBody('thrall', player.x+60, player.y, 0); b2.awake=true; enemies.push(b2);
    damageEnemy(b2, b2.maxHp*0.9);
    const heavy = floaters.length===1 && floaters[0].kind==='heavy';
    floaters.length=0;
    damageEnemy(b2, 1);
    const light = floaters.length===1 && floaters[0].kind==='hit';
    return {braced, heavy, light};
  });
  ck('a braced guard shows the hit as soaked', soak.braced);
  ck('a hit worth a third of the body reads heavy', soak.heavy);
  ck('an ordinary one does not', soak.light);

  // ---- the boss frame ----------------------------------------------------
  const bar = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[22].id, 'riven');
    window.requestAnimationFrame=()=>0; run.banner=0;
    const noBoss = bossBarDrop()===0;
    spawnBoss();
    const bs=run.boss; bs.hp=bs.maxHp*0.55;
    bs.x=player.x+80; bs.y=player.y;
    const drops = bossBarDrop()>0;
    // where the frame actually lands
    const pad=12, x0=pad, w=view.w-x0-pad-view.safeR, y0=HUD_H+view.safeT+8;
    const finite = [x0,w,y0].every(v=>isFinite(v)) && w>120;
    const clearsHud = y0 >= HUD_H + view.safeT;
    // the name is fitted, not clipped by the canvas edge
    const t = bs.title || '';
    const shown = fitText(t, w-90, 14, 'Georgia, serif', 10);
    const fits = ctx.measureText(shown).width <= w-90;
    const held = escortAlive();
    return {noBoss, drops, finite, clearsHud, fits, shown, title:t, held,
            w:Math.round(w), y0:Math.round(y0), hud:HUD_H+view.safeT};
  });
  ck('no boss, no frame and no gap', bar.noBoss);
  ck('a boss raises the frame', bar.drops);
  ck('its geometry is finite and wide enough', bar.finite, bar.w+'px wide');
  ck('it clears the HUD panel', bar.clearsHud, 'y '+bar.y0+' vs hud '+bar.hud);
  ck('a long title is fitted to the frame', bar.fits, bar.shown);
  ck('the escort is standing, so the bar reads held', bar.held);

  // The minimap must step out of the frame's way rather than sit under it.
  const mm = await p.evaluate(()=>{
    const S=Math.round(Math.min(132,Math.max(96,view.w*0.30)));
    const y=HUD_H+14+view.safeT+bossBarDrop();
    const barBottom=HUD_H+view.safeT+8+BOSS_BAR_H;
    return {mapTop:y, barBottom, clear:y>=barBottom};
  });
  ck('and the minimap sits below it', mm.clear, 'map '+mm.mapTop+' vs bar '+mm.barBottom);

  // ---- strikes -----------------------------------------------------------
  const st = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[8].id, 'riven');
    window.requestAnimationFrame=()=>0;
    enemies.length=0;
    // Stand somewhere with room, or clearShot rejects the dummy through rock
    // and fire() correctly declines to swing at a wall.
    let open=null;
    for(const c of openCells){ if(!pointInWalls(c.x,c.y,90)){open=c;break;} }
    player.x=open.x; player.y=open.y;
    const seen=[]; const dmgs=[];
    for(let k=0;k<9;k++){
      const e=newBody('thrall', player.x+50, player.y, 0);
      e.awake=true; e.hp=1e9; e.maxHp=1e9; enemies.push(e);
      // fire() reads the spatial hash, and only updateEnemies rebuilds it.
      enemyGrid.clear(); enemyGrid.insert(e, e.x, e.y);
      player.fireTimer=0; arcs.length=0;
      const ok=fire();
      if(!ok) return {err:'fire() found no target'};
      seen.push(STRIKES[player.strike].id);
      dmgs.push(arcs.map(a=>[a.dmg,a.half,a.bow,a.band].join(':')).join('|'));
      enemies.length=0;
    }
    return {seen, forms:[...new Set(seen)].length,
            cycles: seen.slice(0,3).join(',')===seen.slice(3,6).join(',') &&
                    seen.slice(3,6).join(',')===seen.slice(6,9).join(','),
            sameHit: [...new Set(dmgs)].length===1};
  });
  ck('every strike form is used', !st.err && st.forms===3, st.err||st.seen.join(' '));
  ck('and they cycle in order', st.cycles);
  ck('the form changes nothing about the hit', st.sameHit,
     'damage, sweep, bow and band identical across all three');

  // The weapon is its own sprite, and it knows how far its edge is.
  const wp = await p.evaluate(()=>{
    const out={};
    for(const h in HEROES){
      const s=SPR['w_'+h];
      out[h]= !!s && isFinite(s.reach) && s.reach>20;
    }
    return out;
  });
  for(const h in wp) ck(h+' carries a forged weapon with a reach', wp[h]);

  // Swinging then recovering leaves the blade back at the guard.
  const rec = await p.evaluate(()=>{
    player.swing=SWING_TIME; player.recov=0; player.strike=0;
    let sawSwing=false;
    for(let i=0;i<12;i++){ updatePlayer(1/60); if(player.swing>0) sawSwing=true; }
    const recovering = player.recov>0;
    for(let i=0;i<20;i++) updatePlayer(1/60);
    return {sawSwing, recovering, settled: player.swing===0 && player.recov===0};
  });
  ck('the swing runs, then recovers, then settles',
     rec.sawSwing && rec.recovering && rec.settled);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
