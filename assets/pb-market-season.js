/* Crestoria Market V8. Independent, keyboard-accessible departments; no dependency. */
(() => {
  'use strict';
  if (window.CrestoriaSeasons) return;
  const getRoots = scope => [
    ...(scope.matches?.('[data-pm-season]') ? [scope] : []),
    ...scope.querySelectorAll('[data-pm-season]')
  ];
  const init = (scope = document) => {
    getRoots(scope).forEach(root => {
      if (root.dataset.seasonReady === 'true') return;
      const tabs = [...root.querySelectorAll('[data-pm-season-tab]')];
      const panels = [...root.querySelectorAll('[data-pm-season-panel]')];
      const tablist = root.querySelector('[data-pm-season-tabs]');
      if (!tabs.length || tabs.length !== panels.length || !tablist) return;
      root.dataset.seasonReady = 'true';
      tablist.setAttribute('role', 'tablist');
      tablist.setAttribute('aria-orientation', 'horizontal');
      tabs.forEach((tab, i) => {
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', panels[i].id);
        panels[i].setAttribute('role', 'tabpanel');
        panels[i].tabIndex = 0;
      });
      const activate = (i, focus = false) => {
        if (!Number.isInteger(i) || i < 0 || i >= tabs.length) return;
        tabs.forEach((tab, n) => {
          const active = n === i;
          tab.setAttribute('aria-selected', String(active));
          tab.tabIndex = active ? 0 : -1;
          panels[n].hidden = !active;
        });
        root.classList.add('is-enhanced');
        if (focus) {
          tabs[i].focus({ preventScroll: true });
          // Only move the category rail, never scroll the whole page on a tab change.
          const a = tabs[i].getBoundingClientRect(), b = tablist.getBoundingClientRect();
          if (a.left < b.left || a.right > b.right) {
            tablist.scrollBy({ left: a.left - b.left - (b.width - a.width) / 2, behavior: 'auto' });
          }
        }
        // Existing product rails observe width changes after a panel is made visible.
        window.CrestoriaMarket?.refresh(root);
      };
      tabs.forEach((tab, i) => {
        tab.addEventListener('click', event => { event.preventDefault(); activate(i, true); });
        tab.addEventListener('keydown', event => {
          let next;
          if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = tabs.length - 1;
          else if (event.key === ' ') next = i;
          if (next === undefined) return;
          event.preventDefault(); activate(next, true);
        });
      });
      let first = root.dataset.initialTab === 'first' ? 0 : panels.findIndex(p => Number(p.dataset.productCount) > 0);
      if (first < 0) first = 0;
      const hashIndex = panels.findIndex(p => '#' + p.id === location.hash);
      activate(hashIndex >= 0 ? hashIndex : first);
      root._pmActivateBlock = blockID => {
        const i = tabs.findIndex(t => t.dataset.blockId === blockID);
        if (i >= 0) activate(i);
      };
    });
  };
  document.addEventListener('shopify:section:load', event => init(event.target));
  document.addEventListener('shopify:block:select', event => {
    const root = event.target.closest('[data-pm-season]');
    if (root) root._pmActivateBlock?.(event.detail?.blockId || event.target.dataset.blockId);
  });
  // On mobile, department links must close the native drawer before navigating.
  document.addEventListener('click', event => {
    const a = event.target.closest('a[href]');
    if (!a) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (_) { return; }
    if (!['#pb-halloween', '#pb-christmas', '#pb-wedding'].includes(url.hash)) return;
    const dialog = a.closest('dialog[open]');
    if (dialog && typeof dialog.close === 'function') dialog.close();
    if (url.origin === location.origin && url.pathname === location.pathname) {
      const target = document.getElementById(url.hash.slice(1));
      if (target) {
        event.preventDefault();
        history.replaceState(null, '', url.hash);
        requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'auto' }));
      }
    }
  });
  window.CrestoriaSeasons = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
})();
