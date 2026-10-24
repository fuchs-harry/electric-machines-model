# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] – 2026-10-24

First public release.

### Added

- **Space vectors & rotating field:** sinusoidal, manual and block currents, locus, phase sequence, open phase, unbalance, zero-sequence component, rotating dq frame.
- **DC machine:** permanent magnet, separately excited, shunt-wound and series-wound.
  - Dynamic model and speed–torque characteristics with stable and unstable operating points.
  - Magnetization curve with saturation and remanence, including user-entered points.
  - Self-excitation and critical resistance.
  - Converter current limit, starting resistor, field rheostat, generator and dynamic braking.
- **Permanent-magnet synchronous machine:**
  - Field-oriented control with field weakening, shown in the current plane, plus torque–speed envelopes.
  - Block commutation (BLDC) with torque ripple.
  - Open-loop U/f operation with load angle, pull-out torque and root locus.
  - Open circuit, short circuit and generator operation.
  - DC injection.
- Animated cross-sections, live equivalent circuits, phasor diagrams, time plots, formulas with live values and power balance on every machine page.
- 38 guided experiments (predict → run → explanation).
- English and German interface with a language switch; light and dark mode.
- Physics test suite against hand calculations, run in CI.

[1.0.0]: https://github.com/fuchs-harry/electric-machines-model/releases/tag/v1.0.0
