/*
 * Physics checks against hand calculations (textbook-style examples).
 * Run: node --test   (no dependencies)
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/core/ms.js');
require('../js/core/complex.js');
require('../js/core/linalg.js');
require('../js/physics/magnet.js');
require('../js/physics/loads.js');
require('../js/physics/dc.js');
require('../js/physics/psm.js');

const MS = globalThis.MS;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// ------------------------------------------------------------------ core

test('space vector of symmetric phase values', () => {
  const v = MS.C.fromPhases(1, -0.5, -0.5);
  close(v.re, 1, 1e-12, 're');
  close(v.im, 0, 1e-12, 'im');
  // round trip
  const x = MS.C.polar(0.8, 240 * MS.DEG);
  close(MS.C.toPhase(x, 1), -0.4, 1e-12, 'i1');
  close(MS.C.toPhase(x, 2), -0.4, 1e-12, 'i2');
  close(MS.C.toPhase(x, 3), 0.8, 1e-12, 'i3');
});

test('block current (+1, −1, 0) gives 2/√3 at −30°', () => {
  const v = MS.C.fromPhases(1, -1, 0);
  close(MS.C.abs(v), 2 / Math.sqrt(3), 1e-12, '|i|');
  close(MS.C.arg(v) / MS.DEG, -30, 1e-9, 'angle');
});

test('eigenvalues of a known matrix', () => {
  // companion-like block diagonal: eig = {-1, -2, ±3j}
  const A = [
    [-1, 0, 0, 0],
    [0, -2, 0, 0],
    [0, 0, 0, 3],
    [0, 0, -3, 0],
  ];
  const ev = MS.linalg.eig(A);
  const re = ev.map((e) => Math.round(e.re * 1e6) / 1e6 + 0).sort();
  assert.deepEqual(re, [-2, -1, 0, 0].sort());
  const im = ev.map((e) => Math.abs(e.im)).sort((a, b) => a - b);
  close(im[3], 3, 1e-6, 'imag');
});

// ------------------------------------------------------------------ DC machine

test('PM DC machine: no-load speed, rated point, generator', () => {
  const m = new MS.dc.DCMachine('pm', { k1PhiPM: 0.72, RA: 0.3, UA: 48 });
  close(m.noLoadSpeed(), 4000, 1e-9, 'n0 = 60 U / k1Φ');
  m.switchOn();
  // half rated torque at 3000 rpm → I = 5 A → U = 37.5 V
  const c = 0.72 / MS.TAU;
  close(c * 5 * MS.TAU / 0.72, 5, 1e-12, 'torque constant');
  m.p.UA = 37.5;
  close(m.noLoadSpeed(), 3125, 1e-9, 'unloaded speed after load drop');
  // generator: driven at 4500 rpm on 48 V → I = −20 A, M = −2.29 Nm
  m.p.UA = 48;
  const IA = m.currentAtSpeed(MS.rpmToRad(4500));
  close(IA, -20, 1e-6, 'I_A generator');
  close(m.steadyAt(IA).M, -2.2918, 1e-3, 'M generator');
});

test('PM DC machine: direct start current and dynamic run-up', () => {
  const m = new MS.dc.DCMachine('pm', { load: { type: 'none', M0: 0, wRef: 1 }, kF: 0, MC: 0 });
  m.switchOn();
  let peak = 0;
  for (let k = 0; k < 2000; k++) { m.advance(1e-4); peak = Math.max(peak, m.x[0]); }
  // with L_A the peak stays below the ideal U/R_A = 160 A but is of that order
  assert.ok(peak > 80 && peak < 160, 'peak current ' + peak);
  for (let k = 0; k < 40; k++) m.advance(0.01);
  close(m.outputs().n, 4000, 5, 'settles at n0');
});

test('DC machine: steady state of the dynamic model equals the operating point', () => {
  for (const type of ['pm', 'fremd', 'neben', 'reihen']) {
    const m = new MS.dc.DCMachine(type);
    m.switchOn();
    for (let k = 0; k < 400; k++) m.advance(0.01);
    const ops = m.operatingPoints().filter((o) => o.stable);
    assert.ok(ops.length >= 1, type + ': has a stable operating point');
    const o = m.outputs();
    const op = ops.reduce((a, b) => (Math.abs(b.n - o.n) < Math.abs(a.n - o.n) ? b : a));
    close(o.n, op.n, Math.max(3, 0.003 * Math.abs(op.n)), type + ' speed');
    close(o.IA, op.IA, 0.05 + 0.005 * Math.abs(op.IA), type + ' current');
  }
});

test('shunt machine: field rheostat doubles n0 (unsaturated idea)', () => {
  const lin = MS.magnet.pointsCurve([[0, 0], [4, 400]], 1500); // linear curve
  const m = new MS.dc.DCMachine('neben', { curve: lin, UA: 220, RE: 110, RVE: 0 });
  const n1 = m.noLoadSpeed();
  m.p.RVE = 110;
  const n2 = m.noLoadSpeed();
  close(n2 / n1, 2, 1e-9, 'n0 ratio');
});

test('series machine: speed at given current from the magnetization curve', () => {
  // U_iK(20 A) = 82.5 V, U_iK(40 A) = 100 V at n_K = 2000, U = 220 V, R_i = 0.5 Ω
  const curve = MS.magnet.pointsCurve([[0, 0], [20, 82.5], [40, 100], [48, 102.3]], 2000);
  const m = new MS.dc.DCMachine('reihen', { curve, UA: 220, RA: 0.3, RE: 0.2 });
  const a = m.steadyAt(20);
  close(a.n, 5090.9, 0.5, 'n @ 20 A');
  close(a.M, 7.878, 1e-3, 'M @ 20 A');
  const b = m.steadyAt(40);
  close(b.n, 4000, 1e-6, 'n @ 40 A');
  close(b.M, 19.099, 1e-3, 'M @ 40 A');
});

test('series machine: reversing the supply keeps the torque direction', () => {
  const m = new MS.dc.DCMachine('reihen', { UA: -220 });
  const pts = m.characteristic(200).filter((p) => Math.abs(p.n) < 1e5);
  assert.ok(pts.every((p) => p.M >= -1e-9), 'torque stays ≥ 0');
});

test('shunt generator self-excites only below the critical resistance', () => {
  const m = new MS.dc.DCMachine('neben', { supply: 'load', RL: MS.dc.R_OPEN });
  m.p.curve = MS.magnet.tanhCurve({ Usat: 260, Ik: 2, Urem: 5, nK: 1500 });
  const se = m.selfExcitation(1500);
  assert.ok(se.U0 > 150, 'builds up voltage, U0=' + se.U0);
  m.p.RVE = se.Rcrit * 1.5;
  const se2 = m.selfExcitation(1500);
  assert.ok(se2.U0 < 30, 'stays at remanence level, U0=' + se2.U0);
});

// ------------------------------------------------------------------ PSM

test('PSM short circuit (r=0.05, l=0.3, ω=1)', () => {
  const m = new MS.psm.PSM();
  const s = m.passiveSteady(1, 0);
  close(s.i.re, -3.243, 1e-3, 'i_d');
  close(s.i.im, -0.541, 1e-3, 'i_q');
  close(s.m, -0.541, 1e-3, 'm');
  // limit for ω → ∞ is −1/l_S
  close(m.passiveSteady(1e4, 0).i.re, -1 / 0.3, 1e-3, 'limit');
});

test('PSM sinus operation m = 1 at ω = 1', () => {
  const m = new MS.psm.PSM();
  const u = m.steadyVoltage(0, 1, 1);
  close(u.d, -0.3, 1e-12, 'u_d');
  close(u.q, 1.05, 1e-12, 'u_q');
  close(Math.hypot(u.d, u.q), 1.092, 1e-3, '|u|');
});

test('PSM FOC: speed loop reaches its setpoint and the current is torque-forming', () => {
  const m = new MS.psm.PSM({ ref: 'speed', wRef: 0.6, load: { type: 'friction', M0: 0.4, wRef: 1 } });
  m.switchOn();
  for (let k = 0; k < 300; k++) m.advance(10);
  const o = m.outputs();
  close(o.w, 0.6, 2e-3, 'ω');
  close(o.m, 0.4 + 0.004 * 0.6, 5e-3, 'm = m_L + friction');
  close(o.id, 0, 5e-3, 'i_d = 0 below base speed');
});

test('PSM FOC: field weakening reaches speeds the i_d = 0 strategy cannot', () => {
  const run = (idMode) => {
    const m = new MS.psm.PSM({ idMode, ref: 'speed', wRef: 1.6, umax: 1.0, load: { type: 'none', M0: 0, wRef: 1 } });
    m.switchOn();
    for (let k = 0; k < 600; k++) m.advance(10);
    return m.outputs();
  };
  const z = run('zero');
  const fw = run('auto');
  assert.ok(z.w < 1.05, 'i_d = 0 stuck near u_max/ψ_M, ω=' + z.w);
  assert.ok(fw.w > 1.5, 'field weakening gets further, ω=' + fw.w);
  assert.ok(fw.id < -0.1, 'negative i_d');
});

test('PSM BLDC: torque ripple between sin 60° and 1', () => {
  const m = new MS.psm.PSM({ mode: 'bldc', ref: 'torque', mRef: 1, speedMode: 'imposed', wSet: 0.05 });
  m.x[2] = 0.05;
  m.switchOn();
  let mMin = Infinity, mMax = -Infinity;
  for (let k = 0; k < 4000; k++) {
    m.advance(0.1);
    if (k > 500) { const o = m.outputs(); mMin = Math.min(mMin, o.m); mMax = Math.max(mMax, o.m); }
  }
  close(mMax, 1, 0.03, 'max');
  close(mMin, Math.sin(Math.PI / 3), 0.04, 'min');
});

test('PSM U/f: linearised eigenvalues predict the simulated behaviour', () => {
  const m = new MS.psm.PSM({ mode: 'uf', load: { type: 'none', M0: 0, wRef: 1 }, kf: 0, boost: 0 });
  const lin = m.linearize(0.6, 0.6, 0);
  assert.ok(lin, 'operating point exists');
  // start at the operating point with a small disturbance and compare growth
  const sim = new MS.psm.PSM({ ...m.p, ufTarget: 0.6, ufRamp: 0 });
  sim.switchOn();
  sim.wsNow = 0.6;
  sim.x[0] = lin.op.id; sim.x[1] = lin.op.iq; sim.x[2] = 0.6; sim.x[3] = 0; sim.x[4] = lin.op.delta;
  sim.x[2] += 1e-3;
  const amp = (s) => Math.abs(s.x[2] - 0.6);
  const a0 = amp(sim);
  for (let k = 0; k < 200; k++) sim.advance(1);
  const a1 = amp(sim);
  const growth = Math.log(Math.max(a1, 1e-12) / a0) / 200;
  const lead = lin.eig[0].re;
  if (lead > 1e-3) assert.ok(growth > 0, `unstable: λ=${lead}, growth=${growth}`);
  if (lead < -1e-3) assert.ok(a1 < 3 * a0, `stable: λ=${lead}`);
});

test('PSM envelope: field weakening widens the torque–speed area', () => {
  const m = new MS.psm.PSM({ umax: 1.0 });
  const z = m.envelope('zero', 0, 2, 40);
  const f = m.envelope('fw', 0, 2, 40);
  const at = (arr, w) => arr.reduce((a, b) => (Math.abs(b.w - w) < Math.abs(a.w - w) ? b : a));
  assert.ok(!(at(z, 1.2).mMax > 0), 'no torque at ω=1.2 with i_d=0');
  assert.ok(at(f, 1.2).mMax > 0.3, 'field weakening still gives torque');
  close(at(f, 0.2).mMax, 1.5, 1e-6, 'current limit at low speed');
});
