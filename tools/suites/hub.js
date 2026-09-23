/* The gate-house as a place you move around in.
 *
 * Asked of the gate-house that ships: a tab a station, each lighting only
 * itself, any station reachable from any other in one tap, and none of it
 * laid over a live delve -- where the bag is the only screen, and its way out
 * goes back into the delve rather than up to the gate-house.
 *
 * This suite used to measure the canvas build's gate-house, and most of it
 * went with that build because it was about how that build LOOKED rather than
 * how the gate-house works: its embedded display face (Cinzel), the stone and
 * rune textures it forged for its CSS, the splash-then-tab-bar flow, the
 * captions under each tab, and the plates its canvas HUD painted. The Phaser
 * menus are styled another way; smoke:boot walks every station and
 * smoke:play measures the HUD. Bringing the display face to the Phaser menus
 * is on the roadmap as polish.
 */
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
  await p.goto(pages.game('norun'));
  await p.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
  await p.evaluate(()=>{ localStorage.clear(); stash=blankStash(); stash.coins=4321; saveStash(); });
  await p.goto(pages.game());
  await p.waitForSelector('#screens.up #descend', {timeout:30000});

  const lit = () => p.$$eval('#screens .tabs button.on', b=>b.map(x=>x.dataset.tab));
  const h1 = () => p.$eval('#screens h1', e=>e.textContent);
  ck('the game opens at the gate-house', /Gate-House/.test(await h1()));
  ck('with its own tab lit', (await lit()).join()==='splash');

  // ---- moving between stations without going back -------------------------
  const want = { gear:/Forge/, vendor:/Vendor/, hall:/Hall/, splash:/Gate-House/ };
  for (const tab of ['gear','vendor','hall','splash']) {
    await p.click('#screens .tabs [data-tab="'+tab+'"]'); await sleep(220);
    ck('the '+tab+' tab opens its station', want[tab].test(await h1()), await h1());
    ck('...and lights only itself', (await lit()).join()===tab, (await lit()).join());
  }
  await p.click('#screens .tabs [data-tab="hall"]'); await sleep(200);
  await p.click('#screens .tabs [data-tab="gear"]'); await sleep(220);
  ck('a station reaches a station directly', /Forge/.test(await h1()));
  await p.click('#screens .tabs [data-tab="vendor"]'); await sleep(220);
  ck('the purse shows where coin is spent',
     /4321/.test(await p.$eval('#screens .purse', e=>e.innerText)));

  // ---- the bag inside a delve is NOT a station ----------------------------
  await p.click('#screens .tabs [data-tab="splash"]'); await sleep(200);
  await p.click('#descend'); await sleep(900);
  ck('a run starts', await p.evaluate(()=>state)==='play');
  ck('no screen over a live delve',
     await p.evaluate(()=>!document.getElementById('screens').classList.contains('up')));
  await p.click('#hud .hold .bag'); await sleep(300);
  ck('the bag opens', /Bag/.test(await h1()));
  ck('but with no tabs over it', (await p.$$('#screens .tabs')).length===0);
  ck('and its way out returns to the delve, not the gate-house',
     /delve/i.test(await p.$eval('#bagBack', e=>e.textContent)),
     await p.$eval('#bagBack', e=>e.textContent));
  await p.click('#bagBack'); await sleep(300);
  ck('closing it puts you back in the run', await p.evaluate(()=>state)==='play');

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
