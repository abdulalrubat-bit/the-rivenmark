/* How the bodies read against the floor they stand on.
 *
 * Everything else about a sprite is checked by shape -- the right pose exists,
 * it is the right size, its feet are in the right place. Nothing checked
 * whether you could SEE it, and the answer was often no: measured on the
 * light-facing boundary, five of the eleven creatures had a lit edge darker
 * than the floor underneath them. They were not reading as bodies, they were
 * reading as holes.
 *
 * So these assert the two things the light pass is for -- an edge you can pick
 * out against the floor, and enough value range inside the silhouette to tell
 * a plate from a rag -- plus the property that makes it safe: it must not
 * change the shape of anything.
 */
const { chromium } = require('playwright');
// The forge page: it paints the sprites being looked at, and it loads the core,
// which has deathPose.
const pages = require('./_pages.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.forge()); await sleep(800);

  const R = await p.evaluate(() => {
    const lum = (r,g,b) => 0.2126*r + 0.7152*g + 0.0722*b;
    const FLOOR = lum(0x2b, 0x21, 0x18);          // PAL.floor, what they stand on
    const read = c => {
      const px = c.width;
      const d = c.getContext('2d').getImageData(0, 0, px, px).data;
      const at = (x,y) => (x<0||y<0||x>=px||y>=px) ? 0 : d[((px*y)+x)*4+3];
      // The LIGHT-FACING boundary: opaque, with empty space up-light of it.
      // Whole-sprite statistics cannot see a two-pixel rim; this is the only
      // place it exists.
      const dx = -Math.round(LIGHT.x*3), dy = -Math.round(LIGHT.y*3);
      const edge = [], all = [];
      let x0=px, y0=px, x1=-1, y1=-1;
      for (let y=0;y<px;y++) for (let x=0;x<px;x++) {
        const i = ((px*y)+x)*4;
        if (d[i+3] > 8) { if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
        if (d[i+3] < 200) continue;
        const L = lum(d[i], d[i+1], d[i+2]);
        all.push(L);
        if (at(x+dx, y+dy) <= 64) edge.push(L);
      }
      const med = a => { a.sort((m,n)=>m-n); return a[a.length>>1] || 0; };
      const q = (a,f) => a[Math.floor(a.length*f)] || 0;
      all.sort((m,n)=>m-n);
      return { edge: med(edge), spread: q(all,0.9)-q(all,0.1), box: [x0,y0,x1,y1] };
    };
    const out = {};
    for (const k in ENEMY_TYPES) {
      const c = SPR[k];
      // The Deceiver and his mirages are forged by a different function with
      // no pose at all, so there is no bare twin to compare them against.
      if (!c || !c.width || k === 'deceiver' || k === 'mirage') continue;
      const r = read(c);
      // The same body forged with the light pass switched off, to prove the
      // pass is what is doing this and to check it moves nothing.
      const bare = forgeEnemy(k, ENEMY_TYPES[k].r, ENEMY_TYPES[k].color, GAIT_REST, true);
      out[k] = { lit: r, bare: read(bare) };
    }
    return { FLOOR, out };
  });

  const kinds = Object.keys(R.out);
  ck('there are bodies to look at', kinds.length >= 9, kinds.length + ' kinds');

  // A lit edge darker than the floor is a hole in the floor, not a creature.
  const dark = kinds.filter(k => (R.out[k].lit.edge + 5) / (R.FLOOR + 5) < 1.4);
  ck('every body has an edge you can see against the floor', dark.length === 0,
     dark.length ? dark.map(k => k + ' ' +
       ((R.out[k].lit.edge+5)/(R.FLOOR+5)).toFixed(2) + ':1').join(', ')
     : kinds.length + ' kinds, weakest ' +
       Math.min(...kinds.map(k => (R.out[k].lit.edge+5)/(R.FLOOR+5))).toFixed(2) + ':1');

  // And the pass is what put it there.
  const gained = kinds.filter(k => R.out[k].lit.edge > R.out[k].bare.edge + 15);
  ck('and the light pass is what puts it there', gained.length === kinds.length,
     gained.length + ' of ' + kinds.length + ' brighter at the edge than unlit');

  // Enough range inside the silhouette to tell a plate from a rag.
  const flat = kinds.filter(k => R.out[k].lit.spread < 60);
  ck('and enough value range inside it to read a material', flat.length === 0,
     flat.length ? flat.map(k => k + ' ' + R.out[k].lit.spread.toFixed(0)).join(', ')
     : 'flattest is ' + Math.min(...kinds.map(k => R.out[k].lit.spread)).toFixed(0));

  /* And it changes no shape at all.
   *
   * This is the property that makes lighting a finished sprite safe rather
   * than clever: both edges are drawn strictly inside the silhouette that was
   * already there, so nothing moves, resizes, or parts company with the shadow
   * and foot line every other check in this repo depends on.
   */
  const moved = kinds.filter(k =>
    R.out[k].lit.box.join() !== R.out[k].bare.box.join());
  ck('while moving nothing', moved.length === 0,
     moved.length ? moved.map(k => k + ' ' + R.out[k].bare.box + ' -> ' +
                                   R.out[k].lit.box).join('; ')
     : kinds.length + ' bounding boxes identical lit and unlit');

  /* And a killed body falls over rather than being deleted.
   *
   * deathPose is the core's, and the Phaser scene draws the fall from it; this
   * is the arithmetic, smoke:delve is the drawing. The fall is a rigid rotation pivoted onto
   * the feet, and the compensation that puts the pivot there is the part
   * worth asserting -- a body turned about the middle of its sprite swings its
   * legs out from under it and looks thrown rather than felled.
   */
  const D = await p.evaluate(() => {
    const e = { hp: 0, r: 20, face: 1 };
    const at = f => { e.dieAt = performance.now() - DIE_MS * f; return deathPose(e); };
    const walk = [0, 0.25, 0.5, 0.75, 0.99].map(f => {
      const d = at(f);
      // Guarded rather than trusted: a deathPose that reports `done` partway
      // through the fall is exactly the regression this is here to catch, and
      // reading .rot off it would throw -- which aborts the run and diagnoses
      // nothing instead of failing the one check that is wrong.
      if (!d || d.done) return { over: true, at: f };
      // Where the FEET end up. Rotating (0, fo) by rot puts them at
      // (-fo sin, fo cos); the offsets should bring that back to (0, fo).
      const fo = e.r * 1.10;
      return { rot: +d.rot.toFixed(3), a: +d.alpha.toFixed(2),
               footX: +(d.dx - fo * Math.sin(d.rot)).toFixed(2),
               footY: +(d.dy + fo * Math.cos(d.rot) - fo).toFixed(2) };
    });
    e.dieAt = performance.now() - DIE_MS * 1.2;
    const over = deathPose(e);
    e.hp = 5;
    const alive = deathPose(e);
    // Which way it goes should follow which way it was facing.
    const left = { hp: 0, r: 20, face: -1, dieAt: performance.now() - DIE_MS * 0.5 };
    const lp = deathPose(left);
    return { walk, done: over.done, alive, leftRot: lp && lp.rot };
  });

  const early = D.walk.filter(w => w.over);
  ck('a killed body falls over', early.length === 0 && D.walk[0].rot === 0 &&
     D.walk.every((w, i) => i === 0 || w.rot > D.walk[i-1].rot) &&
     D.walk[4].rot > 1,
     early.length ? 'already over ' + early.length + ' of 5 samples in, first at ' +
                    early[0].at + ' of the fall'
                  : 'tilt: ' + D.walk.map(w => w.rot).join(' '));
  // Sideways drift must be exactly nothing. Downward drift must be exactly the
  // sink deathPose adds on purpose (ease * r * 0.12, so 2.4 at r 20) and not a
  // pixel more -- a loose bound here would pass a pivot that was merely close.
  ck('and turns on its feet, not its middle',
     early.length === 0 && D.walk.every(w => Math.abs(w.footX) < 0.01 && w.footY >= 0 && w.footY <= 2.41),
     'feet drift across the fall: ' +
       D.walk.map(w => w.over ? 'over' : w.footX + '/' + w.footY).join('  '));
  ck('and falls the way it was facing',
     D.leftRot < 0 && !D.walk[2].over && Math.abs(D.leftRot + D.walk[2].rot) < 0.01,
     'facing left tilts ' + (D.leftRot === undefined ? 'nothing' : D.leftRot.toFixed(3)) +
     ', facing right ' + D.walk[2].rot);
  ck('and is gone once it lands', D.done === true, 'done: ' + D.done);
  ck('while a living body is not falling over at all',
     D.alive === null, 'deathPose of a live body: ' + JSON.stringify(D.alive));

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close();
  process.exit(fail.length?1:0);
})();
