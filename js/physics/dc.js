/*
 * Gleichstrommaschine (GSM) – dynamic model in SI units.
 *
 * Grundgleichungen (Verbraucherzählpfeilsystem, Motor: I_A > 0, M > 0):
 *   U_i = k1Φ · n/60 = c · Ω            c = k1Φ / 2π   [Vs/rad = Nm/A]
 *   M   = k1Φ/(2π) · I_A = c · I_A
 *   U_A = R_A I_A + L_A dI_A/dt + U_i
 *   Θ dΩ/dt = M − M_L − M_Reib
 *
 * Erregungsarten:
 *   pm      permanenterregt          c = const
 *   fremd   fremderregt              L_E dI_E/dt = U_E − (R_E + R_VE) I_E
 *   neben   Nebenschluss             Erregung an der Klemmenspannung U
 *   reihen  Reihenschluss            I_E = I_A, R_i = R_A + R_E, L = L_A + L_E
 *
 * Versorgung:
 *   source  Spannungsquelle U_A (optional Strombegrenzung wie ein Stromrichter)
 *   load    Generator / Widerstandsbremse auf R_L (beim Reihenschluss wird das
 *           Feld dafür umgepolt, sonst kann sich die Maschine nicht selbst erregen)
 *
 * State x = [I_A, Ω, I_E, ϑ].
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});
  const { magnet, loads } = MS;

  const R_OPEN = 1e5; // R_L at or above this counts as open terminals

  const TYPES = {
    pm: { label: 'Permanenterregt', short: 'PM' },
    fremd: { label: 'Fremderregt', short: 'Fremd' },
    neben: { label: 'Nebenschluss', short: 'Neben' },
    reihen: { label: 'Reihenschluss', short: 'Reihen' },
  };

  /** Default parameter sets – plausible machines, not taken from any exam. */
  const defaults = (type) => {
    const base = {
      type,
      supply: 'source',
      UA: 0, RA: 0, LA: 0, RV: 0,
      currentLimit: false, Imax: 0,
      RL: 10,
      k1PhiPM: 0,
      curve: null,
      UE: 0, RE: 0, RVE: 0, LE: 1, fieldOn: true,
      J: 0, kF: 0, MC: 0,
      load: { type: 'fan', M0: 0, wRef: 1 },
      loadOn: true,
      speedMode: 'free',
      nSet: 0,
      UN: 0, IN: 0, nN: 0,
    };
    switch (type) {
      case 'pm':
        return {
          ...base,
          UN: 48, IN: 10, nN: 3750,
          UA: 48, RA: 0.3, LA: 0.6e-3, k1PhiPM: 0.72,
          Imax: 20,
          RL: 4,
          J: 1.0e-3, kF: 5e-5, MC: 0.01,
          load: { type: 'fan', M0: 1.0, wRef: MS.rpmToRad(3750) },
          nSet: 4500,
        };
      case 'fremd':
        return {
          ...base,
          UN: 220, IN: 20, nN: 1590,
          UA: 220, RA: 0.5, LA: 10e-3,
          curve: magnet.tanhCurve({ Usat: 260, Ik: 2, Urem: 0, nK: 1500 }),
          UE: 220, RE: 110, RVE: 0, LE: 11,
          Imax: 40,
          RL: 10,
          J: 0.15, kF: 1.4e-3, MC: 0.1,
          load: { type: 'fan', M0: 22, wRef: MS.rpmToRad(1590) },
          nSet: 1900,
        };
      case 'neben':
        return {
          ...base,
          UN: 220, IN: 20, nN: 1590,
          UA: 220, RA: 0.5, LA: 10e-3,
          curve: magnet.tanhCurve({ Usat: 260, Ik: 2, Urem: 0, nK: 1500 }),
          RE: 110, RVE: 0, LE: 5.5,
          Imax: 40,
          RL: 10,
          J: 0.15, kF: 1.4e-3, MC: 0.1,
          load: { type: 'fan', M0: 22, wRef: MS.rpmToRad(1590) },
          nSet: 1500,
        };
      case 'reihen':
        return {
          ...base,
          UN: 220, IN: 40, nN: 4020,
          UA: 220, RA: 0.3, LA: 6e-3,
          curve: magnet.tanhCurve({ Usat: 105, Ik: 22, Urem: 0, nK: 2000 }),
          RE: 0.2, LE: 9e-3,
          Imax: 80,
          RL: 3,
          J: 0.05, kF: 4.5e-4, MC: 0.05,
          load: { type: 'fan', M0: 19, wRef: MS.rpmToRad(4020) },
          nSet: 3000,
        };
      default:
        throw new Error('unknown DC machine type ' + type);
    }
  };

  class DCMachine {
    constructor(type, overrides = {}) {
      this.p = { ...defaults(type), ...overrides };
      this.x = new Float64Array(4);
      this.reset();
    }

    /** Back to standstill, switch open. A separately excited field is already up. */
    reset() {
      this.x.fill(0);
      this.t = 0;
      this.on = false;
      if (this.p.type === 'fremd' && this.p.fieldOn) this.x[2] = this.fieldSteady();
      this.lastU = 0;
    }

    switchOn() { this.on = true; }
    switchOff() {
      this.on = false;
      this.x[0] = 0; // ideal disconnect: armature current is interrupted
    }

    get isSeries() { return this.p.type === 'reihen'; }
    get fieldReversed() { return this.isSeries && this.p.supply === 'load'; }
    get openLoad() { return this.p.supply === 'load' && this.p.RL >= R_OPEN; }

    /** Resistance of the armature circuit (series field included). */
    rArm() {
      const p = this.p;
      let R = p.RA;
      if (this.isSeries) R += p.RE;
      if (p.supply === 'source') R += p.RV;
      return R;
    }
    lArm() { return this.p.LA + (this.isSeries ? this.p.LE : 0); }
    rField() { return this.p.RE + this.p.RVE; }

    /** Steady field current for the current settings (fremd / neben with source). */
    fieldSteady() {
      const p = this.p;
      if (p.type === 'fremd') return p.fieldOn ? p.UE / this.rField() : 0;
      if (p.type === 'neben') return p.UA / this.rField();
      return 0;
    }

    /** Flux constant c = k1Φ/2π [Vs/rad] for the given currents (sign included). */
    c(IA, IE) {
      const p = this.p;
      switch (p.type) {
        case 'pm': return p.k1PhiPM / MS.TAU;
        case 'fremd':
        case 'neben': return magnet.cOf(p.curve, IE);
        case 'reihen': {
          const c = magnet.cOf(p.curve, IA);
          return this.fieldReversed ? -c : c;
        }
      }
      return 0;
    }

    loadTorque(w) {
      return this.p.loadOn ? loads.torque(this.p.load, w) : 0;
    }
    frictionTorque(w) {
      const p = this.p;
      const wN = MS.rpmToRad(p.nN);
      return p.kF * w + p.MC * Math.tanh(w / (0.01 * wN));
    }

    /** Terminal voltage the source actually applies (with optional current limit). */
    sourceVoltage(IA, Ui) {
      const p = this.p;
      let U = p.UA;
      if (p.currentLimit) {
        const R = this.rArm();
        U = MS.clamp(U, Ui - R * p.Imax, Ui + R * p.Imax);
      }
      return U;
    }

    derivs(t, x, dx) {
      const p = this.p;
      const IA = x[0], w = x[1], IE = x[2];
      const c = this.c(IA, IE);
      const Ui = c * w;
      let dIA = 0, dIE = 0;

      if (!this.on) {
        // Armature open. A shunt field discharges through its freewheel path.
        if (p.type === 'neben') dIE = -this.rField() * IE / p.LE;
        if (p.type === 'fremd') dIE = ((p.fieldOn ? p.UE : 0) - this.rField() * IE) / p.LE;
      } else if (p.supply === 'source') {
        const U = this.sourceVoltage(IA, Ui);
        dIA = (U - this.rArm() * IA - Ui) / this.lArm();
        if (p.type === 'neben') dIE = (U - this.rField() * IE) / p.LE;
        if (p.type === 'fremd') dIE = ((p.fieldOn ? p.UE : 0) - this.rField() * IE) / p.LE;
      } else {
        // Generator / brake on R_L
        if (p.type === 'neben') {
          if (this.openLoad) {
            // Field and armature in one loop: I_A = −I_E
            dIE = (Ui - (p.RA + this.rField()) * IE) / (p.LA + p.LE);
            dIA = -dIE;
          } else {
            const U = -p.RL * (IA + IE);
            dIA = (U - p.RA * IA - Ui) / p.LA;
            dIE = (U - this.rField() * IE) / p.LE;
          }
        } else {
          const U = this.openLoad ? 0 : -p.RL * IA;
          dIA = this.openLoad ? -IA / 1e-4 : (U - this.rArm() * IA - Ui) / this.lArm();
          if (p.type === 'fremd') dIE = ((p.fieldOn ? p.UE : 0) - this.rField() * IE) / p.LE;
        }
      }

      const M = c * IA;
      let dw;
      if (p.speedMode === 'imposed') {
        dw = (MS.rpmToRad(p.nSet) - w) / 0.05;
      } else {
        dw = (M - this.loadTorque(w) - this.frictionTorque(w)) / p.J;
      }
      dx[0] = dIA;
      dx[1] = dw;
      dx[2] = dIE;
      dx[3] = w;
    }

    /** Step size that keeps RK4 stable for the fastest electrical time constant. */
    maxStep() {
      const p = this.p;
      let tau = this.lArm() / Math.max(this.rArm(), 1e-3);
      if (p.supply === 'load' && !this.openLoad) {
        tau = Math.min(tau, this.lArm() / (this.rArm() + p.RL));
        if (p.type === 'neben') tau = Math.min(tau, p.LE / (this.rField() + p.RL), p.LA / (p.RA + p.RL));
      }
      if (p.supply === 'load' && this.openLoad && p.type !== 'neben') tau = Math.min(tau, 1e-4);
      return MS.clamp(tau / 4, 2e-6, 2e-4);
    }

    /** Advance the simulation by `dt` seconds. */
    advance(dt) {
      const hMax = this.maxStep();
      const n = Math.max(1, Math.ceil(dt / hMax));
      const h = dt / n;
      const f = (t, x, dx) => this.derivs(t, x, dx);
      for (let i = 0; i < n; i++) {
        MS.rk4(f, this.x, this.t, h);
        this.t += h;
      }
      if (this.p.type === 'neben' && this.p.supply === 'load' && this.openLoad && this.on) this.x[0] = -this.x[2];
      if (!this.on) this.x[0] = 0;
    }

    /** Everything the UI shows, derived from the current state. */
    outputs() {
      const p = this.p;
      const [IA, w, IE, theta] = this.x;
      const c = this.c(IA, IE);
      const Ui = c * w;
      const M = c * IA;
      let U = 0;
      if (this.on) {
        if (p.supply === 'source') U = this.sourceVoltage(IA, Ui);
        else if (p.type === 'neben') U = this.openLoad ? this.rField() * IE : -p.RL * (IA + IE);
        else U = this.openLoad ? Ui : -p.RL * IA;
      }
      const Isup = p.type === 'neben' ? IA + IE : IA;
      const ML = this.loadTorque(w);
      const MF = this.frictionTorque(w);
      const Rarm = this.rArm();
      const PcuA = Rarm * IA * IA;
      const PcuE = (p.type === 'fremd' || p.type === 'neben') ? this.rField() * IE * IE : 0;
      const Pel = U * Isup; // VZS: > 0 = drawn from the terminals, < 0 = delivered
      const Pi = Ui * IA; // air-gap (inner) power = M·Ω
      const Pshaft = (M - MF) * w;
      const k1Phi = c * MS.TAU;
      return {
        t: this.t, IA, IE, w, n: MS.radToRpm(w), theta, c, k1Phi, Ui, U, Isup, M, ML, MF,
        Pel, Pi, Pshaft, PcuA, PcuE, Pfield: p.type === 'fremd' ? p.UE * IE : 0,
      };
    }

    // ---------------------------------------------------------------- static

    /** Field current in steady state for a given armature current. */
    steadyIE(IA) {
      const p = this.p;
      if (p.type === 'fremd') return this.fieldSteady();
      if (p.type === 'neben') {
        if (p.supply === 'source') return p.UA / this.rField();
        if (this.openLoad) return -IA;
        const Rf = this.rField();
        const U = (-p.RL * IA) / (1 + p.RL / Rf);
        return U / Rf;
      }
      return 0;
    }

    /** Steady state along the characteristic, parametrised by the armature current. */
    steadyAt(IA) {
      const p = this.p;
      const IE = this.steadyIE(IA);
      const c = this.c(IA, IE);
      let U;
      if (p.supply === 'source') U = p.UA;
      else if (p.type === 'neben') U = this.openLoad ? this.rField() * IE : -p.RL * (IA + IE);
      else U = -p.RL * IA;
      const R = p.supply === 'source' ? this.rArm() : (p.type === 'neben' ? p.RA : this.rArm());
      const Ui = U - R * IA;
      const w = Math.abs(c) < 1e-12 ? NaN : Ui / c;
      return { IA, IE, c, U, Ui, w, n: MS.radToRpm(w), M: c * IA };
    }

    /** Range of armature current to sweep for the characteristic. */
    currentSpan() {
      const p = this.p;
      const R = this.rArm() + (p.supply === 'load' ? p.RL : 0);
      return Math.max(4 * p.IN, (1.1 * Math.abs(p.UA)) / Math.max(R, 1e-3));
    }

    /**
     * n(M)-Kennlinie as an array of {M, n, IA}. Points with undefined speed
     * (no flux) are skipped. Dense near I_A = 0 where the series machine runs away.
     */
    characteristic(N = 500) {
      const span = this.currentSpan();
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const s = -1 + (2 * k) / N;
        const IA = span * s * s * s;
        if (this.isSeries && IA === 0) continue;
        const st = this.steadyAt(IA);
        if (Number.isFinite(st.w)) pts.push({ M: st.M, n: st.n, IA });
      }
      return pts;
    }

    /** Net accelerating torque in steady state at armature current IA. */
    _balance(IA) {
      const st = this.steadyAt(IA);
      if (!Number.isFinite(st.w)) return NaN;
      return st.M - this.loadTorque(st.w) - this.frictionTorque(st.w);
    }

    /**
     * Stationary operating points (intersection of machine and load
     * characteristic) with a stability verdict:
     *   stable ⇔ d(M − M_L − M_R)/dΩ < 0
     */
    operatingPoints() {
      const p = this.p;
      if (!this.on) return [];
      if (p.speedMode === 'imposed') {
        const w = MS.rpmToRad(p.nSet);
        const IA = this.currentAtSpeed(w);
        if (IA === null) return [];
        const st = this.steadyAt(IA);
        return [{ ...st, stable: true, imposed: true }];
      }
      const span = this.currentSpan();
      const f = (IA) => this._balance(IA);
      const roots = MS.findRoots(f, -span, span, 1200).filter((I) => !(this.isSeries && Math.abs(I) < 1e-9));
      const out = [];
      for (const IA of roots) {
        const st = this.steadyAt(IA);
        if (!Number.isFinite(st.w)) continue;
        const h = 1e-4 * span;
        const a = this.steadyAt(IA - h), b = this.steadyAt(IA + h);
        const dMdw = (b.M - a.M) / (b.w - a.w);
        const dLdw = loads.slope(p.load, st.w) * (p.loadOn ? 1 : 0) + p.kF;
        out.push({ ...st, stable: dMdw - dLdw < 0 });
      }
      return out;
    }

    /** Armature current that gives speed w in steady state (or null). */
    currentAtSpeed(w) {
      const span = this.currentSpan() * 2;
      const roots = MS.findRoots((IA) => {
        const st = this.steadyAt(IA);
        return Number.isFinite(st.w) ? st.w - w : NaN;
      }, -span, span, 1600);
      if (!roots.length) return null;
      // Prefer the smallest current (the physically reached branch).
      return roots.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
    }

    /** Ideal no-load speed n0 (I_A = 0) – undefined for the series machine. */
    noLoadSpeed() {
      const p = this.p;
      if (this.isSeries) return Infinity;
      const c = this.c(0, this.fieldSteady());
      return Math.abs(c) < 1e-12 ? Infinity : MS.radToRpm(p.UA / c);
    }

    /** Leerlaufkennlinie at speed n plus field-circuit line (Selbsterregung). */
    selfExcitation(n, N = 120) {
      const p = this.p;
      const Imax = p.curve.type === 'tanh' ? 4 * p.curve.Ik : p.curve.points[p.curve.points.length - 1][0] * 1.2;
      const Rloop = p.RA + this.rField();
      const curve = [], line = [];
      for (let k = 0; k <= N; k++) {
        const I = (Imax * k) / N;
        curve.push({ I, U: (magnet.UiK(p.curve, I) * n) / p.curve.nK });
        line.push({ I, U: Rloop * I });
      }
      const g = (I) => (magnet.UiK(p.curve, I) * n) / p.curve.nK - Rloop * I;
      const roots = MS.findRoots(g, Imax * 1e-4, Imax, 600);
      const I0 = roots.length ? roots[roots.length - 1] : 0;
      // Critical loop resistance = initial slope of the curve at this speed.
      const dI = 1e-4 * Imax;
      const slope0 = (((magnet.UiK(p.curve, dI) - magnet.UiK(p.curve, 0)) / dI) * n) / p.curve.nK;
      return { curve, line, I0, U0: Rloop * I0, Rloop, Rcrit: slope0 };
    }
  }

  MS.dc = { TYPES, defaults, DCMachine, R_OPEN };
})(typeof globalThis !== 'undefined' ? globalThis : window);
