/*
 * Load torque characteristics M_L(ω). Positive M_L brakes positive speed.
 * Shared by the DC machine (SI units) and the PSM (per-unit): `M0` is the
 * load torque at the reference speed `wRef` (rated speed), in the model's unit.
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});

  const TYPES = {
    none: { label: 'Keine Last', hint: 'Leerlauf – nur Reibung' },
    hoist: { label: 'Hubwerk (konstant)', hint: 'Aktive Last: wirkt auch im Stillstand und kann rückwärts ziehen' },
    friction: { label: 'Reibung (konstant)', hint: 'Passive Last: wirkt immer gegen die Drehrichtung' },
    linear: { label: 'Linear (∝ n)', hint: 'z. B. Kalander, Generator auf Widerstand' },
    fan: { label: 'Lüfter / Pumpe (∝ n²)', hint: 'Strömungsmaschinen' },
    power: { label: 'Konstante Leistung (∝ 1/n)', hint: 'z. B. Wickler, Spindel; bei kleinen Drehzahlen begrenzt' },
  };

  /** Smooth sign so stiction does not make the ODE stiff. */
  const ssign = (w, eps) => Math.tanh(w / eps);

  /**
   * Load torque.
   * @param {{type:string, M0:number, wRef:number}} load
   * @param {number} w angular speed (same unit as wRef)
   */
  const torque = (load, w) => {
    const { type, M0, wRef } = load;
    const x = w / wRef;
    switch (type) {
      case 'hoist': return M0;
      case 'friction': return M0 * ssign(w, 0.01 * wRef);
      case 'linear': return M0 * x;
      case 'fan': return M0 * x * Math.abs(x);
      case 'power': return (M0 * ssign(w, 0.01 * wRef)) / Math.max(Math.abs(x), 0.2);
      default: return 0;
    }
  };

  /** dM_L/dω, numerically (used for stability checks). */
  const slope = (load, w) => {
    const h = 1e-4 * Math.max(Math.abs(w), load.wRef);
    return (torque(load, w + h) - torque(load, w - h)) / (2 * h);
  };

  MS.loads = { TYPES, torque, slope };
})(typeof globalThis !== 'undefined' ? globalThis : window);
