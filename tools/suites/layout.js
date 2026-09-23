// The gate-house is the one place a silent CSS regression takes the whole game
// away: the rung list is a scroll box, so if it is ever allowed to shrink it
// collapses to nothing and there is no way to pick a delve at all. This
// measures the screens that ship at the sizes a phone actually is -- the
// gate-house, and the card a delve ends on -- from a small Android to a tablet.
//
// It measured the canvas build's menus until that build was retired. One check
// went with it: "the carved chrome is embedded" was about that UI's image-cut
// CSS plates; the Phaser cards are drawn with gradients and have none.
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async () => {
  await pages.serve();
  const b=await chromium.launch();
  for (const [w,h] of [[360,640],[390,844],[430,932],[768,1024]]) {
    const p=await (await b.newContext({viewport:{width:w,height:h}, isMobile: w < 700,
                                       hasTouch: true})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    // A hero with something to their name, so the gate-house opens part way
    // down the ladder rather than at its top -- the harder case for keeping
    // the chosen rung in view.
    await p.goto(pages.game('norun'));
    await p.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
    await p.evaluate(()=>{ localStorage.clear(); stash=blankStash(); stash.xp=xpForLevel(20);
      for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.45,sl.id); saveStash(); });
    await p.goto(pages.game());
    await p.waitForSelector('#screens.up #descend', {timeout:30000});
    await sleep(300);
    const r = await p.evaluate(()=>{
      const lw=document.getElementById('rungRows');
      const sel=lw.querySelector('.row.on');
      const lr=lw.getBoundingClientRect();
      const hero=document.querySelector('#heroRows .row').getBoundingClientRect();
      const d=document.getElementById('descend').getBoundingClientRect();
      const sr=sel?sel.getBoundingClientRect():null;
      const card=document.querySelector('#screens .card').getBoundingClientRect();
      return { rungs:lw.querySelectorAll('[data-level]').length, ladderH:lw.clientHeight,
               heroTop:hero.top, dTop:d.top, dBottom:d.bottom,
               selIn: sr ? (sr.bottom>lr.top && sr.top<lr.bottom) : false,
               cardW:Math.round(card.width), vw:innerWidth, vh:innerHeight };
    });
    const tag=w+'x'+h;
    ck(tag+': a full window of rungs is in the list', r.rungs>=8, r.rungs+' rungs');
    ck(tag+': the list has height', r.ladderH>140, r.ladderH+'px');
    ck(tag+': the hero rows start on screen', r.heroTop>=0, 'top '+Math.round(r.heroTop));
    ck(tag+': the chosen rung is visible in it', r.selIn);
    // Descend is pinned to the bottom of the scroller, so it is on screen
    // however long the card is.
    ck(tag+': Descend is on screen', r.dTop>=0 && r.dBottom<=r.vh+1,
       Math.round(r.dBottom)+' of '+r.vh);
    ck(tag+': the card fits the screen', r.cardW<=r.vw, r.cardW+' in '+r.vw);

    // The card a delve ends on. Died in, so the outcome text is the long one.
    const over = await p.evaluate(async ()=>{
      __game.scene.getScene('delve').newRun('isaac', LEVELS[0].id);
      for (let i=0;i<3;i++) player.bag.push(rollItem(0.5));
      player.hp=0; endRun(false);
      await new Promise(r=>setTimeout(r,200));
      const sc=document.getElementById('screens');
      const card=sc.querySelector('.card').getBoundingClientRect();
      const go=sc.querySelector('.go');
      go.scrollIntoView({block:'end'});
      const gr=go.getBoundingClientRect();
      return { up: sc.classList.contains('up'), h1: sc.querySelector('h1').textContent,
               cardW:Math.round(card.width), fits: card.width<=innerWidth,
               reachable: gr.bottom<=innerHeight+1 && gr.top>=0,
               scrolls: sc.scrollHeight>sc.clientHeight };
    });
    ck(tag+': the outcome card fits the screen', over.up && over.fits,
       over.h1+', '+over.cardW+'px wide');
    ck(tag+': Descend again is reachable', over.reachable,
       over.scrolls ? 'by scrolling' : 'without scrolling');

    ck(tag+': no console errors', errs.length===0, errs.slice(0,2).join(' | '));
    await p.close();
  }
  await b.close(); pages.stop();
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  process.exit(fail.length?1:0);
})();
