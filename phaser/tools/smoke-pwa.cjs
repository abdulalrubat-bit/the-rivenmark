#!/usr/bin/env node
/* Is it actually installable, and does it actually run offline?
 *
 * Both are things that look fine until the one moment they matter, on a device
 * you cannot reach. A manifest with a bad icon path installs an app with no
 * icon; a service worker that registers but caches nothing gives a home-screen
 * launcher that shows a blank screen on a train. Neither shows up anywhere
 * except by testing the thing the player will actually do.
 *
 * So this deploys to a temp directory exactly as `npm run deploy` does, serves
 * THAT, installs the worker, then CUTS THE NETWORK and reloads.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:pwa
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { execFileSync } = require('child_process');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  // Deployed, not served out of public/. public/ holds the source-map and the
  // core-test harness; what a player gets is whatever deploy.js chose to copy,
  // and that list is part of what is under test.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rivenmark-'));
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'deploy.js'), dir],
                 { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.error('deploy failed:\n' + ((e.stderr && e.stderr.toString()) || e.message));
    process.exit(1);
  }

  const PORT = process.env.PORT || '8218';
  // src/ is the thing under test; public/bundle.js is a souvenir of it.
  buildOnce();
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT, ROOT: dir }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const base = 'http://localhost:' + PORT + '/';

  await p.goto(base);
  await sleep(2500);

  // --- the manifest --------------------------------------------------------
  const man = await p.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]');
    if (!link) return { none: true };
    const r = await fetch(link.href);
    if (!r.ok) return { status: r.status };
    const m = await r.json();
    // Every icon fetched, because a path that 404s is the whole failure: the
    // app installs and its launcher is blank.
    const icons = [];
    for (const i of m.icons || []) {
      const res = await fetch(new URL(i.src, link.href));
      icons.push({ src: i.src, ok: res.ok, type: res.headers.get('content-type') });
    }
    return { m, icons, href: link.href };
  });
  ck('the page declares a manifest and it parses', !man.none && !man.status && !!man.m,
     man.none ? 'no <link rel=manifest>' : man.status ? 'HTTP ' + man.status : man.href);
  if (!man.m) { report(); await b.close(); srv.kill(); process.exit(1); }

  ck('with the fields an install needs',
     !!man.m.name && !!man.m.short_name && !!man.m.start_url &&
     /fullscreen|standalone/.test(man.m.display) && !!man.m.background_color,
     man.m.name + ', ' + man.m.display + ', start ' + man.m.start_url);
  ck('and every icon it names actually exists',
     man.icons.length >= 2 && man.icons.every(i => i.ok && /png/.test(i.type || '')),
     man.icons.map(i => i.src + ' ' + (i.ok ? 'ok' : 'MISSING')).join(', '));
  // A launcher may crop to a circle; without a maskable icon Android pads the
  // square one and it lands in a white box.
  ck('including one that survives being cropped to a circle',
     (man.m.icons || []).some(i => /maskable/.test(i.purpose || '')),
     'maskable: ' + ((man.m.icons || []).map(i => i.purpose || '—').join(', ')));

  // --- the worker ----------------------------------------------------------
  const reg = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    if (!r) return { none: true };
    await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    const c = keys.length ? await caches.open(keys[0]) : null;
    const held = c ? (await c.keys()).map(q => new URL(q.url).pathname.split('/').pop() || 'index') : [];
    return { scope: r.scope, keys, held };
  });
  ck('a service worker installs', !reg.none && !!reg.scope,
     reg.none ? 'nothing registered' : 'scope ' + reg.scope);
  // Versioned by content: a cache key bumped by hand is one that gets
  // forgotten, and a forgotten one strands an installed player for ever.
  ck('and its cache is keyed by the build, not by hand',
     (reg.keys || []).length === 1 && /^rivenmark-[0-9a-f]{12}$/.test(reg.keys[0] || ''),
     (reg.keys || []).join(', ') || 'no caches');
  // `reg.held` is absent when nothing registered at all. Guarded, because a
  // suite that THROWS instead of failing reports nothing about the checks
  // after it -- which is what this did the first time it was revert-proved.
  const held = reg.held || [];
  ck('and it holds the whole shell, not just the page',
     ['bundle.js', 'core.js', 'atlas.png', 'atlas.json'].every(f => held.includes(f)),
     held.length + ' entries' + (held.length ? ': ' + held.slice(0, 6).join(', ') + '…' : ''));

  // --- other apps on the same origin ----------------------------------------
  // The site this ships on serves other apps too, and caches are per origin.
  // A stand-in for one of theirs is made, the worker is installed afresh so
  // its activation runs again, and the stand-in must still be there.
  const neighbour = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    if (!r || !r.active) return { none: true };
    const url = r.active.scriptURL, scope = r.scope;
    const c = await caches.open('other-app-v1');
    await c.put(new URL('elsewhere.txt', location.origin + '/').href, new Response('theirs'));
    // A NEW script URL, or the browser revives the old registration and its
    // activation -- the thing being tested -- never runs again. The first
    // version of this passed against the old worker for exactly that reason.
    const r2 = await navigator.serviceWorker.register(url.split('?')[0] + '?again=' + Date.now(), { scope });
    await new Promise(res => {
      const w = r2.installing || r2.waiting || r2.active;
      if (!w || w.state === 'activated') return res();
      w.addEventListener('statechange', () => { if (w.state === 'activated') res(); });
      setTimeout(res, 8000);
    });
    const keys = await caches.keys();
    return { keys, kept: keys.includes('other-app-v1'), mine: keys.filter(k => k.startsWith('rivenmark-')).length };
  });
  ck('another app\u2019s cache on the same site survives this worker activating',
     neighbour.kept === true, JSON.stringify(neighbour.keys || neighbour));
  ck('...and this worker still keeps exactly one cache of its own', neighbour.mine === 1,
     (neighbour.mine) + ' rivenmark caches');

  // --- offline -------------------------------------------------------------
  // The actual question. Everything above can pass while this fails.
  await ctx.setOffline(true);
  const off = await ctx.newPage();
  const offErrs = [];
  off.on('pageerror', e => offErrs.push(e.message));
  let reached = true;
  await off.goto(base).catch(() => { reached = false; });
  let booted = false;
  for (let i = 0; i < 30 && reached && !booted; i++) {
    await sleep(300);
    booted = await off.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
    }).catch(() => false);
  }
  const world = booted ? await off.evaluate(() => ({
    walls: walls.length, bodies: enemies.length,
    frames: window.__game.textures.get('art').getFrameNames().length,
    level: LEVEL.name
  })).catch(() => null) : null;
  ck('it opens with the network cut', reached && booted,
     reached ? (booted ? 'booted offline' : 'served, but never reached the delve')
             : 'the navigation itself failed');
  ck('and the delve is whole, art and all',
     !!world && world.walls > 10 && world.bodies > 20 && world.frames > 200,
     world ? world.walls + ' walls, ' + world.bodies + ' bodies, ' + world.frames +
             ' atlas frames in ' + world.level : 'no world');
  ck('no errors offline', offErrs.length === 0, offErrs.slice(0, 3).join(' | '));
  await ctx.setOffline(false);

  /* Served from a SUBPATH, which is what the APK does.
   *
   * The Android shell serves these same files over
   * https://appassets.androidplatform.net/assets/, not at a root. Every URL in
   * the build is relative, so it should hold -- but "should" is how a black
   * screen on a phone starts, and this is the one part of that arrangement
   * testable from here.
   */
  const sub = fs.mkdtempSync(path.join(os.tmpdir(), 'rivenmark-sub-'));
  fs.mkdirSync(path.join(sub, 'assets'), { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    fs.copyFileSync(path.join(dir, f), path.join(sub, 'assets', f));
  }
  const srv2 = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                     { env: { ...process.env, PORT: String(+PORT + 1), ROOT: sub },
                       stdio: 'ignore' });
  await sleep(800);
  const sp = await ctx.newPage();
  const subFails = [];
  sp.on('requestfailed', r => subFails.push(r.url().split('/').pop()));
  sp.on('response', r => { if (r.status() >= 400) subFails.push(r.url().split('/').pop() + ' ' + r.status()); });
  await sp.goto('http://localhost:' + (+PORT + 1) + '/assets/index.html');
  let subUp = false;
  for (let i = 0; i < 40 && !subUp; i++) {
    await sleep(250);
    subUp = await sp.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
    }).catch(() => false);
  }
  const subWorld = subUp ? await sp.evaluate(() => ({
    walls: walls.length, frames: window.__game.textures.get('art').getFrameNames().length
  })).catch(() => null) : null;
  ck('and it runs served from a subpath, as the APK serves it',
     subUp && subWorld && subWorld.frames > 200 && subFails.length === 0,
     subUp ? (subWorld ? subWorld.walls + ' walls, ' + subWorld.frames + ' frames' +
              (subFails.length ? ', FAILED: ' + subFails.join(', ') : ', nothing 404ed')
              : 'booted but no world')
           : 'never booted under /assets/');
  await sp.close(); srv2.kill();
  fs.rmSync(sub, { recursive: true, force: true });

  // --- what is shipped -----------------------------------------------------
  const shipped = fs.readdirSync(dir);
  ck('the source map is not published', !shipped.some(f => /\.map$/.test(f)),
     shipped.length + ' files: ' + shipped.join(', '));
  const mb = shipped.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0) / 1024 / 1024;
  // A first launch over a phone connection is the whole first impression.
  ck('and the whole delve is a reasonable download', mb < 6,
     mb.toFixed(2) + 'MB for everything');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  report();
  await b.close(); srv.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(fail.length ? 1 : 0);

  function report() {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  }
})();
