/* The title card: the first thing on screen, and the last thing before the
 * gate-house.
 *
 * WHY ITS MARKUP IS NOT IN HERE. This module is inside bundle.js, which is a
 * megabyte and a half and cannot run until it has arrived and been parsed --
 * so a card built in here would appear AFTER the wait it exists to cover. The
 * card is therefore written into public/index.html, in the shell, where it
 * paints on the browser's first frame with nothing loaded but a few hundred
 * bytes of inline CSS. This class adopts it.
 *
 * That split is the whole point and it is easy to undo by accident: moving
 * this markup into JS "to keep it together" would put the loading screen
 * behind the load.
 *
 * DOM, like the HUD and the gate-house, for the same three reasons: real text
 * at the device's own resolution, no atlas dependency (the card must be up
 * BEFORE the atlas exists), and it survives whatever the renderer is doing.
 */

/* How long the card is guaranteed to stay, measured from the page opening
 * rather than from this module running -- what a person experiences is one
 * unbroken wait from the tap, and the part of it that happened before the
 * bundle arrived still counts.
 *
 * A floor, not a delay: on a slow phone the load takes longer than this and
 * the floor never binds. It exists for the other case. A title that flashes
 * past in 90ms on a warm cache is worse than no title at all -- it reads as a
 * glitch, and it teaches the player that something flickers at boot.
 */
const DWELL = 1500;
const FADE  = 420;

export class Title {
  constructor(root) {
    this.root = root || document.getElementById('boot');
    this.bar  = this.root && this.root.querySelector('.bar > i');
    this.say  = this.root && this.root.querySelector('.say');
    this.gone = !this.root;
    this.at   = 0;
  }

  /* The bar tracks the atlas, and says so. It does NOT pretend to know about
   * the bundle that had to arrive before this could run: a bar that jumps to
   * 40% the instant it appears is a bar drawing a number nobody measured.
   * Before the loader starts there is a sliver and a different sentence; from
   * then on every pixel is a real fraction of a real file.
   */
  watch(loader) {
    if (this.gone || !loader) return;
    this.note('forging the delve…');
    loader.on('progress', v => this.set(v));
    loader.once('complete', () => this.set(1));
  }

  set(v) {
    this.at = Math.max(this.at, Math.min(1, Math.max(0, v || 0)));
    if (this.bar) this.bar.style.width = (6 + this.at * 94) + '%';
  }

  note(text) { if (this.say) this.say.textContent = text; }

  /* Away, once the game behind it is genuinely ready and the floor has been
   * served. Resolves when the card is off the screen, so the caller can raise
   * the gate-house into an empty frame rather than crossing it.
   */
  dismiss() {
    if (this.gone) return Promise.resolve();
    this.gone = true;
    this.set(1);
    // performance.now() is measured from the navigation, which is the tap.
    const wait = Math.max(0, DWELL - performance.now());
    return new Promise(done => {
      setTimeout(() => {
        this.root.classList.add('out');
        setTimeout(() => { this.root.remove(); done(); }, FADE);
      }, wait);
    });
  }
}
