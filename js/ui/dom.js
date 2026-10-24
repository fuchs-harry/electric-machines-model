/*
 * DOM helpers, icons, number formatting and theme colors.
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});
  const ui = MS.ui || (MS.ui = {});

  /** h('div', {class, style, on:{click}, attrs, html}, ...children) */
  ui.h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };

  /** Math symbol span, e.g. ui.sym('U', 'A') → italic U with subscript A. */
  ui.sym = (base, sub, sup) => {
    const el = document.createElement('span');
    el.className = 'm';
    el.innerHTML = base + (sub ? `<sub>${sub}</sub>` : '') + (sup ? `<sup>${sup}</sup>` : '');
    return el;
  };

  // ---------------------------------------------------------------- icons
  const ICONS = {
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5.5h2.6v13H8zM13.4 5.5H16v13h-2.6z" fill="currentColor" stroke="none"/>',
    reset: '<path d="M5 12a7 7 0 1 0 2.1-5M5 4.5V8h3.5"/>',
    power: '<path d="M12 4v7M7.5 6.8a7 7 0 1 0 9 0"/>',
    flask: '<path d="M9.5 4h5M10.5 4v5.2L5.6 17.6A1.6 1.6 0 0 0 7 20h10a1.6 1.6 0 0 0 1.4-2.4l-4.9-8.4V4M8 14h8"/>',
    sliders: '<path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    waves: '<circle cx="12" cy="12" r="7.5"/><path d="M12 12l5.3-5.3"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    dc: '<rect x="4" y="7" width="16" height="10" rx="5"/><path d="M8.5 12h7M12 9.5v5" />',
    psm: '<circle cx="12" cy="12" r="7.5"/><path d="M12 6.5v11"/><path d="M12 6.5a5.5 5.5 0 0 1 0 11" fill="currentColor" opacity=".25" stroke="none"/>',
    home: '<path d="M4.5 11 12 5l7.5 6M6.5 9.5V19h11V9.5"/>',
    sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    auto: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v15" /><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none"/>',
    check: '<circle cx="12" cy="12" r="8"/><path d="m8.3 12.3 2.4 2.4 5-5.2"/>',
    warn: '<path d="M12 4.5 20 19H4z"/><path d="M12 10v4M12 16.6v.1"/>',
    stop: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 15.8v.1"/>',
    pin: '<path d="M9 4h6l-1 5 3 3H7l3-3zM12 12v8"/>',
    menu: '<path d="M5 7.5h14M5 12h14M5 16.5h14"/>',
    arrowUp: '<path d="M12 18V6M7 11l5-5 5 5"/>',
    arrowDown: '<path d="M12 6v12M7 13l5 5 5-5"/>',
    bolt: '<path d="M13 3.5 6 13.5h5l-1 7 7-10h-5z"/>',
    gauge: '<path d="M5 16a7 7 0 1 1 14 0"/><path d="m12 16 3.5-4.5"/>',
    load: '<path d="M7 9h10l1.5 10h-13zM9.5 9V7a2.5 2.5 0 0 1 5 0v2"/>',
    info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.1"/>',
    loop: '<path d="M7 7h8a4 4 0 0 1 0 8H8M10 12l-3 3 3 3"/>',
  };
  ui.icon = (name, cls) => {
    const span = document.createElement('span');
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ''}</svg>`;
    return span.firstChild;
  };

  // ---------------------------------------------------------------- numbers
  const nfCache = {};
  const nf = (d) => nfCache[d] || (nfCache[d] = new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true,
  }));
  /** Decimal places chosen from the magnitude so read-outs stay calm. */
  ui.autoDigits = (v) => {
    const a = Math.abs(v);
    if (a >= 100) return 0;
    if (a >= 10) return 1;
    if (a >= 1) return 2;
    return 3;
  };
  ui.fmt = (v, d) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    if (d === undefined) d = ui.autoDigits(v);
    const s = nf(d).format(Math.abs(v) < 0.5 * 10 ** -d ? 0 : v);
    return s.replace('-', '−');
  };
  /** Parse "1,5", "1.5", "−2" … */
  ui.parse = (s) => {
    const t = String(s).trim().replace(/\s/g, '').replace('−', '-').replace(',', '.');
    const v = parseFloat(t);
    return Number.isFinite(v) ? v : null;
  };

  // ---------------------------------------------------------------- theme
  const colorCache = new Map();
  ui.color = (token) => {
    if (!token) return '#888';
    if (token[0] === '#' || token.startsWith('rgb')) return token;
    const name = token.startsWith('--') ? token : `--${token}`;
    let c = colorCache.get(name);
    if (!c) {
      c = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
      colorCache.set(name, c);
    }
    return c;
  };
  ui.isDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };
  ui.themeListeners = new Set();
  ui.invalidateTheme = () => {
    colorCache.clear();
    ui.themeListeners.forEach((fn) => fn());
  };
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ui.invalidateTheme);
  }
  ui.reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Quantity → color token (one hue per physical quantity). */
  ui.Q = { U: 'c-u', I: 'c-i', PSI: 'c-psi', M: 'c-m', N: 'c-n', P1: 'c-p1', P2: 'c-p2', P3: 'c-p3', REF: 'c-ref', INK: 'ink', INK2: 'ink-2' };

  /** Canvas sized to its box at device pixel ratio; returns {ctx, w, h}. */
  ui.fitCanvas = (canvas) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), hh = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hh * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: hh, dpr };
  };

  /**
   * Draw "symbol_sub in unit" with a serif italic symbol on a canvas.
   * spec = {sym:'n', sub:'', unit:'min⁻¹'} or a plain string.
   * Returns the drawn width. align: 'left' | 'right' | 'center'.
   */
  const labelParts = (ctx, spec, size, unitSep) => {
    if (typeof spec === 'string') spec = { text: spec };
    const parts = [];
    if (spec.sym) parts.push({ t: spec.sym, f: `italic ${size + 1.5}px ${MATH}`, dy: 0 });
    if (spec.sub) parts.push({ t: spec.sub, f: `${size - 2}px ${MATH}`, dy: size * 0.3 });
    if (spec.sym2) parts.push({ t: spec.sym2, f: `italic ${size + 1.5}px ${MATH}`, dy: 0 });
    if (spec.sub2) parts.push({ t: spec.sub2, f: `${size - 2}px ${MATH}`, dy: size * 0.3 });
    if (spec.text) parts.push({ t: (spec.sym ? ' ' : '') + spec.text, f: `${size}px ${UI}`, dy: 0 });
    if (spec.unit) parts.push({ t: (spec.sym ? unitSep : '') + spec.unit, f: `${size}px ${UI}`, dy: 0 });
    let total = 0;
    for (const p of parts) { ctx.font = p.f; p.w = ctx.measureText(p.t).width; total += p.w; }
    return { parts, total };
  };
  ui.measureLabel = (ctx, spec, { size = 12, unitSep = ' in ' } = {}) => labelParts(ctx, spec, size, unitSep).total;
  ui.drawLabel = (ctx, spec, x, y, { size = 12, color, align = 'left', unitSep = ' in ' } = {}) => {
    const { parts, total } = labelParts(ctx, spec, size, unitSep);
    let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    ctx.fillStyle = color || ui.color('ink-2');
    ctx.textAlign = 'left';
    for (const p of parts) { ctx.font = p.f; ctx.fillText(p.t, cx, y + p.dy); cx += p.w; }
    return total;
  };
  const UI = '"Inter", -apple-system, "Segoe UI", system-ui, sans-serif';
  const MATH = '"STIX Two Text", "Cambria Math", "Times New Roman", serif';
  ui.FONT_UI = UI;
  ui.FONT_MATH = MATH;
})(typeof globalThis !== 'undefined' ? globalThis : window);
