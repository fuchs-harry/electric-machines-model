/*
 * PSM page (per unit): machine, phasor diagram, equivalent circuit, current
 * plane with voltage/current limits, characteristic per mode, time plots,
 * live formulas, parameters and experiments.
 */
(function (root) {
  'use strict';
  const MS = root.MS;
  const L = MS.L;
  const ui = MS.ui;
  const shell = MS.shell;
  const C = MS.C;
  const { h } = ui;
  const S = (b, s) => `<span class="m">${b}${s ? `<sub>${s}</sub>` : ''}</span>`;
  const { n: N, frac } = shell;

  const META = {
    foc: {
      title: L('PSM – Sinusbetrieb', 'PMSM – sinusoidal operation'),
      sub: L('Rotororientierte Regelung: Der Strom wird im dq-System eingeprägt, mit i<sub>d</sub> = 0 steht er 90° vor dem Magneten – wie bei der Gleichstrommaschine, nur elektronisch kommutiert.',
        'Field-oriented (rotor-oriented) control: the current is impressed in the dq frame; with i<sub>d</sub> = 0 it leads the magnet by 90° – just as in a DC machine, only commutated electronically.'),
      tabs: [{ value: 'mw', label: 'm(ω)' }], speed: 0.25, window: 1200,
    },
    bldc: {
      title: L('PSM – Blockkommutierung', 'PMSM – block commutation'),
      sub: L('Drei Hall-Sensoren, zwei bestromte Stränge, sechs Stromrichtungen A–F. Einfach und billig, aber mit Momentwelligkeit.',
        'Three Hall sensors, two energised phases, six current directions A–F. Simple and cheap, but with torque ripple.'),
      tabs: [{ value: 'mw', label: 'm(ω)' }, { value: 'gamma', label: 'm(γ)' }], speed: 0.1, window: 400,
    },
    uf: {
      title: L('PSM – spannungsgesteuert', 'PMSM – open-loop voltage control'),
      sub: L('Drehspannung mit vorgegebener Frequenz, ohne Lagegeber und ohne Regelung. Zeigt, warum eine PSM ohne Dämpferwicklung kaum gesteuert betrieben werden kann.',
        'Three-phase voltage at a prescribed frequency, without a position sensor and without closed-loop control. Shows why a PMSM without a damper winding can hardly be operated open-loop.'),
      tabs: [{ value: 'delta', label: L('Polradwinkel', 'Load angle') }, { value: 'eig', label: L('Eigenwerte', 'Eigenvalues') }], speed: 1, window: 2000,
    },
    passive: {
      title: L('PSM – Generator & Kurzschluss', 'PMSM – generator & short circuit'),
      sub: L('Ohne Umrichter: Klemmen offen, kurzgeschlossen oder auf einen Widerstand. Die Maschine arbeitet als Generator auf ihre eigene Impedanz.',
        'No inverter: terminals open, short-circuited or connected to a resistor. The machine works as a generator feeding its own impedance.'),
      tabs: [{ value: 'mw', label: L('Bremskennlinie', 'Braking characteristic') }], speed: 0.25, window: 600,
    },
    dc: {
      title: L('PSM – Gleichstrom einprägen', 'PMSM – DC injection'),
      sub: L('Ein fester Stromraumzeiger zieht den Magneten an wie eine Kompassnadel. So richtet man den Rotor bei der Inbetriebnahme aus.',
        'A fixed current space vector pulls the magnet like a compass needle. This is how the rotor is aligned during commissioning.'),
      tabs: [{ value: 'gamma', label: 'm(γ)' }], speed: 1, window: 1800,
    },
  };
  const WINDOWS_S = [0.25, 0.5, 1, 2, 4, 8, 16];

  const fmtC = (z, d = 3) => {
    const re = ui.fmt(z.re, d), im = ui.fmt(Math.abs(z.im), d);
    return `${re} ${z.im < 0 ? '−' : '+'} j${im}`;
  };
  const fmtP = (z) => `${ui.fmt(C.abs(z), 3)}∠${ui.fmt(C.arg(z) / MS.DEG, 1)}°`;

  MS.pages.psm = (mode) => {
    if (!META[mode]) mode = 'foc';
    const meta = META[mode];
    const m = new MS.psm.PSM({ mode });
    const p = m.p;
    const D = MS.psm.defaults();
    const st = {
      running: true, speed: meta.speed, window: meta.window,
      tab: meta.tabs[0].value, phasorView: 'dq', esbView: 'space',
      trail: [], gVis: 0, flow: 0, lastDom: 0, sig: '', stat: null,
    };
    const tauToS = () => 1 / (MS.TAU * p.fN);

    // ------------------------------------------------------------ toolbar
    const transport = shell.transport({
      isOn: () => m.on,
      setOn: (v) => { if (v) m.switchOn(); else m.switchOff(); },
      running: () => st.running,
      setRunning: (v) => { st.running = v; },
      reset: () => { m.reset(); runner.cancel(); scope.clear(); st.trail = []; },
      speed: () => st.speed,
      setSpeed: (v) => { st.speed = v; },
    });
    const modeSeg = ui.seg({
      options: Object.entries(MS.psm.MODES).map(([k, v]) => ({ value: k, label: v.short, title: v.label })),
      get: () => mode, set: (v) => { location.hash = '#/psm/' + v; }, label: L('Betriebsart', 'Operating mode'),
    });
    const pg = shell.page({ title: meta.title, subtitle: meta.sub, controls: [modeSeg.el, ...transport.els] });

    // ------------------------------------------------------------ hero
    const figCanvas = h('canvas', { role: 'img', 'aria-label': L('Querschnitt der PSM mit Strangströmen und Raumzeigern', 'Cross-section of the PMSM with phase currents and space vectors') });
    const R = {
      w: shell.readout({ label: L('Drehzahl ', 'Speed ') + S('ω', 'm'), q: 'N', digits: 3 }),
      m: shell.readout({ label: L('Moment ', 'Torque ') + S('m'), q: 'M', digits: 3 }),
      i: shell.readout({ label: L('Strom |', 'Current |') + S('i', 'S') + '|', q: 'I', digits: 3 }),
      u: shell.readout({ label: L('Spannung |', 'Voltage |') + S('u', 'S') + '|', q: 'U', digits: 3 }),
      dq: shell.readout({ label: S('i', 'd') + ' / ' + S('i', 'q'), q: 'I', digits: 2 }),
      x: shell.readout({ label: mode === 'uf' ? L('Polradwinkel ', 'Load angle ') + S('ϑ') : L('Leistungsfaktor cos ', 'Power factor cos ') + S('φ'), digits: mode === 'uf' ? 1 : 3 }),
    };
    const pills = h('div', { class: 'pills' });
    const explain = h('p', { class: 'explain' });
    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-figure' }, figCanvas),
      h('div', { class: 'hero-side' },
        h('div', { class: 'readouts' }, R.w.el, R.m.el, R.i.el, R.u.el, R.dq.el, R.x.el),
        h('div', { class: 'status' }, pills, explain)));

    // ------------------------------------------------------------ phasor & ESB
    const phBox = h('div');
    const phasor = new ui.Phasor(phBox, { height: 300, minRange: 1.2 });
    const phSeg = ui.seg({
      options: [{ value: 'dq', label: L('rotorfest dq', 'rotor frame dq') }, { value: 'ab', label: L('statorfest αβ', 'stator frame αβ') }],
      get: () => st.phasorView, set: (v) => { st.phasorView = v; }, label: L('Koordinatensystem', 'Reference frame'),
    });
    const phLegend = h('div', {
      class: 'legend', html: L(
        `<span><i style="color:var(--c-psi)"></i>Fluss ${S('ψ')}</span><span><i style="color:var(--c-i)"></i>Strom ${S('i', 'S')}</span><span><i style="color:var(--c-u)"></i>Spannung ${S('u', 'S')}</span>`,
        `<span><i style="color:var(--c-psi)"></i>Flux ${S('ψ')}</span><span><i style="color:var(--c-i)"></i>Current ${S('i', 'S')}</span><span><i style="color:var(--c-u)"></i>Voltage ${S('u', 'S')}</span>`),
    });
    const phCard = shell.card({ title: L('Zeigerdiagramm', 'Phasor diagram'), actions: [phSeg.el], body: [phBox, phLegend] });

    const esbCanvas = h('canvas', { role: 'img', 'aria-label': L('Ersatzschaltbild der PSM', 'Equivalent circuit of the PMSM') });
    const esbBox = h('div', { class: 'chart-box', style: { height: '100%', minHeight: '300px', flex: '1' } }, esbCanvas);
    const esbSeg = ui.seg({
      options: [{ value: 'space', label: L('Raumzeiger', 'Space vector') }, { value: 'dq', label: L('d- und q-Achse', 'd and q axis') }],
      get: () => st.esbView, set: (v) => { st.esbView = v; }, label: L('Ersatzschaltbild', 'Equivalent circuit'),
    });
    const esbCard = shell.card({ title: L('Ersatzschaltbild', 'Equivalent circuit'), actions: [esbSeg.el], body: [esbBox] });

    // ------------------------------------------------------------ current plane
    const ipBox = h('div');
    const ipChart = new ui.Chart(ipBox, {
      x: { label: { sym: 'i', sub: 'd' }, min: -3.6, max: 1.6 },
      y: { label: { sym: 'i', sub: 'q' }, min: -2.2, max: 2.2 },
      height: 300, equal: true, hover: 'xy', ariaLabel: L('Stromebene mit Strom- und Spannungsgrenze', 'Current plane with current and voltage limits'),
    });
    const ipLegend = h('div', {
      class: 'legend', html: L(
        `<span><i class="dash" style="color:var(--c-i)"></i>Stromgrenze ${S('i', 'max')}</span><span><i style="color:var(--c-u)"></i>Spannungsgrenze ${S('u', 'max')} bei aktuellem ${S('ω')}</span><span><i class="dash" style="color:var(--c-m)"></i>${S('m')} = konst.</span><span><i class="dot" style="color:var(--c-i)"></i>Strom</span>`,
        `<span><i class="dash" style="color:var(--c-i)"></i>Current limit ${S('i', 'max')}</span><span><i style="color:var(--c-u)"></i>Voltage limit ${S('u', 'max')} at the present ${S('ω')}</span><span><i class="dash" style="color:var(--c-m)"></i>${S('m')} = const.</span><span><i class="dot" style="color:var(--c-i)"></i>Current</span>`),
    });
    const ipCard = shell.card({ title: L('Stromebene', 'Current plane'), hint: L('erreichbar ist, was in beiden Grenzen liegt', 'only points inside both limits are reachable'), body: [ipBox, ipLegend] });

    // ------------------------------------------------------------ characteristic
    const chBox = h('div');
    const chTabs = ui.seg({ options: meta.tabs, get: () => st.tab, set: (v) => { st.tab = v; setupChart(); }, label: L('Diagramm', 'Chart') });
    if (meta.tabs.length < 2) chTabs.el.style.display = 'none';
    const chLegend = h('div', { class: 'legend' });
    const chCard = shell.card({ title: L('Kennlinie', 'Characteristic'), actions: [chTabs.el], body: [chBox, chLegend] });
    let chart = null;
    const setupChart = () => {
      chTabs.sync();
      chBox.replaceChildren();
      if (chart) chart.destroy();
      if (st.tab === 'mw') {
        const passive = mode === 'passive';
        chart = new ui.Chart(chBox, {
          x: { label: { sym: 'm' }, min: passive ? -2 : -1.9, max: passive ? 0.6 : 1.9 },
          y: { label: { sym: 'ω', sub: 'm' }, min: passive ? -0.1 : -1.1, max: passive ? 1.6 : 2.1 },
          height: 300, hover: 'xy',
          quadrants: passive ? [] : [{ px: 0.985, py: 0.06, text: L('Motor', 'Motor'), align: 'right' }, { px: 0.015, py: 0.06, text: L('Generator', 'Generator'), align: 'left' }],
        });
        chLegend.innerHTML = passive
          ? L(`<span><i style="color:var(--ink)"></i>Bremskennlinie mit ${S('r', 'L')}</span><span><i class="dash" style="color:var(--c-ref)"></i>Kurzschluss ${S('r', 'L')} = 0</span><span><i class="dot" style="color:var(--c-m)"></i>Momentanwert</span>`,
            `<span><i style="color:var(--ink)"></i>Braking characteristic with ${S('r', 'L')}</span><span><i class="dash" style="color:var(--c-ref)"></i>Short circuit ${S('r', 'L')} = 0</span><span><i class="dot" style="color:var(--c-m)"></i>Instantaneous value</span>`)
          : L(`<span><i style="color:var(--ink)"></i>Grenze mit Feldschwächung</span><span><i class="dash" style="color:var(--c-ref)"></i>Grenze mit ${S('i', 'd')} = 0</span><span><i class="dash" style="color:var(--c-m)"></i>Last</span><span><i class="dot" style="color:var(--c-m)"></i>Momentanwert</span>`,
            `<span><i style="color:var(--ink)"></i>Envelope with field weakening</span><span><i class="dash" style="color:var(--c-ref)"></i>Envelope with ${S('i', 'd')} = 0</span><span><i class="dash" style="color:var(--c-m)"></i>Load</span><span><i class="dot" style="color:var(--c-m)"></i>Instantaneous value</span>`);
      } else if (st.tab === 'gamma') {
        chart = new ui.Chart(chBox, {
          x: { label: { sym: 'γ', sub: 'm', unit: '°' }, min: -180, max: 180, fmt: (v) => ui.fmt(v, 0) + '°' },
          y: { label: { sym: 'm' }, min: -1.7, max: 1.7 },
          height: 300, hover: 'x',
        });
        chLegend.innerHTML = mode === 'bldc'
          ? L(`<span><i style="color:var(--ink)"></i>Block (sechs Richtungen)</span><span><i class="dash" style="color:var(--c-ref)"></i>Sinus mit gleichem Strom</span><span><i class="dot" style="color:var(--c-m)"></i>Momentanwert</span>`,
            `<span><i style="color:var(--ink)"></i>Block (six directions)</span><span><i class="dash" style="color:var(--c-ref)"></i>Sinusoidal with the same current</span><span><i class="dot" style="color:var(--c-m)"></i>Instantaneous value</span>`)
          : `<span><i style="color:var(--ink)"></i>${S('m')} = |${S('i', 'S')}|·${S('ψ', 'M')}·sin(${S('φ', 'i')} − ${S('γ', 'm')})</span><span><i class="dot" style="color:var(--c-m)"></i>${L('Momentanwert', 'Instantaneous value')}</span>`;
      } else if (st.tab === 'delta') {
        chart = new ui.Chart(chBox, {
          x: { label: { sym: 'ϑ', unit: '°' }, min: -180, max: 180, fmt: (v) => ui.fmt(v, 0) + '°' },
          y: { label: { sym: 'm' }, min: -2.5, max: 2.5 },
          height: 300, hover: 'x',
        });
        chLegend.innerHTML = L(
          `<span><i style="color:var(--ink)"></i>${S('m')}(${S('ϑ')}) bei aktuellem ${S('u')} und ${S('ω', 's')}, ${S('ϑ')} = Winkel von ${S('u', 'P')} = j${S('ω')}${S('ψ', 'M')} nach ${S('u', 'S')}</span><span><i class="dash" style="color:var(--c-m)"></i>Last</span><span><i class="dot" style="color:var(--c-m)"></i>Momentanwert</span>`,
          `<span><i style="color:var(--ink)"></i>${S('m')}(${S('ϑ')}) at the present ${S('u')} and ${S('ω', 's')}; ${S('ϑ')} = angle from ${S('u', 'P')} = j${S('ω')}${S('ψ', 'M')} to ${S('u', 'S')}</span><span><i class="dash" style="color:var(--c-m)"></i>Load</span><span><i class="dot" style="color:var(--c-m)"></i>Instantaneous value</span>`);
      } else {
        chart = new ui.Chart(chBox, {
          x: { label: { text: 'Re λ' }, min: -0.2, max: 0.05 },
          y: { label: { text: 'Im λ' }, min: -1.8, max: 1.8 },
          height: 300, hover: 'xy',
        });
        chLegend.innerHTML = L(
          `<span><i class="dot" style="color:var(--c-ref)"></i>Eigenwerte für ${S('ω', 's')} von 0,02 bis 1,6</span><span><i class="dot" style="color:var(--c-m)"></i>bei aktuellem ${S('ω', 's')}</span><span>rechts der Achse: instabil</span>`,
          `<span><i class="dot" style="color:var(--c-ref)"></i>Eigenvalues for ${S('ω', 's')} from 0.02 to 1.6</span><span><i class="dot" style="color:var(--c-m)"></i>at the present ${S('ω', 's')}</span><span>right of the axis: unstable</span>`);
      }
    };

    // ------------------------------------------------------------ scope
    const scopeBox = h('div');
    const strips = [
      { label: { sym: 'ω', sub: 'm' }, series: [{ key: 'w', color: 'c-n', name: { sym: 'ω', sub: 'm' } }], min: 0, max: 0.2 },
      { label: { sym: 'm' }, series: [{ key: 'm', color: 'c-m', name: { sym: 'm' } }, { key: 'mL', color: 'c-ref', name: { sym: 'm', sub: 'L' }, dash: [5, 3] }], min: 0, max: 0.2 },
      { label: { sym: 'i', sub: 'dq' }, series: [{ key: 'id', color: 'c-i', name: { sym: 'i', sub: 'd' }, dash: [5, 3] }, { key: 'iq', color: 'c-i', name: { sym: 'i', sub: 'q' } }], min: -0.2, max: 0.2 },
      { label: { sym: 'i', sub: '1,2,3' }, series: [{ key: 'i1', color: 'c-p1', name: { sym: 'i', sub: '1' } }, { key: 'i2', color: 'c-p2', name: { sym: 'i', sub: '2' } }, { key: 'i3', color: 'c-p3', name: { sym: 'i', sub: '3' } }], sym: true, minSpan: 0.4 },
      { label: { sym: '|u', sub: 'S' }, series: [{ key: 'u', color: 'c-u', name: { sym: '|u', sub: 'S' } }, { key: 'umax', color: 'c-ref', name: { sym: 'u', sub: 'max' }, dash: [3, 3] }], min: 0, max: 0.2 },
    ];
    const scope = new ui.Scope(scopeBox, { strips, window: st.window, stripHeight: 80, timeLabel: { sym: 't', unit: 's' }, timeScale: tauToS() });
    const winSel = h('select', { 'aria-label': L('Zeitfenster', 'Time window') });
    for (const w of WINDOWS_S) winSel.append(h('option', { value: w, text: ui.fmt(w, w < 1 ? 2 : 0) + ' s' }));
    const setWinSel = () => {
      const v = st.window * tauToS();
      const key = String(Math.round(v * 1000) / 1000);
      if (![...winSel.options].some((o) => o.value === key)) winSel.append(h('option', { value: key, text: ui.fmt(v, 2) + ' s' }));
      winSel.value = key;
    };
    winSel.addEventListener('change', () => { st.window = parseFloat(winSel.value) / tauToS(); scope.setWindow(st.window); });
    const scopeCard = shell.card({ title: L('Zeitverläufe', 'Time plots'), hint: L('Zeit in Sekunden bei f<sub>N</sub>; Fahre mit der Maus darüber für Werte', 'Time in seconds at f<sub>N</sub>; hover over the plots for values'), actions: [h('span', { class: 'popup' }, winSel)], body: [scopeBox] });

    // ------------------------------------------------------------ formulas & power
    const formulas = shell.formulas();
    const formCard = shell.card({ title: L('Formeln mit aktuellen Werten', 'Formulas with live values'), hint: L('bezogene Größen', 'per-unit quantities'), body: [formulas.el] });
    const pbars = shell.powerBars([
      { key: 'pel', label: L('elektrisch Re{', 'electrical Re{') + S('u') + S('i') + '*}', q: 'U' },
      { key: 'pcu', label: L('Kupfer ', 'copper ') + S('r', 'S') + '|' + S('i') + '|²' },
      { key: 'pi', label: L('innere ', 'internal ') + S('m') + '·' + S('ω'), q: 'M' },
      { key: 'pf', label: L('Reibung', 'friction') },
    ]);
    const powerNote = h('p', { class: 'muted', style: { fontSize: '12px' } });
    const powerCard = shell.card({ title: L('Leistungsbilanz', 'Power balance'), hint: L('bezogen auf ', 'relative to ') + S('S', 'N') + L(' · > 0 aufgenommen', ' · > 0 = absorbed'), body: [pbars.el, powerNote] });

    pg.stage.append(hero, h('div', { class: 'grid-2' }, phCard, esbCard), h('div', { class: 'grid-2' }, ipCard, chCard), scopeCard, h('div', { class: 'grid-2' }, formCard, powerCard));

    // ------------------------------------------------------------ inspector
    const vis = (ctrl, fn) => { ctrl._show = fn; return ctrl; };
    const groupWithVis = (g, ctrls) => {
      const sync = g.sync;
      g.sync = () => { sync(); ctrls.forEach((c) => { if (c._show) c.el.hidden = !c._show(); }); };
      return g;
    };
    const groups = [];
    if (mode === 'foc' || mode === 'bldc') {
      const rows = [
        ui.segRow({ label: L('Sollwert', 'Setpoint'), options: [{ value: 'speed', label: L('Drehzahl', 'Speed') }, { value: 'torque', label: L('Moment', 'Torque') }], get: () => p.ref, set: (v) => { p.ref = v; syncAll(); } }),
        vis(ui.slider({ label: S('ω', 'soll'), desc: L('Drehzahlsollwert', 'Speed setpoint'), min: -1.6, max: 2, step: 0.01, q: 'N', digits: 2, get: () => p.wRef, set: (v) => { p.wRef = v; } }), () => p.ref === 'speed'),
        vis(ui.slider({ label: S('m', 'soll'), desc: L('Momentsollwert', 'Torque setpoint'), min: -1.5, max: 1.5, step: 0.01, q: 'M', digits: 2, get: () => p.mRef, set: (v) => { p.mRef = v; } }), () => p.ref === 'torque'),
      ];
      if (mode === 'foc') {
        rows.push(ui.segRow({ label: S('i', 'd') + L('-Strategie', ' strategy'), options: [{ value: 'zero', label: S('i', 'd') + ' = 0' }, { value: 'auto', label: L('Feldschwächung', 'Field weakening') }, { value: 'manual', label: L('manuell', 'Manual') }], get: () => p.idMode, set: (v) => { p.idMode = v; syncAll(); } }));
        rows.push(vis(ui.slider({ label: S('i', 'd'), desc: L('d-Strom', 'd-axis current'), min: -2, max: 1, step: 0.01, q: 'I', digits: 2, get: () => p.idManual, set: (v) => { p.idManual = v; } }), () => p.idMode === 'manual'));
      } else {
        rows.push(ui.slider({ label: L('Vorkommutierung', 'Commutation advance'), desc: L('Hall-Versatz', 'Hall offset'), unit: '°', min: -30, max: 60, step: 1, digits: 0, get: () => p.advance, set: (v) => { p.advance = v; } }));
      }
      groups.push(groupWithVis(ui.group({ title: L('Regelung', 'Control'), rows }), rows));
    }
    if (mode === 'uf') {
      groups.push(ui.group({
        title: L('U/f-Steuerung', 'U/f control'), rows: [
          ui.slider({ label: S('ω', 's'), desc: L('Zielfrequenz', 'Target frequency'), min: 0, max: 1.6, step: 0.01, q: 'N', digits: 2, get: () => p.ufTarget, set: (v) => { p.ufTarget = v; } }),
          ui.slider({ label: L('Hochlaufzeit', 'Run-up time'), desc: '0 → 1', unit: 's', min: 0.2, max: 60, log: true, digits: 1, get: () => 1 / (p.ufRamp * MS.TAU * p.fN), set: (v) => { p.ufRamp = 1 / (v * MS.TAU * p.fN); } }),
          ui.slider({ label: S('u') + '/' + S('ω'), desc: L('U/f-Verhältnis', 'U/f ratio'), min: 0.5, max: 1.5, step: 0.01, q: 'U', digits: 2, get: () => p.kuf, set: (v) => { p.kuf = v; } }),
          ui.slider({ label: S('u', '0'), desc: L('Boost', 'Boost'), min: 0, max: 0.2, step: 0.005, q: 'U', digits: 3, get: () => p.boost, set: (v) => { p.boost = v; } }),
        ],
        foot: S('u') + ' = min(' + S('u', 'max') + ', ' + S('u', '0') + ' + ' + S('k') + '·' + S('ω', 's') + ')' + L('. Die Frequenz läuft mit der Rampe zur Zielfrequenz.', '. The frequency follows the ramp to the target frequency.'),
      }));
    }
    if (mode === 'passive') {
      const rows = [
        ui.segRow({
          label: L('Klemmen', 'Terminals'), options: [{ value: 'open', label: L('offen', 'open') }, { value: 'short', label: L('kurzgeschl.', 'shorted') }, { value: 'res', label: L('Widerstand', 'resistor') }],
          get: () => (p.open ? 'open' : p.rL === 0 ? 'short' : 'res'),
          set: (v) => { p.open = v === 'open'; if (v === 'short') p.rL = 0; if (v === 'res' && p.rL === 0) p.rL = 0.5; syncAll(); },
        }),
        vis(ui.slider({ label: S('r', 'L'), desc: L('Lastwiderstand', 'Load resistance'), min: 0.01, max: 5, log: true, digits: 3, get: () => Math.max(p.rL, 0.01), set: (v) => { p.rL = v; } }), () => !p.open && p.rL > 0),
      ];
      groups.push(groupWithVis(ui.group({ title: L('Klemmen', 'Terminals'), rows, foot: L('Ohne Umrichter: Die Maschine wird zum Generator auf ihre eigene Impedanz ', 'Without an inverter, the machine becomes a generator feeding its own impedance ') + S('r', 'S') + ' + j' + S('ω') + S('l', 'S') + '.' }), rows));
    }
    if (mode === 'dc') {
      groups.push(ui.group({
        title: L('Stromraumzeiger', 'Current space vector'), rows: [
          ui.slider({ label: '|' + S('i', 'S') + '|', desc: L('Betrag', 'Magnitude'), min: 0, max: 1.5, step: 0.01, q: 'I', digits: 2, get: () => p.dcAmp, set: (v) => { p.dcAmp = v; } }),
          ui.slider({ label: S('φ', 'i'), desc: L('Richtung (statorfest)', 'Direction (stator frame)'), unit: '°', min: -180, max: 180, step: 1, digits: 0, get: () => p.dcAngle, set: (v) => { p.dcAngle = v; } }),
        ],
      }));
    }
    const invRows = [];
    if (mode !== 'passive') invRows.push(ui.slider({ label: S('u', 'max'), desc: L('Spannungsgrenze', 'Voltage limit'), min: 0.5, max: 1.6, step: 0.01, q: 'U', digits: 2, get: () => p.umax, set: (v) => { p.umax = v; } }));
    if (mode === 'foc' || mode === 'bldc' || mode === 'dc') invRows.push(ui.slider({ label: S('i', 'max'), desc: L('Stromgrenze', 'Current limit'), min: 0.3, max: 3, step: 0.05, q: 'I', digits: 2, get: () => p.imax, set: (v) => { p.imax = v; } }));
    if (invRows.length) groups.push(ui.group({ title: L('Umrichter', 'Inverter'), rows: invRows }));
    groups.push(ui.group({
      title: L('Maschine', 'Machine'), rows: [
        ui.slider({ label: S('r', 'S'), desc: L('Statorwiderstand', 'Stator resistance'), min: 0.005, max: 0.3, log: true, digits: 3, get: () => p.rs, set: (v) => { p.rs = v; } }),
        ui.slider({ label: S('l', 'S'), desc: L('Statorinduktivität', 'Stator inductance'), min: 0.05, max: 1.5, log: true, digits: 3, get: () => p.ls, set: (v) => { p.ls = v; } }),
        ui.slider({ label: '|' + S('ψ', 'M') + '|', desc: L('Magnetfluss', 'Magnet flux linkage'), min: 0.3, max: 1.5, step: 0.01, q: 'PSI', digits: 2, get: () => p.psiM, set: (v) => { p.psiM = v; } }),
        ui.slider({ label: S('τ', 'm'), desc: L('Anlaufzeitkonstante', 'Mechanical time constant'), min: 20, max: 5000, log: true, digits: 0, get: () => p.taum, set: (v) => { p.taum = v; } }),
        ui.slider({ label: S('k', 'R'), desc: L('Reibung', 'Friction'), min: 0, max: 5, step: 0.001, digits: 3, get: () => p.kf, set: (v) => { p.kf = v; } }),
      ],
      foot: S('τ', 'm') + ' = Θ·Ω<sub>Bez</sub>/' + S('M', 'Bez') + L(': so lange (in τ) bräuchte die Maschine mit ' + S('m') + ' = 1 auf ' + S('ω') + ' = 1.',
        ': the time (in τ) the machine would need with ' + S('m') + ' = 1 to reach ' + S('ω') + ' = 1.'),
    }));
    const cNset = vis(ui.slider({ label: S('ω', 'Antrieb'), desc: L('vorgegeben', 'imposed'), min: -1.6, max: 2.5, step: 0.01, q: 'N', digits: 2, get: () => p.wSet, set: (v) => { p.wSet = v; } }), () => p.speedMode === 'imposed');
    const loadRows = [
      ui.toggle({ label: L('Last angekoppelt', 'Load coupled'), get: () => p.loadOn, set: (v) => { p.loadOn = v; } }),
      ui.select({ label: L('Lastkennlinie', 'Load characteristic'), options: Object.entries(MS.loads.TYPES).filter(([k]) => k !== 'none').map(([k, v]) => ({ value: k, label: v.label })), get: () => p.load.type, set: (v) => { p.load = { ...p.load, type: v }; } }),
      ui.slider({ label: S('m', 'L'), desc: L('bei ', 'at ') + S('ω') + ' = 1', min: 0, max: 1.6, step: 0.01, q: 'M', digits: 2, get: () => p.load.M0, set: (v) => { p.load = { ...p.load, M0: v }; } }),
      ui.toggle({ label: L('Drehzahl vorgeben', 'Impose speed'), desc: L('Prüfstand', 'test bench'), get: () => p.speedMode === 'imposed', set: (v) => { p.speedMode = v ? 'imposed' : 'free'; if (v) p.wSet = Math.round(m.x[2] * 100) / 100; syncAll(); } }),
      cNset,
    ];
    groups.push(groupWithVis(ui.group({ title: L('Mechanik & Last', 'Mechanics & load'), rows: loadRows }), loadRows));
    const refInfo = (lbl, fn) => ui.info({ label: lbl, value: fn });
    groups.push(ui.group({
      title: L('Bezugsgrößen', 'Base values'), rows: [
        ui.slider({ label: S('f', 'N'), desc: L('Nennfrequenz', 'Rated frequency'), unit: 'Hz', min: 10, max: 400, log: true, digits: 0, get: () => p.fN, set: (v) => { p.fN = v; scope.timeScale = tauToS(); setWinSel(); } }),
        ui.slider({ label: S('n', 'N'), desc: L('Nenndrehzahl', 'Rated speed'), unit: 'min⁻¹', min: 100, max: 24000, log: true, digits: 0, get: () => p.nN, set: (v) => { p.nN = v; } }),
        ui.slider({ label: S('U', 'N'), desc: L('verkettet, eff.', 'line-to-line, rms'), unit: 'V', min: 12, max: 1000, log: true, digits: 0, get: () => p.UN, set: (v) => { p.UN = v; } }),
        ui.slider({ label: S('I', 'N'), desc: L('eff.', 'rms'), unit: 'A', min: 0.5, max: 500, log: true, digits: 1, get: () => p.IN, set: (v) => { p.IN = v; } }),
        refInfo(L('Polpaarzahl ', 'Pole pairs ') + S('p') + ' = 60·' + S('f', 'N') + '/' + S('n', 'N'), () => String(m.reference().polePairs)),
        refInfo(S('t', 'Bez') + ' = 1/Ω<sub>Bez</sub>', () => ui.fmt(m.reference().tBez * 1000, 3) + ' ms'),
        refInfo(S('M', 'Bez') + ' = 3/2·' + S('U', 'Bez') + S('I', 'Bez') + '·' + S('p') + '/Ω<sub>Bez</sub>', () => ui.fmt(m.reference().MBez) + ' Nm'),
      ],
      foot: L('Bezug ist der Scheitelwert der Stranggröße (Sternschaltung): ', 'The base is the peak value of the phase quantity (star connection): ') + S('U', 'Bez') + ' = √2·' + S('U', 'N') + '/√3, ' + S('I', 'Bez') + ' = √2·' + S('I', 'N') + '.',
    }));

    const runner = shell.runner({
      getTime: () => m.t,
      prepare: (exp) => {
        m.reset();
        const fresh = MS.psm.defaults();
        for (const k of Object.keys(p)) delete p[k];
        Object.assign(p, fresh, { mode });
        p.load = { ...fresh.load };
        exp.setup(p, m);
        st.speed = exp.speed ?? meta.speed;
        st.window = exp.window ?? meta.window;
        scope.timeScale = tauToS();
        scope.setWindow(st.window);
        setWinSel();
        scope.clear();
        st.trail = [];
        st.running = true;
        if (exp.tab && meta.tabs.some((t) => t.value === exp.tab)) st.tab = exp.tab;
        else st.tab = meta.tabs[0].value;
        setupChart();
        syncAll();
      },
    });
    const expEl = shell.experiments(MS.psmExperiments[mode] || [], runner);
    const insp = shell.inspector(pg.inspector, { groups, experiments: expEl });
    const syncAll = () => { insp.sync(); transport.sync(); };

    // ------------------------------------------------------------ statics
    const statics = () => {
      const out = {};
      if (st.tab === 'mw' && mode !== 'passive') {
        const fw = m.envelope('fw', -1.1, 2.1, 128);
        const z = m.envelope('zero', -1.1, 2.1, 128);
        out.fwTop = fw.map((e) => [e.mMax, e.w]); out.fwBot = fw.map((e) => [e.mMin, e.w]);
        out.zTop = z.map((e) => [e.mMax, e.w]); out.zBot = z.map((e) => [e.mMin, e.w]);
        out.load = MS.linspace(-1.1, 2.1, 160).map((w) => [m.loadTorque(w) + p.kf * w, w]);
      }
      if (st.tab === 'mw' && mode === 'passive') {
        out.brake = p.open ? [] : m.passiveCurve(p.rL, 0, 1.6, 200).map((q) => [q.m, q.w]);
        out.ks = m.passiveCurve(0, 0, 1.6, 200).map((q) => [q.m, q.w]);
        // semicircle i(ω) for ω = 0 … ∞, sampled evenly in its angle
        const rTot = p.rs + (p.open ? 1e6 : p.rL);
        out.locus = MS.linspace(0, 0.999 * Math.PI / 2, 160).map((t) => {
          const s = m.passiveSteady((rTot * Math.tan(t)) / p.ls, p.open ? 1e6 : p.rL);
          return [s.i.re, s.i.im];
        });
      }
      if (st.tab === 'eig') {
        const rl = m.rootLocus(0.02, 1.6, 90);
        out.eig = rl;
      }
      return out;
    };

    // ------------------------------------------------------------ status
    const status = (o) => {
      const items = [];
      let text = '';
      const pm = o.m * o.w;
      if (mode !== 'passive' && !m.on) {
        items.push(ui.pill('', 'power', L('Umrichter aus', 'Inverter off')));
        text = Math.abs(o.w) > 0.01
          ? L(`Die Pulse sind gesperrt, es fließt kein Strom. An den Klemmen liegt nur die induzierte Spannung ${S('u', 'S')} = j${S('ω')}${S('ψ', 'M')}, |${S('u', 'S')}| = ${ui.fmt(Math.abs(o.w) * p.psiM, 3)}.`,
            `The gate pulses are blocked and no current flows. Only the induced voltage ${S('u', 'S')} = j${S('ω')}${S('ψ', 'M')} appears at the terminals, |${S('u', 'S')}| = ${ui.fmt(Math.abs(o.w) * p.psiM, 3)}.`)
          : L('Zum Starten oben auf <b>Ein</b> schalten.', 'Switch <b>On</b> at the top to start.');
        return { items, text };
      }
      if (mode === 'passive' && !m.on) {
        items.push(ui.pill('', 'power', L('Aus', 'Off')));
        text = L('Zum Starten oben auf <b>Ein</b> schalten – dann gelten die Klemmen-Einstellungen.', 'Switch <b>On</b> at the top to start – the terminal settings then apply.');
        return { items, text };
      }
      if (pm < -1e-3) items.push(ui.pill('', 'loop', L('Generator', 'Generator')));
      else if (Math.abs(o.m) < 0.02) items.push(ui.pill('', 'gauge', L('Leerlauf', 'No load')));
      else items.push(ui.pill('', 'bolt', L('Motor', 'Motor')));
      if (o.fieldWeakening) items.push(ui.pill('', 'info', L('Feldschwächung', 'Field weakening')));
      if (o.sat) items.push(ui.pill('serious', 'warn', L('Spannungsgrenze', 'Voltage limit')));
      if (o.pulledOut) items.push(ui.pill('crit', 'warn', L('Außer Tritt', 'Out of step')));
      if (o.absI > 2.5) items.push(ui.pill('serious', 'warn', `|i| = ${ui.fmt(o.absI, 2)}`));

      if (mode === 'foc') {
        if (o.sat && p.idMode === 'zero') {
          text = L(`Spannungsgrenze: Bei ${S('ω')} = ${ui.fmt(o.w, 2)} braucht der Strom mehr als ${S('u', 'max')} = ${ui.fmt(p.umax, 2)}. Der Regler kann ${S('i', 'q')} nicht mehr einprägen, das Moment bricht ein. Abhilfe: Feldschwächung mit ${S('i', 'd')} < 0.`,
            `Voltage limit: at ${S('ω')} = ${ui.fmt(o.w, 2)} the current would need more than ${S('u', 'max')} = ${ui.fmt(p.umax, 2)}. The controller can no longer impress ${S('i', 'q')}, and the torque collapses. Remedy: field weakening with ${S('i', 'd')} < 0.`);
        } else if (o.fieldWeakening) {
          text = L(`Feldschwächung: Ein negativer d-Strom ${S('i', 'd')} = ${ui.fmt(o.id, 2)} wirkt gegen den Magneten und senkt |${S('ψ', 'S')}| auf ${ui.fmt(o.absPsi, 3)}. So reicht |${S('u', 'S')}| = ${ui.fmt(o.absU, 3)} auch bei ${S('ω')} = ${ui.fmt(o.w, 2)} – der Strom kostet Kupferverluste, bildet aber kein Moment.`,
            `Field weakening: a negative d-axis current ${S('i', 'd')} = ${ui.fmt(o.id, 2)} opposes the magnet and reduces |${S('ψ', 'S')}| to ${ui.fmt(o.absPsi, 3)}. This way |${S('u', 'S')}| = ${ui.fmt(o.absU, 3)} is enough even at ${S('ω')} = ${ui.fmt(o.w, 2)} – the current causes copper losses but produces no torque.`);
        } else if (pm < -1e-3) {
          text = L(`Generatorisch: ${S('m')} = ${ui.fmt(o.m, 3)} wirkt gegen die Drehrichtung. Die Leistung ${S('p', 'el')} = ${ui.fmt(o.pel, 3)} fließt zurück in den Umrichter.`,
            `Generating: ${S('m')} = ${ui.fmt(o.m, 3)} acts against the direction of rotation. The power ${S('p', 'el')} = ${ui.fmt(o.pel, 3)} flows back into the inverter.`);
        } else {
          text = L(`Sinusbetrieb mit ${S('i', 'd')} = 0: Der Strom steht genau auf der q-Achse, 90° vor dem Magnetfluss. Das gibt das größte Moment pro Ampere: ${S('m')} = ${S('ψ', 'M')}·${S('i', 'q')} = ${ui.fmt(o.m, 3)}. Weil ${S('l', 'S')}·${S('i', 'S')} quer zum Magneten steht, ist |${S('ψ', 'S')}| = ${ui.fmt(o.absPsi, 3)} > 1.`,
            `Sinusoidal operation with ${S('i', 'd')} = 0: the current lies exactly on the q axis, 90° ahead of the magnet flux. This gives the most torque per ampere: ${S('m')} = ${S('ψ', 'M')}·${S('i', 'q')} = ${ui.fmt(o.m, 3)}. Because ${S('l', 'S')}·${S('i', 'S')} is perpendicular to the magnet, |${S('ψ', 'S')}| = ${ui.fmt(o.absPsi, 3)} > 1.`);
        }
      } else if (mode === 'bldc') {
        const blk = MS.psm.BLOCKS[o.sector];
        const ang = MS.wrap(C.arg(o.iAB) - o.gamma) / MS.DEG;
        text = L(`Block ${blk.name} (${blk.pattern}): Nur zwei Stränge führen Strom, |${S('i', 'S')}| = ${ui.fmt(o.absI, 3)}. Der Winkel zwischen Strom und Magnet ist ${ui.fmt(Math.abs(ang), 0)}°, also ${S('m')} = |${S('i', 'S')}|·sin(${ui.fmt(Math.abs(ang), 0)}°) = ${ui.fmt(o.m, 3)}. Weitergeschaltet wird bei 60°.`,
          `Block ${blk.name} (${blk.pattern}): only two phases carry current, |${S('i', 'S')}| = ${ui.fmt(o.absI, 3)}. The angle between current and magnet is ${ui.fmt(Math.abs(ang), 0)}°, so ${S('m')} = |${S('i', 'S')}|·sin(${ui.fmt(Math.abs(ang), 0)}°) = ${ui.fmt(o.m, 3)}. The next block is switched in at 60°.`);
      } else if (mode === 'uf') {
        const lin = m.linearize(Math.max(o.ws, 0.02));
        if (o.pulledOut) {
          text = L(`Außer Tritt: Der Rotor kann dem Drehfeld (${S('ω', 's')} = ${ui.fmt(o.ws, 2)}) nicht folgen. Das Moment wechselt ständig das Vorzeichen und mittelt sich zu null, der Strom ist nur durch ${S('l', 'S')} begrenzt.`,
            `Out of step: the rotor cannot follow the rotating field (${S('ω', 's')} = ${ui.fmt(o.ws, 2)}). The torque keeps changing sign and averages to zero; the current is limited only by ${S('l', 'S')}.`);
        } else if (lin) {
          const th = ui.fmt(MS.wrap(o.thetaU - o.gamma - Math.PI / 2) / MS.DEG, 1);
          const re = ui.fmt(lin.eig[0].re, 4);
          text = L(`Synchron mit ${S('ω', 's')} = ${ui.fmt(o.ws, 3)}, Polradwinkel ${S('ϑ')} = ${th}°. Linearisiert ist dieser Betriebspunkt <b>${lin.stable ? 'stabil' : 'instabil'}</b> (größter Realteil ${re}): ohne Dämpferwicklung klingen Pendelungen ${lin.stable ? 'nur langsam ab' : 'nicht ab, sie schaukeln sich auf'}.`,
            `Synchronous at ${S('ω', 's')} = ${ui.fmt(o.ws, 3)}, load angle ${S('ϑ')} = ${th}°. Linearised, this operating point is <b>${lin.stable ? 'stable' : 'unstable'}</b> (largest real part ${re}): without a damper winding, oscillations ${lin.stable ? 'decay only slowly' : 'do not decay but build up'}.`);
        } else {
          text = L(`Bei ${S('ω', 's')} = ${ui.fmt(o.ws, 3)} gibt es für diese Last keinen stationären Punkt – das Lastmoment liegt über dem Kippmoment.`,
            `At ${S('ω', 's')} = ${ui.fmt(o.ws, 3)} there is no steady-state operating point for this load – the load torque exceeds the pull-out torque.`);
        }
      } else if (mode === 'passive') {
        if (Math.abs(o.w) < 0.01 && o.absI < 0.01) {
          text = L(`Stillstand: Ohne Drehung induziert der Magnet keine Spannung, also fließt auch im Kurzschluss kein Strom. Die Maschine kann sich so nicht selbst festhalten.`,
            `Standstill: without rotation the magnet induces no voltage, so no current flows even in a short circuit. The machine cannot hold itself in place this way.`);
        } else if (p.open) {
          text = L(`Leerlauf: ${S('i', 'S')} = 0, an den Klemmen liegt ${S('u', 'S')} = j${S('ω')}${S('ψ', 'M')} mit |${S('u', 'S')}| = ${S('ω')}·${S('ψ', 'M')} = ${ui.fmt(o.absU, 3)}, 90° vor dem Fluss.`,
            `Open circuit: ${S('i', 'S')} = 0, and the terminal voltage is ${S('u', 'S')} = j${S('ω')}${S('ψ', 'M')} with |${S('u', 'S')}| = ${S('ω')}·${S('ψ', 'M')} = ${ui.fmt(o.absU, 3)}, 90° ahead of the flux.`);
        } else if (p.rL === 0) {
          text = L(`Kurzschluss: ${S('u', 'S')} = 0. Der Strom stellt sich fast gegen den Magneten (${S('i', 'd')} = ${ui.fmt(o.id, 2)}), der Gesamtfluss |${S('ψ', 'S')}| = ${ui.fmt(o.absPsi, 3)} ist fast null. Das Moment ${S('m')} = ${ui.fmt(o.m, 3)} bremst.`,
            `Short circuit: ${S('u', 'S')} = 0. The current settles almost against the magnet (${S('i', 'd')} = ${ui.fmt(o.id, 2)}), so the total flux |${S('ψ', 'S')}| = ${ui.fmt(o.absPsi, 3)} is almost zero. The torque ${S('m')} = ${ui.fmt(o.m, 3)} brakes.`);
        } else {
          text = L(`Generator auf ${S('r', 'L')} = ${ui.fmt(p.rL, 3)}: Die Leistung ${ui.fmt(-o.pel, 3)} geht in den Widerstand, ${ui.fmt(o.pcu, 3)} in ${S('r', 'S')}. Das Moment ${S('m')} = ${ui.fmt(o.m, 3)} bremst den Antrieb.`,
            `Generator feeding ${S('r', 'L')} = ${ui.fmt(p.rL, 3)}: the power ${ui.fmt(-o.pel, 3)} goes into the resistor, ${ui.fmt(o.pcu, 3)} into ${S('r', 'S')}. The torque ${S('m')} = ${ui.fmt(o.m, 3)} brakes the drive.`);
        }
      } else {
        const ang = MS.wrap(p.dcAngle * MS.DEG - o.gamma) / MS.DEG;
        text = L(`Der Strompfeil steht still bei ${S('φ', 'i')} = ${ui.fmt(p.dcAngle, 0)}°, der Rotor bei ${ui.fmt(MS.wrap(o.gamma) / MS.DEG, 0)}°. Moment ${S('m')} = |${S('i', 'S')}|·${S('ψ', 'M')}·sin(${ui.fmt(ang, 0)}°) = ${ui.fmt(o.m, 3)} – es zieht den Magneten zum Strom.`,
          `The current arrow stands still at ${S('φ', 'i')} = ${ui.fmt(p.dcAngle, 0)}°, the rotor is at ${ui.fmt(MS.wrap(o.gamma) / MS.DEG, 0)}°. Torque ${S('m')} = |${S('i', 'S')}|·${S('ψ', 'M')}·sin(${ui.fmt(ang, 0)}°) = ${ui.fmt(o.m, 3)} – it pulls the magnet towards the current.`);
      }
      return { items, text };
    };

    // ------------------------------------------------------------ formulas
    const formulaItems = (o) => {
      const F = [];
      const ref = m.reference();
      F.push({ eq: `${S('ψ', 'S')} = ${S('l', 'S')}${S('i', 'S')} + ${S('ψ', 'M')} = ${N(p.ls, 3)}·(${fmtC(o.iDQ, 3)}) + ${N(p.psiM, 2)}`, res: fmtP(o.psiDQ) });
      F.push({ eq: `${S('m')} = ${S('ψ', 'M')} · ${S('i', 'q')} = ${N(p.psiM, 2)} · ${N(o.iq, 3)}`, res: ui.fmt(o.m, 3), note: L(`physikalisch ${S('M')} = ${S('m')}·${S('M', 'Bez')} = ${ui.fmt(o.m * ref.MBez)} Nm`, `in physical units ${S('M')} = ${S('m')}·${S('M', 'Bez')} = ${ui.fmt(o.m * ref.MBez)} Nm`) });
      if (mode !== 'uf' && !(mode === 'passive')) {
        const us = m.steadyVoltage(o.id, o.iq, o.w);
        F.push({ eq: `${S('u', 'S')} = ${S('r', 'S')}${S('i', 'S')} + j${S('ω', 'm')}${S('ψ', 'S')} = ${N(p.rs, 3)}·(${fmtC(o.iDQ, 2)}) + j${N(o.w, 3)}·${fmtP(o.psiDQ)}`, res: fmtP(C(us.d, us.q)), note: L('stationär im dq-System', 'steady state in the dq frame') });
      }
      if (mode === 'foc' && p.idMode === 'auto' && Math.abs(o.w) > 1e-3) {
        const psiLim = (0.97 * p.umax) / Math.abs(o.w);
        F.push({ eq: `|${S('ψ', 'S')}|<sub>max</sub> ≈ ${frac(L('0,97·', '0.97·') + S('u', 'max'), '|' + S('ω') + '|')} = ${frac(N(0.97 * p.umax, 3), N(Math.abs(o.w), 3))}`, res: ui.fmt(psiLim, 3), note: psiLim < Math.hypot(p.psiM, p.ls * o.iq)
          ? L(`kleiner als √(${S('ψ', 'M')}² + (${S('l', 'S')}${S('i', 'q')})²) → ${S('i', 'd')} < 0 nötig`, `smaller than √(${S('ψ', 'M')}² + (${S('l', 'S')}${S('i', 'q')})²) → ${S('i', 'd')} < 0 needed`)
          : L(`größer als |${S('ψ', 'S')}| bei ${S('i', 'd')} = 0 → keine Feldschwächung nötig`, `larger than |${S('ψ', 'S')}| at ${S('i', 'd')} = 0 → no field weakening needed`) });
      }
      if (mode === 'bldc') {
        F.push({ eq: `|${S('i', 'S')}| = ${frac('2', '√3')}·|${S('i', 'k')}|`, res: ui.fmt(o.absI, 3), note: L(`Strangstrom |${S('i', 'k')}| = ${ui.fmt((Math.sqrt(3) / 2) * o.absI, 3)}`, `phase current |${S('i', 'k')}| = ${ui.fmt((Math.sqrt(3) / 2) * o.absI, 3)}`) });
        F.push({ eq: `${S('m')} = |${S('i', 'S')}|·${S('ψ', 'M')}·sin(${S('φ', 'i')} − ${S('γ', 'm')}) = ${N(o.absI, 3)}·sin(${N(MS.wrap(C.arg(o.iAB) - o.gamma) / MS.DEG, 1)}°)`, res: ui.fmt(o.m, 3) });
      }
      if (mode === 'uf') {
        const lam = m.loadAngleModel(o.uAmp, Math.max(o.ws, 1e-3));
        F.push({ eq: `${S('u')} = ${S('u', '0')} + ${S('k')}·${S('ω', 's')} = ${N(p.boost, 3)} + ${N(p.kuf, 2)}·${N(o.ws, 3)}`, res: ui.fmt(o.uAmp, 3) });
        F.push({ eq: `${S('m')}(${S('ϑ')}) = A·sin(${S('ϑ')} + ε) − B, A = ${frac(S('ψ', 'M') + S('u'), '|' + S('Z') + '|')}, B = ${frac(S('ψ', 'M') + '²' + S('ω') + S('r', 'S'), '|' + S('Z') + '|²')}`, res: `A = ${ui.fmt(lam.A, 3)}, B = ${ui.fmt(lam.B, 3)}`, note: `${S('Z')} = ${S('r', 'S')} + j${S('ω')}${S('l', 'S')}, ε = arctan(${S('r', 'S')}/(${S('ω')}${S('l', 'S')})) = ${ui.fmt(90 - lam.zeta / MS.DEG, 1)}°. ` + L(`Für ${S('r', 'S')} → 0 wird daraus ${S('m')} = ${S('u')}·${S('u', 'P')}/(${S('ω')}${S('l', 'S')})·sin ${S('ϑ')}.`, `For ${S('r', 'S')} → 0 this becomes ${S('m')} = ${S('u')}·${S('u', 'P')}/(${S('ω')}${S('l', 'S')})·sin ${S('ϑ')}.`) });
        F.push({ eq: `${S('m', 'Kipp')} = A − B ${L('bei', 'at')} ${S('ϑ')} = 90° − ε = ${N(lam.deltaKipp / MS.DEG - 90, 1)}°`, res: ui.fmt(lam.mKipp, 3) });
      }
      if (mode === 'passive') {
        const rL = p.open ? Infinity : p.rL;
        if (Number.isFinite(rL)) {
          const s = m.passiveSteady(o.w, rL);
          F.push({ eq: `${S('i', 'S')} = ${frac('−j' + S('ω') + S('ψ', 'M'), S('r', 'S') + ' + ' + S('r', 'L') + ' + j' + S('ω') + S('l', 'S'))} = ${frac('−j' + N(o.w * p.psiM, 3), N(p.rs + rL, 3) + ' + j' + N(o.w * p.ls, 3))}`, res: fmtC(s.i, 3), note: L('stationär bei konstanter Drehzahl', 'steady state at constant speed') });
          F.push({ eq: `${S('m')} = −${frac(S('ω') + S('ψ', 'M') + '²(' + S('r', 'S') + ' + ' + S('r', 'L') + ')', '(' + S('r', 'S') + ' + ' + S('r', 'L') + ')² + ' + S('ω') + '²' + S('l', 'S') + '²')}`, res: ui.fmt(s.m, 3), note: L(`größte Bremswirkung |${S('m')}| = ${ui.fmt(p.psiM ** 2 / (2 * p.ls), 3)} bei ${S('ω')} = ${ui.fmt((p.rs + rL) / p.ls, 3)}`, `maximum braking torque |${S('m')}| = ${ui.fmt(p.psiM ** 2 / (2 * p.ls), 3)} at ${S('ω')} = ${ui.fmt((p.rs + rL) / p.ls, 3)}`) });
        } else {
          F.push({ eq: `${S('u', 'S')} = j${S('ω', 'm')}${S('ψ', 'M')}, |${S('u', 'S')}| = ${N(o.w, 3)}·${N(p.psiM, 2)}`, res: ui.fmt(Math.abs(o.w) * p.psiM, 3) });
        }
      }
      if (mode === 'dc') {
        F.push({ eq: `${S('m')} = |${S('i', 'S')}|·${S('ψ', 'M')}·sin(${S('φ', 'i')} − ${S('γ', 'm')}) = ${N(o.absI, 3)}·${N(p.psiM, 2)}·sin(${N(MS.wrap(p.dcAngle * MS.DEG - o.gamma) / MS.DEG, 1)}°)`, res: ui.fmt(o.m, 3) });
      }
      F.push({ eq: `${S('n')} = ${S('ω', 'm')}·${S('n', 'N')} = ${N(o.w, 3)}·${N(p.nN, 0)} min⁻¹`, res: `${ui.fmt(o.w * p.nN, 0)} min⁻¹` });
      return F;
    };

    // ------------------------------------------------------------ loop
    const sample = (o) => ({ w: o.w, m: o.m, mL: o.mL + o.mF, id: o.id, iq: o.iq, i1: o.i1, i2: o.i2, i3: o.i3, u: o.absU, umax: mode === 'passive' ? NaN : p.umax });
    const tick = (dt) => {
      if (!st.running) return;
      const dTau = dt * st.speed * MS.TAU * p.fN;
      const chunks = Math.max(1, Math.min(400, Math.ceil(dTau / (st.window / 900))));
      for (let k = 0; k < chunks; k++) {
        m.advance(dTau / chunks);
        runner.tick({ m, p, st, sync: syncAll });
        const o = m.outputs();
        scope.push(m.t, sample(o));
        st.trail.push([o.m, o.w, o.id, o.iq, m.t]);
      }
      while (st.trail.length && st.trail[0][4] < m.t - Math.min(st.window, 1200)) st.trail.shift();
      if (st.trail.length > 1500) st.trail.splice(0, st.trail.length - 1500);
      // visual rotor angle: real electrical angle, slowed to ≤ 2 rev/s on screen
      const rate = MS.clamp(m.x[2] * MS.TAU * p.fN * st.speed, -2 * MS.TAU, 2 * MS.TAU);
      const capped = Math.abs(m.x[2] * MS.TAU * p.fN * st.speed) > 2 * MS.TAU;
      st.gVis = capped ? st.gVis + rate * dt : m.x[3];
      st.flow += dt;
    };

    const render = () => {
      const o = m.outputs();
      const sig = JSON.stringify(p) + st.tab + m.on;
      if (sig !== st.sig) { st.sig = sig; st.stat = statics(); }
      const S0 = st.stat;
      const dark = ui.isDark();
      // everything drawn in the visual rotor angle so picture and vectors agree
      const gv = st.gVis;
      const iV = C.rot(o.iDQ, gv), psiV = C.rot(o.psiDQ, gv), uV = C.rot(o.uDQ, gv);

      // machine
      {
        const { ctx, w, h: hh } = ui.fitCanvas(figCanvas);
        ctx.clearRect(0, 0, w, hh);
        if (MS.art) {
          MS.art.drawPSM(ctx, {
            x: 0, y: 0, w, h: hh, dark, gamma: gv, polePairs: 1,
            i1: C.toPhase(iV, 1), i2: C.toPhase(iV, 2), i3: C.toPhase(iV, 3),
            iVec: iV, psiS: psiV, uVec: uV, psiM: p.psiM,
            showAxes: true, mode: mode === 'bldc' ? 'bldc' : 'sinus',
            sector: ((Math.round(MS.wrap(gv) / (Math.PI / 3)) % 6) + 6) % 6,
            torque: o.m, speed: o.w,
          });
        }
      }
      // phasor
      {
        const rot = st.phasorView === 'ab' ? gv : 0;
        const Rz = (z) => C.rot(z, rot);
        const psiM = Rz(C(p.psiM, 0)), psiS = Rz(o.psiDQ), iS = Rz(o.iDQ), uS = Rz(o.uDQ);
        const ri = Rz(C.scale(o.iDQ, p.rs));
        const jwpsi = C.j(C.scale(psiS, o.w));
        const tip = C.add(ri, jwpsi);
        const vecs = [
          { x: psiM.re, y: psiM.im, color: 'c-psi', width: 1.75, label: { sym: 'ψ', sub: 'M' }, name: 'ψ_M', labelSide: -1 },
        ];
        if (o.absI > 1e-3) {
          vecs.push({ x0: psiM.re, y0: psiM.im, x: psiS.re, y: psiS.im, color: 'c-psi', width: 1.4, dash: [4, 3], label: { sym: 'l', sub: 'S', sym2: 'i', sub2: 'S' }, labelAt: 0.5, labelMin: 40, name: 'l_S·i_S' });
          vecs.push({ x: psiS.re, y: psiS.im, color: 'c-psi', width: 2.5, label: { sym: 'ψ', sub: 'S' }, name: 'ψ_S' });
          vecs.push({ x: iS.re, y: iS.im, color: 'c-i', width: 2.5, label: { sym: 'i', sub: 'S' }, name: 'i_S' });
          vecs.push({ x: ri.re, y: ri.im, color: 'c-u', width: 1.25, alpha: 0.75, name: 'r_S·i_S', head: C.abs(ri) > 0.03 });
          vecs.push({ x0: ri.re, y0: ri.im, x: tip.re, y: tip.im, color: 'c-u', width: 1.25, dash: [4, 3], alpha: 0.75, name: 'jω·ψ_S' });
        }
        vecs.push({ x: uS.re, y: uS.im, color: 'c-u', width: 2.5, label: { sym: 'u', sub: 'S' }, name: 'u_S' });
        const axes = st.phasorView === 'dq'
          ? [{ angle: 0, label: { sym: 'd' } }, { angle: Math.PI / 2, label: { sym: 'q' } }]
          : [{ angle: 0, label: { sym: 'α' } }, { angle: Math.PI / 2, label: { sym: 'β' } }, { angle: gv, label: { sym: 'd' }, color: 'ink-3', dash: [3, 4], half: true }];
        phasor.axes = axes;
        phasor.set({ vectors: vecs, circles: mode !== 'passive' ? [{ cx: 0, cy: 0, r: p.umax, color: 'c-u', dash: [2, 4] }] : [] });
        phasor.render();
      }
      // ESB
      {
        const { ctx, w, h: hh } = ui.fitCanvas(esbCanvas);
        ctx.clearRect(0, 0, w, hh);
        if (MS.circuits) {
          const source = mode === 'passive' ? (p.open ? 'open' : p.rL === 0 ? 'short' : 'resistor') : mode === 'uf' ? 'uf' : 'inverter';
          MS.circuits.drawPSM(ctx, {
            x: 0, y: 0, w, h: hh, dark, flow: st.flow, labels: true, iRef: 1,
            view: st.esbView, source,
            values: { ud: o.uDQ.re, uq: o.uDQ.im, id: o.id, iq: o.iq, absU: o.absU, absI: o.absI, w: o.w, psiM: p.psiM, rs: p.rs, ls: p.ls, rL: p.rL },
          });
        }
      }
      // current plane
      {
        const circles = [];
        if (mode === 'foc' || mode === 'bldc' || mode === 'dc') circles.push({ cx: 0, cy: 0, r: p.imax, color: 'c-i', dash: [5, 4], width: 1.25 });
        const series = [];
        if (mode !== 'passive' && Math.abs(o.w) > 0.02) {
          const loc = m.voltageLimitLocus(o.w, 180);
          if (loc && loc.pts.length > 2) {
            const pts = loc.pts.map((q) => [q.id, q.iq]);
            pts.push(pts[0]);
            series.push({ points: pts, color: 'c-u', width: 1.75, name: L('Spannungsgrenze', 'Voltage limit') });
          }
        }
        if (mode === 'passive' && S0.locus) series.push({ points: S0.locus, color: 'c-ref', width: 1.5, dash: [4, 3], name: L('Ortskurve für ω = 0 … ∞', 'Locus for ω = 0 … ∞') });
        if (Math.abs(o.m) > 0.01) series.push({ points: [[-4, o.m / p.psiM], [2, o.m / p.psiM]], color: 'c-m', width: 1.25, dash: [5, 4], name: L('m = konst.', 'm = const.'), hover: false });
        series.push({ points: st.trail.map((q) => [q[2], q[3]]), color: 'c-i', width: 1.5, alpha: 0.4, hover: false });
        const markers = [{ x: o.id, y: o.iq, color: 'c-i', r: 5.5, tip: L('Strom i_S', 'Current i_S') }];
        if (mode === 'foc' && m.on) markers.push({ x: o.iRef.d, y: o.iRef.q, color: 'ink', hollow: true, r: 5, tip: L('Sollwert', 'Setpoint') });
        ipChart.set({ series, markers, circles, texts: [{ x: -p.psiM / p.ls, y: 0, text: '−ψ_M/l_S', dy: -8, align: 'center', color: 'ink-3', size: 10.5 }] });
        ipChart.render();
      }
      // characteristic
      if (chart) {
        if (st.tab === 'mw' && mode !== 'passive') {
          chart.set({
            series: [
              { points: S0.zTop, color: 'c-ref', width: 1.5, dash: [5, 4], name: L('Grenze i_d = 0', 'Envelope i_d = 0') },
              { points: S0.zBot, color: 'c-ref', width: 1.5, dash: [5, 4], hover: false },
              { points: S0.fwTop, color: 'ink', width: 2, name: L('Grenze mit Feldschwächung', 'Envelope with field weakening') },
              { points: S0.fwBot, color: 'ink', width: 2, hover: false },
              { points: S0.load, color: 'c-m', width: 1.5, dash: [6, 4], name: L('Last + Reibung', 'Load + friction') },
              { points: st.trail.map((q) => [q[0], q[1]]), color: 'c-m', width: 1.5, alpha: 0.45, hover: false },
            ],
            markers: [{ x: o.m, y: o.w, color: 'c-m', r: 5.5, tip: L('Momentanwert', 'Instantaneous value') }],
          });
        } else if (st.tab === 'mw') {
          chart.set({
            series: [
              { points: S0.ks, color: 'c-ref', width: 1.5, dash: [5, 4], name: L('Kurzschluss', 'Short circuit') },
              { points: S0.brake, color: 'ink', width: 2, name: L('mit r_L', 'with r_L') },
              { points: st.trail.map((q) => [q[0], q[1]]), color: 'c-m', width: 1.5, alpha: 0.45, hover: false },
            ],
            markers: [{ x: o.m, y: o.w, color: 'c-m', r: 5.5, tip: L('Momentanwert', 'Instantaneous value') }],
          });
        } else if (st.tab === 'gamma') {
          const amp = mode === 'dc' ? Math.min(p.dcAmp, p.imax) : Math.min(Math.abs(o.mRef) / p.psiM, p.imax) || 1;
          const g = MS.linspace(-180, 180, 361);
          const series = [];
          if (mode === 'bldc') {
            series.push({ points: g.map((x) => [x, amp * p.psiM]), color: 'c-ref', width: 1.5, dash: [5, 4], name: L('Sinus', 'Sinusoidal') });
            series.push({ points: g.map((x) => { const b = m.blockFor(x * MS.DEG, 1); return [x, amp * p.psiM * Math.sin(b.phi - x * MS.DEG)]; }), color: 'ink', width: 2, name: L('Block', 'Block') });
          } else {
            series.push({ points: g.map((x) => [x, amp * p.psiM * Math.sin(p.dcAngle * MS.DEG - x * MS.DEG)]), color: 'ink', width: 2, name: 'm(γ)' });
          }
          chart.set({ series, markers: [{ x: MS.wrap(o.gamma) / MS.DEG, y: o.m, color: 'c-m', r: 5.5, tip: L('Momentanwert', 'Instantaneous value') }] });
        } else if (st.tab === 'delta') {
          const lam = m.loadAngleModel(o.uAmp, Math.max(Math.abs(o.ws), 1e-3));
          const g = MS.linspace(-180, 180, 361);
          const mL = m.loadTorque(o.ws) + p.kf * o.ws;
          chart.set({
            series: [
              { points: g.map((x) => [x, lam.m((x + 90) * MS.DEG)]), color: 'ink', width: 2, name: 'm(ϑ)' },
              { points: [[-180, mL], [180, mL]], color: 'c-m', width: 1.5, dash: [6, 4], name: L('Last', 'Load') },
            ],
            markers: [
              { x: MS.wrap(lam.deltaKipp - Math.PI / 2) / MS.DEG, y: lam.mKipp, color: 'ink', hollow: true, r: 5, tip: L('Kippmoment', 'Pull-out torque') },
              { x: MS.wrap(o.thetaU - o.gamma - Math.PI / 2) / MS.DEG, y: o.m, color: 'c-m', r: 5.5, tip: L('Momentanwert', 'Instantaneous value') },
            ],
          });
        } else if (st.tab === 'eig' && S0.eig) {
          const pts = [];
          for (const r of S0.eig) for (const e of r.eig) pts.push([e.re, e.im]);
          const cur = m.linearize(Math.max(o.ws, 0.02));
          chart.set({
            series: [],
            markers: [
              ...pts.map((q) => ({ x: q[0], y: q[1], color: 'c-ref', r: 2.5 })),
              ...(cur ? cur.eig.map((e) => ({ x: e.re, y: e.im, color: 'c-m', r: 5, tip: L(`λ bei ω_s = ${ui.fmt(o.ws, 2)}`, `λ at ω_s = ${ui.fmt(o.ws, 2)}`) })) : []),
            ],
            areas: [{ points: [[0, -10], [1, -10], [1, 10], [0, 10]], color: 'c-ref', alpha: 0.08 }],
          });
        }
        chart.render();
      }
      scope.render();

      const now = performance.now();
      if (now - st.lastDom > 90) {
        st.lastDom = now;
        R.w.set(o.w, `${ui.fmt(o.w * p.nN, 0)} min⁻¹`);
        const MBez = m.reference().MBez;
        R.m.set(o.m, L(`${ui.fmt(o.m * MBez)} Nm, Last ${ui.fmt(o.mL, 2)}`, `${ui.fmt(o.m * MBez)} Nm, load ${ui.fmt(o.mL, 2)}`));
        R.i.set(o.absI, L(`${ui.fmt(o.absI * p.IN)} A eff. je Strang`, `${ui.fmt(o.absI * p.IN)} A rms per phase`));
        R.u.set(o.absU, L(`${ui.fmt(o.absU * p.UN, 0)} V verkettet`, `${ui.fmt(o.absU * p.UN, 0)} V line-to-line`));
        R.dq.set(o.id, `${S('i', 'q')} = ${ui.fmt(o.iq, 2)}`);
        if (mode === 'uf') R.x.set(MS.wrap(o.thetaU - o.gamma - Math.PI / 2) / MS.DEG, `${S('ω', 's')} = ${ui.fmt(o.ws, 3)}`, '°');
        else R.x.set(o.cosphi, Number.isFinite(o.cosphi) ? (o.cosphi >= 0 ? L('Motor', 'Motor') : L('Generator', 'Generator')) : L('kein Strom', 'no current'));
        const s = status(o);
        pills.replaceChildren(...s.items);
        explain.innerHTML = s.text;
        formulas.set(formulaItems(o));
        const pv = { pel: mode === 'passive' ? -(p.open ? 0 : p.rL * o.absI * o.absI) : o.pel, pcu: -o.pcu, pi: -o.pmech, pf: -o.mF * o.w };
        if (mode === 'passive') pv.pel = -(p.open || !m.on ? 0 : p.rL * o.absI * o.absI);
        pbars.set(pv, Math.max(1.2, Math.abs(pv.pel), Math.abs(pv.pi)), '', (x) => ui.fmt(x, 3));
        powerNote.innerHTML = mode === 'passive'
          ? L(`Die elektrische Zeile ist hier die Leistung im Lastwiderstand ${S('r', 'L')}|${S('i')}|².`,
            `Here the electrical row is the power in the load resistor, ${S('r', 'L')}|${S('i')}|².`)
          : L(`${S('p', 'el')} = Re{${S('u', 'S')}·${S('i', 'S')}*} – mit dem Faktor 2/3 im Raumzeiger ist das direkt die Leistung bezogen auf ${S('S', 'N')}.`,
            `${S('p', 'el')} = Re{${S('u', 'S')}·${S('i', 'S')}*} – with the factor 2/3 in the space vector, this is directly the power relative to ${S('S', 'N')}.`);
      }
    };

    setupChart();
    setWinSel();
    syncAll();
    return {
      el: pg.el,
      tick,
      render,
      destroy: () => { if (chart) chart.destroy(); ipChart.destroy(); },
      onTheme: () => { st.sig = ''; },
      debug: { m, st },
    };
  };
})(window);
