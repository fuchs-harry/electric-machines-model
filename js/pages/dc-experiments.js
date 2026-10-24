/*
 * Guided experiments for the DC machine page (predict → run → explain).
 * setup(p) edits a fresh default parameter set; events fire at sim time `at` (s).
 */
(function (root) {
  'use strict';
  const MS = root.MS;
  const L = MS.L;
  const S = (b, s) => `<span class="m">${b}${s ? `<sub>${s}</sub>` : ''}</span>`;

  const on = (at = 0.005) => ({ at, do: ({ m }) => m.switchOn() });

  MS.dcExperiments = {
    pm: [
      {
        title: L('Direkt einschalten', 'Direct switch-on'),
        tag: L('Anlauf', 'Starting'),
        question: L(
          `Die Maschine steht. Du legst ohne Vorwiderstand die volle Spannung ${S('U', 'A')} = 48 V an. Wie groß wird der Strom kurz nach dem Einschalten?`,
          `The machine is at standstill. You apply the full voltage ${S('U', 'A')} = 48 V without a series resistor. How large does the current get shortly after switch-on?`),
        choices: L(
          ['Etwa Nennstrom, also 10 A', 'Etwa doppelter Nennstrom, 20 A', 'Weit über 100 A'],
          ['About rated current, i.e. 10 A', 'About twice rated current, 20 A', 'Well over 100 A']),
        correct: 2,
        watch: L(
          `${S('I', 'A')} im Zeitverlauf und der Punkt in der Kennlinie.`,
          `${S('I', 'A')} in the time plot and the point on the characteristic.`),
        explain: L(
          `Im Stillstand ist ${S('U', 'i')} = ${S('k', '1')}Φ·n/60 = 0. Den Strom begrenzt nur ${S('R', 'A')}: ${S('I')} = 48 V / 0,3 Ω = 160 A, das 16-Fache des Nennstroms. Wegen ${S('L', 'A')} wächst er nicht sprunghaft, kommt aber deutlich über 100 A, bevor die steigende Gegenspannung ihn abbaut. Deshalb braucht man Anlasswiderstände oder einen Stromrichter mit Strombegrenzung.`,
          `At standstill ${S('U', 'i')} = ${S('k', '1')}Φ·n/60 = 0. Only ${S('R', 'A')} limits the current: ${S('I')} = 48 V / 0.3 Ω = 160 A, 16 times the rated current. Because of ${S('L', 'A')} it does not jump there at once, but it clearly exceeds 100 A before the rising back EMF brings it down. That is why you need starting resistors or a converter with a current limit.`),
        duration: 0.12, speed: 0.02, window: 0.12,
        setup: (p) => { p.RV = 0; p.currentLimit = false; },
        events: [on()],
      },
      {
        title: L('Strom begrenzen', 'Limiting the current'),
        tag: L('Stromrichter', 'Converter'),
        question: L(
          'Ein Stromrichter hält den Ankerstrom auf höchstens 2·I<sub>N</sub> = 20 A. Wie verändert sich der Hochlauf gegenüber dem Direktstart?',
          'A converter keeps the armature current at no more than 2·I<sub>N</sub> = 20 A. How does the run-up change compared with the direct start?'),
        choices: L(
          ['Er wird kürzer', 'Er dauert länger, dafür bleibt der Strom harmlos', 'Er ändert sich nicht'],
          ['It gets shorter', 'It takes longer, but the current stays harmless', 'It does not change']),
        correct: 1,
        watch: L('Den Drehzahlverlauf: er steigt fast linear.', 'The speed curve: it rises almost linearly.'),
        explain: L(
          `Solange die Begrenzung greift, ist ${S('I', 'A')} = 20 A konstant, also auch das Moment ${S('M')} = ${S('k', '1')}Φ/(2π)·${S('I', 'A')} ≈ 2,3 Nm. Konstantes Beschleunigungsmoment heißt konstante Beschleunigung: die Drehzahl steigt linear. Beim Direktstart war das Moment kurzzeitig viel größer, dafür auch der Strom.`,
          `As long as the limit is active, ${S('I', 'A')} = 20 A is constant, and so is the torque ${S('M')} = ${S('k', '1')}Φ/(2π)·${S('I', 'A')} ≈ 2.3 Nm. Constant accelerating torque means constant acceleration: the speed rises linearly. In the direct start the torque was briefly much larger, but so was the current.`),
        duration: 0.3, speed: 0.05, window: 0.3,
        setup: (p) => { p.currentLimit = true; p.Imax = 20; },
        events: [on()],
      },
      {
        title: L('Last abwerfen', 'Dropping the load'),
        tag: L('Kennlinie', 'Characteristic'),
        question: L(
          'Die Maschine läuft mit Nennmoment. Plötzlich wird die Last abgekuppelt. Wie stark steigt die Drehzahl?',
          'The machine runs at rated torque. Suddenly the load is decoupled. How much does the speed rise?'),
        choices: L(
          ['Kaum, nur um wenige Prozent', 'Etwa auf das Doppelte', 'Immer weiter – sie geht durch'],
          ['Hardly, only by a few percent', 'To about double', 'Without limit – it runs away']),
        correct: 0,
        watch: L('Den Sprung in der Drehzahl nach 0,3 s.', 'The step in speed after 0.3 s.'),
        explain: L(
          `Fluss konstant heißt harte, flache Kennlinie: Δn = ${S('R', 'A')}·${S('I', 'A')}·60/(${S('k', '1')}Φ) = 0,3 Ω · 10 A · 60 / 0,72 Vs = 250 min⁻¹. Von etwa 3 750 auf 4 000 min⁻¹, also rund 6 %. Die Drehzahl hängt fast nur an der Spannung.`,
          `Constant flux means a stiff, flat characteristic: Δn = ${S('R', 'A')}·${S('I', 'A')}·60/(${S('k', '1')}Φ) = 0.3 Ω · 10 A · 60 / 0.72 Vs = 250 min⁻¹. From about 3,750 to 4,000 min⁻¹, so roughly 6 %. The speed depends almost only on the voltage.`),
        duration: 0.6, speed: 0.1, window: 0.6,
        setup: (p) => { p.load = { type: 'friction', M0: 1.146, wRef: p.load.wRef }; },
        events: [on(), { at: 0.3, do: ({ p }) => { p.loadOn = false; } }],
      },
      {
        title: L('Generatorbetrieb', 'Generator operation'),
        tag: L('Vorzeichen', 'Signs'),
        question: L(
          'Die Maschine hängt an 48 V und wird von außen auf 4 500 min⁻¹ angetrieben, schneller als n<sub>0</sub> = 4 000 min⁻¹. Welches Vorzeichen hat der Ankerstrom?',
          'The machine is connected to 48 V and driven externally at 4,500 min⁻¹, faster than n<sub>0</sub> = 4,000 min⁻¹. What sign does the armature current have?'),
        choices: L(
          ['Positiv: sie nimmt Strom auf', 'Negativ: sie speist zurück', 'Null'],
          ['Positive: it draws current', 'Negative: it feeds back', 'Zero']),
        correct: 1,
        watch: L('Die Leistungsbilanz: Pfeile drehen sich um.', 'The power balance: the arrows reverse.'),
        explain: L(
          `${S('U', 'i')} = 0,72 Vs · 4 500/60 = 54 V liegt über der Klemmenspannung. ${S('I', 'A')} = (48 − 54) V / 0,3 Ω = −20 A, das Moment wird negativ (−2,29 Nm, bremst den Antrieb). Elektrisch werden 960 W abgegeben, mechanisch 1 080 W aufgenommen, die Differenz von 120 W heizt ${S('R', 'A')}. Wirkungsgrad 89 %.`,
          `${S('U', 'i')} = 0.72 Vs · 4,500/60 = 54 V is above the terminal voltage. ${S('I', 'A')} = (48 − 54) V / 0.3 Ω = −20 A, and the torque turns negative (−2.29 Nm, braking the drive). 960 W are delivered electrically and 1,080 W absorbed mechanically; the difference of 120 W heats ${S('R', 'A')}. Efficiency 89 %.`),
        duration: 0.35, speed: 0.1, window: 0.35,
        setup: (p) => { p.speedMode = 'imposed'; p.nSet = 4500; },
        events: [on()],
      },
      {
        title: L('Spannung umpolen', 'Reversing the voltage'),
        tag: L('Reversieren', 'Reversing'),
        question: L(
          'Die Maschine läuft mit rund 3 700 min⁻¹. Du polst die Ankerspannung auf −48 V um. Was passiert zuerst?',
          'The machine runs at about 3,700 min⁻¹. You reverse the armature voltage to −48 V. What happens first?'),
        choices: L(
          ['Sie läuft sofort rückwärts', 'Gegenstrombremsung: sehr großer Strom, kräftiges Bremsen, dann Hochlauf in Gegenrichtung', 'Sie bleibt einfach stehen'],
          ['It runs backwards at once', 'Plugging: very large current, hard braking, then run-up in the opposite direction', 'It simply stops']),
        correct: 1,
        watch: L(`Den negativen Stromspitzenwert in ${S('I', 'A')}.`, `The negative current peak in ${S('I', 'A')}.`),
        explain: L(
          `Nach dem Umpolen addieren sich Klemmenspannung und Gegenspannung: ${S('I', 'A')} ≈ (−48 − 46) V / 0,3 Ω ≈ −310 A. Elektrische und mechanische Leistung fließen beide in die Maschine und werden im Anker verheizt (Gegenstrombremsung). Erst nach dem Stillstand läuft sie rückwärts hoch. Ohne Strombegrenzung ist das für Kommutator und Wicklung brutal.`,
          `After the reversal, terminal voltage and back EMF add up: ${S('I', 'A')} ≈ (−48 − 46) V / 0.3 Ω ≈ −310 A. Electrical and mechanical power both flow into the machine and are burned off in the armature (plugging). Only after standstill does it run up in reverse. Without a current limit this is brutal on commutator and winding.`),
        duration: 0.45, speed: 0.05, window: 0.45,
        setup: () => {},
        events: [on(), { at: 0.15, do: ({ p }) => { p.UA = -48; } }],
      },
    ],

    fremd: [
      {
        title: L('Feldschwächung', 'Field weakening'),
        tag: L('Erregung', 'Excitation'),
        question: L(
          `Die Maschine treibt ein konstantes Lastmoment von 10 Nm. Du halbierst den Erregerstrom, indem du ${S('R', 'VE')} = ${S('R', 'E')} = 110 Ω vorschaltest. Was passiert mit der Drehzahl?`,
          `The machine drives a constant load torque of 10 Nm. You halve the field current by adding ${S('R', 'VE')} = ${S('R', 'E')} = 110 Ω in series. What happens to the speed?`),
        choices: L(
          ['Sie halbiert sich', 'Sie bleibt gleich', 'Sie steigt deutlich – wegen der Sättigung aber nicht ganz aufs Doppelte'],
          ['It halves', 'It stays the same', 'It rises clearly – but because of saturation not quite to double']),
        correct: 2,
        watch: L('Die Kennlinie dreht sich: höhere Leerlaufdrehzahl, steiler.', 'The characteristic rotates: higher no-load speed, steeper slope.'),
        explain: L(
          `${S('n', '0')} = 60·${S('U', 'A')}/(${S('k', '1')}Φ): weniger Fluss braucht mehr Drehzahl für dieselbe Gegenspannung. Weil die Leerlaufkennlinie gesättigt ist, sinkt der Fluss bei halbem ${S('I', 'E')} nur von 7,9 auf etwa 4,8 Vs, also steigt ${S('n', '0')} um gut 60 %. Pro Ampere gibt es jetzt weniger Moment: für dieselben 10 Nm fließt deutlich mehr Ankerstrom, und die Kennlinie wird steiler (∝ ${S('R', 'A')}/(${S('k', '1')}Φ)²). Die Erregung folgt mit der Zeitkonstante ${S('L', 'E')}/(${S('R', 'E')} + ${S('R', 'VE')}).`,
          `${S('n', '0')} = 60·${S('U', 'A')}/(${S('k', '1')}Φ): less flux needs more speed for the same back EMF. Because the magnetization curve is saturated, halving ${S('I', 'E')} only lowers the flux from 7.9 to about 4.8 Vs, so ${S('n', '0')} rises by just over 60 %. Each ampere now gives less torque: the same 10 Nm need considerably more armature current, and the characteristic gets steeper (∝ ${S('R', 'A')}/(${S('k', '1')}Φ)²). The excitation follows with the time constant ${S('L', 'E')}/(${S('R', 'E')} + ${S('R', 'VE')}).`),
        duration: 3.5, speed: 0.5, window: 3.5,
        setup: (p) => { p.load = { ...p.load, type: 'friction', M0: 10 }; },
        events: [on(), { at: 1.2, do: ({ p }) => { p.RVE = 110; } }],
      },
      {
        title: L('Anlasswiderstand bemessen', 'Sizing the starting resistor'),
        tag: L('Anlauf', 'Starting'),
        question: L(
          `${S('R', 'A')} = 0,5 Ω, ${S('U', 'A')} = 220 V. Wie groß muss ein Vorwiderstand sein, damit beim Einschalten höchstens 2·${S('I', 'N')} = 40 A fließen?`,
          `${S('R', 'A')} = 0.5 Ω, ${S('U', 'A')} = 220 V. How large must a series resistor be so that no more than 2·${S('I', 'N')} = 40 A flows at switch-on?`),
        choices: L(['Etwa 0,5 Ω', 'Etwa 5 Ω', 'Etwa 50 Ω'], ['About 0.5 Ω', 'About 5 Ω', 'About 50 Ω']),
        correct: 1,
        watch: L('Den Strom beim Einschalten und die weiche Kennlinie mit Vorwiderstand.', 'The current at switch-on and the soft characteristic with the series resistor.'),
        explain: L(
          `Im Stillstand ist ${S('U', 'i')} = 0: ${S('R', 'A')} + ${S('R', 'V')} = 220 V / 40 A = 5,5 Ω, also ${S('R', 'V')} = 5 Ω. Mit Vorwiderstand ist die Kennlinie aber weich (große Drehzahlabsenkung unter Last), deshalb wird er beim Hochlauf stufenweise überbrückt – hier nach 1,5 s auf einmal.`,
          `At standstill ${S('U', 'i')} = 0: ${S('R', 'A')} + ${S('R', 'V')} = 220 V / 40 A = 5.5 Ω, so ${S('R', 'V')} = 5 Ω. With the series resistor, however, the characteristic is soft (large speed drop under load), so it is bypassed in steps during run-up – here all at once after 1.5 s.`),
        duration: 3, speed: 0.5, window: 3,
        setup: (p) => { p.RV = 5; },
        events: [on(), { at: 1.5, do: ({ p }) => { p.RV = 0; } }],
      },
      {
        title: L('Erregung fällt aus', 'Loss of excitation'),
        tag: L('Gefahr', 'Danger'),
        question: L(
          'Die unbelastete Maschine läuft. Plötzlich fällt die Erregerspannung weg. Was passiert?',
          'The machine is running without load. Suddenly the field voltage fails. What happens?'),
        choices: L(
          ['Sie bleibt stehen, weil das Feld fehlt', 'Drehzahl und Ankerstrom steigen stark an', 'Nichts Besonderes'],
          ['It stops because the field is missing', 'Speed and armature current rise sharply', 'Nothing special']),
        correct: 1,
        watch: L(`${S('I', 'E')} klingt ab, ${S('n')} schießt hoch.`, `${S('I', 'E')} decays, ${S('n')} shoots up.`),
        explain: L(
          `Mit dem Fluss verschwindet die Gegenspannung. Der Ankerstrom steigt, und weil noch ein Restfluss da ist, beschleunigt die Maschine immer weiter (${S('n', '0')} = 60·${S('U', 'A')}/(${S('k', '1')}Φ) → ∞). Darum überwacht man den Erregerstrom (Feldausfallschutz) und schaltet die Erregung immer zuerst ein und zuletzt aus.`,
          `With the flux, the back EMF disappears. The armature current rises, and because some residual flux is left, the machine keeps accelerating (${S('n', '0')} = 60·${S('U', 'A')}/(${S('k', '1')}Φ) → ∞). That is why the field current is monitored (field-loss protection) and the excitation is always switched on first and off last.`),
        duration: 3, speed: 0.5, window: 3,
        setup: (p) => { p.loadOn = false; p.curve = { ...p.curve, Urem: 4 }; },
        events: [on(), { at: 1.0, do: ({ p }) => { p.fieldOn = false; } }],
      },
      {
        title: L('Generator auf Widerstand', 'Generator on a resistor'),
        tag: 'Generator',
        question: L(
          `Die Maschine wird mit 1 500 min⁻¹ angetrieben und speist ${S('R', 'L')} = 10 Ω. Welche Klemmenspannung stellt sich ein?`,
          `The machine is driven at 1,500 min⁻¹ and feeds ${S('R', 'L')} = 10 Ω. What terminal voltage results?`),
        choices: L(
          [`Genau ${S('U', 'i')} ≈ 198 V`, 'Etwa 189 V', 'Die Netzspannung 220 V'],
          [`Exactly ${S('U', 'i')} ≈ 198 V`, 'About 189 V', 'The supply voltage of 220 V']),
        correct: 1,
        watch: L('Ersatzschaltbild und Leistungsbilanz.', 'Equivalent circuit and power balance.'),
        explain: L(
          `${S('U', 'i')} = 7,92 Vs · 1 500/60 = 198 V treibt den Strom durch ${S('R', 'A')} + ${S('R', 'L')}: |${S('I', 'A')}| = 198 / 10,5 = 18,9 A. An den Klemmen bleibt ${S('U')} = ${S('R', 'L')}·|${S('I', 'A')}| = 189 V – ein Spannungsteiler aus Innen- und Lastwiderstand.`,
          `${S('U', 'i')} = 7.92 Vs · 1,500/60 = 198 V drives the current through ${S('R', 'A')} + ${S('R', 'L')}: |${S('I', 'A')}| = 198 / 10.5 = 18.9 A. The terminals are left with ${S('U')} = ${S('R', 'L')}·|${S('I', 'A')}| = 189 V – a voltage divider made of internal and load resistance.`),
        duration: 1.2, speed: 0.25, window: 1.2,
        setup: (p) => { p.supply = 'load'; p.RL = 10; p.speedMode = 'imposed'; p.nSet = 1500; },
        events: [on()],
      },
    ],

    neben: [
      {
        title: L('Selbsterregung', 'Self-excitation'),
        tag: 'Generator',
        question: L(
          'Der Nebenschlussgenerator wird mit 1 500 min⁻¹ angetrieben, ohne fremde Spannungsquelle und mit offenen Klemmen. Baut er eine Spannung auf?',
          'The shunt generator is driven at 1,500 min⁻¹, with no external voltage source and with open terminals. Does it build up a voltage?'),
        choices: L(
          ['Nein, ohne Quelle gibt es kein Feld', 'Ja, aus der Remanenz heraus – wenn der Feldkreiswiderstand klein genug ist', 'Nur wenn er vorher als Motor lief'],
          ['No, without a source there is no field', 'Yes, starting from the remanence – if the field circuit resistance is small enough', 'Only if it ran as a motor before']),
        correct: 1,
        watch: L('Den Reiter Selbsterregung: Kennlinie und Widerstandsgerade.', 'The Self-excitation tab: curve and resistance line.'),
        explain: L(
          `Der Restmagnetismus induziert eine kleine Spannung, die einen kleinen Erregerstrom treibt, der den Fluss erhöht, der mehr Spannung induziert … Der Vorgang endet im Schnittpunkt von Leerlaufkennlinie und Widerstandsgerade (${S('R', 'A')} + ${S('R', 'E')} + ${S('R', 'VE')})·${S('I', 'E')}. Ohne Remanenz oder mit zu großem Widerstand (Gerade steiler als die Kennlinie im Ursprung) bleibt die Spannung klein.`,
          `The residual magnetism induces a small voltage, which drives a small field current, which increases the flux, which induces more voltage … The process ends at the intersection of the magnetization curve and the resistance line (${S('R', 'A')} + ${S('R', 'E')} + ${S('R', 'VE')})·${S('I', 'E')}. Without remanence, or with too large a resistance (line steeper than the curve at the origin), the voltage stays small.`),
        duration: 3, speed: 0.5, window: 3, tab: 'self',
        setup: (p) => { p.supply = 'load'; p.RL = MS.dc.R_OPEN; p.speedMode = 'imposed'; p.nSet = 1500; p.curve = { ...p.curve, Urem: 6 }; },
        events: [on()],
      },
      {
        title: L('Kritischer Widerstand', 'Critical resistance'),
        tag: 'Generator',
        question: L(
          `Gleicher Versuch, aber mit ${S('R', 'VE')} = 60 Ω im Feldkreis. Was ändert sich?`,
          `Same experiment, but with ${S('R', 'VE')} = 60 Ω in the field circuit. What changes?`),
        choices: L(
          ['Die Spannung baut sich langsamer, aber voll auf', 'Sie bleibt bei einem kleinen Wert hängen (hier ≈ 25 V statt ≈ 175 V)', 'Sie wird größer'],
          ['The voltage builds up more slowly, but fully', 'It gets stuck at a small value (here ≈ 25 V instead of ≈ 175 V)', 'It gets larger']),
        correct: 1,
        watch: L('Die Widerstandsgerade liegt jetzt über der Kennlinie.', 'The resistance line now lies above the curve.'),
        explain: L(
          `Die Anfangssteigung der Kennlinie bei 1 500 min⁻¹ ist hier ${S('U', 'sat')}/${S('I', 'k')} = 130 Ω, das ist der kritische Widerstand. Mit ${S('R', 'A')} + ${S('R', 'E')} + ${S('R', 'VE')} ≈ 171 Ω ist die Gerade steiler als die Kennlinie: der einzige Schnittpunkt liegt knapp über der Remanenz (≈ 25 V), die Selbsterregung kommt nicht in Gang. Gleiches passiert, wenn die Drehzahl zu klein ist.`,
          `The initial slope of the curve at 1,500 min⁻¹ is ${S('U', 'sat')}/${S('I', 'k')} = 130 Ω here; that is the critical resistance. With ${S('R', 'A')} + ${S('R', 'E')} + ${S('R', 'VE')} ≈ 171 Ω the line is steeper than the curve: the only intersection lies just above the remanence (≈ 25 V), and self-excitation does not get going. The same happens if the speed is too low.`),
        duration: 3, speed: 0.5, window: 3, tab: 'self',
        setup: (p) => { p.supply = 'load'; p.RL = MS.dc.R_OPEN; p.RVE = 60; p.speedMode = 'imposed'; p.nSet = 1500; p.curve = { ...p.curve, Urem: 6 }; },
        events: [on()],
      },
      {
        title: L('Feldsteller im Motorbetrieb', 'Field rheostat in motor operation'),
        tag: L('Drehzahl', 'Speed'),
        question: L(
          `Im Motorbetrieb an 220 V mit 10 Nm Last erhöhst du ${S('R', 'VE')} von 0 auf 110 Ω. Wohin geht die Drehzahl?`,
          `In motor operation at 220 V with a 10 Nm load, you raise ${S('R', 'VE')} from 0 to 110 Ω. Which way does the speed go?`),
        choices: L(['Nach unten', 'Nach oben', 'Sie bleibt'], ['Down', 'Up', 'It stays the same']),
        correct: 1,
        watch: L(`${S('I', 'E')} sinkt, ${S('n')} steigt.`, `${S('I', 'E')} falls, ${S('n')} rises.`),
        explain: L(
          `Wie bei der fremderregten Maschine: der Erregerstrom ${S('I', 'E')} = ${S('U')}/(${S('R', 'E')} + ${S('R', 'VE')}) halbiert sich, der Fluss sinkt (wegen Sättigung weniger als die Hälfte), und die Drehzahl steigt. Ein Vorwiderstand im <em>Feld</em> erhöht also die Drehzahl, einer im <em>Anker</em> senkt sie unter Last.`,
          `As with the separately excited machine: the field current ${S('I', 'E')} = ${S('U')}/(${S('R', 'E')} + ${S('R', 'VE')}) halves, the flux falls (by less than half because of saturation), and the speed rises. So a series resistor in the <em>field</em> raises the speed, while one in the <em>armature</em> lowers it under load.`),
        duration: 3.5, speed: 0.5, window: 3.5,
        setup: (p) => { p.load = { ...p.load, type: 'friction', M0: 10 }; },
        events: [on(), { at: 1.2, do: ({ p }) => { p.RVE = 110; } }],
      },
      {
        title: L('Feldkreis unterbrochen', 'Open field circuit'),
        tag: L('Gefahr', 'Danger'),
        question: L(
          'Bei laufender, unbelasteter Maschine reißt die Leitung zur Erregerwicklung. Was passiert?',
          'While the machine is running without load, the lead to the field winding breaks. What happens?'),
        choices: L(
          ['Sie bleibt stehen', 'Sie geht hoch, nur die Remanenz hält den Fluss', 'Die Drehzahl sinkt leicht'],
          ['It stops', 'It speeds up; only the remanence maintains the flux', 'The speed drops slightly']),
        correct: 1,
        watch: L('Drehzahl und Ankerstrom nach 1 s.', 'Speed and armature current after 1 s.'),
        explain: L(
          `Ohne Erregerstrom bleibt nur der Restfluss. Für die Gegenspannung ${S('U', 'i')} ≈ ${S('U')} müsste die Drehzahl ein Vielfaches werden – die Maschine geht durch, der Ankerstrom steigt stark. Feldkreise werden deshalb nie mit Sicherungen abgesichert.`,
          `Without field current only the residual flux remains. For the back EMF ${S('U', 'i')} ≈ ${S('U')} the speed would have to rise many times over – the machine runs away and the armature current rises sharply. That is why field circuits are never protected with fuses.`),
        duration: 3, speed: 0.5, window: 3,
        setup: (p) => { p.loadOn = false; p.curve = { ...p.curve, Urem: 6 }; },
        events: [on(), { at: 1.0, do: ({ p }) => { p.RVE = 1e5; } }],
      },
    ],

    reihen: [
      {
        title: L('Last abkuppeln', 'Decoupling the load'),
        tag: L('Gefahr', 'Danger'),
        question: L(
          'Die Reihenschlussmaschine läuft unter Last an 220 V. Was passiert, wenn die Last abgekuppelt wird?',
          'The series-wound machine runs under load at 220 V. What happens when the load is decoupled?'),
        choices: L(
          ['Die Drehzahl steigt leicht, wie bei der Nebenschlussmaschine', 'Die Drehzahl steigt immer weiter – sie geht durch', 'Sie bleibt stehen'],
          ['The speed rises slightly, as with the shunt-wound machine', 'The speed keeps rising – it runs away', 'It stops']),
        correct: 1,
        watch: L('Die Hyperbel-Kennlinie und den Punkt, der nach oben wegläuft.', 'The hyperbolic characteristic and the point running off upwards.'),
        explain: L(
          `Beim Reihenschluss macht der Ankerstrom das Feld. Wenig Last heißt wenig Strom, damit wenig Fluss – und für die Gegenspannung ${S('U', 'i')} ≈ ${S('U')} muss die Drehzahl immer weiter steigen (ungesättigt ${S('n')} ∝ 1/${S('I', 'A')}). Nur Reibung und Lüftung begrenzen sie. Darum nie ohne Last oder über einen Riemen betreiben.`,
          `In a series-wound machine the armature current makes the field. Little load means little current and thus little flux – and for the back EMF ${S('U', 'i')} ≈ ${S('U')} the speed has to keep rising (unsaturated: ${S('n')} ∝ 1/${S('I', 'A')}). Only friction and windage limit it. So never run it without load or via a belt.`),
        duration: 6, speed: 0.5, window: 6,
        setup: () => {},
        events: [on(), { at: 1.2, do: ({ p }) => { p.loadOn = false; } }],
      },
      {
        title: L('Anzugsmoment', 'Starting torque'),
        tag: L('Sättigung', 'Saturation'),
        question: L(
          `Beim Anlauf ist der Strom auf 2·${S('I', 'N')} = 80 A begrenzt. Wie viel Moment liefert die Maschine im Vergleich zum Nennmoment (bei 40 A)?`,
          `During starting the current is limited to 2·${S('I', 'N')} = 80 A. How much torque does the machine deliver compared with the rated torque (at 40 A)?`),
        choices: L(
          [`Genau 4-mal so viel, weil ${S('M')} ∝ ${S('I')}²`, 'Zwischen 2- und 4-mal – je nach Sättigung, hier etwa 2,1-mal', 'Weniger als das Doppelte'],
          [`Exactly 4 times as much, because ${S('M')} ∝ ${S('I')}²`, 'Between 2 and 4 times – depending on saturation, here about 2.1 times', 'Less than double']),
        correct: 1,
        watch: L(`${S('M')} während der Strombegrenzung.`, `${S('M')} while the current limit is active.`),
        explain: L(
          `${S('M')} = ${S('k', '1')}Φ(${S('I', 'A')})/(2π)·${S('I', 'A')}. Ohne Sättigung wäre Φ ∝ ${S('I')} und ${S('M')} ∝ ${S('I')}², also 4-fach. Hier ist das Eisen bei 40 A schon fast gesättigt (Reiter Leerlaufkennlinie): ${S('U', 'iK')}(80 A)/${S('U', 'iK')}(40 A) ≈ 1,05, also ${S('M')} nur etwa 2,1-fach. Trotzdem: hohes Anzugsmoment ist die Stärke dieser Maschine.`,
          `${S('M')} = ${S('k', '1')}Φ(${S('I', 'A')})/(2π)·${S('I', 'A')}. Without saturation Φ ∝ ${S('I')} and ${S('M')} ∝ ${S('I')}², i.e. 4 times. Here the iron is already almost saturated at 40 A (Magnetization curve tab): ${S('U', 'iK')}(80 A)/${S('U', 'iK')}(40 A) ≈ 1.05, so ${S('M')} is only about 2.1 times. Still, high starting torque is the strength of this machine.`),
        duration: 1.5, speed: 0.25, window: 1.5, tab: 'mag',
        setup: (p) => { p.currentLimit = true; p.Imax = 80; },
        events: [on()],
      },
      {
        title: L('Spannung umpolen', 'Reversing the voltage'),
        tag: L('Drehrichtung', 'Direction of rotation'),
        question: L(
          'Du schließt die Maschine verkehrt herum an (−220 V). In welche Richtung läuft sie an?',
          'You connect the machine the wrong way round (−220 V). In which direction does it start?'),
        choices: L(['Rückwärts', 'Vorwärts wie vorher', 'Gar nicht'], ['Backwards', 'Forwards, as before', 'Not at all']),
        correct: 1,
        watch: L('Vorzeichen von Strom und Drehzahl.', 'Signs of current and speed.'),
        explain: L(
          `Strom und Fluss kehren sich gemeinsam um, das Moment ${S('M')} ∝ Φ·${S('I')} ∝ ${S('I')}² behält sein Vorzeichen. Darum läuft der Universalmotor (Reihenschluss) auch an Wechselspannung. Zum Reversieren polt man nur das Feld <em>oder</em> nur den Anker um.`,
          `Current and flux reverse together, so the torque ${S('M')} ∝ Φ·${S('I')} ∝ ${S('I')}² keeps its sign. That is why the universal motor (series-wound) also runs on AC. To reverse the direction, you reverse the polarity of only the field <em>or</em> only the armature.`),
        duration: 2, speed: 0.25, window: 2,
        setup: (p) => { p.UA = -220; },
        events: [on()],
      },
      {
        title: L('Widerstandsbremse', 'Dynamic braking'),
        tag: L('Bremsen', 'Braking'),
        question: L(
          `Die Maschine läuft mit gut 4 000 min⁻¹. Sie wird vom Netz getrennt und auf ${S('R', 'B')} = 3 Ω geschaltet, das Feld dabei umgepolt. Was passiert?`,
          `The machine runs at just over 4,000 min⁻¹. It is disconnected from the supply and switched onto ${S('R', 'B')} = 3 Ω, with the field polarity reversed. What happens?`),
        choices: L(
          ['Sie läuft frei aus, als gäbe es keine Bremse', 'Sie erregt sich selbst, bremst kräftig – bis die Erregung bei kleiner Drehzahl abreißt', 'Sie dreht sofort rückwärts'],
          ['It coasts down freely, as if there were no brake', 'It excites itself and brakes hard – until the excitation collapses at low speed', 'It turns backwards at once']),
        correct: 1,
        watch: L('Negatives Moment, dann Abriss bei kleiner Drehzahl.', 'Negative torque, then collapse at low speed.'),
        explain: L(
          `Mit umgepoltem Feld verstärkt der Bremsstrom das Feld, die Maschine erregt sich aus der Remanenz selbst: ${S('U', 'i')} = (${S('R', 'i')} + ${S('R', 'B')})·|${S('I', 'A')}|, das Moment ist negativ. Sinkt die Drehzahl so weit, dass die Kennlinie die Widerstandsgerade nicht mehr schneidet, bricht die Selbsterregung zusammen – unten muss mechanisch gebremst werden.`,
          `With the field reversed, the braking current strengthens the field and the machine excites itself from the remanence: ${S('U', 'i')} = (${S('R', 'i')} + ${S('R', 'B')})·|${S('I', 'A')}|, and the torque is negative. Once the speed has fallen so far that the curve no longer intersects the resistance line, self-excitation collapses – at low speed a mechanical brake has to take over.`),
        duration: 3.5, speed: 0.5, window: 3.5,
        setup: (p) => { p.curve = { ...p.curve, Urem: 3 }; },
        events: [on(), { at: 1.2, do: ({ p }) => { p.supply = 'load'; p.RL = 3; } }],
      },
    ],
  };
})(window);
