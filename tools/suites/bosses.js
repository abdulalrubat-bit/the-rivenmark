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
  await p.goto(PAGE('index.html')); await sleep(700);

  /* A rung to run the epithet tests on. The mutators are the DECEIVER's -- they
   * set his blink, his mirages, his guard -- and every third rung past the ramp
   * answers with the Crucible-Mass instead, which has none of those things.
   * This used to be a hardcoded 26, and 26 is one of them: forcing a mutator
   * list onto that rung produced a Crucible-Mass wearing epithets it cannot
   * express, and every check below failed on a boss that was never the one
   * being tested. Found, not guessed at, so a change to which rungs go to which
   * avatar cannot silently point this at the wrong one again. */
  const RUNG = await p.evaluate(() =>
    LEVELS.findIndex((L, i) => i > RAMP.length + 4 && L.boss === 'deceiver'));
  if (RUNG < 0) { console.log('\nFAIL 1\n  x no Deceiver rung past the ramp'); await b.close(); process.exit(1); }

  // ---- the roll -----------------------------------------------------------
  const roll = await p.evaluate(()=>{
    // The onboarding ramp deliberately leaves its rungs plain -- an epithet is
    // a rule to read and there is nothing to read it against yet -- so the
    // roll is only asserted from the first rung past it. And only on the
    // Deceiver's own rungs: the epithets are his, and a Crucible-Mass rung
    // rolling one would be a rule the fight has no way to show you.
    const past = LEVELS.slice(RAMP.length);
    const per = past.filter(L => L.boss === 'deceiver').map(L=>L.mutators);
    const massRungs = past.filter(L => L.boss === 'crucible');
    const counts = per.map(m=>m.length);
    const dupes = per.filter(m=>new Set(m).size!==m.length).length;
    const combos = new Set(per.map(m=>m.slice().sort().join('+')));
    // every mutator should actually be reachable
    const used = new Set(); per.forEach(m=>m.forEach(id=>used.add(id)));
    // and the roll must be a property of the rung, not the run
    const stable = past.every((L, i) =>
      L.boss !== 'deceiver' ||
      rollMutators(i + RAMP.length, L.depth).join('+') === L.mutators.join('+'));
    return { n: LEVELS.length, min: Math.min(...counts), max: Math.max(...counts),
             dupes, combos: combos.size, used: used.size, all: MUTATORS.length,
             stable, shallow: counts[0], deep: counts[counts.length-1],
             // The third ramp rung does roll one -- by then there is something
             // to read an epithet against. Only the ones marked plain must be.
             ramp: RAMP.every((r,i)=>r.mutate || LEVELS[i].mutators.length===0),
             mass: massRungs.length,
             massPlain: massRungs.every(L => (L.mutators||[]).length === 0),
             titles: LEVELS.map((L,i)=>i).filter(i=>LEVELS[i].boss==='deceiver')
                           .slice(-4).map(i=>bossTitle(LEVELS[i])) };
  });
  ck('every rung past the ramp rolls a boss', roll.min>=1,
     roll.min+' to '+roll.max+' mutators');
  ck('and the ramp rungs stay plain', roll.ramp);
  ck('a boss never rolls the same mutator twice', roll.dupes===0);
  ck('the roll is a property of the rung, not the run', roll.stable);
  ck('it deepens down the ladder', roll.deep > roll.shallow,
     roll.shallow+' at the mouth, '+roll.deep+' at the deep');
  ck('every mutator is reachable', roll.used===roll.all,
     roll.used+' of '+roll.all+' used');
  ck('the ladder is not one fight repeated', roll.combos>=8,
     roll.combos+' distinct bosses across '+roll.n+' rungs');
  ck('and each is named for what it does',
     roll.titles.every(t=>/Deceiver/.test(t)), roll.titles.join(' | '));
  // The other avatar takes none of them, and the control that the split is
  // real: if every rung were his, "his rungs all roll one" would be trivially
  // true of a ladder with one boss on it.
  ck('the Crucible-Mass rungs roll none of them, because they are his',
     roll.mass > 0 && roll.massPlain === true,
     roll.mass ? roll.mass + ' rungs, all plain'
       : 'NO CRUCIBLE RUNGS — the split this suite now assumes does not exist');

  // ---- each mutator does something you can see ---------------------------
  const call = async (mut) => p.evaluate(([mut, rung])=>{
    stash=blankStash(); saveStash();
    startRun('isaac', LEVELS[rung].id, 'riven');
    LEVEL.mutators = mut;                       // force the roll for the test
    run.tech = LEVEL.quota;
    slams.length=0; hazards.length=0;
    updatePortal(1/60);
    return run.boss;
  }, [mut, RUNG]);

  await call([]);
  const plain = await p.evaluate(()=>({
    guards: enemies.filter(e=>e.kind==='lieutenant').length,
    hp: run.boss.maxHp, speed: run.boss.speed, title: run.boss.title,
    blink: run.boss.blink }));
  ck('an unmutated boss is the plain one', /Gilded/.test(plain.title), plain.title);

  await call(['legion']);
  const legion = await p.evaluate(()=>enemies.filter(e=>e.kind==='lieutenant').length);
  ck('the Legion brings more of them', legion === plain.guards+2,
     plain.guards+' -> '+legion);

  await call(['unblinking']);
  const unb = await p.evaluate(()=>({ speed: run.boss.speed, hp: run.boss.maxHp,
                                      blink: run.boss.blink }));
  ck('the Unblinking walks rather than stepping away',
     unb.blink > 1e6 && plain.blink < 100,
     'blink every '+plain.blink+'s -> never');
  ck('and is quicker and heavier for it',
     unb.speed > plain.speed && unb.hp > plain.hp,
     'speed '+Math.round(plain.speed)+' -> '+Math.round(unb.speed)+
     ', hp '+Math.round(plain.hp)+' -> '+Math.round(unb.hp));

  await call(['sundering']);
  const sund = await p.evaluate(()=>{
    const b=run.boss;
    // stand in front of him so a slam is legal
    player.x = b.x + SLAM_R*b.slamR*1.4; player.y = b.y;
    b.slamCd = 0; b.braced=false;
    updateEnemies(1/60);
    return { slam: b.slam, thrown: slams.length, r: slams[0] && slams[0].r,
             plainR: SLAM_R };
  });
  ck('the Sundering brings his hand down', sund.slam && sund.thrown===1);
  ck('and it takes more floor than a Lieutenant’s',
     sund.r > sund.plainR, Math.round(sund.r)+' vs '+sund.plainR);

  await call(['riftborn']);
  const rift = await p.evaluate(()=>{
    const b=run.boss; hazards.length=0;
    b.blink = 0;
    updateEnemies(1/60);
    if(!hazards.length) return { left:0 };
    // and it has to actually cost something to stand in
    const h=hazards[0];
    player.x=h.x; player.y=h.y; player.invuln=0;
    player.hp=player.maxHp=100000;
    const hp0=player.hp;
    for(let i=0;i<60;i++) updateHazards(1/60);
    const took = hp0-player.hp;
    // and expire
    for(let i=0;i<60*9;i++) updateHazards(1/60);
    return { left: 1, took, gone: hazards.length===0 };
  });
  ck('the Riftborn leaves the hole open behind him', rift.left===1);
  ck('standing in one costs you', rift.took>0, Math.round(rift.took)+' over a second');
  ck('and it closes eventually', rift.gone);

  await call(['ravenous']);
  const rav = await p.evaluate(()=>{
    const b=run.boss;
    b.hp = b.maxHp*0.4;
    const before = b.hp;
    const t = newBody('thrall', b.x+60, b.y, 0); t.awake=true; enemies.push(t);
    damageEnemy(t, 99999);
    const near = b.hp - before;
    // Push away from whichever edge has room: clamping a fixed +900 into the
    // world can land the body back inside his reach, and then feeding on it
    // would be correct rather than a bug.
    const away = b.x > WORLD.w/2 ? -1 : 1;
    const t2 = newBody('thrall', b.x, b.y, 0);
    t2.x = clamp(b.x + away*900, 40, WORLD.w-40); t2.awake=true; enemies.push(t2);
    const gap = Math.hypot(t2.x-b.x, t2.y-b.y);
    const mid = b.hp;
    damageEnemy(t2, 99999);
    return { near, far: b.hp - mid, gap, cap: b.hp <= b.maxHp };
  });
  ck('the Ravenous eats what dies near him', rav.near>0,
     '+'+Math.round(rav.near)+' hp');
  ck('but not what dies across the delve', rav.gap > 260 && rav.far===0,
     Math.round(rav.gap)+' units away, +'+Math.round(rav.far)+' hp');

  await call(['unbroken']);
  const unbr = await p.evaluate(()=>{
    const b=run.boss;
    b.hp=b.maxHp=1e7; b.guardT=0.001; b.braced=false;
    let flips=0, was=b.braced;
    for(let i=0;i<60*22;i++){ updateEnemies(1/60);
      if(b.braced!==was){flips++; was=b.braced;} }
    // The Euphoric Tether makes him immune outright while a Lieutenant
    // stands, so the escort has to be off the board before the guard can be
    // measured at all -- with them up, braced and open both come to nought
    // and "almost nothing lands" passes for the wrong reason.
    for(const e of enemies) if(e.kind==='lieutenant') e.hp=0;
    const tethered=escortAlive();
    b.hp=b.maxHp;
    b.braced=true; const h0=b.hp; damageEnemy(b,10000); const soaked=h0-b.hp;
    b.braced=false; const h1=b.hp; damageEnemy(b,10000); const open=h1-b.hp;
    return { flips, soaked, open, tethered };
  });
  ck('the Unbroken gathers on a rhythm', unbr.flips>=3, unbr.flips+' changes in 22s');
  ck('the escort is off the board before the guard is measured',
     unbr.tethered===false && unbr.open>0,
     'while they stand he is immune, and a guard measured through that is not measured');
  ck('and almost nothing lands while he does', unbr.open>0 && unbr.soaked < unbr.open*0.4,
     Math.round(unbr.soaked)+' vs '+Math.round(unbr.open));

  await call(['wreathed']);
  const wre = await p.evaluate(()=>{
    const b=run.boss;
    for(const e of enemies) if(e.kind==='mirage') e.hp=0;
    b.split = 0;
    updateEnemies(1/60);
    return { mirages: enemies.filter(e=>e.kind==='mirage'&&e.hp>0).length,
             want: b.mirages };
  });
  ck('the Wreathed puts up more lies', wre.mirages>3,
     wre.mirages+' mirages (plain is 3)');

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
