/*
 * Guided experiments for the PSM pages. Times (`at`, duration, window) are in
 * normalised time τ = Ω_Bez·t (at 50 Hz: τ = 314 ≙ 1 s).
 */
(function (root) {
  'use strict';
  const MS = root.MS;
  const L = MS.L;
  const S = (b, s) => `<span class="m">${b}${s ? `<sub>${s}</sub>` : ''}</span>`;
  const on = (at = 1) => ({ at, do: ({ m }) => m.switchOn() });

  MS.psmExperiments = {
    foc: [
      {
        title: L('Spannung steigt mit der Last', 'Voltage rises with the load'),
        tag: L('Zeigerbild', 'Phasor diagram'),
        question: L(
          `Die Maschine dreht mit Nenndrehzahl (${S('ω', 'm')} = 1, vom Prüfstand gehalten). Du erhöhst das Moment von 0 auf 1. Was macht die Klemmenspannung |${S('u', 'S')}|?`,
          `The machine runs at rated speed (${S('ω', 'm')} = 1, held by the test bench). You raise the torque from 0 to 1. What happens to the terminal voltage |${S('u', 'S')}|?`),
        choices: [
          L('Sie bleibt bei 1', 'It stays at 1'),
          L('Sie steigt auf etwa 1,09', 'It rises to about 1.09'),
          L('Sie sinkt', 'It drops'),
        ],
        correct: 1,
        watch: L('Im Zeigerdiagramm kippt ψ<sub>S</sub> nach oben, u<sub>S</sub> wird länger.', 'In the phasor diagram, ψ<sub>S</sub> tilts upward and u<sub>S</sub> gets longer.'),
        explain: L(
          `Mit ${S('i', 'd')} = 0 steht der Strom auf der q-Achse. Er erzeugt den Fluss ${S('l', 'S')}·${S('i', 'S')} quer zum Magneten: |${S('ψ', 'S')}| = √(1 + 0,3²) = 1,044. Dazu kommt ${S('r', 'S')}·${S('i', 'S')}: ${S('u', 'S')} = 0,05j + j(1 + 0,3j) = −0,3 + 1,05j, also |${S('u', 'S')}| = 1,092 und cos φ = 0,96. Bei vollem Moment reicht die Nennspannung deshalb nicht ganz bis zur Nenndrehzahl.`,
          `With ${S('i', 'd')} = 0 the current lies on the q axis. It produces the flux ${S('l', 'S')}·${S('i', 'S')} perpendicular to the magnet: |${S('ψ', 'S')}| = √(1 + 0.3²) = 1.044. On top of that comes ${S('r', 'S')}·${S('i', 'S')}: ${S('u', 'S')} = 0.05j + j(1 + 0.3j) = −0.3 + 1.05j, so |${S('u', 'S')}| = 1.092 and cos φ = 0.96. At full torque, the rated voltage is therefore not quite enough to reach rated speed.`),
        duration: 260, speed: 0.25, window: 300,
        setup: (p) => { p.speedMode = 'imposed'; p.wSet = 1; p.ref = 'torque'; p.mRef = 0; p.umax = 1.2; p.loadOn = false; },
        events: [on(), { at: 100, do: ({ p }) => { p.mRef = 1; } }],
      },
      {
        title: L('Ohne Feldschwächung über die Nenndrehzahl?', 'Above rated speed without field weakening?'),
        tag: L('Feldschwächung', 'Field weakening'),
        question: L(
          `${S('u', 'max')} = 1, Strategie ${S('i', 'd')} = 0. Der Drehzahlregler soll auf ${S('ω')} = 1,5 beschleunigen. Schafft er das?`,
          `${S('u', 'max')} = 1, strategy ${S('i', 'd')} = 0. The speed controller is to accelerate to ${S('ω')} = 1.5. Can it get there?`),
        choices: [
          L('Ja, nur etwas langsamer', 'Yes, just a little more slowly'),
          L(`Nein, er bleibt knapp unter ${S('ω')} = 1 hängen`, `No, it gets stuck just below ${S('ω')} = 1`),
          L('Die Maschine wird instabil', 'The machine becomes unstable'),
        ],
        correct: 1,
        watch: L('Die Stromebene: der Spannungskreis schrumpft mit der Drehzahl. Nach τ = 1 400 wird Feldschwächung eingeschaltet.', 'The current plane: the voltage circle shrinks with speed. After τ = 1,400, field weakening is switched on.'),
        explain: L(
          `Bei ${S('i', 'S')} = 0 ist |${S('u', 'S')}| = ${S('ω')}·${S('ψ', 'M')}. Bei ${S('ω')} ≈ 1 ist die Umrichterspannung aufgebraucht, der Strom lässt sich nicht mehr einprägen, das Moment bricht ein. Ein negativer ${S('i', 'd')} wirkt gegen den Magneten, verkleinert |${S('ψ', 'S')}| und damit die nötige Spannung: im zweiten Teil erreicht die Maschine ${S('ω')} = 1,5 – mit Strom, der kein Moment bildet.`,
          `With ${S('i', 'S')} = 0, |${S('u', 'S')}| = ${S('ω')}·${S('ψ', 'M')}. At ${S('ω')} ≈ 1 the inverter voltage is used up: the current can no longer be impressed and the torque collapses. A negative ${S('i', 'd')} opposes the magnet and reduces |${S('ψ', 'S')}|, and with it the voltage required: in the second part the machine reaches ${S('ω')} = 1.5 – with current that produces no torque.`),
        duration: 2600, speed: 1, window: 2600,
        setup: (p) => { p.umax = 1.0; p.idMode = 'zero'; p.ref = 'speed'; p.wRef = 1.5; p.load = { type: 'friction', M0: 0.1, wRef: 1 }; },
        events: [on(), { at: 1400, do: ({ p }) => { p.idMode = 'auto'; } }],
      },
      {
        title: L('Lastsprung im Drehzahlregelkreis', 'Load step in the speed control loop'),
        tag: L('Regelung', 'Control'),
        question: L(
          `Die Maschine hält ${S('ω')} = 0,8 ohne Last. Plötzlich greift eine Hubwerkslast ${S('m', 'L')} = 0,8 an. Was macht die Drehzahl?`,
          `The machine holds ${S('ω')} = 0.8 with no load. Suddenly a hoist load ${S('m', 'L')} = 0.8 is applied. What does the speed do?`),
        choices: [
          L('Sie bleibt exakt gleich', 'It stays exactly the same'),
          L('Sie bricht kurz ein und kehrt dann auf den Sollwert zurück', 'It dips briefly and then returns to the setpoint'),
          L('Sie bleibt dauerhaft niedriger', 'It stays permanently lower'),
        ],
        correct: 1,
        watch: L(`${S('ω')} und ${S('i', 'q')} im Zeitverlauf.`, `${S('ω')} and ${S('i', 'q')} in the time plot.`),
        explain: L(
          `Bis der Regler reagiert, bremst die Last den Rotor (Trägheit ${S('τ', 'm')}). Der P-Anteil erhöht sofort ${S('i', 'q')}, der I-Anteil beseitigt die bleibende Abweichung: nach einem kurzen Einbruch ist ${S('ω')} wieder 0,8, und ${S('m')} = ${S('ψ', 'M')}·${S('i', 'q')} = 0,8 + Reibung.`,
          `Until the controller reacts, the load decelerates the rotor (inertia ${S('τ', 'm')}). The P term raises ${S('i', 'q')} immediately, the I term removes the steady-state error: after a brief dip, ${S('ω')} is back at 0.8, and ${S('m')} = ${S('ψ', 'M')}·${S('i', 'q')} = 0.8 + friction.`),
        duration: 1300, speed: 1, window: 1300,
        setup: (p) => { p.ref = 'speed'; p.wRef = 0.8; p.load = { type: 'hoist', M0: 0.8, wRef: 1 }; p.loadOn = false; },
        events: [on(), { at: 650, do: ({ p }) => { p.loadOn = true; } }],
      },
      {
        title: L('Generatorisch bremsen', 'Regenerative braking'),
        tag: L('Energie', 'Energy'),
        question: L(
          `Die Maschine läuft mit ${S('ω')} = 1. Du senkst den Drehzahlsollwert auf 0,2. Wohin geht die Bewegungsenergie?`,
          `The machine runs at ${S('ω')} = 1. You lower the speed setpoint to 0.2. Where does the kinetic energy go?`),
        choices: [
          L('Sie wird nur in Reibung umgesetzt', 'It is converted into friction only'),
          L(`Zurück in den Umrichter: ${S('p', 'el')} < 0, die Maschine arbeitet als Generator`, `Back into the inverter: ${S('p', 'el')} < 0, the machine operates as a generator`),
          L('In den Magneten', 'Into the magnet'),
        ],
        correct: 1,
        watch: L('Leistungsbilanz und das negative Moment.', 'The power balance and the negative torque.'),
        explain: L(
          `Der Regler stellt ein negatives ${S('i', 'q')} ein, also ${S('m')} < 0 bei ${S('ω')} > 0. Mechanische Leistung ${S('m')}·${S('ω')} < 0 heißt: die Welle liefert Leistung, die Maschine speist über den Umrichter in den Zwischenkreis zurück (abzüglich ${S('r', 'S')}·|${S('i', 'S')}|²). Ohne Rückspeisung bräuchte man einen Bremschopper.`,
          `The controller sets a negative ${S('i', 'q')}, so ${S('m')} < 0 with ${S('ω')} > 0. Mechanical power ${S('m')}·${S('ω')} < 0 means that the shaft delivers power: the machine feeds back through the inverter into the DC link (minus ${S('r', 'S')}·|${S('i', 'S')}|²). Without regeneration you would need a brake chopper.`),
        duration: 1500, speed: 1, window: 1500,
        setup: (p) => { p.ref = 'speed'; p.wRef = 1; p.load = { type: 'friction', M0: 0.1, wRef: 1 }; },
        events: [on(), { at: 700, do: ({ p }) => { p.wRef = 0.2; } }],
      },
    ],

    bldc: [
      {
        title: L('Momentwelligkeit', 'Torque ripple'),
        tag: L('Block', 'Block'),
        question: L(
          `Blockkommutierung mit konstantem Strom (${S('m', 'soll')} = 1) bei kleiner Drehzahl. Wie stark schwankt das Moment?`,
          `Block commutation with constant current (${S('m', 'soll')} = 1) at low speed. How much does the torque fluctuate?`),
        choices: [
          L('Gar nicht', 'Not at all'),
          L('Zwischen etwa 0,87 und 1', 'Between about 0.87 and 1'),
          L('Zwischen 0 und 1', 'Between 0 and 1'),
        ],
        correct: 1,
        watch: L(`${S('m')} im Zeitverlauf und den springenden Strompfeil.`, `${S('m')} in the time plot and the jumping current arrow.`),
        explain: L(
          `Es gibt nur sechs Stromrichtungen A–F im 60°-Raster. Umgeschaltet wird, wenn der Winkel zwischen ${S('i', 'S')} und ${S('ψ', 'M')} unter 60° fällt, danach beträgt er 120°. Der Winkel pendelt also zwischen 60° und 120°, das Moment zwischen sin 60° = 0,87 und 1 (bei 90°). Das hört man als Brummen.`,
          `There are only six current directions A–F on a 60° grid. The logic switches when the angle between ${S('i', 'S')} and ${S('ψ', 'M')} falls below 60°; afterwards it is 120°. So the angle swings between 60° and 120°, and the torque between sin 60° = 0.87 and 1 (at 90°). You can hear this as a hum.`),
        duration: 900, speed: 0.25, window: 600,
        setup: (p) => { p.ref = 'torque'; p.mRef = 1; p.speedMode = 'imposed'; p.wSet = 0.03; },
        events: [on()],
      },
      {
        title: L('Zu früh kommutieren', 'Commutating too early'),
        tag: L('Vorkommutierung', 'Commutation advance'),
        question: L('Die Hall-Sensoren sind um 30° verstellt, es wird 30° zu früh weitergeschaltet. Was passiert mit dem Moment?', 'The Hall sensors are offset by 30°, so the logic switches 30° too early. What happens to the torque?'),
        choices: [
          L('Es steigt', 'It rises'),
          L('Es sinkt, und die Welligkeit wird größer (bis sin 150° = 0,5)', 'It drops, and the ripple gets larger (down to sin 150° = 0.5)'),
          L('Nichts', 'Nothing'),
        ],
        correct: 1,
        watch: L(`${S('m')} zwischen 0,5 und 1.`, `${S('m')} between 0.5 and 1.`),
        explain: L(
          `Jetzt springt der Winkel beim Umschalten von 90° auf 150° und läuft dann zurück: ${S('m')} fällt von 1 auf bis zu sin 150° = 0,5 (weil der Strom eine kurze Anstiegszeit braucht, etwas weniger tief), im Mittel deutlich weniger. Bei hohen Drehzahlen kommutiert man trotzdem etwas früher, weil der Strom wegen ${S('l', 'S')} Zeit zum Umsteuern braucht.`,
          `Now the angle jumps from 90° to 150° at each switch and then runs back: ${S('m')} drops from 1 to as low as sin 150° = 0.5 (slightly less, because the current needs a short rise time), and is clearly lower on average. At high speeds you still commutate somewhat early, because the current needs time to reverse due to ${S('l', 'S')}.`),
        duration: 900, speed: 0.25, window: 600,
        setup: (p) => { p.ref = 'torque'; p.mRef = 1; p.speedMode = 'imposed'; p.wSet = 0.03; p.advance = 30; },
        events: [on()],
      },
      {
        title: L('Welcher Block?', 'Which block?'),
        tag: L('Hall-Sektor', 'Hall sector'),
        question: L(
          `Der Rotor steht bei ${S('γ', 'm')} = 20°. Welche Stromrichtung wählt die Kommutierungslogik für Moment in positiver Richtung?`,
          `The rotor is at ${S('γ', 'm')} = 20°. Which current direction does the commutation logic choose for torque in the positive direction?`),
        choices: [
          L('B (+, 0, −) bei 30°', 'B (+, 0, −) at 30°'),
          L('C (0, +, −) bei 90°', 'C (0, +, −) at 90°'),
          L('D (−, +, 0) bei 150°', 'D (−, +, 0) at 150°'),
        ],
        correct: 1,
        watch: L('Den aktiven Sektor in der Maschine und die Strangströme.', 'The active sector in the machine and the phase currents.'),
        explain: L(
          `Ideal wäre ${S('φ', 'i')} = ${S('γ', 'm')} + 90° = 110°. Die nächste der sechs Richtungen ist C bei 90°: ${S('i', '2')} = +, ${S('i', '3')} = −, Strang 1 stromlos. Moment ${S('m')} = |${S('i', 'S')}|·sin(90° − 20°) = 0,94·|${S('i', 'S')}|. Bei ${S('γ', 'm')} = 30° wäre der Winkel 60°, dann wird auf D weitergeschaltet.`,
          `Ideally ${S('φ', 'i')} = ${S('γ', 'm')} + 90° = 110°. The nearest of the six directions is C at 90°: ${S('i', '2')} = +, ${S('i', '3')} = −, phase 1 carries no current. Torque ${S('m')} = |${S('i', 'S')}|·sin(90° − 20°) = 0.94·|${S('i', 'S')}|. At ${S('γ', 'm')} = 30° the angle would be 60°, and the logic switches on to D.`),
        duration: 150, speed: 0.25, window: 150,
        setup: (p, m) => { p.ref = 'torque'; p.mRef = 1; p.speedMode = 'imposed'; p.wSet = 0; m.x[3] = 20 * MS.DEG; },
        events: [on()],
      },
    ],

    uf: [
      {
        title: L('Schnell an Drehspannung hochziehen', 'Fast run-up on three-phase voltage'),
        tag: L('Anlauf', 'Start-up'),
        question: L(
          `Die Frequenz der Drehspannung wird in 0,8 s von 0 auf ${S('ω', 's')} = 1 gefahren (${S('τ', 'm')} = 500). Läuft der Rotor mit?`,
          `The frequency of the three-phase voltage is ramped from 0 to ${S('ω', 's')} = 1 in 0.8 s (${S('τ', 'm')} = 500). Does the rotor follow?`),
        choices: [
          L('Ja, synchron', 'Yes, synchronously'),
          L('Nein, er bleibt stehen und brummt – großer Strom, Moment pendelt um null', 'No, it stays put and hums – large current, torque oscillating around zero'),
          L('Er läuft rückwärts', 'It runs backwards'),
        ],
        correct: 1,
        watch: L(`${S('ω')} bleibt bei null, |${S('i', 'S')}| ist groß.`, `${S('ω')} stays at zero, |${S('i', 'S')}| is large.`),
        explain: L(
          `Um mitzukommen, müsste der Rotor mit ${S('τ', 'm')}·d${S('ω')}/d${S('τ')} = 500·0,004 = 2 beschleunigt werden – mehr als die Maschine an Moment hergibt. Das Drehfeld läuft davon, das Moment wechselt ständig das Vorzeichen und mittelt sich zu null. Der Strom ist nur durch ${S('l', 'S')} begrenzt (≈ ${S('ψ', 'M')}/${S('l', 'S')}). Eine PSM ohne Dämpferwicklung kann man nicht wie eine Asynchronmaschine direkt ans Netz legen.`,
          `To keep up, the rotor would have to accelerate with ${S('τ', 'm')}·d${S('ω')}/d${S('τ')} = 500·0.004 = 2 – more torque than the machine can deliver. The rotating field runs away, the torque keeps changing sign and averages to zero. The current is limited only by ${S('l', 'S')} (≈ ${S('ψ', 'M')}/${S('l', 'S')}). A PMSM without a damper winding cannot be connected directly to the grid like an induction machine.`),
        duration: 700, speed: 1, window: 700,
        setup: (p) => { p.ufTarget = 1; p.ufRamp = 0.004; p.loadOn = false; },
        events: [on()],
      },
      {
        title: L('Langsam hochfahren – und dann?', 'Slow run-up – and then?'),
        tag: L('Stabilität', 'Stability'),
        question: L('Jetzt wird ganz langsam auf ω<sub>s</sub> = 0,6 hochgefahren (≈ 6 s), ohne Last. Was passiert danach?', 'Now the frequency is ramped up very slowly to ω<sub>s</sub> = 0.6 (≈ 6 s), with no load. What happens afterwards?'),
        choices: [
          L('Sie läuft ruhig weiter', 'It keeps running smoothly'),
          L('Pendelungen schaukeln sich auf, bis die Maschine außer Tritt fällt', 'Oscillations build up until the machine falls out of step'),
          L('Sie bleibt sofort stehen', 'It stops immediately'),
        ],
        correct: 1,
        watch: L('Den Reiter Eigenwerte: oberhalb von ω ≈ 0,2 liegen Pole in der rechten Halbebene.', 'the Eigenvalues tab – above ω ≈ 0.2, poles lie in the right half-plane.'),
        explain: L(
          `Der linearisierte Zustand (${S('i', 'd')}, ${S('i', 'q')}, ${S('ω')}, ${S('ϑ')}) hat bei diesen Parametern für ${S('ω', 's')} ≳ 0,2 ein Eigenwertpaar mit positivem Realteil. Ohne Dämpferwicklung ist die Pendelung schwach angefacht: sie wächst langsam, bis der Polradwinkel über den Kipppunkt läuft. Darum betreibt man PSM geregelt (rotororientiert) statt gesteuert.`,
          `With these parameters, the linearised state (${S('i', 'd')}, ${S('i', 'q')}, ${S('ω')}, ${S('ϑ')}) has a pair of eigenvalues with positive real part for ${S('ω', 's')} ≳ 0.2. Without a damper winding the oscillation is weakly excited: it grows slowly until the load angle passes the pull-out point. That is why PMSMs are operated with closed-loop (rotor-oriented) control rather than open-loop.`),
        duration: 7000, speed: 2, window: 7000, tab: 'eig',
        setup: (p) => { p.ufTarget = 0.6; p.ufRamp = 0.0003; p.loadOn = false; },
        events: [on()],
      },
      {
        title: L('Kippmoment', 'Pull-out torque'),
        tag: L('Polradwinkel', 'Load angle'),
        question: L('Die Maschine läuft bei kleiner Frequenz ω<sub>s</sub> = 0,1 stabil. Die Last wird langsam erhöht. Was passiert beim Kippmoment?', 'The machine runs stably at a low frequency ω<sub>s</sub> = 0.1. The load is slowly increased. What happens at the pull-out torque?'),
        choices: [
          L('Die Drehzahl sinkt etwas, wie bei einem Asynchronmotor', 'The speed drops a little, as with an induction motor'),
          L('Der Polradwinkel läuft über 90° hinaus, die Maschine fällt außer Tritt', 'The load angle runs past 90° and the machine falls out of step'),
          L('Nichts', 'Nothing'),
        ],
        correct: 1,
        watch: L('Den Reiter Polradwinkel: der Punkt wandert zum Maximum.', 'The Load angle tab: the point moves towards the maximum.'),
        explain: L(
          `Synchron heißt: die Drehzahl bleibt exakt ${S('ω', 's')}, nur der Polradwinkel ${S('ϑ')} zwischen Polradspannung j${S('ω')}${S('ψ', 'M')} und Klemmenspannung wächst mit der Last. ${S('m')}(${S('ϑ')}) = A·sin(${S('ϑ')} + ε) − B hat ein Maximum, das Kippmoment (bei ${S('r', 'S')} → 0 genau bei 90°). Darüber gibt es kein Gleichgewicht mehr: der Rotor rutscht durch.`,
          `Synchronous means that the speed stays exactly at ${S('ω', 's')}; only the load angle ${S('ϑ')} between the back EMF j${S('ω')}${S('ψ', 'M')} and the terminal voltage grows with the load. ${S('m')}(${S('ϑ')}) = A·sin(${S('ϑ')} + ε) − B has a maximum, the pull-out torque (for ${S('r', 'S')} → 0 exactly at 90°). Beyond it there is no equilibrium any more: the rotor slips through.`),
        duration: 2400, speed: 1, window: 2400, tab: 'delta',
        setup: (p) => { p.ufTarget = 0.1; p.ufRamp = 0.0005; p.load = { type: 'hoist', M0: 0, wRef: 1 }; p.kuf = 1; p.boost = 0.03; p.kf = 0.02; },
        events: [on(), ...Array.from({ length: 16 }, (_, k) => ({ at: 600 + k * 100, do: ({ p }) => { p.load = { ...p.load, M0: 0.06 * (k + 1) }; } }))],
      },
    ],

    passive: [
      {
        title: L('Dauerkurzschluss', 'Sustained short circuit'),
        tag: L('Kurzschluss', 'Short circuit'),
        question: L(
          `Die Maschine wird mit ${S('ω')} = 1 angetrieben und an den Klemmen kurzgeschlossen (${S('r', 'S')} = 0,05, ${S('l', 'S')} = 0,3). Wie groß wird der Dauerkurzschlussstrom?`,
          `The machine is driven at ${S('ω')} = 1 and its terminals are short-circuited (${S('r', 'S')} = 0.05, ${S('l', 'S')} = 0.3). How large does the sustained short-circuit current become?`),
        choices: [
          L('Unendlich groß', 'Infinitely large'),
          L(`Etwa 3,3 – begrenzt durch die eigene Induktivität (≈ ${S('ψ', 'M')}/${S('l', 'S')})`, `About 3.3 – limited by the machine's own inductance (≈ ${S('ψ', 'M')}/${S('l', 'S')})`),
          L(`Etwa 20 = 1/${S('r', 'S')}`, `About 20 = 1/${S('r', 'S')}`),
        ],
        correct: 1,
        watch: L('Den Strom in der Stromebene: er steht fast gegen den Magneten.', 'The current in the current plane: it points almost against the magnet.'),
        explain: L(
          `${S('i', 'S')} = −j${S('ω')}${S('ψ', 'M')}/(${S('r', 'S')} + j${S('ω')}${S('l', 'S')}) = −3,24 − 0,54j, |${S('i', 'S')}| = 3,29. Der Strom zeigt fast genau gegen ${S('ψ', 'M')}, so dass ${S('ψ', 'S')} fast null wird – die Maschine „schaltet ihren Fluss selbst ab“. Das Moment ${S('m')} = −0,54 bremst. Für ${S('ω')} → ∞ geht ${S('i', 'S')} → −1/${S('l', 'S')}.`,
          `${S('i', 'S')} = −j${S('ω')}${S('ψ', 'M')}/(${S('r', 'S')} + j${S('ω')}${S('l', 'S')}) = −3.24 − 0.54j, |${S('i', 'S')}| = 3.29. The current points almost exactly against ${S('ψ', 'M')}, so ${S('ψ', 'S')} becomes almost zero – the machine “switches off its own flux”. The torque ${S('m')} = −0.54 brakes. For ${S('ω')} → ∞, ${S('i', 'S')} → −1/${S('l', 'S')}.`),
        duration: 260, speed: 0.25, window: 260,
        setup: (p) => { p.speedMode = 'imposed'; p.wSet = 1; p.rL = 0; p.open = false; },
        events: [on(30)],
      },
      {
        title: L('Kurzschlussbremse', 'Short-circuit braking'),
        tag: L('Bremsen', 'Braking'),
        question: L('Die frei laufende Maschine (ω = 1) wird kurzgeschlossen. Wann bremst sie am stärksten?', 'The freely running machine (ω = 1) is short-circuited. When does it brake hardest?'),
        choices: [
          L('Sofort, gleichmäßig bis zum Stillstand', 'Immediately, evenly down to standstill'),
          L(`Bei kleiner Drehzahl, genau bei ${S('ω')} = ${S('r', 'S')}/${S('l', 'S')} ≈ 0,17`, `At low speed, exactly at ${S('ω')} = ${S('r', 'S')}/${S('l', 'S')} ≈ 0.17`),
          L('Gar nicht, der Strom ist zu klein', 'Not at all, the current is too small'),
        ],
        correct: 1,
        watch: L('Die Bremskennlinie m(ω) und den Punkt, der darauf wandert.', 'The braking characteristic m(ω) and the point moving along it.'),
        explain: L(
          `${S('m')} = −${S('ω')}${S('r', 'S')}/(${S('r', 'S')}² + ${S('ω')}²${S('l', 'S')}²). Bei hoher Drehzahl ist der Strom fast rein blindstromartig (d-Achse), das Moment klein. Das Maximum |${S('m')}| = 1/(2${S('l', 'S')}) = 1,67 liegt bei ${S('ω')} = ${S('r', 'S')}/${S('l', 'S')}. Zum Stillstand hin geht es wieder gegen null – eine Kurzschlussbremse hält nicht fest.`,
          `${S('m')} = −${S('ω')}${S('r', 'S')}/(${S('r', 'S')}² + ${S('ω')}²${S('l', 'S')}²). At high speed the current is almost purely reactive (d axis), and the torque is small. The maximum |${S('m')}| = 1/(2${S('l', 'S')}) = 1.67 occurs at ${S('ω')} = ${S('r', 'S')}/${S('l', 'S')}. Towards standstill it falls back to zero – a short-circuit brake cannot hold the shaft.`),
        duration: 2400, speed: 1, window: 2400,
        setup: (p, m) => { p.rL = 0; p.open = true; p.loadOn = false; m.x[2] = 1; },
        events: [on(10), { at: 300, do: ({ p }) => { p.open = false; } }],
      },
      {
        title: L('Leerlaufspannung', 'Open-circuit voltage'),
        tag: L('Generator', 'Generator'),
        question: L(`Klemmen offen, Antrieb mit ${S('ω')} = 0,8. Welche Spannung misst du?`, `Terminals open, driven at ${S('ω')} = 0.8. What voltage do you measure?`),
        choices: [
          '0',
          L(`0,8 = ${S('ω')}·${S('ψ', 'M')}, 90° vor dem Fluss`, `0.8 = ${S('ω')}·${S('ψ', 'M')}, 90° ahead of the flux`),
          L('1, die Nennspannung', '1, the rated voltage'),
        ],
        correct: 1,
        watch: L('Das Zeigerdiagramm: nur ψ<sub>M</sub> und u<sub>S</sub>.', 'The phasor diagram: only ψ<sub>M</sub> and u<sub>S</sub>.'),
        explain: L(
          `Ohne Strom ist ${S('ψ', 'S')} = ${S('ψ', 'M')}. Der Fluss dreht mit ${S('ω')}, deshalb ${S('u', 'S')} = j${S('ω')}${S('ψ', 'M')}: Betrag 0,8 und 90° voraus. Mit |${S('ψ', 'M')}| = 1 liefert die Maschine bei Nenndrehzahl gerade Nennspannung – deshalb steht in fast jeder Angabe |${S('ψ', 'M')}| = 1.`,
          `Without current, ${S('ψ', 'S')} = ${S('ψ', 'M')}. The flux rotates at ${S('ω')}, hence ${S('u', 'S')} = j${S('ω')}${S('ψ', 'M')}: magnitude 0.8 and 90° ahead. With |${S('ψ', 'M')}| = 1 the machine delivers exactly rated voltage at rated speed – that is why almost every problem statement uses |${S('ψ', 'M')}| = 1.`),
        duration: 200, speed: 0.25, window: 200,
        setup: (p) => { p.speedMode = 'imposed'; p.wSet = 0.8; p.open = true; },
        events: [on(10)],
      },
    ],

    dc: [
      {
        title: L('Die Kompassnadel', 'The compass needle'),
        tag: L('Moment', 'Torque'),
        question: L('Du prägst einen konstanten Stromraumzeiger in Richtung 90° ein, der Rotor steht bei 0°. Was macht er?', 'You impress a constant current space vector in the 90° direction; the rotor is at 0°. What does it do?'),
        choices: [
          L('Nichts', 'Nothing'),
          L('Er dreht sich, bis seine d-Achse in Stromrichtung zeigt – und pendelt dabei', 'It turns until its d axis points in the current direction – and oscillates as it does'),
          L('Er dreht dauernd weiter', 'It keeps on rotating'),
        ],
        correct: 1,
        watch: L('Die Maschine und m(γ<sub>m</sub>).', 'The machine and m(γ<sub>m</sub>).'),
        explain: L(
          `${S('m')} = |${S('i', 'S')}|·${S('ψ', 'M')}·sin(${S('φ', 'i')} − ${S('γ', 'm')}): solange der Strom einen q-Anteil relativ zum Rotor hat, gibt es Moment. Bei ${S('γ', 'm')} = ${S('φ', 'i')} ist es null – stabil, denn jede Auslenkung erzeugt ein rückstellendes Moment. Mit wenig Reibung schwingt der Rotor lange um diese Lage. So findet man übrigens bei der Inbetriebnahme die Rotorlage.`,
          `${S('m')} = |${S('i', 'S')}|·${S('ψ', 'M')}·sin(${S('φ', 'i')} − ${S('γ', 'm')}): as long as the current has a q component relative to the rotor, there is torque. At ${S('γ', 'm')} = ${S('φ', 'i')} it is zero – and stable, because every deflection produces a restoring torque. With little friction the rotor oscillates around this position for a long time. Incidentally, this is how the rotor position is found during commissioning.`),
        duration: 1800, speed: 1, window: 1800,
        setup: (p) => { p.dcAngle = 90; p.dcAmp = 1; p.kf = 3; p.loadOn = false; },
        events: [on(20)],
      },
      {
        title: L('Strom gegen den Magneten', 'Current against the magnet'),
        tag: L('Instabil', 'Unstable'),
        question: L('Jetzt zeigt der Strom genau gegen den Magneten (Rotor bei 179°, Strom bei 0°). Bleibt der Rotor stehen?', 'Now the current points exactly against the magnet (rotor at 179°, current at 0°). Does the rotor stay put?'),
        choices: [
          L('Ja, das Moment ist null', 'Yes, the torque is zero'),
          L('Nein, die kleinste Auslenkung lässt ihn umschlagen', 'No, the slightest deflection makes it flip over'),
          L('Er dreht rückwärts weiter', 'It keeps turning backwards'),
        ],
        correct: 1,
        watch: L('Den Rotorwinkel im Verlauf.', 'The rotor angle over time.'),
        explain: L(
          `Bei 180° ist das Moment zwar null, aber jede kleine Abweichung erzeugt ein Moment, das <em>weiter</em> wegdreht – eine instabile Gleichgewichtslage, wie eine verkehrt herum stehende Kompassnadel. Der Rotor schlägt um und pendelt sich bei 0° ein.`,
          `At 180° the torque is zero, but every small deviation produces a torque that turns the rotor <em>further</em> away – an unstable equilibrium, like a compass needle pointing the wrong way round. The rotor flips over and settles at 0°.`),
        duration: 1800, speed: 1, window: 1800,
        setup: (p, m) => { p.dcAngle = 0; p.dcAmp = 1; p.kf = 3; p.loadOn = false; m.x[3] = 179 * MS.DEG; },
        events: [on(20)],
      },
    ],
  };
})(window);
