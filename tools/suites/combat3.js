/* Run through tools/run-suites.js, or alone with node. Which page it drives --
 * the core, the game or the forge -- is in ./_pages.js. */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const errs=[];

  // ---- the Forge must be usable at every phone size -----------------------
  // Measured on the canvas build's gear screen until it went: a card that did
  // not hold its content put Equip under the Back button, out of reach. The
  // same promise asked of the Forge that ships -- with a long, four-affix
  // piece and a vault too long for one screen, every row fits the card, and
  // scrolled to the bottom the last piece is on screen and nothing covers it.
  for (const [w,h] of [[430,932],[412,846],[390,780],[360,720],[320,568]]) {
    const g=await (await b.newContext({viewport:{width:w,height:h}})).newPage();
    g.on('pageerror',e=>errs.push(e.message));
    await g.goto(pages.game('norun'));
    await g.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
    await g.evaluate(()=>{ localStorage.clear(); stash=blankStash();
      stash.vault=[{uid:1,slot:'ring1',base:'Signet',rarity:'hallowed',
        affixes:[{id:'zaydReach',v:0.10},{id:'isaacWard',v:0.0395273706},
                 {id:'cadence',v:-0.04},{id:'damageP',v:0.16}],
        name:'Glaive-Cut Signet'}];
      for(let i=0;i<12;i++) stash.vault.push(rollItem(0.95,['ring1','offhand','mail','boots'][i%4]));
      itemSeq=100; saveStash(); });
    await g.goto(pages.game());
    await g.waitForSelector('#screens.up #descend', {timeout:30000});
    await g.click('#screens [data-tab="gear"]'); await sleep(250);
    const r=await g.evaluate(()=>{
      const card=document.querySelector('#screens .card').getBoundingClientRect();
      const rows=[...document.querySelectorAll('#screens [data-on]')];
      const spills=rows.filter(b=>b.scrollWidth>b.clientWidth+1||
                                   b.getBoundingClientRect().right>card.right+1).length;
      const last=rows[rows.length-1];
      last.scrollIntoView({block:'end'});
      const lr=last.getBoundingClientRect();
      const hit=document.elementFromPoint((lr.left+lr.right)/2,(lr.top+lr.bottom)/2);
      return { n:rows.length, spills, fits: card.width<=innerWidth,
               onScreen: lr.top>=0 && lr.bottom<=innerHeight+1,
               onTop: !!hit && (hit===last || last.contains(hit)) };
    });
    const tag=w+'x'+h;
    ck(tag+': the Forge card fits the screen', r.fits);
    ck(tag+': every piece fits its row', r.n===13 && r.spills===0, r.spills+' of '+r.n+' spill');
    ck(tag+': scrolled to the bottom, the last piece is on screen', r.onScreen);
    ck(tag+': and nothing is covering it', r.onTop);
    await g.close();
  }

  const p=await (await b.newContext({viewport:{width:390,height:780},deviceScaleFactor:2})).newPage();
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core()); await sleep(700);

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
  // The canvas build drew the frame and fitted the title with the canvas's
  // own text measure; the Phaser HUD's frame is DOM (#hud .boss) and the map
  // is the overlay's. Asked of those.
  const gb=await (await b.newContext({viewport:{width:390,height:780}})).newPage();
  gb.on('pageerror',e=>errs.push(e.message));
  await gb.goto(pages.game('nogate&nogov'));
  await gb.waitForFunction(()=>state==='play' && document.querySelector('#hud .boss'),
                           null, {timeout:30000});
  const bar = await gb.evaluate(async ()=>{
    const sc=__game.scene.getScene('delve');
    sc.newRun('isaac', LEVELS[22].id, 'riven'); run.banner=0;
    player.hp=player.maxHp=1e9;
    const frame=()=>new Promise(r=>setTimeout(r,250));
    await frame();
    const boss=document.querySelector('#hud .boss');
    const noBoss = boss.hidden;
    spawnBoss();
    const bs=run.boss; bs.hp=bs.maxHp*0.55; bs.x=player.x+80; bs.y=player.y;
    await frame();
    const br=boss.getBoundingClientRect();
    const top=document.querySelector('#hud .top').getBoundingClientRect();
    const name=boss.querySelector('.name');
    const m=minimapBox();
    return { noBoss, drops: !boss.hidden, w:Math.round(br.width),
             finite: [br.left,br.width,br.top].every(isFinite) && br.width>120,
             clearsHud: br.top >= top.bottom - 1, y0:Math.round(br.top), hud:Math.round(top.bottom),
             fits: name.scrollWidth <= name.clientWidth + 1, shown: name.textContent,
             held: escortAlive() && !boss.querySelector('.held').hidden,
             mapTop: Math.round(m.y - m.over), barBottom: Math.round(br.bottom) };
  });
  ck('no boss, no frame and no gap', bar.noBoss);
  ck('a boss raises the frame', bar.drops);
  ck('its geometry is finite and wide enough', bar.finite, bar.w+'px wide');
  ck('it clears the HUD panel', bar.clearsHud, 'y '+bar.y0+' vs hud '+bar.hud);
  ck('a long title is fitted to the frame', bar.fits, bar.shown);
  ck('the escort is standing, so the bar reads held', bar.held);
  // The minimap must step out of the frame's way rather than sit under it.
  ck('and the minimap sits below it', bar.mapTop >= bar.barBottom,
     'map '+bar.mapTop+' vs bar '+bar.barBottom);
  await gb.close();

  // ---- strikes -----------------------------------------------------------
  const st = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[8].id, 'riven');
    window.requestAnimationFrame=()=>0;
    enemies.length=0;
    // Stand somewhere with room, or clearShot rejects the dummy through rock
    // and the blade correctly declines to swing at a wall.
    let open=null;
    for(const c of openCells){ if(!pointInWalls(c.x,c.y,90)){open=c;break;} }
    player.x=open.x; player.y=open.y;
    const seen=[]; const dmgs=[];
    for(let k=0;k<9;k++){
      const e=newBody('thrall', player.x+50, player.y, 0);
      e.awake=true; e.hp=1e9; e.maxHp=1e9; enemies.push(e);
      // The blade's target search reads the spatial hash, and only
      // updateEnemies rebuilds it.
      enemyGrid.clear(); enemyGrid.insert(e, e.x, e.y);
      player.fireTimer=0; arcs.length=0;
      /* THE CHAIN, RESET. What is being measured here is whether the STRIKE
       * FORM -- which pose the blade comes round in, cycled every swing --
       * changes the blow. It must not. The chain is a different mechanism
       * and it does change the blow: every third tap is a finisher and comes
       * round a fifth wider, so leaving the chain running made three of these
       * nine swings legitimately different and the check read that as the
       * form leaking into the damage. */
      player.combo=0; player.comboT=0;
      /* A TAP, not fire(). There is no fire() any more -- the automatic blade
       * was cut, and this suite was the last thing calling it, which is why
       * it came back "the suite did not report" rather than as a failure.
       * A tap goes through aimAngle to the same nearestFoe, so the strike it
       * measures is the same strike. */
      conduitPress(); conduitRelease();
      if(!arcs.length) return {err:'a tap found no target'};
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

  // The weapon is its own sprite, and it knows how far its edge is -- asked
  // of the forge, which paints it.
  const fp=await (await b.newContext({viewport:{width:390,height:780}})).newPage();
  fp.on('pageerror',e=>errs.push(e.message));
  await fp.goto(pages.forge()); await sleep(600);
  const wp = await fp.evaluate(()=>{
    const out={};
    for(const h in HEROES){
      const s=SPR['w_'+h];
      out[h]= !!s && isFinite(s.reach) && s.reach>20;
    }
    return out;
  });
  await fp.close();
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
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
