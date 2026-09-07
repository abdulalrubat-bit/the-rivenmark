/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
// The Vanguard has a kit now. Until this the game had one auto-aiming blade
// and no buttons at all, and the whole interface was written around there
// being no free thumb -- so most of what can go wrong here is a control
// fighting the stick, not an ability doing the wrong number.
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
    const wait=n=>new Promise(r=>{let k=0;const f=()=>{if(++k>=n)return r();requestAnimationFrame(f);};requestAnimationFrame(f);});
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
      player.channel=null;player.rooted=0;player.mitigate=0;enemies.length=0;};
    const mob=dx=>{const e=newBody('thrall',player.x+dx,player.y,0);e.awake=true;
      e.hp=e.maxHp=500;enemies.push(e);updateEnemies(0.001);return e;};

    fresh(); const t=mob(40); const h0=t.hp;
    o.anchor={hit:castAbility('anchor'), dmg:h0-t.hp, charges:player.charges};
    o.gcdBlocks = castAbility('anchor')===false;

    fresh(); mob(500);                       // out of reach
    o.anchorFar = { cast:castAbility('anchor'), charges:player.charges };

    fresh(); const a=mob(60), c=mob(-90); player.charges=3;
    const ah=a.hp, ch=c.hp;
    o.aegis={cast:castAbility('aegis'), near:ah-a.hp, far:ch-c.hp,
             left:player.charges, mit:player.mitigate};
    fresh(); player.charges=2; o.aegisShort=castAbility('aegis');

    fresh(); castAbility('mass'); const mx=player.x;
    stick.mag=1; stick.dx=1; stick.dy=0;
    for(let i=0;i<30;i++) updatePlayer(1/60);
    o.mass={rooted:player.rooted>0, moved:Math.abs(player.x-mx), mit:player.mitigate>0};
    stick.mag=0;

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
    const vh=v.hp; castAbility('guillotine');
    o.guillotine={plain, vuln:vh-v.hp, ratio:(vh-v.hp)/plain, froze:hitStop};
    return o;
  });

  ck('the bash lands and builds a Charge',
     kit.anchor.hit && kit.anchor.dmg>0 && kit.anchor.charges===1,
     kit.anchor.dmg.toFixed(0)+' damage, '+kit.anchor.charges+' charge');
  ck('and the beat blocks the next one', kit.gcdBlocks);
  ck('out of reach it swings and builds nothing',
     kit.anchorFar.cast && kit.anchorFar.charges===0,
     'a builder that pays out at any range is a second auto-attack');
  ck('the ring spends all three and hits everything in it',
     kit.aegis.cast && kit.aegis.near>0 && kit.aegis.far>0 && kit.aegis.left===0,
     'near '+kit.aegis.near.toFixed(0)+', far '+kit.aegis.far.toFixed(0));
  ck('and leaves the guard up behind it', kit.aegis.mit>0, kit.aegis.mit+'s');
  ck('it will not fire on two Charges', kit.aegisShort===false);
  ck('rooted, the boots do not move', kit.mass.rooted && kit.mass.moved===0,
     kit.mass.moved.toFixed(2)+'px under a full stick');
  ck('and half the harm is turned', kit.mass.mit);
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
  // amount of correct damage numbers will save it.
  const glass = await p.evaluate(()=>{
    // The swap counts as a key for every one of these: it is the same size,
    // in the same corner, and under the same thumb.
    const keys=[...document.querySelectorAll('#kitBar .key')].map(k=>k.getBoundingClientRect());
    const bag=document.getElementById('bagBtn').getBoundingClientRect();
    const hit=(a,b)=>!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom);
    return { n:keys.length,
             leftHalf: keys.filter(k=>k.left < innerWidth*0.5).length,
             small: keys.filter(k=>k.width<44||k.height<44).length,
             overBag: keys.filter(k=>hit(k,bag)).length,
             offscreen: keys.filter(k=>k.right>innerWidth+1||k.bottom>innerHeight+1||k.top<0).length,
             selfOverlap: keys.reduce((n,a,i)=>
               n + keys.slice(i+1).filter(b=>hit(a,b)).length, 0) };
  });
  ck('the kit has five keys and a swap', glass.n===6, glass.n+'');
  ck('no two keys sit on top of each other', glass.selfOverlap===0,
     glass.selfOverlap+' pairs -- a stacked key is one the thumb cannot choose');
  ck('none of them stray into the stick’s half of the glass',
     glass.leftHalf===0, glass.leftHalf+' on the left');
  ck('every key is a thumb wide', glass.small===0, glass.small+' under 44px');
  ck('none of them sit on the bag', glass.overBag===0, glass.overBag+'');
  ck('and none hang off the screen', glass.offscreen===0, glass.offscreen+'');

  // Pressing a key must not also drive the hero.
  await p.evaluate(()=>{stash=blankStash();saveStash();startRun('isaac',LEVELS[6].id,'riven');run.banner=0;});
  await sleep(200);
  const before = await p.evaluate(()=>({x:player.x,y:player.y}));
  const box = await p.$eval('#key_anchor', e=>{const r=e.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+r.height/2};});
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await sleep(90);
  const during = await p.evaluate(()=>({mag:stick.mag, active:stick.active}));
  await p.mouse.up(); await sleep(120);
  const after = await p.evaluate(()=>({x:player.x,y:player.y,gcd:player.gcd}));
  ck('a key press does not grab the stick', !during.active && during.mag===0,
     JSON.stringify(during));
  ck('and does not walk the hero',
     Math.hypot(after.x-before.x, after.y-before.y) < 2,
     Math.hypot(after.x-before.x, after.y-before.y).toFixed(1)+'px');
  ck('but it does cast', after.gcd>0, 'gcd '+after.gcd.toFixed(2));

  // The bar belongs to a delve.
  const away = await p.evaluate(()=>{
    showScreen('splash'); state='menu'; syncKit();
    return document.getElementById('kitBar').hidden;
  });
  ck('the kit is put away outside a delve', away);

  /* --- WHOSE DAMAGE IS IT ------------------------------------------------
   * The swing happens by itself, and it was winning the fight by itself:
   * measured over ninety-six whole delves, seven tenths of every point of
   * damage came off it and a sixth off the six buttons. The crescent carries a
   * share of the ward now, the primary carries the rest, and the primary is on
   * a shorter beat than the rest of the bar so pressing it is a rhythm.
   */
  const own = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[6].id, 'riven');
    run.banner=0; player.hp=player.maxHp=1e7;
    // What one crescent is worth against what the ward is worth.
    arcs.length=0; releaseCrescent(0,0);
    const arc = arcs[0].dmg;
    const anchor = ABILITY_BY_ID.anchor, aegis = ABILITY_BY_ID.aegis;
    // A braced anchor, bashed. And the same body, cut by a crescent, as the
    // control -- a guard that everything breaks is not a guard.
    const put = () => { enemies.length=0;
      const e = newBody('breaker', player.x+50, player.y, 0);
      e.awake=true; e.hp=e.maxHp=1e6; e.braced=true; enemies.push(e);
      updateEnemies(0.001); return e; };
    const bashed = put();
    const hp0 = bashed.hp;
    castAbility('anchor');
    const bashTook = hp0 - bashed.hp, bashedStill = !!bashed.braced;
    const cut = put();
    const hp1 = cut.hp;
    damageEnemy(cut, player.damage, player.x, player.y);   // as a crescent does
    const cutTook = hp1 - cut.hp, cutStill = !!cut.braced;
    return { arc, ward: player.damage,
             beat: anchor.gcd, otherBeat: aegis.gcd,
             bashTook: +bashTook.toFixed(1), bashedStill,
             cutTook: +cutTook.toFixed(1), cutStill,
             full: +(player.damage * anchor.dmg).toFixed(1),
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
  ck('and the primary is on a shorter beat than the rest of the bar',
     own.beat < own.otherBeat,
     own.beat+' against '+own.otherBeat+' -- '+(own.beat*1.2).toFixed(2)+'s a press');
  ck('the bash breaks a guard', !own.bashedStill && own.cutStill,
     !own.cutStill ? 'THE CRESCENT BROKE IT TOO — a guard everything breaks is not a guard'
                   : 'braced before, open after; and still braced against an ordinary cut');
  ck('and lands its whole blow through the broken one',
     Math.abs(own.bashTook - own.full) < own.full*0.02,
     own.bashTook+' of a possible '+own.full);
  ck('where an ordinary cut is still soaked', Math.abs(own.cutTook - own.soaked) < 1,
     own.cutTook+' off a '+own.ward+' cut, soaked to '+own.soaked);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
