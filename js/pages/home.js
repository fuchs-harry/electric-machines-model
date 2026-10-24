/*
 * Start page: what the lab is, the color key, the three modules.
 */
(function (root) {
  'use strict';
  const MS = root.MS;
  const L = MS.L;
  const ui = MS.ui;
  const C = MS.C;
  const { h } = ui;
  const S = (b, s) => `<span class="m">${b}${s ? `<sub>${s}</sub>` : ''}</span>`;

  MS.pages.home = () => {
    let t = 0;
    const heroCanvas = h('canvas', { role: 'img', 'aria-label': L('Animierte Synchronmaschine mit umlaufendem Stromraumzeiger', 'Animated synchronous machine with a rotating current space vector') });
    const arts = [];
    const module = (href, title, text, chips, draw) => {
      const c = h('canvas', { 'aria-hidden': 'true' });
      arts.push({ c, draw });
      return h('a', { class: 'module', href },
        h('div', { class: 'art' }, c),
        h('h2', { text: title }),
        h('p', { html: text }),
        h('ul', {}, ...chips.map((x) => h('li', { html: x }))));
    };

    const key = (q, sym, label) => h('span', {}, h('i', { style: { background: `var(--${ui.Q[q]})` } }), h('span', { html: `${sym} ${label}` }));

    const el = h('div', { class: 'home' },
      h('section', { class: 'home-hero' },
        h('div', {},
          h('h1', { text: L('Maschinen und Antriebe, live gerechnet.', 'Machines and drives, computed live.') }),
          h('p', { html: L('Dreh an Spannung, Fluss und Last und sieh sofort, was Strom, Moment und Drehzahl machen. Jede Kurve, jedes Zeigerbild und jedes Ersatzschaltbild entsteht hier direkt aus den Gleichungen der Vorlesung.',
            'Adjust voltage, flux and load, and see right away what current, torque and speed do. Every curve, every phasor diagram and every equivalent circuit here is computed directly from the equations of the lecture.') }),
          h('div', { class: 'cta' },
            h('a', { class: 'btn primary', href: '#/gsm/pm' }, L('Mit der Gleichstrommaschine starten', 'Start with the DC machine')),
            h('a', { class: 'btn', href: '#/raumzeiger' }, L('Raumzeiger verstehen', 'Understand space vectors')))),
        h('div', { class: 'home-art' }, heroCanvas)),
      h('div', { class: 'legend-strip' },
        h('b', { text: L('Jede Größe hat überall dieselbe Farbe', 'Every quantity has the same color everywhere') }),
        key('U', S('U'), L('Spannung', 'Voltage')), key('I', S('I'), L('Strom', 'Current')), key('PSI', S('Ψ'), L('Fluss', 'Flux')), key('M', S('M'), L('Moment', 'Torque')), key('N', S('n'), L('Drehzahl', 'Speed'))),
      h('section', { class: 'modules' },
        module('#/raumzeiger', L('Raumzeiger & Drehfeld', 'Space vectors & rotating field'),
          L('Aus drei Strangströmen wird ein Pfeil. Drehfeld, Phasenfolge, Strangausfall und das rotorfeste dq-System.',
            'Three phase currents become one arrow. Rotating field, phase sequence, open phase and the rotor-fixed dq frame.'),
          [L('Ortskurve', 'Locus'), L('dq-Transformation', 'dq transformation'), L('Nullsystem', 'Zero sequence'), L('Blockströme', 'Block currents')],
          (ctx, w, hh, tt) => {
            const th = tt * 0.9;
            const ph = [Math.cos(th), Math.cos(th - 2.094), Math.cos(th - 4.189)];
            MS.art.drawPSM(ctx, { x: 0, y: 0, w, h: hh, dark: ui.isDark(), gamma: th - Math.PI / 2, i1: ph[0], i2: ph[1], i3: ph[2], iVec: C.fromPhases(...ph), showAxes: false, labels: false });
          }),
        module('#/gsm/pm', L('Gleichstrommaschine', 'DC machine'),
          L('Permanent-, fremd-, nebenschluss- und reihenschlusserregt: Kennlinie n(M), Anlauf, Feldschwächung, Generatorbetrieb und Selbsterregung.',
            'Permanent magnet, separately excited, shunt-wound and series-wound: the n(M) characteristic, starting, field weakening, generator operation and self-excitation.'),
          [L('n(M)-Kennlinie', 'n(M) characteristic'), L('Ersatzschaltbild', 'Equivalent circuit'), L('Leerlaufkennlinie', 'Magnetization curve'), L('Leistungsbilanz', 'Power balance')],
          (ctx, w, hh, tt) => MS.art.drawDC(ctx, { x: 0, y: 0, w, h: hh, dark: ui.isDark(), type: 'fremd', theta: tt * 0.7, ia: 1, phi: 1, ie: 1, labels: false, showForces: true })),
        module('#/psm/foc', L('Permanentmagnet-Synchronmaschine', 'Permanent-magnet synchronous machine'),
          L('Sinus- und Blockbetrieb, Zeigerdiagramm, Feldschwächung in der Stromebene, Kurzschluss und warum die gesteuerte PSM instabil wird.',
            'Sinusoidal and block operation, phasor diagram, field weakening in the current plane, short circuit, and why the open-loop PMSM becomes unstable.'),
          [L('Zeigerdiagramm', 'Phasor diagram'), L('Stromebene', 'Current plane'), 'BLDC', L('Eigenwerte', 'Eigenvalues')],
          (ctx, w, hh, tt) => {
            const g = tt * 0.7;
            const iv = C.polar(1, g + Math.PI / 2);
            MS.art.drawPSM(ctx, { x: 0, y: 0, w, h: hh, dark: ui.isDark(), gamma: g, i1: C.toPhase(iv, 1), i2: C.toPhase(iv, 2), i3: C.toPhase(iv, 3), iVec: iv, showAxes: false, labels: false, torque: 1 });
          })),
      h('section', { class: 'how' },
        h('div', {}, h('h3', { text: L('Erst tippen, dann starten', 'Predict first, then run') }), h('p', { text: L('Jedes Experiment fragt zuerst nach deiner Vorhersage. Danach läuft der Versuch, und die Auflösung erklärt, was du gesehen hast – mit Zahlen.',
          'Every experiment first asks for your prediction. Then it runs, and the answer explains what you saw – with numbers.') })),
        h('div', {}, h('h3', { text: L('Vergleichen statt auswendig lernen', 'Compare instead of memorizing') }), h('p', { text: L('Halte eine Kennlinie als Referenz fest, ändere Fluss, Widerstand oder Last und sieh, wohin sie sich dreht. Alles läuft in Zeitlupe, wenn du willst.',
          'Pin a characteristic as a reference, change flux, resistance or load, and see which way it turns. Everything runs in slow motion if you want.') })),
        h('div', {}, h('h3', { text: L('Mitrechnen', 'Do the math') }), h('p', { html: L('Die Formelkarte setzt die aktuellen Werte ein. Eine Leerlaufkennlinie aus einer Angabe kannst du als Punkte eintragen und damit rechnen wie in der Prüfung.',
          'The formula card plugs in the live values. You can enter a no-load characteristic from a problem statement as points and calculate with it, just like in the exam.') }))),
      h('p', { class: 'muted', style: { marginTop: '44px', fontSize: '12.5px', maxWidth: '70ch' }, html: L('Die Notation folgt der Vorlesung: Verbraucherzählpfeilsystem, bezogene Größen mit Scheitelwerten als Bezug, Raumzeiger mit dem Faktor ⅔. Die Modelle sind idealisiert (keine Ankerrückwirkung, keine Eisenverluste, ideale Umrichter) – für das Verständnis gemacht, nicht für die Auslegung.',
        'The notation follows the lecture: load reference arrow system (passive sign convention), per-unit quantities referred to peak values, space vectors with the factor ⅔. The models are idealized (no armature reaction, no iron losses, ideal converters) – made for understanding, not for design.') }));

    const render = () => {
      if (!MS.art) return;
      const tt = ui.reducedMotion() ? 0.6 : t;
      {
        const { ctx, w, h: hh } = ui.fitCanvas(heroCanvas);
        ctx.clearRect(0, 0, w, hh);
        const g = tt * 0.6;
        const iv = C.polar(1, g + Math.PI / 2);
        MS.art.drawPSM(ctx, {
          x: 0, y: 0, w, h: hh, dark: ui.isDark(), gamma: g, polePairs: 1,
          i1: C.toPhase(iv, 1), i2: C.toPhase(iv, 2), i3: C.toPhase(iv, 3), iVec: iv,
          psiS: C.add(C.polar(1, g), C.scale(iv, 0.3)), showAxes: true, torque: 1, speed: 0.6,
        });
      }
      for (const a of arts) {
        const { ctx, w, h: hh } = ui.fitCanvas(a.c);
        ctx.clearRect(0, 0, w, hh);
        a.draw(ctx, w, hh, tt);
      }
    };
    return { el, tick: (dt) => { t += dt; }, render };
  };
})(window);
