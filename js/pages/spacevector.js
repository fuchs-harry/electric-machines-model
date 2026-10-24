/*
 * Raumzeiger & Drehfeld: three phase values → one space vector,
 * x = 2/3 (x1 + x2 e^{j120°} + x3 e^{j240°}), its locus, and the rotor frame.
 */
(function (root) {
  'use strict';
  const MS = root.MS;
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
    const play = ui.button({ icon: 'pause', title: 'Pause' });
    play.addEventListener('click', () => { st.running = !st.running; play.replaceChildren(ui.icon(st.running ? 'pause' : 'play')); });
    const reset = ui.button({ icon: 'reset', title: 'Zeit auf null', onClick: () => { st.t = 0; st.trail = []; } });
    const modeSeg = ui.seg({
      options: [{ value: 'sinus', label: 'Sinus' }, { value: 'manual', label: 'Manuell' }, { value: 'block', label: 'Block' }],
      get: () => p.mode, set: (v) => { p.mode = v; st.trail = []; syncAll(); }, label: 'Stromform',
    });
    const pg = shell.page({
      title: 'Raumzeiger & Drehfeld',
      subtitle: 'Drei Strangströme ergeben einen einzigen Pfeil, den Raumzeiger. Laufen sie sinusförmig, dreht sich der Pfeil – das ist das Drehfeld.',
      controls: [modeSeg.el, play, reset],
    });

    const svCanvas = h('canvas', { role: 'img', 'aria-label': 'Raumzeigerkonstruktion aus drei Strangbeiträgen' });
    const R = {
      abs: shell.readout({ label: 'Betrag |' + S('i') + '|', q: 'I', digits: 3 }),
      ang: shell.readout({ label: 'Winkel ' + S('φ', 'i'), unit: '°', digits: 1 }),
      i1: shell.readout({ label: 'Strang 1', q: 'P1', digits: 3 }),
      i2: shell.readout({ label: 'Strang 2', q: 'P2', digits: 3 }),
      i3: shell.readout({ label: 'Strang 3', q: 'P3', digits: 3 }),
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
      title: 'Strangströme über eine Periode', body: [wfBox, h('div', { class: 'legend', html: `<span><i style="color:var(--c-p1)"></i>${S('i', '1')}</span><span><i style="color:var(--c-p2)"></i>${S('i', '2')}</span><span><i style="color:var(--c-p3)"></i>${S('i', '3')}</span><span>senkrechte Linie: jetzt</span>` })],
    });

    const machCanvas = h('canvas', { role: 'img', 'aria-label': 'Stator mit den drei Strängen und Läufer im rotorfesten Koordinatensystem' });
    const machBox = h('div', { class: 'chart-box', style: { height: '270px' } }, machCanvas);
    const machCard = shell.card({ title: 'Im Stator', hint: 'Spulenseiten mit diesen Strömen, Läufer = d-Achse', body: [machBox] });

    const formulas = shell.formulas();
    const formCard = shell.card({ title: 'Formeln mit aktuellen Werten', body: [formulas.el] });

    pg.stage.append(hero, h('div', { class: 'grid-2' }, wfCard, machCard), formCard);

    // ------------------------------------------------------------ inspector
    const vis = (ctrl, fn) => { ctrl._show = fn; return ctrl; };
    const withVis = (g, ctrls) => {
      const sync = g.sync;
      g.sync = () => { sync(); ctrls.forEach((c) => { if (c._show) c.el.hidden = !c._show(); }); };
      return g;
    };
    const sinRows = [
      ui.slider({ label: S('î'), desc: 'Amplitude', min: 0, max: 1.5, step: 0.01, q: 'I', digits: 2, get: () => p.amp, set: (v) => { p.amp = v; } }),
      ui.slider({ label: S('f'), desc: 'Frequenz (Zeitlupe)', unit: 'Hz', min: 0.02, max: 2, log: true, digits: 2, get: () => p.f, set: (v) => { p.f = v; } }),
      ui.toggle({ label: 'Strang 3 unterbrochen', desc: 'Stern ohne N', get: () => p.loss3, set: (v) => { p.loss3 = v; st.trail = []; } }),
      ui.segRow({ label: 'Phasenfolge', options: [{ value: 1, label: '1 – 2 – 3' }, { value: -1, label: '1 – 3 – 2' }], get: () => p.seq, set: (v) => { p.seq = v; st.trail = []; } }),
      ui.slider({ label: S('î', '3') + '/' + S('î'), desc: 'Unsymmetrie', unit: '×', min: 0, max: 1.5, step: 0.01, digits: 2, get: () => p.amp3, set: (v) => { p.amp3 = v; st.trail = []; } }),
      ui.slider({ label: 'Δ' + S('φ', '3'), desc: 'Versatz Strang 3', unit: '°', min: -90, max: 90, step: 1, digits: 0, get: () => p.shift3, set: (v) => { p.shift3 = v; st.trail = []; } }),
      ui.slider({ label: S('i', '0'), desc: 'Nullsystem', min: -0.6, max: 0.6, step: 0.01, digits: 2, get: () => p.i0, set: (v) => { p.i0 = v; } }),
    ].map((c) => vis(c, () => p.mode === 'sinus'));
    const manRows = [
      ui.slider({ label: S('i', '1'), desc: 'Strang 1', min: -1.5, max: 1.5, step: 0.01, q: 'P1', digits: 2, get: () => p.m1, set: (v) => { p.m1 = v; } }),
      ui.slider({ label: S('i', '2'), desc: 'Strang 2', min: -1.5, max: 1.5, step: 0.01, q: 'P2', digits: 2, get: () => p.m2, set: (v) => { p.m2 = v; } }),
      ui.toggle({ label: 'Ohne Sternpunktleiter', desc: S('i', '3') + ' = −' + S('i', '1') + ' − ' + S('i', '2'), get: () => p.star, set: (v) => { p.star = v; syncAll(); } }),
    ].map((c) => vis(c, () => p.mode === 'manual'));
    const cM3 = vis(ui.slider({ label: S('i', '3'), desc: 'Strang 3', min: -1.5, max: 1.5, step: 0.01, q: 'P3', digits: 2, get: () => p.m3, set: (v) => { p.m3 = v; } }), () => p.mode === 'manual' && !p.star);
    const blkRows = [
      ui.slider({ label: S('i', 'ZK'), desc: 'Zwischenkreisstrom', min: 0, max: 1.5, step: 0.01, q: 'I', digits: 2, get: () => p.izk, set: (v) => { p.izk = v; } }),
      ui.toggle({ label: 'Automatisch weiterschalten', get: () => p.blockAuto, set: (v) => { p.blockAuto = v; syncAll(); } }),
    ].map((c) => vis(c, () => p.mode === 'block'));
    const cBhz = vis(ui.slider({ label: 'Takt', desc: 'Umdrehungen pro Sekunde', unit: 'Hz', min: 0.05, max: 2, log: true, digits: 2, get: () => p.blockHz, set: (v) => { p.blockHz = v; } }), () => p.mode === 'block' && p.blockAuto);
    const cBlk = vis(ui.segRow({ label: 'Stromrichtung', options: MS.psm.BLOCKS.map((b, i) => ({ value: i, label: b.name })), get: () => p.block, set: (v) => { p.block = v; } }), () => p.mode === 'block' && !p.blockAuto);
    const srcRows = [...sinRows, ...manRows, cM3, ...blkRows, cBhz, cBlk];
    const gSrc = withVis(ui.group({ title: 'Strangströme', rows: srcRows, foot: 'Bezogene Werte: Amplitude 1 entspricht dem Scheitelwert des Nennstroms.' }), srcRows);
    const dqRows = [
      ui.toggle({ label: 'Rotorfestes KOS zeigen', get: () => p.showDQ, set: (v) => { p.showDQ = v; syncAll(); } }),
      vis(ui.segRow({ label: 'd-Achse', options: [{ value: 'sync', label: 'dreht synchron mit' }, { value: 'fixed', label: 'fest' }], get: () => p.dqMode, set: (v) => { p.dqMode = v; syncAll(); } }), () => p.showDQ),
    ];
    const cGam = vis(ui.slider({ label: S('γ', 'm'), desc: 'Lage der d-Achse', unit: '°', min: -180, max: 180, step: 1, digits: 0, get: () => p.gamma, set: (v) => { p.gamma = v; } }), () => p.showDQ);
    dqRows.push(cGam);
    const gDQ = withVis(ui.group({ title: 'Rotorfestes Koordinatensystem', rows: dqRows, foot: S('i', 'dq') + ' = ' + S('i', 'αβ') + '·e<sup>−j' + S('γ', 'm') + '</sup>. Dreht die d-Achse synchron mit, stehen die Zeiger still.' }), dqRows);

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
      const L = C.abs(iv) * k;
      if (L > 1) {
        ctx.strokeStyle = ui.color('c-i');
        ctx.fillStyle = ui.color('c-i');
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        const hd = Math.min(12, L * 0.4);
        const kk = (L - hd * 0.8) / L;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (X(iv) - cx) * kk, cy + (Y(iv) - cy) * kk); ctx.stroke();
        ui.arrowHead(ctx, cx, cy, X(iv), Y(iv), hd);
        const lab = C.scale(iv, 1 + 16 / Math.max(L, 1));
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
        if (absI < 1e-3) return 'Die drei Beiträge heben sich auf: kein resultierendes Feld. Gleiche Ströme in allen Strängen (Nullsystem) erzeugen keinen Raumzeiger.';
        return `Konstante Ströme heißt: der Pfeil steht still. Das Feld zeigt in Richtung ${ui.fmt(C.arg(o.iv) / MS.DEG, 0)}° – ein Rotor mit Magnet würde sich dorthin drehen.`;
      }
      if (p.mode === 'block') return `Blockstrom: nur zwei Stränge führen Strom, der dritte ist offen. Der Pfeil kann nur sechs Richtungen im Abstand von 60° annehmen und springt. Seine Länge ist ${S('i', 'ZK')}·2/√3 = ${ui.fmt(absI, 3)}.`;
      if (p.amp < 1e-3) return 'Ohne Strom kein Feld.';
      if (p.loss3) return `Strang 3 ist offen, also ${S('i', '2')} = −${S('i', '1')}: Die Ortskurve wird zur Geraden. Statt eines Drehfelds gibt es nur ein Wechselfeld, das in einer Richtung pulsiert – ein Motor läuft so nicht von selbst an.`;
      if (Math.abs(p.amp3 - 1) > 0.02 || Math.abs(p.shift3) > 0.5) return 'Unsymmetrie: Der Pfeil ändert beim Umlauf seine Länge, die Ortskurve ist eine Ellipse. Mathematisch ist das ein Mitsystem plus ein kleineres, rückwärts drehendes Gegensystem.';
      const dir = p.seq > 0 ? 'gegen den Uhrzeigersinn (mathematisch positiv)' : 'im Uhrzeigersinn – zwei Phasen getauscht, das Feld läuft rückwärts';
      let t = `Symmetrische Sinusströme: Der Pfeil hat konstante Länge ${ui.fmt(absI, 3)} und dreht sich ${dir}. Das ist das Drehfeld.`;
      if (Math.abs(p.i0) > 0.005) t += ` Das Nullsystem ${S('i', '0')} = ${ui.fmt(p.i0, 2)} ändert die Strangströme, aber nicht den Raumzeiger.`;
      if (p.showDQ && p.dqMode === 'sync') t += ` Im mitdrehenden dq-System stehen ${S('i', 'd')} und ${S('i', 'q')} still – aus Sinusgrößen werden Konstanten.`;
      return t;
    };

    const formulaItems = (o) => {
      const [a, b, c] = o.ph;
      const P = (v) => (v < 0 ? `(${N(v, 3)})` : N(v, 3));
      const F = [
        { eq: `${S('i')} = ⅔·(${S('i', '1')} + ${S('i', '2')}·e<sup>j120°</sup> + ${S('i', '3')}·e<sup>j240°</sup>) = ⅔·(${N(a, 3)} + ${P(b)}·e<sup>j120°</sup> + ${P(c)}·e<sup>j240°</sup>)`, res: `${ui.fmt(C.abs(o.iv), 3)}∠${ui.fmt(C.arg(o.iv) / MS.DEG, 1)}°` },
        { eq: `${S('i', '1')} = Re{${S('i')}},&nbsp; ${S('i', '2')} = Re{${S('i')}·e<sup>−j120°</sup>},&nbsp; ${S('i', '3')} = Re{${S('i')}·e<sup>−j240°</sup>}`, res: `${ui.fmt(C.toPhase(o.iv, 1), 2)} / ${ui.fmt(C.toPhase(o.iv, 2), 2)} / ${ui.fmt(C.toPhase(o.iv, 3), 2)}`, note: Math.abs(o.i0) > 1e-3 ? `ohne Nullsystem ${S('i', '0')} = (${S('i', '1')} + ${S('i', '2')} + ${S('i', '3')})/3 = ${ui.fmt(o.i0, 3)} – es steckt nicht im Raumzeiger` : 'Rückprojektion: so viel vom Pfeil zeigt in Strangrichtung' },
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
        R.abs.set(C.abs(o.iv), Math.abs(C.abs(o.iv) - 1) < 0.005 ? 'gleich der Amplitude' : ' ');
        R.ang.set(C.arg(o.iv) / MS.DEG, 'gegen Strang 1');
        R.i1.set(o.ph[0], S('i', '1'));
        R.i2.set(o.ph[1], S('i', '2'));
        R.i3.set(o.ph[2], S('i', '3') + (p.mode === 'manual' && p.star ? ' = −' + S('i', '1') + ' − ' + S('i', '2') : ''));
        R.dq.set(o.id, p.showDQ ? `${S('i', 'q')} = ${ui.fmt(o.iq, 3)}` : 'dq-System aus');
        explain.innerHTML = explainText(o);
        formulas.set(formulaItems(o));
      }
    };

    syncAll();
    return { el: pg.el, tick, render, destroy: () => wf.destroy() };
  };

  const EXPERIMENTS = [
    {
      title: 'Zwei Phasen tauschen',
      tag: 'Drehrichtung',
      question: 'Du vertauschst die Anschlüsse von Strang 2 und 3 (Phasenfolge 1 – 3 – 2). Was macht das Drehfeld?',
      choices: ['Es dreht sich gleich weiter', 'Es dreht sich in die andere Richtung', 'Es bleibt stehen'],
      correct: 1,
      explain: 'Mit der Phasenfolge 1 – 3 – 2 erreicht Strang 3 sein Maximum vor Strang 2 – der Pfeil läuft jetzt im Uhrzeigersinn. So kehrt man bei Drehstrommotoren die Drehrichtung um: zwei Außenleiter tauschen.',
      duration: 4, setup: (p) => { p.seq = -1; p.f = 0.4; },
    },
    {
      title: 'Ein Strang fällt aus',
      tag: 'Wechselfeld',
      question: 'Strang 3 ist unterbrochen, ohne Sternpunktleiter fließt in 1 und 2 derselbe Strom mit umgekehrtem Vorzeichen. Wie sieht die Ortskurve aus?',
      choices: ['Ein Kreis, nur kleiner', 'Eine Gerade – das Feld pulsiert, statt zu drehen', 'Ein Punkt'],
      correct: 1,
      explain: `Mit ${S('i', '3')} = 0 und ${S('i', '2')} = −${S('i', '1')} zeigt der Pfeil immer in dieselbe Richtung (−30° bzw. 150°) und ändert nur Länge und Vorzeichen: ein Wechselfeld. Man kann es als zwei gegenläufige Drehfelder halber Amplitude sehen – deshalb läuft ein Motor so nicht von selbst an, dreht aber weiter, wenn er schon läuft.`,
      duration: 4, setup: (p) => { p.loss3 = true; p.f = 0.4; p.showDQ = false; },
    },
    {
      title: 'Gleiche Ströme in allen Strängen',
      tag: 'Nullsystem',
      question: 'Alle drei Stränge führen gleichzeitig denselben Strom von 0,5. Wie groß ist der Raumzeiger?',
      choices: ['1,5', '0,5', 'Null'],
      correct: 2,
      explain: 'Drei gleich große Beiträge unter 0°, 120° und 240° heben sich genau auf. Dieses Nullsystem erzeugt kein Drehfeld und taucht im Raumzeiger nicht auf; ohne Sternpunktleiter kann es gar nicht fließen.',
      duration: 2, setup: (p) => { p.mode = 'manual'; p.star = false; p.m1 = 0.5; p.m2 = 0.5; p.m3 = 0.5; p.showDQ = false; },
    },
    {
      title: 'Mitfahren auf dem Rotor',
      tag: 'dq-System',
      question: 'Symmetrische Sinusströme, das dq-System dreht synchron mit. Wie sehen i<sub>d</sub> und i<sub>q</sub> aus?',
      choices: ['Wie die Strangströme: sinusförmig', 'Konstant – der Zeiger steht im dq-System still', 'Sie springen'],
      correct: 1,
      explain: `Wer mit dem Rotor mitfährt, sieht den Strompfeil stillstehen: ${S('i', 'd')} und ${S('i', 'q')} sind konstant. Damit werden aus den Differentialgleichungen der Maschine im stationären Betrieb algebraische Gleichungen – der ganze Trick der Raumzeigerrechnung.`,
      duration: 5, setup: (p) => { p.showDQ = true; p.dqMode = 'sync'; p.gamma = -60; p.f = 0.3; },
    },
    {
      title: 'Blockströme',
      tag: 'BLDC',
      question: 'Ein BLDC-Steller schickt (+1, −1, 0). Wohin zeigt der Raumzeiger, und wie lang ist er?',
      choices: ['0°, Länge 1', '−30°, Länge 2/√3 ≈ 1,155', '−60°, Länge 2'],
      correct: 1,
      explain: `${S('i')} = ⅔(1 − e<sup>j120°</sup>) = ⅔(1,5 − j0,866) = 1,155∠−30°. Zwei Stränge mit ±${S('i', 'k')} geben immer |${S('i')}| = 2/√3·${S('i', 'k')} und Winkel −30° + k·60°. Beim Weiterschalten springt der Pfeil um 60°.`,
      duration: 6, setup: (p) => { p.mode = 'block'; p.blockAuto = true; p.blockHz = 0.25; p.showDQ = false; },
    },
    {
      title: 'Unsymmetrie',
      tag: 'Gegensystem',
      question: 'Strang 3 führt nur 60 % der Amplitude. Welche Form hat die Ortskurve?',
      choices: ['Ein Kreis', 'Eine Ellipse', 'Ein Sechseck'],
      correct: 1,
      explain: 'Der Pfeil wird beim Umlauf länger und kürzer: eine Ellipse. Zerlegt in symmetrische Komponenten ist das ein Mitsystem (vorwärts) plus ein kleines Gegensystem (rückwärts). Das Gegensystem erzeugt in Maschinen Bremsmomente und Pendelmomente mit doppelter Frequenz.',
      duration: 5, setup: (p) => { p.amp3 = 0.6; p.showDQ = false; p.f = 0.3; },
    },
  ];
})(window);
