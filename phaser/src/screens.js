/* The loop around a delve: descending, ending, and going again.
 *
 * The core already owns all of it -- startRun, endRun, bankRun, stepThrough,
 * the corpse, the stash -- and it already composes the outcome copy. endRun
 * writes that copy into `el`, the canvas build's map of DOM nodes, which the
 * host stubs as a store; so this reads back what the core wrote rather than
 * writing the same sentences a second time and letting the two drift.
 *
 * DOM, like the HUD, and for the same reasons: real buttons, crisp text, and
 * it survives the renderer.
 */

/* global player, run, stash, state, LEVELS, LEVEL, LEVEL_BY_ID, HEROES,
          startRun, endRun, stepThrough, blankStash, el, stashPower */

const CSS = `
#screens{position:fixed;inset:0;z-index:40;display:none;place-items:center;
  background:rgba(8,7,6,.86);font:13px ui-monospace,Menlo,monospace;color:#cebe9e;
  -webkit-user-select:none;user-select:none;overflow:auto}
#screens.up{display:grid}
#screens .card{width:min(340px,92vw);background:#12100d;border:1px solid #4a3f30;
  border-radius:10px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.6);margin:16px 0}
#screens h1{font:22px Georgia,"Times New Roman",serif;color:#eee0c0;margin:0 0 4px}
#screens h1 em{font-style:normal;color:#d6b26e}
#screens h1 span{color:#c0392b}
#screens .sub{color:#a89878;font-style:italic;margin:0 0 12px;line-height:1.45}
#screens .stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 14px}
#screens .stats div{background:#1a1712;border:1px solid #33291f;border-radius:5px;
  padding:6px 8px;display:flex;justify-content:space-between}
#screens .stats b{color:#eee0c0}
#screens .rows{display:grid;gap:6px;margin:0 0 14px;max-height:44vh;overflow:auto}
#screens .row{display:flex;justify-content:space-between;align-items:center;gap:8px;
  background:#1a1712;border:1px solid #33291f;border-radius:6px;padding:9px 10px;
  text-align:left;color:inherit;font:inherit;min-height:44px}
#screens .row.on{border-color:#d6b26e;background:#231d15}
#screens .row small{color:#8c8168;display:block}
#screens .go{width:100%;min-height:48px;border-radius:8px;background:#2a2015;
  color:#f0e2c2;border:1px solid #d6b26e;font:15px Georgia,serif}
#screens .go:active{background:#3a2c1c}
#screens .purse{display:flex;justify-content:space-between;margin:0 0 10px;color:#a89878}
`;

export class Screens {
  constructor(onDescend) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.onDescend = onDescend;
    this.root = document.createElement('div');
    this.root.id = 'screens';
    document.body.appendChild(this.root);
    this.pick = { hero: 'isaac', level: null };
    this.name = null;
  }

  show(name) {
    this.name = name;
    if (!name || name === 'paused') { this.root.classList.remove('up'); return; }
    this.root.classList.add('up');
    if (name === 'over') this.renderOver();
    else this.renderGatehouse();
  }

  /* The outcome. Every word of it was written by endRun -- which knows what
   * was banked, what the corpse kept and whether an older one was lost -- and
   * read back out of the store the host gives it. */
  renderOver() {
    const title = (el.overTitle && el.overTitle.innerHTML) || 'The delve ends';
    const sub = (el.overSub && el.overSub.textContent) || '';
    const stats = (el.overStats && el.overStats.innerHTML) || '';
    this.root.innerHTML =
      '<div class="card">' +
        '<h1>' + title + '</h1>' +
        '<p class="sub">' + sub + '</p>' +
        '<div class="stats">' + stats + '</div>' +
        '<button class="go" type="button">To the gate-house</button>' +
      '</div>';
    this.root.querySelector('.go').addEventListener('click', () => this.show('splash'));
  }

  /* Which delve, and who goes down. The ladder is long, so this shows the
   * rungs around the one you can actually handle rather than all fifty-two. */
  renderGatehouse() {
    // stashPower(), not powerLevel(). powerLevel takes (gear, level) and
    // called bare returns NaN -- which then compares false against every rung
    // and quietly labelled the whole ladder "an even match".
    const power = typeof stashPower === 'function' ? stashPower() : 1;
    if (!this.pick.level) this.pick.level = LEVELS[0].id;
    const here = LEVELS.findIndex(l => l.id === this.pick.level);
    const from = Math.max(0, here - 3), to = Math.min(LEVELS.length, from + 8);
    const rungs = LEVELS.slice(from, to);

    // What the corpse is carrying, said only where there is something to say:
    // "0 finds and 25 coin" is a sentence written by arithmetic rather than by
    // anyone.
    let corpse = '';
    if (stash.corpse) {
      const c = stash.corpse, bits = [];
      if (c.items.length) bits.push(c.items.length + ' find' + (c.items.length === 1 ? '' : 's'));
      if (c.coins) bits.push(c.coins + ' coin');
      corpse = '<p class="sub">A corpse of yours lies in ' +
        ((LEVEL_BY_ID[c.level_id] || {}).name || 'a delve') +
        (bits.length ? ' with ' + bits.join(' and ') : '') +
        '. Descend there and take it back.</p>';
    }

    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Gate-House</h1>' +
        '<p class="sub">Choose a rung and one of the Clear-Sighted.</p>' +
        '<div class="purse"><span>Purse</span><b>' + (stash.coins || 0) + ' coin</b></div>' +
        '<div class="purse"><span>Power</span><b>' + power + '</b></div>' +
        corpse +
        '<div class="rows" id="heroRows">' +
          Object.values(HEROES).map(h =>
            '<button class="row' + (this.pick.hero === h.id ? ' on' : '') +
            '" data-hero="' + h.id + '" type="button"><span>' + h.name +
            '<small>' + h.title + '</small></span></button>').join('') +
        '</div>' +
        '<div class="rows" id="rungRows">' +
          rungs.map(l =>
            '<button class="row' + (this.pick.level === l.id ? ' on' : '') +
            '" data-level="' + l.id + '" type="button"><span>' + l.name +
            '<small>power ' + l.power + ' · ' + l.quota + ' slag</small></span>' +
            '<small>' + (l.power > power + 2 ? 'above your weight'
                       : l.power < power - 2 ? 'well within you' : 'an even match') +
            '</small></button>').join('') +
        '</div>' +
        '<button class="go" type="button" id="descend">Descend</button>' +
      '</div>';

    this.root.querySelectorAll('[data-hero]').forEach(b =>
      b.addEventListener('click', () => { this.pick.hero = b.dataset.hero; this.renderGatehouse(); }));
    this.root.querySelectorAll('[data-level]').forEach(b =>
      b.addEventListener('click', () => { this.pick.level = b.dataset.level; this.renderGatehouse(); }));
    this.root.querySelector('#descend').addEventListener('click', () => {
      this.root.classList.remove('up');
      this.onDescend(this.pick.hero, this.pick.level);
    });
  }
}
