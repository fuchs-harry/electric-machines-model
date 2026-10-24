/*
 * Eigenvalues of small real matrices (used for the stability analysis of the
 * voltage-controlled PSM). Characteristic polynomial via Faddeev–LeVerrier,
 * roots via Durand–Kerner. Plenty for n <= 6.
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});

  const matMul = (A, B) => {
    const n = A.length;
    const R = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let k = 0; k < n; k++) {
        const a = A[i][k];
        if (a === 0) continue;
        for (let j = 0; j < n; j++) R[i][j] += a * B[k][j];
      }
    return R;
  };

  /**
   * Coefficients of det(λI − A) = λ^n + c[1] λ^{n-1} + … + c[n], with c[0] = 1.
   */
  const charPoly = (A) => {
    const n = A.length;
    const c = new Array(n + 1).fill(0);
    c[0] = 1;
    let M = Array.from({ length: n }, () => new Array(n).fill(0)); // M_0 = 0
    for (let k = 1; k <= n; k++) {
      // M_k = A M_{k-1} + c_{k-1} I
      const AM = matMul(A, M);
      for (let i = 0; i < n; i++) AM[i][i] += c[k - 1];
      M = AM;
      const AMk = matMul(A, M);
      let tr = 0;
      for (let i = 0; i < n; i++) tr += AMk[i][i];
      c[k] = -tr / k;
    }
    return c;
  };

  /** Roots of a monic polynomial with coefficients c (c[0] = 1) as [{re, im}]. */
  const polyRoots = (c) => {
    const C = MS.C;
    const n = c.length - 1;
    // Cauchy bound for the initial circle radius.
    let bound = 0;
    for (let i = 1; i <= n; i++) bound = Math.max(bound, Math.abs(c[i]));
    const r0 = 1 + bound;
    let z = [];
    const seed = C.polar(1, 0.4);
    for (let i = 0; i < n; i++) z.push(C.scale(C.polar(1, (i * 2 * Math.PI) / n + 0.4), 0.5 * r0 + 0.1 * i * C.abs(seed)));
    const evalP = (x) => {
      let acc = C(1, 0);
      for (let i = 1; i <= n; i++) acc = C.add(C.mul(acc, x), C(c[i], 0));
      return acc;
    };
    for (let it = 0; it < 500; it++) {
      let delta = 0;
      const next = z.map((zi, i) => {
        let den = C(1, 0);
        for (let j = 0; j < n; j++) if (j !== i) den = C.mul(den, C.sub(zi, z[j]));
        const step = C.div(evalP(zi), den);
        delta = Math.max(delta, C.abs(step));
        return C.sub(zi, step);
      });
      z = next;
      if (delta < 1e-13 * (1 + r0)) break;
    }
    return z;
  };

  /** Eigenvalues of a real square matrix (array of rows), sorted by real part (descending). */
  const eig = (A) => polyRoots(charPoly(A)).sort((a, b) => b.re - a.re);

  MS.linalg = { matMul, charPoly, polyRoots, eig };
})(typeof globalThis !== 'undefined' ? globalThis : window);
