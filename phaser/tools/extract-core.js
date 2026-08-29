#!/usr/bin/env node
/* Pulls the engine-agnostic half of ../index.html into src/core/core.js.
 *
 * WHY THIS IS A SCRIPT AND NOT A ONE-OFF EDIT. The canvas build is still the
 * live game and is still being changed. If the port forks the logic by hand,
 * the two drift the moment anything is tuned, and every later change has to be
 * made twice by someone who remembers to. Re-running this is how the port
 * stays honest until the canvas build is retired.
 *
 * WHAT COMES ACROSS. Measured rather than assumed (see the commit): every
 * `ctx.` reference in the whole game lives inside a function named draw,
 * forge or paint, and outside those the core touches NO browser API at all
 * -- no document, no window, no localStorage, no requestAnimationFrame, no
 * sprite atlas. So the rule is simply: take the core sections, drop anything
 * named for drawing, and what is left runs anywhere.
 *
 * WHAT DOES NOT. Rendering, the DOM UI, the state machine and the boot. The
 * Phaser side supplies those, plus stubs for the handful of flow functions the
 * simulation calls back into (see MISSING at the end of the generated file --
 * it is generated too, so it cannot go stale).
 *
 * Run: npm run core
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.join(here, '..', '..', 'index.html');
const OUT  = path.join(here, '..', 'src', 'core');

const lines = fs.readFileSync(SRC, 'utf8').split('\n');

// Section banners in index.html, by the numbered headings it carries. Found by
// reading the file rather than hard-coded line numbers, so an edit that moves
// a section does not silently truncate the port.
function bannerLine(re) {
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  throw new Error('cannot find section banner: ' + re);
}
const S = {
  config:    bannerLine(/^   1\. CONFIG & TUNING/),
  math:      bannerLine(/^   2\. MATH HELPERS/),
  hash:      bannerLine(/^   3\. SPATIAL HASH/),
  world:     bannerLine(/^   4\. WORLD GENERATION/),
  collision: bannerLine(/^   5\. COLLISION/),
  entities:  bannerLine(/^   6\. ENTITIES & SPAWNING/),
  input:     bannerLine(/^   7\. INPUT/),
  sim:       bannerLine(/^   8\. SIMULATION/),
  render:    bannerLine(/^   9\. RENDERING/),
  ui:        bannerLine(/^   10\. UI, STATE MACHINE & BOOT/)
};
// +2: skip the <script> tag itself, which is HTML and would not parse, and
// the 'use strict' under it, which the generated module states for itself.
// A section banner is a block comment spanning several lines. Starting a range
// at the banner's TITLE line begins it after the opening slash-star, so the
// closing star-slash further down closes a comment that was never opened here
// -- and every statement between them is swallowed. That is how fmtTime went
// missing while `node --check` still passed: a comment that closes eventually
// is valid JavaScript, it just eats the code inside it.
function afterBanner(line) {
  for (let i = line - 1; i < lines.length; i++) if (lines[i].includes('*/')) return i + 2;
  return line;
}
// And the other end of the same mistake. A range that STOPS at the line before
// a banner's title still carries that banner's opening slash-star with no
// closer, and everything after it in the emitted file is inside a comment
// until the next one. That is what swallowed fmtTime: the cut was at the foot
// of section 8, and the banner it clipped was section 9's.
function beforeBanner(line) {
  for (let i = line - 2; i >= 0; i--) {
    if (lines[i].includes('/*')) return i;      // 1-based line before the opener
    if (lines[i].trim() !== '' && !lines[i].trimStart().startsWith('*') &&
        !/^\s*[-\s]*$/.test(lines[i].replace(/[^\s\-]/g, ''))) break;
  }
  return line - 1;
}

const scriptOpen = lines.findIndex(l => l.trim() === '<script>') + 3;
// index.html marks where the page's boot sequence begins. Cutting there rather
// than guessing: those statements call resetRun() and friends at load time,
// which the port must not do -- it starts its own runs -- and letting them
// through threw during the script and left everything after it uninitialised.
const bootAt = lines.findIndex(l => /^\/\* --- BOOT ---/.test(l)) + 1;
if (bootAt <= 0) {
  console.error('index.html has no /* --- BOOT --- marker. It tells this script\n' +
                'where the page boot begins; without it the boot is extracted as\n' +
                'game logic and runs at load. Restore the marker.');
  process.exit(1);
}
const scriptEnd  = lines.findIndex(l => l.trim() === '</script>') + 1;

// The ranges that are logic. Note the last one: the enemy ecosystem and the
// Deceiver encounter were written into the UI half of the file because they
// were filed next to the systems they extend. They are simulation wherever
// they sit, so they come across -- and the draw* functions among them are
// dropped by the same rule as everywhere else.
const CORE_RANGES = [
  [scriptOpen, beforeBanner(S.render)], // config through simulation, stopping
                                       // clear of section 9's banner
  [afterBanner(S.ui), bootAt - 1]      // and the misfiled simulation after it,
                                       // stopping where the page boot starts
];

// A few things filed under RENDERING that are logic, not drawing. The gait is
// the notable one: it advances by DISTANCE TRAVELLED rather than by a clock,
// so a body slowed by anything takes shorter steps instead of moonwalking --
// that is a rule of the simulation, and Phaser needs it to pick a frame just
// as the canvas build needed it to pick a sprite. advanceGait touches no
// canvas; only bodyFrame/heroFrame do, and those stay behind.
// indexBreakables is the other one: it is filed with the scenery because that
// is where scenery lives, but it sets each barrel's hit points and fills
// propGrid, which the simulation reads in two places. Stubbing it would have
// left every breakable in the delve indestructible, quietly.
// Named statements pulled across from the rendering AND UI sections despite
// the rules that would otherwise drop them.
const RENDER_INCLUDE = new Set(['advanceGait', 'GAIT_N', 'GAIT_STEP',
                                'WALK_STEP', 'WALK_PACE', 'GAIT_STILL',
                                'indexBreakables',
  // Game state that happens to be declared under RENDERING. LEVEL is read in
  // forty places -- it is which delve you are in -- and REGION in seven. The
  // strike forms and the recovery time are rules of the swing. lowFx is an
  // effects flag the simulation itself reads to decide whether to bother
  // spawning particles.
                                'LEVEL', 'REGION', 'STRIKES', 'RECOVER_TIME', 'lowFx',
  // endRun is the end of a run: it banks the slag, writes the corpse, saves
  // the stash and decides whether you escaped. All of that is simulation. It
  // was dropped for its last three lines, which set the text on the game-over
  // panel -- and with it stubbed out, twelve of extract.js's assertions failed,
  // every one of them about banking or the corpse. The DOM writes land on the
  // host's placeholder and do no harm.
                                'endRun']);

// Declared under RENDERING and deliberately NOT brought across: the host owns
// them. Listed so the completeness check below can tell "handled" from
// "forgotten", which is the whole difference between the two.
const RENDER_HOST = new Set(['canvas', 'ctx', 'SPR', 'wallGrads',
                             'fxAccum', 'fxFrames', 'fxGood',
                             'FX_DROP', 'FX_RAISE', 'FX_SAMPLE']);

// Functions the host implements. Everything here appears in the generated
// "what the host must supply" list at the foot of core.js; naming them here
// too is what lets the completeness check tell a handled dependency from a
// forgotten one.
const HOST_OK = new Set([
  'saveStash', 'loadStash', 'loadBest', 'saveBest',      // persistence
  'showScreen', 'buildKit', 'syncKit', 'syncHeroSkin',   // the DOM menus
  'renderGear', 'renderHall', 'renderVendor', 'renderLoadouts', 'renderDetail',
  'syncBagBadge', 'hitFlashUI', 'toastEl', '$', 'el', 'resize',
  'buildStains', 'forgeGround', 'forgeWallCourses', 'forgeCut', 'minimapBox',
  'draw', 'drawHall', 'syncHud', 'frame', 'gearCtx', 'runCtx',
  'forge',                                                // the sprite forge
  'endRun',                                               // run flow
  'refreshHallLine', 'refreshVendorLine', 'refreshKitLine',  // menu lines
  'refreshBestLine'                                       // and the best-delve line
]);

/* Split a range into top-level statements.
 *
 * Scanned against a comment-stripped mirror of the file that keeps the same
 * line numbering, and emitted from the original, so comments travel with the
 * statement they document instead of being counted as statements themselves.
 * The first version scanned the raw text and reported 448 "statements" that
 * were comment blocks, which buried the eight that mattered.
 *
 * A real parser would be safer and is not available offline here, so this
 * leans on something the file guarantees: every top-level declaration starts
 * at column zero and closes at column zero. Brace depth is tracked with
 * strings, template literals and comments already gone.
 */
const bare = (() => {
  const out = lines.slice();
  let inBlock = false;
  for (let i = 0; i < out.length; i++) {
    let raw = out[i], res = '', j = 0;
    while (j < raw.length) {
      const c = raw[j], d = raw[j + 1];
      if (inBlock) { if (c === '*' && d === '/') { inBlock = false; j += 2; } else j++; continue; }
      if (c === '/' && d === '*') { inBlock = true; j += 2; continue; }
      if (c === '/' && d === '/') break;
      if (c === '`' || c === '"' || c === "'") {
        const q = c; res += c; j++;
        while (j < raw.length && raw[j] !== q) { if (raw[j] === '\\') { res += raw[j]; j++; } res += raw[j]; j++; }
        res += q; j++; continue;
      }
      res += c; j++;
    }
    out[i] = res;
  }
  return out;
})();

function statements(from, to) {
  // A statement STARTS at a line whose code begins in column zero, and runs
  // until the next one does. Ending a statement whenever brace depth returned
  // to zero looked equivalent and was not: it split
  //     const icoTag = (key, px) =>
  //       '<i class="ico" ...'
  // in two at the end of the first line, because the parens balance there. The
  // file guarantees column zero means top level; it guarantees nothing about
  // where depth happens to touch zero.
  const starts = [];
  let depth = 0;
  for (let i = from - 1; i < to; i++) {
    const code = bare[i];
    if (depth === 0 && code.length && !/^\s/.test(code) && code.trim() !== '') starts.push(i);
    for (let j = 0; j < code.length; j++) {
      const c = code[j];
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
    }
  }
  // Reach each start backwards over the comment block that introduces it, THEN
  // cut the ranges between those heads. Reaching back without moving the
  // previous statement's end emitted every comment block twice -- once as the
  // tail of the statement before it and once as its own head -- and the second
  // copy arrived without its opening /*, which is a syntax error a hundred
  // lines further on.
  // Reach back over every line above the statement that carries no code --
  // comment lines AND the blank lines between comment paragraphs. Stopping at
  // a blank line cut this block in half:
  //     /* --- bolts ---
  //        ...
  //                          <- stopped here
  //        Travel is substepped ...
  //     */
  // and emitted the second half with no opener, which is a syntax error two
  // thousand lines later.
  const heads = starts.map(a => {
    let h = a;
    while (h > from - 1 && bare[h - 1].trim() === '') h--;
    return h;
  });
  const out = [];
  for (let k = 0; k < starts.length; k++) {
    const head = heads[k];
    const end = (k + 1 < heads.length ? heads[k + 1] : to) - 1;
    out.push({ from: head, to: end, text: lines.slice(head, end + 1).join('\n'),
               code: bare.slice(starts[k], end + 1).join('\n').trim() });
  }
  return out;
}

// What a statement declares, so it can be named in the export list and so a
// drawing function can be recognised and dropped.
function declaredName(text) {
  let m;
  if ((m = text.match(/^function\s+([A-Za-z_$][\w$]*)/))) return { kind: 'fn', name: m[1] };
  if ((m = text.match(/^class\s+([A-Za-z_$][\w$]*)/)))    return { kind: 'class', name: m[1] };
  if ((m = text.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/)))
    return { kind: 'var', name: m[1] };
  return null;
}

const IS_DRAW = n => /^(draw|forge|paint|crystalPath|wallGradient|glow)/.test(n);
// Statements bound to the page rather than to the game. The core proved clean
// of every one of these when it was measured, so anything matching is either
// boot wiring or something that has to be looked at.
const HOST_BOUND = new RegExp([
  'document', 'window', 'localStorage', 'addEventListener',
  'requestAnimationFrame', 'getElementById', 'querySelector'
].map(w => '\\b' + w + '\\b').join('|') +
  // `el` is the canvas build's map of DOM nodes. A function writing into it --
  // syncBagBadge, say -- names no browser API and so read as portable, but it
  // is DOM work through and through and cannot be stubbed into meaning.
  '|\\bel\\.[a-zA-Z]');

// Pass one: which declarations are page-bound, so pass two can also drop the
// loose statements that call them. `resize()` and `stash = loadStash()` name no
// DOM API themselves and are pure boot; they are only recognisable through what
// they call.
// Pulled out of the rendering section by name.
const included = [];
for (const [a, b] of [[S.render, beforeBanner(S.ui)], [afterBanner(S.ui), bootAt - 1]])
  for (const st of statements(a, b)) {
    const d = declaredName(st.code);
    if (d && RENDER_INCLUDE.has(d.name)) included.push({ st, name: d.name });
  }
if (included.length !== RENDER_INCLUDE.size) {
  const got = new Set(included.map(i => i.name));
  console.error('RENDER_INCLUDE names not found in the rendering section: ' +
                [...RENDER_INCLUDE].filter(n => !got.has(n)).join(', ') +
                '\n(renamed or moved in index.html — fix this list rather than ' +
                'shipping a core with a hole in it)');
  process.exit(1);
}

const hostNames = new Set();
for (const [a, b] of CORE_RANGES)
  for (const st of statements(a, b)) {
    const d = declaredName(st.code);
    if (d && (IS_DRAW(d.name) || HOST_BOUND.test(st.code))) hostNames.add(d.name);
  }

const kept = [], dropped = [], names = new Set();
for (const [a, b] of CORE_RANGES) {
  for (const st of statements(a, b)) {
    const d = declaredName(st.code);
    if (d && IS_DRAW(d.name)) { dropped.push({ kind: 'draw', at: st.from + 1, what: d.name }); continue; }
    if (d && RENDER_INCLUDE.has(d.name)) continue;   // taken by the include pass
    if (HOST_BOUND.test(st.code)) {
      dropped.push({ kind: 'host', at: st.from + 1, what: (d ? d.name : st.code.slice(0, 70)) });
      continue;
    }
    if (!d) {
      // A loose statement calling something page-bound is boot, not logic.
      const calls = [...st.code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[2]);
      const bootish = calls.filter(n => hostNames.has(n));
      if (bootish.length) {
        dropped.push({ kind: 'boot', at: st.from + 1, what: st.code.slice(0, 70) + '  -> ' + bootish.join(', ') });
        continue;
      }
    }
    // Everything else is kept, including top-level initialisers: they fill the
    // lookup tables (MUTATOR_BY_ID, AFFIX_BY_ID, the LEVELS defaults) and an
    // earlier version dropped all eight, which would have broken the game in
    // silence.
    kept.push(st);
    if (d) names.add(d.name);
    else dropped.push({ kind: 'kept-loose', at: st.from + 1, what: st.code.slice(0, 80) });
  }
}

// Appended, not prepended. These come from LATER in index.html than everything
// else here, so the end is their real position -- and putting them first meant
// `let LEVEL = LEVELS[0]` ran before LEVELS was declared, which throws at load
// and aborts the rest of the script. The symptom was not "LEVEL is undefined"
// but "cannot access SLOTS before initialization" three hundred statements
// further down, because nothing after the throw had initialised at all.
//
// Still before the scan below, which reads `kept` and `names`.
for (const { st, name } of included) { kept.push(st); names.add(name); }

// Anything referenced but never declared here is something the Phaser side has
// to supply. Generated rather than written down, so the list cannot go stale.
//
// Declarations are collected at ANY depth, not just top level: widenPassages
// defines a local solid(), scatterKnots a local pick(), and counting only
// top-level names had the report demanding the host provide all of them.
const declared = new Set(names);
for (const st of kept) {
  for (const m of st.code.matchAll(/(?:^|\s)function\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of st.code.matchAll(/(?:^|[\s;(])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  // class and object-literal methods: `  query(x, y) {`
  for (const m of st.code.matchAll(/^\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) declared.add(m[1]);
}
const GLOBALS = new Set(['Math','Object','Array','String','Number','Boolean','JSON','Date',
  'Map','Set','Int32Array','Uint8Array','Float32Array','Infinity','NaN','undefined','null',
  'true','false','console','isNaN','parseInt','parseFloat','performance','structuredClone',
  'Symbol','Promise','Error','RegExp','Int8Array','Uint16Array','Int16Array','Float64Array',
  'isFinite','setTimeout','clearTimeout','setInterval','clearInterval','encodeURIComponent',
  'decodeURIComponent','Uint32Array','WeakMap','WeakSet','BigInt','Proxy','Reflect']);
// Control-flow keywords read as calls to a regex looking for `name(`. Without
// these the report claims the host must supply `if`, `for` and `while`.
const KEYWORDS = new Set(['if','for','while','switch','catch','return','typeof','function',
  'new','delete','void','do','else','case','in','of','instanceof','await','yield','throw']);
const referenced = new Map();
const body = kept.map(s => s.text).join('\n');
{
  let fn = null;
  // Scanned over the comment-stripped code, not the emitted text. Scanning the
  // text made the report claim the host owes us `joystick`, `persistence` and
  // `maze` -- prose that happened to be followed by an opening bracket.
  for (const line of kept.map(s => s.code).join('\n').split('\n')) {
    const d = line.match(/^function\s+([A-Za-z_$][\w$]*)/); if (d) fn = d[1];
    const stripped = line.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
    // (^|[^.\w$]) so a method call is not read as a free function: `a.push(` is
    // Array's business, not something the host has to provide.
    // A method definition -- `  query(x, y, r, out) {` inside a class, or
    // `  anchor(a) {` inside ABILITY_DO -- is a declaration, not a call on
    // something the host owes us. Indented and followed by a brace is the tell.
    if (/^\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(line)) continue;
    // A call written across lines puts the name at the end of one line and the
    // arguments on the next: `foo(\n  bar)`. Harmless. But a chained call whose
    // dot sits on the previous line -- `thing\n  .join(x)` -- reads as a free
    // call to join(), so drop a leading-dot continuation too.
    if (/^\s*\./.test(line)) continue;
    for (const m of stripped.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const n = m[2];
      if (declared.has(n) || GLOBALS.has(n) || KEYWORDS.has(n)) continue;
      if (!referenced.has(n)) referenced.set(n, new Set());
      referenced.get(n).add(fn || '(top level)');
    }
  }
}

/* Completeness check.
 *
 * The "host must supply" scan looks for `name(` and so sees only functions. A
 * variable is referenced without brackets and was invisible to it -- which is
 * how the first extraction shipped without LEVEL, the single most-read piece
 * of state in the game, and failed at the first startRun with "LEVEL is not
 * defined". Every top-level declaration under RENDERING is now checked against
 * what the kept code actually references, and anything neither included nor
 * explicitly left to the host stops the build.
 */
{
  // Every top-level declaration that did NOT come across, from either the
  // rendering or the UI section. If the kept code still references one, the
  // port has a hole in it -- and the hole will not show up in the "must
  // supply" list, because that list looks for `name(` and a variable is
  // referenced without brackets. LEVEL was missed that way, then `el`.
  const outside = new Map();
  for (const [a, b] of [[S.render, beforeBanner(S.ui)], [afterBanner(S.ui), bootAt - 1]])
    for (const st of statements(a, b)) {
      const d = declaredName(st.code);
      if (d && !names.has(d.name)) outside.set(d.name, st.from + 1);
      for (const m of st.code.matchAll(/^(?:let|const|var)\s+([A-Za-z_$][\w$]*)/gm))
        if (!names.has(m[1])) outside.set(m[1], st.from + 1);
    }
  const keptCode = kept.map(k => k.code).join('\n');
  const forgotten = [];
  for (const [name, at] of outside) {
    if (RENDER_INCLUDE.has(name) || RENDER_HOST.has(name) || HOST_OK.has(name)) continue;
    if (new RegExp('\\b' + name + '\\b').test(keptCode))
      forgotten.push('  ' + name.padEnd(20) + 'declared at index.html:' + at);
  }
  if (forgotten.length) {
    console.error('\nThe core references things declared outside it that are neither\n' +
                  'brought across nor accounted for:\n' + forgotten.join('\n') +
                  '\n\nAdd each to RENDER_INCLUDE (it is game logic), RENDER_HOST or\n' +
                  'HOST_OK (the host owns it). Do not ship a core with a hole in it.\n');
    process.exit(1);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const header = `'use strict';
/* GENERATED by phaser/tools/extract-core.js from ../index.html — do not edit.
 *
 * The engine-agnostic half of The Rivenmark: config and tuning, maths, the
 * spatial hash, world generation, collision, entities and spawning, the kit,
 * input handling and the whole simulation, plus the enemy ecosystem and the
 * Deceiver encounter that live in the canvas build's UI section but are
 * simulation wherever they sit.
 *
 * Nothing in here touches a browser API. That is not an achievement of the
 * port, it is how the canvas build was already written -- every ctx. call in
 * the game lives inside a function named draw, forge or paint, and those are
 * dropped here.
 *
 * ${kept.length} statements kept; ${dropped.filter(d=>d.kind==='draw').length} drawing functions and ${dropped.filter(d=>d.kind==='host').length} page-bound statements dropped.
 * Re-run \`npm run core\` after changing ../index.html.
 */
`;
const missing = [...referenced.entries()].sort((a, b) => b[1].size - a[1].size);
const footer = `
/* ---------------------------------------------------------------------------
   WHAT THE HOST MUST SUPPLY

   Referenced here, declared elsewhere. The Phaser side provides each of these
   before the core is stepped; this list is generated, so it cannot drift out
   of date the way a hand-written one would.

${missing.map(([n, from]) =>
   `     ${n.padEnd(20)} called from ${[...from].slice(0, 3).join(', ')}${from.size > 3 ? ' +' + (from.size - 3) : ''}`
  ).join('\n')}
   ------------------------------------------------------------------------ */
`;
fs.writeFileSync(path.join(OUT, 'core.js'), header + body + '\n' + footer);

const byKind = k => dropped.filter(d => d.kind === k);
console.log('core.js  ' + kept.length + ' statements, ' +
            (fs.statSync(path.join(OUT, 'core.js')).size / 1024).toFixed(0) + 'kB');
console.log('dropped: ' + byKind('draw').length + ' drawing, ' +
            byKind('host').length + ' page-bound');
for (const d of byKind('host'))
  console.log('   page-bound @' + d.at + '  ' + d.what);
const loose = byKind('kept-loose');
console.log('kept ' + loose.length + ' top-level initialisers:');
for (const d of loose) console.log('   @' + String(d.at).padStart(6) + '  ' + d.what);
/* Generated no-op stubs for everything the core calls and does not declare.
 *
 * Written rather than hand-maintained, because hand-maintaining it does not
 * work: each missing name only announces itself as a ReferenceError at the
 * moment the simulation first reaches it, so the list gets discovered one
 * crash at a time and is stale again the next time index.html changes.
 *
 * These are no-ops. Anything that needs real behaviour -- the persistence, the
 * run flow -- is layered on top by the host, which is why they are assigned
 * with ??= rather than =.
 */
const stubs = `// GENERATED by phaser/tools/extract-core.js — do not edit.
// No-op stand-ins for every function core.js calls but does not declare.
// Loaded BEFORE core.js; real implementations are layered over the top, so
// each is assigned only if nothing has claimed it.
(function (g) {
  const noop = function () {};
${missing.map(([n]) => `  if (g.${n} === undefined) g.${n} = noop;`).join('\n')}
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(here, '..', 'public', 'host-stubs.js'), stubs);
fs.writeFileSync(path.join(OUT, 'missing.json'),
                 JSON.stringify(missing.map(([n]) => n), null, 2) + '\n');

/* Post-condition: is every name we believe we kept actually THERE?
 *
 * `node --check` cannot answer this. An unterminated comment swallows whole
 * statements and still parses, which is exactly how fmtTime disappeared while
 * every syntax check passed and six suites went on matching. So the emitted
 * file is re-read, comments stripped, and each kept declaration looked for.
 */
{
  const emitted = fs.readFileSync(path.join(OUT, 'core.js'), 'utf8').split('\n');
  let inB = false;
  const stripped = emitted.map(raw => {
    let out = '', j = 0;
    while (j < raw.length) {
      const c = raw[j], d = raw[j + 1];
      if (inB) { if (c === '*' && d === '/') { inB = false; j += 2; } else j++; continue; }
      if (c === '/' && d === '*') { inB = true; j += 2; continue; }
      if (c === '/' && d === '/') break;
      out += c; j++;
    }
    return out;
  }).join('\n');
  const lost = [...names].filter(n =>
    !new RegExp('(^|\\s)(function|const|let|var|class)\\s+' + n + '\\b', 'm').test(stripped));
  if (lost.length) {
    console.error('\nEmitted but not present: ' + lost.length + ' declaration(s) were kept\n' +
                  'and cannot be found in the output outside a comment:\n  ' +
                  lost.join('\n  ') + '\n\nSomething is swallowing them -- an unbalanced\n' +
                  'comment is the usual cause.\n');
    process.exit(1);
  }
  if (inB) {
    console.error('\ncore.js ends inside an unterminated block comment.\n');
    process.exit(1);
  }
}

console.log('\nthe host must supply ' + missing.length + ':');
for (const [n, from] of missing.slice(0, 30))
  console.log('  ' + n.padEnd(22) + [...from].slice(0, 2).join(', '));
if (missing.length > 30) console.log('  … and ' + (missing.length - 30) + ' more');
