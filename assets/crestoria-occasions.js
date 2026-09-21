/* Crestoria V13 — dependency-free, continuously scrolling occasion categories.
 * Native horizontal scrolling preserves links, touch panning and keyboard focus.
 * Accessible originals occur once; visual loop copies are excluded from tab order.
 */
(() => {
  'use strict';
  if (window.CrestoriaOccasionsV13) return;
  const instances = new Map();
  const selector = '[data-cr-occasions]';
  class OccasionMarquee {
    constructor(root) {
      this.root = root;
      this.rail = root.querySelector('[data-cr-occasion-rail]');
      this.items = [...this.rail.querySelectorAll(':scope > [data-cr-occasion-item]')];
      this.controls = root.querySelector('[data-cr-occasion-controls]');
      this.toggle = root.querySelector('[data-cr-occasion-toggle]');
      this.signal = new AbortController();
      this.motion = matchMedia('(prefers-reduced-motion: reduce)');
      this.paused = this.motion.matches;
      this.speed = Math.max(10, Math.min(60, Number(root.dataset.speed) || 28));
      this.frame = 0; this.position = 0; this.cycle = 0; this.base = 0;
      this.lastWritten = 0; this.visible = true; this.hover = false; this.focus = false;
      this.pointer = null; this.editorSelected = false; this.blockSelected = false;
      this.inspector = Boolean(window.Shopify?.inspectMode);
      this.destroyed = false; this.holdUntil = 0; this.lastWidth = -1;
      // Freeze only the existing UI backgrounds so a visual copy is identical at the seam.
      // No product images or color swatches are changed.
      this.savedBackgrounds = this.items.map(item => {
        const media = item.querySelector('.pm-tile-media');
        if (!media) return null;
        const old = media.style.background;
        media.style.background = getComputedStyle(media).background;
        return { media, old };
      });
      this.bind();
      this.rebuild();
      this.updateToggle();
      if ('ResizeObserver' in window) {
        this.resize = new ResizeObserver(() => {
          const width = this.rail.clientWidth;
          const tileWidth = this.items[0].getBoundingClientRect().width;
          if (Math.abs(width - this.lastWidth) < 1 && Math.abs(tileWidth - this.lastItemWidth) < 0.5) return;
          cancelAnimationFrame(this.resizeFrame);
          this.resizeFrame = requestAnimationFrame(() => this.rebuild());
        });
        this.resize.observe(this.rail);
        this.resize.observe(this.items[0]);
      } else this.on(window, 'resize', () => this.rebuild());
      if ('IntersectionObserver' in window) {
        this.intersection = new IntersectionObserver(entries => {
          this.visible = entries[0].isIntersecting;
          this.wake();
        }, { threshold: 0 });
        this.intersection.observe(root);
      }
    }
    on(target, type, listener, options = {}) {
      target?.addEventListener(type, listener, { ...options, signal: this.signal.signal });
    }
    clone(item) {
      const copy = item.cloneNode(true);
      copy.dataset.crOccasionClone = 'true';
      copy.removeAttribute('data-cr-occasion-item');
      copy.setAttribute('aria-hidden', 'true');
      copy.tabIndex = -1;
      // Shopify must identify only the real editor blocks, not the loop copies.
      [copy, ...copy.querySelectorAll('*')].forEach(node => {
        node.removeAttribute('id');
        [...node.attributes].filter(a => a.name.startsWith('data-shopify')).forEach(a => node.removeAttribute(a.name));
        if (node.matches('a,button,input,select,textarea,[tabindex]')) node.tabIndex = -1;
      });
      return copy;
    }
    rebuild() {
      if (this.destroyed) return;
      this.stop();
      const oldFraction = this.cycle ? (((this.position - this.base) % this.cycle) + this.cycle) % this.cycle / this.cycle : 0;
      this.rail.querySelectorAll('[data-cr-occasion-clone]').forEach(node => node.remove());
      this.lastWidth = this.rail.clientWidth;
      if (!this.lastWidth || this.items.length < 2) { this.cycle = 0; return; }
      const first = this.items[0];
      this.lastItemWidth = first.getBoundingClientRect().width;
      const last = this.items[this.items.length - 1];
      const gap = parseFloat(getComputedStyle(this.rail).columnGap) || 0;
      this.cycle = last.getBoundingClientRect().right - first.getBoundingClientRect().left + gap;
      if (this.cycle <= 0) return;
      const copies = Math.max(1, Math.ceil(this.rail.clientWidth / this.cycle));
      const before = document.createDocumentFragment(), after = document.createDocumentFragment();
      for (let i = 0; i < copies; i++) this.items.forEach(item => before.append(this.clone(item)));
      for (let i = 0; i < copies + 1; i++) this.items.forEach(item => after.append(this.clone(item)));
      this.rail.prepend(before); this.rail.append(after);
      // offsetLeft is relative to the window; subtract the first copy for an exact cycle start.
      this.base = first.getBoundingClientRect().left - this.rail.firstElementChild.getBoundingClientRect().left;
      this.write(this.base + oldFraction * this.cycle);
      this.root.classList.add('is-marquee-ready');
      this.controls.hidden = false;
      this.wake();
    }
    normalized(value) {
      return this.cycle ? this.base + ((value - this.base) % this.cycle + this.cycle) % this.cycle : value;
    }
    write(value) {
      this.position = value;
      this.rail.scrollLeft = value;
      this.lastWritten = this.rail.scrollLeft;
    }
    canRun() {
      return !this.destroyed && this.root.isConnected && this.cycle > 0 && this.visible && !document.hidden &&
        !this.paused && !this.hover && !this.focus && !this.pointer &&
        !this.editorSelected && !this.blockSelected && !this.inspector;
    }
    stop() { cancelAnimationFrame(this.frame); this.frame = 0; this.lastTime = 0; }
    wake() {
      if (!this.canRun()) { this.stop(); return; }
      if (!this.frame) this.frame = requestAnimationFrame(time => this.tick(time));
    }
    tick(time) {
      this.frame = 0;
      if (!this.canRun()) { this.lastTime = 0; return; }
      const dt = this.lastTime ? Math.min(50, time - this.lastTime) : 0;
      this.lastTime = time;
      if (time >= this.holdUntil) {
        // Keep a fractional position: scrollLeft may be rounded by the browser.
        this.write(this.normalized(this.position + this.speed * dt / 1000));
      }
      this.frame = requestAnimationFrame(t => this.tick(t));
    }
    hold(milliseconds = 2200) {
      this.holdUntil = performance.now() + milliseconds;
      this.wake();
    }
    updateToggle() {
      this.toggle.setAttribute('aria-pressed', String(this.paused));
      this.toggle.setAttribute('aria-label', this.paused ? 'Start automatic scrolling' : 'Pause automatic scrolling');
      this.toggle.querySelector('[data-cr-pause-icon]').toggleAttribute('hidden', this.paused);
      this.toggle.querySelector('[data-cr-play-icon]').toggleAttribute('hidden', !this.paused);
    }
    step(direction) {
      if (!this.cycle) return;
      this.hold();
      const gap = parseFloat(getComputedStyle(this.rail).columnGap) || 0;
      const distance = this.items[0].getBoundingClientRect().width + gap;
      // Remain within the safe duplicated buffers during a native smooth scroll.
      this.write(this.normalized(this.rail.scrollLeft));
      this.rail.scrollBy({ left: direction * distance, behavior: this.motion.matches ? 'auto' : 'smooth' });
    }
    bind() {
      this.on(this.toggle, 'click', () => {
        this.paused = !this.paused;
        this.holdUntil = 0;
        this.updateToggle(); this.wake();
      });
      this.on(this.root.querySelector('[data-cr-occasion-prev]'), 'click', () => this.step(-1));
      this.on(this.root.querySelector('[data-cr-occasion-next]'), 'click', () => this.step(1));
      this.on(this.rail, 'pointerenter', event => {
        if (event.pointerType !== 'touch') { this.hover = true; this.wake(); }
      });
      this.on(this.rail, 'pointerleave', event => {
        if (event.pointerType !== 'touch') { this.hover = false; this.wake(); }
      });
      this.on(this.rail, 'focusin', event => {
        const clone = event.target.closest('[data-cr-occasion-clone]');
        // A pointer can focus a visual duplicate even though it isn't in tab order.
        // Keep it operable and do not shift the target before its click.
        this.focus = !clone && !this.pointer; this.wake();
      });
      this.on(this.rail, 'focusout', () => {
        queueMicrotask(() => { this.focus = this.rail.contains(document.activeElement) &&
          !document.activeElement.closest('[data-cr-occasion-clone]'); this.wake(); });
      });
      this.on(this.rail, 'keydown', event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); this.step(event.key === 'ArrowLeft' ? -1 : 1);
        }
      });
      this.on(this.rail, 'wheel', () => this.hold(), { passive: true });
      this.on(this.rail, 'scroll', () => {
        const actual = this.rail.scrollLeft;
        if (Math.abs(actual - this.lastWritten) <= 1) return;
        this.position = actual; this.lastWritten = actual;
        this.hold();
      }, { passive: true });
      this.on(this.rail, 'dragstart', event => event.preventDefault());
      this.on(this.rail, 'pointerdown', event => {
        if (event.button !== 0 || this.pointer) return;
        this.focus = false;
        this.pointer = { id:event.pointerId, type:event.pointerType, x:event.clientX,
          y:event.clientY, left:this.rail.scrollLeft, moved:false };
        this.stop();
      });
      this.on(window, 'pointermove', event => {
        const p = this.pointer;
        if (!p || p.id !== event.pointerId || p.type === 'touch') return;
        const dx = event.clientX - p.x, dy = event.clientY - p.y;
        if (!p.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
          p.moved = true; this.rail.classList.add('is-dragging');
          this.rail.setPointerCapture?.(p.id);
        }
        if (!p.moved) return;
        event.preventDefault();
        const desired = p.left - dx;
        const normalized = this.normalized(desired);
        p.left += normalized - desired;
        this.write(normalized);
      }, { passive:false });
      const release = event => {
        const p = this.pointer;
        if (!p || p.id !== event.pointerId) return;
        if (p.moved) this.suppressClickUntil = performance.now() + 350;
        if (this.rail.hasPointerCapture?.(p.id)) this.rail.releasePointerCapture(p.id);
        this.pointer = null; this.rail.classList.remove('is-dragging');
        this.position = this.rail.scrollLeft; this.lastWritten = this.position;
        this.hold();
      };
      this.on(window, 'pointerup', release);
      this.on(window, 'pointercancel', release);
      this.on(this.rail, 'click', event => {
        if (performance.now() < (this.suppressClickUntil || 0)) {
          event.preventDefault(); event.stopPropagation();
        }
      }, { capture:true });
      this.on(window, 'blur', () => {
        this.pointer = null; this.hover = false; this.rail.classList.remove('is-dragging'); this.stop();
      });
      this.on(window, 'focus', () => this.wake());
      this.on(document, 'visibilitychange', () => this.wake());
      this.on(this.motion, 'change', () => {
        if (this.motion.matches) this.paused = true;
        this.updateToggle(); this.wake();
      });
    }
    selectBlock(blockID, selected) {
      this.blockSelected = selected; this.wake();
      if (!selected) return;
      const item = this.items.find(node => node.dataset.crOccasionItem === blockID);
      if (item) this.write(item.getBoundingClientRect().left - this.rail.firstElementChild.getBoundingClientRect().left - (this.rail.clientWidth - item.clientWidth) / 2);
    }
    destroy() {
      this.destroyed = true; this.stop(); cancelAnimationFrame(this.resizeFrame);
      this.signal.abort(); this.resize?.disconnect(); this.intersection?.disconnect();
      this.rail.querySelectorAll('[data-cr-occasion-clone]').forEach(node => node.remove());
      this.savedBackgrounds.forEach(record => { if (record) record.media.style.background = record.old; });
      this.root.classList.remove('is-marquee-ready'); this.controls.hidden = true;
    }
  }
  const init = (scope = document) => {
    const roots = [...scope.querySelectorAll(selector)];
    if (scope.matches?.(selector)) roots.unshift(scope);
    roots.forEach(root => {
      if (!instances.has(root) && root.querySelectorAll('[data-cr-occasion-item]').length > 1) {
        instances.set(root, new OccasionMarquee(root));
      }
    });
  };
  const within = (target, fn) => instances.forEach((instance, root) => {
    if (root === target || target.contains(root) || root.contains(target)) fn(instance, root);
  });
  document.addEventListener('shopify:section:load', event => init(event.target));
  document.addEventListener('shopify:section:unload', event => within(event.target, (instance, root) => {
    instance.destroy(); instances.delete(root);
  }));
  document.addEventListener('shopify:section:select', event => within(event.target, instance => {
    instance.editorSelected = true; instance.wake();
  }));
  document.addEventListener('shopify:section:deselect', event => within(event.target, instance => {
    instance.editorSelected = false; instance.wake();
  }));
  document.addEventListener('shopify:block:select', event => within(event.target, instance => instance.selectBlock(event.detail.blockId, true)));
  document.addEventListener('shopify:block:deselect', event => within(event.target, instance => instance.selectBlock(event.detail.blockId, false)));
  document.addEventListener('shopify:inspector:activate', () => instances.forEach(instance => { instance.inspector = true; instance.wake(); }));
  document.addEventListener('shopify:inspector:deactivate', () => instances.forEach(instance => { instance.inspector = false; instance.wake(); }));
  window.addEventListener('pageshow', () => instances.forEach(instance => instance.wake()));
  window.addEventListener('pagehide', () => instances.forEach(instance => instance.stop()));
  window.CrestoriaOccasionsV13 = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once:true });
  else init();
})();
