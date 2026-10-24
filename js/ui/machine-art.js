/*
 * Maschinenlabor – Maschinenmodelle (procedural Canvas-2D cross sections).
 *
 *   MS.art.palette(isDark, override?)  -> colour tokens (quantity colours + materials)
 *   MS.art.drawDC(ctx, opts)           -> Gleichstrommaschine (pm | fremd | neben | reihen)
 *   MS.art.drawPSM(ctx, opts)          -> Permanentmagnet-Synchronmaschine (sinus | bldc)
 *
 * Everything is drawn with paths – no images. The caller hands over a ctx that
 * is already scaled to devicePixelRatio; we draw in CSS pixels inside the
 * {x, y, w, h} box, centred, aspect preserved, transparent background.
 *
 * Angle convention inside this file: "math" angles (x right, y up, counter-
 * clockwise positive). `PX/PY` and `arcM` translate to canvas coordinates, so
 * the physics (right-hand rule, F = I·l × B, torque sense) can be written the
 * way it is in the lecture notes.
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const EMPTY_DASH = [];
  const DASH_AXIS = [3, 4];
  const DASH_PSI = [5, 4];

  // Materials are strictly neutral: colour is reserved for physical quantities.
  const LIGHT = {
    voltage: '#2a78d6', current: '#eb6834', flux: '#1baf7a', torque: '#6250d6', speed: '#008300',
    phase: ['#e34948', '#eda100', '#2a78d6'],
    surface: '#ffffff', page: '#ffffff', ink: '#1d1d1f', ink2: '#6e6e73', hairline: '#d2d2d7',
    iron: '#efefef', ironDeep: '#e0e0e0', ironEdge: '#6f6f6f',
    copper: '#d4d4d4', copperEdge: '#7a7a7a',
    magnetN: '#cdcdcd', magnetS: '#8d8d8d',
    brush: '#2a2a2a', shaft: '#dedede', air: '#ffffff', mark: '#ffffff',
  };
  const DARK = {
    voltage: '#3987e5', current: '#d95926', flux: '#199e70', torque: '#9085e9', speed: '#0ca30c',
    phase: ['#e66767', '#c98500', '#3987e5'],
    surface: '#000000', page: '#000000', ink: '#f5f5f7', ink2: '#98989d', hairline: '#38383a',
    iron: '#1f1f1f', ironDeep: '#2c2c2c', ironEdge: '#8a8a8a',
    copper: '#3c3c3c', copperEdge: '#8f8f8f',
    magnetN: '#5e5e5e', magnetS: '#2e2e2e',
    brush: '#d0d0d0', shaft: '#2a2a2a', air: '#000000', mark: '#ffffff',
  };

  const FONT_UI = 'Inter, -apple-system, "Segoe UI", system-ui, sans-serif';
  const FONT_SYM = '"STIX Two Text", "Times New Roman", serif';

  function palette(isDark, override) {
    const base = isDark ? DARK : LIGHT;
    if (!override) return Object.assign({}, base);
    return Object.assign({}, base, override);
  }

  // ------------------------------------------------------------------ helpers
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const sgn = (x) => (x > 0) - (x < 0);
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  function box(o) {
    const x = num(o.x, 0), y = num(o.y, 0);
    const w = Math.max(40, num(o.w, 300)), h = Math.max(40, num(o.h, w));
    const s = Math.min(w, h);
    return { x, y, w, h, s, cx: x + w / 2, cy: y + h / 2 };
  }
  const hairline = (s) => clamp(s / 320, 1, 1.5);
  const uiFont = (px, weight) => (weight ? weight + ' ' : '') + px + 'px ' + FONT_UI;
  const symFont = (px, italic) => (italic === false ? '' : 'italic ') + px + 'px ' + FONT_SYM;

  const PX = (cx, r, a) => cx + r * Math.cos(a);
  const PY = (cy, r, a) => cy - r * Math.sin(a);
  /** Arc from math angle a0 to a1 (a1 > a0 sweeps counter-clockwise on screen). */
  function arcM(ctx, cx, cy, r, a0, a1) {
    ctx.arc(cx, cy, r, -a0, -a1, a1 > a0);
  }
  function annulusSector(ctx, cx, cy, r0, r1, a0, a1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, -a0, -a1, true);
    ctx.arc(cx, cy, r0, -a1, -a0, false);
    ctx.closePath();
  }
  function ring(ctx, cx, cy, r0, r1, fill, edge, lw) {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, TAU);
    ctx.arc(cx, cy, r0, 0, TAU, true);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = edge;
      ctx.beginPath(); ctx.arc(cx, cy, r1, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.stroke();
    }
  }
  function disc(ctx, cx, cy, r, fill, edge, lw) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) { ctx.lineWidth = lw; ctx.strokeStyle = edge; ctx.stroke(); }
  }
  function faintRing(ctx, cx, cy, r, color, lw) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /** Straight arrow with a filled head. */
  function arrow(ctx, x0, y0, x1, y1, color, lw, head, alpha, dash) {
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    if (L < 0.75) return;
    const ux = dx / L, uy = dy / L;
    const hl = Math.min(head, L * 0.7);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * hl * 0.85, y1 - uy * hl * 0.85);
    ctx.stroke();
    ctx.setLineDash(EMPTY_DASH);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * hl - uy * hl * 0.42, y1 - uy * hl + ux * hl * 0.42);
    ctx.lineTo(x1 - ux * hl + uy * hl * 0.42, y1 - uy * hl - ux * hl * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Curved arrow around (cx, cy): starts at math angle a0, sweeps `sweep` rad (sign = sense). */
  function arcArrow(ctx, cx, cy, r, a0, sweep, color, lw, head, alpha) {
    if (Math.abs(sweep) < 0.02 || r < 2) return;
    const dir = sweep > 0 ? 1 : -1;
    const a1 = a0 + sweep;
    const hAng = Math.min(head / r, Math.abs(sweep) * 0.6);
    const aEnd = a1 - dir * hAng * 0.85;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -a0, -aEnd, dir > 0);
    ctx.stroke();
    const tx = PX(cx, r, a1), ty = PY(cy, r, a1);
    const ux = -Math.sin(a1) * dir, uy = -Math.cos(a1) * dir; // canvas tangent at the tip
    const hl = hAng * r;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - ux * hl - uy * hl * 0.42, ty - uy * hl + ux * hl * 0.42);
    ctx.lineTo(tx - ux * hl + uy * hl * 0.42, ty - uy * hl - ux * hl * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Conductor cross section: ⊙ (dir > 0, towards viewer) or ⊗ (dir < 0, away). */
  function conductor(ctx, x, y, r, dir, fill, edge, mark, alpha, lw) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = edge;
    ctx.stroke();
    if (dir > 0) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.1, r * 0.3), 0, TAU);
      ctx.fillStyle = mark;
      ctx.fill();
    } else if (dir < 0) {
      const k = r * 0.5;
      ctx.beginPath();
      ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
      ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
      ctx.strokeStyle = mark;
      ctx.lineWidth = Math.max(1.1, lw * 1.15);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function text(ctx, str, x, y, px, color, align, weight, baseline) {
    ctx.font = uiFont(px, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(str, x, y);
  }
  /** Italic serif symbol with an optional upright subscript, e.g. ψ_M. */
  function sym(ctx, main, sub, x, y, px, color, align) {
    ctx.font = symFont(px);
    const wm = ctx.measureText(main).width;
    let ws = 0;
    if (sub) { ctx.font = symFont(px * 0.7, false); ws = ctx.measureText(sub).width; }
    const total = wm + ws + (sub ? px * 0.04 : 0);
    let x0 = x;
    if (align === 'center') x0 = x - total / 2;
    else if (align === 'right') x0 = x - total;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.font = symFont(px);
    ctx.fillText(main, x0, y);
    if (sub) {
      ctx.font = symFont(px * 0.7, false);
      ctx.fillText(sub, x0 + wm + px * 0.04, y + px * 0.28);
    }
    return total;
  }

  /** Small speed dial in a corner: curved arrow + "n" / "ω". */
  function speedDial(ctx, x, y, r, speed, P, label, lw) {
    if (!speed) return;
    const a = clamp(Math.abs(speed), 0.25, 1);
    arcArrow(ctx, x, y, r, sgn(speed) > 0 ? -60 * DEG : 240 * DEG, sgn(speed) * 300 * DEG, P.speed, lw * 1.4, r * 0.7, 0.35 + 0.65 * a);
    sym(ctx, label, '', x, y + 0.5, Math.max(9, r * 1.05), P.ink, 'center');
  }

  // ------------------------------------------------------------- DC machine
  const DC_TYPES = ['pm', 'fremd', 'neben', 'reihen'];
  const DC_CAPTION = { pm: 'Permanenterregt', fremd: 'Fremderregt', neben: 'Nebenschluss', reihen: 'Reihenschluss' };

  function drawDC(ctx, o) {
    o = o || {};
    const P = palette(!!o.dark, o.colors);
    const B = box(o);
    const s = B.s, cx = B.cx, cy = B.cy;
    const type = DC_TYPES.indexOf(o.type) >= 0 ? o.type : 'pm';
    const pm = type === 'pm';
    const theta = num(o.theta, 0);
    const ia = clamp(num(o.ia, 0), -3, 3);
    const phi = clamp(num(o.phi, 1), -1.3, 1.3);
    const ie = clamp(num(o.ie, phi), -3, 3);
    const showForces = o.showForces !== false;
    const showFields = o.showFields !== false;
    const labels = o.labels !== false;
    const speed = num(o.speed, 0);
    const torque = num(o.torque, NaN);

    const hl = hairline(s);
    const Ro = 0.40 * s;                     // yoke outer
    const Ry = (pm ? 0.32 : 0.35) * s;       // yoke inner
    const Rr = 0.22 * s;                     // rotor
    const Rg = Rr + 0.012 * s;               // pole face
    const Rc = 0.185 * s;                    // conductor ring
    const rc = 0.021 * s;                    // conductor radius
    const Rk1 = 0.095 * s, Rk0 = 0.064 * s;  // commutator
    const N = 14;
    const lblPx = clamp(s * 0.042, 10, 13);
    const symPx = clamp(s * 0.05, 11, 15);

    ctx.save();
    ctx.lineJoin = 'round';

    // 1 · yoke
    ring(ctx, cx, cy, Ry, Ro, P.iron, P.ironEdge, hl);
    faintRing(ctx, cx, cy, (Ro + Ry) / 2, P.ironDeep, hl);

    // 2 · poles
    if (pm) {
      const beta = 62 * DEG;
      annulusSector(ctx, cx, cy, Rg, Ry + hl * 0.5, Math.PI - beta, Math.PI + beta);
      ctx.fillStyle = P.magnetN; ctx.fill();
      ctx.lineWidth = hl; ctx.strokeStyle = P.ironEdge; ctx.stroke();
      annulusSector(ctx, cx, cy, Rg, Ry + hl * 0.5, -beta, beta);
      ctx.fillStyle = P.magnetS; ctx.fill();
      ctx.lineWidth = hl; ctx.strokeStyle = P.ironEdge; ctx.stroke();
    } else {
      const cw = 0.13 * s, shoeT = 0.045 * s, tipT = 0.022 * s, alpha = 55 * DEG;
      const ca = Math.cos(alpha), sa = Math.sin(alpha);
      const bx0 = -0.335 * s, bx1 = -(Rg + shoeT + 0.005 * s);
      const by0 = cw / 2 + 0.004 * s, by1 = cw / 2 + 0.034 * s;
      for (let side = 0; side < 2; side++) {
        ctx.save();
        ctx.translate(cx, cy);
        if (side === 1) ctx.rotate(Math.PI);
        // pole core + shoe (pole sits on the -x side, facing the centre)
        ctx.beginPath();
        ctx.moveTo(-Ry - hl, -cw / 2);
        ctx.lineTo(-(Rg + shoeT), -cw / 2);
        ctx.lineTo(-(Rg + tipT) * ca, -(Rg + tipT) * sa);
        ctx.arc(0, 0, Rg, Math.PI + alpha, Math.PI - alpha, true);
        ctx.lineTo(-(Rg + tipT) * ca, (Rg + tipT) * sa);
        ctx.lineTo(-(Rg + shoeT), cw / 2);
        ctx.lineTo(-Ry - hl, cw / 2);
        ctx.closePath();
        ctx.fillStyle = P.iron; ctx.fill();
        ctx.lineWidth = hl; ctx.strokeStyle = P.ironEdge; ctx.stroke();
        // field coil bundles above and below the core
        for (let k = -1; k <= 1; k += 2) {
          const y0 = k < 0 ? -by1 : by0, y1 = k < 0 ? -by0 : by1;
          ctx.beginPath();
          ctx.rect(bx0, y0, bx1 - bx0, y1 - y0);
          ctx.fillStyle = P.copper; ctx.fill();
          ctx.lineWidth = hl; ctx.strokeStyle = P.copperEdge; ctx.stroke();
          const turns = type === 'reihen' ? 2 : 5;
          ctx.beginPath();
          for (let t = 1; t < turns; t++) {
            const yy = y0 + (y1 - y0) * t / turns;
            ctx.moveTo(bx0, yy); ctx.lineTo(bx1, yy);
          }
          ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      // field current marks (same sense on both poles: one series circuit)
      if (Math.abs(ie) > 0.02) {
        const bxm = (bx0 + bx1) / 2, bym = (by0 + by1) / 2;
        const rr = Math.max(2.4, 0.012 * s);
        const al = 0.4 + 0.6 * Math.min(1, Math.abs(ie));
        for (let sx = -1; sx <= 1; sx += 2) {
          // top bundle (math +y): current towards viewer for ie > 0 → N pole on the left
          conductor(ctx, cx + sx * Math.abs(bxm), cy - bym, rr, sgn(ie), P.current, P.current, P.mark, al, hl);
          conductor(ctx, cx + sx * Math.abs(bxm), cy + bym, rr, -sgn(ie), P.current, P.current, P.mark, al, hl);
        }
      }
    }

    // 3 · rotor
    disc(ctx, cx, cy, Rr, P.iron, P.ironEdge, hl);
    faintRing(ctx, cx, cy, 0.14 * s, P.ironDeep, hl);

    // 4 · commutator + brushes (brush axis = neutral zone, vertical)
    ring(ctx, cx, cy, Rk0, Rk1, P.copper, P.copperEdge, hl);
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const a = theta + (k + 0.5) * TAU / N;
      ctx.moveTo(PX(cx, Rk0, a), PY(cy, Rk0, a));
      ctx.lineTo(PX(cx, Rk1, a), PY(cy, Rk1, a));
    }
    ctx.lineWidth = Math.max(1, hl * 0.9);
    ctx.strokeStyle = P.air;
    ctx.stroke();
    for (let k = 0; k < 2; k++) {
      const bw = 0.022 * s;
      const yb = k === 0 ? -(Rk1 + 0.027 * s) : Rk1 - 0.004 * s;
      ctx.beginPath();
      ctx.rect(cx - bw, cy + yb, 2 * bw, 0.031 * s);
      ctx.fillStyle = P.brush; ctx.fill();
    }

    // 5 · fields: main flux Φ (N → S) and armature MMF Θ_A (⟂, along the brush axis)
    if (showFields) {
      if (Math.abs(phi) > 0.02) {
        const L = 0.30 * s * clamp(Math.abs(phi), 0.3, 1.3) / 1.3 + 0.03 * s;
        const d = sgn(phi);
        const al = 0.35 + 0.65 * Math.min(1, Math.abs(phi));
        for (let k = -1; k <= 1; k++) {
          const yy = cy + k * 0.07 * s;
          arrow(ctx, cx - d * L / 2, yy, cx + d * L / 2, yy, P.flux, hl * 1.6, 0.026 * s, al);
        }
        if (labels) sym(ctx, 'Φ', '', cx - 0.09 * s, cy - 0.036 * s, symPx, P.ink, 'center');
      }
      if (Math.abs(ia) > 0.02) {
        const L = 0.30 * s * clamp(Math.abs(ia), 0.3, 1) + 0.02 * s;
        const d = sgn(ia); // ia > 0 → armature field points "down" (math −y) → canvas +y
        const al = 0.35 + 0.65 * Math.min(1, Math.abs(ia));
        arrow(ctx, cx, cy - d * L / 2, cx, cy + d * L / 2, P.current, hl * 1.6, 0.026 * s, al);
        if (labels) sym(ctx, 'Θ', 'A', cx + 0.04 * s, cy + d * 0.125 * s, symPx, P.ink, 'left');
      }
    }

    // 6 · armature conductors (rotate with θ, current pattern fixed in space)
    const absIa = Math.abs(ia);
    const curAlpha = 0.35 + 0.65 * Math.min(1, absIa);
    const fLen = absIa * Math.abs(phi);
    for (let k = 0; k < N; k++) {
      const a = theta + k * TAU / N;
      const c = Math.cos(a);
      const x = PX(cx, Rc, a), y = PY(cy, Rc, a);
      const commutating = Math.abs(c) < 0.11;
      if (absIa < 0.02 || commutating) {
        conductor(ctx, x, y, rc, 0, P.copper, P.copperEdge, P.mark, 1, hl);
        continue;
      }
      const dir = (c < 0 ? -1 : 1) * sgn(ia); // under N (left): ⊗ for ia > 0
      conductor(ctx, x, y, rc, dir, P.current, P.current, P.mark, curAlpha, hl);
      if (showForces && fLen > 0.02) {
        const cover = smooth((Math.abs(c) - 0.15) / 0.45); // B is strong only under the pole shoe
        if (cover > 0.05) {
          const sense = sgn(ia * phi);           // ia·phi > 0 → counter-clockwise torque
          const L = (0.018 + 0.045 * Math.min(1.5, fLen)) * s * cover;
          const tx = -Math.sin(a) * sense, ty = -Math.cos(a) * sense; // canvas tangent
          arrow(ctx, x + tx * rc, y + ty * rc, x + tx * (rc + L), y + ty * (rc + L), P.torque, hl * 1.5, Math.max(4, 0.02 * s), 0.9);
        }
      }
    }

    // 7 · torque arc (between the pole tips, top) and speed dial
    if (Number.isFinite(torque) && Math.abs(torque) > 0.02) {
      const sw = sgn(torque) * (0.35 + 0.65 * Math.min(1, Math.abs(torque)));
      arcArrow(ctx, cx, cy, 0.29 * s, Math.PI / 2 - sw / 2, sw, P.torque, hl * 1.8, 0.028 * s, 0.95);
      if (labels) sym(ctx, 'M', '', cx, cy - 0.245 * s, symPx, P.ink, 'center');
    }
    speedDial(ctx, cx + 0.44 * s, cy - 0.44 * s, 0.04 * s, speed, P, 'n', hl);

    // 8 · labels, caption, circuit badge
    if (labels) {
      const px = pm ? 0.28 * s : 0.3 * s;
      text(ctx, 'N', cx - px, cy, lblPx + 2, P.ink, 'center', '600');
      text(ctx, 'S', cx + px, cy, lblPx + 2, P.ink, 'center', '600');
      text(ctx, DC_CAPTION[type], cx - 0.5 * s + 1, cy - 0.5 * s + lblPx * 0.7, lblPx, P.ink2, 'left');
    }
    drawDCBadge(ctx, type, cx + 0.5 * s, cy + 0.5 * s, s, P, hl);

    ctx.restore();
  }

  /** Terminal schematic badge (bottom-right corner), ~0.26s × 0.115s. */
  function drawDCBadge(ctx, type, xr, yb, s, P, hl) {
    const u = s / 100;
    const wb = 26 * u, hb = 11.5 * u;
    const xb = xr - wb, yt = yb - hb;
    const yT = yt + 1.6 * u, yB = yb - 1.6 * u, yM = (yT + yB) / 2;
    const xL = xb + 2.5 * u, xR = xb + wb - 2 * u;
    const r = 2.3 * u;
    ctx.save();
    ctx.lineWidth = Math.max(1, hl * 0.9);
    ctx.strokeStyle = P.ink2;
    ctx.fillStyle = P.ink2;
    ctx.lineCap = 'round';
    const dot = (x, y) => { ctx.beginPath(); ctx.arc(x, y, 0.75 * u, 0, TAU); ctx.fill(); };
    const line = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    const armature = (x, y) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      line(x - r - 0.5 * u, y - 1.1 * u, x - r - 0.5 * u, y + 1.1 * u);
      line(x + r + 0.5 * u, y - 1.1 * u, x + r + 0.5 * u, y + 1.1 * u);
    };
    const coilV = (x, y0, y1, n) => {
      const hr = (y1 - y0) / (2 * n);
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.arc(x, y0 + hr * (2 * i + 1), hr, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    };
    const coilH = (x0, x1, y, n) => {
      const hr = (x1 - x0) / (2 * n);
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.arc(x0 + hr * (2 * i + 1), y, hr, Math.PI, 0);
      ctx.stroke();
    };
    if (type === 'neben') {
      const xA = xb + 10 * u, xE = xb + 19.5 * u;
      dot(xL, yT); dot(xL, yB);
      line(xL, yT, xE, yT); line(xL, yB, xE, yB);
      line(xA, yT, xA, yM - r); line(xA, yM + r, xA, yB); armature(xA, yM);
      line(xE, yT, xE, yM - 2.6 * u); line(xE, yM + 2.6 * u, xE, yB); coilV(xE, yM - 2.6 * u, yM + 2.6 * u, 3);
    } else if (type === 'reihen') {
      dot(xL, yT); dot(xL, yB);
      line(xL, yT, xb + 7 * u, yT); coilH(xb + 7 * u, xb + 14 * u, yT, 3); line(xb + 14 * u, yT, xR, yT);
      line(xR, yT, xR, yM - r); line(xR, yM + r, xR, yB); armature(xR, yM);
      line(xR, yB, xL, yB);
    } else if (type === 'fremd') {
      const xA = xb + 9 * u, xE = xR;
      dot(xL, yT); dot(xL, yB);
      line(xL, yT, xA, yT); line(xL, yB, xA, yB);
      line(xA, yT, xA, yM - r); line(xA, yM + r, xA, yB); armature(xA, yM);
      const xL2 = xb + 15.5 * u;
      dot(xL2, yT); dot(xL2, yB);
      line(xL2, yT, xE, yT); line(xL2, yB, xE, yB);
      line(xE, yT, xE, yM - 2.6 * u); line(xE, yM + 2.6 * u, xE, yB); coilV(xE, yM - 2.6 * u, yM + 2.6 * u, 3);
    } else { // pm
      const xA = xb + 9 * u;
      dot(xL, yT); dot(xL, yB);
      line(xL, yT, xA, yT); line(xL, yB, xA, yB);
      line(xA, yT, xA, yM - r); line(xA, yM + r, xA, yB); armature(xA, yM);
      const mx = xb + 17 * u, mw = 7 * u, mh = 2.4 * u;
      ctx.fillStyle = P.magnetN; ctx.fillRect(mx, yM - mh, mw, mh);
      ctx.fillStyle = P.magnetS; ctx.fillRect(mx, yM, mw, mh);
      ctx.strokeStyle = P.ironEdge; ctx.strokeRect(mx, yM - mh, mw, 2 * mh);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ PSM machine
  const N_SLOTS = 12;
  const BLOCKS = [
    { name: 'A', sig: [1, -1, 0] }, { name: 'B', sig: [1, 0, -1] }, { name: 'C', sig: [0, 1, -1] },
    { name: 'D', sig: [-1, 1, 0] }, { name: 'E', sig: [-1, 0, 1] }, { name: 'F', sig: [0, -1, 1] },
  ];
  const SIGN_CHAR = { '-1': '−', '0': '0', '1': '+' };

  function blockOf(i1, i2, i3) {
    const eps = 0.05;
    const s1 = Math.abs(i1) < eps ? 0 : sgn(i1), s2 = Math.abs(i2) < eps ? 0 : sgn(i2), s3 = Math.abs(i3) < eps ? 0 : sgn(i3);
    for (let b = 0; b < 6; b++) {
      const g = BLOCKS[b].sig;
      if (g[0] === s1 && g[1] === s2 && g[2] === s3) return BLOCKS[b];
    }
    return null;
  }

  function drawPSM(ctx, o) {
    o = o || {};
    const P = palette(!!o.dark, o.colors);
    const B = box(o);
    const s = B.s, cx = B.cx, cy = B.cy;
    const p = num(o.polePairs, 1) >= 2 ? 2 : 1;
    const gamma = num(o.gamma, 0);           // electrical
    const gm = gamma / p;                    // mechanical
    const i1 = clamp(num(o.i1, 0), -2, 2), i2 = clamp(num(o.i2, 0), -2, 2), i3 = clamp(num(o.i3, 0), -2, 2);
    const iVec = o.iVec && Number.isFinite(o.iVec.re) && Number.isFinite(o.iVec.im) ? o.iVec : null;
    const psiS = o.psiS && Number.isFinite(o.psiS.re) && Number.isFinite(o.psiS.im) ? o.psiS : null;
    const uVec = o.uVec && Number.isFinite(o.uVec.re) && Number.isFinite(o.uVec.im) ? o.uVec : null;
    const psiM = clamp(num(o.psiM, 1), 0, 1.5);
    const showAxes = o.showAxes !== false;
    const labels = o.labels !== false;
    const bldc = o.mode === 'bldc';
    const torque = num(o.torque, NaN);
    const speed = num(o.speed, 0);
    let sector = num(o.sector, NaN);
    if (!Number.isFinite(sector)) sector = Math.round(gamma / (60 * DEG));
    sector = ((Math.round(sector) % 6) + 6) % 6;

    const hl = hairline(s);
    const Ro = 0.40 * s;        // stator outer
    const Ry = 0.33 * s;        // slot bottom
    const Rb = 0.265 * s;       // stator bore
    const Rm = 0.25 * s;        // magnet outer
    const Rri = 0.205 * s;      // rotor iron
    const Rsh = 0.05 * s;
    const slotW = 0.026 * s;
    const Rcond = 0.298 * s, rcond = 0.02 * s;
    const unit = 0.19 * s;      // |vector| = 1
    const lblPx = clamp(s * 0.042, 10, 13);
    const symPx = clamp(s * 0.05, 11, 15);
    const Rlabel = 0.47 * s;

    ctx.save();
    ctx.lineJoin = 'round';

    // 1 · stator yoke + teeth (ring down to the bore; slots cut in afterwards)
    ring(ctx, cx, cy, Rb, Ro, P.iron, P.ironEdge, hl);
    faintRing(ctx, cx, cy, (Ro + Ry) / 2 + 0.01 * s, P.ironDeep, hl);

    // 2 · slots with coil sides. Slot k at mech angle (k+0.5)·30°; its electrical
    //     angle decides phase and sense: belt centre φ_q + 90° → ⊙ for i_q > 0.
    for (let k = 0; k < N_SLOTS; k++) {
      const am = (k + 0.5) * TAU / N_SLOTS;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-am);
      const x0 = Rb - 0.006 * s, x1 = Ry;
      ctx.beginPath();
      ctx.moveTo(x0, -slotW);
      ctx.lineTo(x1 - slotW, -slotW);
      ctx.arc(x1 - slotW, 0, slotW, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x0, slotW);
      ctx.closePath();
      ctx.fillStyle = P.air; ctx.fill();
      ctx.lineWidth = hl; ctx.strokeStyle = P.ironEdge; ctx.stroke();
      ctx.restore();
    }
    // the bore edge was covered by the slot openings; redraw it between slots (cheap: full circle under the slots is fine)

    const cur = [i1, i2, i3];
    for (let k = 0; k < N_SLOTS; k++) {
      const am = (k + 0.5) * TAU / N_SLOTS;
      let ae = (am * p) % TAU;
      // which phase belt? belts centred at φ_q ± 90°, 60° wide
      let q = -1, sense = 0;
      for (let qq = 0; qq < 3 && q < 0; qq++) {
        const ax = qq * 120 * DEG;
        for (let ss = -1; ss <= 1; ss += 2) {
          let d = ae - (ax + ss * Math.PI / 2);
          d = Math.abs(((d + Math.PI) % TAU + TAU) % TAU - Math.PI);
          if (d < 30 * DEG + 1e-6) { q = qq; sense = ss; break; }
        }
      }
      if (q < 0) continue;
      const x = PX(cx, Rcond, am), y = PY(cy, Rcond, am);
      const ik = cur[q];
      if (Math.abs(ik) < 0.02) {
        conductor(ctx, x, y, rcond, 0, P.copper, P.copperEdge, P.mark, 1, hl);
      } else {
        const al = 0.35 + 0.65 * Math.min(1, Math.abs(ik));
        conductor(ctx, x, y, rcond, sense * sgn(ik), P.phase[q], P.phase[q], P.mark, al, hl);
      }
      if (labels) {
        text(ctx, String(q + 1), PX(cx, 0.362 * s, am), PY(cy, 0.362 * s, am), Math.max(8, lblPx - 2), P.ink2, 'center');
      }
    }

    // 3 · rotor: iron, surface magnets (N = rose, S = slate), shaft
    disc(ctx, cx, cy, Rri + 0.004 * s, P.iron, P.ironEdge, hl);
    const nMag = 2 * p;
    const span = (p === 1 ? 150 : 76) * DEG;
    for (let m = 0; m < nMag; m++) {
      const a0 = gm + m * Math.PI / p;
      annulusSector(ctx, cx, cy, Rri, Rm, a0 - span / 2, a0 + span / 2);
      ctx.fillStyle = m % 2 === 0 ? P.magnetN : P.magnetS;
      ctx.fill();
      ctx.lineWidth = hl; ctx.strokeStyle = P.ironEdge; ctx.stroke();
      if (labels) {
        const rl = (Rri + Rm) / 2;
        text(ctx, m % 2 === 0 ? 'N' : 'S', PX(cx, rl, a0), PY(cy, rl, a0), Math.max(8, lblPx - (p === 2 ? 3 : 1)), P.ink, 'center', '600');
      }
    }
    faintRing(ctx, cx, cy, 0.13 * s, P.ironDeep, hl);
    disc(ctx, cx, cy, Rsh, P.shaft, P.ironEdge, hl);

    // 4 · BLDC: Hall sectors (60° electrical wedges) around the stator
    if (bldc) {
      const r0 = 0.415 * s, r1 = 0.44 * s;
      ctx.save();
      for (let w = 0; w < 6 * p; w++) {
        const a0 = ((w * 60 - 30) * DEG) / p, a1 = ((w * 60 + 30) * DEG) / p;
        const active = (w % 6) === sector;
        annulusSector(ctx, cx, cy, r0, r1, a0, a1);
        if (active) { ctx.fillStyle = P.current; ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1; }
        ctx.lineWidth = hl; ctx.strokeStyle = P.hairline; ctx.stroke();
      }
      ctx.restore();
    }

    // 5 · axes: stator phase axes 1/2/3 (dashed) and rotor d/q (solid)
    if (showAxes) {
      ctx.save();
      ctx.lineWidth = hl;
      ctx.setLineDash(DASH_AXIS);
      ctx.strokeStyle = P.ink2;
      ctx.globalAlpha = 0.55;
      for (let q = 0; q < 3; q++) {
        const a = (q * 120 * DEG) / p;
        ctx.beginPath();
        ctx.moveTo(PX(cx, -0.455 * s, a), PY(cy, -0.455 * s, a));
        ctx.lineTo(PX(cx, 0.45 * s, a), PY(cy, 0.45 * s, a));
        ctx.stroke();
      }
      ctx.setLineDash(EMPTY_DASH);
      ctx.globalAlpha = 1;
      if (labels) {
        for (let q = 0; q < 3; q++) {
          const a = (q * 120 * DEG) / p;
          text(ctx, String(q + 1), PX(cx, Rlabel, a), PY(cy, Rlabel, a), lblPx, P.ink2, 'center', '500');
        }
      }
      ctx.strokeStyle = P.ink;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = hl;
      const aq = gm + Math.PI / 2 / p;
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(PX(cx, 0.44 * s, gm), PY(cy, 0.44 * s, gm));
      ctx.moveTo(cx, cy); ctx.lineTo(PX(cx, 0.44 * s, aq), PY(cy, 0.44 * s, aq));
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (labels) {
        sym(ctx, 'd', '', PX(cx, Rlabel, gm) - 0.012 * s * Math.sin(gm), PY(cy, Rlabel, gm) - 0.012 * s * Math.cos(gm), symPx, P.ink, 'center');
        sym(ctx, 'q', '', PX(cx, Rlabel, aq) - 0.012 * s * Math.sin(aq), PY(cy, Rlabel, aq) - 0.012 * s * Math.cos(aq), symPx, P.ink, 'center');
      }
      ctx.restore();
    }

    // 6 · space vectors (electrical angles shown at mechanical angle/p so they align with the rotor)
    const head = Math.max(5, 0.03 * s);
    const vec = (v, color, lw, dash, label, subl, side) => {
      const mag = Math.hypot(v.re, v.im);
      if (mag < 0.02) return;
      const a = Math.atan2(v.im, v.re) / p;
      const L = mag * unit;
      const x1 = PX(cx, L, a), y1 = PY(cy, L, a);
      arrow(ctx, cx, cy, x1, y1, color, lw, head, 1, dash);
      if (labels && label) {
        // side = 0: label ahead of the tip; side = ±1: beside the shaft of the arrow (keeps ψ_M / ψ_S off the magnets)
        const off = (side || 0) * 0.042 * s;
        const rl = side ? L * 0.58 : L + 0.045 * s;
        const lx = PX(cx, rl, a) + Math.sin(a) * off, ly = PY(cy, rl, a) + Math.cos(a) * off;
        sym(ctx, label, subl, lx, ly, symPx, P.ink, 'center');
      }
    };
    if (psiM > 0.02) vec({ re: psiM * Math.cos(gamma), im: psiM * Math.sin(gamma) }, P.flux, hl * 2.2, null, 'ψ', 'M', 1);
    if (psiS) vec(psiS, P.flux, hl * 1.4, DASH_PSI, 'ψ', 'S', -1);
    if (uVec) vec(uVec, P.voltage, hl * 1.8, null, 'u', 'S', 0);
    if (iVec) vec(iVec, P.current, hl * 2.2, null, 'i', 'S', 0);

    // 7 · torque arc around the shaft, starting at the d-axis and sweeping in the torque sense
    if (Number.isFinite(torque) && Math.abs(torque) > 0.02) {
      const sw = sgn(torque) * (0.4 + 0.6 * Math.min(1, Math.abs(torque)));
      const a0 = gm + sgn(torque) * 0.2;
      arcArrow(ctx, cx, cy, 0.105 * s, a0, sw, P.torque, hl * 1.8, 0.026 * s, 0.95);
      if (labels) { // inside the arc, between shaft and arrow: the only spot no vector can reach
        const am = a0 + sw / 2;
        sym(ctx, 'm', '', PX(cx, 0.072 * s, am), PY(cy, 0.072 * s, am), symPx - 2, P.ink, 'center');
      }
    }
    speedDial(ctx, cx + 0.44 * s, cy - 0.44 * s, 0.04 * s, speed, P, 'ω', hl);

    // 8 · captions
    if (labels) {
      text(ctx, bldc ? 'Blockkommutierung' : 'Sinuskommutierung', cx - 0.5 * s + 1, cy - 0.5 * s + lblPx * 0.7, lblPx, P.ink2, 'left');
      if (p === 2) {
        const x0 = cx - 0.5 * s + 1, y0 = cy + 0.5 * s - lblPx * 0.7;
        const w = sym(ctx, 'p', '', x0, y0, symPx - 1, P.ink2, 'left');
        text(ctx, ' = 2', x0 + w, y0, lblPx, P.ink2, 'left');
      }
      if (bldc) {
        const blk = blockOf(i1, i2, i3);
        const str = blk
          ? 'Block ' + blk.name + '  (' + SIGN_CHAR[blk.sig[0]] + ', ' + SIGN_CHAR[blk.sig[1]] + ', ' + SIGN_CHAR[blk.sig[2]] + ')'
          : 'Zwei Stränge leiten';
        text(ctx, str, cx + 0.5 * s - 1, cy + 0.5 * s - lblPx * 0.7, lblPx, P.ink2, 'right');
      }
    }

    ctx.restore();
  }

  MS.art = {
    palette,
    drawDC,
    drawPSM,
    DC_TYPES: DC_TYPES.slice(),
    BLOCKS: BLOCKS.map((b) => ({ name: b.name, sig: b.sig.slice() })),
    blockOf,
    FONT_UI,
    FONT_SYM,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
