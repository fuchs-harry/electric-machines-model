/*
 * Raumzeiger & Drehfeld: three phase values → one space vector,
 * x = 2/3 (x1 + x2 e^{j120°} + x3 e^{j240°}), its locus, and the rotor frame.
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
  const { n: N } = shell;
  const PH = ['c-p1', 'c-p2', 'c-p3'];

  const defaults = () => ({
    mode: 'sinus',
    amp: 1, f: 0.25, seq: 1, amp3: 1, shift3: 0, i0: 0, loss3: false,
    m1: 1, m2: -0.5, m3: -0.5, star: true,
    izk: 1, blockHz: 0.5, blockAuto: true, block: 0,
    showDQ: true, dqMode: 'sync', gamma: 30,
  });

  MS.pages.spacevector = () => {
    const p = defaults();
    const st = { running: true, t: 0, trail: [], lastDom: 0, gammaNow: 0 };

    // phase values at electrical angle th (rad)
    const phases = (th) => {
      if (p.mode === 'sinus' && p.loss3) {
        // open phase 3 in star connection without neutral: i2 = −i1
        const v = p.amp * Math.cos(th);
        return [v, -v, 0];
      }
      if (p.mode === 'sinus') {
        const a = p.amp;
        const s = p.seq;
        return [
          a * Math.cos(th) + p.i0,
          a * Math.cos(th - s * (2 * Math.PI) / 3) + p.i0,
          a * p.amp3 * Math.cos(th - s * (4 * Math.PI) / 3 + p.shift3 * MS.DEG) + p.i0,
        ];
      }
      if (p.mode === 'manual') return [p.m1, p.m2, p.star ? -(p.m1 + p.m2) : p.m3];
      const k = p.blockAuto ? ((Math.floor(th / (Math.PI / 3)) % 6) + 6) % 6 : p.block;
      const sig = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]][k];
      return sig.map((x) => x * p.izk);
    };
    const angleNow = () => {
      if (p.mode === 'sinus') return MS.TAU * p.f * st.t;
      if (p.mode === 'block') return MS.TAU * p.blockHz * st.t;
      return 0;
    };

    // ------------------------------------------------------------ page
    const play = ui.button({ icon: 'pause', title: L('Pause', 'Pause') });
    play.addEventListener('click', () => { st.running = !st.running; play.replaceChildren(ui.icon(st.running ? 'pause' : 'play')); });
    const reset = ui.button({ icon: 'reset', title: L('Zeit auf null', 'Reset time to zero'), onClick: () => { st.t = 0; st.trail = []; } });
    const modeSeg = ui.seg({
      options: [{ value: 'sinus', label: L('Sinus', 'Sine') }, { value: 'manual', label: L('Manuell', 'Manual') }, { value: 'block', label: L('Block', 'Block') }],
      get: () => p.mode, set: (v) => { p.mode = v; st.trail = []; syncAll(); }, label: L('Stromform', 'Current waveform'),
    });
    const pg = shell.page({
      title: L('Raumzeiger & Drehfeld', 'Space vectors & rotating field'),
      subtitle: L('Drei Strangströme ergeben einen einzigen Pfeil, den Raumzeiger. Laufen sie sinusförmig, dreht sich der Pfeil – das ist das Drehfeld.',
        'Three phase currents add up to a single arrow, the space vector. When they are sinusoidal, the arrow rotates – that is the rotating field.'),
      controls: [modeSeg.el, play, reset],
    });

    const svCanvas = h('canvas', { role: 'img', 'aria-label': L('Raumzeigerkonstruktion aus drei Strangbeiträgen', 'Space vector constructed from three phase contributions') });
    const R = {
      abs: shell.readout({ label: L('Betrag ', 'Magnitude ') + '|' + S('i') + '|', q: 'I', digits: 3 }),
      ang: shell.readout({ label: L('Winkel ', 'Angle ') + S('φ', 'i'), unit: '°', digits: 1 }),
      i1: shell.readout({ label: L('Strang 1', 'Phase 1'), q: 'P1', digits: 3 }),
      i2: shell.readout({ label: L('Strang 2', 'Phase 2'), q: 'P2', digits: 3 }),
      i3: shell.readout({ label: L('Strang 3', 'Phase 3'), q: 'P3', digits: 3 }),
      dq: shell.readout({ label: S('i', 'd') + ' / ' + S('i', 'q'), q: 'I', digits: 3 }),
    };
    const explain = h('p', { class: 'explain' });
    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-figure' }, svCanvas),
      h('div', { class: 'hero-side' }, h('div', { class: 'readouts' }, R.abs.el, R.ang.el, R.dq.el, R.i1.el, R.i2.el, R.i3.el), h('div', { class: 'status' }, explain)));

    const wfBox = h('div');
    const wf = new ui.Chart(wfBox, {
      x: { label: { sym: 'ω', sub: '', text: 't', unit: '°' }, min: 0, max: 360, fmt: (v) => ui.fmt(v, 0) + '°' },
      y: { label: { sym: 'i', sub: 'k' }, min: -1.6, max: 1.6 },
      height: 230, hover: 'x',
    });
    const wfCard = shell.card({
      title: L('Strangströme über eine Periode', 'Phase currents over one period'), body: [wfBox, h('div', { class: 'legend', html: `<span><i style="color:var(--c-p1)"></i>${S('i', '1')}</span><span><i style="color:var(--c-p2)"></i>${S('i', '2')}</span><span><i style="color:var(--c-p3)"></i>${S('i', '3')}</span><span>${L('senkrechte Linie: jetzt', 'vertical line: now')}</span>` })],
    });

    const machCanvas = h('canvas', { role: 'img', 'aria-label': L('Stator mit den drei Strängen und Läufer im rotorfesten Koordinatensystem', 'Stator with the three phase windings and the rotor in the rotor reference frame') });
    const machBox = h('div', { class: 'chart-box', style: { height: '270px' } }, machCanvas);
    const machCard = shell.card({ title: L('Im Stator', 'In the stator'), hint: L('Spulenseiten mit diesen Strömen, Läufer = d-Achse', 'Coil sides carrying these currents, rotor = d-axis'), body: [machBox] });

    const formulas = shell.formulas();
    const formCard = shell.card({ title: L('Formeln mit aktuellen Werten', 'Formulas with live values'), body: [formulas.el] });

    pg.stage.append(hero, h('div', { class: 'grid-2' }, wfCard, machCard), formCard);

    // ------------------------------------------------------------ inspector
    const vis = (ctrl, fn) => { ctrl._show = fn; return ctrl; };
    const withVis = (g, ctrls) => {
      const sync = g.sync;
      g.sync = () => { sync(); ctrls.forEach((c) => { if (c._show) c.el.hidden = !c._show(); }); };
      return g;
    };
    const sinRows = [
      ui.slider({ label: S('î'), desc: L('Amplitude', 'Amplitude'), min: 0, max: 1.5, step: 0.01, q: 'I', digits: 2, get: () => p.amp, set: (v) => { p.amp = v; } }),
      ui.slider({ label: S('f'), desc: L('Frequenz (Zeitlupe)', 'Frequency (slow motion)'), unit: 'Hz', min: 0.02, max: 2, log: true, digits: 2, get: () => p.f, set: (v) => { p.f = v; } }),
      ui.toggle({ label: L('Strang 3 unterbrochen', 'Phase 3 open'), desc: L('Stern ohne N', 'Star without neutral'), get: () => p.loss3, set: (v) => { p.loss3 = v; st.trail = []; } }),
      ui.segRow({ label: L('Phasenfolge', 'Phase sequence'), options: [{ value: 1, label: '1 – 2 – 3' }, { value: -1, label: '1 – 3 – 2' }], get: () => p.seq, set: (v) => { p.seq = v; st.trail = []; } }),
      ui.slider({ label: S('î', '3') + '/' + S('î'), desc: L('Unsymmetrie', 'Unbalance'), unit: '×', min: 0, max: 1.5, step: 0.01, digits: 2, get: () => p.amp3, set: (v) => { p.amp3 = v; st.trail = []; } }),
      ui.slider({ label: 'Δ' + S('φ', '3'), desc: L('Versatz Strang 3', 'Phase 3 shift'), unit: '°', min: -90, max: 90, step: 1, digits: 0, get: () => p.shift3, set: (v) => { p.shift3 = v; st.trail = []; } }),
      ui.slider({ label: S('i', '0'), desc: L('Nullsystem', 'Zero-sequence component'), min: -0.6, max: 0.6, step: 0.01, digits: 2, get: () => p.i0, set: (v) => { p.i0 = v; } }),
    ].map((c) => vis(c, () => p.mode === 'sinus'));
    const manRows = [
      ui.slider({ label: S('i', '1'), desc: L('Strang 1', 'Phase 1'), min: -1.5, max: 1.5, step: 0.01, q: 'P1', digits: 2, get: () => p.m1, set: (v) => { p.m1 = v; } }),
      ui.slider({ label: S('i', '2'), desc: L('Strang 2', 'Phase 2'), min: -1.5, max: 1.5, step: 0.01, q: 'P2', digits: 2, get: () => p.m2, set: (v) => { p.m2 = v; } }),
      ui.toggle({ label: L('Ohne Sternpunktleiter', 'No neutral conductor'), desc: S('i', '3') + ' = −' + S('i', '1') + ' − ' + S('i', '2'), get: () => p.star, set: (v) => { p.star = v; syncAll(); } }),
    ].map((c) => vis(c, () => p.mode === 'manual'));
    const cM3 = vis(ui.slider({ label: S('i', '3'), desc: L('Strang 3', 'Phase 3'), min: -1.5, max: 1.5, step: 0.01, q: 'P3', digits: 2, get: () => p.m3, set: (v) => { p.m3 = v; } }), () => p.mode === 'manual' && !p.star);
    const blkRows = [
      ui.slider({ label: S('i', 'ZK'), desc: L('Zwischenkreisstrom', 'DC-link current'), min: 0, max: 1.5, step: 0.01, q: 'I', digits: 2, get: () => p.izk, set: (v) => { p.izk = v; } }),
      ui.toggle({ label: L('Automatisch weiterschalten', 'Commutate automatically'), get: () => p.blockAuto, set: (v) => { p.blockAuto = v; syncAll(); } }),
    ].map((c) => vis(c, () => p.mode === 'block'));
    const cBhz = vis(ui.slider({ label: L('Takt', 'Rate'), desc: L('Umdrehungen pro Sekunde', 'Revolutions per second'), unit: 'Hz', min: 0.05, max: 2, log: true, digits: 2, get: () => p.blockHz, set: (v) => { p.blockHz = v; } }), () => p.mode === 'block' && p.blockAuto);
    const cBlk = vis(ui.segRow({ label: L('Stromrichtung', 'Current direction'), options: MS.psm.BLOCKS.map((b, i) => ({ value: i, label: b.name })), get: () => p.block, set: (v) => { p.block = v; } }), () => p.mode === 'block' && !p.blockAuto);
    const srcRows = [...sinRows, ...manRows, cM3, ...blkRows, cBhz, cBlk];
    const gSrc = withVis(ui.group({ title: L('Strangströme', 'Phase currents'), rows: srcRows, foot: L('Bezogene Werte: Amplitude 1 entspricht dem Scheitelwert des Nennstroms.', 'Per-unit values: amplitude 1 corresponds to the peak value of the rated current.') }), srcRows);
    const dqRows = [
      ui.toggle({ label: L('Rotorfestes KOS zeigen', 'Show rotor reference frame'), get: () => p.showDQ, set: (v) => { p.showDQ = v; syncAll(); } }),
      vis(ui.segRow({ label: L('d-Achse', 'd-axis'), options: [{ value: 'sync', label: L('dreht synchron mit', 'rotating synchronously') }, { value: 'fixed', label: L('fest', 'fixed') }], get: () => p.dqMode, set: (v) => { p.dqMode = v; syncAll(); } }), () => p.showDQ),
    ];
    const cGam = vis(ui.slider({ label: S('γ', 'm'), desc: L('Lage der d-Achse', 'Position of the d-axis'), unit: '°', min: -180, max: 180, step: 1, digits: 0, get: () => p.gamma, set: (v) => { p.gamma = v; } }), () => p.showDQ);
    dqRows.push(cGam);
    const gDQ = withVis(ui.group({ title: L('Rotorfestes Koordinatensystem', 'Rotor reference frame'), rows: dqRows, foot: S('i', 'dq') + ' = ' + S('i', 'αβ') + '·e<sup>−j' + S('γ', 'm') + '</sup>. ' + L('Dreht die d-Achse synchron mit, stehen die Zeiger still.', 'If the d-axis rotates synchronously, the vectors stand still.') }), dqRows);

    const runner = shell.runner({
      getTime: () => st.t,
      prepare: (exp) => {
        Object.assign(p, defaults());
        exp.setup(p);
        st.t = 0;
        st.trail = [];
        st.running = true;
        syncAll();
      },
    });
    const expEl = shell.experiments(EXPERIMENTS, runner);
    const insp = shell.inspector(pg.inspector, { groups: [gSrc, gDQ], experiments: expEl });
    const syncAll = () => { insp.sync(); modeSeg.sync(); };

    // ------------------------------------------------------------ drawing
    const drawSV = (o) => {
      const { ctx, w, h: hh } = ui.fitCanvas(svCanvas);
      ctx.clearRect(0, 0, w, hh);
      const cx = w / 2, cy = hh / 2;
      const R0 = Math.min(w, hh) / 2 - 26;
      const k = R0 / 1.7;
      const X = (z) => cx + z.re * k, Y = (z) => cy - z.im * k;
      // rings
      ctx.strokeStyle = ui.color('grid');
      ctx.lineWidth = 1;
      for (const r of [0.5, 1, 1.5]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, MS.TAU); ctx.stroke(); }
      ctx.fillStyle = ui.color('ink-3');
      ctx.font = `10.5px ${ui.FONT_UI}`;
      ctx.textAlign = 'left';
      ctx.fillText('1', cx + k + 3, cy - 4);
      // phase axes
      for (let q = 0; q < 3; q++) {
        const a = (q * 2 * Math.PI) / 3;
        const ex = Math.cos(a), ey = Math.sin(a);
        ctx.strokeStyle = ui.withAlpha(ui.color(PH[q]), 0.55);
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + ex * R0, cy - ey * R0); ctx.stroke();
        ctx.strokeStyle = ui.color('grid');
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - ex * R0 * 0.6, cy + ey * R0 * 0.6); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ui.color('ink-2');
        ctx.font = `600 12px ${ui.FONT_UI}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(q + 1), cx + ex * (R0 + 12), cy - ey * (R0 + 12) + 4);
      }
      // dq axes
      if (p.showDQ) {
        const g = o.gamma;
        for (const [ang, lbl] of [[g, 'd'], [g + Math.PI / 2, 'q']]) {
          ctx.strokeStyle = ui.color('ink-2');
          ctx.lineWidth = 1.25;
          ctx.beginPath(); ctx.moveTo(cx - Math.cos(ang) * R0, cy + Math.sin(ang) * R0); ctx.lineTo(cx + Math.cos(ang) * R0, cy - Math.sin(ang) * R0); ctx.stroke();
          ui.drawLabel(ctx, { sym: lbl }, cx + Math.cos(ang) * (R0 - 4) + 6, cy - Math.sin(ang) * (R0 - 4) - 4, { size: 13, color: ui.color('ink') });
        }
        // projections
        const tip = o.iv;
        const dHat = C.polar(1, g), qHat = C.polar(1, g + Math.PI / 2);
        const pd = C.scale(dHat, o.id), pq = C.scale(qHat, o.iq);
        ctx.strokeStyle = ui.color('ink-3');
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(X(tip), Y(tip)); ctx.lineTo(X(pd), Y(pd)); ctx.moveTo(X(tip), Y(tip)); ctx.lineTo(X(pq), Y(pq)); ctx.stroke();
        ctx.setLineDash([]);
      }
      // locus (trail)
      if (st.trail.length > 2) {
        ctx.strokeStyle = ui.withAlpha(ui.color('c-i'), 0.28);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        st.trail.forEach((z, i) => (i ? ctx.lineTo(X(z), Y(z)) : ctx.moveTo(X(z), Y(z))));
        ctx.stroke();
      }
      // contributions tip to tail
      let base = C(0, 0);
      for (let q = 0; q < 3; q++) {
        const c = C.polar((2 / 3) * o.ph[q], (q * 2 * Math.PI) / 3);
        const end = C.add(base, c);
        const len = C.abs(c) * k;
        if (len > 1) {
          ctx.strokeStyle = ui.color(PH[q]);
          ctx.fillStyle = ui.color(PH[q]);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(X(base), Y(base)); ctx.lineTo(X(end), Y(end)); ctx.stroke();
          ui.arrowHead(ctx, X(base), Y(base), X(end), Y(end), Math.min(8, len * 0.4));
          const mid = C.scale(C.add(base, end), 0.5);
          const nrm = C.scale(C.polar(1, C.arg(c) + Math.PI / 2), 12 / k);
          ctx.fillStyle = ui.color('ink-2');
          ctx.font = `600 11px ${ui.FONT_UI}`;
          ctx.textAlign = 'center';
          ctx.fillText(String(q + 1), X(C.add(mid, nrm)), Y(C.add(mid, nrm)) + 4);
        }
        base = end;
      }
      // resultant
      const iv = o.iv;
      const lenI = C.abs(iv) * k;
      if (lenI > 1) {
        ctx.strokeStyle = ui.color('c-i');
        ctx.fillStyle = ui.color('c-i');
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        const hd = Math.min(12, lenI * 0.4);
        const kk = (lenI - hd * 0.8) / lenI;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (X(iv) - cx) * kk, cy + (Y(iv) - cy) * kk); ctx.stroke();
        ui.arrowHead(ctx, cx, cy, X(iv), Y(iv), hd);
        const lab = C.scale(iv, 1 + 16 / Math.max(lenI, 1));
        ui.drawLabel(ctx, { sym: 'i' }, X(lab), Y(lab) + 5, { size: 15, align: 'center', color: ui.color('ink') });
      } else {
        ctx.fillStyle = ui.color('c-i');
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, MS.TAU); ctx.fill();
      }
    };

    // ------------------------------------------------------------ loop
    const compute = () => {
      const th = angleNow();
      const ph = phases(th);
      const iv = C.fromPhases(ph[0], ph[1], ph[2]);
      let gamma = p.gamma * MS.DEG;
      if (p.dqMode === 'sync' && p.showDQ) gamma = p.mode === 'sinus' ? p.seq * th + p.gamma * MS.DEG : p.mode === 'block' && p.blockAuto ? th + p.gamma * MS.DEG : p.gamma * MS.DEG;
      const dq = C.rot(iv, -gamma);
      return { th, ph, iv, gamma, id: dq.re, iq: dq.im, i0: (ph[0] + ph[1] + ph[2]) / 3 };
    };
    const tick = (dt) => {
      if (!st.running) return;
      st.t += dt;
      runner.tick({ p, st, sync: syncAll });
      const o = compute();
      st.trail.push(o.iv);
      if (st.trail.length > 600) st.trail.shift();
    };

    const explainText = (o) => {
      const absI = C.abs(o.iv);
      if (p.mode === 'manual') {
        if (absI < 1e-3) return L('Die drei Beiträge heben sich auf: kein resultierendes Feld. Gleiche Ströme in allen Strängen (Nullsystem) erzeugen keinen Raumzeiger.',
          'The three contributions cancel out: no resulting field. Equal currents in all phases (zero-sequence component) produce no space vector.');
        const dirDeg = ui.fmt(C.arg(o.iv) / MS.DEG, 0);
        return L(`Konstante Ströme heißt: der Pfeil steht still. Das Feld zeigt in Richtung ${dirDeg}° – ein Rotor mit Magnet würde sich dorthin drehen.`,
          `Constant currents mean the arrow stands still. The field points towards ${dirDeg}° – a rotor with a magnet would turn to face that way.`);
      }
      if (p.mode === 'block') return L(`Blockstrom: nur zwei Stränge führen Strom, der dritte ist offen. Der Pfeil kann nur sechs Richtungen im Abstand von 60° annehmen und springt. Seine Länge ist ${S('i', 'ZK')}·2/√3 = ${ui.fmt(absI, 3)}.`,
        `Block current: only two phases carry current, the third is open. The arrow can only take six directions 60° apart, and it jumps between them. Its length is ${S('i', 'ZK')}·2/√3 = ${ui.fmt(absI, 3)}.`);
      if (p.amp < 1e-3) return L('Ohne Strom kein Feld.', 'No current, no field.');
      if (p.loss3) return L(`Strang 3 ist offen, also ${S('i', '2')} = −${S('i', '1')}: Die Ortskurve wird zur Geraden. Statt eines Drehfelds gibt es nur ein Wechselfeld, das in einer Richtung pulsiert – ein Motor läuft so nicht von selbst an.`,
        `Phase 3 is open, so ${S('i', '2')} = −${S('i', '1')}: the locus becomes a straight line. Instead of a rotating field there is only an alternating field that pulsates along one direction – a motor will not start by itself like this.`);
      if (Math.abs(p.amp3 - 1) > 0.02 || Math.abs(p.shift3) > 0.5) return L('Unsymmetrie: Der Pfeil ändert beim Umlauf seine Länge, die Ortskurve ist eine Ellipse. Mathematisch ist das ein Mitsystem plus ein kleineres, rückwärts drehendes Gegensystem.',
        'Unbalance: the arrow changes its length as it rotates, and the locus is an ellipse. Mathematically this is a positive-sequence system plus a smaller negative-sequence system rotating backwards.');
      const dir = p.seq > 0 ? L('gegen den Uhrzeigersinn (mathematisch positiv)', 'counterclockwise (mathematically positive)') : L('im Uhrzeigersinn – zwei Phasen getauscht, das Feld läuft rückwärts', 'clockwise – two phases are swapped, so the field runs backwards');
      let t = L(`Symmetrische Sinusströme: Der Pfeil hat konstante Länge ${ui.fmt(absI, 3)} und dreht sich ${dir}. Das ist das Drehfeld.`,
        `Balanced sinusoidal currents: the arrow has a constant length of ${ui.fmt(absI, 3)} and rotates ${dir}. That is the rotating field.`);
      if (Math.abs(p.i0) > 0.005) t += L(` Das Nullsystem ${S('i', '0')} = ${ui.fmt(p.i0, 2)} ändert die Strangströme, aber nicht den Raumzeiger.`,
        ` The zero-sequence component ${S('i', '0')} = ${ui.fmt(p.i0, 2)} changes the phase currents but not the space vector.`);
      if (p.showDQ && p.dqMode === 'sync') t += L(` Im mitdrehenden dq-System stehen ${S('i', 'd')} und ${S('i', 'q')} still – aus Sinusgrößen werden Konstanten.`,
        ` In the rotating dq frame, ${S('i', 'd')} and ${S('i', 'q')} stand still – sinusoidal quantities become constants.`);
      return t;
    };

    const formulaItems = (o) => {
      const [a, b, c] = o.ph;
      const P = (v) => (v < 0 ? `(${N(v, 3)})` : N(v, 3));
      const F = [
        { eq: `${S('i')} = ⅔·(${S('i', '1')} + ${S('i', '2')}·e<sup>j120°</sup> + ${S('i', '3')}·e<sup>j240°</sup>) = ⅔·(${N(a, 3)} + ${P(b)}·e<sup>j120°</sup> + ${P(c)}·e<sup>j240°</sup>)`, res: `${ui.fmt(C.abs(o.iv), 3)}∠${ui.fmt(C.arg(o.iv) / MS.DEG, 1)}°` },
        { eq: `${S('i', '1')} = Re{${S('i')}},&nbsp; ${S('i', '2')} = Re{${S('i')}·e<sup>−j120°</sup>},&nbsp; ${S('i', '3')} = Re{${S('i')}·e<sup>−j240°</sup>}`, res: `${ui.fmt(C.toPhase(o.iv, 1), 2)} / ${ui.fmt(C.toPhase(o.iv, 2), 2)} / ${ui.fmt(C.toPhase(o.iv, 3), 2)}`, note: Math.abs(o.i0) > 1e-3 ? L(`ohne Nullsystem ${S('i', '0')} = (${S('i', '1')} + ${S('i', '2')} + ${S('i', '3')})/3 = ${ui.fmt(o.i0, 3)} – es steckt nicht im Raumzeiger`, `without the zero-sequence component ${S('i', '0')} = (${S('i', '1')} + ${S('i', '2')} + ${S('i', '3')})/3 = ${ui.fmt(o.i0, 3)} – it is not contained in the space vector`) : L('Rückprojektion: so viel vom Pfeil zeigt in Strangrichtung', 'Back-projection: this much of the arrow points along each phase axis') },
      ];
      if (p.showDQ) F.push({ eq: `${S('i', 'dq')} = ${S('i')}·e<sup>−j${S('γ', 'm')}</sup> = ${ui.fmt(C.abs(o.iv), 3)}∠${ui.fmt(C.arg(o.iv) / MS.DEG, 1)}° · e<sup>−j${ui.fmt(MS.wrap(o.gamma) / MS.DEG, 1)}°</sup>`, res: `${ui.fmt(o.id, 3)} ${o.iq < 0 ? '−' : '+'} j${ui.fmt(Math.abs(o.iq), 3)}` });
      return F;
    };

    const render = () => {
      const o = compute();
      drawSV(o);
      // waveforms over one period
      const g = MS.linspace(0, 360, 241);
      const wave = [[], [], []];
      for (const deg of g) {
        const ph = phases(deg * MS.DEG);
        for (let q = 0; q < 3; q++) wave[q].push([deg, ph[q]]);
      }
      const cur = ((o.th / MS.DEG) % 360 + 360) % 360;
      wf.set({
        series: wave.map((pts, q) => ({ points: pts, color: PH[q], width: 2, name: `i${q + 1}` })),
        vlines: p.mode === 'manual' ? [] : [{ at: cur, dash: [], color: 'ink-2' }],
        markers: p.mode === 'manual' ? [] : o.ph.map((v, q) => ({ x: cur, y: v, color: PH[q], r: 4 })),
      });
      wf.render();
      // machine view
      {
        const { ctx, w, h: hh } = ui.fitCanvas(machCanvas);
        ctx.clearRect(0, 0, w, hh);
        if (MS.art) MS.art.drawPSM(ctx, { x: 0, y: 0, w, h: hh, dark: ui.isDark(), gamma: o.gamma, polePairs: 1, i1: o.ph[0], i2: o.ph[1], i3: o.ph[2], iVec: o.iv, showAxes: true, mode: p.mode === 'block' ? 'bldc' : 'sinus', labels: true });
      }
      const now = performance.now();
      if (now - st.lastDom > 90) {
        st.lastDom = now;
        R.abs.set(C.abs(o.iv), Math.abs(C.abs(o.iv) - 1) < 0.005 ? L('gleich der Amplitude', 'equal to the amplitude') : ' ');
        R.ang.set(C.arg(o.iv) / MS.DEG, L('gegen Strang 1', 'relative to phase 1'));
        R.i1.set(o.ph[0], S('i', '1'));
        R.i2.set(o.ph[1], S('i', '2'));
        R.i3.set(o.ph[2], S('i', '3') + (p.mode === 'manual' && p.star ? ' = −' + S('i', '1') + ' − ' + S('i', '2') : ''));
        R.dq.set(o.id, p.showDQ ? `${S('i', 'q')} = ${ui.fmt(o.iq, 3)}` : L('dq-System aus', 'dq frame off'));
        explain.innerHTML = explainText(o);
        formulas.set(formulaItems(o));
      }
    };

    syncAll();
    return { el: pg.el, tick, render, destroy: () => wf.destroy() };
  };

  const EXPERIMENTS = [
    {
      title: L('Zwei Phasen tauschen', 'Swap two phases'),
      tag: L('Drehrichtung', 'Direction of rotation'),
      question: L('Du vertauschst die Anschlüsse von Strang 2 und 3 (Phasenfolge 1 – 3 – 2). Was macht das Drehfeld?',
        'You swap the connections of phases 2 and 3 (phase sequence 1 – 3 – 2). What does the rotating field do?'),
      choices: [
        L('Es dreht sich gleich weiter', 'It keeps rotating the same way'),
        L('Es dreht sich in die andere Richtung', 'It rotates in the opposite direction'),
        L('Es bleibt stehen', 'It stops'),
      ],
      correct: 1,
      explain: L('Mit der Phasenfolge 1 – 3 – 2 erreicht Strang 3 sein Maximum vor Strang 2 – der Pfeil läuft jetzt im Uhrzeigersinn. So kehrt man bei Drehstrommotoren die Drehrichtung um: zwei Außenleiter tauschen.',
        'With the phase sequence 1 – 3 – 2, phase 3 reaches its maximum before phase 2 – the arrow now runs clockwise. This is how you reverse a three-phase motor: swap two line conductors.'),
      duration: 4, setup: (p) => { p.seq = -1; p.f = 0.4; },
    },
    {
      title: L('Ein Strang fällt aus', 'Open phase'),
      tag: L('Wechselfeld', 'Alternating field'),
      question: L('Strang 3 ist unterbrochen, ohne Sternpunktleiter fließt in 1 und 2 derselbe Strom mit umgekehrtem Vorzeichen. Wie sieht die Ortskurve aus?',
        'Phase 3 is open; without a neutral conductor, phases 1 and 2 carry the same current with opposite sign. What does the locus look like?'),
      choices: [
        L('Ein Kreis, nur kleiner', 'A circle, just smaller'),
        L('Eine Gerade – das Feld pulsiert, statt zu drehen', 'A straight line – the field pulsates instead of rotating'),
        L('Ein Punkt', 'A point'),
      ],
      correct: 1,
      explain: L(`Mit ${S('i', '3')} = 0 und ${S('i', '2')} = −${S('i', '1')} zeigt der Pfeil immer in dieselbe Richtung (−30° bzw. 150°) und ändert nur Länge und Vorzeichen: ein Wechselfeld. Man kann es als zwei gegenläufige Drehfelder halber Amplitude sehen – deshalb läuft ein Motor so nicht von selbst an, dreht aber weiter, wenn er schon läuft.`,
        `With ${S('i', '3')} = 0 and ${S('i', '2')} = −${S('i', '1')}, the arrow always lies on the same line (−30° or 150°) and only changes its length and sign: an alternating field. You can view it as two counter-rotating fields of half the amplitude – which is why a motor will not start by itself like this, but keeps turning if it is already running.`),
      duration: 4, setup: (p) => { p.loss3 = true; p.f = 0.4; p.showDQ = false; },
    },
    {
      title: L('Gleiche Ströme in allen Strängen', 'Equal currents in all phases'),
      tag: L('Nullsystem', 'Zero sequence'),
      question: L('Alle drei Stränge führen gleichzeitig denselben Strom von 0,5. Wie groß ist der Raumzeiger?',
        'All three phases carry the same current of 0.5 at the same time. How large is the space vector?'),
      choices: [L('1,5', '1.5'), L('0,5', '0.5'), L('Null', 'Zero')],
      correct: 2,
      explain: L('Drei gleich große Beiträge unter 0°, 120° und 240° heben sich genau auf. Dieses Nullsystem erzeugt kein Drehfeld und taucht im Raumzeiger nicht auf; ohne Sternpunktleiter kann es gar nicht fließen.',
        'Three equal contributions at 0°, 120° and 240° cancel exactly. This zero-sequence component produces no rotating field and does not appear in the space vector; without a neutral conductor it cannot flow at all.'),
      duration: 2, setup: (p) => { p.mode = 'manual'; p.star = false; p.m1 = 0.5; p.m2 = 0.5; p.m3 = 0.5; p.showDQ = false; },
    },
    {
      title: L('Mitfahren auf dem Rotor', 'Riding on the rotor'),
      tag: L('dq-System', 'dq frame'),
      question: L('Symmetrische Sinusströme, das dq-System dreht synchron mit. Wie sehen i<sub>d</sub> und i<sub>q</sub> aus?',
        'Balanced sinusoidal currents, and the dq frame rotates synchronously. What do i<sub>d</sub> and i<sub>q</sub> look like?'),
      choices: [
        L('Wie die Strangströme: sinusförmig', 'Like the phase currents: sinusoidal'),
        L('Konstant – der Zeiger steht im dq-System still', 'Constant – the vector stands still in the dq frame'),
        L('Sie springen', 'They jump'),
      ],
      correct: 1,
      explain: L(`Wer mit dem Rotor mitfährt, sieht den Strompfeil stillstehen: ${S('i', 'd')} und ${S('i', 'q')} sind konstant. Damit werden aus den Differentialgleichungen der Maschine im stationären Betrieb algebraische Gleichungen – der ganze Trick der Raumzeigerrechnung.`,
        `If you ride along with the rotor, the current arrow stands still: ${S('i', 'd')} and ${S('i', 'q')} are constant. In steady state, the machine's differential equations thus become algebraic equations – the whole trick of space vector calculus.`),
      duration: 5, setup: (p) => { p.showDQ = true; p.dqMode = 'sync'; p.gamma = -60; p.f = 0.3; },
    },
    {
      title: L('Blockströme', 'Block currents'),
      tag: 'BLDC',
      question: L('Ein BLDC-Steller schickt (+1, −1, 0). Wohin zeigt der Raumzeiger, und wie lang ist er?',
        'A BLDC controller applies (+1, −1, 0). Where does the space vector point, and how long is it?'),
      choices: [
        L('0°, Länge 1', '0°, length 1'),
        L('−30°, Länge 2/√3 ≈ 1,155', '−30°, length 2/√3 ≈ 1.155'),
        L('−60°, Länge 2', '−60°, length 2'),
      ],
      correct: 1,
      explain: L(`${S('i')} = ⅔(1 − e<sup>j120°</sup>) = ⅔(1,5 − j0,866) = 1,155∠−30°. Zwei Stränge mit ±${S('i', 'k')} geben immer |${S('i')}| = 2/√3·${S('i', 'k')} und Winkel −30° + k·60°. Beim Weiterschalten springt der Pfeil um 60°.`,
        `${S('i')} = ⅔(1 − e<sup>j120°</sup>) = ⅔(1.5 − j0.866) = 1.155∠−30°. Two phases carrying ±${S('i', 'k')} always give |${S('i')}| = 2/√3·${S('i', 'k')} and an angle of −30° + k·60°. At each commutation step the arrow jumps by 60°.`),
      duration: 6, setup: (p) => { p.mode = 'block'; p.blockAuto = true; p.blockHz = 0.25; p.showDQ = false; },
    },
    {
      title: L('Unsymmetrie', 'Unbalance'),
      tag: L('Gegensystem', 'Negative sequence'),
      question: L('Strang 3 führt nur 60 % der Amplitude. Welche Form hat die Ortskurve?',
        'Phase 3 carries only 60% of the amplitude. What shape is the locus?'),
      choices: [L('Ein Kreis', 'A circle'), L('Eine Ellipse', 'An ellipse'), L('Ein Sechseck', 'A hexagon')],
      correct: 1,
      explain: L('Der Pfeil wird beim Umlauf länger und kürzer: eine Ellipse. Zerlegt in symmetrische Komponenten ist das ein Mitsystem (vorwärts) plus ein kleines Gegensystem (rückwärts). Das Gegensystem erzeugt in Maschinen Bremsmomente und Pendelmomente mit doppelter Frequenz.',
        'The arrow grows and shrinks as it rotates: an ellipse. Decomposed into symmetrical components, this is a positive-sequence system (forwards) plus a small negative-sequence system (backwards). In machines, the negative-sequence system produces braking torque and torque pulsations at twice the frequency.'),
      duration: 5, setup: (p) => { p.amp3 = 0.6; p.showDQ = false; p.f = 0.3; },
    },
  ];
})(window);
