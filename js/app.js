/*
 * App shell: sidebar navigation, hash router, theme switch, animation loop.
 */
(function (root) {
  'use strict';
  const MS = root.MS;
  const ui = MS.ui;
  const { h } = ui;

  const NAV = [
    { title: null, items: [{ route: '', label: 'Übersicht', icon: 'home' }] },
    { title: 'Grundlagen', items: [{ route: 'raumzeiger', label: 'Raumzeiger & Drehfeld', icon: 'waves' }] },
    {
      title: 'Gleichstrommaschine',
      items: [
        { route: 'gsm/pm', label: 'Permanenterregt', icon: 'dc' },
        { route: 'gsm/fremd', label: 'Fremderregt', icon: 'dc' },
        { route: 'gsm/neben', label: 'Nebenschluss', icon: 'dc' },
        { route: 'gsm/reihen', label: 'Reihenschluss', icon: 'dc' },
      ],
    },
    {
      title: 'Synchronmaschine (PSM)',
      items: [
        { route: 'psm/foc', label: 'Sinusbetrieb', icon: 'psm' },
        { route: 'psm/bldc', label: 'Blockkommutierung', icon: 'psm' },
        { route: 'psm/uf', label: 'Spannungsgesteuert', icon: 'psm' },
        { route: 'psm/passive', label: 'Generator & Kurzschluss', icon: 'psm' },
        { route: 'psm/dc', label: 'Gleichstrom einprägen', icon: 'psm' },
      ],
    },
  ];

  const appEl = document.getElementById('app');
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');
  let page = null;
  let links = [];

  // ---------------------------------------------------------------- sidebar
  const brandMark = () => {
    const c = h('canvas', { class: 'brand-mark', 'aria-hidden': 'true' });
    requestAnimationFrame(() => {
      const { ctx, w } = ui.fitCanvas(c);
      const r = w / 2;
      ctx.fillStyle = ui.color('ink');
      ctx.beginPath(); ctx.arc(r, r, r, 0, MS.TAU); ctx.fill();
      ctx.strokeStyle = ui.color('bg');
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(r, r, r * 0.58, 0, MS.TAU); ctx.stroke();
      ctx.strokeStyle = ui.color('c-i');
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r, r); ctx.lineTo(r + r * 0.42, r - r * 0.42); ctx.stroke();
    });
    return c;
  };

  const buildSidebar = () => {
    sidebar.innerHTML = '';
    sidebar.append(h('div', { class: 'brand' }, brandMark(),
      h('div', {}, h('div', { class: 'brand-name', text: 'Maschinenlabor' }), h('div', { class: 'brand-sub', text: 'Maschinen und Antriebe' }))));
    links = [];
    for (const g of NAV) {
      const nav = h('nav', { class: 'nav' });
      for (const it of g.items) {
        const a = h('a', { href: '#/' + it.route }, ui.icon(it.icon), h('span', { text: it.label }));
        a.dataset.route = it.route;
        a.addEventListener('click', () => appEl.classList.remove('nav-open'));
        links.push(a);
        nav.append(a);
      }
      sidebar.append(h('div', { class: 'nav-group' }, g.title ? h('div', { class: 'nav-title', text: g.title }) : null, nav));
    }
    // theme
    const getTheme = () => document.documentElement.dataset.theme || 'auto';
    const setTheme = (t) => {
      if (t === 'auto') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = t;
      try { localStorage.setItem('ml-theme', t); } catch (e) { /* storage unavailable */ }
      ui.invalidateTheme();
    };
    const theme = ui.seg({
      options: [{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }],
      get: getTheme, set: setTheme, full: true, label: 'Erscheinungsbild',
    });
    sidebar.append(h('div', { class: 'sidebar-foot' }, theme.el,
      h('p', { html: 'Lernwerkzeug, kein Ersatz für Skriptum und Übung. Alle Modelle, Kennlinien und Bilder werden hier aus den Gleichungen berechnet.' })));
  };

  // ---------------------------------------------------------------- router
  const routes = {
    '': () => MS.pages.home(),
    raumzeiger: () => MS.pages.spacevector(),
    gsm: (arg) => MS.pages.dc(arg || 'pm'),
    psm: (arg) => MS.pages.psm(arg || 'foc'),
  };

  const mount = () => {
    const hash = location.hash.replace(/^#\/?/, '');
    const [head, arg] = hash.split('/');
    const make = routes[head] || routes[''];
    if (page && page.destroy) page.destroy();
    main.innerHTML = '';
    main.scrollTop = 0;
    try {
      page = make(arg);
    } catch (err) {
      console.error(err);
      page = null;
      main.append(h('div', { class: 'home' }, h('h1', { text: 'Diese Seite konnte nicht geladen werden.' }), h('p', { class: 'muted', text: String(err) })));
      return;
    }
    main.append(page.el);
    markNav();
    try { localStorage.setItem('ml-route', hash); } catch (e) { /* storage unavailable */ }
    if (page.mounted) page.mounted();
  };

  const DEFAULT_ARG = { gsm: 'pm', psm: 'foc' };
  const markNav = () => {
    const [head, arg] = location.hash.replace(/^#\/?/, '').split('/');
    const current = !routes[head] ? '' : DEFAULT_ARG[head] ? `${head}/${arg || DEFAULT_ARG[head]}` : head;
    for (const a of links) {
      if (a.dataset.route === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  };

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  const frame = (ts) => {
    const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000));
    last = ts;
    if (page) {
      try {
        if (page.tick) page.tick(dt);
        if (page.render) page.render(dt);
      } catch (err) {
        console.error(err);
      }
    }
    requestAnimationFrame(frame);
  };

  // ---------------------------------------------------------------- init
  buildSidebar();
  main.addEventListener('scroll', () => main.classList.toggle('scrolled', main.scrollTop > 4), { passive: true });
  ui.themeListeners.add(() => {
    buildSidebar();
    markNav();
    if (page && page.onTheme) page.onTheme();
  });
  window.addEventListener('hashchange', mount);
  if (!location.hash) {
    try { const r = localStorage.getItem('ml-route'); if (r) history.replaceState(null, '', '#/' + r); } catch (e) { /* storage unavailable */ }
  }
  mount();
  requestAnimationFrame(frame);

  // `MS.app.page()` gives the mounted page (handy in the console: page().debug)
  MS.app = { toggleNav: () => appEl.classList.toggle('nav-open'), page: () => page };
})(window);
