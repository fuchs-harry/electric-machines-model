/*
 * Apple-style controls bound to a model through get/set closures.
 * Every control returns {el, sync}; call sync() after the model changed
 * from elsewhere (presets, experiments).
 */
(function (root) {
  'use strict';
  const MS = root.MS || (root.MS = {});
  const ui = MS.ui;
  const { h } = ui;

  const keyBar = (q) => (q ? h('i', { class: 'key', style: { color: `var(--${ui.Q[q] || q})` } }) : null);

  /**
   * Slider row: label (math html), optional description, number box + unit,
   * range input. Linear or logarithmic.
   */
  ui.slider = ({ label, desc, unit = '', min, max, step = 0, get, set, digits, log = false, q, onChange }) => {
    const toPos = (v) => {
      if (log) return (Math.log(Math.max(v, min)) - Math.log(min)) / (Math.log(max) - Math.log(min));
      return (v - min) / (max - min);
    };
    const fromPos = (t) => {
      let v = log ? Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min))) : min + t * (max - min);
      if (step) v = Math.round(v / step) * step;
      return MS.clamp(v, min, max);
    };
    const range = h('input', { type: 'range', min: 0, max: 1000, step: 1, 'aria-label': typeof desc === 'string' ? desc : '' });
    const num = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': (typeof desc === 'string' ? desc : '') + MS.L(' Wert', ' value') });
    const lbl = h('span', { class: 'lbl' }, keyBar(q), h('span', { html: label }), desc ? h('span', { class: 'desc', text: desc }) : null);
    const row = h('div', { class: 'row' },
      h('div', { class: 'row-line' }, lbl, h('span', { class: 'valbox' }, num, h('span', { class: 'unit', html: unit }))),
      range);
    const fmtVal = (v) => ui.fmt(v, digits !== undefined ? digits : ui.autoDigits(v));
    const sync = () => {
      const v = get();
      const t = MS.clamp(toPos(v), 0, 1);
      range.value = Math.round(t * 1000);
      range.style.setProperty('--pct', `${t * 100}%`);
      if (document.activeElement !== num) num.value = fmtVal(v);
    };
    range.addEventListener('input', () => {
      const v = fromPos(range.value / 1000);
      set(v);
      num.value = fmtVal(v);
      range.style.setProperty('--pct', `${(range.value / 10)}%`);
      onChange && onChange(v);
    });
    let dirty = false;
    num.addEventListener('input', () => { dirty = true; });
    const commit = () => {
      // Typed values may leave the slider range on purpose (exam numbers);
      // only a log scale needs a positive value.
      const v = dirty ? ui.parse(num.value) : null;
      dirty = false;
      if (v !== null && !(log && v <= 0)) { set(v); onChange && onChange(v); }
      sync();
    };
    num.addEventListener('change', commit);
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { num.blur(); } });
    num.addEventListener('blur', commit);
    sync();
    return { el: row, sync };
  };

  /** Segmented control. options: [{value, label, title}] */
  ui.seg = ({ options, get, set, full = false, small = false, label }) => {
    const el = h('div', { class: 'seg' + (full ? ' full' : ''), role: 'group', 'aria-label': label || '' });
    const btns = options.map((o) => {
      const b = h('button', { type: 'button', title: o.title || '', html: o.label });
      b.addEventListener('click', () => { set(o.value); sync(); });
      el.append(b);
      return b;
    });
    if (small) el.style.fontSize = '12px';
    const sync = () => {
      const v = get();
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
    };
    sync();
    return { el, sync };
  };

  /** Row with label and segmented control. */
  ui.segRow = ({ label, desc, options, get, set }) => {
    const s = ui.seg({ options, get, set, full: true, label: desc });
    const el = h('div', { class: 'row' },
      label ? h('div', { class: 'row-line' }, h('span', { class: 'lbl' }, h('span', { html: label }), desc ? h('span', { class: 'desc', text: desc }) : null)) : null,
      s.el);
    return { el, sync: s.sync };
  };

  /** Switch row (iOS toggle). */
  ui.toggle = ({ label, desc, get, set }) => {
    const input = h('input', { type: 'checkbox', role: 'switch' });
    input.addEventListener('change', () => set(input.checked));
    const el = h('div', { class: 'row' },
      h('label', { class: 'row-line' },
        h('span', { class: 'lbl' }, h('span', { html: label }), desc ? h('span', { class: 'desc', text: desc }) : null),
        h('span', { class: 'switch' }, input, h('span'))));
    const sync = () => { input.checked = !!get(); };
    sync();
    return { el, sync };
  };

  /** Popup (select) row. */
  ui.select = ({ label, desc, options, get, set }) => {
    const sel = h('select', { 'aria-label': desc || '' });
    for (const o of options) sel.append(h('option', { value: o.value, text: o.label }));
    sel.addEventListener('change', () => set(sel.value));
    const el = h('div', { class: 'row' },
      h('div', { class: 'row-line' },
        h('span', { class: 'lbl' }, h('span', { html: label })),
        h('span', { class: 'popup' }, sel)),
      desc ? h('div', { class: 'desc muted', style: { fontSize: '11.5px' }, text: desc }) : null);
    const sync = () => { sel.value = get(); };
    sync();
    return { el, sync };
  };

  /** Plain info row (read-only value). */
  ui.info = ({ label, value }) => {
    const v = h('span', { class: 'num', style: { fontSize: '13px' } });
    const el = h('div', { class: 'row' }, h('div', { class: 'row-line' }, h('span', { class: 'lbl', html: label }), v));
    const sync = () => { v.innerHTML = value(); };
    sync();
    return { el, sync };
  };

  /** Grouped inset list. rows: control objects ({el, sync}) or elements. */
  ui.group = ({ title, rows, foot, action }) => {
    const body = h('div', { class: 'group-body' });
    const ctrls = [];
    for (const r of rows) {
      if (!r) continue;
      if (r.el) { body.append(r.el); ctrls.push(r); } else body.append(r);
    }
    const el = h('section', { class: 'group' },
      title ? h('h3', { class: 'group-title' }, h('span', { html: title }), h('span', { class: 'spacer' }), action || null) : null,
      body,
      foot ? h('p', { class: 'group-foot', html: foot }) : null);
    return { el, sync: () => ctrls.forEach((c) => c.sync()) };
  };

  ui.button = ({ label, icon, kind = '', onClick, title, small = false }) => {
    const b = h('button', { type: 'button', class: `btn ${kind}${small ? ' small' : ''}${!label ? ' icon' : ''}`, title: title || label || '', 'aria-label': title || label || '' },
      icon ? ui.icon(icon) : null, label ? h('span', { text: label }) : null);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };

  /** Big power switch for the toolbar. */
  ui.power = ({ get, set, labelOn = MS.L('Ein', 'On'), labelOff = MS.L('Aus', 'Off'), title = MS.L('Einschalten', 'Switch on') }) => {
    const txt = h('span');
    const b = h('button', { type: 'button', class: 'power', title }, h('span', { class: 'knob' }, ui.icon('power')), txt);
    b.addEventListener('click', () => { set(!get()); sync(); });
    const sync = () => {
      const on = !!get();
      b.setAttribute('aria-pressed', String(on));
      txt.textContent = on ? labelOn : labelOff;
    };
    sync();
    return { el: b, sync };
  };

  /** Status pill with icon + label (status colors never stand alone). */
  ui.pill = (kind, icon, html) => h('span', { class: `pill ${kind}` }, ui.icon(icon), h('span', { html }));
})(typeof globalThis !== 'undefined' ? globalThis : window);
