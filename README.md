# Maschinenlabor

Interactive simulation of electric machines for learning: DC machines, permanent-magnet synchronous machines and space vectors, computed live in the browser.

I built this while preparing for my **Machines and Drives** exam (*Maschinen und Antriebe*, TU Wien). Instead of only reading characteristic curves, I wanted to change a parameter and immediately see what it does to speed, torque, current and the equivalent circuit, so I wrote the models myself and put a UI around them.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dc-shunt-dark.png">
  <img alt="Shunt-wound DC machine running at its operating point: animated cross-section, live readouts, four-quadrant speed–torque characteristic and the equivalent circuit with the actual currents and voltages" src="docs/screenshots/dc-shunt-light.png">
</picture>

*Shunt-wound DC machine at its operating point: cross-section with field and armature currents, speed–torque characteristic with load curve, and the equivalent circuit carrying the live values.*

## What's inside

**Space vectors & rotating field** – three phase currents add up tip to tail to the space vector. Locus, phase sequence, a lost phase, unbalance, zero-sequence current, block currents and the rotating dq frame.

**DC machine** – permanent magnet, separately excited, shunt and series wound:
- dynamic model (armature circuit, field circuit, mechanics) with direct start, load steps and plugging
- speed–torque characteristic with load curve, steady-state operating points (stable/unstable) and the moving instantaneous point
- magnetization curve with saturation and remanence; your own measured points can be entered
- self-excitation of the shunt generator with critical resistance, dynamic braking of the series machine
- current limit like a converter, starting resistor, field rheostat, speed-driven test-bench mode

**Permanent-magnet synchronous machine** (per-unit quantities):
- sinusoidal operation with PI current controllers in dq, speed controller and field weakening
- current plane with current and voltage limits, torque–speed envelope with and without field weakening
- block commutation (BLDC) with Hall sectors and torque ripple
- open-loop voltage control (U/f) with load-angle curve, pull-out torque and the root locus of the linearised system
- open circuit, short circuit and generator on a resistor with braking characteristic
- DC injection ("compass needle")

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/psm-foc-dark.png">
  <img alt="PMSM in sinusoidal operation with field-oriented control: rotor with dq axes and phase currents, readouts, phasor diagram and space-vector equivalent circuit" src="docs/screenshots/psm-foc-light.png">
</picture>

**On every machine page:** animated cross-section, equivalent circuit with flowing current, phasor diagram, time plots, formulas with the current numbers plugged in, power balance, and guided experiments (predict first, then run, then read the explanation).

Every physical quantity has the same color everywhere: voltage blue, current orange, flux teal, torque violet, speed green. Everything else is black and white.

The interface is in German and uses the notation of the lecture: passive sign convention (*Verbraucherzählpfeilsystem*), per-unit quantities referred to peak values, and space vectors with the factor ⅔.

## Getting started

No build step, no dependencies.

- **Directly:** open `index.html` in a browser (double-click works).
- **Local server:** `python -m http.server 8000`, then open <http://localhost:8000>.
- **GitHub Pages:** *Settings → Pages → Deploy from a branch → `main` / root*.

Fonts (Inter, STIX Two Text) are loaded from Google Fonts; offline, the app falls back to system fonts.

## Tests

The physics is checked against hand calculations (no-load speed, generator operation, series machine with magnetization curve, self-excitation, PMSM short circuit, sinusoidal operation, field weakening, BLDC ripple, eigenvalues vs. simulation, …):

```sh
npm test          # or: node --test tests/physics.test.js   (Node ≥ 18)
```

## Project structure

```
index.html
css/style.css                 design tokens, layout (light/dark)
js/core/                      namespace, complex numbers, RK4, eigenvalues
js/physics/                   dc.js, psm.js, magnet.js (magnetization curve), loads.js
js/ui/                        DOM helpers, controls, charts,
                              machine-art.js (cross-sections), circuits.js (equivalent circuits)
js/pages/                     pages + experiments
design/                       preview galleries for machine drawings and equivalent circuits
docs/screenshots/             README images
tests/                        Node tests for the physics
```

All scripts are classic scripts in the `MS` namespace, so the app runs without a server and the physics can be tested directly in Node.

## Model assumptions

Idealised and meant for understanding, not for machine design: no armature reaction, no iron or brush losses, ideal commutation, non-salient PMSM (no reluctance torque), ideal inverters without PWM, saturation only through the magnetization curve. Load types: hoist (active), friction, linear, fan, constant power.

## Note

This repository contains **no** material from lecture notes, exercises or exams. All drawings, characteristic curves and equivalent circuits are computed and drawn from the equations. This is a personal study project and not an official TU Wien offering; it does not replace the lecture notes or exercises.

Found a bug or have an idea for an experiment? Issues and pull requests are welcome.

## License

[MIT](LICENSE)
