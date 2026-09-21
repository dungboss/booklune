/* Crestoria Market V7. Vanilla JS; no external slider, search or wishlist service. */
(() => {
  'use strict';
  if (window.CrestoriaMarket) return;
  const NS = window.CrestoriaMarket = {};
  const storageKey = 'crestoria:saved-gifts:v1';
  const rootURL = () => window.Shopify?.routes?.root || '/';
  let toastTimer, memoryList = [];
  let lastOpener = null;
  let headerObserver, cartTimer;
  const refreshCartCount = () => {
    clearTimeout(cartTimer);
    cartTimer = setTimeout(async () => {
      try {
        const response = await fetch(rootURL() + 'cart.js', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const cart = await response.json();
        if (!Number.isInteger(cart.item_count) || cart.item_count < 0) return;
        document.querySelectorAll('[data-pm-cart-count]').forEach(el => { el.textContent = cart.item_count; el.hidden = cart.item_count === 0; });
        document.querySelectorAll('.pm-cart-link').forEach(el => el.setAttribute('aria-label', `Cart, ${cart.item_count} items`));
      } catch (_) { /* Keep the server-rendered count if a request is unavailable. */ }
    }, 120);
  };
  const safeURL = (value, image = false) => {
    try {
      const u = new URL(value, location.origin);
      if (!['https:', 'http:'].includes(u.protocol)) return '';
      if (!image && u.origin !== location.origin) return '';
      return u.href;
    } catch (_) { return ''; }
  };
  const loadList = () => {
    try {
      const x = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(x) ? x.filter(v => v && typeof v.id === 'string' && typeof v.title === 'string').slice(0, 60) : [];
    } catch (_) { return memoryList; }
  };
  const saveList = list => {
    memoryList = list.slice(0, 60);
    try { localStorage.setItem(storageKey, JSON.stringify(memoryList)); } catch (_) {}
  };
  const toast = text => {
    const el = document.querySelector('[data-pm-toast]');
    if (!el) return;
    clearTimeout(toastTimer); el.textContent = text; el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  };
  const syncSaved = () => {
    const list = loadList();
    document.querySelectorAll('[data-pm-wishlist-count]').forEach(el => { el.textContent = list.length; el.hidden = !list.length; });
    document.querySelectorAll('[data-pm-save]').forEach(btn => {
      const saved = list.some(item => item.id === btn.dataset.id);
      btn.setAttribute('aria-pressed', String(saved));
      btn.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${btn.dataset.title || 'gift'}${saved ? ' from saved gifts' : ''}`);
    });
  };
  const renderWishlist = () => {
    const area = document.querySelector('[data-pm-wishlist-list]');
    if (!area) return;
    area.replaceChildren();
    const items = loadList();
    if (!items.length) {
      const p = document.createElement('p'); p.textContent = 'Tap the heart on a product to save it here.'; area.append(p); return;
    }
    const grid = document.createElement('div'); grid.className = 'pm-wishlist-grid';
    items.forEach(item => {
      const article = document.createElement('article'); article.className = 'pm-wishlist-entry';
      const link = document.createElement('a'); link.href = safeURL(item.url) || rootURL() + 'collections/all';
      const src = safeURL(item.image, true);
      if (src) { const img = document.createElement('img'); img.src = src; img.alt = item.title; img.loading = 'lazy'; link.append(img); }
      const h = document.createElement('h3'); h.textContent = item.title; link.append(h);
      // Saved products link to current product data; no stale prices are represented as current prices.
      const p = document.createElement('p'); p.className = 'pm-muted'; p.textContent = 'View product'; link.append(p);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'pm-wishlist-remove'; remove.textContent = '×'; remove.dataset.pmRemoveSaved = item.id; remove.setAttribute('aria-label', `Remove ${item.title}`);
      article.append(link, remove); grid.append(article);
    });
    area.append(grid);
  };
  const closeDialog = dialog => {
    if (!dialog?.open) return;
    dialog.close();
  };
  const openDialog = (id, trigger) => {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    const returnFocus = trigger?.closest('.pm-dialog') ? lastOpener : trigger;
    document.querySelectorAll('.pm-dialog[open]').forEach(d => d.close());
    lastOpener = returnFocus;
    if (id === 'PMWishlist') renderWishlist();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };
  const initDialogs = scope => {
    scope.querySelectorAll('.pm-dialog').forEach(dialog => {
      if (dialog.dataset.ready) return; dialog.dataset.ready = 'true';
      dialog.addEventListener('click', e => {
        if (e.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(dialog);
      });
      dialog.addEventListener('close', () => {
        const el = lastOpener;
        requestAnimationFrame(() => { if (!document.querySelector('.pm-dialog[open]') && el?.isConnected) el.focus({ preventScroll: true }); });
      });
    });
  };
  const syncHeader = () => {
    headerObserver?.disconnect();
    const header = document.querySelector('.pm-header-host');
    if (!header) return;
    const update = () => document.documentElement.style.setProperty('--pm-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    update();
    if ('ResizeObserver' in window) { headerObserver = new ResizeObserver(update); headerObserver.observe(header); }
  };
  const initSearch = scope => {
    scope.querySelectorAll('[data-pm-search]').forEach(el => {
      if (el.dataset.ready) return; el.dataset.ready = 'true';
      const input = el.querySelector('[data-pm-search-input]');
      const results = el.querySelector('[data-pm-search-results]');
      if (!input || !results) return;
      let timer, controller, active = -1, version = 0;
      const hide = () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
      const reveal = () => { results.hidden = false; input.setAttribute('aria-expanded', 'true'); };
      const addMessage = text => { const p = document.createElement('p'); p.className = 'pm-search-status'; p.textContent = text; results.append(p); };
      const fetchResults = async () => {
        if (document.activeElement !== input || !el.isConnected) return;
        const query = input.value.trim(); const requestID = ++version;
        controller?.abort();
        if (query.length < 2) { hide(); return; }
        controller = new AbortController();
        results.replaceChildren(); addMessage('Searching…'); reveal();
        try {
          const url = new URL(rootURL() + 'search/suggest.json', location.origin);
          url.searchParams.set('q', query); url.searchParams.set('resources[type]', 'product'); url.searchParams.set('resources[limit]', '6');
          const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('Search unavailable');
          const data = await response.json();
          if (requestID !== version || !el.isConnected || input.value.trim() !== query) return;
          results.replaceChildren(); active = -1; input.removeAttribute('aria-activedescendant');
          const products = data.resources?.results?.products || [];
          products.forEach((product, index) => {
            const url = safeURL(product.url); if (!url) return;
            const a = document.createElement('a'); a.href = url; a.id = `${results.id}-option-${index}`; a.setAttribute('role', 'option'); a.setAttribute('aria-selected', 'false');
            const src = typeof product.image === 'string' ? product.image : product.featured_image?.url;
            if (src && safeURL(src, true)) { const img = document.createElement('img'); img.src = safeURL(src, true); img.alt = ''; img.width = 52; img.height = 52; a.append(img); }
            const title = document.createElement('span'); title.textContent = product.title; a.append(title); results.append(a);
          });
          if (!products.length) addMessage('No suggested products. Search the full shop below.');
          const more = document.createElement('a');
          more.href = rootURL() + 'search?type=product&q=' + encodeURIComponent(query); more.textContent = `See all results for “${query}”`; more.id = `${results.id}-option-all`; more.setAttribute('role', 'option'); more.setAttribute('aria-selected', 'false'); results.append(more);
          if (document.activeElement === input) reveal();
        } catch (error) {
          if (error.name === 'AbortError' || requestID !== version) return;
          results.replaceChildren();
          const a = document.createElement('a'); a.href = rootURL() + 'search?type=product&q=' + encodeURIComponent(query); a.textContent = 'Search all products'; a.id = `${results.id}-fallback`; a.setAttribute('role', 'option'); results.append(a);
        }
      };
      input.addEventListener('input', () => { clearTimeout(timer); controller?.abort(); if (input.value.trim().length < 2) hide(); timer = setTimeout(fetchResults, 230); });
      input.addEventListener('focus', () => { if (input.value.trim().length > 1) fetchResults(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { hide(); return; }
        const items = [...results.querySelectorAll('[role=option]')];
        if (results.hidden || !items.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items.forEach((item, i) => item.setAttribute('aria-selected', String(i === active)));
          input.setAttribute('aria-activedescendant', items[active].id); items[active].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.assign(items[active].href); }
      });
      el.addEventListener('focusout', () => setTimeout(() => { if (!el.contains(document.activeElement)) hide(); }, 100));
    });
  };
  const initCarousels = scope => {
    scope.querySelectorAll('[data-pm-carousel]').forEach(wrap => {
      if (wrap.dataset.ready) return; wrap.dataset.ready = 'true';
      const rail = wrap.querySelector('[data-pm-rail]'), prev = wrap.querySelector('[data-pm-prev]'), next = wrap.querySelector('[data-pm-next]'), status = wrap.querySelector('[data-pm-page]');
      if (!rail || !prev || !next) return;
      const step = () => {
        const first = rail.firstElementChild; if (!first) return rail.clientWidth;
        const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
        const cell = first.getBoundingClientRect().width + gap;
        return Math.max(1, Math.floor((rail.clientWidth + gap + 1) / cell)) * cell;
      };
      const update = () => {
        const overflow = rail.scrollWidth - rail.clientWidth;
        prev.disabled = rail.scrollLeft < 2; next.disabled = rail.scrollLeft >= overflow - 2;
        const controls = prev.parentElement; controls.hidden = overflow < 4;
        if (status) status.textContent = `${Math.min(Math.ceil(overflow / step()) + 1, Math.round(rail.scrollLeft / step()) + 1)} / ${Math.ceil(overflow / step()) + 1}`;
      };
      const move = direction => rail.scrollBy({ left: direction * step(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      prev.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1)); rail.addEventListener('scroll', update, { passive: true });
      if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(update); observer.observe(rail); wrap._pmObserver = observer;
      }
      update();
    });
  };
  const initMenus = scope => {
    scope.querySelectorAll('.pm-menu').forEach(menu => {
      if (menu.dataset.ready) return; menu.dataset.ready = 'true';
      menu.addEventListener('toggle', () => { if (menu.open) document.querySelectorAll('.pm-menu[open]').forEach(other => { if (other !== menu) other.open = false; }); });
    });
  };
  const init = (scope = document) => { initDialogs(scope); initSearch(scope); initCarousels(scope); initMenus(scope); syncHeader(); syncSaved(); };
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-pm-open]');
    if (opener) { e.preventDefault(); openDialog(opener.dataset.pmOpen, opener); return; }
    const closer = e.target.closest('[data-pm-close]');
    if (closer) { closeDialog(closer.closest('dialog')); return; }
    const save = e.target.closest('[data-pm-save]');
    if (save) {
      const list = loadList(); const exists = list.some(item => item.id === save.dataset.id);
      if (exists) { saveList(list.filter(item => item.id !== save.dataset.id)); toast('Removed from your saved gifts.'); }
      else {
        if (list.length >= 60) { toast('You have 60 saved gifts. Remove one to save another.'); return; }
        list.push({ id: save.dataset.id, handle: save.dataset.handle, title: save.dataset.title, image: save.dataset.image, url: save.dataset.url }); saveList(list); toast('Added to your saved gifts.');
      }
      syncSaved(); return;
    }
    const remove = e.target.closest('[data-pm-remove-saved]');
    if (remove) { saveList(loadList().filter(item => item.id !== remove.dataset.pmRemoveSaved)); syncSaved(); renderWishlist(); return; }
    document.querySelectorAll('.pm-menu[open]').forEach(menu => { if (!menu.contains(e.target)) menu.open = false; });
    document.querySelectorAll('[data-pm-search]').forEach(el => { if (!el.contains(e.target)) { el.querySelector('[data-pm-search-results]').hidden = true; el.querySelector('input').setAttribute('aria-expanded','false'); } });
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-pm-country]')) { const f = e.target.form; f.requestSubmit ? f.requestSubmit() : f.submit(); }
  });
  document.addEventListener('submit', e => {
    if (!e.target.matches('[data-pm-gift-form]')) return;
    const interest = e.target.querySelector('[data-pm-gift-interest]');
    if (interest?.value && safeURL(interest.value)) e.target.action = interest.value;
    const budget = e.target.querySelector('[name="filter.v.price.lte"]');
    if (budget && !budget.value) budget.disabled = true;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.pm-menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary')?.focus(); });
  });
  document.addEventListener('shopify:section:load', e => init(e.target));
  document.addEventListener('shopify:section:unload', e => e.target.querySelectorAll('[data-pm-carousel]').forEach(el => el._pmObserver?.disconnect()));
  window.addEventListener('storage', e => { if (e.key === storageKey) { syncSaved(); renderWishlist(); } });
  window.addEventListener('pageshow', event => { syncSaved(); if (event.persisted) refreshCartCount(); });
  // Dawn's product/cart events update the new header without replacing its markup.
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, refreshCartCount);
  }
  document.addEventListener('cart:updated', refreshCartCount);
  document.addEventListener('cart:change', refreshCartCount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true }); else init();
  NS.refresh = init;
})();
