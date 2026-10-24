# Contributing to Maschinenlabor

Thanks for helping! This project started as my own exam prep, and every corrected number or clearer explanation makes it better for the next student.

## Ways to help

- **Report a physics or display error.** Use the [bug report](https://github.com/fuchs-harry/electric-machines-model/issues/new?template=bug_report.yml). Include the page URL, the parameter values and, if you can, a short hand calculation.
- **Suggest an experiment** that would have helped you understand something. Use the [idea form](https://github.com/fuchs-harry/electric-machines-model/issues/new?template=idea.yml).
- **Improve a translation.** The English and German texts sit side by side in the code (see below).
- **Send a pull request** for any of the above.

## The one hard rule: no course material

Do not commit anything taken from lecture notes, exercises or exams. That includes scans, figures, problem texts and exam data such as measured curves from an exam sheet. Course material is copyrighted, and students have been asked not to put it online. This project only works if it respects that.

Everything in the app is drawn and computed from the equations. If you want to reproduce a textbook example, use your own numbers. The CI blocks PDF, TeX, ZIP and MATLAB files as a safety net.

## Running locally

No build step, no dependencies:

```sh
git clone https://github.com/fuchs-harry/electric-machines-model.git
cd electric-machines-model
python -m http.server 8000      # or open index.html directly
npm test                        # physics tests, Node ≥ 18
```

## How the code is organized

| Folder | What lives there |
|---|---|
| `js/core/` | `MS` namespace, language switch, complex numbers, RK4, eigenvalues |
| `js/physics/` | Machine models (`dc.js`, `psm.js`), magnetization curve, load types. **No DOM access**, because these files also run in Node for the tests. |
| `js/ui/` | DOM helpers, controls, charts, machine cross-sections, equivalent circuits |
| `js/pages/` | One file per page plus the experiment definitions |
| `tests/` | Physics tests against hand calculations |

Every file is a classic script wrapped in an IIFE that attaches to the global `MS` object. Keep it that way: no modules, no bundler, no npm dependencies. That way the app opens straight from the file system.

### Conventions

- **Bilingual text.** Every user-visible string is written as `L('Deutsch', 'English')`, where `const L = MS.L;`. The language is fixed when the page loads, so `L` can be called anywhere, including in static objects. Numbers in prose follow the language (`0,3 Ω` / `0.3 Ω`). Numbers computed at runtime go through `ui.fmt`, which handles that automatically.
- **Notation follows the lecture.** Symbols and subscripts (U<sub>A</sub>, I<sub>E</sub>, ψ<sub>M</sub>, …) are the same in both languages. Use the passive sign convention, per-unit quantities for the PMSM, and the ⅔ space-vector definition.
- **Color means a quantity.** Voltage, current, flux, torque and speed each have one color token (`--c-u`, `--c-i`, `--c-psi`, `--c-m`, `--c-n`). Everything else stays black and white. Do not use these colors for decoration.
- **Match the surrounding code**: 2-space indentation, single quotes, short comments in English.

### Adding a guided experiment

Experiments live in `js/pages/*-experiments.js`. Each one is an object:

```js
{
  title: L('Direkt einschalten', 'Direct start'),
  tag: L('Anlauf', 'Starting'),
  question: L('…', '…'),
  choices: L(['…', '…', '…'], ['…', '…', '…']),
  correct: 2,                          // index into choices
  watch: L('…', '…'),                  // what to look at while it runs
  explain: L('…', '…'),                // the answer, with numbers
  duration: 0.12, speed: 0.02, window: 0.12,
  setup: (p) => { /* change the fresh default parameters */ },
  events: [{ at: 0.005, do: ({ m }) => m.switchOn() }],
}
```

Before you open the PR, run the experiment and check that every number in `explain` matches what the simulation shows.

### Changing the physics

Add or update a test in `tests/physics.test.js` that compares the model with a hand calculation. Mention the calculation in a comment. All tests must pass (`npm test`).

## Pull request checklist

- [ ] `npm test` passes
- [ ] New or changed text exists in German and English
- [ ] Physics changes come with a test
- [ ] Checked in the browser, light and dark mode
- [ ] No content from lecture notes, exercises or exams

## Code of conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
