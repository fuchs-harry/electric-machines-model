# Maschinenlabor

Interaktive Simulation elektrischer Maschinen zum Lernen – Gleichstrommaschine, permanenterregte Synchronmaschine und Raumzeiger, live im Browser gerechnet.

Gebaut als Lernhilfe für die Lehrveranstaltung *Maschinen und Antriebe* (TU Wien). Die Notation folgt der Vorlesung: Verbraucherzählpfeilsystem, bezogene Größen mit Scheitelwerten als Bezug, Raumzeiger mit dem Faktor ⅔.

> *English:* An interactive, dependency-free web app that simulates DC machines (permanent magnet, separately excited, shunt, series) and permanent-magnet synchronous machines (sinusoidal FOC with field weakening, BLDC block commutation, open-loop U/f with eigenvalue analysis, short circuit) plus a space-vector playground. UI language is German.

## Was drin ist

**Raumzeiger & Drehfeld** – drei Strangströme werden Spitze an Spitze zum Raumzeiger addiert. Ortskurve, Phasenfolge, Strangausfall, Unsymmetrie, Nullsystem, Blockströme und das mitdrehende dq-System.

**Gleichstrommaschine** – permanent-, fremd-, nebenschluss- und reihenschlusserregt:
- dynamisches Modell (Ankerkreis, Feldkreis, Mechanik) mit Anlauf, Lastsprung, Gegenstrombremsung
- n(M)-Kennlinie mit Last, stationären Arbeitspunkten (stabil/instabil) und dem wandernden Momentanwert
- Leerlaufkennlinie mit Sättigung und Remanenz – eigene Punkte (z. B. aus einer Angabe) eintragbar
- Selbsterregung des Nebenschlussgenerators mit kritischem Widerstand, Widerstandsbremse beim Reihenschluss
- Strombegrenzung wie ein Stromrichter, Anlasswiderstand, Feldsteller, Drehzahl-Vorgabe (Prüfstand)

**Permanentmagnet-Synchronmaschine** (bezogene Größen):
- Sinusbetrieb mit PI-Stromreglern im dq-System, Drehzahlregler und Feldschwächung
- Stromebene mit Strom- und Spannungsgrenze, Grenzkennlinie m(ω) mit und ohne Feldschwächung
- Blockkommutierung mit Hall-Sektoren und Momentwelligkeit
- spannungsgesteuerter Betrieb (U/f) mit Polradwinkel-Kennlinie, Kippmoment und Wurzelortskurve des linearisierten Systems
- Leerlauf, Kurzschluss und Generator auf Widerstand mit Bremskennlinie
- Gleichstrom einprägen („Kompassnadel“)

**Auf jeder Maschinenseite:** animierter Querschnitt, Ersatzschaltbild mit fließendem Strom, Zeigerdiagramm, Zeitverläufe, Formeln mit eingesetzten Werten, Leistungsbilanz und geführte Experimente (erst vorhersagen, dann starten, dann Auflösung).

Jede Größe hat überall dieselbe Farbe: Spannung blau, Strom orange, Fluss grün-türkis, Moment violett, Drehzahl grün. Alles Übrige ist schwarz-weiß.

## Starten

Kein Build, keine Abhängigkeiten.

- **Direkt:** `index.html` im Browser öffnen (funktioniert auch per Doppelklick).
- **Lokaler Server:** `python -m http.server 8000` und <http://localhost:8000> öffnen.
- **GitHub Pages:** *Settings → Pages → Deploy from branch → `main` / root*.

Schriften (Inter, STIX Two Text) kommen von Google Fonts; offline wird auf Systemschriften ausgewichen.

## Tests

Die Physik ist gegen Handrechnungen geprüft (Leerlaufdrehzahl, Generatorbetrieb, Reihenschluss mit Kennlinie, Selbsterregung, PSM-Kurzschluss, Sinusbetrieb, Feldschwächung, BLDC-Welligkeit, Eigenwerte vs. Simulation …):

```sh
npm test          # oder: node --test tests/physics.test.js   (Node ≥ 18)
```

## Aufbau

```
index.html
css/style.css                 Design-Tokens, Layout (hell/dunkel)
js/core/                      Namespace, komplexe Zahlen, RK4, Eigenwerte
js/physics/                   dc.js, psm.js, magnet.js (Leerlaufkennlinie), loads.js
js/ui/                        DOM-Helfer, Bedienelemente, Diagramme,
                              machine-art.js (Querschnitte), circuits.js (Ersatzschaltbilder)
js/pages/                     Seiten + Experimente
design/                       Vorschau-Galerien für Maschinenbilder und Ersatzschaltbilder
tests/                        Node-Tests der Physik
```

Alle Skripte sind klassische Skripte im Namespace `MS` – deshalb läuft die App ohne Server, und die Physik lässt sich direkt in Node testen.

## Modellannahmen

Idealisiert, für das Verständnis gemacht, nicht für die Auslegung: keine Ankerrückwirkung, keine Eisen- und Bürstenverluste, ideale Kommutierung, isotrope PSM (keine Reluktanz), ideale Umrichter ohne PWM, Sättigung nur über die Leerlaufkennlinie. Lastkennlinien: Hubwerk (aktiv), Reibung, linear, Lüfter, konstante Leistung.

## Hinweis

Dieses Repository enthält **keine** Inhalte aus Skripten, Übungen oder Prüfungen. Alle Bilder, Kennlinien und Ersatzschaltbilder werden aus den Gleichungen berechnet und gezeichnet. Kein offizielles Angebot der TU Wien.

Fehler gefunden oder eine Idee für ein Experiment? Issues und Pull Requests sind willkommen.

## Lizenz

[MIT](LICENSE)
