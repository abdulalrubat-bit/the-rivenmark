/* Run through tools/run-suites.js, or alone with node. Which page it drives --
 * the core, the game or the forge -- is in ./_pages.js. */
// The Vanguard has a kit now. Until this the game had one auto-aiming blade
// and no buttons at all, and the whole interface was written around there
// being no free thumb -- so most of what can go wrong here is a control
// fighting the stick, not an ability doing the wrong number.
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

  // ---- the beat -----------------------------------------------------------
  const gcd = await p.evaluate(()=>{
    stash=blankStash();saveStash();startRun('isaac',LEVELS[6].id,'riven');
    player.gcd=0; player.cds={};
    startGCD();
    const locked=onGCD(), t=player.gcd;
    for(let i=0;i<Math.ceil(GCD_TIME*60)+2;i++) updatePlayer(1/60);
    return { locked, len:+t.toFixed(2), free:!onGCD() };
  });
  ck('the beat is between one second and one and a half',
     gcd.len>=1.0 && gcd.len<=1.5, gcd.len+'s');
  ck('it locks the bar', gcd.locked);
  ck('and it lets go', gcd.free);

  // ---- the freeze ---------------------------------------------------------
  const fz = await p.evaluate(async()=>{
    stash=blankStash();saveStash();startRun('isaac',LEVELS[6].id,'riven');run.banner=0;
    const e=newBody('thrall',player.x+240,player.y,0); e.awake=true; enemies.push(e);
    // Frames as the game steps them: stepDelve is update behind the hit-stop.
    const wait=async n=>{ for(let k=0;k<n;k++) stepDelve(1/60); };
    hitStop=0; await wait(3);
    const t0=run.time; freeze(0.09); await wait(3);
    const frozen=run.time-t0;
    await wait(10);
    const t1=run.time; await wait(3);
    return { capped:(freeze(9), +hitStop.toFixed(3)), frozenAdvance:+frozen.toFixed(3),
             freeAdvance:+(run.time-t1).toFixed(3) };
  });
  ck('a freeze is capped however heavy the blow', fz.capped<=0.09, fz.capped+'s');
  ck('and the world stops while it runs',
     fz.frozenAdvance < fz.freeAdvance*0.5,
     fz.frozenAdvance+'s of clock over three frozen frames vs '+fz.freeAdvance+'s free');

  // ---- the kit ------------------------------------------------------------
  const kit = await p.evaluate(()=>{
    const o={};
    const fresh=()=>{stash=blankStash();saveStash();startRun('isaac',LEVELS[6].id,'riven');
      run.banner=0;player.hp=player.maxHp;player.gcd=0;player.cds={};player.charges=0;
      player.channel=null;player.mitigate=0;enemies.length=0;
      player.fireTimer=0;player.cleave=0;player.combo=0;player.comboT=0;
      player.conDown=false;player.conAim=false;};
    const mob=dx=>{const e=newBody('thrall',player.x+dx,player.y,0);e.awake=true;
      e.hp=e.maxHp=500;enemies.push(e);updateEnemies(0.001);return e;};

    /* THE BLADE IS THE BUILDER NOW. Anchoring Strike used to be, and cutting
     * it left the two spenders with no source -- so the swing that has to be
     * asked for pays for the swing you choose the moment of. Everything here
     * is about that seam.
     *
     * `spin` runs the arcs far enough for a crescent to cross its own reach.
     */
    const spin = n => { for (let i=0;i<(n||24);i++) update(1/60); };

    fresh(); const t=mob(40); const h0=t.hp;
    player.conA=0; player.conAim=true; tapSwing(); spin();
    o.bladeNear={dmg:h0-t.hp, charges:player.charges};

    fresh(); mob(1200);                      // nothing the blade can reach
    player.conA=0; player.conAim=true; tapSwing(); spin();
    o.bladeFar={charges:player.charges};

    // Three landed swings fill a spender, and not two.
    fresh(); const t3=mob(40); t3.hp=t3.maxHp=1e7;
    const seen=[];
    for(let i=0;i<3;i++){ player.fireTimer=0; player.conA=0; player.conAim=true;
                          tapSwing(); spin(); seen.push(player.charges); }
    o.bladeThree=seen;

    /* ONE PRESS PAYS ONCE, however many blades it threw. Twin Crescent and the
     * Sundering brand put up to five arcs in the air off one swing, and paying
     * each would turn a boon that buys width into one that opens every fight
     * with a free Guillotine. */
    fresh(); const tm=mob(40); tm.hp=tm.maxHp=1e7;
    player.shots=4; player.fireTimer=0; player.conA=0; player.conAim=true;
    tapSwing();
    // Counted BEFORE the spin: by the time the arcs have crossed their reach
    // they have expired, and the first version of this read zero and called it
    // a finding about the pay-out.
    const threw = arcs.length;
    spin();
    o.bladeShots={shots:4, charges:player.charges, arcs:threw};

    // And Zayd's builds his own pool off the same seam.
    stash=blankStash();saveStash();startRun('zayd',LEVELS[6].id,'riven');
    run.banner=0;player.tension=0;enemies.length=0;player.fireTimer=0;
    const zt=newBody('thrall',player.x+40,player.y,0); zt.awake=true;
    zt.hp=zt.maxHp=1e7; enemies.push(zt); updateEnemies(0.001);
    player.conA=0; player.conAim=true; tapSwing(); spin();
    o.bladeZayd={tension:player.tension};

    fresh(); const a=mob(60), c=mob(-90); player.charges=3;
    const ah=a.hp, ch=c.hp;
    o.aegis={cast:castAbility('aegis'), near:ah-a.hp, far:ch-c.hp,
             left:player.charges, mit:player.mitigate};
    fresh(); player.charges=2; o.aegisShort=castAbility('aegis');

    /* THE GUARD-BREAK, WHICH MOVED TO THE BLADE. Anchoring Strike was the only
     * answer to a braced body; cutting it without moving this would have left
     * bracing countered by patience, which is the answer the player was
     * already giving. A gathered blow goes through the shield; a tap does not,
     * and the tap is the control. */
    const braced = () => { fresh(); const e=mob(40); e.hp=e.maxHp=1e7;
                           e.braced=true; return e; };
    const gather = (f, e) => {
      player.conDown=true; player.conAim=true; player.conA=0;
      player.cleave=f; player.fireTimer=0;
      conduitRelease(); spin();
      return { broke: e.braced===false };
    };
    let bb = braced(); o.breakHeavy = gather(0.95, bb);
    bb = braced(); o.breakPart = gather(GUARD_BREAK - 0.15, bb);
    bb = braced(); player.fireTimer=0; player.conA=0; player.conAim=true;
    tapSwing(); spin(); o.breakTap = { broke: bb.braced===false };

    fresh(); player.hp=player.maxHp*0.4; const lo=player.hp;
    castAbility('purge');
    for(let i=0;i<60;i++) updatePlayer(1/60);
    o.purge={on:!!player.channel, healed:player.hp-lo, pctOfMax:(player.hp-lo)/player.maxHp};
    hurtPlayerBy(5,player.x,player.y);
    o.purge.brokeOnHit=!player.channel; o.purge.onCd=player.cds.purge>0;

    fresh(); player.hp=player.maxHp*0.4; castAbility('purge');
    stick.mag=1; stickMove(stick.ox+90, stick.oy);
    o.purgeBrokeOnMove=!player.channel; stick.mag=0;

    fresh(); const g=mob(50); g.hp=g.maxHp=99999; player.charges=3;
    const gh=g.hp; castAbility('guillotine'); const plain=gh-g.hp;
    fresh(); const v=mob(50); v.hp=v.maxHp=99999; v.vuln=VULN_TIME; player.charges=3;
    // The big moments share a one-second freeze budget, and the plain one just
    // above spent 0.08 of it in the same instant -- so this one is measured on
    // a budget of its own, which is what a Guillotine landing in a fight gets.
    freezesSpent.length=0; hitStop=0;
    const vh=v.hp; castAbility('guillotine');
    o.guillotine={plain, vuln:vh-v.hp, ratio:(vh-v.hp)/plain, froze:hitStop};
    return o;
  });

  ck('a swing that lands builds a Charge',
     kit.bladeNear.dmg>0 && kit.bladeNear.charges===1,
     kit.bladeNear.dmg.toFixed(0)+' damage, '+kit.bladeNear.charges+' charge');
  ck('and one that connects with nothing builds none',
     kit.bladeFar.charges===0,
     'a builder that pays for waving the blade is not a builder — got ' +
     kit.bladeFar.charges);
  ck('three landed swings fill a spender, and two do not',
     kit.bladeThree.join()==='1,2,3', kit.bladeThree.join(' -> '));
  ck('ONE PRESS PAYS ONCE, whatever it threw',
     kit.bladeShots.charges===1 && kit.bladeShots.arcs>1,
     kit.bladeShots.arcs+' crescents off one press, '+kit.bladeShots.charges+
     ' charge'+(kit.bladeShots.charges===1?''
       : ' — WIDTH IS BUYING RESOURCE, and a full bar opens every fight'));
  ck('and Zayd builds his own pool off the same seam',
     kit.bladeZayd.tension>0, kit.bladeZayd.tension+' Tension off one swing');
  ck('the ring spends all three and hits everything in it',
     kit.aegis.cast && kit.aegis.near>0 && kit.aegis.far>0 && kit.aegis.left===0,
     'near '+kit.aegis.near.toFixed(0)+', far '+kit.aegis.far.toFixed(0));
  ck('and leaves the guard up behind it', kit.aegis.mit>0, kit.aegis.mit+'s');
  ck('it will not fire on two Charges', kit.aegisShort===false);
  ck('a gathered blow goes through a guard',
     kit.breakHeavy.broke, kit.breakHeavy.broke ? '' :
     'BRACING HAS NO COUNTER — the only answer left is patience');
  ck('a half-gathered one does not',
     !kit.breakPart.broke, 'under GUARD_BREAK and the shield holds');
  ck('and the control: a tap does not either',
     !kit.breakTap.broke,
     kit.breakTap.broke ? 'EVERY SWING BREAKS GUARDS, so the gather is free'
                        : 'the shield holds against a tap');
  ck('the channel actually starts', kit.purge.on,
     'a heal that never begins passes every damage assertion after it');
  ck('...which is the fifteen per cent it promises',
     Math.abs(kit.purge.pctOfMax-0.15)<0.02, kit.purge.pctOfMax.toFixed(3));
  ck('being struck breaks it', kit.purge.brokeOnHit);
  ck('moving breaks it', kit.purgeBrokeOnMove,
     'or it is a free heal pressed whenever the floor is quiet');
  ck('a broken channel still costs its cooldown', kit.purge.onCd);
  ck('the execution hits hard', kit.guillotine.plain>0, kit.guillotine.plain.toFixed(0));
  ck('and five times as hard on the Vulnerable',
     Math.abs(kit.guillotine.ratio-5)<0.01,
     kit.guillotine.ratio.toFixed(2)+'x -- the brief asks for 400% bonus');
  ck('and it stops the world when it lands', kit.guillotine.froze>=0.075,
     kit.guillotine.froze.toFixed(3)+'s');

  // ---- the glass ----------------------------------------------------------
  // The stick floats under the left thumb; the kit is fixed under the right.
  // If they ever want the same pixels the game becomes unplayable, and no
  // amount of correct damage numbers will save it. Asked of the HUD that
  // ships, on a phone-sized screen, with the game loop running.
  const gp = await (await b.newContext({viewport:{width:390,height:844}, isMobile:true,
                                        hasTouch:true})).newPage();
  gp.on('pageerror',e=>errs.push(e.message));
  gp.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await gp.goto(pages.game('nogate&nogov'));
  await gp.waitForFunction(()=>state==='play' && document.querySelectorAll('#hud .kit button').length>0,
                           null, {timeout:30000});
  const glass = await gp.evaluate(()=>{
    // The swap counts as a key for every one of these: it is the same size,
    // in the same corner, and under the same thumb.
    const keys=[...document.querySelectorAll('#hud .kit button, #hud .swap button')]
      .map(k=>k.getBoundingClientRect());
    const bag=document.querySelector('#hud .hold .bag').getBoundingClientRect();
    const hit=(a,b)=>!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom);
    return { n:keys.length,
             leftHalf: keys.filter(k=>k.left < innerWidth*0.5).length,
             small: keys.filter(k=>k.width<44||k.height<44).length,
             overBag: keys.filter(k=>hit(k,bag)).length,
             offscreen: keys.filter(k=>k.right>innerWidth+1||k.bottom>innerHeight+1||k.top<0).length,
             selfOverlap: keys.reduce((n,a,i)=>
               n + keys.slice(i+1).filter(b=>hit(a,b)).length, 0) };
  });
  // Three and a swap. It was five and a swap; see the note over ABILITIES.
  ck('the kit has three keys and a swap', glass.n===4, glass.n+'');
  ck('no two keys sit on top of each other', glass.selfOverlap===0,
     glass.selfOverlap+' pairs -- a stacked key is one the thumb cannot choose');
  ck('none of them stray into the stick’s half of the glass',
     glass.leftHalf===0, glass.leftHalf+' on the left');
  ck('every key is a thumb wide', glass.small===0, glass.small+' under 44px');
  ck('none of them sit on the bag', glass.overBag===0, glass.overBag+'');
  ck('and none hang off the screen', glass.offscreen===0, glass.offscreen+'');

  // Pressing a key must not also drive the hero.
  // Charged first: every key Isaac has left either spends three or is a
  // channel, so a fresh hero pressing one is a press that correctly refuses.
  // The check below is about the glass, not about affording anything.
  await gp.evaluate(()=>{ run.banner=0; player.charges=CHARGE_MAX; player.gcd=0; });
  await sleep(200);
  const before = await gp.evaluate(()=>({x:player.x,y:player.y}));
  const box = await gp.$eval('#hud .kit button[data-id="aegis"]', e=>{const r=e.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+r.height/2};});
  await gp.mouse.move(box.x, box.y); await gp.mouse.down(); await sleep(90);
  const during = await gp.evaluate(()=>({mag:stick.mag, active:stick.active}));
  await gp.mouse.up(); await sleep(120);
  const after = await gp.evaluate(()=>({x:player.x,y:player.y,gcd:player.gcd,
                                         aegis:(player.cds||{}).aegis||0}));
  ck('a key press does not grab the stick', !during.active && during.mag===0,
     JSON.stringify(during));
  ck('and does not walk the hero',
     Math.hypot(after.x-before.x, after.y-before.y) < 2,
     Math.hypot(after.x-before.x, after.y-before.y).toFixed(1)+'px');
  ck('but it does cast', after.gcd>0 || after.aegis>0,
     'gcd '+after.gcd.toFixed(2)+', cooldown '+(+after.aegis).toFixed(1));

  // The bar belongs to a delve.
  const away = await gp.evaluate(async ()=>{
    __game.scene.getScene('delve').abandonRun();
    await new Promise(r=>setTimeout(r,200));
    return document.getElementById('hud').hidden;
  });
  ck('the kit is put away outside a delve', away);
  await gp.close();

  /* --- WHOSE DAMAGE IS IT ------------------------------------------------
   * The swing used to happen by itself and win the fight by itself: measured
   * over ninety-six delves, seven tenths of every point came off it and a
   * sixth off the six buttons. It is asked for now, and the bar is three, so
   * the question changed shape -- the blade is the primary, and what is
   * measured here is that it carries a whole ward and beats faster than
   * anything on the bar.
   */
  const own = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[6].id, 'riven');
    run.banner=0; player.hp=player.maxHp=1e7;
    arcs.length=0; releaseCrescent(0,0);
    const arc = arcs[0].dmg;
    // The blade's own beat against the SHORTEST thing on the bar: the primary
    // has to be the fast one or pressing it is not a rhythm.
    const barBeats = ABILITIES.isaac.map(a => a.gcd || 0).filter(v => v > 0);
    const put = () => { enemies.length=0; arcs.length=0;
      const e = newBody('breaker', player.x+50, player.y, 0);
      e.awake=true; e.hp=e.maxHp=1e6; e.braced=true; enemies.push(e);
      updateEnemies(0.001); return e; };
    // A gathered blow, through the guard. And the same body cut by an
    // ordinary one as the control -- a guard everything breaks is not a guard.
    const heavy = put();
    const hp0 = heavy.hp;
    player.conDown=true; player.conAim=true; player.conA=0;
    player.cleave=1; player.fireTimer=0;
    const bite = 1 + (CLEAVE_BITE - 1) * 1;
    conduitRelease();
    /* WATCHED WHILE IT RUNS, not read at the end. A breaker puts its guard
     * back up on its own timer, and four tenths of a second is long enough
     * for it to: the first version read `braced` after the spin, saw it up
     * again, and reported that the gathered blow had not broken it -- while
     * the damage on the same line said it had, at full weight through an open
     * guard. The flag is a state, not an event, so the event has to be caught.
     */
    let opened = false;
    for (let i=0;i<24;i++) { update(1/60); if (!heavy.braced) opened = true; }
    const heavyTook = hp0 - heavy.hp, heavyStill = !opened;
    const cut = put();
    const hp1 = cut.hp;
    damageEnemy(cut, player.damage, player.x, player.y);   // as a tap does
    const cutTook = hp1 - cut.hp, cutStill = !!cut.braced;
    return { arc, ward: player.damage,
             beat: player.fireDelay, barBeat: Math.min.apply(null, barBeats),
             heavyTook: +heavyTook.toFixed(1), heavyStill,
             cutTook: +cutTook.toFixed(1), cutStill,
             full: +(player.damage * bite).toFixed(1),
             soaked: +(player.damage * BRACE_SOAK).toFixed(1) };
  });
  /* This used to say the swing carries a SHARE of the ward -- the automatic
     blade was written down to 0.62 so that a game playing itself could not
     also win. The automatic blade is gone, so every crescent is one somebody
     asked for and is worth the whole of it. The check is inverted rather than
     deleted: a default that quietly weakened a swing is exactly the kind of
     thing that would come back unnoticed. */
  ck('a swing carries the whole of the ward, because every swing was asked for',
     Math.abs(own.arc - own.ward) < 0.01 && own.arc > 0,
     own.arc.toFixed(1)+' off a ward of '+own.ward);
  ck('and the blade beats faster than anything on the bar',
     own.beat < own.barBeat,
     own.beat+'s against the bar\'s quickest '+own.barBeat+'s');
  ck('a gathered blow breaks a guard where an ordinary cut does not',
     !own.heavyStill && own.cutStill,
     !own.cutStill ? 'THE ORDINARY CUT BROKE IT TOO — a guard everything breaks is not a guard'
                   : 'braced before, open after; and still braced against an ordinary cut');
  ck('and lands its whole blow through the broken one',
     Math.abs(own.heavyTook - own.full) < own.full*0.03,
     own.heavyTook+' of a possible '+own.full);
  ck('where an ordinary cut is still soaked', Math.abs(own.cutTook - own.soaked) < 1,
     own.cutTook+' off a '+own.ward+' cut, soaked to '+own.soaked);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
