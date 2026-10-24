/*
 * Maschinenlabor – shared namespace and small numeric helpers.
 *
 * All modules are plain scripts that attach to `globalThis.MS`, so the app
 * runs straight from the file system (no build step, no server) and the
 * physics can be required from Node for the tests.
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});

  MS.TAU = Math.PI * 2;
  MS.DEG = Math.PI / 180;

  MS.clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  MS.lerp = (a, b, t) => a + (b - a) * t;
  MS.sgn = (x) => (x > 0) - (x < 0);

  /** Wraps an angle to (-π, π]. */
  MS.wrap = (a) => {
    a = (a + Math.PI) % MS.TAU;
    if (a < 0) a += MS.TAU;
    return a - Math.PI;
  };

  MS.rpmToRad = (n) => (n * MS.TAU) / 60;
  MS.radToRpm = (w) => (w * 60) / MS.TAU;

  /** Bisection on a bracketing interval [a, b]; returns the root. */
  MS.bisect = (f, a, b, tol = 1e-10, maxIt = 200) => {
    let fa = f(a);
    for (let i = 0; i < maxIt; i++) {
      const m = 0.5 * (a + b);
      const fm = f(m);
      if (fm === 0 || (b - a) * 0.5 < tol) return m;
      if (MS.sgn(fm) === MS.sgn(fa)) { a = m; fa = fm; } else { b = m; }
    }
    return 0.5 * (a + b);
  };

  /**
   * All sign changes of f on [a, b], sampled with n intervals and refined by
   * bisection. Good enough for the smooth 1-D balance equations used here.
   */
  MS.findRoots = (f, a, b, n = 400) => {
    const roots = [];
    let x0 = a;
    let f0 = f(x0);
    for (let i = 1; i <= n; i++) {
      const x1 = a + ((b - a) * i) / n;
      const f1 = f(x1);
      if (Number.isFinite(f0) && Number.isFinite(f1)) {
        if (f0 === 0) roots.push(x0);
        else if (MS.sgn(f0) !== MS.sgn(f1) && f1 !== 0) roots.push(MS.bisect(f, x0, x1));
      }
      x0 = x1;
      f0 = f1;
    }
    return roots;
  };

  /** Evenly spaced samples, like numpy.linspace. */
  MS.linspace = (a, b, n) => {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
    return out;
  };

  /**
   * Classic 4th-order Runge–Kutta step for dx/dt = f(t, x).
   * `f(t, x, dx)` writes the derivative into dx. Work arrays are cached on the
   * function object per state length so the inner loop does not allocate.
   */
  MS.rk4 = function rk4(f, x, t, h) {
    const n = x.length;
    let ws = rk4._ws[n];
    if (!ws) {
      ws = rk4._ws[n] = {
        k1: new Float64Array(n), k2: new Float64Array(n),
        k3: new Float64Array(n), k4: new Float64Array(n), tmp: new Float64Array(n),
      };
    }
    const { k1, k2, k3, k4, tmp } = ws;
    f(t, x, k1);
    for (let i = 0; i < n; i++) tmp[i] = x[i] + 0.5 * h * k1[i];
    f(t + 0.5 * h, tmp, k2);
    for (let i = 0; i < n; i++) tmp[i] = x[i] + 0.5 * h * k2[i];
    f(t + 0.5 * h, tmp, k3);
    for (let i = 0; i < n; i++) tmp[i] = x[i] + h * k3[i];
    f(t + h, tmp, k4);
    for (let i = 0; i < n; i++) x[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
  MS.rk4._ws = {};
})(typeof globalThis !== 'undefined' ? globalThis : window);
