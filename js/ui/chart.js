/*
 * Canvas charts: XY chart (Kennlinien, current plane), stacked time scope
 * and phasor (Zeigerdiagramm). Recessive hairline grid, 2px data lines,
 * ringed markers, a crosshair tooltip on hover. Colors are theme tokens.
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});
  const ui = MS.ui;
  const { h } = ui;

  // ---------------------------------------------------------------- shared

  const niceStep = (span, count) => {
    const raw = span / Math.max(1, count);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  };
  const ticks = (min, max, count) => {
    if (!(max > min)) return [];
    const step = niceStep(max - min, count);
    const out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  };
  const tickFmt = (v, step) => {
    const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
    return ui.fmt(v, d).replace(/\s/g, ' ');
  };
  ui.niceTicks = ticks;

  const withAlpha = (color, a) => {
    if (a >= 1) return color;
    if (color[0] === '#') {
      let c = color.slice(1);
      if (c.length === 3) c = c.split('').map((x) => x + x).join('');
      const n = parseInt(c, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
    return color;
  };
  ui.withAlpha = withAlpha;

  const arrowHead = (ctx, x0, y0, x1, y1, size) => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - size * Math.cos(a - 0.42), y1 - size * Math.sin(a - 0.42));
    ctx.lineTo(x1 - size * Math.cos(a + 0.42), y1 - size * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fill();
  };
  ui.arrowHead = arrowHead;

  const roundRect = (ctx, x, y, w, hgt, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r);
    ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  /** Tooltip box: lines = [{color?, label (spec|string), value}] */
  const drawTooltip = (ctx, px, py, lines, bounds) => {
    if (!lines.length) return;
    ctx.save();
    const pad = 8, lh = 18;
    ctx.font = `12px ${ui.FONT_UI}`;
    let w = 0;
    const widths = lines.map((l) => {
      ctx.font = `12px ${ui.FONT_UI}`;
      const vw = ctx.measureText(l.value || '').width;
      const lw = ui.measureLabel(ctx, l.label, { size: 12 });
      return { lw, vw };
    });
    for (const x of widths) w = Math.max(w, x.lw + x.vw + 18);
    w += pad * 2 + (lines.some((l) => l.color) ? 14 : 0);
    const hh = lines.length * lh + pad * 2 - 4;
    let x = px + 14, y = py - hh - 10;
    if (x + w > bounds.x + bounds.w) x = px - w - 14;
    if (y < bounds.y) y = py + 14;
    if (y + hh > bounds.y + bounds.h + 30) y = bounds.y + bounds.h + 30 - hh;
    ctx.shadowColor = 'rgba(0,0,0,0.16)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = ui.color('surface');
    roundRect(ctx, x, y, w, hh, 9);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = ui.color('hair');
    ctx.lineWidth = 0.5;
    ctx.stroke();
    lines.forEach((l, i) => {
      const ly = y + pad + 9 + i * lh;
      let lx = x + pad;
      if (l.color) {
        ctx.fillStyle = ui.color(l.color);
        ctx.fillRect(lx, ly - 1.5, 9, 3);
        lx += 14;
      }
      if (typeof l.label === 'string') {
        ctx.fillStyle = ui.color('ink-2');
        ctx.font = `12px ${ui.FONT_UI}`;
        ctx.textAlign = 'left';
        ctx.fillText(l.label, lx, ly + 4);
      } else ui.drawLabel(ctx, l.label, lx, ly + 4, { size: 12 });
      ctx.fillStyle = ui.color('ink');
      ctx.font = `600 12px ${ui.FONT_UI}`;
      ctx.textAlign = 'right';
      ctx.fillText(l.value || '', x + w - pad, ly + 4);
    });
    ctx.restore();
  };
  ui.drawTooltip = drawTooltip;

  const attachHover = (self, canvas) => {
    const move = (e) => {
      const r = canvas.getBoundingClientRect();
      self.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      self.dirty = true;
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', move);
    canvas.addEventListener('pointerleave', () => { self.hover = null; self.dirty = true; });
  };

  // ---------------------------------------------------------------- XY chart

  class Chart {
    /**
     * opts: {x:{label, min, max}, y:{label, min, max}, height, aspect,
     *        equal (same px per unit on both axes), hover: 'xy'|'x'|false,
     *        zero: true (emphasise axes through 0), quadrants: [{x,y,text}]}
     */
    constructor(box, opts) {
      this.box = box;
      this.opts = { hover: 'xy', zero: true, ...opts };
      this.canvas = h('canvas', { role: 'img', 'aria-label': opts.ariaLabel || '' });
      box.classList.add('chart-box');
      if (opts.height) box.style.height = opts.height + 'px';
      if (opts.aspect) box.style.aspectRatio = String(opts.aspect);
      box.append(this.canvas);
      this.data = { series: [], markers: [], areas: [], texts: [], vlines: [], hlines: [], circles: [] };
      this.hover = null;
      this.dirty = true;
      attachHover(this, this.canvas);
      this.ro = new ResizeObserver(() => { this.dirty = true; });
      this.ro.observe(box);
    }
    set(data) { Object.assign(this.data, data); this.dirty = true; }
    setRange(axis, min, max) { this.opts[axis] = { ...this.opts[axis], min, max }; this.dirty = true; }
    destroy() { this.ro.disconnect(); }

    layout(w, hgt) {
      const o = this.opts;
      const pad = { l: 46, r: 14, t: 24, b: 34, ...(o.pad || {}) };
      let { min: x0, max: x1 } = o.x, { min: y0, max: y1 } = o.y;
      const pw = w - pad.l - pad.r, ph = hgt - pad.t - pad.b;
      if (o.equal) {
        const sx = pw / (x1 - x0), sy = ph / (y1 - y0);
        const s = Math.min(sx, sy);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        x0 = cx - pw / s / 2; x1 = cx + pw / s / 2;
        y0 = cy - ph / s / 2; y1 = cy + ph / s / 2;
      }
      const L = { pad, x0, x1, y0, y1, px: pad.l, py: pad.t, pw, ph };
      L.sx = (x) => pad.l + ((x - x0) / (x1 - x0)) * pw;
      L.sy = (y) => pad.t + ph - ((y - y0) / (y1 - y0)) * ph;
      L.ix = (px) => x0 + ((px - pad.l) / pw) * (x1 - x0);
      L.iy = (py) => y0 + ((pad.t + ph - py) / ph) * (y1 - y0);
      return L;
    }

    render() {
      const { ctx, w, h: hgt } = ui.fitCanvas(this.canvas);
      ctx.clearRect(0, 0, w, hgt);
      const L = this.layout(w, hgt);
      this.L = L;
      const o = this.opts, d = this.data;
      const xt = ticks(L.x0, L.x1, Math.max(3, Math.floor(L.pw / 70)));
      const yt = ticks(L.y0, L.y1, Math.max(3, Math.floor(L.ph / 42)));
      const xStep = xt.length > 1 ? xt[1] - xt[0] : 1, yStep = yt.length > 1 ? yt[1] - yt[0] : 1;

      // grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = ui.color('grid');
      ctx.beginPath();
      for (const v of xt) { const x = Math.round(L.sx(v)) + 0.5; ctx.moveTo(x, L.py); ctx.lineTo(x, L.py + L.ph); }
      for (const v of yt) { const y = Math.round(L.sy(v)) + 0.5; ctx.moveTo(L.px, y); ctx.lineTo(L.px + L.pw, y); }
      ctx.stroke();
      // zero axes
      if (o.zero) {
        ctx.strokeStyle = ui.color('axis');
        ctx.beginPath();
        if (L.x0 < 0 && L.x1 > 0) { const x = Math.round(L.sx(0)) + 0.5; ctx.moveTo(x, L.py); ctx.lineTo(x, L.py + L.ph); }
        if (L.y0 < 0 && L.y1 > 0) { const y = Math.round(L.sy(0)) + 0.5; ctx.moveTo(L.px, y); ctx.lineTo(L.px + L.pw, y); }
        ctx.stroke();
      }
      // tick labels
      ctx.fillStyle = ui.color('ink-3');
      ctx.font = `11px ${ui.FONT_UI}`;
      ctx.textAlign = 'center';
      for (const v of xt) ctx.fillText(tickFmt(v, xStep), L.sx(v), L.py + L.ph + 15);
      ctx.textAlign = 'right';
      for (const v of yt) ctx.fillText(tickFmt(v, yStep), L.px - 7, L.sy(v) + 4);
      // axis titles
      if (o.y.label) ui.drawLabel(ctx, o.y.label, L.px - 40, 13, { size: 11.5, color: ui.color('ink-2') });
      if (o.x.label) ui.drawLabel(ctx, o.x.label, L.px + L.pw, L.py + L.ph + 30, { size: 11.5, align: 'right', color: ui.color('ink-2') });

      ctx.save();
      ctx.beginPath();
      ctx.rect(L.px, L.py - 1, L.pw, L.ph + 2);
      ctx.clip();

      // quadrant / region captions
      for (const t of o.quadrants || []) {
        ctx.fillStyle = ui.color('ink-3');
        ctx.font = `11.5px ${ui.FONT_UI}`;
        ctx.textAlign = t.align || 'left';
        const x = t.px !== undefined ? L.px + t.px * L.pw : L.sx(t.x);
        const y = t.py !== undefined ? L.py + t.py * L.ph : L.sy(t.y);
        ctx.fillText(t.text, x, y);
      }
      // areas
      for (const a of d.areas || []) {
        if (!a.points || a.points.length < 3) continue;
        ctx.fillStyle = withAlpha(ui.color(a.color), a.alpha ?? 0.09);
        ctx.beginPath();
        a.points.forEach(([x, y], i) => (i ? ctx.lineTo(L.sx(x), L.sy(y)) : ctx.moveTo(L.sx(x), L.sy(y))));
        ctx.closePath();
        ctx.fill();
      }
      // reference lines
      for (const v of d.vlines || []) this._refLine(ctx, L, v, true);
      for (const v of d.hlines || []) this._refLine(ctx, L, v, false);
      // circles (current plane limits)
      for (const c of d.circles || []) {
        ctx.beginPath();
        ctx.ellipse(L.sx(c.cx), L.sy(c.cy), Math.abs(L.sx(c.cx + c.r) - L.sx(c.cx)), Math.abs(L.sy(c.cy + c.r) - L.sy(c.cy)), 0, 0, MS.TAU);
        if (c.fill) { ctx.fillStyle = withAlpha(ui.color(c.color), c.alpha ?? 0.07); ctx.fill(); }
        ctx.strokeStyle = ui.color(c.color);
        ctx.lineWidth = c.width || 1.5;
        ctx.setLineDash(c.dash || []);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // series
      for (const s of d.series || []) this._series(ctx, L, s);
      ctx.restore();

      // series end labels (outside the clip so they never get cropped)
      for (const s of d.series || []) if (s.endLabel) this._endLabel(ctx, L, s);
      // texts in data coordinates
      for (const t of d.texts || []) {
        const x = L.sx(t.x), y = L.sy(t.y);
        if (x < L.px - 2 || x > L.px + L.pw + 2 || y < L.py - 2 || y > L.py + L.ph + 2) continue;
        if (typeof t.text === 'string') {
          ctx.fillStyle = ui.color(t.color || 'ink-2');
          ctx.font = `${t.weight || 500} ${t.size || 11.5}px ${ui.FONT_UI}`;
          ctx.textAlign = t.align || 'left';
          ctx.fillText(t.text, x + (t.dx || 0), y + (t.dy || 0));
        } else ui.drawLabel(ctx, t.text, x + (t.dx || 0), y + (t.dy || 0), { size: t.size || 12, align: t.align || 'left', color: ui.color(t.color || 'ink-2') });
      }
      // markers
      for (const m of d.markers || []) this._marker(ctx, L, m);
      // hover
      if (this.hover && o.hover) this._hover(ctx, L);
      this.dirty = false;
    }

    _refLine(ctx, L, v, vertical) {
      ctx.strokeStyle = ui.color(v.color || 'ink-3');
      ctx.lineWidth = v.width || 1;
      ctx.setLineDash(v.dash || [4, 4]);
      ctx.beginPath();
      if (vertical) { const x = L.sx(v.at); ctx.moveTo(x, L.py); ctx.lineTo(x, L.py + L.ph); }
      else { const y = L.sy(v.at); ctx.moveTo(L.px, y); ctx.lineTo(L.px + L.pw, y); }
      ctx.stroke();
      ctx.setLineDash([]);
      if (v.label) {
        ctx.fillStyle = ui.color('ink-3');
        ctx.font = `11px ${ui.FONT_UI}`;
        ctx.textAlign = vertical ? 'left' : 'center';
        if (vertical) ctx.fillText(v.label, L.sx(v.at) + 4, L.py + 12);
        else ctx.fillText(v.label, L.px + L.pw * 0.78, L.sy(v.at) - 5);
      }
    }

    _series(ctx, L, s) {
      const pts = s.points;
      if (!pts || pts.length < 2) return;
      ctx.strokeStyle = withAlpha(ui.color(s.color), s.alpha ?? 1);
      ctx.lineWidth = s.width || 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      let pen = false;
      const big = 1e6;
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
        const X = MS.clamp(L.sx(x), -big, big), Y = MS.clamp(L.sy(y), -big, big);
        if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    _endLabel(ctx, L, s) {
      // last visible point
      let last = null;
      for (let i = s.points.length - 1; i >= 0; i--) {
        const [x, y] = s.points[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const X = L.sx(x), Y = L.sy(y);
        if (X >= L.px && X <= L.px + L.pw && Y >= L.py && Y <= L.py + L.ph) { last = [X, Y]; break; }
      }
      if (!last) return;
      const [X, Y] = last;
      const spec = s.endLabel;
      const right = X > L.px + L.pw - 90;
      ui.drawLabel(ctx, spec, right ? X - 6 : X + 6, MS.clamp(Y + (s.labelDy || -6), L.py + 12, L.py + L.ph - 4), { size: 12, align: right ? 'right' : 'left', color: ui.color('ink-2') });
    }

    _marker(ctx, L, m) {
      const x = L.sx(m.x), y = L.sy(m.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < L.px - 6 || x > L.px + L.pw + 6 || y < L.py - 6 || y > L.py + L.ph + 6) return;
      const r = m.r || 5;
      ctx.beginPath();
      ctx.arc(x, y, r + 2, 0, MS.TAU);
      ctx.fillStyle = ui.color('surface');
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, MS.TAU);
      if (m.hollow) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = ui.color(m.color || 'ink');
        ctx.stroke();
      } else {
        ctx.fillStyle = ui.color(m.color || 'ink');
        ctx.fill();
      }
      if (m.label) {
        ctx.fillStyle = ui.color('ink');
        ctx.font = `600 11.5px ${ui.FONT_UI}`;
        const right = x > L.px + L.pw - 80;
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(m.label, right ? x - r - 6 : x + r + 6, y - r - 2);
      }
    }

    _hover(ctx, L) {
      const { x: hx, y: hy } = this.hover;
      if (hx < L.px || hx > L.px + L.pw || hy < L.py || hy > L.py + L.ph) return;
      const o = this.opts;
      const fmtX = o.x.fmt || ((v) => ui.fmt(v));
      const fmtY = o.y.fmt || ((v) => ui.fmt(v));
      ctx.strokeStyle = ui.color('axis');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(hx) + 0.5, L.py); ctx.lineTo(Math.round(hx) + 0.5, L.py + L.ph);
      if (o.hover === 'xy') { ctx.moveTo(L.px, Math.round(hy) + 0.5); ctx.lineTo(L.px + L.pw, Math.round(hy) + 0.5); }
      ctx.stroke();
      const lines = [];
      if (o.hover === 'xy') {
        // snap to the nearest series point if close
        let best = null;
        for (const s of this.data.series || []) {
          if (s.hover === false || !s.points) continue;
          for (const [x, y] of s.points) {
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const dx = L.sx(x) - hx, dy = L.sy(y) - hy;
            const dd = dx * dx + dy * dy;
            if (dd < 196 && (!best || dd < best.dd)) best = { dd, x, y, s };
          }
        }
        for (const m of this.data.markers || []) {
          if (!m.tip) continue;
          const dx = L.sx(m.x) - hx, dy = L.sy(m.y) - hy;
          const dd = dx * dx + dy * dy;
          if (dd < 196 && (!best || dd <= best.dd + 20)) best = { dd, x: m.x, y: m.y, m };
        }
        const X = best ? best.x : L.ix(hx), Y = best ? best.y : L.iy(hy);
        if (best && best.s) lines.push({ color: best.s.color, label: best.s.name || '', value: '' });
        if (best && best.m) lines.push({ label: best.m.tip, value: '' });
        lines.push({ label: o.x.label || 'x', value: fmtX(X) });
        lines.push({ label: o.y.label || 'y', value: fmtY(Y) });
        if (best) {
          ctx.beginPath();
          ctx.arc(L.sx(X), L.sy(Y), 4, 0, MS.TAU);
          ctx.fillStyle = ui.color('ink');
          ctx.fill();
        }
      } else {
        const X = L.ix(hx);
        lines.push({ label: o.x.label || 'x', value: fmtX(X) });
        for (const s of this.data.series || []) {
          if (s.hover === false || !s.points || !s.name) continue;
          const y = interpAt(s.points, X);
          if (Number.isFinite(y)) lines.push({ color: s.color, label: s.name, value: fmtY(y) });
        }
      }
      drawTooltip(ctx, hx, hy, lines, { x: L.px, y: L.py, w: L.pw, h: L.ph });
    }
  }

  const interpAt = (pts, x) => {
    let lo = 0, hi = pts.length - 1;
    if (hi < 1) return NaN;
    const inc = pts[hi][0] >= pts[0][0];
    if (inc ? (x < pts[0][0] || x > pts[hi][0]) : (x > pts[0][0] || x < pts[hi][0])) return NaN;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((pts[mid][0] <= x) === inc) lo = mid; else hi = mid;
    }
    const [x0, y0] = pts[lo], [x1, y1] = pts[hi];
    return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  };
  ui.interpAt = interpAt;

  // ---------------------------------------------------------------- Scope

  /**
   * Stacked time plots sharing one time axis.
   * strips: [{label:{sym,sub,unit}, series:[{key, color, name, dash}], min, max, sym:true}]
   */
  class Scope {
    constructor(box, { strips, window = 1, stripHeight = 92, timeLabel = { sym: 't', unit: 's' }, timeScale = 1 }) {
      this.box = box;
      this.strips = strips;
      this.window = window;
      this.timeLabel = timeLabel;
      this.timeScale = timeScale; // multiply sim time for the axis (e.g. 1000 for ms)
      this.stripHeight = stripHeight;
      this.canvas = h('canvas', { role: 'img', 'aria-label': MS.L('Zeitverläufe', 'Time plots') });
      box.classList.add('chart-box');
      box.style.height = strips.length * stripHeight + 34 + 'px';
      box.append(this.canvas);
      this.cap = 1800;
      this.t = new Float64Array(this.cap);
      this.v = {};
      for (const s of strips) for (const se of s.series) this.v[se.key] = new Float64Array(this.cap);
      this.len = 0;
      this.head = 0;
      this.ranges = strips.map((s) => ({ min: s.min ?? 0, max: s.max ?? 1 }));
      this.hover = null;
      attachHover(this, this.canvas);
      this.dirty = true;
    }
    setWindow(wnd) { this.window = wnd; this.dirty = true; }
    clear() { this.len = 0; this.head = 0; this.ranges = this.strips.map((s) => ({ min: s.min ?? 0, max: s.max ?? 1 })); this.dirty = true; }
    push(t, values) {
      if (this.len) {
        const lastT = this.t[(this.head - 1 + this.cap) % this.cap];
        if (t < lastT) this.clear();
        else if (t - lastT < this.window / (this.cap * 0.8)) return;
      }
      this.t[this.head] = t;
      for (const k in this.v) this.v[k][this.head] = values[k] ?? NaN;
      this.head = (this.head + 1) % this.cap;
      this.len = Math.min(this.cap, this.len + 1);
      this.dirty = true;
    }
    _idx(i) { return (this.head - this.len + i + this.cap) % this.cap; }

    render() {
      const { ctx, w, h: hgt } = ui.fitCanvas(this.canvas);
      ctx.clearRect(0, 0, w, hgt);
      const padL = 52, padR = 12, padT = 8, gap = 10;
      const pw = w - padL - padR;
      const sh = this.stripHeight - gap;
      const tEnd = this.len ? this.t[this._idx(this.len - 1)] : 0;
      const tStart = Math.max(0, tEnd - this.window);
      const t0 = tEnd > this.window ? tStart : 0;
      const t1 = t0 + this.window;
      const sx = (t) => padL + ((t - t0) / (t1 - t0)) * pw;
      // first index inside the window
      let i0 = 0;
      while (i0 < this.len && this.t[this._idx(i0)] < t0) i0++;
      this._geom = { padL, padT, pw, sh, gap, t0, t1, sx, i0 };

      this.strips.forEach((s, k) => {
        const y0 = padT + k * this.stripHeight;
        // auto range: expand fast, shrink slowly
        let lo = Infinity, hi = -Infinity;
        for (const se of s.series) {
          const arr = this.v[se.key];
          for (let i = i0; i < this.len; i++) {
            const v = arr[this._idx(i)];
            if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
          }
        }
        const R = this.ranges[k];
        if (s.min !== undefined) lo = Math.min(lo, s.min);
        if (s.max !== undefined) hi = Math.max(hi, s.max);
        if (s.sym) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
        if (!Number.isFinite(lo)) { lo = R.min; hi = R.max; }
        if (hi - lo < (s.minSpan || 1e-6)) { const c = (hi + lo) / 2; lo = c - (s.minSpan || 1) / 2; hi = c + (s.minSpan || 1) / 2; }
        const span = hi - lo;
        lo -= span * 0.08; hi += span * 0.08;
        R.min = lo < R.min ? lo : R.min + (lo - R.min) * 0.04;
        R.max = hi > R.max ? hi : R.max + (hi - R.max) * 0.04;
        const sy = (v) => y0 + sh - ((v - R.min) / (R.max - R.min)) * sh;
        s._sy = sy;
        s._y0 = y0;

        // grid + ticks
        const yt = ticks(R.min, R.max, 3);
        const step = yt.length > 1 ? yt[1] - yt[0] : 1;
        ctx.strokeStyle = ui.color('grid');
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const v of yt) { const y = Math.round(sy(v)) + 0.5; ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); }
        ctx.stroke();
        if (R.min < 0 && R.max > 0) {
          ctx.strokeStyle = ui.color('axis');
          ctx.beginPath();
          const y = Math.round(sy(0)) + 0.5;
          ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y);
          ctx.stroke();
        }
        ctx.fillStyle = ui.color('ink-3');
        ctx.font = `10.5px ${ui.FONT_UI}`;
        ctx.textAlign = 'right';
        for (const v of yt) ctx.fillText(tickFmt(v, step), padL - 6, sy(v) + 3.5);
        // strip label (top-left inside)
        ui.drawLabel(ctx, s.label, padL + 6, y0 + 12, { size: 11.5, color: ui.color('ink-2') });

        ctx.save();
        ctx.beginPath();
        ctx.rect(padL, y0 - 1, pw, sh + 2);
        ctx.clip();
        for (const se of s.series) {
          const arr = this.v[se.key];
          ctx.strokeStyle = ui.color(se.color);
          ctx.lineWidth = se.width || 1.75;
          ctx.lineJoin = 'round';
          ctx.setLineDash(se.dash || []);
          ctx.beginPath();
          let pen = false;
          for (let i = i0; i < this.len; i++) {
            const j = this._idx(i);
            const v = arr[j];
            if (!Number.isFinite(v)) { pen = false; continue; }
            const X = sx(this.t[j]), Y = MS.clamp(sy(v), -1e5, 1e5);
            if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
        // legend at right for multi-series strips
        if (s.series.length > 1) {
          let lx = padL + pw - 6;
          ctx.textAlign = 'right';
          for (let q = s.series.length - 1; q >= 0; q--) {
            const se = s.series[q];
            const wLbl = ui.drawLabel(ctx, se.name, lx, y0 + 12, { size: 11, align: 'right', color: ui.color('ink-2') });
            lx -= wLbl + 5;
            ctx.strokeStyle = ui.color(se.color);
            ctx.lineWidth = 2;
            ctx.setLineDash(se.dash || []);
            ctx.beginPath(); ctx.moveTo(lx - 12, y0 + 8); ctx.lineTo(lx, y0 + 8); ctx.stroke();
            ctx.setLineDash([]);
            lx -= 22;
          }
        }
      });

      // time axis
      const yAxis = padT + this.strips.length * this.stripHeight - gap + 2;
      const tt = ticks(t0 * this.timeScale, t1 * this.timeScale, Math.max(3, Math.floor(pw / 80)));
      const tStep = tt.length > 1 ? tt[1] - tt[0] : 1;
      ctx.fillStyle = ui.color('ink-3');
      ctx.font = `10.5px ${ui.FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = ui.color('grid');
      ctx.beginPath();
      for (const v of tt) {
        const x = Math.round(sx(v / this.timeScale)) + 0.5;
        ctx.moveTo(x, padT); ctx.lineTo(x, yAxis - 2);
      }
      ctx.stroke();
      for (const v of tt) ctx.fillText(tickFmt(v, tStep), sx(v / this.timeScale), yAxis + 12);
      ui.drawLabel(ctx, this.timeLabel, padL + pw, yAxis + 27, { size: 11.5, align: 'right', color: ui.color('ink-2') });

      if (this.hover) this._hover(ctx);
      this.dirty = false;
    }

    _hover(ctx) {
      const g = this._geom;
      const { x: hx, y: hy } = this.hover;
      if (hx < g.padL || hx > g.padL + g.pw || !this.len) return;
      const t = g.t0 + ((hx - g.padL) / g.pw) * (g.t1 - g.t0);
      // nearest sample
      let best = -1, bd = Infinity;
      for (let i = g.i0; i < this.len; i++) {
        const d = Math.abs(this.t[this._idx(i)] - t);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return;
      const j = this._idx(best);
      const X = g.sx(this.t[j]);
      ctx.strokeStyle = ui.color('axis');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(X) + 0.5, g.padT); ctx.lineTo(Math.round(X) + 0.5, g.padT + this.strips.length * this.stripHeight - g.gap);
      ctx.stroke();
      const lines = [{ label: this.timeLabel, value: ui.fmt(this.t[j] * this.timeScale) + ' ' + (this.timeLabel.unit || '') }];
      for (const s of this.strips) {
        for (const se of s.series) {
          const v = this.v[se.key][j];
          lines.push({ color: se.color, label: se.name, value: ui.fmt(v) + (s.label.unit ? ' ' + s.label.unit : '') });
          if (Number.isFinite(v) && s._sy) {
            ctx.beginPath();
            ctx.arc(X, MS.clamp(s._sy(v), s._y0, s._y0 + g.sh), 3.5, 0, MS.TAU);
            ctx.fillStyle = ui.color(se.color);
            ctx.fill();
          }
        }
      }
      drawTooltip(ctx, hx, hy, lines, { x: g.padL, y: g.padT, w: g.pw, h: this.strips.length * this.stripHeight });
    }
  }

  // ---------------------------------------------------------------- Phasor

  /**
   * Zeigerdiagramm with equal axes.
   * set({vectors:[{x0,y0,x,y,color,width,dash,label:{sym,sub}, alpha}],
   *      circles:[{cx,cy,r,color,dash}], axes:[{angle,label,color}], range})
   */
  class Phasor {
    constructor(box, { aspect = 1, height, axes = [{ angle: 0, label: { sym: 'd' } }, { angle: Math.PI / 2, label: { sym: 'q' } }], minRange = 1 } = {}) {
      this.box = box;
      this.canvas = h('canvas', { role: 'img', 'aria-label': MS.L('Zeigerdiagramm', 'Phasor diagram') });
      box.classList.add('chart-box');
      if (height) box.style.height = height + 'px'; else box.style.aspectRatio = String(aspect);
      box.append(this.canvas);
      this.axes = axes;
      this.minRange = minRange;
      this.R = minRange;
      this.data = { vectors: [], circles: [], arcs: [] };
      this.hover = null;
      attachHover(this, this.canvas);
    }
    set(data) { Object.assign(this.data, data); }

    render() {
      const { ctx, w, h: hgt } = ui.fitCanvas(this.canvas);
      ctx.clearRect(0, 0, w, hgt);
      const d = this.data;
      // auto range
      let target = this.minRange;
      for (const v of d.vectors) {
        target = Math.max(target, Math.hypot(v.x, v.y), Math.hypot(v.x0 || 0, v.y0 || 0));
      }
      target *= 1.12;
      if (d.range) target = d.range;
      this.R = target > this.R ? target : this.R + (target - this.R) * 0.06;
      const cx = d.center ? d.center.x : 0, cy = d.center ? d.center.y : 0;
      const s = (Math.min(w, hgt) / 2 - 16) / this.R;
      const ox = w / 2 - cx * s, oy = hgt / 2 + cy * s;
      const X = (x) => ox + x * s, Y = (y) => oy - y * s;
      this._map = { X, Y, s, ox, oy };

      // unit circle + axes
      ctx.strokeStyle = ui.color('grid');
      ctx.lineWidth = 1;
      for (const r of ticks(0, this.R, 3).filter((r) => r > 0)) {
        ctx.beginPath(); ctx.arc(ox, oy, r * s, 0, MS.TAU); ctx.stroke();
      }
      for (const a of this.axes) {
        const ex = Math.cos(a.angle), ey = Math.sin(a.angle);
        const L = Math.max(w, hgt);
        ctx.strokeStyle = ui.color(a.color || 'axis');
        ctx.setLineDash(a.dash || []);
        ctx.beginPath();
        ctx.moveTo(ox - ex * (a.half ? 0 : L), oy + ey * (a.half ? 0 : L));
        ctx.lineTo(ox + ex * L, oy - ey * L);
        ctx.stroke();
        ctx.setLineDash([]);
        if (a.label) {
          const rr = Math.min(w, hgt) / 2 - 8;
          let lx = ox + ex * rr, ly = oy - ey * rr;
          lx = MS.clamp(lx, 10, w - 14); ly = MS.clamp(ly, 14, hgt - 6);
          ui.drawLabel(ctx, a.label, lx + 4, ly - 4, { size: 12, color: ui.color('ink-3') });
        }
      }
      for (const c of d.circles || []) {
        ctx.beginPath();
        ctx.arc(X(c.cx), Y(c.cy), Math.abs(c.r * s), 0, MS.TAU);
        ctx.strokeStyle = ui.color(c.color || 'ink-3');
        ctx.lineWidth = c.width || 1;
        ctx.setLineDash(c.dash || [3, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const a of d.arcs || []) {
        ctx.beginPath();
        ctx.arc(ox, oy, a.r * s, -a.from, -a.to, a.to > a.from);
        ctx.strokeStyle = ui.color(a.color || 'ink-3');
        ctx.lineWidth = a.width || 1.25;
        ctx.stroke();
      }
      // vectors (draw order = array order)
      const labels = [];
      for (const v of d.vectors) {
        const x0 = X(v.x0 || 0), y0 = Y(v.y0 || 0), x1 = X(v.x), y1 = Y(v.y);
        const len = Math.hypot(x1 - x0, y1 - y0);
        const col = withAlpha(ui.color(v.color), v.alpha ?? 1);
        if (len < 0.5) continue;
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = v.width || 2.25;
        ctx.lineCap = 'round';
        ctx.setLineDash(v.dash || []);
        const head = Math.min(9, len * 0.45) * (v.width ? Math.max(0.8, v.width / 2.25) : 1);
        const k = len > head ? (len - head * 0.8) / len : 0;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
        ctx.stroke();
        ctx.setLineDash([]);
        if (v.head !== false) arrowHead(ctx, x0, y0, x1, y1, head);
        if (v.label && len > (v.labelMin || 14)) labels.push({ v, x0, y0, x1, y1, len });
      }
      for (const l of labels) {
        const { v, x0, y0, x1, y1, len } = l;
        const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
        const at = v.labelAt ?? 1;
        const off = v.labelOff ?? 10;
        const px = x0 + (x1 - x0) * at + nx * off * (v.labelSide || 1);
        const py = y0 + (y1 - y0) * at + ny * off * (v.labelSide || 1);
        ctx.font = `italic 13.5px ${ui.FONT_MATH}`;
        ui.drawLabel(ctx, v.label, MS.clamp(px, 4, w - 30), MS.clamp(py + 4, 12, hgt - 4), { size: 12.5, align: 'center', color: ui.color('ink') });
      }
      if (this.hover && d.vectors.length) this._hover(ctx, w, hgt);
    }

    _hover(ctx, w, hgt) {
      const { X, Y } = this._map;
      const { x: hx, y: hy } = this.hover;
      let best = null;
      for (const v of this.data.vectors) {
        if (!v.name) continue;
        const dx = X(v.x) - hx, dy = Y(v.y) - hy;
        const dd = dx * dx + dy * dy;
        if (dd < 400 && (!best || dd < best.dd)) best = { dd, v };
      }
      if (!best) return;
      const v = best.v;
      const vx = v.x - (v.x0 || 0), vy = v.y - (v.y0 || 0);
      drawTooltip(ctx, hx, hy, [
        { color: v.color, label: v.name, value: '' },
        { label: 'Betrag', value: ui.fmt(Math.hypot(vx, vy)) },
        { label: 'Winkel', value: ui.fmt(Math.atan2(vy, vx) / MS.DEG, 1) + '°' },
      ], { x: 0, y: 0, w, h: hgt });
    }
  }

  ui.Chart = Chart;
  ui.Scope = Scope;
  ui.Phasor = Phasor;
})(typeof globalThis !== 'undefined' ? globalThis : window);
