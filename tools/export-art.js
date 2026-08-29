#!/usr/bin/env node
/* Exports every forged sprite in index.html to art/ as PNGs.

   Everything the game draws for a body, a hero, a coffer or a prop is drawn in
   code at load time -- there are no image files behind any of it. That is good
   for a single-file game and bad for anyone who wants to look at the art, hand
   it to someone, or use a frame somewhere else. This walks the finished sprite
   atlas and writes it out.

   art/ is generated, never hand-edited: the sprites are in index.html and this
   is the only thing that should ever put a file in that folder. Same rule as
   debug.html.

   NOTE ON PROVENANCE. This exports SPR only, which is entirely code-drawn.
   The sheet-backed art -- the gear icons, the coffer frames, the scenery cut
   from the tilesets in assets/ -- is drawn straight from its data URI and is
   not exported here, because this walks the forged sprite atlas and those were
   never in it. Every sheet-backed thing keeps a forged fallback, and it is the
   fallback that appears in art/. (The sheets are royalty-free and cleared for
   redistribution, so including them is a plumbing question now, not a
   licensing one.)

   Run: node tools/export-art.js          (needs playwright + chromium)
*/
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const out  = path.join(root, 'art');

// SPR key -> where it lands and what it is called. Anything unmatched is
// reported rather than silently dropped: a sprite that stops being exported
// because its key changed shape is exactly the kind of quiet loss this is
// meant to prevent.
function place(key, roster) {
  let m;
  if ((m = key.match(/^h_(\w+?)(?:(w|r)(\d))?$/)))
    return { dir: 'heroes', name: m[1] + (m[2] ? (m[2] === 'w' ? '-walk-' : '-run-') + m[3] : '-rest') };
  if ((m = key.match(/^w_(\w+)$/)))
    return { dir: 'heroes', name: m[1] + '-weapon' };
  if ((m = key.match(/^ch_(\w+?)(_open)?$/)))
    return { dir: 'chests', name: m[1] + (m[2] ? '-open' : '-shut') };
  if ((m = key.match(/^p_(\w+?)_(\d)$/)))
    return { dir: 'props', name: m[1] + '-' + m[2] };
  if ((m = key.match(/^p_(\w+)$/)))
    return { dir: 'props', name: m[1] };
  if ((m = key.match(/^(\w+?)r(\d)$/)))
    return { dir: 'bestiary', name: m[1] + '-run-' + m[2] };
  if (/^(loot|lootBig|shadow)$/.test(key))
    return { dir: 'misc', name: key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() };
  // A body's own key with no suffix is its rest pose. Checked against the
  // roster rather than used as a catch-all, so a key this does not understand
  // is reported instead of being quietly filed as a creature.
  if (roster.indexOf(key) >= 0)
    return { dir: 'bestiary', name: key + '-rest' };
  return null;
}

(async () => {
  const browser = await chromium.launch();
  // Asks for dpr 3, and gets 2. The game clamps view.dpr to 2 on purpose --
  // the atlas is already ten megabytes at that size -- so SS tops out at 2 and
  // 2x IS the native resolution of this art. Nothing here is downscaled.
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3
  })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(root, 'index.html'));
  await new Promise(r => setTimeout(r, 1200));

  const art = await page.evaluate(() => {
    const frames = [];
    const roster = Object.keys(ENEMY_TYPES);
    for (const k in SPR) {
      const c = SPR[k];
      if (!c || !c.width) continue;
      frames.push({ key: k, w: c.width, h: c.height, span: c.span || 0,
                    png: c.toDataURL('image/png') });
    }

    // Contact strips: one row per subject, so a whole cycle is a single file.
    const strip = (keys, pad) => {
      const list = keys.map(k => SPR[k]).filter(Boolean);
      if (!list.length) return null;
      const w = Math.max(...list.map(s => s.width)), h = Math.max(...list.map(s => s.height));
      const c = document.createElement('canvas');
      c.width = (w + pad) * list.length + pad;
      c.height = h + pad * 2;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      list.forEach((s, i) => g.drawImage(s, pad + i * (w + pad) + (w - s.width) / 2,
                                            pad + (h - s.height) / 2));
      return c.toDataURL('image/png');
    };

    const strips = [];
    for (const hid in HEROES) {
      const w = strip([ 'h_' + hid, ...Array.from({length:GAIT_N},(_,i)=>'h_'+hid+'w'+i) ], 6);
      const r = strip([ 'h_' + hid, ...Array.from({length:GAIT_N},(_,i)=>'h_'+hid+'r'+i) ], 6);
      if (w) strips.push({ name: hid + '-walk-cycle', png: w });
      if (r) strips.push({ name: hid + '-run-cycle',  png: r });
    }
    for (const k in ENEMY_TYPES) {
      if (!SPR[k + 'r0']) continue;
      const s = strip([ k, ...Array.from({length:GAIT_N},(_,i)=>k+'r'+i) ], 6);
      if (s) strips.push({ name: k + '-run-cycle', png: s });
    }

    // What the atlas is, as data rather than as a claim.
    const manifest = {
      generated_from: 'index.html',
      supersample: SS,
      gait_poses: GAIT_N,
      heroes: Object.keys(HEROES),
      enemy_kinds: Object.keys(ENEMY_TYPES),
      sprite_count: frames.length,
      kinds: Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, d]) => [k, {
        radius: d.r, life: d.hp, damage: d.dmg, stride: d.speed,
        slag: d.tech, role: d.role, colour: d.color,
        introduced_at_depth: d.from === 1e9 ? null : d.from
      }]))
    };
    return { frames, strips, manifest, roster };
  });

  if (errs.length) { console.error('page errors:', errs); process.exit(1); }

  // Rebuild the generated tree each run, so a sprite that no longer exists
  // stops existing here too rather than lingering as a file nothing generates.
  // art/README.md is written by hand and is explicitly not swept: it documents
  // the folder, and wiping the whole directory would delete it every run.
  const GENERATED = ['heroes', 'bestiary', 'props', 'chests', 'cycles', 'misc'];
  for (const d of GENERATED) fs.rmSync(path.join(out, d), { recursive: true, force: true });
  fs.rmSync(path.join(out, 'manifest.json'), { force: true });
  fs.mkdirSync(out, { recursive: true });

  const write = (dir, name, dataUrl) => {
    const d = path.join(out, dir);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, name + '.png'),
                     Buffer.from(dataUrl.split(',')[1], 'base64'));
  };

  const tally = {}, orphans = [];
  for (const f of art.frames) {
    const p = place(f.key, art.roster);
    if (!p) { orphans.push(f.key); continue; }
    if (GENERATED.indexOf(p.dir) < 0) { orphans.push(f.key + ' -> ' + p.dir); continue; }
    write(p.dir, p.name, f.png);
    tally[p.dir] = (tally[p.dir] || 0) + 1;
  }
  // A sprite this does not know where to put is a sprite that silently stops
  // being exported. Fail rather than write an incomplete folder.
  if (orphans.length) {
    console.error('unplaced sprite keys (add a rule to place()):', orphans.join(', '));
    process.exit(1);
  }
  for (const s of art.strips) {
    write('cycles', s.name, s.png);
    tally.cycles = (tally.cycles || 0) + 1;
  }

  fs.writeFileSync(path.join(out, 'manifest.json'),
                   JSON.stringify(art.manifest, null, 2) + '\n');

  const bytes = d => fs.readdirSync(path.join(out, d))
    .reduce((n, f) => n + fs.statSync(path.join(out, d, f)).size, 0);
  console.log('art/ written from index.html at ' + art.manifest.supersample + 'x');
  for (const d of Object.keys(tally).sort())
    console.log('  ' + d.padEnd(9) + String(tally[d]).padStart(4) + ' files  ' +
                (bytes(d) / 1024).toFixed(0) + 'kB');
  await browser.close();
})();
