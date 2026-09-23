/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
// Zayd, and the other one. Isaac is answered by standing still and taking it;
// Zayd is answered by lines, ground, and timing -- so most of what is checked
// here is that his tools care about *where* and *when*, not how much.
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
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core()); await sleep(900);

  const R = await p.evaluate(()=>{
    const o={};
    const fresh=(who)=>{stash=blankStash();saveStash();startRun(who||'zayd',LEVELS[8].id,'riven');
      run.banner=0;player.hp=player.maxHp;player.gcd=0;player.cds={};player.tension=0;
      player.jars=JAR_USES;enemies.length=0;beams.length=0;nulls.length=0;
      for(const c of openCells){if(!pointInWalls(c.x,c.y,150)){player.x=c.x;player.y=c.y;break;}}};
    const mob=(k,dx,dy)=>{const e=newBody(k,player.x+dx,player.y+(dy||0),0);e.awake=true;
      e.hp=e.maxHp=900;enemies.push(e);updateEnemies(0.001);return e;};

    /* Piercing Truth is gone -- see the note over ABILITIES. It was Zayd's
     * builder and a second attack button, and the blade is both now. What is
     * measured here is that the seam actually reaches him: a Hearth-Warden
     * and a Ley-Ward build different pools off the same press, and it would
     * be easy to wire one and not the other. */
    fresh(); player.angle=0; player.fireTimer=0; player.tension=0;
    const zb=mob('thrall',60);
    player.conA=0; player.conAim=true; tapSwing();
    for(let i=0;i<24;i++) update(1/60);
    o.blade={tension:player.tension, hurt:900-zb.hp};
    fresh(); player.fireTimer=0; player.tension=0;
    player.conA=0; player.conAim=true; tapSwing();
    for(let i=0;i<24;i++) update(1/60);
    o.bladeEmpty={tension:player.tension};
    o.BLADE_TENSION = BLADE_TENSION;

    fresh(); player.tension=TENSION_MAX;
    const sh=mob('shaman',40); sh.chanting=1.0;
    const t0=player.tension;
    o.nullCast=castAbility('nullzone');
    o.nullCost=t0-player.tension; o.nullPools=nulls.length;
    const wind=sh.chanting;
    for(let i=0;i<30;i++) updateNulls(1/60);
    o.nullSlows=sh.slowed>0; o.nullEatsCast=sh.chanting>wind;
    fresh(); player.tension=TENSION_MAX*0.3;
    o.nullTooPoor=castAbility('nullzone')===false;

    fresh(); player.tension=0;
    const cn=mob('cantor',120); cn.casting=BOLT_WIND*0.5;
    o.decrypt={cast:castAbility('decrypt'), gcd:player.gcd, tension:player.tension,
               silenced:cn.silenced||0, cleared:cn.casting===0};
    // and a silenced body cannot simply start again
    cn.cast=0;
    for(let i=0;i<30;i++) updateEnemies(1/60);
    o.staysSilenced=(cn.casting||0)===0;

    fresh(); mob('thrall',80);
    o.miss={cast:castAbility('decrypt'), cd:player.cds.decrypt||0,
            full:ABILITY_BY_ID.decrypt.cd};

    fresh(); player.hp=player.maxHp*0.2; const lo=player.hp;
    o.jars={cast:castAbility('jars'), pct:(player.hp-lo)/player.maxHp,
            left:player.jars, cd:player.cds.jars};
    player.jars=0; player.gcd=0; player.cds={};
    o.jarsEmpty=castAbility('jars')===false;

    // ---- the swap -------------------------------------------------------
    fresh('isaac');
    o.swapStart=player.hero;
    player.hp=player.maxHp*0.5; const isaacHp=player.hp;
    player.gcd=0; player.swapCd=0;
    o.swapped=swapHero();
    o.swapTo=player.hero; o.swapGcd=player.gcd; o.swapCd=player.swapCd;
    o.swapFresh=player.hp===player.maxHp;
    o.swapLocked=swapHero()===false;
    player.hp=player.maxHp*0.2; const zaydHp=player.hp;
    player.gcd=0; player.swapCd=0; swapHero();
    o.isaacKept=Math.abs(player.hp-isaacHp)<0.01;
    player.gcd=0; player.swapCd=0; swapHero();
    o.zaydKept=Math.abs(player.hp-zaydHp)<0.01;
    o.kitSize={isaac:ABILITIES.isaac.length, zayd:ABILITIES.zayd.length};

    // the forged-for affix follows whoever is holding the kit
    fresh('isaac');
    stash.gear.blade={uid:1,slot:'blade',base:'Longsword',rarity:'wrought',
                      affixes:[{id:'isaacSweep',v:0.26}],name:'test'};
    player.gear.blade=stash.gear.blade;
    recomputeStats(player); const isaacSweep=player.sweep;
    player.gcd=0; player.swapCd=0; swapHero();
    recomputeStats(player); const zaydSweep=player.sweep;
    o.synergy={isaac:+isaacSweep.toFixed(2), zayd:+zaydSweep.toFixed(2)};
    return o;
  });

  ck('his blade builds Ley-Tension, not Sun-Gold',
     R.blade.tension > 0 && R.blade.hurt > 0,
     R.blade.tension.toFixed(0)+' Tension off one landed swing, '+
     R.blade.hurt.toFixed(0)+' damage');
  /* The control has to allow for TENSION_REGEN. Zayd's pool refills on its own
   * at 4 a second, so twenty-four frames of empty floor is 1.6 Tension that
   * the blade had nothing to do with -- the first version of this asked for
   * exactly zero and reported the regen as a pay-out. What the blade is worth
   * is the DIFFERENCE between the two, which is the thing being claimed. */
  ck('and the control: a swing that lands on nothing builds none',
     R.blade.tension - R.bladeEmpty.tension > R.BLADE_TENSION * 0.9,
     (R.blade.tension - R.bladeEmpty.tension).toFixed(1)+' more for landing it, '+
     'against '+R.bladeEmpty.tension.toFixed(1)+' of passive regen either way');
  ck('the pool costs exactly two fifths',
     Math.abs(R.nullCost - 40) < 0.01, R.nullCost.toFixed(1)+' of 100');
  ck('and will not drop on less', R.nullTooPoor);
  ck('it slows what stands in it', R.nullSlows);
  ck('and eats what that thing is casting', R.nullEatsCast);
  ck('the interrupt is off the beat', R.decrypt.cast && R.decrypt.gcd===0,
     'an interrupt you have to wait for is not an interrupt');
  ck('it snaps the cast', R.decrypt.cleared && R.decrypt.silenced>0,
     R.decrypt.silenced+'s of silence');
  ck('and gives the whole pool back', R.decrypt.tension===100, R.decrypt.tension+'');
  ck('a silenced body cannot start again', R.staysSilenced,
     'or the interrupt bought nothing');
  ck('a miss costs some of the cooldown but not all of it',
     R.miss.cd > 0 && R.miss.cd < R.miss.full,
     R.miss.cd.toFixed(1)+'s of '+R.miss.full+' -- free to mash is no timing at all');
  ck('the jars restore nearly half at once',
     Math.abs(R.jars.pct-0.45)<0.01, (R.jars.pct*100).toFixed(0)+'%');
  ck('three to a delve and no more', R.jars.left===2 && R.jarsEmpty, R.jars.left+' left');
  ck('and a long wait between them', R.jars.cd===30, R.jars.cd+'s');

  ck('the swap changes who holds the ground',
     R.swapped && R.swapStart==='isaac' && R.swapTo==='zayd');
  ck('it takes a beat and a half', Math.abs(R.swapGcd-1.5)<0.01, R.swapGcd.toFixed(2)+'s');
  ck('and five seconds before the other can be called back',
     R.swapCd===5 && R.swapLocked, R.swapCd+'s');
  ck('the one who has not been down arrives whole', R.swapFresh);
  ck('each of them keeps his own wounds', R.isaacKept && R.zaydKept,
     'swapping is not a heal');
  /* The interface is the game's HUD, so this is asked of the game: after a
   * swap, the kit under the thumb is the new hero's, button for button. (The
   * canvas build said it with a class on <body>; the Phaser HUD rebuilds its
   * kit from ABILITIES instead.) */
  const gp = await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  gp.on('pageerror',e=>errs.push(e.message));
  await gp.goto(pages.game('nogate&nogov'));
  await gp.waitForFunction(()=>state==='play' && document.querySelectorAll('#hud .kit button').length>0,
                           null, {timeout:30000});
  const kit = () => gp.evaluate(()=>({ hero: player.hero,
    ids: [...document.querySelectorAll('#hud .kit button')].map(b=>b.dataset.id) }));
  const k0 = await kit();
  await gp.evaluate(()=>{ player.swapCd=0; player.gcd=0; swapHero(); });
  await sleep(400);
  const k1 = await kit();
  const mine = h => ABILITY_IDS[h];
  const ABILITY_IDS = await gp.evaluate(()=>Object.fromEntries(
    Object.entries(ABILITIES).map(([h,l])=>[h, l.map(a=>a.id)])));
  ck('the interface changes hands with them',
     k0.hero!==k1.hero && k0.ids.every(id=>mine(k0.hero).includes(id)) &&
     k1.ids.length>0 && k1.ids.every(id=>mine(k1.hero).includes(id)),
     k0.hero+' ['+k0.ids.join(',')+'] -> '+k1.hero+' ['+k1.ids.join(',')+']');
  await gp.close();
  // Three each since the bar was cut; see the note over ABILITIES.
  ck('and so does the kit', R.kitSize.isaac===3 && R.kitSize.zayd===3,
     JSON.stringify(R.kitSize));
  ck('a forged-for affix pays out for whoever is holding it',
     R.synergy.isaac > R.synergy.zayd,
     'Sun-Wide on Isaac '+R.synergy.isaac+' vs on Zayd '+R.synergy.zayd);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
