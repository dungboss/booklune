/* Crestoria V9: independent accessible hero; no changes to product, cart or tab logic. */
(() => {
  'use strict';
  if (window.CrestoriaV9) return;
  const instances = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function initHero(root) {
    if (instances.has(root)) return;
    const slides = Array.from(root.querySelectorAll('[data-pm-hero-slide]'));
    if (!slides.length) return;
    const dots = Array.from(root.querySelectorAll('[data-pm-hero-dot]'));
    const stage = root.querySelector('[data-pm-hero-stage]');
    const pause = root.querySelector('[data-pm-hero-pause]');
    const status = root.querySelector('[data-pm-hero-status]');
    const controller = new AbortController();
    const signal = controller.signal;
    const automatic = root.dataset.autoplay === 'true' && slides.length > 1;
    const interval = Math.max(4000, Number(root.dataset.interval) || 6000);
    let active = 0;
    let timer = 0;
    let stopped = reducedMotion.matches;
    let hovered = false;
    let focused = false;
    let visible = true;
    let editorSelected = false;
    let touchStart = null;

    function stopTimer() { window.clearTimeout(timer); timer = 0; }
    function mayRotate() {
      return automatic && !stopped && !hovered && !focused && visible && !document.hidden && !editorSelected;
    }
    function schedule() {
      stopTimer();
      if (mayRotate()) timer = window.setTimeout(() => { select(active + 1, false); }, interval);
    }
    function updatePause() {
      if (!pause) return;
      pause.setAttribute('aria-pressed', String(stopped));
      pause.setAttribute('aria-label', stopped ? 'Start automatic banner rotation' : 'Pause automatic banner rotation');
      const icon = pause.querySelector('[data-pm-hero-pause-icon]');
      if (icon) icon.textContent = stopped ? '▶' : 'Ⅱ';
    }
    function select(index, manual = true) {
      if (slides.length < 1) return;
      const next = ((index % slides.length) + slides.length) % slides.length;
      if (manual) { stopped = true; updatePause(); }
      // Never leave keyboard focus inside a newly hidden slide.
      if (next !== active && slides[active].contains(document.activeElement)) {
        (dots[next] || root.querySelector('[data-pm-hero-next]'))?.focus({ preventScroll: true });
      }
      active = next;
      slides.forEach((slide, i) => {
        const current = i === active;
        slide.hidden = !current;
        slide.inert = !current;
        slide.classList.toggle('is-current', current);
      });
      dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === active)));
      root.dataset.activeSlide = String(active);
      if (status) {
        status.setAttribute('aria-live', manual ? 'polite' : 'off');
        status.textContent = `${active + 1} of ${slides.length}: ${slides[active].dataset.slideLabel || 'Featured collection'}`;
      }
      // Secondary images start lazy; requesting the active image avoids an empty change.
      slides[active].querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
      schedule();
    }
    root.querySelector('[data-pm-hero-prev]')?.addEventListener('click', () => select(active - 1), { signal });
    root.querySelector('[data-pm-hero-next]')?.addEventListener('click', () => select(active + 1), { signal });
    dots.forEach((dot, index) => dot.addEventListener('click', () => select(index), { signal }));
    pause?.addEventListener('click', () => {
      stopped = !stopped;
      // An explicit play request starts the clock; keyboard focus moving to copy pauses again.
      if (!stopped) { focused = false; hovered = false; }
      updatePause(); schedule();
    }, { signal });
    root.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); select(active - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); select(active + 1); }
      if (event.key === 'Home' && event.target.matches('[data-pm-hero-dot]')) { event.preventDefault(); select(0); dots[0]?.focus(); }
      if (event.key === 'End' && event.target.matches('[data-pm-hero-dot]')) { event.preventDefault(); select(slides.length - 1); dots[slides.length - 1]?.focus(); }
    }, { signal });
    root.addEventListener('mouseenter', () => { hovered = true; schedule(); }, { signal });
    root.addEventListener('mouseleave', () => { hovered = false; schedule(); }, { signal });
    root.addEventListener('focusin', () => { focused = true; schedule(); }, { signal });
    root.addEventListener('focusout', () => { queueMicrotask(() => { focused = root.contains(document.activeElement); schedule(); }); }, { signal });
    document.addEventListener('visibilitychange', schedule, { signal });
    stage?.addEventListener('touchstart', event => {
      touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true, signal });
    stage?.addEventListener('touchend', event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.x;
      const dy = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) select(active + (dx < 0 ? 1 : -1));
    }, { passive: true, signal });
    stage?.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true, signal });
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0.15);
      schedule();
    }, { threshold: [0, 0.15, 0.5] }) : null;
    observer?.observe(root);
    const onMotionChange = () => { if (reducedMotion.matches) stopped = true; updatePause(); schedule(); };
    reducedMotion.addEventListener('change', onMotionChange, { signal });
    const api = {
      select,
      selectBlock(blockId) {
        const index = slides.findIndex(slide => slide.dataset.blockId === String(blockId));
        if (index !== -1) { editorSelected = true; select(index, false); stopTimer(); }
      },
      releaseEditor() { editorSelected = false; schedule(); },
      destroy() { stopTimer(); controller.abort(); observer?.disconnect(); instances.delete(root); root.classList.remove('is-ready'); }
    };
    instances.set(root, api);
    updatePause();
    select(0, false);
    root.classList.add('is-ready');
  }
  function refresh(scope = document) {
    if (scope.matches?.('[data-pm-hero]')) initHero(scope);
    scope.querySelectorAll?.('[data-pm-hero]').forEach(initHero);
  }
  document.addEventListener('shopify:section:load', event => refresh(event.target));
  document.addEventListener('shopify:section:unload', event => {
    for (const [root, api] of instances) if (event.target === root || event.target.contains(root)) api.destroy();
  });
  document.addEventListener('shopify:block:select', event => {
    const slide = event.target.closest?.('[data-pm-hero-slide]');
    const root = slide?.closest('[data-pm-hero]') || event.target.querySelector?.('[data-pm-hero]');
    if (root) instances.get(root)?.selectBlock(event.detail?.blockId || slide?.dataset.blockId);
  });
  document.addEventListener('shopify:block:deselect', event => {
    const root = event.target.closest?.('[data-pm-hero]') || event.target.querySelector?.('[data-pm-hero]');
    if (root) instances.get(root)?.releaseEditor();
  });
  window.CrestoriaV9 = { refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });
  else refresh();
})();
