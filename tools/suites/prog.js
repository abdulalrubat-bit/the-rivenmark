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
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push(n+(note?'  ['+note+']':''));
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
