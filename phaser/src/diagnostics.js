import Phaser from 'phaser';
const PHASER_VERSION = Phaser.VERSION || 'unknown';

/* What the phone can tell the desk.
 *
 * The whole reason this exists: a framerate complaint from a device I cannot
 * profile is unactionable, and reading numbers off a screen and typing them
 * out loses exactly the ones that matter. This gathers them into one block and
 * puts it on the clipboard.
 *
 * It reports the WORST frame and the share over budget, not the average. An
 * average is the one statistic that cannot show a stutter: a second holding
 * fifty-eight good frames and two half-second stalls averages to something
 * that looks fine and feels terrible. The canvas build's HUD averaged, and
 * that is why it never showed the problem it was built to show.
 */

// A rolling window of delivered frame intervals. Delivered, not computed:
// what the hand feels is when the picture changed, which includes time spent
// anywhere -- GC, the compositor, another app -- not just our own work.
export class FrameLog {
  constructor(n = 240) { this.n = n; this.ivals = []; this.last = 0; this.worstEver = 0; }
  tick(nowMs) {
    if (this.last) {
      const d = nowMs - this.last;
      this.ivals.push(d);
      if (d > this.worstEver) this.worstEver = d;
      if (this.ivals.length > this.n) this.ivals.shift();
    }
    this.last = nowMs;
  }
  stats() {
    if (this.ivals.length < 8) return null;
    const q = this.ivals.slice().sort((a, b) => a - b);
    const at = f => q[Math.min(q.length - 1, Math.floor(q.length * f))];
    const over = this.ivals.filter(v => v > 20).length;
    return {
      frames: q.length,
      p50: +at(0.5).toFixed(1), p90: +at(0.9).toFixed(1), p99: +at(0.99).toFixed(1),
      worst: +q[q.length - 1].toFixed(1),
      worstEver: +this.worstEver.toFixed(1),
      overPct: Math.round(100 * over / this.ivals.length),
      fps: Math.round(1000 / at(0.5))
    };
  }
}

/* The governor behind lowFx: is this device keeping up, and is there room to
 * put the mood back?
 *
 * Two measures, because either one alone is blind to half the ways a frame
 * goes wrong.
 *
 * CPU WORK, timed from the top of the scene's update to the game's
 * POST_RENDER. This is what the canvas build measured, and under canvas 2D it
 * was the whole story: the rasteriser is the CPU, so the work IS the time.
 *
 * DELIVERED INTERVALS, because under WebGL it is not. Measured here: the
 * atmosphere pass took this box from 60fps to 30 while CPU work moved from
 * 2.56ms to 2.84ms. The cost was entirely fill rate -- the driver takes the
 * draw calls and returns, and the bill arrives on the swap. A CPU timer cannot
 * see that at all, and a governor driven only by one would have sat there at
 * 30fps reporting plenty of headroom.
 *
 * Intervals have their own trap, and the canvas build fell into it: a display
 * is vsync-locked, so 16.7ms means "keeping up" and says nothing about by how
 * much. The old code compared against a fixed 11ms, which is 90fps and
 * unreachable on 60Hz hardware by definition, so once the glow came off it
 * never went back on. The fix is to compare against THE DISPLAY'S OWN PERIOD
 * rather than a constant: the tenth percentile of a long window is what this
 * screen does when nothing is in the way, and everything is judged relative to
 * it. That reads the same on 60Hz, 90Hz and 120Hz.
 */
export class FxGovernor {
  constructor(game, sample) {
    this.sample = sample;
    this.at = 0; this.last = 0;
    this.work = []; this.ivals = [];      // the current decision window
    this.periods = [];                    // long-lived, for the display's period
    this.lastTick = 0;
    this.good = 0;
    // How many good windows are needed to put the mood back. It GROWS each
    // time a restore is followed by another drop, so a device that genuinely
    // cannot afford the mood stops being asked every three quarters of a
    // second whether it has changed its mind. Without this the governor flaps:
    // turning the mood off is what makes the frame look affordable again.
    this.need = 3;
    this.droppedAt = 0;
    // How many times it has actually fired this session. Without this the dump
    // cannot distinguish "60fps with everything on" from "60fps because the
    // mood was shed a minute ago", and those are completely different findings
    // about the same number.
    this.drops = 0; this.raises = 0;
    const done = () => {
      if (!this.at) return;
      this.work.push(performance.now() - this.at);
      this.at = 0;
    };
    const ev = (Phaser.Core && Phaser.Core.Events && Phaser.Core.Events.POST_RENDER)
               || 'postrender';
    game.events.on(ev, done);
    this.hooked = ev;
  }

  begin(nowMs) {
    this.at = performance.now();
    if (this.lastTick) {
      const d = nowMs - this.lastTick;
      // A tab that was backgrounded returns one enormous interval; it is not
      // a rendering fact and must not move the display's period or the median.
      if (d > 0 && d < 400) { this.ivals.push(d); this.periods.push(d); }
      if (this.periods.length > 600) this.periods.shift();
    }
    this.lastTick = nowMs;
  }

  /* The display's own frame period: what this screen does when nothing is in
   * the way.
   *
   * CAPPED AT 17ms, and that cap is the whole thing working. Learned purely
   * from observation it is circular: with the atmosphere on, this box never
   * once beat 33.3ms, so the tenth percentile was 33.3 and the governor
   * concluded the display ran at 30Hz and was being hit perfectly -- while
   * sitting at half frame rate. No screen this game runs on is slower than
   * 60Hz, so an observed period above 17ms means frames are being MISSED, not
   * that the screen is slow. Floored at 6ms for the opposite case: a headless
   * or throttled context delivering sub-millisecond intervals would otherwise
   * set a bar nothing could clear.
   */
  period() {
    if (this.periods.length < 30) return 16.7;
    const q = this.periods.slice().sort((a, b) => a - b);
    return Math.min(17, Math.max(6, q[Math.floor(q.length * 0.1)]));
  }

  /* Decide, once every `sample` frames. Returns 'drop', 'raise' or null. */
  decide(low, dropMs, raiseMs) {
    if (this.work.length < this.sample || this.ivals.length < 8) return null;
    const avgWork = this.work.reduce((a, b) => a + b, 0) / this.work.length;
    const q = this.ivals.slice().sort((a, b) => a - b);
    const p50 = q[Math.floor(q.length * 0.5)];
    const per = this.period();
    this.stat = { work: +avgWork.toFixed(2), p50: +p50.toFixed(1), period: +per.toFixed(1) };
    this.work.length = 0; this.ivals.length = 0;

    if (!low) {
      // Either bottleneck is a reason to shed: the CPU over budget, or frames
      // simply not arriving on time whatever the CPU is doing.
      if (avgWork > dropMs || p50 > per * 1.25) {
        this.good = 0;
        const soon = this.droppedAt && performance.now() - this.droppedAt < 12000;
        if (soon) this.need = Math.min(24, this.need * 2);
        this.droppedAt = performance.now();
        this.drops++;
        return 'drop';
      }
      return null;
    }
    // Room to put it back: hitting the display's period AND cheap on the CPU.
    // Both, because either alone is satisfied by a frame that is only cheap
    // because the mood is currently off.
    const roomy = p50 <= per * 1.08 && avgWork < raiseMs;
    this.good = roomy ? this.good + 1 : 0;
    if (this.good >= this.need) { this.good = 0; this.raises++; return 'raise'; }
    return null;
  }
}

/* The layer profiler: where does a frame actually go?
 *
 * The canvas build has one of these too (tools/debug-overlay.js) and this is
 * deliberately the same method, the same statistics and the same report shape,
 * so a profile taken from each build on the SAME phone can be read side by
 * side. That comparison is the only thing that can say whether moving engines
 * bought anything.
 *
 * Ablation, for the reason set out on FxGovernor: no clock in this process can
 * see rasterising. Under WebGL the driver takes the draw calls and returns, and
 * the bill arrives at the swap -- measured here, the atmosphere took a box from
 * 60fps to 30 while CPU work moved 2.56ms to 2.84ms. So a layer is switched
 * off, the delivered frames are measured, and it is switched back on.
 *
 * Phaser ablates differently from the canvas build: there are no draw functions
 * to stub, only display objects to hide. Same idea, and `visible` is exactly
 * the switch -- Phaser skips an invisible object at submission time, which is
 * the cost being hunted.
 */
export class LayerProfiler {
  constructor(scene, sample = 30) {
    this.s = scene;
    this.n = sample;
    this.state = null;
  }

  /* What each layer is, resolved live: the scene rebuilds most of these on
   * every delve, so holding references from construction would profile the
   * previous world's objects. */
  layers() {
    const sc = this.s;
    const list = o => (Array.isArray(o) ? o : o ? [o] : []).filter(Boolean);
    return [
      ['walls',    list(sc.wallGfx)],
      ['dressing', list(sc.wallImgs)],
      ['scenery',  list(sc.propImgs)],
      ['bodies',   list(sc.pool).concat(list(sc.shadows), list(sc.hero), list(sc.heroShadow))],
      ['pickups',  list(sc.lootImgs).concat((sc.chestImgs || []).flatMap(c => [c.img, c.sh]))],
      ['gate',     list(sc.fx && sc.fx.gateGfx)],
      ['fx',       list(sc.fx && sc.fx.below).concat(list(sc.fx && sc.fx.above))],
      ['beacons',  list(sc.fx && sc.fx.lightGfx)],
      ['numbers',  list(sc.fx && sc.fx.texts)],
      ['overlay',  list(sc.overlay && sc.overlay.g).concat(
                     list(sc.overlay && sc.overlay.compass),
                     list(sc.overlay && sc.overlay.dawnLabel),
                     list(sc.overlay && sc.overlay.dawnPct))],
      ['fog',      list(sc.air && sc.air.fog)],
      ['motes',    list(sc.air && sc.air.moteGfx)],
      ['vignette', list(sc.air && sc.air.vig)],
      ['light',    list(sc.air && sc.air.lights)]
    ].filter(([, objs]) => objs.length);
  }

  start() {
    if (this.state && !this.state.done) return;
    this.state = { step: -1, samples: [], rows: [], base0: 0, base1: 0,
                   done: false, names: this.layers().map(l => l[0]), hidden: [] };
    this.next();
  }

  /* Only objects that were VISIBLE are hidden and restored. Half the delve is
   * already invisible at any moment -- culled dressing, an unused sprite in the
   * pool, a beacon with nothing under it -- and restoring those would put the
   * previous world back on screen and charge this layer for it. */
  hide(objs) {
    for (const o of objs) {
      if (o && o.visible) { o.visible = false; this.state.hidden.push(o); }
    }
  }
  show() {
    for (const o of this.state.hidden) o.visible = true;
    this.state.hidden.length = 0;
  }

  next() {
    this.show();
    const st = this.state;
    st.samples = [];
    st.step++;
    const L = this.layers();
    if (st.step === 0) return;                      // first baseline
    if (st.step <= L.length) { this.hide(L[st.step - 1][1]); return; }
    if (st.step === L.length + 1) return;           // second baseline
    st.done = true;
  }

  /* Fed one delivered interval per frame. */
  tick(ival) {
    const st = this.state;
    if (!st || st.done) return;
    st.samples.push(ival);
    if (st.samples.length < this.n) return;
    const q = st.samples.slice().sort((a, b) => a - b);
    const m = q[Math.floor(q.length / 2)];
    const L = st.names;
    if (st.step === 0) st.base0 = m;
    else if (st.step === L.length + 1) st.base1 = m;
    else st.rows.push([L[st.step - 1], m]);
    this.next();
    if (st.done) this.report();
  }

  label() {
    const st = this.state;
    if (!st) return '';
    if (st.done) return 'done';
    const L = st.names;
    if (st.step === 0 || st.step > L.length) return 'baseline';
    return L[st.step - 1] + ' ' + st.step + '/' + (L.length + 1);
  }

  report() {
    const st = this.state;
    this.show();
    const base = (st.base0 + st.base1) / 2;
    const drift = Math.abs(st.base1 - st.base0);
    // Vsync clamps this from below: no removed work makes a frame arrive
    // before the refresh, so a layer big enough to reach the ceiling alone has
    // its saving cut off. Marked rather than believed.
    const floor = Math.min.apply(null, st.rows.map(r => r[1]));
    // The noise band comes from how far the two baselines drifted, not from a
    // number picked in advance: a delve is not a still life.
    const band = Math.max(1, drift * 1.5);
    const rows = st.rows
      .map(([name, ms]) => [name, base - ms, ms <= floor + 1])
      .sort((a, b) => b[1] - a[1]);

    const lines = [
      'LAYER PROFILE (phaser) — median delivered frame, ' + this.n + ' frames each',
      'baseline ' + base.toFixed(1) + 'ms (' + (1000 / base).toFixed(0) + 'fps)' +
        ', drift ' + drift.toFixed(1) + 'ms between the two baselines'
    ];
    if (drift > base * 0.2) {
      lines.push('!! the two baselines disagree by more than a fifth: the world ' +
                 'changed under the run. Stand still, then profile again.');
    }
    if (base < 18) {
      lines.push('!! this device is already holding its refresh rate, so nothing ' +
                 'can show a saving. Ablation only measures a frame that is ' +
                 'ALREADY late. Profile on the device that is slow.');
    }
    lines.push('');
    for (const [name, saved, clamped] of rows) {
      const big = Math.abs(saved) >= band;
      lines.push('  ' + name.padEnd(12) +
                 (big && clamped ? '>=' : '  ') +
                 (saved >= 0 ? '-' : '+') + Math.abs(saved).toFixed(1) + 'ms' +
                 (!big ? '   (noise, band ' + band.toFixed(1) + 'ms)'
                       : clamped ? '   (hit the refresh ceiling — costs more than this)'
                                 : ''));
    }
    st.text = lines.join('\n');
  }
}

// The GPU behind the context, which is the single most useful line in here and
// the one thing that cannot be guessed from the far end. Chromium hides it
// behind an extension that is not always granted; say so rather than inventing
// a name.
function gpuOf(game) {
  const gl = game.renderer && game.renderer.gl;
  if (!gl) return { renderer: 'no GL context (canvas fallback)', vendor: '—' };
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return { renderer: gl.getParameter(gl.RENDERER) || 'masked',
                       vendor: gl.getParameter(gl.VENDOR) || 'masked' };
    return { renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
             vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) };
  } catch (e) { return { renderer: 'unavailable (' + e.message + ')', vendor: '—' }; }
}

export function collect(game, log, extra) {
  // Phaser's version off the bundled module, not off window.Phaser -- nothing
  // puts it there when Phaser is imported rather than script-tagged, and the
  // first version of this reported "unknown" for that reason alone.
  const r = game.renderer;
  const gpu = gpuOf(game);
  const s = log.stats();
  const scale = game.scale;
  return {
    when: new Date().toISOString(),
    build: (extra && extra.build) || 'phaser',
    phaser: PHASER_VERSION,
    renderer: r.type === 2 ? 'WebGL' : r.type === 1 ? 'Canvas' : 'headless',
    gpu: gpu.renderer, gpuVendor: gpu.vendor,
    // Both, because they diverge and the difference is usually the problem:
    // the drawing buffer is what the GPU actually fills.
    css: Math.round(scale.width) + 'x' + Math.round(scale.height),
    buffer: (r.width || 0) + 'x' + (r.height || 0),
    dpr: window.devicePixelRatio,
    screen: screen.width + 'x' + screen.height,
    frame: s || 'not enough frames yet',
    ...(extra || {}),
    ua: navigator.userAgent,
    mem: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'not reported',
    cores: navigator.hardwareConcurrency || 'not reported'
  };
}

export function asText(d) {
  const f = d.frame && typeof d.frame === 'object' ? d.frame : null;
  return [
    '--- Rivenmark diagnostics ---',
    d.when,
    'build      ' + d.build + '   phaser ' + d.phaser,
    'renderer   ' + d.renderer,
    'gpu        ' + d.gpu,
    'vendor     ' + d.gpuVendor,
    'css        ' + d.css + '   buffer ' + d.buffer + '   dpr ' + d.dpr,
    'screen     ' + d.screen,
    'memory     ' + d.mem + '   cores ' + d.cores,
    // Whether the mood was ON for the numbers below it. A frame rate means one
    // thing at full effects and quite another with them already shed, and the
    // dump used to report the number without the flag.
    d.fx ? 'effects    ' + d.fx : null,
    d.bake ? 'bake       ' + d.bake : null,
    f ? 'frames     ' + f.frames + ' sampled' : 'frames     ' + d.frame,
    f ? 'fps        ' + f.fps + '  (median ' + f.p50 + 'ms)' : '',
    f ? 'p90/p99    ' + f.p90 + 'ms / ' + f.p99 + 'ms' : '',
    f ? 'worst      ' + f.worst + 'ms in window, ' + f.worstEver + 'ms ever' : '',
    f ? 'over 20ms  ' + f.overPct + '% of frames' : '',
    d.bodies !== undefined ? 'bodies     ' + d.bodies : '',
    'ua         ' + d.ua,
    '--- end ---'
  ].filter(Boolean).join('\n');
}

/* The button.
 *
 * Deliberately DOM rather than a Phaser text object: it has to keep working
 * when the renderer is the thing that is broken, and a copy button drawn by a
 * failing renderer is no use at all. It also has to survive the clipboard API
 * being unavailable -- it needs a secure context, and http://localhost counts
 * but a phone reaching another machine's IP over plain http does not -- so
 * there is a textarea fallback that always works.
 */
export function mountButton(getReport, onProfile, profLabel) {
  const wrap = document.createElement('div');
  wrap.id = 'diag';
  wrap.innerHTML =
    '<button id="diagBtn" type="button">copy diagnostics</button>' +
    (onProfile ? '<button id="profBtn" type="button">profile</button>' : '') +
    '<div id="diagOut" hidden><textarea readonly rows="14"></textarea>' +
    '<div id="diagHint">clipboard unavailable — select all and copy</div></div>';
  const css = document.createElement('style');
  css.textContent =
    // Top-right, out of the thumbs. It used to sit bottom-right, where it
    // landed squarely on the ability buttons -- a developer affordance is
    // not worth a control you cannot press.
    '#diag{position:fixed;right:8px;top:34px;z-index:50;font:12px ui-monospace,monospace;' +
      'display:flex;flex-direction:column;gap:6px;align-items:flex-end}' +
    '#profBtn{background:#1b1712;color:#cebe9e;border:1px solid #4a3f30;border-radius:6px;' +
      'padding:10px 12px;font:inherit;min-height:44px;min-width:44px}' +
    '#profBtn:active{background:#2a2419}' +
    '#diagBtn{background:#1b1712;color:#cebe9e;border:1px solid #4a3f30;border-radius:6px;' +
      'padding:10px 12px;font:inherit;min-height:44px;min-width:44px}' +   // 44px: a thumb target
    '#diagBtn:active{background:#2a2419}' +
    '#diagOut{position:fixed;inset:8px;background:#0b0908;border:1px solid #4a3f30;' +
      'border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px}' +
    '#diagOut textarea{flex:1;width:100%;background:#12100d;color:#cebe9e;' +
      'border:1px solid #4a3f30;border-radius:4px;font:inherit;padding:6px}' +
    '#diagHint{color:#8c8168}' +
    '#diag [hidden]{display:none!important}';   // an attribute loses to any display rule
  document.head.appendChild(css);
  document.body.appendChild(wrap);

  const pbtn = wrap.querySelector('#profBtn');
  if (pbtn) {
    pbtn.addEventListener('click', () => {
      onProfile();
      // ~20 seconds with no sign of life reads as a crash, and the first thing
      // anyone does to a crashed button is press it again. `profLabel` is the
      // profiler's own progress, so this cannot say "done" while it is not.
      const t = setInterval(() => {
        const l = profLabel ? profLabel() : '';
        if (!l) return;
        pbtn.textContent = l === 'done' ? 'profile — done' : 'profiling ' + l;
        if (l === 'done') clearInterval(t);
      }, 400);
    });
  }

  const btn = wrap.querySelector('#diagBtn');
  const out = wrap.querySelector('#diagOut');
  const ta  = wrap.querySelector('textarea');

  btn.addEventListener('click', async () => {
    const text = getReport();
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (e) { copied = false; }
    if (copied) {
      btn.textContent = 'copied ✓';
      setTimeout(() => { btn.textContent = 'copy diagnostics'; }, 1600);
    } else {
      ta.value = text;
      out.hidden = false;
      ta.focus(); ta.select();
    }
  });
  // Anywhere in the fallback panel except the textarea closes it.
  out.addEventListener('click', e => { if (e.target !== ta) out.hidden = true; });
  return wrap;
}
