/*
 * Start page: what the lab is, the color key, the three modules.
 */
(function (root) {
  'use strict';
  const MS = root.MS;
  const ui = MS.ui;
  const C = MS.C;
  const { h } = ui;
  const S = (b, s) => `<span class="m">${b}${s ? `<sub>${s}</sub>` : ''}</span>`;

  MS.pages.home = () => {
    let t = 0;
    const heroCanvas = h('canvas', { role: 'img', 'aria-label': 'Animierte Synchronmaschine mit umlaufendem Stromraumzeiger' });
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
          h('h1', { text: 'Maschinen und Antriebe, live gerechnet.' }),
          h('p', { html: 'Dreh an Spannung, Fluss und Last und sieh sofort, was Strom, Moment und Drehzahl machen. Jede Kurve, jedes Zeigerbild und jedes Ersatzschaltbild entsteht hier direkt aus den Gleichungen der Vorlesung.' }),
          h('div', { class: 'cta' },
            h('a', { class: 'btn primary', href: '#/gsm/pm' }, 'Mit der Gleichstrommaschine starten'),
            h('a', { class: 'btn', href: '#/raumzeiger' }, 'Raumzeiger verstehen'))),
        h('div', { class: 'home-art' }, heroCanvas)),
      h('div', { class: 'legend-strip' },
        h('b', { text: 'Jede Größe hat überall dieselbe Farbe' }),
        key('U', S('U'), 'Spannung'), key('I', S('I'), 'Strom'), key('PSI', S('Ψ'), 'Fluss'), key('M', S('M'), 'Moment'), key('N', S('n'), 'Drehzahl')),
      h('section', { class: 'modules' },
        module('#/raumzeiger', 'Raumzeiger & Drehfeld',
          'Aus drei Strangströmen wird ein Pfeil. Drehfeld, Phasenfolge, Strangausfall und das rotorfeste dq-System.',
          ['Ortskurve', 'dq-Transformation', 'Nullsystem', 'Blockströme'],
          (ctx, w, hh, tt) => {
            const th = tt * 0.9;
            const ph = [Math.cos(th), Math.cos(th - 2.094), Math.cos(th - 4.189)];
            MS.art.drawPSM(ctx, { x: 0, y: 0, w, h: hh, dark: ui.isDark(), gamma: th - Math.PI / 2, i1: ph[0], i2: ph[1], i3: ph[2], iVec: C.fromPhases(...ph), showAxes: false, labels: false });
          }),
        module('#/gsm/pm', 'Gleichstrommaschine',
          'Permanent-, fremd-, nebenschluss- und reihenschlusserregt: Kennlinie n(M), Anlauf, Feldschwächung, Generatorbetrieb und Selbsterregung.',
          ['n(M)-Kennlinie', 'Ersatzschaltbild', 'Leerlaufkennlinie', 'Leistungsbilanz'],
          (ctx, w, hh, tt) => MS.art.drawDC(ctx, { x: 0, y: 0, w, h: hh, dark: ui.isDark(), type: 'fremd', theta: tt * 0.7, ia: 1, phi: 1, ie: 1, labels: false, showForces: true })),
        module('#/psm/foc', 'Permanentmagnet-Synchronmaschine',
          'Sinus- und Blockbetrieb, Zeigerdiagramm, Feldschwächung in der Stromebene, Kurzschluss und warum die gesteuerte PSM instabil wird.',
          ['Zeigerdiagramm', 'Stromebene', 'BLDC', 'Eigenwerte'],
          (ctx, w, hh, tt) => {
            const g = tt * 0.7;
            const iv = C.polar(1, g + Math.PI / 2);
            MS.art.drawPSM(ctx, { x: 0, y: 0, w, h: hh, dark: ui.isDark(), gamma: g, i1: C.toPhase(iv, 1), i2: C.toPhase(iv, 2), i3: C.toPhase(iv, 3), iVec: iv, showAxes: false, labels: false, torque: 1 });
          })),
      h('section', { class: 'how' },
        h('div', {}, h('h3', { text: 'Erst tippen, dann starten' }), h('p', { text: 'Jedes Experiment fragt zuerst nach deiner Vorhersage. Danach läuft der Versuch, und die Auflösung erklärt, was du gesehen hast – mit Zahlen.' })),
        h('div', {}, h('h3', { text: 'Vergleichen statt auswendig lernen' }), h('p', { text: 'Halte eine Kennlinie als Referenz fest, ändere Fluss, Widerstand oder Last und sieh, wohin sie sich dreht. Alles läuft in Zeitlupe, wenn du willst.' })),
        h('div', {}, h('h3', { text: 'Mitrechnen' }), h('p', { html: 'Die Formelkarte setzt die aktuellen Werte ein. Eine Leerlaufkennlinie aus einer Angabe kannst du als Punkte eintragen und damit rechnen wie in der Prüfung.' }))),
      h('p', { class: 'muted', style: { marginTop: '44px', fontSize: '12.5px', maxWidth: '70ch' }, html: 'Die Notation folgt der Vorlesung: Verbraucherzählpfeilsystem, bezogene Größen mit Scheitelwerten als Bezug, Raumzeiger mit dem Faktor ⅔. Die Modelle sind idealisiert (keine Ankerrückwirkung, keine Eisenverluste, ideale Umrichter) – für das Verständnis gemacht, nicht für die Auslegung.' }));

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
