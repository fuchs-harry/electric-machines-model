/*
 * Leerlaufkennlinie (magnetization curve) U_iK(I_E), measured at speed n_K.
 *
 *   k1Φ(I_E) = U_iK(I_E) · 60 / n_K          [Vs]
 *   c(I_E)   = k1Φ / (2π) = U_iK / Ω_K        [Vs/rad]   (U_i = c·Ω, M = c·I_A)
 *
 * Two kinds of curve:
 *   - 'tanh':   U_iK = U_sat · tanh((I + I_0) / I_k), I_0 chosen so U_iK(0) = U_rem
 *   - 'points': user table [[I, U], …] for I ≥ 0, linear interpolation and
 *               linear extrapolation with the last slope (never decreasing)
 * Negative currents mirror the curve about the remanence point.
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});

  const tanhCurve = ({ Usat, Ik, Urem = 0, nK }) => ({ type: 'tanh', Usat, Ik, Urem, nK });
  const pointsCurve = (points, nK) => ({
    type: 'points',
    points: points.slice().sort((a, b) => a[0] - b[0]),
    nK,
  });

  const evalPoints = (pts, I) => {
    if (I <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (I <= pts[i][0]) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        return y0 + ((y1 - y0) * (I - x0)) / (x1 - x0);
      }
    }
    const n = pts.length;
    const [x0, y0] = pts[n - 2];
    const [x1, y1] = pts[n - 1];
    const slope = Math.max(0, (y1 - y0) / (x1 - x0));
    return y1 + slope * (I - x1);
  };

  /** U_iK at n_K for field current I (A). */
  const UiK = (curve, I) => {
    if (curve.type === 'tanh') {
      const ratio = MS.clamp(curve.Urem / curve.Usat, 0, 0.95);
      const I0 = curve.Ik * Math.atanh(ratio);
      return curve.Usat * Math.tanh((I + I0) / curve.Ik);
    }
    const pts = curve.points;
    const U0 = pts[0][0] === 0 ? pts[0][1] : 0;
    if (I >= 0) return evalPoints(pts, I);
    return 2 * U0 - evalPoints(pts, -I);
  };

  /** k1Φ in Vs. */
  const k1Phi = (curve, I) => (UiK(curve, I) * 60) / curve.nK;
  /** c = k1Φ / 2π in Vs/rad (= Nm/A). */
  const cOf = (curve, I) => k1Phi(curve, I) / MS.TAU;

  /** Remanence voltage U_iK(0). */
  const remanence = (curve) => UiK(curve, 0);

  MS.magnet = { tanhCurve, pointsCurve, UiK, k1Phi, cOf, remanence };
})(typeof globalThis !== 'undefined' ? globalThis : window);
