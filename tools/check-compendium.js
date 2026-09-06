#!/usr/bin/env node
/* Checks docs/compendium.html against the game.

   The compendium is a world-building document and it states a great many
   numbers. A document that quietly disagrees with the game is worse than no
   document at all -- it is a source someone will trust -- and index.html is
   tuned constantly, so these WILL drift. Every figure the mechanical books
   claim is read back off the running game here and compared.

   This does not check the prose, only the numbers, and only the ones listed
   below. Adding a figure to the compendium means adding it here too.

   Run: node tools/check-compendium.js       (needs playwright + chromium)
*/
const { chromium } = require('playwright');
const fs=require('fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext()).newPage();
  await p.goto('file://'+require('path').join(__dirname,'..','index.html')); await sleep(900);
  const g = await p.evaluate(()=>{
    const A=id=>ABILITY_BY_ID[id];
    return {
      gcd:GCD_TIME, hitstop:HITSTOP_MAX*1000, swapGcd:GCD_TIME*1.25, swapCd:SWAP_CD,
      charges:CHARGE_MAX, tension:TENSION_MAX, regen:TENSION_REGEN,
      anchorReach:A('anchor').reach, aegisR:A('aegis').radius, aegisMit:A('aegis').mitigate,
      massCd:A('mass').cd, massRoot:A('mass').root,
      purgeCd:A('purge').cd, purgeCh:A('purge').channel, purgePct:A('purge').healPct*100,
      guillReach:A('guillotine').reach, vuln:VULN_MULT,
      truthReach:A('truth').reach, truthBuild:A('truth').build,
      nullPct:A('nullzone').costPct*100,
      decryptCd:A('decrypt').cd, decryptSil:A('decrypt').silence,
      jarsCd:A('jars').cd, jarsUses:A('jars').uses, jarsPct:A('jars').healPct*100,
      calcAt:CALCIFY_AT*100, calcTime:CALCIFY_TIME, calcBreak:CALCIFY_BREAK,
      totemHp:TOTEM_HP, totemR:TOTEM_R, totemHps:TOTEM_HPS, totemLife:TOTEM_LIFE,
      consume:CONSUME_TIME, live:HORDE_LIVE,
      siphon:SIPHON_TIME, rupture:RUPTURE_WIND, breath:BREATH_TIME,
      dawnBreath:DAWN_BREATH, stun:NULLIFY_STUN
    };
  });
  await b.close();

  // What the compendium says, keyed to what the game says.
  const claims = [
    ['global cooldown of 1.2',        g.gcd,        1.2],
    ['freezes for 90ms',              g.hitstop,    90],
    ['the swap costs 1.5s',           g.swapGcd,    1.5],
    ['swap cooldown 5s',              g.swapCd,     5],
    ['Charges max 3',                 g.charges,    3],
    ['Tension pool 100',              g.tension,    100],
    ['Tension regen 4/s',             g.regen,      4],
    ['Anchoring Strike reach 96',     g.anchorReach,96],
    ['Aegis radius 150',              g.aegisR,     150],
    ['Aegis 2s mitigation',           g.aegisMit,   2],
    ['Unyielding Mass cd 12',         g.massCd,     12],
    ['Unyielding Mass root 4s',       g.massRoot,   4],
    ['Grounding Purge cd 14',         g.purgeCd,    14],
    ['Grounding Purge channel 3s',    g.purgeCh,    3],
    ['Grounding Purge 15%/s',         g.purgePct,   15],
    ['Guillotine reach 96',           g.guillReach, 96],
    ['Guillotine x5 on Vulnerable',   g.vuln,       5],
    ['Piercing Truth reach 340',      g.truthReach, 340],
    ['Piercing Truth builds 14',      g.truthBuild, 14],
    ['Null-Zone costs 40%',           g.nullPct,    40],
    ['Focal Decryption cd 8',         g.decryptCd,  8],
    ['Focal Decryption silence 3s',   g.decryptSil, 3],
    ['Jars cd 30',                    g.jarsCd,     30],
    ['Jars, 3 to a delve',            g.jarsUses,   3],
    ['Jars heal 45%',                 g.jarsPct,    45],
    ['Calcify below 30%',             g.calcAt,     30],
    ['Calcify takes 4s',              g.calcTime,   4],
    ['Totem 60 life',                 g.totemHp,    60],
    ['Totem 180 units',               g.totemR,     180],
    ['Totem 9 life a second',         g.totemHps,   9],
    ['Totem lasts 22s',               g.totemLife,  22],
    ['Consumption 2.2s',              g.consume,    2.2],
    ['Ceiling of 46 awake',           g.live,       46],
    ['Siphon channel 3.2s',           g.siphon,     3.2],
    ['Rupture 2s fuse',               g.rupture,    2],
    ['Breath 5s',                     g.breath,     5],
    ['Crystal at 95 on the breath',   g.dawnBreath, 95],
    ['Nullification stun 10s',        g.stun,       10]
  ];
  let bad=0;
  for(const [what, got, said] of claims){
    if(Math.abs(got-said) > 1e-9){ console.log('  x '+what+'  [game says '+got+']'); bad++; }
  }
  // The shatter threshold is written into a sentence rather than a table, so
  // it is checked as text. It was first worded as "a twelfth", which 0.12 is
  // not -- a fraction in words is a rounding waiting to happen, so it states
  // the percentage now and this reads the percentage back.
  const doc=fs.readFileSync(require('path').join(__dirname,'..','docs','compendium.html'),'utf8');
  const want='<span class="num">'+Math.round(g.calcBreak*100)+'%</span> of its life in one hit';
  if(doc.indexOf(want)<0){
    console.log('  x the shatter threshold is worded wrong  [CALCIFY_BREAK is '+
                g.calcBreak+', so the doc should say '+Math.round(g.calcBreak*100)+'%]');
    bad++;
  }
  console.log(bad ? '\nDOC NUMBERS: '+bad+' wrong of '+(claims.length+1)
                  : '\nDOC NUMBERS: all '+(claims.length+1)+' agree with the game');
  process.exit(bad?1:0);
})();
