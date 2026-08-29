/* The delve's HUD, in DOM over the canvas.
 *
 * DOM rather than Phaser text and shapes, for the same reasons the canvas
 * build put it there: text stays crisp at any dpr without a font atlas, a
 * button is a real 44px touch target that the browser handles, and none of it
 * goes down with the renderer. The game is what needs the GPU; a life bar does
 * not.
 *
 * Everything here reads the core and never writes to it except through the
 * two calls the player is allowed to make: castAbility and swapHero.
 */

const g = window;   // ONLY for the functions -- see the note in delve.js: a
                    // top-level const in a classic script never lands on
                    // window, so constants are read bare and calls are not.

const CSS = `
#hud{position:fixed;inset:0;pointer-events:none;font:12px ui-monospace,Menlo,monospace;
     color:#cebe9e;-webkit-user-select:none;user-select:none}
#hud .top{position:absolute;left:8px;right:8px;top:8px;display:flex;gap:8px;align-items:center}
#hud .life{flex:1;height:16px;background:#12100d;border:1px solid #4a3f30;border-radius:3px;
     overflow:hidden;position:relative}
#hud .life i{display:block;height:100%;background:linear-gradient(#c0392b,#7c2018);
     transition:width .12s linear}
#hud .life b{position:absolute;inset:0;display:grid;place-items:center;font-weight:600;
     text-shadow:0 1px 2px #000}
#hud .slag{min-width:92px;text-align:right;text-shadow:0 1px 2px #000}
/* The kit sits bottom-right in two rows of three. Its own bottom edge, the
   swap beside it rather than above it, and the resource meter over it are all
   placed so nothing lands on anything else -- measured in the play test, not
   eyeballed, because the first version put the swap through the middle of the
   kit and the diagnostics button on top of both. */
#hud .kit{position:absolute;right:10px;bottom:16px;display:grid;gap:8px;
     grid-template-columns:repeat(3,56px);pointer-events:auto}
#hud button{width:56px;height:56px;border-radius:50%;background:#161310;color:#e8dcc0;
     border:2px solid #6a5a42;font:16px/1 ui-monospace,monospace;padding:0;
     display:grid;place-items:center;touch-action:manipulation}
#hud button .cd{position:absolute;font-size:11px;color:#ffd870}
#hud button:disabled{opacity:.42}
#hud button.ready{border-color:#d6b26e;box-shadow:0 0 10px rgba(214,178,110,.35)}
#hud button:active{background:#2a2419}
#hud .swap{position:absolute;right:204px;bottom:16px;pointer-events:auto}
#hud .res{position:absolute;right:10px;bottom:148px;display:flex;gap:5px;
     align-items:center;justify-content:flex-end}
#hud .pip{width:11px;height:11px;border-radius:50%;border:1px solid #6a5a42;background:#161310}
#hud .pip.on{background:#ffd870;border-color:#ffd870}
#hud .tension{width:74px;height:9px;border:1px solid #4a6a7a;background:#0e1418;border-radius:2px}
#hud .tension i{display:block;height:100%;background:#5fd0ff}
#hud .beat{position:absolute;left:8px;right:110px;bottom:16px;height:5px;
     background:#12100d;border:1px solid #3a3226}
#hud .banner{position:absolute;left:0;right:0;top:38%;text-align:center;font-size:19px;
     color:#eee0c0;text-shadow:0 2px 6px #000;font-family:Georgia,serif}
#hud .banner small{display:block;font-size:12px;color:#a89878;margin-top:4px;font-style:italic}
`;

export class Hud {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML =
      '<div class="top">' +
        '<div class="life"><i></i><b></b></div>' +
        '<div class="slag"></div>' +
      '</div>' +
      '<div class="res"></div>' +
      '<div class="swap"><button type="button" title="swap">⇄</button></div>' +
      '<div class="kit"></div>' +
      '<div class="banner" hidden></div>';
    document.body.appendChild(root);

    this.root = root;
    this.lifeFill = root.querySelector('.life i');
    this.lifeText = root.querySelector('.life b');
    this.slag = root.querySelector('.slag');
    this.res = root.querySelector('.res');
    this.kit = root.querySelector('.kit');
    this.banner = root.querySelector('.banner');
    this.swapBtn = root.querySelector('.swap button');
    this.swapBtn.addEventListener('click', () => g.swapHero());

    this.hero = null;      // which kit is currently built
    this.sig = '';         // last rendered button state, to skip DOM churn
  }

  buildKit(hero) {
    this.kit.innerHTML = '';
    this.buttons = [];
    for (const a of ABILITIES[hero]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = a.id;
      b.title = a.name + ' — ' + a.note;
      b.innerHTML = '<span>' + a.mark + '</span>';
      // pointerdown, not click: a click waits for the pointer to come back up,
      // which on a touch screen is a beat you can feel in a fight.
      b.addEventListener('pointerdown', e => { e.preventDefault(); g.castAbility(a.id); });
      this.kit.appendChild(b);
      this.buttons.push(b);
    }
    this.hero = hero;
  }

  sync() {
    const p = player;
    if (!p) return;
    if (this.hero !== p.hero) this.buildKit(p.hero);

    const f = Math.max(0, p.hp) / p.maxHp;
    this.lifeFill.style.width = (f * 100).toFixed(1) + '%';
    this.lifeText.textContent = Math.ceil(Math.max(0, p.hp)) + ' / ' + Math.round(p.maxHp);
    this.slag.textContent = (run.tech | 0) + ' / ' + LEVEL.quota + ' slag';

    // The resource: Isaac counts charges, Zayd fills a pool. Rebuilt only when
    // the shape changes, so a bar that ticks every frame does not rewrite the
    // DOM every frame with it.
    const isIsaac = p.hero === 'isaac';
    const resSig = isIsaac ? 'c' + (p.charges | 0) : 't' + Math.round((p.tension || 0) / 2);
    if (this.resSig !== resSig) {
      this.resSig = resSig;
      if (isIsaac) {
        this.res.innerHTML = Array.from({ length: CHARGE_MAX }, (_, i) =>
          '<span class="pip' + (i < (p.charges | 0) ? ' on' : '') + '"></span>').join('');
      } else {
        const pct = (100 * (p.tension || 0) / TENSION_MAX).toFixed(0);
        this.res.innerHTML = '<span class="tension"><i style="width:' + pct + '%"></i></span>';
      }
    }

    // Buttons. abilityBlock is the core's own answer to "can this be pressed",
    // so the HUD never invents a second opinion about it.
    let sig = '';
    for (const b of this.buttons) {
      const a = ABILITY_BY_ID[b.dataset.id];
      const why = g.abilityBlock(a);
      const cd = (p.cds && p.cds[a.id]) || 0;
      const s = why + '|' + Math.ceil(cd);
      sig += s + ';';
      if (b.__s !== s) {
        b.__s = s;
        b.disabled = !!why && why !== 'gcd';
        b.classList.toggle('ready', !why);
        b.querySelector('span').textContent = cd > 0 ? Math.ceil(cd) : a.mark;
      }
    }
    const swapWhy = g.swapBlocked();
    this.swapBtn.disabled = !!swapWhy && swapWhy !== 'gcd';
    this.swapBtn.classList.toggle('ready', !swapWhy);
    this.swapBtn.textContent = (p.swapCd || 0) > 0 ? Math.ceil(p.swapCd) : '⇄';

    if (run.banner > 0 && run.bannerText) {
      this.banner.hidden = false;
      this.banner.innerHTML = run.bannerText +
        (run.bannerNote ? '<small>' + run.bannerNote + '</small>' : '');
    } else if (!this.banner.hidden) {
      this.banner.hidden = true;
    }
  }
}
