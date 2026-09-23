/* Run through tools/run-suites.js, or alone with node. Which page it drives --
 * the core, the game or the forge -- is in ./_pages.js. */
// The one fight the game asks you to learn. What is checked here is mostly
// that each mechanic has an answer, that the answer works, and that NOT
// answering costs something -- a boss phase that is survivable by accident is
// not a boss phase.
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));

(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core()); await sleep(900);

  const R = await p.evaluate(()=>{
    const o={};
    // A boss room, on demand. startRun does not put him out -- he is called by
    // the quota -- so he is spawned by hand and the horde swept, because what
    // is under test is the encounter and not the delve around it.
    const room=(hero)=>{
      stash=blankStash();saveStash();startRun(hero||'isaac',LEVELS[24].id,'riven');
      run.banner=0; player.hp=player.maxHp=1e7; player.ward=0;
      enemies.length=0; nulls.length=0; ruptures.length=0; totems.length=0;
      spawnDeceiver();
      // Clear anything that is not the fight, and stand next to him.
      for(let i=enemies.length-1;i>=0;i--)
        if(enemies[i].kind!=='deceiver'&&enemies[i].kind!=='lieutenant') enemies.splice(i,1);
      player.x=run.boss.x+70; player.y=run.boss.y;
      run.dawn=0;
      // Rebuild the spatial hash. Emptying `enemies` does not empty the grid,
      // so without this nearestBody() hands back a body from the PREVIOUS
      // room and the swing lands on a ghost -- which reads as an ability that
      // does nothing.
      updateEnemies(1/60);
      return run.boss;
    };
    const escort=()=>enemies.filter(e=>e.kind==='lieutenant'&&e.hp>0);
    // Stand the escort in a rank west of the hero, clear of each other and
    // clear of him. Stacked on one point they shove each other apart, and
    // inside his radius he shoves them -- either way a body that was supposed
    // to be planted has moved, for reasons that are nothing to do with the
    // cleave.
    const lineUp=()=>{
      player.x=run.boss.x+320; player.y=run.boss.y;
      escort().forEach((L,i)=>{ L.x=player.x-90; L.y=player.y-60+i*40;
                                L.siphon=999; L.agony=0; });
      updateEnemies(1/60);
    };
    const killEscort=()=>{ for(const L of escort()) damageEnemy(L, L.maxHp*4); };

    // ---- Euphoric Tether -------------------------------------------------
    let boss=room();
    o.hasEscort=escort().length>0;
    let h0=boss.hp; damageEnemy(boss, boss.maxHp*0.5);
    o.tetherImmune=(boss.hp===h0);
    killEscort();
    h0=boss.hp; damageEnemy(boss, 40);
    o.tetherLifts=(boss.hp<h0);

    // ---- the crystal feeds on the escort ---------------------------------
    boss=room();
    const L0=escort()[0];
    damageEnemy(L0, L0.maxHp*0.5);
    o.dawnFeeds=run.dawn>0;
    o.dawnHalfLife=Math.abs(run.dawn-DAWN_PER_LIEUT*0.5)<0.6;

    // ---- Synchronized Agony ----------------------------------------------
    // All three cleaves are fired in ONE room, at one standing rank. Laying a
    // fresh room per measurement looked cleaner and was not: startRun builds
    // new geometry each time, the rank landed partly inside rock, and
    // moveEntity squirted three of the four out past AGONY_REACH -- so the
    // mitigated cleave was one Lieutenant against the bare cleave's four and
    // the comparison was between two different attacks. Nothing but
    // updateAgony is stepped between shots, and updateAgony moves nobody.
    boss=room(); lineUp();
    const arm=()=>{ run.agonyCd=0; run.agonyT=0; updateAgony(1/60);
                    return escort().filter(L=>L.agonyA!==undefined).length; };
    const fire=()=>{ player.invuln=0;
                     const h0=player.hp;
                     for(let i=0;i<Math.ceil(AGONY_WIND*60)+4;i++) updateAgony(1/60);
                     return h0-player.hp; };
    const inReach=()=>escort().filter(L=>
      Math.hypot(player.x-L.x,player.y-L.y)<=AGONY_REACH).length;

    o.agonyArc=arm();
    o.agonyWinds=(run.agonyT>0) && o.agonyArc===escort().length;
    // Planted while it winds. Stepped with updateEnemies, which is the thing
    // that would move it if anything did.
    const lx=escort()[0].x, ly=escort()[0].y;
    for(let i=0;i<30;i++) updateEnemies(1/60);
    o.agonyPlants=Math.hypot(escort()[0].x-lx, escort()[0].y-ly)<1;

    lineUp();
    const reach0=inReach();
    arm(); player.mitigate=0;
    const tookIn=fire();
    o.agonyLands=tookIn>0;
    o.agonyReach=reach0;

    // Behind Unyielding Mass, same rank, same distances, half the blow.
    arm(); player.mitigate=9;
    const tookMit=fire();
    player.mitigate=0;
    o.massAbsorbs = tookMit>0 && inReach()===reach0 &&
                    Math.abs(tookMit-tookIn*0.5)<tookIn*0.02;
    o.agonyNote=Math.round(tookIn)+' bare against '+Math.round(tookMit)+
                ' behind Mass, '+reach0+' of '+escort().length+' in reach throughout';

    // Walk out of the arc and it does not land at all.
    const backX=player.x, backY=player.y;
    arm(); player.x+=600;
    o.agonyMissable=fire()<0.01;
    player.x=backX; player.y=backY;

    // ---- Slag Siphon -----------------------------------------------------
    boss=room();
    boss.hp=boss.maxHp*0.5;
    for(const L of escort()) L.siphon=999;
    const S=escort()[0]; S.siphon=0; S.x=boss.x+40; S.y=boss.y;
    updateEnemies(1/60);
    o.siphonBegins=S.siphonOn===true && S.casting>0;
    o.siphonIsACast=isCasting(S);
    // Only one pours at a time.
    const T=escort()[1]; T.siphon=0; T.x=boss.x-40; T.y=boss.y;
    updateEnemies(1/60);
    o.siphonSolo=!T.siphonOn;
    // Let it finish: he mends and the crystal climbs.
    const bh=boss.hp, dw=run.dawn;
    for(let i=0;i<600 && S.siphonOn;i++) updateEnemies(1/60);
    o.siphonHeals=boss.hp>bh;
    o.siphonFeeds=run.dawn>dw;
    // And the interrupt ends it.
    boss=room();
    for(const L of escort()) L.siphon=999;
    const U=escort()[0]; U.siphon=0; U.x=boss.x+40; U.y=boss.y;
    updateEnemies(1/60);
    const dw2=run.dawn;
    player.x=U.x+60; player.y=U.y;
    silence(U,3);
    updateEnemies(1/60);
    o.siphonBreaks=!U.siphonOn;
    for(let i=0;i<400;i++) updateEnemies(1/60);
    o.brokenPourNoJump=(run.dawn-dw2)<DAWN_SIPHON;

    // ---- Inverted Ley-Rupture --------------------------------------------
    boss=room(); killEscort(); run.dawn=0; run.breath=0; boss.stun=0;
    ruptures.length=0;
    boss.rupture=0;
    updateEnemies(1/60);
    o.ruptureMarks=ruptures.length===1;
    o.ruptureUnderYou=ruptures.length===1 &&
      Math.hypot(ruptures[0].x-player.x, ruptures[0].y-player.y)<2;
    // Stand in it: it hurts and it takes the resource.
    player.invuln=0; player.charges=CHARGE_MAX; hp0=player.hp;
    for(let i=0;i<Math.ceil(RUPTURE_WIND*60)+4;i++) updateRuptures(1/60);
    o.ruptureHurts=player.hp<hp0;
    o.ruptureDrains=player.charges===0;
    // Walk off it and neither happens.
    ruptures.length=0; beginRupture(player.x, player.y);
    player.x+=500; player.invuln=0; player.charges=CHARGE_MAX; hp0=player.hp;
    for(let i=0;i<Math.ceil(RUPTURE_WIND*60)+4;i++) updateRuptures(1/60);
    o.ruptureDodgeable=Math.abs(player.hp-hp0)<0.01 && player.charges===CHARGE_MAX;

    // ---- Breath of the Void ----------------------------------------------
    boss=room();
    o.breathIdle=!(run.breath>0);
    // He SPAWNS on the portal, so a walk toward it covers no ground and the
    // check would pass or fail on rounding. Put him across the room first --
    // on ground that is actually clear. A fixed +300 in x landed him inside
    // rock on roughly one seed in three, where moveEntity cannot shift him and
    // the check failed for a reason that has nothing to do with the breath.
    let placed=false;
    for(let k=0;k<48 && !placed;k++){
      const a=k*TAU/16, d=240+((k/16)|0)*60;
      const x=portal.x+Math.cos(a)*d, y=portal.y+Math.sin(a)*d;
      if(x<60||y<60||x>WORLD.w-60||y>WORLD.h-60) continue;
      if(pointInWalls(x,y,boss.r+8)) continue;
      boss.x=x; boss.y=y; placed=true;
    }
    o.breathPlaced=placed;
    killEscort();
    o.breathStarts=run.breath>0;
    o.dawnAt95=Math.abs(run.dawn-DAWN_BREATH)<0.01;
    o.breathIsACast=isCasting(boss);
    const bx0=boss.x, by0=boss.y;
    for(let i=0;i<120;i++) updateEnemies(1/60);
    o.breathWalksIn=Math.hypot(boss.x-portal.x,boss.y-portal.y) <
                    Math.hypot(bx0-portal.x,by0-portal.y);
    o.breathClimbs=run.dawn>DAWN_BREATH;
    // Unanswered, it wipes.
    player.invuln=0;
    for(let i=0;i<Math.ceil(BREATH_TIME*60)+30 && player.hp>0;i++) updateEnemies(1/60);
    o.breathWipes=(run.dawnFired===true) && player.hp<=0;

    // The five seconds have one answer and it is Zayd's, so the fight has to
    // hand you the means. Fought as Isaac -- which is how the escort usually
    // goes down -- Zayd's Tension has been banked and frozen since the last
    // swap, and the swap may be mid-cooldown.
    boss=room();
    player.hero='isaac'; player.swapCd=SWAP_CD; run.pools={};
    killEscort();
    o.breathFreesSwap=player.swapCd===0;
    o.breathArmsZayd=(run.pools.zayd||{}).tension>=TENSION_MAX*
                      ABILITY_BY_ID.nullzone.costPct;
    player.gcd=0;
    const swapped=swapHero();
    o.breathSwapWorks=swapped===true && player.hero==='zayd';
    o.breathZaydWhole=player.hp===player.maxHp;
    o.breathCanAnswer=abilityBlock(ABILITY_BY_ID.nullzone)===null ||
                      abilityBlock(ABILITY_BY_ID.nullzone)==='gcd';

    // ---- Metaphysical Nullification --------------------------------------
    boss=room(); killEscort();
    o.nullNeedsHim=!tryNullify(boss.x+900, boss.y, 96);
    o.nullWorks=tryNullify(boss.x, boss.y, 96);
    o.nullEmpties=run.dawn===0 && run.breath===0;
    o.nullStuns=boss.stun>0;
    o.nullVulns=boss.vuln>0;
    // And it does nothing when he is not breathing.
    boss=room(); killEscort();
    run.breath=0; run.dawn=0; boss.stun=0; boss.vuln=0;
    o.nullOnlyOnBreath=!tryNullify(boss.x, boss.y, 96);

    // ---- and the Guillotine closes it ------------------------------------
    boss=room(); killEscort();
    tryNullify(boss.x, boss.y, 96);
    player.x=boss.x+40; player.y=boss.y;
    player.hero='isaac'; player.charges=CHARGE_MAX;
    player.gcd=0; player.cds={}; player.channel=null;
    const g0=boss.hp; castAbility('guillotine');
    const vulnHit=g0-boss.hp;
    // the same swing on a boss that is not Vulnerable
    boss=room(); killEscort();
    boss.vuln=0; boss.stun=0; run.breath=0;
    player.x=boss.x+40; player.y=boss.y;
    player.charges=CHARGE_MAX; player.gcd=0; player.cds={}; player.channel=null;
    const p0=boss.hp; castAbility('guillotine');
    const plainHit=p0-boss.hp;
    o.guillotineMultiplies=plainHit>0 && Math.abs(vulnHit-plainHit*VULN_MULT)<plainHit*0.05;
    o.guillotineNote=Math.round(plainHit)+' plain against '+Math.round(vulnHit)+
                     ' on the Vulnerable, x'+VULN_MULT;

    // ---- an ordinary delve carries none of it ----------------------------
    stash=blankStash();saveStash();startRun('isaac',LEVELS[3].id,'riven');
    run.banner=0;
    const q0=run.dawn;
    for(let i=0;i<300;i++) update(1/60);
    o.quietWithoutHim=(run.dawn===0) && q0===0 && !run.dawnFired && ruptures.length===0;

    return o;
  });

  ck('he cannot be touched while a Lieutenant stands', R.hasEscort && R.tetherImmune);
  ck('and the moment the last one falls, he can', R.tetherLifts);
  ck('the crystal fills off their blood', R.dawnFeeds);
  ck('by their whole life, in proportion', R.dawnHalfLife,
     'half a Lieutenant is half of what a Lieutenant is worth');

  ck('they wind the cleave together', R.agonyWinds, R.agonyArc+' arcs locked');
  ck('and stand still while they do', R.agonyPlants,
     'an arc drawn by a body still walking lands where it was never drawn');
  ck('standing in it costs you', R.agonyLands);
  ck('walking out of it does not', R.agonyMissable);
  ck('and Unyielding Mass takes half of it', R.massAbsorbs, R.agonyNote);

  ck('a Lieutenant breaks off to pour into him', R.siphonBegins);
  ck('the pour is a cast', R.siphonIsACast, 'which is what makes it Zayd’s problem');
  ck('only one pours at a time', R.siphonSolo,
     'two at once cannot both be snapped, and an untestable mechanic is not a harder one');
  ck('a finished pour mends him', R.siphonHeals);
  ck('and pushes the crystal', R.siphonFeeds);
  ck('the interrupt ends it', R.siphonBreaks);
  ck('and a broken pour never pays out', R.brokenPourNoJump);

  ck('the rupture opens under whoever is standing there',
     R.ruptureMarks && R.ruptureUnderYou);
  ck('staying in it hurts', R.ruptureHurts);
  ck('and takes the resource with it', R.ruptureDrains,
     'which is the half that actually matters -- it puts the answer out of reach');
  ck('moving off it costs nothing', R.ruptureDodgeable);

  ck('the breath does not start while they stand', R.breathIdle);
  ck('and starts the moment they do not', R.breathStarts);
  ck('with the crystal already at ninety-five', R.dawnAt95);
  ck('he goes to the middle of the room for it', R.breathWalksIn && R.breathPlaced,
     R.breathPlaced ? '' : 'NO CLEAR GROUND FOUND — fixture proved nothing');
  ck('it reads as a cast', R.breathIsACast);
  ck('and the crystal climbs while he holds it', R.breathClimbs);
  ck('unanswered, it is a wipe', R.breathWipes, 'which is what makes it the fight');

  ck('the breath takes the swap off cooldown', R.breathFreesSwap);
  ck('and the Spellbreaker arrives able to answer it',
     R.breathArmsZayd && R.breathSwapWorks && R.breathCanAnswer,
     'a wipe you could not answer because of a cooldown is a coin toss, not a mechanic');
  ck('and arrives whole if he has never been out', R.breathZaydWhole,
     'the pool the encounter writes for him must not hand him nought life');

  ck('a Null-Zone somewhere else does nothing', R.nullNeedsHim);
  ck('a Null-Zone under him breaks the breath', R.nullWorks);
  ck('and empties the crystal', R.nullEmpties);
  ck('puts him down', R.nullStuns);
  ck('and leaves him Vulnerable', R.nullVulns);
  ck('but only against the breath', R.nullOnlyOnBreath,
     'or the answer is a button rather than a moment');

  ck('and the Guillotine is what Vulnerable was written for',
     R.guillotineMultiplies, R.guillotineNote);

  ck('a delve without him carries none of this', R.quietWithoutHim);

  // Where the crystal actually lands. It was first placed on its own copy of
  // the map's arithmetic and drawn straight THROUGH the map, with its label
  // clipped off the right edge on top of that -- so this is measured rather
  // than reasoned about, on the HUD that ships: the map and the crystal are
  // the Phaser overlay's, the boss bar and the thumb buttons are the DOM HUD.
  const gp = await (await b.newContext({viewport:{width:390,height:844}, isMobile:true,
                                        hasTouch:true})).newPage();
  gp.on('pageerror',e=>errs.push(e.message));
  await gp.goto(pages.game('nogate&nogov'));
  await gp.waitForFunction(()=>state==='play' && __game.scene.getScene('delve').overlay,
                           null, {timeout:30000});
  const lay = await gp.evaluate(async ()=>{
    const sc=__game.scene.getScene('delve');
    sc.newRun('isaac', LEVELS[24].id, 'riven');
    run.banner=0; enemies.length=0; spawnDeceiver(); run.dawn=60;
    player.hp=player.maxHp=1e9;
    await new Promise(r=>setTimeout(r,500));
    const c=dawnCrystalRect(), m=minimapBox();
    const rect=el=>{ if(!el) return null; const r=el.getBoundingClientRect();
      return {x:r.left,y:r.top,w:r.width,h:r.height}; };
    const bar=rect(document.querySelector('#hud .boss'));
    const map={x:m.x-m.over, y:m.y-m.over, w:m.s+m.over*2, h:m.s+m.over*2};
    const labelW=sc.overlay.dawnLabel.width;
    const tops=[...document.querySelectorAll('#hud .kit button, #hud .swap button')]
      .map(b=>b.getBoundingClientRect().top);
    return { c, map, bar, labelW, shown: sc.overlay.dawnLabel.visible,
             kitTop: tops.length ? Math.min(...tops) : null,
             view:{w:view.w,h:view.h,safeR:view.safeR||0} };
  });
  await gp.close();
  const hits=(a,b)=>a.x<b.x+b.w && b.x<a.x+a.w && a.y<b.y+b.h && b.y<a.y+a.h;
  ck('the crystal is clear of the map', !hits(lay.c, lay.map),
     'crystal '+Math.round(lay.c.x)+','+Math.round(lay.c.y)+' against a map ending at '+
     Math.round(lay.map.y+lay.map.h));
  ck('and clear of his own health bar', !!lay.bar && !hits(lay.c, lay.bar),
     lay.bar ? 'bar ends at '+Math.round(lay.bar.y+lay.bar.h) : 'no boss bar up');
  ck('its label stays on the screen', lay.shown && lay.c.x + lay.c.w - lay.labelW >= 0 &&
     lay.c.x + lay.c.w <= lay.view.w - lay.view.safeR,
     'right-aligned, ' + Math.round(lay.labelW) + 'px wide off a ' +
     Math.round(lay.c.w) + 'px column');
  ck('and it ends above the thumb buttons', lay.kitTop === null ||
     lay.c.y + lay.c.h + 14 <= lay.kitTop,
     'crystal ends '+Math.round(lay.c.y+lay.c.h)+', buttons start '+Math.round(lay.kitTop||0));
  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));

  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
