/*
 * Permanentmagnet-Synchronmaschine (PSM) – normierte Raumzeigergleichungen.
 *
 *   u_S = r_S i_S + dψ_S/dτ + jω_K ψ_S          ψ_S = l_S i_S + ψ_M
 *   m   = −Im{i_S* ψ_S} = ψ_M i_Sq               τ_m dω_m/dτ = m − m_L − k_R ω_m
 *   dγ_m/dτ = ω_m                                 (τ = Ω_Bez t, p.u.)
 *
 * The plant is integrated in the rotor-fixed dq frame (ω_K = ω_m):
 *   l_S di_d/dτ = u_d − r_S i_d + ω l_S i_q
 *   l_S di_q/dτ = u_q − r_S i_q − ω l_S i_d − ω ψ_M
 *
 * Betriebsarten (mode):
 *   foc      rotororientiert, sinusförmige Ströme (PI-Stromregler in dq,
 *            optional Drehzahlregler, Feldschwächung über i_d < 0)
 *   bldc     Blockkommutierung: 6 Stromrichtungen A–F nach Hall-Sektor
 *   dc       konstanter Stromraumzeiger statorfest ("Kompassnadel")
 *   uf       spannungsgesteuert u_S = u e^{jθ_u} (U/f-Steuerung, ohne Regelung)
 *   passive  Klemmen offen, kurzgeschlossen oder auf Lastwiderstand r_L
 *
 * State x = [i_d, i_q, ω_m, γ_m, θ_u].
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});
  const { loads } = MS;
  const D60 = Math.PI / 3;

  const MODES = {
    foc: { label: 'Sinus (feldorientiert)', short: 'Sinus' },
    bldc: { label: 'Block (BLDC)', short: 'BLDC' },
    uf: { label: 'Spannungsgesteuert (U/f)', short: 'U/f' },
    passive: { label: 'Generator / Kurzschluss', short: 'Passiv' },
    dc: { label: 'Gleichstrom einprägen', short: 'Gleichstrom' },
  };

  /** Block-current directions A–F (φ = −30° + k·60°) with their phase-sign pattern. */
  const BLOCKS = [
    { name: 'A', phi: -30, pattern: '+ − 0' },
    { name: 'B', phi: 30, pattern: '+ 0 −' },
    { name: 'C', phi: 90, pattern: '0 + −' },
    { name: 'D', phi: 150, pattern: '− + 0' },
    { name: 'E', phi: 210, pattern: '− 0 +' },
    { name: 'F', phi: 270, pattern: '0 − +' },
  ];

  const defaults = () => ({
    rs: 0.05, ls: 0.3, psiM: 1, taum: 500, kf: 0.004,
    umax: 1.1, imax: 1.5,
    // Bezugsgrößen (only for the physical read-outs)
    fN: 50, nN: 3000, IN: 10, UN: 400,
    mode: 'foc',
    ref: 'speed', wRef: 0.8, mRef: 0.5,
    idMode: 'auto', idManual: -0.5,
    advance: 0,
    dcAngle: 0, dcAmp: 1,
    ufTarget: 0.5, ufRamp: 0.004, kuf: 1.0, boost: 0.03,
    rL: 0, open: false,
    speedMode: 'free', wSet: 1,
    load: { type: 'friction', M0: 0.4, wRef: 1 },
    loadOn: true,
    alpha: 0.5, // current-loop bandwidth (rad per τ)
    beta: 0.02, // speed-loop crossover (rad per τ)
  });

  class PSM {
    constructor(overrides = {}) {
      this.p = { ...defaults(), ...overrides };
      this.x = new Float64Array(5);
      this.reset();
    }

    reset() {
      this.x.fill(0);
      this.t = 0;
      this.on = false;
      this.z = { d: 0, q: 0, a: 0, b: 0, w: 0 };
      this.u = { d: 0, q: 0 };
      this.iRef = { d: 0, q: 0 };
      this.mRefNow = 0;
      this.wsNow = 0;
      this.sat = false;
      this.sector = 0;
      this.slipTime = 0;
    }

    switchOn() {
      this.on = true;
      this.z = { d: 0, q: 0, a: 0, b: 0, w: 0 };
      this.wsNow = this.p.mode === 'uf' ? 0 : this.wsNow;
      this.x[4] = this.x[3]; // U/f starts aligned with the rotor
    }
    switchOff() {
      this.on = false;
      this.x[0] = 0;
      this.x[1] = 0;
    }

    loadTorque(w) { return this.p.loadOn ? loads.torque(this.p.load, w) : 0; }

    // ------------------------------------------------------------ control

    /**
     * Current reference for a torque demand (Feldschwächung).
     * Below base speed i_d = 0. Above it, i_d is made just negative enough that
     * the demanded i_q fits the voltage limit (3 % margin, r_S included, see
     * iqWindow). If no i_d achieves that, the reference takes the i_d with the
     * most torque left – the intersection of current and voltage limit, or the
     * MTPV point for machines with ψ_M/l_S < i_max.
     */
    currentReference(m, w) {
      const p = this.p;
      const iqDem = m / p.psiM;
      const sign = MS.sgn(iqDem) || 1;
      const clampToCurrent = (id, iq) => {
        id = MS.clamp(id, -p.imax, p.imax);
        const lim = Math.sqrt(Math.max(0, p.imax * p.imax - id * id));
        return { d: id, q: MS.clamp(iq, -lim, lim) };
      };
      if (p.idMode === 'zero') return clampToCurrent(0, iqDem);
      if (p.idMode === 'manual') return clampToCurrent(p.idManual, iqDem);

      const uLim = 0.97 * p.umax;
      const need = Math.min(Math.abs(iqDem), p.imax);
      const reach = (id) => {
        const win = this.iqWindow(id, w, uLim);
        if (!win) return -Infinity;
        return sign > 0 ? win.hi : -win.lo;
      };
      if (reach(0) >= need) return { d: 0, q: sign * need };
      const N = 48;
      let best = -Infinity, bestId = -Math.min(p.imax, p.psiM / p.ls), prev = 0;
      for (let k = 1; k <= N; k++) {
        const id = (-p.imax * k) / N;
        const r = reach(id);
        if (r >= need) {
          const idOk = MS.bisect((x) => reach(x) - need, prev, id, 1e-6, 40);
          return { d: idOk, q: sign * need };
        }
        if (r > best) { best = r; bestId = id; }
        prev = id;
      }
      if (best > -Infinity) {
        // golden-section refinement of the best grid point
        const step = p.imax / N;
        let a = Math.max(-p.imax, bestId - step), b = Math.min(0, bestId + step);
        const g = 0.381966;
        for (let k = 0; k < 30; k++) {
          const x1 = a + g * (b - a), x2 = b - g * (b - a);
          if (reach(x1) > reach(x2)) b = x2; else a = x1;
        }
        bestId = 0.5 * (a + b);
        best = reach(bestId);
      }
      return best > 0 ? { d: bestId, q: sign * best } : { d: bestId, q: 0 };
    }

    /** Speed controller (PI with clamping anti-windup) → torque reference. */
    torqueReference(h) {
      const p = this.p;
      const w = this.x[2];
      const mMax = p.imax * p.psiM;
      if (p.ref === 'torque') return MS.clamp(p.mRef, -mMax, mMax);
      const Kp = p.taum * p.beta;
      const Ki = Kp * p.beta / 4;
      const e = p.wRef - w;
      const mRaw = Kp * e + this.z.w;
      const m = MS.clamp(mRaw, -mMax, mMax);
      if (m === mRaw || MS.sgn(e) !== MS.sgn(mRaw)) this.z.w += Ki * e * h;
      return m;
    }

    /** Limit |u| to u_max; returns true if it had to scale. */
    _limit(u) {
      const mag = Math.hypot(u.d, u.q);
      if (mag > this.p.umax) {
        const k = this.p.umax / mag;
        u.d *= k; u.q *= k;
        return true;
      }
      return false;
    }

    /** PI current control in dq with decoupling feed-forward. */
    _controlDQ(h, ref) {
      const p = this.p;
      const [id, iq, w] = this.x;
      const Kp = p.ls * p.alpha, Ki = p.rs * p.alpha;
      const ed = ref.d - id, eq = ref.q - iq;
      const ffd = -w * p.ls * iq;
      const ffq = w * (p.ls * id + p.psiM);
      const u = { d: Kp * ed + this.z.d + ffd, q: Kp * eq + this.z.q + ffq };
      this.sat = this._limit(u);
      if (!this.sat) { this.z.d += Ki * ed * h; this.z.q += Ki * eq * h; }
      this.u = u;
    }

    /** PI current control in the stator frame (for block / DC currents). */
    _controlAB(h, refAB) {
      const p = this.p;
      const [id, iq, w, g] = this.x;
      const c = Math.cos(g), s = Math.sin(g);
      const ia = id * c - iq * s, ib = id * s + iq * c;
      const Kp = p.ls * p.alpha * 2, Ki = p.rs * p.alpha * 2;
      const ea = refAB.re - ia, eb = refAB.im - ib;
      // back-EMF feed-forward jω ψ_M e^{jγ}
      const ffa = -w * p.psiM * s, ffb = w * p.psiM * c;
      const ua = Kp * ea + this.z.a + ffa;
      const ub = Kp * eb + this.z.b + ffb;
      const u = { d: ua * c + ub * s, q: -ua * s + ub * c }; // to dq
      this.sat = this._limit(u);
      if (!this.sat) { this.z.a += Ki * ea * h; this.z.b += Ki * eb * h; }
      this.u = u;
    }

    /** Hall sector 0…5 and the block direction the commutation logic picks. */
    blockFor(gamma, mSign) {
      const want = gamma + MS.sgn(mSign || 1) * Math.PI / 2 + this.p.advance * MS.DEG;
      const k = Math.round((want + Math.PI / 6) / D60);
      const idx = ((k % 6) + 6) % 6;
      return { idx, phi: k * D60 - Math.PI / 6 };
    }

    control(h) {
      const p = this.p;
      if (!this.on) { this.u = { d: 0, q: 0 }; this.sat = false; return; }
      const w = this.x[2], g = this.x[3];
      switch (p.mode) {
        case 'foc': {
          const m = this.torqueReference(h);
          this.mRefNow = m;
          this.iRef = this.currentReference(m, w);
          this._controlDQ(h, this.iRef);
          break;
        }
        case 'bldc': {
          const m = this.torqueReference(h);
          this.mRefNow = m;
          const amp = Math.min(Math.abs(m) / p.psiM, p.imax);
          const blk = this.blockFor(g, m);
          this.sector = blk.idx;
          const ref = MS.C.polar(amp, blk.phi);
          const rdq = MS.C.rot(ref, -g);
          this.iRef = { d: rdq.re, q: rdq.im };
          this._controlAB(h, ref);
          break;
        }
        case 'dc': {
          const ref = MS.C.polar(Math.min(p.dcAmp, p.imax), p.dcAngle * MS.DEG);
          const rdq = MS.C.rot(ref, -g);
          this.iRef = { d: rdq.re, q: rdq.im };
          this._controlAB(h, ref);
          break;
        }
        case 'uf': {
          const step = p.ufRamp * h;
          this.wsNow += MS.clamp(p.ufTarget - this.wsNow, -step, step);
          break;
        }
        default:
          break;
      }
    }

    ufAmplitude() {
      const p = this.p;
      return Math.min(p.umax, p.boost + p.kuf * Math.abs(this.wsNow));
    }

    // ------------------------------------------------------------ plant

    voltageDQ(x) {
      const p = this.p;
      if (!this.on) return null; // open terminals
      if (p.mode === 'uf') {
        const u = this.ufAmplitude();
        const d = x[4] - x[3];
        return { d: u * Math.cos(d), q: u * Math.sin(d) };
      }
      if (p.mode === 'passive') {
        if (p.open) return null;
        return { d: -p.rL * x[0], q: -p.rL * x[1] };
      }
      return this.u;
    }

    derivs(t, x, dx) {
      const p = this.p;
      const [id, iq, w] = x;
      const u = this.voltageDQ(x);
      if (u) {
        dx[0] = (u.d - p.rs * id + w * p.ls * iq) / p.ls;
        dx[1] = (u.q - p.rs * iq - w * p.ls * id - w * p.psiM) / p.ls;
      } else {
        dx[0] = 0; dx[1] = 0;
      }
      const m = p.psiM * iq;
      if (p.speedMode === 'imposed') dx[2] = (p.wSet - w) / 20;
      else dx[2] = (m - this.loadTorque(w) - p.kf * w) / p.taum;
      dx[3] = w;
      dx[4] = this.wsNow;
    }

    /** Advance by Δτ (normalised time). */
    advance(dTau) {
      const h0 = 0.02;
      const n = Math.max(1, Math.ceil(dTau / h0));
      const h = dTau / n;
      const f = (t, x, dx) => this.derivs(t, x, dx);
      for (let i = 0; i < n; i++) {
        this.control(h);
        MS.rk4(f, this.x, this.t, h);
        this.t += h;
        if (!this.voltageDQ(this.x)) { this.x[0] = 0; this.x[1] = 0; }
      }
      // keep angles bounded
      if (Math.abs(this.x[3]) > 1e4) {
        const k = MS.TAU * Math.round(this.x[3] / MS.TAU);
        this.x[3] -= k; this.x[4] -= k;
      }
      if (this.p.mode === 'uf' && this.on) {
        const slip = Math.abs(this.x[2] - this.wsNow);
        this.slipTime = slip > 0.1 ? this.slipTime + dTau : 0;
      } else this.slipTime = 0;
    }

    outputs() {
      const p = this.p;
      const C = MS.C;
      const [id, iq, w, g, thU] = this.x;
      const uRaw = this.voltageDQ(this.x);
      const u = uRaw ? { d: uRaw.d, q: uRaw.q } : { d: 0, q: w * p.psiM }; // open: u = jωψ_M
      const iDQ = C(id, iq);
      const uDQ = C(u.d, u.q);
      const psiDQ = C(p.ls * id + p.psiM, p.ls * iq);
      const iAB = C.rot(iDQ, g), uAB = C.rot(uDQ, g), psiAB = C.rot(psiDQ, g);
      const m = p.psiM * iq;
      const mL = this.loadTorque(w);
      const absI = C.abs(iDQ), absU = C.abs(uDQ);
      return {
        t: this.t, w, gamma: g, thetaU: thU, id, iq, iDQ, uDQ, psiDQ, iAB, uAB, psiAB,
        absI, absU, absPsi: C.abs(psiDQ), m, mL, mF: p.kf * w,
        i1: C.toPhase(iAB, 1), i2: C.toPhase(iAB, 2), i3: C.toPhase(iAB, 3),
        u1: C.toPhase(uAB, 1), u2: C.toPhase(uAB, 2), u3: C.toPhase(uAB, 3),
        pel: u.d * id + u.q * iq, pmech: m * w, pcu: p.rs * absI * absI,
        cosphi: absI > 1e-6 && absU > 1e-6 ? (u.d * id + u.q * iq) / (absI * absU) : NaN,
        sat: this.on && this.sat, iRef: this.iRef, mRef: this.mRefNow,
        fieldWeakening: this.on && p.mode === 'foc' && this.iRef.d < -0.02,
        sector: this.sector, ws: this.wsNow, uAmp: p.mode === 'uf' ? this.ufAmplitude() : absU,
        pulledOut: this.slipTime > 60,
      };
    }

    // ------------------------------------------------------------ static

    /** Steady-state voltage for a current in dq at speed w (rotor frame). */
    steadyVoltage(id, iq, w) {
      const p = this.p;
      return { d: p.rs * id - w * p.ls * iq, q: p.rs * iq + w * (p.ls * id + p.psiM) };
    }

    /**
     * Feasible i_q interval for a given i_d at speed w with |u| ≤ u_max and
     * |i| ≤ i_max (steady state, r_S included). Returns null if infeasible.
     *   |u|² = a i_q² + b i_q + c,  a = r² + ω²l²,  b = 2 r ω ψ_M,
     *   c = r² i_d² + ω²(l i_d + ψ_M)²
     */
    iqWindow(id, w, umax = this.p.umax, imax = this.p.imax) {
      const p = this.p;
      if (Math.abs(id) > imax) return null;
      const a = p.rs * p.rs + w * w * p.ls * p.ls;
      const b = 2 * p.rs * w * p.psiM;
      const c = p.rs * p.rs * id * id + w * w * (p.ls * id + p.psiM) ** 2 - umax * umax;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      const q1 = (-b - sq) / (2 * a), q2 = (-b + sq) / (2 * a);
      const lim = Math.sqrt(imax * imax - id * id);
      const lo = Math.max(q1, -lim), hi = Math.min(q2, lim);
      return lo <= hi ? { lo, hi } : null;
    }

    /**
     * Grenzkennlinie: maximum motoring / braking torque over speed.
     * strategy 'zero' → i_d = 0 only; 'fw' → best i_d ≤ 0 (Feldschwächung).
     */
    envelope(strategy, wMin, wMax, N = 160) {
      const p = this.p;
      const out = [];
      for (let k = 0; k <= N; k++) {
        const w = wMin + ((wMax - wMin) * k) / N;
        let mMax = NaN, mMin = NaN;
        const ids = strategy === 'zero' ? [0] : MS.linspace(-p.imax, 0, 121);
        for (const id of ids) {
          const win = this.iqWindow(id, w);
          if (!win) continue;
          if (!(win.hi <= mMax / p.psiM)) mMax = win.hi * p.psiM;
          if (!(win.lo >= mMin / p.psiM)) mMin = win.lo * p.psiM;
        }
        out.push({ w, mMax, mMin });
      }
      return out;
    }

    /**
     * Spannungsgrenze in the current plane at speed w: closed curve of all
     * (i_d, i_q) with |u| = u_max in steady state (exact, with r_S).
     */
    voltageLimitLocus(w, N = 240) {
      const p = this.p;
      if (Math.abs(w) < 1e-4) return null;
      // Without r_S it is a circle around −ψ_M/l_S with radius u_max/(|ω| l_S);
      // sample around that and solve for the exact radius along each ray.
      const cx = -p.psiM / p.ls;
      const R0 = p.umax / (Math.abs(w) * p.ls);
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const phi = (k / N) * MS.TAU;
        const dirx = Math.cos(phi), diry = Math.sin(phi);
        const f = (r) => {
          const v = this.steadyVoltage(cx + r * dirx, r * diry, w);
          return Math.hypot(v.d, v.q) - p.umax;
        };
        if (f(0) > 0) continue;
        let hi = R0 * 1.5 + 1;
        while (f(hi) < 0 && hi < 1e3) hi *= 2;
        const r = MS.bisect(f, 0, hi, 1e-7, 80);
        pts.push({ id: cx + r * dirx, iq: r * diry });
      }
      return { pts, cx, R0 };
    }

    /** Stationary short circuit / resistive load: current and torque at speed w. */
    passiveSteady(w, rL = this.p.rL) {
      const p = this.p;
      const C = MS.C;
      const i = C.div(C(0, -w * p.psiM), C(p.rs + rL, w * p.ls));
      return { i, m: p.psiM * i.im };
    }

    /** m(ω) of the machine on a resistor r_L (0 = Kurzschluss). */
    passiveCurve(rL, wMin, wMax, N = 200) {
      const out = [];
      for (let k = 0; k <= N; k++) {
        const w = wMin + ((wMax - wMin) * k) / N;
        out.push({ w, m: this.passiveSteady(w, rL).m });
      }
      return out;
    }

    /**
     * Polradwinkel-Kennlinie of the voltage-fed PSM:
     *   m(δ) = A sin(δ − ζ) − B,   A = ψ_M u/|Z|,  B = ψ_M² ω r/|Z|²,
     *   Z = r + jωl = |Z| e^{jζ},  δ = angle of u_S ahead of the d axis.
     */
    loadAngleModel(u, w) {
      const p = this.p;
      const Z = Math.hypot(p.rs, w * p.ls);
      const zeta = Math.atan2(w * p.ls, p.rs);
      const A = (p.psiM * u) / Z;
      const B = (p.psiM * p.psiM * w * p.rs) / (Z * Z);
      return {
        A, B, zeta,
        m: (delta) => A * Math.sin(delta - zeta) - B,
        mKipp: A - B,
        deltaKipp: zeta + Math.PI / 2,
      };
    }

    /** Stationary operating point of the U/f-fed machine (stable branch), or null. */
    ufSteady(ws, u, mL) {
      const p = this.p;
      const lam = this.loadAngleModel(u, ws);
      const s = (mL + lam.B) / lam.A;
      if (!(Math.abs(s) <= 1)) return null;
      const delta = lam.zeta + Math.asin(s);
      const C = MS.C;
      const uDQ = C.polar(u, delta);
      const i = C.div(C.sub(uDQ, C(0, ws * p.psiM)), C(p.rs, ws * p.ls));
      return { delta, id: i.re, iq: i.im, m: p.psiM * i.im };
    }

    /**
     * Linearised U/f system around its operating point – 4th order in
     * [Δi_d, Δi_q, Δω, Δδ] with δ = θ_u − γ_m. Returns {A, eig, op} or null.
     */
    linearize(ws, u = Math.min(this.p.umax, this.p.boost + this.p.kuf * Math.abs(ws)), mL = null) {
      const p = this.p;
      const load = mL === null ? this.loadTorque(ws) : mL;
      const op = this.ufSteady(ws, u, load);
      if (!op) return null;
      const { id, iq, delta } = op;
      const l = p.ls, r = p.rs;
      const dL = (p.loadOn ? loads.slope(p.load, ws) : 0) + p.kf;
      const A = [
        [-r / l, ws, iq, (-u * Math.sin(delta)) / l],
        [-ws, -r / l, -id - p.psiM / l, (u * Math.cos(delta)) / l],
        [0, p.psiM / p.taum, -dL / p.taum, 0],
        [0, 0, -1, 0],
      ];
      const ev = MS.linalg.eig(A);
      return { A, eig: ev, op, stable: ev.every((e) => e.re < 1e-9) };
    }

    /** Eigenvalues over a sweep of synchronous speed (Wurzelortskurve). */
    rootLocus(wMin = 0.02, wMax = 1.6, N = 80) {
      const out = [];
      for (let k = 0; k <= N; k++) {
        const ws = wMin + ((wMax - wMin) * k) / N;
        const lin = this.linearize(ws);
        if (lin) out.push({ ws, eig: lin.eig, stable: lin.stable });
      }
      return out;
    }

    /** Physical scaling (Bezugsgrößen) from the nameplate. */
    reference() {
      const p = this.p;
      const OmegaBez = MS.TAU * p.fN;
      const UBez = (Math.SQRT2 * p.UN) / Math.sqrt(3); // star connection
      const IBez = Math.SQRT2 * p.IN;
      const polePairs = Math.max(1, Math.round((60 * p.fN) / p.nN));
      const MBez = (1.5 * UBez * IBez * polePairs) / OmegaBez;
      return { OmegaBez, tBez: 1 / OmegaBez, UBez, IBez, RBez: UBez / IBez, polePairs, MBez };
    }
  }

  MS.psm = { MODES, BLOCKS, defaults, PSM };
})(typeof globalThis !== 'undefined' ? globalThis : window);
