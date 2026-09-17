/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
const {chromium}=require('playwright');
// RIVENMARK_PAGE points the suite at a different page without touching its
// source. verify-core uses it to run the SAME file against index.html and
// against the extracted core; it used to rewrite the URL with a string
// replace, which silently stopped matching the moment this line changed.
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
let pass=0,fail=0;
/* 'x ' on a failure, and not 'FAIL': run-suites.js surfaces exactly that
 * prefix when it summarises a sweep, so this suite reported its count and
 * none of its reasons — which means re-running it alone to find out why. */
const ok=(c,m)=>{ if(c){pass++;} else {fail++;console.log('  x',m);} };
(async()=>{
const b=await chromium.launch();
const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(PAGE('index.html'));
await new Promise(r=>setTimeout(r,900));
const R=await p.evaluate(()=>{
  const o={};
  o.types = ['gorger','flayer','shaman'].map(k=>{
    const d=ENEMY_TYPES[k];
    return {k, has:!!d, spr:!!SPR[k], gait:!!SPR[k+'r7'], role:d&&d.role,
            weight:d&&d.weight, from:d&&d.from, tech:d&&d.tech};
  });
  // Each new kind is introduced on its own rung, and only one new kind per rung.
  o.ramp = RAMP.map(r=>r.horde.slice());
  o.lessons = RAMP.map(r=>r.lesson);
  o.full = FULL_HORDE.slice();

  // What actually lands on the map, which is the only number that matters: a
  // weight in PACK_MIX is not a share, because the depth gate decides how many
  // sites a kind can even compete for.
  const census=(id,cuts)=>{
    const tot={};let n=0;
    for(let c=0;c<cuts;c++){
      startRun('isaac',id);
      if(!LEVEL||LEVEL.id!==id) throw new Error('census asked for '+id+', got '+(LEVEL&&LEVEL.id));
      for(const e of enemies){tot[e.kind]=(tot[e.kind]||0)+1;n++;}
    }
    const sh={};for(const k in tot)sh[k]=+(tot[k]/n).toFixed(3);
    sh._n=Math.round(n/cuts);return sh;
  };
  o.deep = census('delve9', 10);
  o.rung5 = census('delve5', 6);
  o.rung6 = census('delve6', 6);
  o.first = census('delve1', 6);

  // A roster missing a kind must never return it, at any depth.
  const thin=['thrall','eclipse'];
  const seen={};
  for(let i=0;i<20000;i++) seen[packKind(thin,Math.random())]=1;
  o.thinSeen = Object.keys(seen).sort();

  // The bleed a flayer opens: non-stacking, refreshes, and ticks through
  // i-frames (that is the point of it -- you cannot roll a wound off).
  const P=player; const hp0=P.hp;
  P.iFrames=99; openWound(BLEED_DPS, BLEED_TIME);
  const t1=P.bleed, d1=P.bleedDps;
  openWound(BLEED_DPS, BLEED_TIME*0.2);           // a weaker refresh must not shorten it
  o.refresh = {before:+t1.toFixed(2), after:+P.bleed.toFixed(2), dps:d1};
  let acc=0; for(let i=0;i<40;i++){ const h=P.hp; updateBleed(0.1); acc+=h-P.hp; }
  o.bledThroughIFrames = acc > 0;
  o.bleedEnds = P.bleed <= 0;
  P.hp=hp0; P.bleed=0;

  // The gloom a shaman casts is a timed curse, not a permanent one.
  castGloom(); const g1=run.gloom;
  for(let i=0;i<200;i++) updateGloom(0.05);
  o.gloom = {cast:+g1.toFixed(2), afterTenSeconds:+run.gloom.toFixed(2)};

  // And it has to actually reach the screen. A curse whose only evidence is a
  // number ticking down is not a curse; measure the frame it produces.
  window.requestAnimationFrame=()=>0;
  const lum=()=>{ draw(2);
    const d=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const W=canvas.width,H=canvas.height;
    let all=0,edge=0,ne=0,n=0;
    for(let y=0;y<H;y+=3)for(let x=0;x<W;x+=3){
      const i=(y*W+x)*4, l=d[i]*0.3+d[i+1]*0.6+d[i+2]*0.1;
      all+=l; n++;
      if(x<W*0.12||x>W*0.88||y<H*0.12||y>H*0.88){edge+=l;ne++;}
    }
    return {all:all/n, edge:edge/ne}; };
  run.gloom=0;              const gOff=lum();
  run.gloom=GLOOM_TIME*0.5; const gOn=lum();
  run.gloom=0;
  o.dim = { all:+(100*(1-gOn.all/gOff.all)).toFixed(1),
            edge:+(100*(1-gOn.edge/gOff.edge)).toFixed(1), lowFx };
  return o;
});

console.log('-- the three kinds exist and are drawn --');
for(const t of R.types){
  ok(t.has, t.k+' is in ENEMY_TYPES');
  ok(t.spr, t.k+' has a rest sprite');
  ok(t.gait, t.k+' has a full gait cycle');
  ok(t.tech===1||t.tech===2||t.tech===3, t.k+' tech in range, got '+t.tech);
}
ok(R.types.find(t=>t.k==='flayer').role==='stalk','flayer stalks');
ok(R.types.find(t=>t.k==='shaman').role==='chant','shaman chants');
ok(R.types.find(t=>t.k==='gorger').role==='press','gorger presses');

console.log('-- one new kind per rung, in order --');
for(let i=1;i<R.ramp.length;i++){
  const added=R.ramp[i].filter(k=>R.ramp[i-1].indexOf(k)<0);
  ok(added.length===1, 'rung '+i+' adds exactly one kind, added ['+added+']');
  ok(R.ramp[i-1].every(k=>R.ramp[i].indexOf(k)>=0), 'rung '+i+' keeps everything before it');
}
ok(R.ramp.length===8, 'eight rungs, got '+R.ramp.length);
['flayer','gorger','shaman'].forEach(k=>
  ok(R.full.indexOf(k)>=0, k+' is in the full horde'));
ok(R.lessons.every(l=>l&&l.length>10), 'every rung carries a lesson');
ok(new Set(R.lessons).size===R.lessons.length, 'no two rungs share a lesson');

console.log('-- what lands on the map --');
for(const [k,v] of [['delve9',R.deep],['delve6',R.rung6],['delve5',R.rung5],['delve1',R.first]])
  console.log('   '+k.padEnd(7), JSON.stringify(v));

// Every kind in the roster has to actually turn up, or the rung that
// introduces it teaches nothing.
for(const k of ['thrall','eclipse','breaker','husk','cantor','flayer','gorger','shaman'])
  ok(R.deep[k]>0.02, k+' is a real presence deep, got '+(R.deep[k]||0));
ok(R.deep.gorger>0.035&&R.deep.gorger<0.10, 'gorger is rare but met, got '+R.deep.gorger);
ok(R.deep.shaman>0.025&&R.deep.shaman<0.09, 'shaman is rarest, got '+R.deep.shaman);
ok(R.deep.breaker>0.08&&R.deep.breaker<0.16,
   'the breaker keeps roughly the share it had before the new kinds, got '+R.deep.breaker);
ok(R.deep.thrall>0.12, 'thrall is not starved out deep, got '+R.deep.thrall);

// A kind must not appear on a rung before the one that introduces it.
ok(!R.rung5.gorger&&!R.rung5.shaman, 'no gorger or shaman on the flayer rung');
ok(R.rung5.flayer>0.05, 'flayers are met on their own rung, got '+R.rung5.flayer);
ok(!R.rung6.shaman, 'no shaman on the gorger rung');
ok(R.rung6.gorger>0.02, 'gorgers are met on their own rung, got '+R.rung6.gorger);
ok(!R.first.gorger&&!R.first.shaman&&!R.first.flayer&&!R.first.breaker,
   'the first delve is still only thralls and eclipses');
ok(R.thinSeen.join()==='eclipse,thrall',
   'a thin roster only ever yields what is in it, got '+R.thinSeen.join());

console.log('-- the flayer wound and the shaman curse --');
console.log('   ', JSON.stringify(R.refresh), JSON.stringify(R.gloom));
ok(R.refresh.after>=R.refresh.before-0.01, 'a weaker wound does not shorten a standing one');
ok(R.bledThroughIFrames, 'a wound ticks through i-frames');
ok(R.bleedEnds, 'a wound runs out');
ok(R.gloom.cast>0, 'gloom lands');
ok(R.gloom.afterTenSeconds===0, 'gloom lifts, got '+R.gloom.afterTenSeconds);
ok(R.dim.all>12, 'gloom visibly takes the light: '+R.dim.all+'% dimmer overall');
ok(R.dim.edge>R.dim.all, 'and it closes in from the edges: '+R.dim.edge+'% there');

ok(errs.length===0, 'no page errors: '+errs.join('|'));
console.log('\n'+pass+' passed, '+fail+' failed');
await b.close(); process.exit(fail?1:0);})();
