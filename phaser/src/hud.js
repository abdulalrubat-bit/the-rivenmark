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

import { bossShown, bossBarDrop, minimapBox } from './overlay.js';

/* global player, run, enemies, view, LEVEL, REGION, HUD_H, ABILITIES,
          ABILITY_BY_ID, CHARGE_MAX, TENSION_MAX */

const g = window;   // ONLY for the functions -- see the note in delve.js: a
                    // top-level const in a classic script never lands on
                    // window, so constants are read bare and calls are not.

const CSS = `
#hud{position:fixed;inset:0;pointer-events:none;font:12px ui-monospace,Menlo,monospace;
     color:#cebe9e;-webkit-user-select:none;user-select:none}
/* One band, not a red slab with text floating beside it. The frame, the inset
   and the stone colour are the boss bar's, so the two read as the same object
   in two sizes rather than as two different games' HUDs. */
#hud .top{position:absolute;left:8px;right:8px;top:8px;display:flex;gap:6px;align-items:stretch;
     background:rgba(16,13,10,.72);border:1px solid #4a3f30;border-radius:4px;padding:3px}
#hud .life{flex:1;height:16px;background:#0d0b09;border:1px solid #3a3226;border-radius:2px;
     overflow:hidden;position:relative}
#hud .life i{display:block;height:100%;background:linear-gradient(#d1503c,#7c2018);
     transition:width .12s linear}
/* Quarter ticks, exactly as the boss bar has them: a bar that moves slowly
   still shows that it moved. */
#hud .life:after{content:'';position:absolute;inset:0;pointer-events:none;
     background:repeating-linear-gradient(90deg,transparent 0 24.6%,rgba(8,6,4,.5) 24.6% 25%)}
#hud .life b{position:absolute;inset:0;display:grid;place-items:center;font-weight:600;
     font-size:11px;text-shadow:0 1px 2px #000;z-index:1}
/* Low. The bar is the one number worth interrupting the player for, and a red
   bar on a dark red background is not a warning. */
#hud .life.low i{background:linear-gradient(#ff6a4d,#a52a12)}
#hud .life.low{animation:lifepulse .9s ease-in-out infinite}
@keyframes lifepulse{0%,100%{box-shadow:0 0 0 rgba(255,106,77,0)}
     50%{box-shadow:0 0 7px rgba(255,106,77,.55)}}
#hud .slag{min-width:86px;display:flex;align-items:center;justify-content:flex-end;gap:4px;
     padding-right:3px;font-size:11px;text-shadow:0 1px 2px #000;white-space:nowrap}
#hud .slag u{width:7px;height:7px;background:#c99a3e;border:1px solid #7c5f24;
     transform:rotate(45deg);text-decoration:none;flex:none}
#hud .slag.met{color:#e8c060}
/* The way out. Top-LEFT, under the strip: the top-right corner is the map and
   the bottom two are thumbs, and this is a button you must never press by
   accident in a fight -- so it goes in the one corner a hand does not visit.
   Understated on purpose. It is not a control you use, it is one you find. */
#hud .hold{position:absolute;left:10px;top:40px;pointer-events:auto}
/* Deliberately NOT the kit's plate. This is a control you find, not one you
   use, and giving it the same bronze would put a sixth big gold disc on the
   screen competing with the five that matter. */
#hud .hold button{width:34px;height:34px;border-radius:50%;background:rgba(20,17,14,.55);
     border:1px solid rgba(74,63,48,.8);color:#9a8f7c;font:12px/1 ui-monospace,monospace;
     box-shadow:none}
#hud .hold button:before{display:none}
#hud .hold button:active{background:#2a2419;color:#e8dcc0}
/* The kit sits bottom-right in two rows of three. Its own bottom edge, the
   swap beside it rather than above it, and the resource meter over it are all
   placed so nothing lands on anything else -- measured in the play test, not
   eyeballed, because the first version put the swap through the middle of the
   kit and the diagnostics button on top of both. */
#hud .kit{position:absolute;right:10px;bottom:16px;display:grid;gap:8px;
     grid-template-columns:repeat(3,56px);pointer-events:auto}
/* CUT FROM THE SAME STONE.
 *
 * The kit was flat black discs with a hairline ring, and they are the largest
 * things on the screen -- so the one part of the HUD a thumb lives on was the
 * one part that did not look like the game. Everything else here is
 * framePlate's object: a bronze band, a slate face lit from the north-west,
 * and a dark line between them. A button is that object, round.
 *
 * The band is the button's own background and the face is ::before, because a
 * border cannot carry a gradient. Everything above the face -- the sweep, the
 * mark, the seconds -- is inset by the band's width so nothing draws over it.
 */
#hud button{width:56px;height:56px;border-radius:50%;color:#e8dcc0;border:0;
     background:linear-gradient(#e2b96a,#a67c3a 34%,#6d4d22 70%,#3a2610);
     font:16px/1 ui-monospace,monospace;padding:0;
     display:grid;place-items:center;touch-action:manipulation;position:relative;
     overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.55)}
#hud button:before{content:'';position:absolute;inset:3px;border-radius:50%;
     background:linear-gradient(rgba(44,54,70,.85),rgba(10,14,22,.96)),#161310;
     box-shadow:inset 0 1px 0 rgba(150,172,200,.22),0 0 0 1px rgba(0,0,0,.85)}
/* THE SWEEP. A cooldown used to replace the ability's mark with a number,
   which took the one thing that says WHICH ability this is away at exactly the
   moment you are waiting for it. The mark stays now and the time is shown as a
   wedge draining clockwise -- readable without reading, which is what a hand
   in a fight has time for. The number stays too, small, under the mark, for
   when a second matters. */
#hud button .sweep{position:absolute;inset:4px;border-radius:50%;pointer-events:none;
     background:conic-gradient(from -90deg,rgba(6,5,3,.66) calc(var(--cd,0) * 360deg),
     transparent 0)}
#hud button .cd{position:absolute;bottom:5px;font:600 9px/1 ui-monospace,monospace;
     color:#ffd870;text-shadow:0 1px 2px #000}
#hud button .mark{position:relative;z-index:1}
/* Cooling and CANNOT are different states and used to look the same. Cooling
   keeps its colour and shows the wedge; blocked -- no charges, nothing in
   reach -- goes flat and grey, because no amount of waiting fixes it. */
/* Blocked loses the bronze as well as the colour: no amount of waiting fixes
   it, so it should not look like a thing that is warming up. */
#hud button:disabled{color:#9a8f7c;opacity:.62;
     background:linear-gradient(#6a5f4c,#4a4034 40%,#332c22)}
#hud button.cooling{opacity:1;color:#e8dcc0}
#hud button.ready{box-shadow:0 0 12px rgba(214,178,110,.45),0 2px 6px rgba(0,0,0,.55)}
#hud button.ready:before{box-shadow:inset 0 1px 0 rgba(214,178,110,.4),
     0 0 0 1px rgba(0,0,0,.85)}
#hud button:active:before{background:linear-gradient(rgba(64,74,90,.9),rgba(26,32,44,.96)),#2a2419}
#hud .swap{position:absolute;right:204px;bottom:16px;pointer-events:auto}
#hud .res{position:absolute;right:10px;bottom:148px;display:flex;gap:5px;
     align-items:center;justify-content:flex-end}
#hud .pip{width:11px;height:11px;border-radius:50%;border:1px solid #6a5a42;background:#161310}
#hud .pip.on{background:#ffd870;border-color:#ffd870}
#hud .tension{width:74px;height:9px;border:1px solid #4a6a7a;background:#0e1418;border-radius:2px}
#hud .tension i{display:block;height:100%;background:#5fd0ff}
#hud .beat{position:absolute;left:8px;right:110px;bottom:16px;height:5px;
     background:#12100d;border:1px solid #3a3226}
/* The banner announces a moment. The offset here is a fallback only -- sync()
   sets it from where the map ends, since that is the one band on a phone
   screen that is neither chrome nor the fight. See the note there. */
#hud .banner{position:absolute;left:14px;right:14px;top:26%;text-align:center;font-size:19px;
     color:#eee0c0;text-shadow:0 2px 6px #000;font-family:Georgia,serif}
#hud .banner small{display:block;font-size:12px;color:#a89878;margin-top:4px;font-style:italic}
/* When the boss bar is already carrying his name, the banner is only the line
   about what to do -- so that line IS the banner, not a subtitle under nothing. */
#hud .banner b{display:block;font:400 italic 15px/1.4 Georgia,serif;color:#e2c48c}
#hud .banner em{display:block;font:600 9px ui-monospace,Menlo,monospace;letter-spacing:2px;
     color:#968466;margin-bottom:6px;font-style:normal}
/* The boss bar. Fixed to the top strip under the life bar, and the map drops
   by its height so the two never stack -- bossBarDrop() is the one answer both
   read, which is how the canvas build stopped them drifting apart. */
/* 44px tall and 8px down from the HUD, exactly as the canvas build's
   BOSS_BAR_H and y0 -- because bossBarDrop() returns BOSS_BAR_H + 8 and the
   map and the toast both step down by it. Let the box find its own height and
   it grows past what everything below it made room for: the toast landed two
   pixels inside it. */
#hud .boss{position:absolute;left:12px;right:12px;top:86px;height:44px;
     box-sizing:border-box;background:#2a2620;border:2px solid #8c6830;
     border-radius:3px;padding:2px 8px 0;overflow:hidden}
#hud .boss .line{display:flex;align-items:baseline;gap:8px;height:16px}
#hud .boss .name{flex:1;font:13px/16px Georgia,serif;color:#eee0c0;white-space:nowrap;
     overflow:hidden;text-overflow:ellipsis}
#hud .boss .count{font:600 10px/16px ui-monospace,Menlo,monospace;color:#cebe9e}
#hud .boss .bar{margin-top:1px;height:10px;background:#080b11;border:1px solid #d6b26e;
     position:relative;overflow:hidden}
#hud .boss .bar i{display:block;height:100%;
     background:linear-gradient(#e8c060,#806a34);transition:width .12s linear}
/* Quarter ticks, so a bar that moves slowly still shows that it moved. */
#hud .boss .bar u{position:absolute;inset:0;
     background:repeating-linear-gradient(90deg,transparent 0 24.6%,rgba(10,7,4,.55) 24.6% 25%)}
#hud .boss.invader .bar i{background:linear-gradient(#e2782c,#7c4118)}
/* Held: while a Lieutenant stands the Deceiver takes fourteen per cent, and
   without saying so the bar simply looks broken and the player keeps hitting
   the wrong thing. */
#hud .boss .bar.held i{background-image:repeating-linear-gradient(45deg,
     rgba(20,14,8,.5) 0 3px,transparent 3px 8px),linear-gradient(#e8c060,#806a34)}
/* HELD sits in the name line beside the count. It used to be a strip across
   the bottom of the plate, which put a gold sentence on top of the bar's own
   gold hatching -- unreadable, and it is the one line that says why his health
   is not moving. A word and a pip for each Lieutenant standing says the same
   thing in the space a glance has; the banner explains it once on arrival. */
#hud .boss .held{display:flex;align-items:center;gap:4px;flex:none;height:14px;
     font:600 9px/12px ui-monospace,Menlo,monospace;color:#e8c060;
     padding:0 5px;border:1px solid rgba(232,192,96,.5);border-radius:2px;
     background:rgba(20,14,8,.55)}
#hud .boss .held[hidden]{display:none}
#hud .boss .held s{text-decoration:none;letter-spacing:1px}
#hud .boss .held span{width:6px;height:6px;border-radius:50%;background:#c2352a;
     border:1px solid #e8c060;flex:none}
/* The Crucible-Mass is held for the opposite reason and has to read that way:
   the Deceiver's bar will not fall, and this one climbs back up. Green, which
   is the totem's own colour, so the pips point at the thing to go and cut. */
#hud .boss .bar.mend i{background-image:repeating-linear-gradient(45deg,
     rgba(14,20,8,.5) 0 3px,transparent 3px 8px),linear-gradient(#ff8a3c,#8a4418)}
#hud .boss .held.mend{color:#9dbb5a;border-color:rgba(157,187,90,.55)}
#hud .boss .held.mend span{background:#9dbb5a;border-color:#cfe08a}
/* What you just picked up, in its rarity colour. Left-aligned and clipped
   rather than centred at its natural width: an item name is long enough that
   a centred box grew into the map, and it did. */
#hud .toast{position:absolute;left:12px;height:24px;line-height:22px;padding:0 11px;
     background:rgba(10,8,5,.82);border:1px solid #6a5a42;font:13px Georgia,serif;
     white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .2s}
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
      '<div class="hold"><button type="button" title="hold" aria-label="hold">❙❙</button></div>' +
      '<div class="kit"></div>' +
      '<div class="boss" hidden>' +
        '<div class="line"><div class="name"></div>' +
          '<div class="held" hidden><s>HELD</s></div>' +
          '<div class="count"></div></div>' +
        '<div class="bar"><i></i><u></u></div>' +
      '</div>' +
      '<div class="toast" hidden></div>' +
      '<div class="banner" hidden></div>';
    document.body.appendChild(root);

    this.root = root;
    this.lifeBox  = root.querySelector('.life');
    this.lifeFill = root.querySelector('.life i');
    this.lifeText = root.querySelector('.life b');
    this.slag = root.querySelector('.slag');
    this.res = root.querySelector('.res');
    this.kit = root.querySelector('.kit');
    this.banner = root.querySelector('.banner');
    this.boss = root.querySelector('.boss');
    this.bossName = root.querySelector('.boss .name');
    this.bossCount = root.querySelector('.boss .count');
    this.bossBar = root.querySelector('.boss .bar');
    this.bossFill = root.querySelector('.boss .bar i');
    this.bossHeld = root.querySelector('.boss .held');
    this.toast = root.querySelector('.toast');
    this.swapBtn = root.querySelector('.swap button');
    this.swapBtn.addEventListener('click', () => g.swapHero());
    // click, not pointerdown: unlike an ability, being a beat late to pause is
    // free, and a pointerdown here would fire on a thumb that only brushed it.
    this.holdBtn = root.querySelector('.hold button');
    this.holdBtn.addEventListener('click', () => g.pauseRun());

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
      b.innerHTML = '<span class="sweep"></span><span class="mark">' + a.mark +
                    '</span><span class="cd"></span>';
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
    const tech = run.tech | 0;
    this.lifeBox.classList.toggle('low', f <= 0.3);
    if (this.slagSig !== tech) {
      this.slagSig = tech;
      // The icon marks it; the word still names it. An icon alone leaves a
      // number on screen that nobody new can read.
      this.slag.innerHTML = '<u></u>' + tech + ' / ' + LEVEL.quota + ' slag';
      this.slag.classList.toggle('met', tech >= LEVEL.quota);
    }

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
        // Cooling is not the same as blocked: one resolves by waiting and the
        // other does not, and they used to look identical.
        b.classList.toggle('cooling', why === 'gcd' || cd > 0);
        b.querySelector('.cd').textContent = cd >= 1 ? Math.ceil(cd) : '';
      }
      /* The wedge, every frame -- it is one custom property and the browser
       * paints the gradient, so it costs nothing to keep smooth, and a
       * cooldown that only redraws when its whole second ticks over judders. */
      /* The LONGER of the two waits, because an ability is unavailable until
       * both are done. Reading only its own cooldown left an ability that has
       * one but is currently just on the beat showing no wedge at all while
       * every button beside it showed the beat -- five buttons, three
       * different-looking answers to the same question. */
      const own = a.cd > 0 && cd > 0 ? cd / a.cd : 0;
      const beat = (p.gcdMax || 0) > 0 ? (p.gcd || 0) / p.gcdMax : 0;
      const frac = Math.max(0, Math.min(1, Math.max(own, beat)));
      if (b.__cd !== frac) { b.__cd = frac; b.style.setProperty('--cd', frac.toFixed(3)); }
    }
    const swapWhy = g.swapBlocked();
    this.swapBtn.disabled = !!swapWhy && swapWhy !== 'gcd';
    this.swapBtn.classList.toggle('ready', !swapWhy);
    this.swapBtn.textContent = (p.swapCd || 0) > 0 ? Math.ceil(p.swapCd) : '⇄';

    // The opening banner announces the level, then the region it was cut
    // from; anything the run raises later -- the gate, the boss -- replaces
    // both. Falling back to LEVEL was missing, so the port opened a delve
    // without ever naming it.
    if (run.banner > 0) {
      const tag = !run.bannerText && LEVEL.tag ? '<em>' + LEVEL.tag + '</em>' : '';
      const note = run.bannerNote || (!run.bannerText && (LEVEL.lesson || REGION.name)) || '';
      // Do not say his name twice. The avatar arriving raises the banner AND
      // the boss bar in the same frame, and both were writing out "The
      // Deceiver, the Riftborn and the Sundering" -- once in 13px across the
      // top of the screen and once in 19px serif across the middle of the
      // fight. The bar is the one that stays, so the banner keeps only the
      // line the bar cannot carry: what to do about him.
      const owner = bossShown();
      const echo = !!(owner && run.bannerText &&
                      run.bannerText === (owner.title ||
                        (owner.invader ? 'The Uninvited' : 'The Gilded Deceiver')));
      const head = echo ? '' : (run.bannerText || LEVEL.name);
      const html = tag + head +
                   (note ? (head ? '<small>' + note + '</small>'
                                 : '<b>' + note + '</b>') : '');
      if (this.bannerHtml !== html) { this.bannerHtml = html; this.banner.innerHTML = html; }
      // Anchored under the map rather than at a percentage of the screen.
      // 38% put a two-line announcement just above the hero, so its second
      // line reached down into the pack he was fighting; and any percentage
      // low enough to clear the fight is one the map can reach, because the
      // map moves down when the boss bar appears -- which is when there is an
      // announcement. Between the map and the fight is the band that is
      // always free, and only the map knows where it starts. Same trick as
      // bossBarDrop: ask the thing that owns the space where it ends.
      const mb = minimapBox();
      const under = Math.round(mb.y + mb.s + mb.over + 14);
      if (this.bannerTop !== under) {
        this.bannerTop = under;
        this.banner.style.top = under + 'px';
      }
      this.banner.hidden = false;
      // In, hold, out -- so the name does not simply appear and vanish.
      const a = Math.min(1, run.banner / 1.1) * Math.min(1, (4.2 - run.banner) / 0.5);
      this.banner.style.opacity = Math.max(0, a).toFixed(2);
    } else if (!this.banner.hidden) {
      this.banner.hidden = true;
    }

    this.syncBoss();
    this.syncToast();
  }

  /* The boss bar. Whoever owns the frame -- an invader first, because he is
   * the thing about to kill you -- with the hold state named rather than left
   * to look like a broken bar. */
  syncBoss() {
    const bs = bossShown();
    if (!bs) { if (!this.boss.hidden) this.boss.hidden = true; return; }
    this.boss.hidden = false;
    this.boss.classList.toggle('invader', !!bs.invader);
    const title = bs.title || (bs.invader ? 'The Uninvited' : 'The Gilded Deceiver');
    if (this.bossName.textContent !== title) this.bossName.textContent = title;
    this.bossCount.textContent =
      Math.max(0, Math.ceil(bs.hp)) + ' / ' + Math.round(bs.maxHp);
    const f = Math.max(0, Math.min(1, bs.hp / bs.maxHp));
    this.bossFill.style.width = (f * 100).toFixed(1) + '%';

    /* Both avatars have an escort and both look like a broken bar without a
     * word for it, but they are held for opposite reasons: the Deceiver's bar
     * will not fall while a Lieutenant stands, and the Crucible-Mass's climbs
     * back up while a totem does. Same shape, different verb and colour, and
     * the pips count whichever thing is doing it. */
    const mass = bs.kind === 'crucible';
    const held = !bs.invader &&
                 (mass ? (bs.tended || 0) > 0 : (g.escortAlive && g.escortAlive()));
    this.bossBar.classList.toggle('held', !!held && !mass);
    this.bossBar.classList.toggle('mend', !!held && mass);
    this.bossHeld.classList.toggle('mend', mass);
    if (!held) { this.bossHeld.hidden = true; this.heldPips = -1; return; }
    let live = 0;
    if (mass) live = bs.tended || 0;
    else for (const e of enemies) if (e.kind === 'lieutenant' && e.hp > 0) live++;
    // In the name line, beside the count, not across the bar. It was written
    // over the bar's own hatching in gold on gold and could not be read at
    // all -- and it is the one line that says why his health is not moving.
    // The sentence goes with it: HELD and two red pips says the same thing in
    // the space a glance has, and the banner explains it once on arrival.
    const stamp = (mass ? 'm' : 'h') + live;
    if (this.heldPips !== stamp) {
      this.heldPips = stamp;
      this.bossHeld.innerHTML = '<s>' + (mass ? 'MENDING' : 'HELD') + '</s>' +
                                '<span></span>'.repeat(live);
    }
    this.bossHeld.hidden = false;
  }

  /* What you just picked up, under the HUD bar and under the boss bar when
   * there is one -- bossBarDrop() is the same answer the map reads. */
  syncToast() {
    const t = run.toast;
    if (!t || t.life <= 0) { if (!this.toast.hidden) this.toast.hidden = true; return; }
    if (this.toastText !== t.text) {
      this.toastText = t.text;
      this.toast.textContent = t.text;
      this.toast.style.color = t.colour;
      this.toast.style.borderColor = t.colour;
      // Clipped rather than allowed to grow: the map lives top-right.
      const box = (window.minimapBox && window.minimapBox()) || { s: 132, pad: 14 };
      this.toast.style.maxWidth =
        Math.max(120, (view.w || 390) - box.s - box.pad - 40) + 'px';
    }
    this.toast.style.top = (HUD_H + 8 + (view.safeT || 0) + bossBarDrop()) + 'px';
    this.toast.style.opacity = Math.min(1, t.life / 0.5).toFixed(2);
    this.toast.hidden = false;
  }
}
