/* Where the suites point.
 *
 * Three pages, because the suites ask three kinds of question:
 *
 *   core()      phaser/public/core-test.html -- the rules with nothing drawn.
 *               Most suites: combat, loot, the stash, the ladder.
 *   game(q)     phaser/public/index.html -- the game that ships, Phaser and
 *               its menus, for anything about what a player sees or taps.
 *               ?nogate drops straight into a delve.
 *   forge()     tools/forge/forge.html -- the sprite forge, for the art.
 *
 * The first two are served, the way the game is; the forge opens from disk.
 * run-suites.js starts one server for the whole sweep and passes its address
 * in RIVENMARK_BASE. Run on its own, a suite calls serve() and gets a server
 * of its own on a free port, so `node tools/suites/gear.js` still just works.
 *
 * RIVENMARK_PAGE is the older override every suite read through PAGE(); it
 * still wins for core(), so nothing that set it has to change.
 */
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

const ROOT = path.join(__dirname, '..', '..');
let base = process.env.RIVENMARK_BASE || null;
let child = null;

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => res(port)); });
    s.on('error', rej);
  });
}

async function serve() {
  if (base) return base;
  const port = await freePort();
  child = spawn(process.execPath, [path.join(ROOT, 'phaser', 'tools', 'serve.js')],
                { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  process.on('exit', () => child && child.kill());
  base = 'http://localhost:' + port + '/';
  for (let i = 0; i < 50; i++) {                 // up within a few hundred ms
    const ok = await new Promise(r => {
      const c = net.connect(port, '127.0.0.1', () => { c.end(); r(true); });
      c.on('error', () => r(false));
    });
    if (ok) break;
    await new Promise(r => setTimeout(r, 100));
  }
  return base;
}

/* Into a delve, the way the old gate-house's Begin button went: the hero,
 * rung and difficulty picked, defaulting to what that screen defaulted to --
 * Isaac, the rung recommendedLevel names for the stash's power, Riven. The
 * suites used to click through three screens of the canvas build's menus to
 * get here; the menus are Phaser's now and smoke:boot drives them, so a suite
 * about what happens INSIDE a delve starts one directly. */
async function descend(p, o = {}) {
  await p.evaluate(o => {
    const level = o.level || recommendedLevel(stashPower());
    startRun(o.hero || stash.hero || 'isaac', level, o.diff || 'riven');
  }, o);
}

module.exports = {
  descend,
  serve,
  core: () => process.env.RIVENMARK_PAGE || base + 'core-test.html',
  game: (q = '') => base + 'index.html' + (q ? '?' + q.replace(/^\?/, '') : ''),
  forge: () => 'file://' + path.join(ROOT, 'tools', 'forge', 'forge.html'),
  stop: () => { if (child) child.kill(); child = null; }
};
