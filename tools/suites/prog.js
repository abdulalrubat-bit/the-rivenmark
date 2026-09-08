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
// The gate-house is behind the splash now: the stations live on a tab bar and
// the bar does not exist until you have entered. Idempotent, so it is safe to
// call before every station click however the test got there.
async function enterHub(pg){
  const onSplash = await pg.$eval('#splash', e=>e.classList.contains('on')).catch(()=>false);
  if (!onSplash) return;
  await pg.click('#toGatehouse');
  await new Promise(r=>setTimeout(r,220));
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[];
/* 'x ' on a failure: run-suites.js surfaces exactly that prefix when it
 * summarises a sweep, so without it a red suite reports its count and none
 * of its reasons — which means re-running it alone to find out why. */
const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(600);

  // ---- the ladder ---------------------------------------------------------
  const lad = await p.evaluate(()=>({
    n: LEVELS.length,
    powers: LEVELS.map(L=>L.power),
    quotas: LEVELS.map(L=>L.quota),
    firstHorde: LEVELS[0].horde.length, lastHorde: LEVELS[LEVELS.length-1].horde.length,
    ids: new Set(LEVELS.map(L=>L.id)).size
  }));
  ck('the ladder has 50+ delves', lad.n>=50, lad.n+' delves');
  ck('every delve id is unique', lad.ids===lad.n);
  ck('expected power rises monotonically',
     lad.powers.every((v,i)=>i===0||v>=lad.powers[i-1]),
     lad.powers[0]+' -> '+lad.powers[lad.n-1]);
  ck('quota rises with depth', lad.quotas[lad.n-1]>lad.quotas[0],
     lad.quotas[0]+' -> '+lad.quotas[lad.n-1]);

  // ---- boons are gone -----------------------------------------------------
  const gone = await p.evaluate(()=>({
    noRoll: typeof rollUpgrades==='undefined',
    noTake: typeof takeUpgrade==='undefined',
    noOpen: typeof openLevelUp==='undefined',
    noScreen: !document.getElementById('levelup')
  }));
  ck('boon rolling is gone', gone.noRoll && gone.noTake && gone.noOpen);
  ck('the boon screen is gone', gone.noScreen);

  // ---- slag is experience, and only if you walk out -----------------------
  const xp = await p.evaluate(()=>{
    localStorage.removeItem('rivenmark.stash.v1'); stash = blankStash();
    const o={};
    o.startLevel = stash.level;
    resetRun('isaac'); run.tech = xpForLevel(4);
    endRun(true);
    o.afterWin = { xp: stash.xp, level: stash.level };
    const before = stash.xp;
    resetRun('isaac'); run.tech = 99999;
    endRun(false);
    o.afterLoss = { xp: stash.xp, gained: stash.xp - before };
    return o;
  });
  ck('a delve starts at level 1', xp.startLevel===1);
  ck('extracting banks slag as experience', xp.afterWin.level>1,
     'level 1 -> '+xp.afterWin.level+' on '+xp.afterWin.xp+' slag');
  ck('dying banks nothing', xp.afterLoss.gained===0, 'gained '+xp.afterLoss.gained);

  // ---- level actually makes the hero stronger -----------------------------
  const pw = await p.evaluate(()=>{
    const o={};
    stash.xp = 0; stash.level = 1; resetRun('isaac'); recomputeStats();
    o.l1 = { hp: Math.round(player.maxHp), dmg: +player.damage.toFixed(1) };
    stash.xp = xpForLevel(30); stash.level = 30; resetRun('isaac'); recomputeStats();
    o.l30 = { hp: Math.round(player.maxHp), dmg: +player.damage.toFixed(1) };
    // power level averages hero and kit
    o.bare = powerLevel(player.gear, 30);
    for (const sl of SLOTS) player.gear[sl.id] = rollSetPiece(sl.id);
    o.kitted = powerLevel(player.gear, 30);
    o.lowLevelKitted = powerLevel(player.gear, 1);
    return o;
  });
  ck('levels make the hero stronger', pw.l30.hp>pw.l1.hp && pw.l30.dmg>pw.l1.dmg,
     'L1 '+pw.l1.hp+'hp/'+pw.l1.dmg+'dmg -> L30 '+pw.l30.hp+'hp/'+pw.l30.dmg+'dmg');
  ck('gear raises power level', pw.kitted>pw.bare, pw.bare+' bare -> '+pw.kitted+' kitted');
  ck('power reflects both hero and kit', pw.lowLevelKitted<pw.kitted,
     'L1 kitted '+pw.lowLevelKitted+' vs L30 kitted '+pw.kitted);

  // ---- the ladder UI ------------------------------------------------------
  // The stat probes above ended runs, which leaves the game on the death
  // screen; the gate-house has to be showing before its buttons can be used.
  await p.evaluate(()=>{ stash = blankStash(); saveStash();
                         state='menu'; refreshKitLine(); showScreen('splash'); });
  await sleep(150);
  await enterHub(p); await p.click('#toDelve'); await sleep(300);
  ck('every rung renders', (await p.$$('#levelPick .card')).length>=50);
  ck('a rung is preselected', (await p.$$('#levelPick .card.sel')).length===1);
  ck('standing is shown', (await p.$$('#levelPick .standing')).length>=50);
  const opened = await p.evaluate(()=>document.querySelector('#levelPick .card.sel').dataset.level);
  ck('opens on the deepest delve you match', opened==='test',
     'at power '+await p.evaluate(()=>stashPower())+' it opened on '+opened);

  // with real power, it should open deeper
  await p.evaluate(()=>{ stash.xp = xpForLevel(40); stash.level = 40;
    for (const sl of SLOTS) stash.gear[sl.id] = rollSetPiece(sl.id); saveStash(); });
  await p.click('#delveBack'); await sleep(150);
  await enterHub(p); await p.click('#toDelve'); await sleep(300);
  const deep = await p.evaluate(()=>({
    sel: document.querySelector('#levelPick .card.sel').dataset.level,
    pw: stashPower() }));
  ck('a strong hero opens deeper down the ladder', deep.sel!=='test',
     'power '+deep.pw+' opened on '+deep.sel);

  /* ---- the front door speaks the hero's own units --------------------------
   *
   * The gate-house and the ladder each had a number called "power" and they
   * were not the same quantity. powerLevel() starts a Vanguard at 1; the
   * ladder's floor was 4, written down as "where a Vanguard who has never
   * descended stands". And delveStanding compared them by SUBTRACTION, with
   * bands of twelve and fourteen points, on a scale running 1 to 120 that is
   * measured in ratios everywhere else in the file.
   *
   * The cost was the whole front door: on a fresh stash the gate-house showed
   * one rung "above your weight" and fifty-one "far beyond you", including
   * the rung it was simultaneously recommending. These checks are about that
   * first screen, and the last of them is the one that would have caught it.
   */
  const front = await p.evaluate(() => {
    const o = {};
    const tally = pw => { const t = { trivial:0, even:0, hard:0, deadly:0 };
      for (const L of LEVELS) t[delveStanding(L, pw).id]++; return t; };
    stash = blankStash(); saveStash();
    o.freshPower = stashPower();
    o.rung0Power = LEVELS[0].power;
    o.freshStanding = delveStanding(LEVELS[0], stashPower()).id;
    o.freshTally = tally(stashPower());
    o.freshRecommends = recommendedLevel(stashPower());
    o.rung0Id = LEVELS[0].id;
    o.rungCount = LEVELS.length;
    /* THE BANDS MEAN THE SAME THING AT BOTH ENDS. Carrying a fixed FRACTION
     * of a rung's asking power must read the same at rung 3 and rung 44 --
     * that is the whole of what "different units" meant, and a difference-
     * based band cannot do it however the numbers are chosen. */
    o.sameShallow = [];
    o.sameDeep = [];
    for (const f of [1.5, 1.0, 0.8, 0.4]) {
      o.sameShallow.push(delveStanding(LEVELS[3], Math.round(LEVELS[3].power * f)).id);
      o.sameDeep.push(delveStanding(LEVELS[44], Math.round(LEVELS[44].power * f)).id);
    }
    // ...and the ladder still gets harder as you go down, at a fixed power.
    o.monotone = true;
    const at = 40, seen = [];
    for (const L of LEVELS) seen.push(delveStanding(L, at).id);
    const rank = { trivial:3, even:2, hard:1, deadly:0 };
    for (let i = 1; i < seen.length; i++)
      if (rank[seen[i]] > rank[seen[i-1]]) o.monotone = false;
    o.atPower40 = seen[0] + ' -> ' + seen[seen.length-1];
    return o;
  });
  ck('a Vanguard who has never descended reads the same units as the ladder',
     front.freshPower === front.rung0Power,
     'hero ' + front.freshPower + ', proving ground ' + front.rung0Power +
     (front.freshPower === front.rung0Power ? ''
       : ' — TWO SCALES, and the front door is written in the wrong one'));
  ck('...so the proving ground is an even match, not a warning',
     front.freshStanding === 'even', 'it reads "' + front.freshStanding + '"');
  ck('and the gate-house sends them there',
     front.freshRecommends === front.rung0Id, 'opens on ' + front.freshRecommends);
  ck('the rung it recommends is not one it calls beyond you',
     ['even','trivial'].indexOf(
       front.freshStanding) >= 0 && front.freshRecommends === front.rung0Id,
     'recommended ' + front.freshRecommends + ', labelled "' + front.freshStanding + '"');
  ck('a new player is not shown a ladder of nothing but red',
     front.freshTally.even + front.freshTally.trivial >= 1,
     front.freshTally.trivial + ' well within, ' + front.freshTally.even +
     ' even, ' + front.freshTally.hard + ' above, ' + front.freshTally.deadly +
     ' beyond — of ' + front.rungCount);
  ck('THE SAME FRACTION OF A RUNG READS THE SAME AT BOTH ENDS OF THE LADDER',
     front.sameShallow.join() === front.sameDeep.join(),
     'at 1.5x/1.0x/0.8x/0.4x — rung 3 ' + front.sameShallow.join('/') +
     ', rung 44 ' + front.sameDeep.join('/') +
     (front.sameShallow.join() === front.sameDeep.join() ? ''
       : ' — THE BANDS ARE ABSOLUTE ON A SCALE THAT IS NOT'));
  ck('and the control: the ladder still only ever gets harder',
     front.monotone === true,
     'at a fixed power 40, rung 0 to 51: ' + front.atPower40 +
     (front.monotone ? '' : ' — A RUNG READS EASIER THAN THE ONE ABOVE IT'));

  // put the stash back for anything below that expects a fresh one
  await p.evaluate(() => { stash = blankStash(); saveStash(); });

  // ---- a deep delve actually plays ---------------------------------------
  const deepRun = await p.evaluate(()=>{
    resetRun('isaac', LEVELS[LEVELS.length-1].id, 'riven');
    return { level: LEVEL.id, quota: LEVEL.quota, enemies: enemies.length,
             open: openCells.length, state };
  });
  ck('the deepest delve generates and populates',
     deepRun.enemies>20 && deepRun.open>200, JSON.stringify(deepRun));

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
