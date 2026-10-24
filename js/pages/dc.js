/*
 * Gleichstrommaschine page: live machine, n(M)-Kennlinie, Ersatzschaltbild,
 * time plots, live formulas, power balance, parameters and experiments.
 */
(function (root) {
  'use strict';
  const MS = root.MS;
  const ui = MS.ui;
  const shell = MS.shell;
  const { h } = ui;
  const S = (b, s) => `<span class="m">${b}${s ? `<sub>${s}</sub>` : ''}</span>`;
  const { n: N, frac } = shell;

  const META = {
    pm: {
      title: 'Permanenterregte Gleichstrommaschine',
      sub: 'Der Magnet liefert konstanten Fluss: die Kennlinie n(M) ist eine flache Gerade, die Drehzahl folgt der Ankerspannung.',
      speed: 0.1, window: 0.5,
    },
    fremd: {
      title: 'Fremderregte Gleichstrommaschine',
      sub: 'Das Feld kommt aus einer eigenen Quelle. Bis n<sub>N</sub> stellt man über die Ankerspannung, darüber durch Feldschwächung.',
      speed: 0.25, window: 2,
    },
    neben: {
      title: 'Nebenschlussmaschine',
      sub: 'Die Erregung hängt parallel zum Anker an derselben Spannung. Als Motor wie fremderregt, als Generator kann sie sich selbst erregen.',
      speed: 0.25, window: 2,
    },
    reihen: {
      title: 'Reihenschlussmaschine',
      sub: 'Die Erregung liegt in Serie: der Ankerstrom macht auch das Feld. Großes Anzugsmoment, aber ohne Last geht sie durch.',
      speed: 0.25, window: 2,
    },
  };

  const WINDOWS = [0.1, 0.25, 0.5, 1, 2, 5, 10];

  MS.pages.dc = (type) => {
    if (!META[type]) type = 'pm';
    const meta = META[type];
    const m = new MS.dc.DCMachine(type);
    const p = m.p;
    const D = MS.dc.defaults(type);
    const hasCurve = type !== 'pm';

    // Rated references (from the default set, so the axes stay put).
    const ref = (() => {
      const tmp = new MS.dc.DCMachine(type);
      const IEN = tmp.fieldSteady();
      const cN = tmp.c(D.IN, IEN);
      const MN = Math.abs(cN * D.IN);
      const n0 = type === 'reihen' ? D.nN : tmp.noLoadSpeed();
      return { MN, n0, IEN: Math.max(IEN, 1e-6), k1PhiN: Math.abs(cN * MS.TAU), PN: MN * MS.rpmToRad(D.nN) };
    })();

    const st = {
      running: true, speed: meta.speed, window: meta.window,
      view: 'quad', tab: 'nm', pinned: null, trail: [], destroyed: false,
      thetaVis: 0, flow: 0, lastDom: 0, sig: '', stat: null,
    };

    // ------------------------------------------------------------ toolbar
    const transport = shell.transport({
      isOn: () => m.on,
      setOn: (v) => { if (v) m.switchOn(); else m.switchOff(); st.destroyed = false; banner.hidden = true; },
      running: () => st.running,
      setRunning: (v) => { st.running = v; },
      reset: () => { m.reset(); runner.cancel(); scope.clear(); st.trail = []; st.destroyed = false; banner.hidden = true; },
      speed: () => st.speed,
      setSpeed: (v) => { st.speed = v; },
    });
    const typeSeg = ui.seg({
      options: Object.entries(MS.dc.TYPES).map(([k, v]) => ({ value: k, label: v.short, title: v.label })),
      get: () => type,
      set: (v) => { location.hash = '#/gsm/' + v; },
      label: 'Erregungsart',
    });
    const pg = shell.page({ title: meta.title, subtitle: meta.sub, controls: [typeSeg.el, ...transport.els] });

    // ------------------------------------------------------------ hero
    const figCanvas = h('canvas', { role: 'img', 'aria-label': 'Querschnitt der Gleichstrommaschine mit Strömen und Kräften' });
    const dg = (x) => ui.autoDigits(x);
    const R = {
      n: shell.readout({ label: 'Drehzahl ' + S('n'), q: 'N', unit: 'min⁻¹', digits: 0 }),
      M: shell.readout({ label: 'Moment ' + S('M'), q: 'M', unit: 'Nm', digits: dg(ref.MN) }),
      IA: shell.readout({ label: 'Ankerstrom ' + S('I', 'A'), q: 'I', unit: 'A', digits: dg(D.IN) }),
      Ui: shell.readout({ label: 'Gegenspannung ' + S('U', 'i'), q: 'U', unit: 'V', digits: dg(D.UN) }),
      IE: shell.readout({ label: 'Erregerstrom ' + S('I', 'E'), q: 'I', unit: 'A', digits: 2 }),
      P: shell.readout({ label: 'Leistung ' + S('P', 'mech'), unit: 'W' }),
    };
    const pills = h('div', { class: 'pills' });
    const explain = h('p', { class: 'explain' });
    const banner = h('div', { class: 'banner', hidden: true }, ui.icon('stop'), h('div'));
    const readoutBox = h('div', { class: 'readouts' }, R.n.el, R.M.el, R.IA.el, R.Ui.el, (type === 'fremd' || type === 'neben') ? R.IE.el : null, R.P.el);
    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-figure' }, figCanvas),
      h('div', { class: 'hero-side' }, readoutBox, h('div', { class: 'status' }, pills, explain), banner));

    // ------------------------------------------------------------ Kennlinie
    const chartBox = h('div');
    const tabs = [{ value: 'nm', label: 'n(M)' }];
    if (hasCurve) tabs.push({ value: 'mag', label: 'Leerlaufkennlinie' });
    if (type === 'neben') tabs.push({ value: 'self', label: 'Selbsterregung' });
    const tabSeg = ui.seg({ options: tabs, get: () => st.tab, set: (v) => { st.tab = v; setupChart(); }, label: 'Diagramm' });
    const viewSeg = ui.seg({
      options: [{ value: 'motor', label: 'Motor' }, { value: 'quad', label: '4 Quadranten' }, { value: 'full', label: 'Gesamt' }],
      get: () => st.view, set: (v) => { st.view = v; setupChart(); }, label: 'Ausschnitt',
    });
    const pinBtn = ui.button({ label: 'Referenz merken', icon: 'pin', small: true, title: 'Aktuelle Kennlinie als Vergleich festhalten' });
    pinBtn.addEventListener('click', () => {
      if (st.pinned) { st.pinned = null; pinBtn.querySelector('span:last-child').textContent = 'Referenz merken'; }
      else { st.pinned = st.stat ? st.stat.curve.slice() : null; pinBtn.querySelector('span:last-child').textContent = 'Referenz löschen'; }
    });
    const legend = h('div', { class: 'legend' });
    if (tabs.length < 2) tabSeg.el.style.display = 'none';
    const kennCard = shell.card({ title: 'Kennlinie', actions: [tabSeg.el, viewSeg.el], body: [chartBox, h('div', { class: 'card-head' }, legend, h('span', { class: 'spacer' }), pinBtn)] });
    let chart = null;

    const setupChart = () => {
      tabSeg.sync(); viewSeg.sync();
      chartBox.replaceChildren();
      if (chart) chart.destroy();
      viewSeg.el.style.display = st.tab === 'nm' ? '' : 'none';
      pinBtn.style.display = st.tab === 'nm' ? '' : 'none';
      if (st.tab === 'nm') {
        const r = nmRange();
        chart = new ui.Chart(chartBox, {
          x: { label: { sym: 'M', unit: 'Nm' }, min: r.x0, max: r.x1 },
          y: { label: { sym: 'n', unit: 'min⁻¹' }, min: r.y0, max: r.y1, fmt: (v) => ui.fmt(v, 0) },
          height: 300, hover: 'xy',
          quadrants: st.view === 'motor' ? [] : [
            { px: 0.985, py: 0.06, text: 'Motor', align: 'right' },
            { px: 0.015, py: 0.06, text: 'Generator / Bremse', align: 'left' },
            { px: 0.015, py: 0.97, text: 'Motor rückwärts', align: 'left' },
            { px: 0.985, py: 0.97, text: 'Bremse rückwärts', align: 'right' },
          ],
          ariaLabel: 'Drehzahl-Drehmoment-Kennlinie',
        });
        legend.innerHTML = '<span><i style="color:var(--ink)"></i>Maschine</span><span><i class="dash" style="color:var(--c-ref)"></i>Last + Reibung</span><span><i class="dot" style="color:var(--c-m)"></i>Momentanwert</span><span><i class="dot" style="color:var(--ink)"></i>Arbeitspunkt</span>';
      } else if (st.tab === 'mag') {
        const Imax = curveImax();
        chart = new ui.Chart(chartBox, {
          x: { label: type === 'reihen' ? { sym: 'I', sub: 'A', unit: 'A' } : { sym: 'I', sub: 'E', unit: 'A' }, min: 0, max: Imax },
          y: { label: { sym: 'U', sub: 'iK', unit: 'V' }, min: 0, max: 1.15 * curveUmax() },
          height: 300, hover: 'xy', zero: false,
        });
        legend.innerHTML = `<span><i style="color:var(--c-psi)"></i>Leerlaufkennlinie bei ${S('n', 'K')} = ${ui.fmt(p.curve.nK, 0)} min⁻¹</span><span><i class="dot" style="color:var(--c-m)"></i>aktueller Erregerstrom</span>`;
      } else {
        const Imax = curveImax();
        chart = new ui.Chart(chartBox, {
          x: { label: { sym: 'I', sub: 'E', unit: 'A' }, min: 0, max: Imax },
          y: { label: { sym: 'U', unit: 'V' }, min: 0, max: 1.3 * curveUmax() },
          height: 300, hover: 'xy', zero: false,
        });
        legend.innerHTML = `<span><i style="color:var(--c-psi)"></i>${S('U', 'i')}(${S('I', 'E')}) bei aktueller Drehzahl</span><span><i class="dash" style="color:var(--c-u)"></i>Widerstandsgerade (${S('R', 'A')} + ${S('R', 'E')} + ${S('R', 'VE')})·${S('I', 'E')}</span><span><i class="dot" style="color:var(--c-m)"></i>Momentanwert</span>`;
      }
    };
    const curveImax = () => (p.curve.type === 'tanh' ? 4 * p.curve.Ik : 1.2 * p.curve.points[p.curve.points.length - 1][0]);
    const curveUmax = () => (p.curve.type === 'tanh' ? p.curve.Usat : Math.max(...p.curve.points.map((q) => q[1])));
    const nmRange = () => {
      const { MN, n0 } = ref;
      if (st.view === 'motor') return { x0: 0, x1: 2.6 * MN, y0: 0, y1: 1.45 * n0 };
      if (st.view === 'quad') return { x0: -2.6 * MN, x1: 2.6 * MN, y0: -0.9 * n0, y1: 1.9 * n0 };
      // full: include the stall point at this voltage
      const I0 = m.currentAtSpeed(0);
      const Ms = I0 === null ? 3 * MN : Math.abs(m.steadyAt(I0).M);
      const xm = Math.max(3 * MN, 1.08 * Ms);
      return { x0: -xm, x1: xm, y0: -1.3 * n0, y1: 2.2 * n0 };
    };

    // ------------------------------------------------------------ ESB
    const esbCanvas = h('canvas', { role: 'img', 'aria-label': 'Ersatzschaltbild' });
    const esbBox = h('div', { class: 'chart-box', style: { height: '100%', minHeight: '300px', flex: '1' } }, esbCanvas);
    const esbCard = shell.card({ title: 'Ersatzschaltbild', hint: 'Zählpfeile im Verbrauchersystem', body: [esbBox] });

    // ------------------------------------------------------------ scope
    const scopeBox = h('div');
    const strips = [
      { label: { sym: 'n', unit: 'min⁻¹' }, series: [{ key: 'n', color: 'c-n', name: { sym: 'n' } }], min: 0, max: ref.n0 * 0.2 },
      { label: { sym: 'I', unit: 'A' }, series: [{ key: 'IA', color: 'c-i', name: { sym: 'I', sub: 'A' } }], min: 0, max: 1 },
    ];
    if (type === 'fremd' || type === 'neben') strips.push({ label: { sym: 'I', sub: 'E', unit: 'A' }, series: [{ key: 'IE', color: 'c-i', name: { sym: 'I', sub: 'E' }, dash: [5, 3] }], min: 0, max: ref.IEN });
    strips.push({ label: { sym: 'M', unit: 'Nm' }, series: [{ key: 'M', color: 'c-m', name: { sym: 'M' } }, { key: 'ML', color: 'c-ref', name: { sym: 'M', sub: 'L' }, dash: [5, 3] }], min: 0, max: 0.2 });
    strips.push({ label: { sym: 'U', unit: 'V' }, series: [{ key: 'Ui', color: 'c-u', name: { sym: 'U', sub: 'i' } }, { key: 'U', color: 'c-u', name: { sym: 'U' }, dash: [5, 3] }], min: 0, max: 1 });
    const scope = new ui.Scope(scopeBox, { strips, window: st.window, stripHeight: 88, timeLabel: { sym: 't', unit: 's' } });
    const winSel = h('select', { 'aria-label': 'Zeitfenster' });
    for (const w of WINDOWS) winSel.append(h('option', { value: w, text: ui.fmt(w, w < 1 ? 2 : 0) + ' s' }));
    winSel.addEventListener('change', () => { st.window = parseFloat(winSel.value); scope.setWindow(st.window); });
    const setWinSel = () => {
      const v = String(st.window);
      if (![...winSel.options].some((o) => o.value === v)) winSel.append(h('option', { value: v, text: ui.fmt(st.window, st.window < 1 ? 2 : 1) + ' s' }));
      winSel.value = v;
    };
    const scopeCard = shell.card({ title: 'Zeitverläufe', hint: 'Fahre mit der Maus darüber für Werte', actions: [h('span', { class: 'popup' }, winSel)], body: [scopeBox] });

    // ------------------------------------------------------------ formulas & power
    const formulas = shell.formulas();
    const formCard = shell.card({ title: 'Formeln mit aktuellen Werten', hint: 'stationär gerechnet', body: [formulas.el] });
    const pRows = [
      { key: 'Pel', label: 'elektrisch ' + S('U') + '·' + S('I'), q: 'U' },
      { key: 'PcuA', label: 'Kupfer Anker' },
      ...(type === 'fremd' || type === 'neben' ? [{ key: 'PcuE', label: 'Kupfer Feld' }] : []),
      { key: 'Pi', label: 'innere ' + S('M') + '·Ω', q: 'M' },
      { key: 'Pf', label: 'Reibung' },
      { key: 'Psh', label: 'an der Welle', q: 'M' },
    ];
    const pbars = shell.powerBars(pRows);
    const powerNote = h('p', { class: 'muted', style: { fontSize: '12px' } });
    const powerCard = shell.card({ title: 'Leistungsbilanz', hint: '> 0 aufgenommen, < 0 abgegeben', body: [pbars.el, powerNote] });

    pg.stage.append(hero, h('div', { class: 'grid-2' }, kennCard, esbCard), scopeCard, h('div', { class: 'grid-2' }, formCard, powerCard));

    // ------------------------------------------------------------ inspector
    const vis = (ctrl, fn) => { ctrl._show = fn; return ctrl; };
    const groupWithVis = (g, ctrls) => {
      const sync = g.sync;
      g.sync = () => { sync(); ctrls.forEach((c) => { if (c._show) c.el.hidden = !c._show(); }); };
      return g;
    };
    const UN = D.UN;
    const cSupply = ui.segRow({
      label: 'Klemmen an', options: [{ value: 'source', label: 'Spannungsquelle' }, { value: 'load', label: 'Lastwiderstand' }],
      get: () => p.supply, set: (v) => { p.supply = v; syncAll(); },
    });
    const cUA = vis(ui.slider({ label: S('U', 'A'), desc: 'Klemmenspannung', unit: 'V', min: -1.25 * UN, max: 1.25 * UN, step: UN / 200, q: 'U', get: () => p.UA, set: (v) => { p.UA = v; } }), () => p.supply === 'source');
    const cLim = vis(ui.toggle({ label: 'Strombegrenzung', desc: 'Stromrichter', get: () => p.currentLimit, set: (v) => { p.currentLimit = v; syncAll(); } }), () => p.supply === 'source');
    const cImax = vis(ui.slider({ label: S('I', 'max'), desc: 'Grenzstrom', unit: 'A', min: 0.5 * D.IN, max: 4 * D.IN, step: 0.5, q: 'I', get: () => p.Imax, set: (v) => { p.Imax = v; } }), () => p.supply === 'source' && p.currentLimit);
    const cRV = vis(ui.slider({ label: S('R', 'V'), desc: 'Anlasswiderstand', unit: 'Ω', min: 0, max: Math.max(2, (2 * UN) / D.IN), step: 0.05, get: () => p.RV, set: (v) => { p.RV = v; } }), () => p.supply === 'source');
    const cRL = vis(ui.slider({ label: S('R', 'L'), desc: type === 'reihen' ? 'Bremswiderstand' : 'Lastwiderstand', unit: 'Ω', min: 0.1, max: 1000, log: true, get: () => Math.min(p.RL, 1000), set: (v) => { p.RL = v; } }), () => p.supply === 'load' && p.RL < MS.dc.R_OPEN);
    let lastRL = D.RL;
    const cOpen = vis(ui.toggle({
      label: 'Klemmen offen', desc: S('R', 'L') + ' = ∞',
      get: () => p.RL >= MS.dc.R_OPEN,
      set: (v) => { if (v) { lastRL = p.RL; p.RL = MS.dc.R_OPEN; } else p.RL = lastRL; syncAll(); },
    }), () => p.supply === 'load');
    const supplyCtrls = [cSupply, cUA, cLim, cImax, cRV, cRL, cOpen];
    const gSupply = groupWithVis(ui.group({
      title: 'Versorgung', rows: supplyCtrls,
      foot: type === 'reihen' ? 'Auf dem Bremswiderstand wird das Feld automatisch umgepolt, sonst kann sich die Maschine nicht selbst erregen.' : null,
    }), supplyCtrls);

    const excRows = [];
    if (type === 'pm') {
      excRows.push(ui.slider({ label: S('k', '1') + S('Φ'), desc: 'Magnetfluss', unit: 'Vs', min: 0.2, max: 1.2, step: 0.01, q: 'PSI', get: () => p.k1PhiPM, set: (v) => { p.k1PhiPM = v; } }));
    }
    if (type === 'fremd') {
      excRows.push(ui.toggle({ label: 'Erregung ein', get: () => p.fieldOn, set: (v) => { p.fieldOn = v; } }));
      excRows.push(ui.slider({ label: S('U', 'E'), desc: 'Erregerspannung', unit: 'V', min: 0, max: 1.2 * D.UE, step: 1, q: 'U', get: () => p.UE, set: (v) => { p.UE = v; } }));
    }
    if (type === 'fremd' || type === 'neben') {
      excRows.push(ui.slider({ label: S('R', 'VE'), desc: 'Feldsteller', unit: 'Ω', min: 0, max: 3 * D.RE, step: 1, get: () => Math.min(p.RVE, 3 * D.RE), set: (v) => { p.RVE = v; } }));
      excRows.push(ui.slider({ label: S('R', 'E'), desc: 'Erregerwicklung', unit: 'Ω', min: 0.2 * D.RE, max: 3 * D.RE, step: 1, get: () => p.RE, set: (v) => { p.RE = v; } }));
      excRows.push(ui.slider({ label: S('L', 'E'), desc: 'Feldinduktivität', unit: 'H', min: 0.1, max: 40, log: true, get: () => p.LE, set: (v) => { p.LE = v; } }));
    }
    if (type === 'reihen') {
      excRows.push(ui.slider({ label: S('R', 'E'), desc: 'Reihenschlusswicklung', unit: 'Ω', min: 0, max: 1, step: 0.01, get: () => p.RE, set: (v) => { p.RE = v; } }));
    }
    const gExc = ui.group({
      title: type === 'pm' ? 'Magnet' : 'Erregung', rows: excRows,
      foot: type === 'neben' ? 'Die Erregung hängt an der Klemmenspannung: ' + S('I', 'E') + ' = ' + S('U') + ' / (' + S('R', 'E') + ' + ' + S('R', 'VE') + ').' : type === 'reihen' ? 'Erregerstrom = Ankerstrom. Der Fluss folgt der Leerlaufkennlinie bei ' + S('I', 'A') + '.' : null,
    });

    let gCurve = null;
    if (hasCurve) {
      const ta = h('textarea', { rows: 6, style: { width: '100%', font: '12px ui-monospace, Menlo, Consolas, monospace', border: '0', borderRadius: '8px', padding: '8px', background: 'var(--fill-2)', resize: 'vertical' }, 'aria-label': 'Kennlinienpunkte' });
      const fillTa = () => {
        const pts = p.curve.type === 'points' ? p.curve.points : MS.linspace(0, curveImax(), 9).map((I) => [I, MS.magnet.UiK(p.curve, I)]);
        ta.value = pts.map(([I, U]) => `${ui.fmt(I, 2)}; ${ui.fmt(U, 1)}`).join('\n');
      };
      const msg = h('p', { class: 'group-foot', style: { padding: '0' } });
      const applyPts = () => {
        const pts = [];
        for (const line of ta.value.split('\n')) {
          const parts = line.split(/[;\t]|\s{2,}/).map((s) => ui.parse(s)).filter((v) => v !== null);
          if (parts.length >= 2) pts.push([parts[0], parts[1]]);
        }
        if (pts.length < 2) { msg.textContent = 'Mindestens zwei Zeilen „I; U“ eingeben.'; return; }
        if (!pts.some((q) => q[0] === 0)) pts.unshift([0, 0]);
        p.curve = MS.magnet.pointsCurve(pts, p.curve.nK);
        msg.textContent = `${pts.length} Punkte übernommen.`;
        syncAll(); setupChart();
      };
      const editor = h('div', { class: 'row', hidden: true },
        h('p', { class: 'group-foot', style: { padding: '0' }, html: 'Eine Zeile pro Punkt: ' + S('I') + ' in A; ' + S('U', 'iK') + ' in V (z. B. aus einer Angabe abgelesen). Zwischenwerte werden linear interpoliert.' }),
        ta,
        h('div', { class: 'exp-actions' },
          ui.button({ label: 'Übernehmen', kind: 'primary', small: true, onClick: applyPts }),
          ui.button({ label: 'Standardkurve', small: true, onClick: () => { p.curve = { ...D.curve }; fillTa(); syncAll(); setupChart(); msg.textContent = ''; } })),
        msg);
      const tanhOnly = (c) => vis(c, () => p.curve.type === 'tanh');
      const curveRows = [
        tanhOnly(ui.slider({ label: S('U', 'sat'), desc: 'Sättigungsspannung', unit: 'V', min: 0.4 * D.curve.Usat, max: 1.6 * D.curve.Usat, step: 1, q: 'U', get: () => p.curve.Usat || 0, set: (v) => { p.curve = { ...p.curve, Usat: v }; } })),
        tanhOnly(ui.slider({ label: S('I', 'k'), desc: 'Knickstrom', unit: 'A', min: 0.3 * D.curve.Ik, max: 3 * D.curve.Ik, step: D.curve.Ik / 50, q: 'I', get: () => p.curve.Ik || 1, set: (v) => { p.curve = { ...p.curve, Ik: v }; } })),
        tanhOnly(ui.slider({ label: S('U', 'rem'), desc: 'Remanenz', unit: 'V', min: 0, max: 0.1 * D.curve.Usat, step: 0.5, q: 'U', get: () => p.curve.Urem || 0, set: (v) => { p.curve = { ...p.curve, Urem: v }; } })),
        ui.info({ label: 'Gemessen bei ' + S('n', 'K'), value: () => ui.fmt(p.curve.nK, 0) + ' min⁻¹' }),
        { el: h('div', { class: 'row' }, h('div', { class: 'row-line' }, h('span', { class: 'lbl', text: p.curve.type === 'points' ? 'Eigene Punkte aktiv' : 'Eigene Punkte' }),
          ui.button({ label: 'Bearbeiten', small: true, onClick: () => { editor.hidden = !editor.hidden; if (!editor.hidden) fillTa(); } }))), sync() {} },
        { el: editor, sync() {} },
      ];
      gCurve = groupWithVis(ui.group({ title: 'Leerlaufkennlinie', rows: curveRows, foot: S('k', '1') + S('Φ') + ' = ' + S('U', 'iK') + '·60/' + S('n', 'K') + '. Gilt nur bei ' + S('n', 'K') + ', sonst ' + S('U', 'i') + ' = ' + S('U', 'iK') + '·' + S('n') + '/' + S('n', 'K') + '.' }), curveRows);
    }

    const gArm = ui.group({
      title: 'Anker', rows: [
        ui.slider({ label: S('R', 'A'), desc: 'Ankerwiderstand', unit: 'Ω', min: 0.02, max: 4 * D.RA, step: 0.01, get: () => p.RA, set: (v) => { p.RA = v; } }),
        ui.slider({ label: S('L', 'A'), desc: 'Ankerinduktivität', unit: 'mH', min: 0.1 * D.LA * 1e3, max: 10 * D.LA * 1e3, log: true, get: () => p.LA * 1e3, set: (v) => { p.LA = v / 1e3; } }),
      ],
    });

    const cImposed = ui.toggle({ label: 'Drehzahl vorgeben', desc: 'Prüfstand', get: () => p.speedMode === 'imposed', set: (v) => { p.speedMode = v ? 'imposed' : 'free'; if (v) p.nSet = Math.round(m.outputs().n); syncAll(); } });
    const cNset = vis(ui.slider({ label: S('n', 'soll'), desc: 'Antriebsdrehzahl', unit: 'min⁻¹', min: -1.5 * ref.n0, max: 2.5 * ref.n0, step: 10, q: 'N', digits: 0, get: () => p.nSet, set: (v) => { p.nSet = v; } }), () => p.speedMode === 'imposed');
    const loadRows = [
      ui.toggle({ label: 'Last angekoppelt', get: () => p.loadOn, set: (v) => { p.loadOn = v; } }),
      ui.select({ label: 'Lastkennlinie', options: Object.entries(MS.loads.TYPES).filter(([k]) => k !== 'none').map(([k, v]) => ({ value: k, label: v.label })), get: () => p.load.type, set: (v) => { p.load = { ...p.load, type: v }; syncAll(); } }),
      ui.slider({ label: S('M', 'L'), desc: 'bei ' + S('n', 'N'), unit: 'Nm', min: 0, max: 2.5 * ref.MN, step: ref.MN / 100, q: 'M', get: () => p.load.M0, set: (v) => { p.load = { ...p.load, M0: v }; } }),
      ui.slider({ label: S('Θ'), desc: 'Trägheitsmoment', unit: 'kgm²', min: 0.05 * D.J, max: 20 * D.J, log: true, digits: 4, get: () => p.J, set: (v) => { p.J = v; } }),
      cImposed, cNset,
    ];
    const gLoad = groupWithVis(ui.group({ title: 'Mechanik & Last', rows: loadRows, foot: ' ' }), loadRows);
    const loadFoot = gLoad.el.querySelector('.group-foot');

    const gNameplate = ui.group({
      title: 'Nenndaten', rows: [
        ui.info({ label: S('U', 'N') + ' / ' + S('I', 'N'), value: () => `${ui.fmt(D.UN, 0)} V / ${ui.fmt(D.IN, 0)} A` }),
        ui.info({ label: S('n', 'N') + ' / ' + S('M', 'N'), value: () => `${ui.fmt(D.nN, 0)} min⁻¹ / ${ui.fmt(ref.MN)} Nm` }),
        ui.info({ label: S('P', 'N'), value: () => `${ui.fmt(ref.PN, 0)} W` }),
      ],
    });

    const groups = [gSupply, gExc, gCurve, gArm, gLoad, gNameplate];
    const runner = shell.runner({
      getTime: () => m.t,
      prepare: (exp) => {
        m.reset();
        const fresh = MS.dc.defaults(type);
        for (const k of Object.keys(p)) delete p[k];
        Object.assign(p, fresh);
        p.load = { ...fresh.load };
        exp.setup(p, m);
        st.speed = exp.speed ?? meta.speed;
        st.window = exp.window ?? meta.window;
        setWinSel();
        scope.setWindow(st.window);
        scope.clear();
        st.trail = [];
        st.destroyed = false;
        banner.hidden = true;
        st.running = true;
        if (exp.tab && tabs.some((t) => t.value === exp.tab)) st.tab = exp.tab;
        else if (!exp.tab) st.tab = 'nm';
        setupChart();
        syncAll();
      },
    });
    const expEl = shell.experiments(MS.dcExperiments[type] || [], runner);
    const insp = shell.inspector(pg.inspector, { groups, experiments: expEl });
    const syncAll = () => { insp.sync(); transport.sync(); };

    // ------------------------------------------------------------ statics
    const statics = () => {
      const curve = m.characteristic(600).map((q) => [q.M, q.n]);
      const ops = m.operatingPoints();
      const r = nmRange();
      const loadPts = [];
      for (const n of MS.linspace(r.y0, r.y1, 220)) {
        const w = MS.rpmToRad(n);
        loadPts.push([m.loadTorque(w) + m.frictionTorque(w), n]);
      }
      return { curve, ops, loadPts, n0: m.noLoadSpeed() };
    };

    // ------------------------------------------------------------ status text
    const status = (o) => {
      const items = [];
      let text = '';
      const IN = D.IN;
      const ratio = Math.abs(o.IA) / IN;
      const Pmech = o.M * o.w;
      const accel = (o.M - o.ML - o.MF) / p.J;
      const steady = Math.abs(accel) * 0.05 < 0.01 * Math.max(MS.rpmToRad(ref.n0), Math.abs(o.w)) || p.speedMode === 'imposed';
      if (!m.on) {
        items.push(ui.pill('', 'power', 'Ausgeschaltet'));
        text = Math.abs(o.n) > 5 ? 'Die Maschine ist vom Netz getrennt und läuft aus – ohne Strom kein Moment.' : 'Zum Starten den Schalter oben auf <b>Ein</b> stellen. Die Maschine liegt dann sofort an der Spannung.';
        return { items, text };
      }
      const gen = Pmech < -0.01 * ref.PN;
      const counter = Pmech < -0.01 * ref.PN && o.Pel > 0.01 * ref.PN;
      if (counter) items.push(ui.pill('serious', 'warn', 'Gegenstrombremse'));
      else if (gen) items.push(ui.pill('', 'loop', 'Generator'));
      else if (Math.abs(o.M) < 0.03 * ref.MN) items.push(ui.pill('', 'gauge', 'Leerlauf'));
      else items.push(ui.pill('', 'bolt', 'Motor'));
      if (p.speedMode === 'imposed') items.push(ui.pill('', 'gauge', 'Drehzahl vorgegeben'));
      else if (steady) items.push(ui.pill('good', 'check', 'Stationär'));
      else items.push(ui.pill('', accel * o.w >= 0 ? 'arrowUp' : 'arrowDown', accel * o.w >= 0 ? 'Beschleunigt' : 'Verzögert'));
      if (ratio > 2) items.push(ui.pill(ratio > 5 ? 'crit' : 'serious', 'warn', `${ui.fmt(ratio, 1)} × Nennstrom`));
      if (p.currentLimit && p.supply === 'source' && Math.abs(Math.abs(o.IA) - p.Imax) < 0.02 * p.Imax) items.push(ui.pill('', 'info', 'Strombegrenzung aktiv'));
      if (Math.abs(o.n) > 2 * D.nN) items.push(ui.pill('crit', 'warn', 'Überdrehzahl'));

      const R = m.rArm();
      if (p.supply === 'load') {
        if (type === 'neben' && Math.abs(o.U) < 0.15 * p.UN && Math.abs(o.n) > 0.3 * ref.n0) {
          const se = m.selfExcitation(Math.abs(o.n));
          const remText = MS.magnet.remanence(p.curve) <= 0 ? 'Es fehlt die Remanenz (Restmagnetismus) – ohne sie gibt es keinen Anfangsfluss.' : `Der Feldkreiswiderstand ${ui.fmt(se.Rloop, 0)} Ω liegt über dem kritischen Wert ${ui.fmt(se.Rcrit, 0)} Ω bei dieser Drehzahl.`;
          text = `Keine Selbsterregung: ${remText}`;
        } else if (type === 'reihen' && Math.abs(o.IA) < 0.05 * IN && Math.abs(o.n) > 0.2 * ref.n0 && MS.magnet.remanence(p.curve) <= 0) {
          text = 'Die Bremse greift nicht: ohne Remanenz kann sich der Bremsstrom nicht aufbauen. Unter Leerlaufkennlinie eine Remanenz einstellen.';
        } else if (Math.abs(o.IA) < 0.05 * IN && type === 'reihen' && Math.abs(o.n) > 0.05 * ref.n0) {
          text = 'Die Selbsterregung ist abgerissen: bei dieser Drehzahl schneidet die Kennlinie die Widerstandsgerade nicht mehr. Die Bremse wirkt nicht mehr.';
        } else {
          text = `Generatorbetrieb auf ${p.RL >= MS.dc.R_OPEN ? 'offene Klemmen' : ui.fmt(p.RL) + ' Ω'}: Die induzierte Spannung ${S('U', 'i')} = ${ui.fmt(o.Ui)} V treibt den Strom durch Innen- und Lastwiderstand, an den Klemmen bleiben ${ui.fmt(o.U)} V. Das Moment ${ui.fmt(o.M)} Nm bremst den Antrieb.`;
        }
      } else if (Math.abs(o.n) < 0.04 * ref.n0 && ratio > 1.5 && !steady) {
        text = `Anlauf: Die Maschine steht noch, also ist ${S('U', 'i')} ≈ 0. Nur ${S('R')} = ${ui.fmt(R)} Ω begrenzt den Strom: ${S('U')}/${S('R')} = ${ui.fmt(Math.abs(o.U) / R, 0)} A, das ${ui.fmt(Math.abs(o.U) / R / IN, 1)}-Fache von ${S('I', 'N')}.`;
      } else if (counter) {
        text = `Gegenstrombremsung: Klemmenspannung und Gegenspannung wirken in dieselbe Richtung, der Strom ist riesig. Elektrische und mechanische Leistung werden beide im Anker in Wärme umgesetzt.`;
      } else if (gen) {
        text = `Generator: Die Maschine dreht schneller als ihre Leerlaufdrehzahl, ${S('U', 'i')} = ${ui.fmt(o.Ui)} V ist größer als ${S('U')} = ${ui.fmt(o.U)} V. Der Strom kehrt sich um (${S('I', 'A')} < 0) und es fließt Leistung zurück ins Netz.`;
      } else if (type === 'reihen' && !p.loadOn && Math.abs(o.n) > 1.3 * D.nN) {
        text = `Reihenschluss ohne Last: kleiner Strom heißt kleiner Fluss. Für die Gegenspannung muss die Drehzahl immer weiter steigen – die Maschine geht durch.`;
      } else if (!steady) {
        text = accel * o.w >= 0
          ? `Hochlauf: Mit der Drehzahl wächst die Gegenspannung ${S('U', 'i')} = ${S('k', '1')}Φ·${S('n')}/60, dadurch sinken Strom und Moment, bis das Moment die Last gerade noch deckt.`
          : `Die Last ist größer als das Motormoment, die Maschine wird langsamer. Mit sinkender Gegenspannung steigt der Strom, bis ein neues Gleichgewicht erreicht ist.`;
      } else {
        const share = Math.abs(o.U) > 1 ? Math.abs(o.Ui / o.U) * 100 : 0;
        text = `Stationär: Motormoment = Lastmoment + Reibung. Von ${ui.fmt(o.U)} V Klemmenspannung sind ${ui.fmt(share, 0)} % durch die Gegenspannung belegt, nur ${S('R')}·${S('I', 'A')} = ${ui.fmt(R * o.IA)} V fallen am Widerstand ab.`;
      }
      return { items, text };
    };

    // ------------------------------------------------------------ formulas
    const formulaItems = (o) => {
      const F = [];
      const k1 = o.k1Phi;
      if (type === 'pm') F.push({ eq: `${S('k', '1')}<i>Φ</i> = konstant (Magnet)`, res: `${ui.fmt(k1, 3)} Vs` });
      if (type === 'fremd') F.push({ eq: `${S('I', 'E')} = ${frac(S('U', 'E'), S('R', 'E') + ' + ' + S('R', 'VE'))} = ${frac(N(p.fieldOn ? p.UE : 0) + ' V', N(p.RE + p.RVE) + ' Ω')}`, res: `${ui.fmt(m.fieldSteady())} A`, note: Math.abs(o.IE - m.fieldSteady()) > 0.02 * ref.IEN ? `momentan ${ui.fmt(o.IE)} A – das Feld folgt mit ${S('τ', 'E')} = ${S('L', 'E')}/${S('R', 'E')} = ${ui.fmt(p.LE / (p.RE + p.RVE), 2)} s` : '' });
      if (type === 'neben') F.push({ eq: `${S('I', 'E')} = ${frac(S('U'), S('R', 'E') + ' + ' + S('R', 'VE'))} = ${frac(N(o.U) + ' V', N(p.RE + p.RVE) + ' Ω')}`, res: `${ui.fmt(Math.abs(o.U) > 0 ? o.U / (p.RE + p.RVE) : 0)} A` });
      if (hasCurve) {
        const I = type === 'reihen' ? o.IA : o.IE;
        F.push({ eq: `${S('k', '1')}<i>Φ</i> = ${frac(S('U', 'iK') + '(' + (type === 'reihen' ? S('I', 'A') : S('I', 'E')) + ')·60', S('n', 'K'))} = ${frac(N(MS.magnet.UiK(p.curve, I), 1) + ' V · 60', N(p.curve.nK, 0))}`, res: `${ui.fmt(k1, 3)} Vs` });
      }
      F.push({ eq: `${S('U', 'i')} = ${S('k', '1')}<i>Φ</i> · ${frac(S('n'), '60')} = ${N(k1, 3)} Vs · ${frac(N(o.n, 0), '60')}`, res: `${ui.fmt(o.Ui)} V` });
      const R = m.rArm();
      const rName = type === 'reihen' ? S('R', 'i') : S('R', 'A');
      const rText = p.RV > 0 && p.supply === 'source' ? `(${rName} + ${S('R', 'V')})` : rName;
      if (p.supply === 'source') {
        const Istat = (o.U - o.Ui) / R;
        F.push({
          eq: `${S('I', 'A')} = ${frac(S('U') + ' − ' + S('U', 'i'), rText)} = ${frac(N(o.U) + ' − ' + N(o.Ui), N(R, 3))}`,
          res: `${ui.fmt(Istat)} A`,
          note: Math.abs(Istat - o.IA) > 0.03 * D.IN + 0.02 * Math.abs(o.IA) ? `momentan ${ui.fmt(o.IA)} A: ${S('L', 'A')}·d${S('I', 'A')}/d${S('t')} ≠ 0 (Ausgleichsvorgang)` : '',
        });
      } else {
        F.push({ eq: `${S('U')} = −${S('R', 'L')} · ${S('I', 'A')} = −${p.RL >= MS.dc.R_OPEN ? '∞' : N(p.RL)} Ω · ${N(o.IA)} A`, res: `${ui.fmt(o.U)} V` });
      }
      F.push({ eq: `${S('M')} = ${frac(S('k', '1') + '<i>Φ</i>', '2π')} · ${S('I', 'A')} = ${frac(N(k1, 3), '2π')} · ${N(o.IA)} A`, res: `${ui.fmt(o.M)} Nm` });
      if (type !== 'reihen' && p.supply === 'source') {
        const n0 = m.noLoadSpeed();
        F.push({ eq: `${S('n', '0')} = ${frac('60 · ' + S('U'), S('k', '1') + '<i>Φ</i>')} = ${frac('60 · ' + N(p.UA), N(m.c(0, m.fieldSteady()) * MS.TAU, 3))}`, res: Number.isFinite(n0) ? `${ui.fmt(n0, 0)} min⁻¹` : '∞' });
      }
      if (type === 'reihen' && p.supply === 'source' && Math.abs(o.IA) > 0.01) {
        F.push({ eq: `${S('n')} = ${frac('60 · (' + S('U') + ' − ' + S('R', 'i') + S('I', 'A') + ')', S('k', '1') + '<i>Φ</i>(' + S('I', 'A') + ')')} = ${frac('60 · (' + N(o.U) + ' − ' + N(R * o.IA) + ')', N(k1, 3))}`, res: `${ui.fmt((60 * (o.U - R * o.IA)) / k1, 0)} min⁻¹`, note: 'stationäre Drehzahl zum momentanen Strom' });
      }
      const Pm = o.M * o.w;
      F.push({ eq: `${S('P', 'mech')} = ${S('M')} · 2π${frac(S('n'), '60')} = ${N(o.M)} Nm · ${N(o.w, 1)} s⁻¹`, res: `${ui.fmt(Pm)} W` });
      return F;
    };

    // ------------------------------------------------------------ loop
    const sample = (o) => ({ n: o.n, IA: o.IA, IE: o.IE, M: o.M, ML: o.ML + o.MF, Ui: o.Ui, U: o.U });
    const tick = (dt) => {
      if (!st.running || st.destroyed) return;
      const simDt = dt * st.speed;
      const chunks = Math.max(1, Math.min(200, Math.ceil(simDt / (st.window / 700))));
      const h0 = simDt / chunks;
      for (let k = 0; k < chunks; k++) {
        m.advance(h0);
        runner.tick({ m, p, st, sync: syncAll });
        const o = m.outputs();
        scope.push(m.t, sample(o));
        st.trail.push([o.M, o.n, m.t]);
      }
      while (st.trail.length && st.trail[0][2] < m.t - Math.min(st.window, 3)) st.trail.shift();
      if (st.trail.length > 1500) st.trail.splice(0, st.trail.length - 1500);
      if (!m.x.every(Number.isFinite)) {
        m.reset();
        st.destroyed = true;
        banner.hidden = false;
        banner.lastChild.innerHTML = '<b>Die Rechnung ist instabil geworden</b> (extreme Parameter). Die Maschine wurde zurückgesetzt – Parameter prüfen und neu einschalten.';
        return;
      }
      const o = m.outputs();
      const visRate = MS.clamp(o.w * st.speed, -3 * MS.TAU, 3 * MS.TAU);
      st.thetaVis += visRate * dt;
      st.flow += dt;
      if (Math.abs(o.n) > 3.5 * D.nN) {
        st.destroyed = true;
        banner.hidden = false;
        banner.lastChild.innerHTML = `<b>Die Maschine ist durchgegangen.</b> ${S('n')} = ${ui.fmt(o.n, 0)} min⁻¹, mehr als das 3,5-Fache der Nenndrehzahl. In echt würden die Fliehkräfte den Anker zerreißen. Zurücksetzen und Last ankoppeln oder das Feld wiederherstellen.`;
      }
    };

    const render = () => {
      const o = m.outputs();
      const sig = JSON.stringify(p) + m.on + st.view;
      if (sig !== st.sig) { st.sig = sig; st.stat = statics(); }
      const S0 = st.stat;
      const dark = ui.isDark();

      // hero figure
      {
        const { ctx, w, h: hh } = ui.fitCanvas(figCanvas);
        ctx.clearRect(0, 0, w, hh);
        if (MS.art) {
          MS.art.drawDC(ctx, {
            x: 0, y: 0, w, h: hh, dark, type, theta: st.thetaVis,
            ia: o.IA / D.IN, phi: o.k1Phi / ref.k1PhiN, ie: type === 'reihen' ? o.IA / D.IN : o.IE / ref.IEN,
            showForces: true, showFields: true, speed: o.n / ref.n0, torque: o.M / ref.MN,
          });
        }
      }
      // ESB
      {
        const { ctx, w, h: hh } = ui.fitCanvas(esbCanvas);
        ctx.clearRect(0, 0, w, hh);
        if (MS.circuits) {
          MS.circuits.drawDC(ctx, {
            x: 0, y: 0, w, h: hh, dark, flow: st.flow, labels: true,
            type, supply: p.supply, on: m.on, currentLimit: p.currentLimit,
            showRV: p.RV > 0, showRVE: p.RVE > 0, fieldReversed: m.fieldReversed, openLoad: m.openLoad,
            values: { U: o.U, UA: p.UA, IA: o.IA, IE: o.IE, Isup: o.Isup, Ui: o.Ui, UE: p.fieldOn ? p.UE : 0, RA: p.RA, LA: p.LA, RV: p.RV, RE: p.RE, RVE: p.RVE, LE: p.LE, RL: p.RL, n: o.n, M: o.M },
          });
        } else {
          ctx.fillStyle = ui.color('ink-3');
          ctx.font = `13px ${ui.FONT_UI}`;
          ctx.fillText('Ersatzschaltbild wird geladen …', 12, 24);
        }
      }
      // chart
      if (chart) {
        if (st.tab === 'nm') {
          const series = [];
          if (st.pinned) series.push({ points: st.pinned, color: 'ink-3', width: 1.25, dash: [2, 3], name: 'Referenz' });
          series.push({ points: S0.loadPts, color: 'c-ref', width: 1.75, dash: [6, 4], name: 'Last + Reibung', hover: true });
          series.push({ points: S0.curve, color: 'ink', width: 2, name: 'Maschine' });
          series.push({ points: st.trail, color: 'c-m', width: 1.5, alpha: 0.45, hover: false });
          const markers = S0.ops.map((q) => ({ x: q.M, y: q.n, color: 'ink', hollow: !q.stable, r: 5, tip: q.stable ? 'Arbeitspunkt (stabil)' : 'Arbeitspunkt (instabil)' }));
          markers.push({ x: o.M, y: o.n, color: 'c-m', r: 5.5, tip: 'Momentanwert' });
          const hlines = Number.isFinite(S0.n0) && m.on && p.supply === 'source' ? [{ at: S0.n0, label: 'n₀ ' + ui.fmt(S0.n0, 0), dash: [3, 4] }] : [];
          chart.set({ series, markers, hlines });
        } else if (st.tab === 'mag') {
          const Imax = curveImax();
          const pts = MS.linspace(0, Imax, 160).map((I) => [I, MS.magnet.UiK(p.curve, I)]);
          const I = Math.abs(type === 'reihen' ? o.IA : o.IE);
          chart.set({ series: [{ points: pts, color: 'c-psi', width: 2, name: 'Leerlaufkennlinie' }], markers: [{ x: I, y: MS.magnet.UiK(p.curve, I), color: 'c-m', r: 5.5, tip: 'aktuell' }], hlines: [] });
        } else {
          const n = Math.abs(o.n);
          const se = m.selfExcitation(Math.max(n, 1));
          chart.set({
            series: [
              { points: se.curve.map((q) => [q.I, q.U]), color: 'c-psi', width: 2, name: 'Leerlaufkennlinie bei n' },
              { points: se.line.map((q) => [q.I, q.U]), color: 'c-u', width: 1.75, dash: [6, 4], name: 'Widerstandsgerade' },
            ],
            markers: [
              ...(se.I0 > 0 ? [{ x: se.I0, y: se.U0, color: 'ink', r: 5, tip: 'Endpunkt der Selbsterregung' }] : []),
              { x: Math.abs(o.IE), y: Math.abs(o.Ui), color: 'c-m', r: 5.5, tip: 'Momentanwert' },
            ],
            texts: [{ x: curveImax() * 0.98, y: 1.22 * curveUmax(), text: `n = ${ui.fmt(n, 0)} min⁻¹, R_krit = ${ui.fmt(se.Rcrit, 0)} Ω, Feldkreis ${ui.fmt(se.Rloop, 0)} Ω`, align: 'right', size: 11.5, color: 'ink-2' }],
          });
        }
        chart.render();
      }
      scope.render();

      // DOM text (throttled)
      const now = performance.now();
      if (now - st.lastDom > 90) {
        st.lastDom = now;
        R.n.set(o.n, p.speedMode === 'imposed' ? 'vorgegeben' : `${ui.fmt((o.n / D.nN) * 100, 0)} % von ${S('n', 'N')}`);
        R.M.set(o.M, `Last ${ui.fmt(o.ML)} Nm`);
        R.IA.set(o.IA, `${ui.fmt(Math.abs(o.IA) / D.IN, 2)} × ${S('I', 'N')}`);
        R.Ui.set(o.Ui, `Klemmen ${ui.fmt(o.U)} V`);
        R.IE.set(o.IE, `${S('k', '1')}Φ = ${ui.fmt(o.k1Phi, 2)} Vs`);
        const Pm = o.M * o.w;
        R.P.set(Math.abs(Pm) >= 1000 ? Pm / 1000 : Pm, Pm < 0 ? 'wird mechanisch zugeführt' : 'an den Läufer', Math.abs(Pm) >= 1000 ? 'kW' : 'W');
        const s = status(o);
        pills.replaceChildren(...s.items);
        explain.innerHTML = s.text;
        formulas.set(formulaItems(o));
        const pv = { Pel: o.Pel + o.Pfield, PcuA: -o.PcuA, PcuE: -o.PcuE, Pi: -o.Pi, Pf: -o.MF * o.w, Psh: -(o.M - o.MF) * o.w };
        const kW = Math.max(Math.abs(pv.Pel), Math.abs(pv.Pi)) >= 2000;
        pbars.set(pv, Math.max(ref.PN * 1.5, Math.abs(pv.Pel), Math.abs(pv.Pi)), 'W', (x) => (kW ? `${ui.fmt(x / 1000)} kW` : `${ui.fmt(x, 0)} W`));
        const Pin = Math.max(o.Pel + o.Pfield, 0), Psh = (o.M - o.MF) * o.w;
        let eta = NaN;
        if (Pin > 1 && Psh > 0) eta = Psh / Pin;
        else if (Psh < -1 && o.Pel < 0) eta = -o.Pel / -Psh;
        powerNote.innerHTML = Number.isFinite(eta) ? `Wirkungsgrad ${S('η')} = ${S('P', 'ab')}/${S('P', 'zu')} = ${ui.fmt(eta * 100, 1)} %` : 'Wirkungsgrad: erst im Motor- oder Generatorbetrieb definiert.';
        loadFoot.innerHTML = (MS.loads.TYPES[p.load.type] || {}).hint || '';
      }
    };

    setupChart();
    setWinSel();
    syncAll();

    return {
      el: pg.el,
      tick,
      render,
      destroy: () => { if (chart) chart.destroy(); },
      onTheme: () => { st.sig = ''; },
      debug: { m, st },
    };
  };
})(window);
