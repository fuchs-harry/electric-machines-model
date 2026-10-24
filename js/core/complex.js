/*
 * Tiny complex-number helpers for space vectors (Raumzeiger).
 * Values are plain objects {re, im}; every function returns a new object.
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});

  const C = (re = 0, im = 0) => ({ re, im });
  C.polar = (r, phi) => ({ re: r * Math.cos(phi), im: r * Math.sin(phi) });
  C.add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
  C.sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
  C.mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  C.div = (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  };
  C.scale = (a, k) => ({ re: a.re * k, im: a.im * k });
  C.conj = (a) => ({ re: a.re, im: -a.im });
  C.abs = (a) => Math.hypot(a.re, a.im);
  C.arg = (a) => Math.atan2(a.im, a.re);
  /** Multiply by e^{jφ} (rotate). */
  C.rot = (a, phi) => {
    const c = Math.cos(phi), s = Math.sin(phi);
    return { re: a.re * c - a.im * s, im: a.re * s + a.im * c };
  };
  /** Multiply by j (90° ahead). */
  C.j = (a) => ({ re: -a.im, im: a.re });

  /** Space vector from three phase values: x = 2/3 (x1 + x2 e^{j120°} + x3 e^{j240°}). */
  C.fromPhases = (x1, x2, x3) => ({
    re: (2 / 3) * (x1 - 0.5 * x2 - 0.5 * x3),
    im: (2 / 3) * ((Math.sqrt(3) / 2) * (x2 - x3)),
  });
  /** Phase value k (1, 2, 3) as projection: x_k = Re{x e^{-j(k-1)120°}}. */
  C.toPhase = (a, k) => {
    const phi = -((k - 1) * 2 * Math.PI) / 3;
    return a.re * Math.cos(phi) - a.im * Math.sin(phi);
  };

  MS.C = C;
})(typeof globalThis !== 'undefined' ? globalThis : window);
