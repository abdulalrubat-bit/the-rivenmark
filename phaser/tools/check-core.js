#!/usr/bin/env node
/* Does the core have a hole in it?
 *
 * core.js is a classic script with no imports: everything it calls is either
 * declared in it or supplied by the host before it loads -- public/host-stubs.js
 * (harmless no-ops for the UI hooks the core fires) and public/host-real.js
 * (the ones with real behaviour: storage, and the viewport). A call to a name
 * that is in neither is a ReferenceError waiting for the one code path that
 * reaches it, which on a phone is the one nobody tested.
 *
 * This used to be done by the extractor, when core.js was cut out of the
 * canvas build. The canvas build is gone and core.js is edited by hand, so the
 * same scan now runs over core.js itself, on every build.
 *
 * It looks for `name(` -- functions. A bare variable the host is meant to own
 * is not found this way; the suites and the smoke tests are what catch those,
 * by running the code.
 *
 * Run: node tools/check-core.js   (build.js runs it first, every time)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(here, '..', f), 'utf8');
const core = read('src/core/core.js');

const GLOBALS = new Set(['Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Map', 'Set', 'Int32Array', 'Uint8Array', 'Float32Array', 'Infinity', 'NaN',
  'undefined', 'null', 'true', 'false', 'console', 'isNaN', 'parseInt', 'parseFloat',
  'performance', 'structuredClone', 'Symbol', 'Promise', 'Error', 'RegExp', 'Int8Array',
  'Uint16Array', 'Int16Array', 'Float64Array', 'isFinite', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'encodeURIComponent', 'decodeURIComponent',
  'Uint32Array', 'WeakMap', 'WeakSet', 'BigInt', 'Proxy', 'Reflect']);
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
  'function', 'new', 'delete', 'void', 'do', 'else', 'case', 'in', 'of', 'instanceof',
  'await', 'yield', 'throw', 'super']);

// Comments out first, so prose followed by a bracket is not read as a call.
const code = core.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
                 .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

// Every name the core declares anywhere: functions, bindings, parameters are
// not needed -- a call to a parameter is a local call and is caught by the
// binding patterns below well enough for a file written in this style.
const declared = new Set();
for (const m of code.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
for (const m of code.matchAll(/\b(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
for (const m of code.matchAll(/\b(?:const|let|var)\s*[{[]([^=]*?)[}\]]\s*=/g))
  for (const n of m[1].split(/[\s,:]+/)) if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n);
// Arrow and function parameters: `(a, b) =>`, `x =>`, `function f(a, b)`.
for (const m of code.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g))
  for (const n of m[1].split(/[\s,=]+/)) if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n);
for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1]);

const called = new Map();
code.split('\n').forEach((line, i) => {
  // A method definition inside a class or an object literal is a declaration.
  if (/^\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(line)) return;
  if (/^\s*\./.test(line)) return;                      // chained `.join(` on its own line
  const s = line.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
  for (const m of s.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const n = m[2];
    if (declared.has(n) || GLOBALS.has(n) || KEYWORDS.has(n)) continue;
    if (!called.has(n)) called.set(n, i + 1);
  }
});

// What the host supplies: `g.name =` in the stubs, `window.name =` in host-real.
const supplied = new Set();
for (const f of ['public/host-stubs.js', 'public/host-real.js']) {
  for (const m of read(f).matchAll(/\b(?:g|window)\.([A-Za-z_$][\w$]*)\s*(?:===\s*undefined\)\s*g\.\1\s*)?=/g))
    supplied.add(m[1]);
}

const holes = [...called].filter(([n]) => !supplied.has(n));
if (holes.length) {
  console.error('\ncore.js calls functions nobody supplies:\n' +
    holes.map(([n, at]) => '  ' + n.padEnd(22) + 'first at core.js:' + at).join('\n') +
    '\n\nDeclare each in core.js, or give it to the host in public/host-stubs.js\n' +
    '(a no-op the UI can take over) or public/host-real.js (real behaviour).\n' +
    'Do not ship a core with a hole in it.\n');
  process.exit(1);
}
if (!process.argv.includes('--quiet'))
  console.log('core.js: ' + called.size + ' host call(s), all supplied');
