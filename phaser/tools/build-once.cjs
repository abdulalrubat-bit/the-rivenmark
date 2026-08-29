/* Build the bundle before a suite runs.
 *
 * Every smoke suite serves public/bundle.js, which is a BUILD ARTEFACT of
 * src/. Nothing rebuilt it, so a suite tested whatever bundle happened to be
 * on disk -- which was caught the hard way: a deliberate `return` stubbed into
 * cullDressing to revert-prove its assertions changed nothing at all, because
 * the browser never saw the edit. A test that cannot see your change cannot
 * fail on it, and a green run then means nothing.
 *
 * So: build, synchronously, before the server comes up. It takes about a
 * second and it is the difference between a suite that tests the source and
 * one that tests a souvenir.
 */
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = function buildOnce() {
  const t0 = Date.now();
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'build.js')],
                 { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    const why = (e.stderr && e.stderr.toString()) || e.message;
    console.error('BUILD FAILED — the suite would have tested a stale bundle:\n' + why);
    process.exit(1);
  }
  return Date.now() - t0;
};
