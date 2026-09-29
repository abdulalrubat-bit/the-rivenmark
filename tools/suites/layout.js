// The gate-house is the one place a silent CSS regression takes the whole game
// away. This measures the screens that ship at the sizes a phone actually is --
// Home, the Delves list (a scroll box, so if it is ever allowed to shrink it
// collapses to nothing and there is no way to pick a delve at all), the bar
// along the bottom, and the card a delve ends on -- from a small Android to a
// tablet.
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
    // HOME: who goes down, the delve as a card, and Descend above the bar.
    const home = await p.evaluate(()=>{
      const hero=document.querySelector('#heroRows .row').getBoundingClientRect();
      const d=document.getElementById('descend').getBoundingClientRect();
      const bar=document.querySelector('#screens nav.tabs').getBoundingClientRect();
      const card=document.querySelector('#screens .card').getBoundingClientRect();
      return { heroTop:hero.top, dTop:d.top, dBottom:d.bottom, barTop:bar.top, barBottom:bar.bottom,
               tabs:document.querySelectorAll('#screens nav.tabs button').length,
               cardW:Math.round(card.width), vw:innerWidth, vh:innerHeight };
    });
    const tag=w+'x'+h;
    ck(tag+': the hero rows start on screen', home.heroTop>=0, 'top '+Math.round(home.heroTop));
    ck(tag+': the bar sits on the bottom of the glass', home.tabs===7 &&   // Home, Delves, Forge, Talents, Vendor, Hall, settings
       home.barBottom<=home.vh+1 &&
       home.barTop>home.vh-120, home.tabs+' tabs at '+Math.round(home.barTop)+'-'+Math.round(home.barBottom));
    // Descend is pinned to the bottom of the scroller, just above the bar, so
    // it is on screen however long the card is and never under the bar.
    ck(tag+': Descend is on screen, above the bar', home.dTop>=0 && home.dBottom<=home.barTop+1,
       Math.round(home.dBottom)+' against a bar at '+Math.round(home.barTop));
    ck(tag+': the card fits the screen', home.cardW<=home.vw, home.cardW+' in '+home.vw);

    // THE DELVES: the rung list is a scroll box, so if it is ever allowed to
    // shrink it collapses to nothing and there is no way to pick a delve.
    await p.click('#screens nav.tabs [data-tab="delves"]'); await sleep(250);
    const r = await p.evaluate(()=>{
      const lw=document.getElementById('rungRows');
      const sel=lw.querySelector('.row.on');
      const lr=lw.getBoundingClientRect();
      const d=document.getElementById('descendHere').getBoundingClientRect();
      const bar=document.querySelector('#screens nav.tabs').getBoundingClientRect();
      const sr=sel?sel.getBoundingClientRect():null;
      return { rungs:lw.querySelectorAll('[data-level]').length, all:LEVELS.length, ladderH:lw.clientHeight,
               dTop:d.top, dBottom:d.bottom, barTop:bar.top,
               selIn: sr ? (sr.bottom>lr.top && sr.top<lr.bottom) : false };
    });
    ck(tag+': the whole ladder is in the list', r.rungs===r.all, r.rungs+' of '+r.all+' rungs');
    ck(tag+': the list has height', r.ladderH>140, r.ladderH+'px');
    ck(tag+': the chosen rung is scrolled into view', r.selIn);
    ck(tag+': its Descend is on screen, above the bar', r.dTop>=0 && r.dBottom<=r.barTop+1,
       Math.round(r.dBottom)+' against a bar at '+Math.round(r.barTop));

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
