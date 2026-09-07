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

/* global player, run, state, enemies, view, LEVEL, REGION, HUD_H, ABILITIES,
          ABILITY_BY_ID, CHARGE_MAX, TENSION_MAX, COMBO_LEN, CONDUIT_EDGE */

/* Four roles, four colours, and the mapping lives beside the buttons because
 * it is a rendering decision -- the role itself is data on the ability, so the
 * canvas build reads the same word and is free to draw it differently. */
const ROLE_HUE = {
  strike: '#d9a441',   // sun-gold: it hurts something
  ward:   '#8fb9d6',   // arcane:   it keeps you standing
  mend:   '#7fb08f',   // green:    it gives life back
  snare:  '#cbb6ff'    // brand:    it takes something from them
};

const g = window;   // ONLY for the functions -- see the note in delve.js: a
                    // top-level const in a classic script never lands on
                    // window, so constants are read bare and calls are not.

const CSS = `
/* THE PARTS OF THE SCREEN THE PHONE HAS ALREADY TAKEN.
 *
 * A notch, a punch-hole, a status bar, a home indicator, a gesture bar. The
 * page asks for viewport-fit=cover so the delve fills the glass edge to edge,
 * which is right for the world and wrong for everything laid over it: the
 * life bar sat 8px from the top of a 390x844 frame, which on a phone with a
 * notch is underneath it, and the Conduit sat 14px from the bottom, which is
 * where the home indicator lives.
 *
 * Everything in the HUD is positioned absolutely against #hud, so the frame
 * itself is what moves: inset, not padding. An absolutely positioned box
 * resolves against its ancestor's padding box, and the padding box is INSIDE
 * the border and therefore contains the padding -- padding here changed
 * nothing at all, measurably, which is why it is worth writing down. Shrink
 * the frame and every offset below still means what it says.
 *
 * Held in custom properties rather than written as env() at each use. One
 * place to read, and a test can override the four to prove the plumbing
 * carries: env() cannot be set from a test, and a rule nothing can exercise
 * is a rule that stops being true without telling anyone.
 */
:root{--sa-t:env(safe-area-inset-top,0px);--sa-r:env(safe-area-inset-right,0px);
      --sa-b:env(safe-area-inset-bottom,0px);--sa-l:env(safe-area-inset-left,0px)}
#hud[hidden]{display:none!important}
#hud{position:fixed;pointer-events:none;font:12px ui-monospace,Menlo,monospace;
     inset:var(--sa-t) var(--sa-r) var(--sa-b) var(--sa-l);
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
#hud .kit{position:absolute;right:10px;bottom:124px;display:grid;gap:8px;
     grid-template-columns:repeat(3,56px);pointer-events:auto}

/* THE CONDUIT: where the attack lives.
 *
 * The blade used to swing itself -- an auto-target and a timer, and no input
 * at all -- which is the whole of why the attack felt meaningless. This is
 * the thumb's place now, and it is the biggest thing on the screen because it
 * is what the game is about.
 *
 * One control, three states, told apart by how it is touched. Tap it and the
 * blade comes round at the nearest body, harder than it ever swings on its
 * own, and chains if you keep the rhythm. Drag it and the aim is yours. Drag
 * it to the rim and hold, and it gathers.
 *
 * touch-action:none and pointer capture, both deliberate: a drag that
 * starts here has to keep reporting after it leaves the button, and without
 * the first the browser claims the gesture as a scroll a third of the way
 * through a cleave.
 */
#hud .conduit{position:absolute;right:12px;bottom:14px;width:96px;height:96px;
     border-radius:50%;pointer-events:auto;touch-action:none;
     background:linear-gradient(#e2b96a,#a67c3a 34%,#6d4d22 70%,#3a2610);
     box-shadow:0 3px 10px rgba(0,0,0,.6);display:grid;place-items:center;
     -webkit-user-select:none;user-select:none}
#hud .conduit:before{content:'';position:absolute;inset:4px;border-radius:50%;
     background:linear-gradient(rgba(44,54,70,.85),rgba(10,14,22,.96)),#161310;
     box-shadow:inset 0 1px 0 rgba(150,172,200,.22),0 0 0 1px rgba(0,0,0,.85)}
/* The rim, which is where a gather begins: it lights as the drag approaches
   it, so "hold it at the edge" is a thing the control tells you rather than a
   thing you have to be told. */
#hud .conduit .ring{position:absolute;inset:7px;border-radius:50%;
     border:2px solid rgba(232,192,96,var(--rim,.16));pointer-events:none}
/* The gather, as the cooldown wedge run backwards -- filling instead of
   draining, because this is a thing being built rather than spent. */
#hud .conduit .chg{position:absolute;inset:8px;border-radius:50%;pointer-events:none;
     background:conic-gradient(from -90deg,rgba(255,214,140,.55)
     calc(var(--chg,0) * 360deg),transparent 0)}
/* Where the thumb actually is. It is the only part that moves, so it is the
   part that says the aim is yours now. */
#hud .conduit .knob{position:absolute;width:26px;height:26px;border-radius:50%;
     background:radial-gradient(circle at 38% 32%,#ffe9bc,#c79a44 60%,#6d4d22);
     box-shadow:0 1px 3px rgba(0,0,0,.7);pointer-events:none;
     transform:translate(var(--kx,0px),var(--ky,0px));
     opacity:var(--knob,0);transition:opacity .08s linear}
#hud .conduit .glyph{position:relative;z-index:1;font:22px/1 ui-monospace,monospace;
     color:#ffd870;text-shadow:0 1px 3px #000;opacity:var(--mark,1);
     pointer-events:none}
/* The chain, as pips round the bottom of the rim. Three of them, and the
   third is the one that comes round wider. */
#hud .conduit .chain{position:absolute;bottom:9px;display:flex;gap:4px;
     pointer-events:none}
#hud .conduit .chain i{width:5px;height:5px;border-radius:50%;
     background:rgba(255,216,112,.2);box-shadow:0 0 0 1px rgba(0,0,0,.6)}
#hud .conduit .chain i.on{background:#ffd870}
#hud .conduit.gathering{box-shadow:0 0 16px rgba(255,214,140,.5),0 3px 10px rgba(0,0,0,.6)}
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
/* The seconds and the word cannot both have the bottom of the disc: they
 * overlapped, and a cooling button drew its remaining time through its own
 * name. The word is what you read while you are learning the kit and the
 * number is what you read in the middle of a fight, so when there is a
 * number the word stands down for it. */
#hud button .cd{position:absolute;bottom:6px;font:600 9px/1 ui-monospace,monospace;
     color:#ffd870;text-shadow:0 1px 2px #000;z-index:2}
#hud button.counting .tag{opacity:0}
#hud button .mark{position:relative;z-index:1;line-height:1;margin-top:-3px}
/* THE WORD, WHICH IS THE WHOLE POINT.
 *
 * A button used to be one abstract glyph, with the ability's name in a title
 * attribute -- a hover tooltip, on a game played with a thumb, which is to say
 * nowhere. Nine glyphs is nine things to memorise before you can play; nine
 * words is none.
 *
 * Small on purpose. It is read while you are learning the kit and ignored
 * afterwards, when the glyph and the colour carry it -- so it must not compete
 * with either during a fight.
 */
/* INSIDE THE CIRCLE, NOT INSIDE THE BOX.
 *
 * The tag ran the full 56px of the button and was cut off at both ends --
 * GUILLOTINE came out as a headless word with no ellipsis to say so. The
 * button is round and clips at the circle, and seven pixels up from the
 * bottom of a 56px disc the chord is only about 44px wide, so twelve pixels
 * of the tag were being drawn outside the shape and thrown away. The button's
 * own overflow:hidden did the cutting, so the tag's ellipsis never fired: as
 * far as the tag knew, it fitted.
 *
 * So it is inset to the chord. And rather than truncate the long ones -- the
 * word IS the thing that says which ability this is, which is why it was put
 * there -- a long tag is set smaller. Ten characters at 6.2px fit the 46px
 * that is actually visible; the ellipsis stays as a backstop for anything
 * longer still.
 */
#hud button .tag{position:absolute;bottom:11px;left:5px;right:5px;z-index:1;
     font:600 var(--tagfs,7.5px)/1 'IBM Plex Mono',ui-monospace,monospace;
     letter-spacing:.06em;
     color:var(--role,#d9a441);text-shadow:0 1px 2px #000;pointer-events:none;
     text-align:center;overflow:hidden;text-overflow:ellipsis;
     white-space:nowrap}
/* THE ROLE, AS A COLOUR. Four of them, and four is learnable in one delve
   where nine glyphs are not: gold hurts something, blue keeps you standing,
   green gives life back, violet takes something from them. The mark carries it
   too, so the pair is legible to anyone who cannot separate the hues. */
#hud button .mark{color:var(--role,#e8dcc0)}
/* WHAT IT COSTS, on the button rather than only in the shared meter. A button
   greyed for want of Charge and a button greyed for a cooldown were the same
   grey, and they are not the same problem: one is "wait" and the other is
   "go and hit something first". */
#hud button .cost{position:absolute;top:6px;left:0;right:0;z-index:1;
     display:flex;gap:2px;justify-content:center;pointer-events:none}
#hud button .cost i{width:4px;height:4px;border-radius:50%;
     background:rgba(255,216,112,.25);box-shadow:0 0 0 1px rgba(0,0,0,.55)}
#hud button .cost i.on{background:#ffd870}
#hud button .cost b{font:600 7.5px/1 'IBM Plex Mono',monospace;color:#ffd870;
     text-shadow:0 1px 2px #000}
/* Short of the price, rather than merely cooling: the ring goes amber and the
   word says so, because waiting will not fix it. */
/* NOT opacity. A translucent button shows the delve through its face -- two
 * of the five had pillars standing in the middle of them -- and a button you
 * can see the floor through does not read as unavailable, it reads as a hole
 * in the HUD. Both of these states are said with colour, on a face that stays
 * opaque. */
#hud button.broke{background:linear-gradient(#6d5a2c,#4a3c1e 40%,#332a14)}
#hud button.broke .tag{color:#c9a24a}
/* Cooling and CANNOT are different states and used to look the same. Cooling
   keeps its colour and shows the wedge; blocked -- no charges, nothing in
   reach -- goes flat and grey, because no amount of waiting fixes it. */
/* Blocked loses the bronze as well as the colour: no amount of waiting fixes
   it, so it should not look like a thing that is warming up. */
#hud button:disabled{color:#6f665a;
     background:linear-gradient(#4a443a,#332e27 40%,#241f1a)}
#hud button:disabled .tag,#hud button:disabled .mark{color:#6f665a}
#hud button:disabled:before{background:linear-gradient(rgba(30,32,36,.9),
     rgba(10,11,13,.97)),#121110}
#hud button.cooling{opacity:1;color:#e8dcc0}
#hud button.ready{box-shadow:0 0 12px rgba(214,178,110,.45),0 2px 6px rgba(0,0,0,.55)}
#hud button.ready:before{box-shadow:inset 0 1px 0 rgba(214,178,110,.4),
     0 0 0 1px rgba(0,0,0,.85)}
#hud button:active:before{background:linear-gradient(rgba(64,74,90,.9),rgba(26,32,44,.96)),#2a2419}
#hud .swap{position:absolute;right:204px;bottom:16px;pointer-events:auto}
/* The other hero is not an ability, so it does not take an ability's colour.
   Bone, which is what the rest of the frame is written in. */
#hud .swap button{--role:#cebe9e}
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
      /* Built like a kit button, for the same reason a kit button is: the
       * whole point of the tag under an ability's mark is that a glyph is a
       * thing to memorise and a word is not. This was one bare arrow, and
       * worse than that -- U+21C4 is missing from some system font stacks
       * and renders as NOTHING rather than as tofu, which is a 56px button
       * with nothing on it and no way to tell that from a bug. The word
       * carries it now whatever the font does. */
      '<div class="swap"><button type="button" title="swap">' +
        '<span class="mark">\u21c4</span><span class="tag">SWAP</span>' +
        '<span class="cd"></span></button></div>' +
      '<div class="hold"><button type="button" title="hold" aria-label="hold">❙❙</button></div>' +
      '<div class="kit"></div>' +
      '<div class="conduit"><span class="ring"></span><span class="chg"></span>' +
        '<span class="knob"></span><span class="glyph">\u2726</span>' +
        '<span class="chain"></span></div>' +
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
    this.conduit = root.querySelector('.conduit');
    this.conRing = root.querySelector('.conduit .ring');
    this.conKnob = root.querySelector('.conduit .knob');
    this.conChain = root.querySelector('.conduit .chain');
    for (let i = 0; i < COMBO_LEN; i++) this.conChain.appendChild(document.createElement('i'));
    this.wireConduit();
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

  /* THE CONDUIT'S POINTER.
   *
   * All three states come off one press, told apart by distance and time, so
   * the whole of it is: where did the thumb go, and how long did it stay?
   *
   *   never past the deadzone, released quickly   -> a tap
   *   past the deadzone                           -> aiming, and firing
   *   out at the rim and held                     -> gathering
   *
   * The core owns the machine and this owns the pointer. Nothing here decides
   * what a tap is worth or how long a gather takes -- it reports an angle and
   * a distance, and reads back what the core made of it.
   *
   * setPointerCapture is not optional: a cleave is a drag that ends well
   * outside a 96px circle, and without capture the browser stops reporting
   * the moment the thumb leaves the button and the blade never comes round.
   */
  wireConduit() {
    const el = this.conduit;
    const R = 40;                       // the rim, in px from the middle
    const DEAD = 12;                    // ...and how far is "not a tap"
    let id = null, ox = 0, oy = 0;

    const vec = e => {
      const b = el.getBoundingClientRect();
      return { x: e.clientX - (b.left + b.width / 2),
               y: e.clientY - (b.top + b.height / 2) };
    };
    const show = (dx, dy, mag) => {
      const st = el.style;
      st.setProperty('--kx', dx.toFixed(1) + 'px');
      st.setProperty('--ky', dy.toFixed(1) + 'px');
      st.setProperty('--knob', mag > 0 ? '1' : '0');
      st.setProperty('--mark', mag > 0 ? '0.25' : '1');
      // The rim brightens as the drag reaches it, so "hold it at the edge" is
      // something the control says rather than something you are told.
      st.setProperty('--rim', (0.16 + 0.7 * Math.min(1, mag / CONDUIT_EDGE)).toFixed(2));
    };

    el.addEventListener('pointerdown', e => {
      if (id !== null) return;
      e.preventDefault(); e.stopPropagation();
      id = e.pointerId;
      const v = vec(e); ox = v.x; oy = v.y;
      try { el.setPointerCapture(id); } catch (err) { /* ignore */ }
      g.conduitPress();
    });

    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      e.preventDefault(); e.stopPropagation();
      const v = vec(e);
      const dx = v.x - ox, dy = v.y - oy;
      const d = Math.hypot(dx, dy);
      if (d < DEAD) { show(0, 0, 0); return; }
      const mag = Math.min(1, d / R);
      g.conduitAim(Math.atan2(dy, dx), mag);
      const k = Math.min(d, R);
      show(dx / d * k, dy / d * k, mag);
    });

    const up = e => {
      if (e.pointerId !== id) return;
      e.preventDefault();
      try { el.releasePointerCapture(id); } catch (err) { /* ignore */ }
      id = null;
      show(0, 0, 0);
      g.conduitRelease();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* What the control shows back: how much is gathered, and how far along the
   * chain a tap has got. Both written only when they CHANGE -- this runs every
   * frame and a style write that sets the same string still dirties layout. */
  syncConduit() {
    const p = player;
    if (!p) return;
    const chg = (p.cleave || 0);
    if (this.lastChg !== chg) {
      this.lastChg = chg;
      this.conduit.style.setProperty('--chg', chg.toFixed(3));
      this.conduit.classList.toggle('gathering', chg > 0);
    }
    const n = (p.comboT || 0) > 0 ? (p.combo || 0) : 0;
    if (this.lastChain !== n) {
      this.lastChain = n;
      const pips = this.conChain.children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < n);
    }
  }

  buildKit(hero) {
    this.kit.innerHTML = '';
    this.buttons = [];
    for (const a of ABILITIES[hero]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = a.id;
      b.title = a.name + ' — ' + a.note;
      b.style.setProperty('--role', ROLE_HUE[a.role] || '#d9a441');
      /* Set from the word's own length rather than typed per ability, so a
       * new one that happens to be long is legible the day it is added
       * instead of the day somebody notices it is not. 46px of visible chord
       * holds about eight characters at the standard size. */
      const tag = a.tag || a.name;
      b.style.setProperty('--tagfs', tag.length > 8 ? '6.2px'
                                   : tag.length > 6 ? '7px' : '7.5px');
      b.innerHTML = '<span class="sweep"></span><span class="cost"></span>' +
                    '<span class="mark">' + a.mark + '</span>' +
                    '<span class="tag">' + tag + '</span>' +
                    '<span class="cd"></span>';
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
    /* THE HUD BELONGS TO A DELVE, NOT TO THE GAME.
     *
     * At the gate-house there was a full life bar, a slag counter reading
     * 0/125 and a pause button standing behind the menu -- a HUD for a run
     * nobody had started, and the first thing a new player saw behind the
     * card was a game that looked like it was already in progress.
     *
     * Held is not the menu: the delve IS still standing there, the scene is
     * still drawing it and the card says as much, so the HUD stays. So the
     * test is whether there is a run under this, not whether a screen is up.
     */
    const inDelve = state === 'play' || state === 'pause';
    this.root.hidden = !inDelve;
    if (!inDelve) return;
    if (this.hero !== p.hero) this.buildKit(p.hero);

    this.syncConduit();
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
      /* What it costs, and how much of that you have. Part of the signature
       * so the pips repaint when the purse changes and not otherwise. */
      let held = 0, want = 0, note = '';
      if (a.cost) { want = a.cost; held = Math.min(want, p.charges | 0); }
      else if (a.costPct) {
        want = -1;
        note = Math.round(a.costPct * 100) + '%';
        held = (p.tension || 0) >= TENSION_MAX * a.costPct ? 1 : 0;
      } else if (a.uses) { want = -1; note = '\u00d7' + (p.jars | 0); held = (p.jars | 0) > 0 ? 1 : 0; }
      const s = why + '|' + Math.ceil(cd) + '|' + held + '|' + note;
      sig += s + ';';
      if (b.__s !== s) {
        b.__s = s;
        b.disabled = !!why && why !== 'gcd';
        b.classList.toggle('ready', !why);
        // Cooling is not the same as blocked: one resolves by waiting and the
        // other does not, and they used to look identical.
        b.classList.toggle('cooling', why === 'gcd' || cd > 0);
        // ...and short of the price is a third thing again. Waiting fixes a
        // cooldown; only going and hitting something fixes this one, so it
        // says so rather than wearing the same grey.
        b.classList.toggle('broke', why === 'cost');
        const secs = cd >= 1 ? String(Math.ceil(cd)) : '';
        b.querySelector('.cd').textContent = secs;
        b.classList.toggle('counting', secs !== '');
        const cost = b.querySelector('.cost');
        cost.innerHTML = want > 0
          ? Array.from({ length: want }, (_, i) =>
              '<i class="' + (i < held ? 'on' : '') + '"></i>').join('')
          : (note ? '<b>' + note + '</b>' : '');
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
    // Same shape as the kit: the seconds take the bottom of the disc while
    // they are there and the word stands down for them.
    const swapSecs = (p.swapCd || 0) > 0 ? String(Math.ceil(p.swapCd)) : '';
    this.swapBtn.querySelector('.cd').textContent = swapSecs;
    this.swapBtn.classList.toggle('counting', swapSecs !== '');

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
