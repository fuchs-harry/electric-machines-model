/*
 * Page scaffolding shared by the simulation pages: toolbar with transport
 * controls, stage, inspector (Parameter | Experimente) and the experiment
 * runner (predict → run → explanation).
 */
(function (root) {
  'use strict';
  const MS = root.MS;
  const L = MS.L;
  const ui = MS.ui;
  const { h } = ui;
  MS.pages = MS.pages || {};

  const shell = {};

  /** Toolbar + workspace skeleton. Returns element refs. */
  shell.page = ({ title, subtitle, controls = [] }) => {
    const titleEl = h('h1', { text: title });
    const subEl = h('p', { html: subtitle || '' });
    const menu = ui.button({ icon: 'menu', kind: 'plain menu-btn', title: 'Navigation', onClick: () => MS.app.toggleNav() });
    const transport = h('div', { class: 'transport' }, ...controls);
    const toolbar = h('header', { class: 'toolbar' }, menu, h('div', { class: 'title-block' }, titleEl, subEl), transport);
    const stage = h('div', { class: 'stage' });
    const inspector = h('aside', { class: 'inspector', 'aria-label': L('Einstellungen', 'Settings') });
    const workspace = h('div', { class: 'workspace' }, stage, inspector);
    const el = h('div', { class: 'page' }, toolbar, workspace);
    // keep the sticky inspector just below the (wrapping) toolbar
    new ResizeObserver(() => el.style.setProperty('--tb-h', toolbar.offsetHeight + 'px')).observe(toolbar);
    return { el, toolbar, titleEl, subEl, transport, stage, inspector };
  };

  /** Speed (time-lapse) options. */
  shell.SPEEDS = [
    { value: '1', label: L('Echtzeit', 'Real time') },
    { value: '0.5', label: L('½ × langsamer', '½ × slower') },
    { value: '0.25', label: '¼ ×' },
    { value: '0.1', label: '1/10 ×' },
    { value: '0.02', label: '1/50 ×' },
    { value: '0.005', label: '1/200 ×' },
  ];

  /**
   * Transport controls. sim = {isOn, setOn, running, setRunning, reset, speed, setSpeed}
   */
  shell.transport = (sim) => {
    const power = ui.power({ get: () => sim.isOn(), set: (v) => sim.setOn(v), title: L('Maschine ein-/ausschalten', 'Switch the machine on/off') });
    const play = ui.button({ icon: 'pause', kind: '', title: 'Pause' });
    const syncPlay = () => {
      const r = sim.running();
      play.replaceChildren(ui.icon(r ? 'pause' : 'play'));
      play.title = r ? L('Pause', 'Pause') : L('Weiter', 'Resume');
      play.setAttribute('aria-label', play.title);
    };
    play.classList.add('icon');
    play.addEventListener('click', () => { sim.setRunning(!sim.running()); syncPlay(); });
    const reset = ui.button({ icon: 'reset', title: L('Zurücksetzen (Stillstand)', 'Reset (standstill)'), onClick: () => { sim.reset(); syncAll(); } });
    const sel = h('select', { 'aria-label': L('Simulationstempo', 'Simulation speed'), title: L('Tempo der Simulation (Zeitlupe)', 'Simulation speed (slow motion)') });
    for (const o of shell.SPEEDS) sel.append(h('option', { value: o.value, text: o.label }));
    sel.addEventListener('change', () => sim.setSpeed(parseFloat(sel.value)));
    const speed = h('span', { class: 'popup' }, sel);
    const syncAll = () => {
      power.sync();
      syncPlay();
      const v = String(sim.speed());
      if (![...sel.options].some((o) => o.value === v)) sel.append(h('option', { value: v, text: v + ' ×' }));
      sel.value = v;
    };
    syncAll();
    return { els: [power.el, play, reset, speed], sync: syncAll };
  };

  /** Inspector with a Parameter / Experimente switch. */
  shell.inspector = (inspector, { groups, experiments }) => {
    let tab = 'params';
    const paramsBox = h('div', { class: 'inspector-pane', style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    for (const g of groups) if (g) paramsBox.append(g.el);
    const expBox = h('div', { class: 'inspector-pane experiments' });
    if (experiments) expBox.append(experiments);
    const seg = ui.seg({
      options: [{ value: 'params', label: L('Parameter', 'Parameters') }, { value: 'exp', label: L('Experimente', 'Experiments') }],
      get: () => tab,
      set: (v) => { tab = v; show(); },
      full: true,
      label: L('Inspektor', 'Inspector'),
    });
    const show = () => {
      paramsBox.style.display = tab === 'params' ? 'flex' : 'none';
      expBox.style.display = tab === 'exp' ? 'flex' : 'none';
      seg.sync();
    };
    inspector.append(seg.el, paramsBox, expBox);
    show();
    return {
      sync: () => groups.forEach((g) => g && g.sync && g.sync()),
      showTab: (t) => { tab = t; show(); },
    };
  };

  /** Card with header (title, hint, right-side actions) and body. */
  shell.card = ({ title, hint, actions = [], body = [], cls = '' }) => {
    const head = h('div', { class: 'card-head' },
      h('h2', { html: title }),
      hint ? h('span', { class: 'hint', html: hint }) : null,
      h('span', { class: 'spacer' }),
      ...actions);
    return h('section', { class: 'card ' + cls }, head, ...body);
  };

  /** Read-out tile: {label(html), q (quantity key), unit} → {el, set(value, sub)} */
  shell.readout = ({ label, q, unit = '', digits }) => {
    const val = h('span');
    const unitEl = h('small', { html: unit });
    const sub = h('div', { class: 'sub' });
    const el = h('div', { class: 'readout' },
      h('div', { class: 'lbl' }, q ? h('i', { class: 'key', style: { color: `var(--${ui.Q[q]})` } }) : null, h('span', { html: label })),
      h('div', { class: 'val' }, val, unitEl),
      sub);
    return {
      el,
      set(v, subText, unitOverride) {
        val.textContent = ui.fmt(v, digits);
        if (unitOverride !== undefined) unitEl.innerHTML = unitOverride;
        sub.innerHTML = subText || ' ';
      },
    };
  };

  /** Power balance bars: rows [{key, label, q}] → {el, set(values, scale)} */
  shell.powerBars = (rows) => {
    const els = rows.map((r) => {
      const fill = h('span', { class: 'fill', style: { background: `var(--${r.q ? ui.Q[r.q] : 'ink-3'})` } });
      const v = h('span', { class: 'v' });
      const el = h('div', { class: 'pbar' }, h('span', { html: r.label }), h('span', { class: 'track' }, fill), v);
      return { el, fill, v, r };
    });
    return {
      el: h('div', { class: 'power-bars' }, ...els.map((e) => e.el)),
      set(values, scale, unit = 'W', fmt) {
        const s = Math.max(scale, 1e-9);
        for (const e of els) {
          const x = values[e.r.key];
          const f = Number.isFinite(x) ? MS.clamp(x / s, -1, 1) : 0;
          e.fill.style.left = f >= 0 ? '50%' : `${50 + f * 50}%`;
          e.fill.style.width = `${Math.abs(f) * 50}%`;
          e.v.textContent = fmt ? fmt(x) : `${ui.fmt(x)} ${unit}`;
        }
      },
    };
  };

  /**
   * Experiments list. Each experiment:
   * {title, tag, question, choices[], correct, watch, explain(html), duration, run(ctx)}
   * runner = {start(exp), elapsed(), onDone(fn)}
   */
  shell.experiments = (list, runner) => {
    const box = h('div', { class: 'experiments' });
    box.append(h('p', { class: 'group-foot', style: { padding: '0 4px' }, html: L('Erst tippen, was passieren wird. Dann starten und beobachten – die Auflösung erscheint, sobald der Versuch gelaufen ist.', 'First guess what will happen. Then run it and watch – the explanation appears once the experiment has finished.') }));
    for (const exp of list) {
      let picked = -1;
      const choiceBtns = exp.choices.map((c, i) => {
        const b = h('button', { type: 'button', html: c });
        b.addEventListener('click', () => {
          picked = i;
          choiceBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j)));
        });
        return b;
      });
      const verdict = h('div', { class: 'verdict', hidden: true });
      const reveal = () => {
        verdict.hidden = false;
        const ok = picked === exp.correct;
        choiceBtns.forEach((b, j) => {
          b.classList.toggle('right', j === exp.correct);
          b.classList.toggle('wrong', j === picked && !ok);
        });
        verdict.innerHTML = (picked < 0 ? '' : ok ? L('<strong>Richtig.</strong> ', '<strong>Correct.</strong> ') : L('<strong>Nicht ganz.</strong> ', '<strong>Not quite.</strong> ')) + exp.explain;
      };
      const startBtn = ui.button({
        label: L('Versuch starten', 'Run experiment'), icon: 'play', kind: 'primary', small: true,
        onClick: () => {
          verdict.hidden = true;
          choiceBtns.forEach((b) => b.classList.remove('right', 'wrong'));
          runner.start(exp, reveal);
        },
      });
      const showBtn = ui.button({ label: L('Auflösung', 'Show answer'), kind: 'plain', small: true, onClick: reveal });
      box.append(h('article', { class: 'exp' },
        h('div', { class: 'exp-head' }, h('h3', { html: exp.title }), exp.tag ? h('span', { class: 'badge', text: exp.tag }) : null),
        h('p', { html: exp.question }),
        h('div', { class: 'choices' }, ...choiceBtns),
        exp.watch ? h('p', { class: 'muted', style: { fontSize: '12px' }, html: L('Beobachte: ', 'Watch: ') + exp.watch }) : null,
        h('div', { class: 'exp-actions' }, startBtn, showBtn),
        verdict));
    }
    return box;
  };

  /**
   * Generic experiment runner over a model with sim time `t`.
   * opts: {getTime, prepare(exp), afterRun?}
   */
  shell.runner = ({ getTime, prepare }) => {
    let job = null;
    return {
      start(exp, onDone) {
        prepare(exp);
        job = { exp, onDone, t0: getTime(), events: (exp.events || []).slice().sort((a, b) => a.at - b.at), fired: 0 };
      },
      /** call each tick after advancing the model; ctx passed to events */
      tick(ctx) {
        if (!job) return;
        const t = getTime() - job.t0;
        while (job.fired < job.events.length && job.events[job.fired].at <= t) {
          job.events[job.fired].do(ctx);
          job.fired++;
          if (ctx.sync) ctx.sync();
        }
        if (t >= (job.exp.duration || 1)) {
          const done = job.onDone;
          job = null;
          if (done) done();
        }
      },
      get active() { return !!job; },
      cancel() { job = null; },
    };
  };

  /** Formula list: items [{eq: html, res: html, note}] → {el, set(items)} */
  shell.formulas = () => {
    const el = h('div', { class: 'formulas' });
    let lastKey = '';
    return {
      el,
      set(items) {
        const key = items.map((i) => i.eq + '|' + (i.res || '') + '|' + (i.note || '')).join('#');
        if (key === lastKey) return;
        lastKey = key;
        el.replaceChildren(...items.map((it) => h('div', { class: 'formula' },
          h('div', { class: 'eq', html: it.eq }),
          h('div', { class: 'res', html: it.res || '' }),
          it.note ? h('div', { class: 'note', html: it.note }) : null)));
      },
    };
  };

  /** Number in formula (upright UI font). */
  shell.n = (v, d) => `<span class="n">${ui.fmt(v, d)}</span>`;
  /** Fraction html. */
  shell.frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;

  MS.shell = shell;
})(window);
