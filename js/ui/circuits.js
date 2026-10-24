/*
 * Maschinenlabor – live Ersatzschaltbilder (ESB).
 *
 *   MS.circuits.drawDC(ctx, opts)   Gleichstrommaschine (pm | fremd | neben | reihen)
 *   MS.circuits.drawPSM(ctx, opts)  Permanentmagnet-Synchronmaschine (space | dq)
 *
 * Everything is drawn procedurally with Canvas 2D in CSS pixels inside the box
 * {x, y, w, h}; the drawing is fitted and centred with its aspect ratio kept
 * and the background stays transparent. Wires and component symbols use only
 * ink / secondary ink; colour is reserved for physical quantities (current
 * arrows + moving dots, voltage arrows, flux coupling hint, n / M markers).
 * Verbraucherzählpfeilsystem: reference arrows are fixed, values are signed.
 *
 * Common opts: { x, y, w, h, dark, flow (s, monotonic), labels, iRef, animate }
 *   iRef   current that gives full dot speed / opacity (DC: A, default 10;
 *          PSM: p.u., default 1).
 *   animate false disables the dots (prefers-reduced-motion does the same).
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});

  const TOKENS = {
    light: {
      voltage: '#2a78d6', current: '#eb6834', flux: '#1baf7a', torque: '#6250d6', speed: '#008300',
      surface: '#ffffff', ink: '#1d1d1f', ink2: '#6e6e73', hair: '#d2d2d7',
    },
    dark: {
      voltage: '#3987e5', current: '#d95926', flux: '#199e70', torque: '#9085e9', speed: '#0ca30c',
      surface: '#000000', ink: '#f5f5f7', ink2: '#98989d', hair: '#38383a',
    },
  };
  const FONT_UI = 'Inter, -apple-system, "Segoe UI", system-ui, sans-serif';
  const FONT_MATH = '"STIX Two Text", "Times New Roman", serif';
  const TAU = Math.PI * 2;

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const num = (v, d) => (isNum(v) ? v : d);

  // ------------------------------------------------------------ reduced motion
  let mq = null, mqTried = false;
  function reducedMotion() {
    if (!mqTried) {
      mqTried = true;
      try { if (typeof root.matchMedia === 'function') mq = root.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { mq = null; }
    }
    return !!(mq && mq.matches);
  }

  // ------------------------------------------------------------ formatting
  /** Number with n significant digits, trailing zeros trimmed, real minus sign. */
  function sig(v, n) {
    if (!isNum(v)) return v === Infinity || v === -Infinity ? (v > 0 ? '∞' : '−∞') : '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    const dec = clamp(n - 1 - Math.floor(Math.log10(a)), 0, 6);
    let s = v.toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  /** SI value with unit and a sensible prefix ("0.6 mH", "1.2 kΩ"). */
  function fmtSI(v, unit, n) {
    if (!isNum(v)) return '–';
    n = n || 3;
    let p = '';
    const a = Math.abs(v);
    if (a !== 0) {
      if (unit === 'H' && a < 1) { v *= 1e3; p = 'm'; if (Math.abs(v) < 1) { v *= 1e3; p = 'µ'; } }
      else if ((unit === 'Ω' || unit === 'V' || unit === 'A') && a >= 1e4) { v /= 1e3; p = 'k'; }
      else if (unit === 'Ω' && a >= 1e3) { v /= 1e3; p = 'k'; }
    }
    return sig(v, n) + (unit ? ' ' + p + unit : '');
  }
  const fmtPU = (v) => sig(v, 3);

  // ------------------------------------------------------------ text parts
  // A label is a list of parts: {t, m:true (math italic), sub} or {t} (UI font).
  const m = (t, sub) => ({ t, m: true, sub });
  const u = (t) => ({ t });

  // ------------------------------------------------------------ scene
  class Scene {
    constructor(ctx, opts, W0, H0, iRefDefault) {
      this.ctx = ctx;
      const x = num(opts.x, 0), y = num(opts.y, 0);
      const w = Math.max(1, num(opts.w, W0)), h = Math.max(1, num(opts.h, H0));
      const s = Math.min(w / W0, h / H0);
      this.s = s;
      this.ox = x + (w - W0 * s) / 2;
      this.oy = y + (h - H0 * s) / 2;
      this.t = TOKENS[opts.dark ? 'dark' : 'light'];
      this.labels = opts.labels !== false;
      this.flow = num(opts.flow, 0);
      this.anim = opts.animate !== false && !reducedMotion();
      this.fs = clamp(11.5 * s, 9, 13);          // UI font (px)
      this.fm = this.fs * 1.15;                   // math font: serif looks smaller
      this.lh = this.fs * 1.4;                    // line pitch for stacked labels
      this.lw = 1.25 * clamp(s, 0.85, 1.4);
      this.iRef = Math.max(1e-9, Math.abs(num(opts.iRef, iRefDefault)));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      this.ink();
    }
    X(u) { return this.ox + u * this.s; }
    Y(v) { return this.oy + v * this.s; }
    L(d) { return d * this.s; }
    ink() { const c = this.ctx; c.strokeStyle = this.t.ink; c.fillStyle = this.t.ink; c.lineWidth = this.lw; c.setLineDash([]); }

    // ---------------------------------------------------------- wires / rails
    seg(x0, y0, x1, y1, path, vis) {
      const X0 = this.X(x0), Y0 = this.Y(y0), X1 = this.X(x1), Y1 = this.Y(y1);
      if (vis) { const c = this.ctx; c.beginPath(); c.moveTo(X0, Y0); c.lineTo(X1, Y1); c.stroke(); }
      if (path) { const l = Math.hypot(X1 - X0, Y1 - Y0); path.a.push(X0, Y0, X1, Y1, l, vis ? 1 : 0); path.total += l; }
    }
    /**
     * Straight conductor from a to b (nominal coords) carrying `items`
     * (components with centre distance t and length len). Wire pieces are
     * drawn between the components, components are drawn in place and the
     * current-dot path collects visible / hidden spans. `o` is the sign of
     * the local perpendicular that points *outside* the loop.
     */
    rail(ax, ay, bx, by, items, path, o) {
      const ddx = bx - ax, ddy = by - ay, len = Math.hypot(ddx, ddy) || 1;
      const dx = ddx / len, dy = ddy / len;
      let pos = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const s0 = it.t - it.len / 2, s1 = it.t + it.len / 2;
        if (s0 > pos) this.seg(ax + dx * pos, ay + dy * pos, ax + dx * s0, ay + dy * s0, path, true);
        if (s1 > s0) this.seg(ax + dx * s0, ay + dy * s0, ax + dx * s1, ay + dy * s1, path, false);
        pos = Math.max(pos, s1);
        it.cx = ax + dx * it.t; it.cy = ay + dy * it.t; it.dx = dx; it.dy = dy; it.o = o || -1;
        this.item(it);
      }
      if (pos < len) this.seg(ax + dx * pos, ay + dy * pos, bx, by, path, true);
    }

    begin(cx, cy, dx, dy) { const c = this.ctx; c.save(); c.translate(this.X(cx), this.Y(cy)); c.rotate(Math.atan2(dy, dx)); }
    end() { this.ctx.restore(); }

    // ---------------------------------------------------------- components
    item(it) {
      const c = this.ctx, L = this.L.bind(this), o = it.o;
      this.ink();
      switch (it.k) {
        case 'R': {
          this.begin(it.cx, it.cy, it.dx, it.dy);
          c.beginPath(); c.rect(-L(it.len) / 2, -L(12) / 2, L(it.len), L(12)); c.stroke();
          this.end(); break;
        }
        case 'L': {
          this.begin(it.cx, it.cy, it.dx, it.dy);
          const n = 4, r = L(it.len) / (2 * n), x0 = -L(it.len) / 2;
          c.beginPath();
          for (let i = 0; i < n; i++) c.arc(x0 + r + 2 * r * i, 0, r, Math.PI, 0, o > 0);
          c.stroke();
          this.end(); break;
        }
        case 'V': { // ideal voltage source (DIN: circle with a line between the terminals)
          this.begin(it.cx, it.cy, it.dx, it.dy);
          const r = L(it.r);
          c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
          c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
          this.end(); break;
        }
        case 'E': { // induced / controlled voltage: circle with an arrow inside
          this.begin(it.cx, it.cy, it.dx, it.dy);
          const r = L(it.r), a = r * 0.58;
          c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
          c.beginPath(); c.moveTo(-a, 0); c.lineTo(a - 3, 0); c.stroke();
          c.beginPath(); c.moveTo(a, 0); c.lineTo(a - 5, -3); c.lineTo(a - 5, 3); c.closePath(); c.fill();
          this.end(); break;
        }
        case 'AC': { // sinusoidal source
          this.begin(it.cx, it.cy, it.dx, it.dy);
          const r = L(it.r), a = r * 0.6;
          c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
          c.beginPath();
          for (let i = 0; i <= 12; i++) { const x = -a + (2 * a * i) / 12; const y = -Math.sin((i / 12) * TAU) * a * 0.5; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
          c.stroke();
          this.end(); break;
        }
        case 'SW': { // switch, lever swings towards the outside when open
          this.begin(it.cx, it.cy, it.dx, it.dy);
          const l = L(it.len), p0 = -l / 2 + L(4), p1 = l / 2 - L(4);
          c.beginPath(); c.moveTo(-l / 2, 0); c.lineTo(p0, 0); c.stroke();
          c.beginPath(); c.moveTo(p1, 0); c.lineTo(l / 2, 0); c.stroke();
          c.beginPath(); c.arc(p0, 0, L(2.2), 0, TAU); c.fill();
          c.beginPath(); c.arc(p1, 0, L(2.2), 0, TAU); c.stroke();
          const ang = it.on ? 0 : o * 0.42, ll = (p1 - p0) + L(3);
          c.beginPath(); c.moveTo(p0, 0); c.lineTo(p0 + Math.cos(ang) * ll, Math.sin(ang) * ll); c.stroke();
          this.end(); break;
        }
        case 'OPEN': { // open terminals
          this.begin(it.cx, it.cy, it.dx, it.dy);
          const l = L(it.len), r = L(2.4);
          c.beginPath(); c.arc(-l / 2 + r, 0, r, 0, TAU); c.stroke();
          c.beginPath(); c.arc(l / 2 - r, 0, r, 0, TAU); c.stroke();
          this.end(); break;
        }
        case 'X': { // crossed leads (field reversed)
          this.begin(it.cx, it.cy, it.dx, it.dy);
          const l = L(it.len) / 2, h = L(4.5);
          c.beginPath(); c.moveTo(-l, -h); c.lineTo(l, h); c.moveTo(-l, h); c.lineTo(l, -h); c.stroke();
          this.end(); break;
        }
        case 'BOX': { // converter: square with a diagonal, labels in the two triangles
          const cx = this.X(it.cx), cy = this.Y(it.cy), a = L(it.len), h = a / 2;
          c.beginPath(); c.rect(cx - h, cy - h, a, a); c.stroke();
          c.beginPath(); c.moveTo(cx - h, cy + h); c.lineTo(cx + h, cy - h); c.stroke();
          const fs = Math.max(8, a * 0.42);
          c.font = fs + 'px ' + FONT_UI; c.textAlign = 'center';
          c.fillText(it.tl, cx - h * 0.42, cy - h * 0.46);
          c.fillText(it.br, cx + h * 0.42, cy + h * 0.5);
          c.textAlign = 'left';
          break;
        }
        case 'NODE': {
          c.beginPath(); c.arc(this.X(it.cx), this.Y(it.cy), L(2.6), 0, TAU); c.fill();
          break;
        }
        case 'HEAD': {
          this.head(it.cx, it.cy, it.dx, it.dy, it.neg);
          break;
        }
        default: break;
      }
      if (it.sym && this.labels) this.compLabel(it);
    }

    /** Component label: symbol over value, outside for horizontal rails, inside for vertical ones. */
    compLabel(it) {
      const horiz = Math.abs(it.dx) >= Math.abs(it.dy);
      const outX = -it.dy * it.o, outY = it.dx * it.o;          // unit vector pointing outside
      const parts = [m(it.sym, it.sub)];
      if (horiz) {
        const dirY = it.side === 'in' ? -outY : outY;
        const y1 = dirY < 0 ? it.cy - 26 : it.cy + 12;
        const y2 = dirY < 0 ? it.cy - 12 : it.cy + 26;
        this.text(this.X(it.cx), this.Y(y1), parts, 0.5, this.t.ink);
        if (it.val != null) this.text(this.X(it.cx), this.Y(y2), [u(it.val)], 0.5, this.t.ink2, 0.95);
      } else {
        const dirX = it.side === 'out' ? outX : -outX;
        const half = it.k === 'R' || it.k === 'L' ? 8 : it.len / 2;
        const x = this.X(it.cx + dirX * (half + 6));
        const al = dirX > 0 ? 0 : 1;
        this.text(x, this.Y(it.cy) - this.lh / 2, parts, al, this.t.ink);
        if (it.val != null) this.text(x, this.Y(it.cy) + this.lh / 2, [u(it.val)], al, this.t.ink2, 0.95);
      }
    }

    // ---------------------------------------------------------- text
    /** Draws label parts at CSS px (x, y); align 0 = left, 0.5 = centre, 1 = right. Returns the width. */
    text(x, y, parts, align, color, scale) {
      if (!this.labels) return 0;
      const c = this.ctx, k = scale || 1;
      const fs = this.fs * k, fm = this.fm * k, fsub = fm * 0.72;
      let w = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        c.font = p.m ? 'italic ' + fm + 'px ' + FONT_MATH : fs + 'px ' + FONT_UI;
        w += c.measureText(p.t).width;
        if (p.sub) { c.font = fsub + 'px ' + FONT_MATH; w += c.measureText(p.sub).width + 0.5; }
      }
      let px = x - w * (align || 0);
      c.fillStyle = color || this.t.ink;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        c.font = p.m ? 'italic ' + fm + 'px ' + FONT_MATH : fs + 'px ' + FONT_UI;
        c.fillText(p.t, px, y);
        px += c.measureText(p.t).width;
        if (p.sub) {
          c.font = fsub + 'px ' + FONT_MATH;
          c.fillText(p.sub, px + 0.5, y + fm * 0.3);
          px += c.measureText(p.sub).width + 0.5;
        }
      }
      return w;
    }
    /** Two stacked lines (symbol parts, then value) at nominal (x, y). */
    stack(x, y, align, symParts, val) {
      if (!this.labels) return;
      const X = this.X(x), Y = this.Y(y);
      this.text(X, Y - this.lh / 2, symParts, align, this.t.ink);
      this.text(X, Y + this.lh / 2, [u(val)], align, this.t.ink);
    }
    /** Single-line label "sym = value" at nominal (x, y). */
    inline(x, y, align, symParts, val) {
      if (!this.labels) return;
      const parts = symParts.slice();
      parts.push(u(' = ' + val));
      this.text(this.X(x), this.Y(y), parts, align, this.t.ink);
    }
    /** Centred read-out line with coloured quantity markers: [{color, parts, val}]. */
    readout(x, y, entries) {
      if (!this.labels) return;
      const c = this.ctx, X = this.X(x), Y = this.Y(y);
      const mark = this.fs * 0.55, gapM = this.fs * 0.6, gapE = this.fs * 1.6;
      // measure
      let total = 0;
      c.save(); c.globalAlpha = 0;
      const widths = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const parts = e.parts.slice(); parts.push(u(' = ' + e.val));
        const w = this.text(0, -1e4, parts, 0, this.t.ink);
        widths.push(w);
        total += mark + gapM + w + (i < entries.length - 1 ? gapE : 0);
      }
      c.restore();
      let px = X - total / 2;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        c.fillStyle = e.color;
        c.beginPath(); c.arc(px + mark / 2, Y, mark / 2, 0, TAU); c.fill();
        px += mark + gapM;
        const parts = e.parts.slice(); parts.push(u(' = ' + e.val));
        this.text(px, Y, parts, 0, this.t.ink);
        px += widths[i] + gapE;
      }
    }
    note(x, y, str, align) {
      if (!this.labels) return;
      this.text(this.X(x), this.Y(y), [u(str)], align || 0.5, this.t.ink2, 0.92);
    }

    // ---------------------------------------------------------- arrows
    /** Current arrowhead on the wire at nominal (x, y) pointing along (dx, dy); hollow when neg. */
    head(x, y, dx, dy, neg) {
      const c = this.ctx, X = this.X(x), Y = this.Y(y);
      const l = Math.max(7, this.L(9)), hw = l * 0.42;
      const px = -dy, py = dx;
      c.beginPath();
      c.moveTo(X + dx * l * 0.55, Y + dy * l * 0.55);
      c.lineTo(X - dx * l * 0.45 + px * hw, Y - dy * l * 0.45 + py * hw);
      c.lineTo(X - dx * l * 0.45 - px * hw, Y - dy * l * 0.45 - py * hw);
      c.closePath();
      if (neg) {
        c.save(); c.strokeStyle = this.t.current; c.lineWidth = this.lw; c.stroke(); c.restore();
      } else {
        c.fillStyle = this.t.current; c.fill();
      }
      this.ink();
    }
    /** Voltage arrow from nominal (x0, y0) to (x1, y1) in the voltage colour. */
    varrow(x0, y0, x1, y1) {
      const c = this.ctx;
      const X0 = this.X(x0), Y0 = this.Y(y0), X1 = this.X(x1), Y1 = this.Y(y1);
      const len = Math.hypot(X1 - X0, Y1 - Y0) || 1;
      const dx = (X1 - X0) / len, dy = (Y1 - Y0) / len;
      const hl = Math.max(6, this.L(7.5)), hw = hl * 0.42;
      c.save();
      c.strokeStyle = this.t.voltage; c.fillStyle = this.t.voltage; c.lineWidth = this.lw * 1.1;
      c.beginPath(); c.moveTo(X0, Y0); c.lineTo(X1 - dx * hl * 0.6, Y1 - dy * hl * 0.6); c.stroke();
      c.beginPath();
      c.moveTo(X1, Y1);
      c.lineTo(X1 - dx * hl - dy * hw, Y1 - dy * hl + dx * hw);
      c.lineTo(X1 - dx * hl + dy * hw, Y1 - dy * hl - dx * hw);
      c.closePath(); c.fill();
      c.restore();
    }
    /** Dashed magnetic coupling between two nominal points, with a flux marker. */
    coupling(x0, y0, x1, y1, labelParts) {
      const c = this.ctx;
      c.save();
      c.strokeStyle = this.t.ink2; c.lineWidth = this.lw; c.setLineDash([this.L(3), this.L(3)]);
      c.beginPath(); c.moveTo(this.X(x0), this.Y(y0)); c.lineTo(this.X(x1), this.Y(y1)); c.stroke();
      c.restore();
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      // flux marker: small chevron in flux colour pointing along the coupling
      const dx = Math.sign(x1 - x0) || 1;
      c.save(); c.fillStyle = this.t.flux;
      const X = this.X(mx), Y = this.Y(my), h = Math.max(3, this.L(3.5));
      c.beginPath(); c.moveTo(X + dx * h, Y); c.lineTo(X - dx * h * 0.6, Y - h); c.lineTo(X - dx * h * 0.6, Y + h); c.closePath(); c.fill();
      c.restore();
      if (labelParts) this.text(this.X(mx), this.Y(my) - this.lh * 0.85, labelParts, 0.5, this.t.ink);
    }
    /** Permanent-magnet symbol (N over S) centred at nominal (x, y). */
    magnet(x, y) {
      const c = this.ctx, w = this.L(20), h = this.L(17);
      const X = this.X(x), Y = this.Y(y);
      this.ink();
      c.save();
      c.globalAlpha = 0.28; c.fillStyle = this.t.ink2;
      c.fillRect(X - w / 2, Y, w, h);
      c.restore();
      c.beginPath(); c.rect(X - w / 2, Y - h, w, 2 * h); c.stroke();
      c.beginPath(); c.moveTo(X - w / 2, Y); c.lineTo(X + w / 2, Y); c.stroke();
      if (this.labels) {
        c.fillStyle = this.t.ink; c.font = Math.max(8, this.fs * 0.85) + 'px ' + FONT_UI; c.textAlign = 'center';
        c.fillText('N', X, Y - h / 2 + 0.5);
        c.fillText('S', X, Y + h / 2 + 0.5);
        c.textAlign = 'left';
      }
    }

    // ---------------------------------------------------------- current dots
    newPath() { return { a: [], total: 0 }; }
    dots(path, I) {
      if (!this.anim || !path || path.total <= 0 || !isNum(I) || I === 0) return;
      const k = clamp(I / this.iRef, -1, 1);
      const sp = clamp(this.s, 0.6, 1.6);
      const gap0 = 24 * sp;
      const gap = path.total / Math.max(1, Math.round(path.total / gap0));
      const v = 40 * sp * Math.sign(k) * Math.sqrt(Math.abs(k));
      let off = (this.flow * v) % gap;
      if (off < 0) off += gap;
      const c = this.ctx, a = path.a;
      const r = Math.max(1.6, 2.2 * sp);
      c.save();
      c.globalAlpha = 0.35 + 0.65 * Math.abs(k);
      c.fillStyle = this.t.current;
      c.beginPath();
      let start = 0;
      for (let i = 0; i < a.length; i += 6) {
        const len = a[i + 4];
        if (a[i + 5] && len > 0) {
          let d = Math.ceil((start - off) / gap) * gap + off;
          for (; d < start + len; d += gap) {
            const t = (d - start) / len;
            const x = a[i] + (a[i + 2] - a[i]) * t, y = a[i + 1] + (a[i + 3] - a[i + 1]) * t;
            c.moveTo(x + r, y);
            c.arc(x, y, r, 0, TAU);
          }
        }
        start += len;
      }
      c.fill();
      c.restore();
    }
  }

  // ------------------------------------------------------------ item factories
  const R = (len, sym, sub, val, side) => ({ k: 'R', len, sym, sub, val, side });
  const Lc = (len, sym, sub, val, side) => ({ k: 'L', len, sym, sub, val, side });
  const V = (r) => ({ k: 'V', len: 2 * r, r });
  const E = (r) => ({ k: 'E', len: 2 * r, r });
  const AC = (r) => ({ k: 'AC', len: 2 * r, r });
  const SW = (len, on) => ({ k: 'SW', len, on });
  const OPEN = (len) => ({ k: 'OPEN', len });
  const XX = (len) => ({ k: 'X', len });
  const BOX = (len, tl, br) => ({ k: 'BOX', len, tl, br });
  const NODE = () => ({ k: 'NODE', len: 0 });
  const HEAD = (neg) => ({ k: 'HEAD', len: 0, neg: !!neg });

  /** Assigns centre positions t to items so that they are evenly spaced in [from, to]. */
  function spread(items, from, to) {
    let sum = 0;
    for (let i = 0; i < items.length; i++) sum += items[i].len;
    const gap = (to - from - sum) / (items.length + 1);
    let pos = from + gap;
    for (let i = 0; i < items.length; i++) { items[i].t = pos + items[i].len / 2; pos += items[i].len + gap; }
    return items;
  }
  function at(item, t) { item.t = t; return item; }

  const neg = (v) => isNum(v) && v < 0;

  // ============================================================ DC machine
  const DC_TYPES = { pm: 1, fremd: 1, neben: 1, reihen: 1 };

  function drawDC(ctx, opts) {
    if (!ctx) return;
    opts = opts || {};
    const v = opts.values || {};
    const type = DC_TYPES[opts.type] ? opts.type : 'pm';
    const load = opts.supply === 'load';
    const on = !!opts.on;
    const fremd = type === 'fremd', neben = type === 'neben', reihen = type === 'reihen', pm = type === 'pm';
    const openLoad = load && !!opts.openLoad;
    const showRV = !load && !!opts.showRV;
    const showRVE = (fremd || neben) && !!opts.showRVE;
    const fieldRev = reihen && !!opts.fieldReversed;
    const converter = !load && !!opts.currentLimit;

    const W0 = fremd ? 510 : 440, H0 = 240;
    const S = new Scene(ctx, opts, W0, H0, 10);
    ctx.save();
    try {
      const Lx = 40, Rx = fremd ? 300 : 400, T = 52, B = 186, CY = (T + B) / 2;
      const main = S.newPath();

      // ---- left rail (upwards): supply or load
      const left = [];
      let supplyItem;
      if (load) supplyItem = openLoad ? OPEN(40) : R(36, 'R', 'L', fmtSI(v.RL, 'Ω'), 'out');
      else supplyItem = converter ? BOX(30, '=', '=') : V(12);
      left.push(at(supplyItem, B - CY));
      S.rail(Lx, B, Lx, T, left, main, -1);

      // ---- top rail (rightwards): switch, (node), R_V, R_A, L_A
      const sw = at(SW(36, on), 32);
      const arm = [R(36, 'R', 'A', fmtSI(v.RA, 'Ω')), Lc(36, 'L', 'A', fmtSI(v.LA, 'H'))];
      if (showRV) arm.unshift(R(36, 'R', 'V', fmtSI(v.RV, 'Ω')));
      const xA = 150; // field node for the shunt machine
      let top;
      if (neben) {
        spread(arm, xA - Lx + 10, Rx - Lx - 10);
        top = [sw, at(HEAD(neg(v.Isup)), 82), at(NODE(), xA - Lx)].concat(arm);
      } else {
        spread(arm, 60, Rx - Lx - 10);
        top = [sw].concat(arm);
      }
      S.rail(Lx, T, Rx, T, top, main, -1);

      // ---- right rail (downwards): I_A head, induced voltage U_i
      const right = [at(HEAD(neg(v.IA)), 22), at(E(13), CY - T)];
      S.rail(Rx, T, Rx, B, right, main, -1);

      // ---- bottom rail (leftwards): series field for the Reihenschluss machine
      const bottom = [];
      if (reihen) {
        bottom.push(at(Lc(36, 'L', 'E', fmtSI(v.LE, 'H'), 'in'), 120));
        bottom.push(at(R(36, 'R', 'E', fmtSI(v.RE, 'Ω'), 'in'), 190));
        if (fieldRev) { bottom.push(at(XX(12), 94)); bottom.push(at(XX(12), 146)); }
        bottom.sort((a, b) => a.t - b.t);
      }
      S.rail(Rx, B, Lx, B, bottom, main, -1);

      // ---- shunt field branch (downwards from node A)
      let fieldPath = null, supPath = null;
      if (neben) {
        // split the main path: supply part (left rail + top up to node) vs armature loop
        fieldPath = S.newPath();
        const fld = [R(26, 'R', 'E', fmtSI(v.RE, 'Ω')), Lc(26, 'L', 'E', fmtSI(v.LE, 'H'))];
        if (showRVE) fld.unshift(R(26, 'R', 'VE', fmtSI(v.RVE, 'Ω')));
        for (let i = 0; i < fld.length; i++) fld[i].side = 'in'; // labels to the right of the branch
        spread(fld, 24, B - T);
        const items = [at(HEAD(neg(v.IE)), 13)].concat(fld);
        S.rail(xA, T, xA, B, items, fieldPath, 1);
        S.item(Object.assign(NODE(), { cx: xA, cy: B, dx: 0, dy: 1, o: 1 }));
        S.inline(xA + 10, T + 13, 0, [m('I', 'E')], fmtSI(v.IE, 'A'));
      }

      // ---- separate field circuit (fremd)
      if (fremd) {
        const FL = 340, FR = 480;
        fieldPath = S.newPath();
        S.rail(FR, B, FR, T, [at(V(12), B - CY)], fieldPath, 1);
        const ftop = [R(36, 'R', 'E', fmtSI(v.RE, 'Ω'))];
        if (showRVE) ftop.unshift(R(36, 'R', 'VE', fmtSI(v.RVE, 'Ω')));
        spread(ftop, 0, FR - FL);
        S.rail(FR, T, FL, T, ftop, fieldPath, 1);
        S.rail(FL, T, FL, B, [at(Lc(36, 'L', 'E', fmtSI(v.LE, 'H'), 'in'), CY - T)], fieldPath, 1);
        S.rail(FL, B, FR, B, [at(HEAD(neg(v.IE)), (FR - FL) / 2)], fieldPath, 1);
        S.inline((FL + FR) / 2, B + 15, 0.5, [m('I', 'E')], fmtSI(v.IE, 'A'));
        // U_E arrow + label (inside the field loop)
        S.varrow(FR - 22, CY - 22, FR - 22, CY + 22);
        S.stack(FR - 32, CY, 1, [m('U', 'E')], fmtSI(v.UE, 'V'));
        // magnetic coupling armature ↔ field winding
        S.coupling(Rx + 15, CY, FL - 8, CY, [m('Φ')]);
      }
      if (pm) {
        S.coupling(Rx + 15, CY, Rx + 24, CY, null);
        S.magnet(Rx + 35, CY);
      }

      // ---- dots
      if (neben) {
        // supply path: bottom rail (right→left), left rail, top rail up to node A
        supPath = S.newPath();
        const armPath = S.newPath();
        // Rebuild the two sub-paths from the main path geometry: nodes at (xA, T) and (xA, B).
        splitAt(main, S.X(xA), S.Y(T), S.X(xA), S.Y(B), armPath, supPath);
        S.dots(supPath, v.Isup);
        S.dots(armPath, v.IA);
        S.dots(fieldPath, v.IE);
      } else {
        S.dots(main, v.IA);
        if (fieldPath) S.dots(fieldPath, v.IE);
      }

      // ---- live annotations
      const Usym = load ? [m('U')] : [m('U', 'A')];
      const Uval = fmtSI(load ? (isNum(v.U) ? v.U : v.UA) : (isNum(v.UA) ? v.UA : v.U), 'V');
      S.varrow(Lx + 22, CY - 22, Lx + 22, CY + 22);
      S.stack(Lx + 32, CY, 0, Usym, Uval);
      if (converter) S.note(Lx + 32, CY + S.lh * 1.6 / S.s, 'Stromrichter', 0);
      if (openLoad) S.note(Lx + 32, CY + S.lh * 1.6 / S.s, 'Klemmen offen', 0);
      // I_A beside the arrowhead on the right rail
      S.stack(Rx - 10, T + 24, 1, [m('I', 'A')], fmtSI(v.IA, 'A'));
      // U_i beside the induced-voltage source
      S.varrow(Rx - 22, CY - 22, Rx - 22, CY + 22);
      S.stack(Rx - 32, CY, 1, [m('U', 'i')], fmtSI(v.Ui, 'V'));
      if (neben) S.inline(Lx + 92, T - 14, 0.5, [m('I')], fmtSI(v.Isup, 'A'));
      if (fieldRev) S.note(Rx - 120, B + 15, 'Feld umgepolt', 0.5);

      // ---- mechanical read-out
      S.readout((Lx + Rx) / 2, 216, [
        { color: S.t.speed, parts: [m('n')], val: fmtSI(v.n, 'min⁻¹', 4) },
        { color: S.t.torque, parts: [m('M')], val: fmtSI(v.M, 'Nm') },
      ]);
    } finally {
      ctx.restore();
    }
  }

  /**
   * Splits a closed path (built left rail → top → right → bottom) at two node
   * points into the armature loop (node A → right → bottom → node B) and the
   * supply part (node B → left → node A). Works on px coordinates.
   */
  function splitAt(path, ax, ay, bx, by, armPath, supPath) {
    const a = path.a;
    const eps = 0.5;
    let inArm = false;
    for (let i = 0; i < a.length; i += 6) {
      const x0 = a[i], y0 = a[i + 1], x1 = a[i + 2], y1 = a[i + 3], len = a[i + 4], vis = a[i + 5];
      // does node A lie on this segment?
      const containsA = onSeg(x0, y0, x1, y1, ax, ay, eps), containsB = onSeg(x0, y0, x1, y1, bx, by, eps);
      if (containsA && !inArm) {
        // part before A → supply, after A → armature
        pushSeg(supPath, x0, y0, ax, ay, vis);
        pushSeg(armPath, ax, ay, x1, y1, vis);
        inArm = true;
      } else if (containsB && inArm) {
        pushSeg(armPath, x0, y0, bx, by, vis);
        pushSeg(supPath, bx, by, x1, y1, vis);
        inArm = false;
      } else {
        pushSeg(inArm ? armPath : supPath, x0, y0, x1, y1, vis);
      }
      void len;
    }
  }
  function onSeg(x0, y0, x1, y1, px, py, eps) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    if (l2 === 0) return false;
    const t = ((px - x0) * dx + (py - y0) * dy) / l2;
    if (t < -1e-6 || t > 1 + 1e-6) return false;
    const qx = x0 + t * dx - px, qy = y0 + t * dy - py;
    return qx * qx + qy * qy < eps * eps;
  }
  function pushSeg(path, x0, y0, x1, y1, vis) {
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l < 1e-6) return;
    path.a.push(x0, y0, x1, y1, l, vis);
    path.total += l;
  }

  // ============================================================ PSM
  const PSM_SOURCES = { inverter: 1, uf: 1, short: 1, resistor: 1, open: 1 };

  /** Left-rail source item for the PSM views. */
  function psmSource(src, v) {
    switch (src) {
      case 'uf': return AC(12);
      case 'short': return null;
      case 'resistor': return R(36, 'r', 'L', fmtPU(v.rL), 'out');
      case 'open': return OPEN(40);
      default: return BOX(30, '=', '~');
    }
  }

  function drawPSM(ctx, opts) {
    if (!ctx) return;
    opts = opts || {};
    const v = opts.values || {};
    const src = PSM_SOURCES[opts.source] ? opts.source : 'inverter';
    const dq = opts.view === 'dq';
    const W0 = 440, H0 = 240;
    const S = new Scene(ctx, opts, W0, H0, 1);
    ctx.save();
    try {
      const T = 52, B = 186, CY = (T + B) / 2;
      const w = v.w, ls = v.ls, psiM = v.psiM;
      const mul = (a, b) => (isNum(a) && isNum(b) ? a * b : NaN);

      if (!dq) {
        // ------------------------------------------------ Raumzeiger-ESB (rotor frame, stationary)
        const Lx = 40, Rx = 400;
        const path = S.newPath();
        const srcItem = psmSource(src, v);
        S.rail(Lx, B, Lx, T, srcItem ? [at(srcItem, B - CY)] : [], path, -1);
        const top = spread([R(36, 'r', 'S', fmtPU(v.rs)), Lc(36, 'jωl', 'S', fmtPU(mul(w, ls)))], 60, Rx - Lx - 10);
        S.rail(Lx, T, Rx, T, top, path, -1);
        S.rail(Rx, T, Rx, B, [at(HEAD(false), 22), at(E(13), CY - T)], path, -1);
        S.rail(Rx, B, Lx, B, [], path, -1);
        S.dots(path, isNum(v.absI) ? Math.abs(v.absI) : NaN);

        // annotations
        const uVal = src === 'short' ? '0' : fmtPU(v.absU);
        S.varrow(Lx + 22, CY - 22, Lx + 22, CY + 22);
        S.stack(Lx + 32, CY, 0, [u('|'), m('u', 'S'), u('|')], uVal);
        if (src === 'inverter') S.note(Lx + 32, CY + S.lh * 1.6 / S.s, 'Wechselrichter', 0);
        if (src === 'uf') S.note(Lx + 32, CY + S.lh * 1.6 / S.s, 'U/f-Steuerung', 0);
        if (src === 'short') S.note(Lx + 32, CY + S.lh * 1.6 / S.s, 'Kurzschluss', 0);
        if (src === 'open') S.note(Lx + 32, CY + S.lh * 1.6 / S.s, 'Klemmen offen', 0);
        S.stack(Rx - 10, T + 24, 1, [u('|'), m('i', 'S'), u('|')], fmtPU(src === 'open' ? 0 : v.absI));
        S.varrow(Rx - 22, CY - 22, Rx - 22, CY + 22);
        S.stack(Rx - 32, CY, 1, [m('jωψ', 'M')], fmtPU(mul(w, psiM)));
        S.readout((Lx + Rx) / 2, 216, [
          { color: S.t.speed, parts: [m('ω')], val: fmtPU(w) },
          { color: S.t.flux, parts: [m('ψ', 'M')], val: fmtPU(psiM) },
        ]);
      } else {
        // ------------------------------------------------ dq-ESB: two coupled loops
        const loops = [
          { L: 44, R: 212, axis: 'd', uSym: [m('u', 'd')], iSym: [m('i', 'd')], uVal: v.ud, iVal: v.id,
            emf: [{ parts: [m('−ωl', 'S'), u(' '), m('i', 'q')], val: mul(-w, mul(ls, v.iq)) }] },
          { L: 250, R: 418, axis: 'q', uSym: [m('u', 'q')], iSym: [m('i', 'q')], uVal: v.uq, iVal: v.iq,
            emf: [{ parts: [m('ωl', 'S'), u(' '), m('i', 'd')], val: mul(w, mul(ls, v.id)) },
              { parts: [m('ωψ', 'M')], val: mul(w, psiM) }] },
        ];
        for (let k = 0; k < loops.length; k++) {
          const lp = loops[k], Lx = lp.L, Rx = lp.R;
          const path = S.newPath();
          const srcItem = psmSource(src, v);
          S.rail(Lx, B, Lx, T, srcItem ? [at(srcItem, B - CY)] : [], path, -1);
          const top = spread([R(32, 'r', 'S', fmtPU(v.rs)), Lc(32, 'l', 'S', fmtPU(ls))], 24, Rx - Lx - 14);
          S.rail(Lx, T, Rx, T, top, path, -1);
          const right = [at(HEAD(neg(lp.iVal)), 22)];
          const n = lp.emf.length;
          const centers = n === 1 ? [CY] : [CY - 14, CY + 30];
          for (let i = 0; i < n; i++) right.push(at(E(12), centers[i] - T));
          S.rail(Rx, T, Rx, B, right, path, -1);
          S.rail(Rx, B, Lx, B, [], path, -1);
          S.dots(path, src === 'open' ? 0 : lp.iVal);

          const uVal = src === 'short' ? '0' : fmtPU(lp.uVal);
          S.varrow(Lx + 22, CY - 22, Lx + 22, CY + 22);
          S.stack(Lx + 32, CY, 0, lp.uSym, uVal);
          S.stack(Rx - 10, T + 24, 1, lp.iSym, fmtPU(src === 'open' ? 0 : lp.iVal));
          for (let i = 0; i < n; i++) {
            const cy = centers[i], h = n === 1 ? 22 : 16;
            S.varrow(Rx - 22, cy - h, Rx - 22, cy + h);
            S.stack(Rx - 32, cy, 1, lp.emf[i].parts, fmtPU(lp.emf[i].val));
          }
          S.note((Lx + Rx) / 2, 204, lp.axis + '-Achse', 0.5);
        }
        S.readout(W0 / 2, 226, [
          { color: S.t.speed, parts: [m('ω')], val: fmtPU(w) },
          { color: S.t.flux, parts: [m('ψ', 'M')], val: fmtPU(psiM) },
        ]);
      }
    } finally {
      ctx.restore();
    }
  }

  MS.circuits = { drawDC, drawPSM, TOKENS, fmtSI, fmtPU, sig, reducedMotion };
})(typeof globalThis !== 'undefined' ? globalThis : window);
