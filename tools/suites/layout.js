/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
// The delve screen is the one place a silent CSS regression takes the whole
// game away: the ladder is a scroll box, so if it is ever allowed to shrink it
// collapses to zero and there is no way to pick a level at all. This measures
// the screen at the sizes a phone actually is.
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
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  for (const [w,h] of [[360,640],[390,844],[430,932],[768,1024]]) {
    const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto(PAGE('index.html')); await sleep(600);
    await p.evaluate(()=>{ stash=loadStash(); stash.xp=xpForLevel(20);
      for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.45,sl.id); saveStash(); });
    await enterHub(p); await p.click('#toDelve'); await sleep(350);
    const r = await p.evaluate(()=>{
      const lw=document.getElementById('levelPick');
      const sel=lw.querySelector('.card.sel');
      const lr=lw.getBoundingClientRect();
      const hero=document.querySelector('#heroPick .card').getBoundingClientRect();
      const begin=document.getElementById('beginRun').getBoundingClientRect();
      const sr=sel?sel.getBoundingClientRect():null;
      return { rungs:lw.children.length, ladderH:lw.clientHeight,
               heroTop:hero.top, beginTop:begin.top, beginH:begin.height,
               selIn: sr ? (sr.bottom>lr.top && sr.top<lr.bottom) : false,
               vh:innerHeight };
    });
    const tag=w+'x'+h;
    ck(tag+': every rung is in the list', r.rungs===52, r.rungs+' rungs');
    ck(tag+': the ladder has height', r.ladderH>140, r.ladderH+'px');
    ck(tag+': the hero cards start on screen', r.heroTop>=0, 'top '+Math.round(r.heroTop));
    ck(tag+': the chosen rung is visible in it', r.selIn);
    ck(tag+': Descend is reachable', r.beginTop+r.beginH<=r.vh+1,
       Math.round(r.beginTop+r.beginH)+' of '+r.vh);
    // The carved chrome has to arrive and has to keep the results screen
    // inside the viewport -- a banner that scales by aspect-ratio is one bad
    // clamp away from pushing Descend off the bottom.
    const chrome = await p.evaluate(async ()=>{
      const cs = getComputedStyle(document.documentElement);
      const vars = ['--plate','--swords','--rune','--ring']
        .map(v => cs.getPropertyValue(v).trim());
      showScreen('over');
      const plate = document.querySelector('#over .plate');
      const btn = document.getElementById('againBtn');
      const pr = plate.getBoundingClientRect(), br = btn.getBoundingClientRect();
      const sc = document.getElementById('over');
      return { filled: vars.every(v => v.indexOf('data:image/png;base64,') > 0),
               plateW: Math.round(pr.width), plateH: Math.round(pr.height),
               fitsWidth: pr.width <= innerWidth,
               reachable: sc.scrollHeight <= sc.clientHeight + 2
                          ? br.bottom <= innerHeight + 1 : true,
               scrolls: sc.scrollHeight > sc.clientHeight };
    });
    ck(tag+': the carved chrome is embedded', chrome.filled);
    ck(tag+': the banner fits the screen', chrome.fitsWidth,
       chrome.plateW+'x'+chrome.plateH);
    ck(tag+': Descend again is reachable', chrome.reachable,
       chrome.scrolls ? 'by scrolling' : 'without scrolling');

    ck(tag+': no console errors', errs.length===0, errs.slice(0,2).join(' | '));
    await p.close();
  }
  await b.close();
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  process.exit(fail.length?1:0);
})();
