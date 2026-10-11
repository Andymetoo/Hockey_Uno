import { measure } from './performance.mjs';

// Presentation geometry only. No game state, saved data, timers or RNG.
export function frameScroll({ region, top, bottom, scrollY, maxScroll }) {
  const room = Math.max(1, bottom - top);
  const center = (region.top + region.bottom) / 2;
  return Math.max(0, Math.min(maxScroll, scrollY + center - (top + room / 2)));
}

export function createViewportChoreographer() {
  const root = document.documentElement;
  const dock = document.querySelector('.action-dock');
  const board = document.querySelector('.board-and-altitude');
  const status = document.querySelector('#status');
  let context = {}, signature = '', frame = 0, interrupted = false;
  let lastHeight = 0, lastStatusHeight = 0;
  const viewport = () => ({ top: visualViewport?.offsetTop ?? 0, height: visualViewport?.height ?? innerHeight });
  const cancel = () => { interrupted = true; cancelAnimationFrame(frame); };
  // A deliberate inspection gesture wins over a pending automatic frame.
  addEventListener('touchmove', cancel, { passive: true });
  addEventListener('wheel', cancel, { passive: true });
  addEventListener('keydown', e => { if (!e.defaultPrevented && ['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(e.key) && !e.target.closest('button,[role=button],input,select,textarea,dialog,summary')) cancel(); });

  function bounds() {
    const vv = viewport(), sheet = dock.getBoundingClientRect();
    const top = vv.top + status.getBoundingClientRect().height + 8;
    return { top, bottom: Math.min(vv.top + vv.height, sheet.top) - 10 };
  }
  function layout() {
    const vv = viewport(), sheet = dock.getBoundingClientRect();
    root.style.setProperty('--visible-height', `${Math.round(vv.height)}px`);
    root.style.setProperty('--viewport-bottom', `${Math.max(0, innerHeight - vv.top - vv.height)}px`);
    if (Math.abs(sheet.height - lastHeight) > 1) {
      lastHeight = sheet.height;
      root.style.setProperty('--controller-height', `${Math.ceil(sheet.height)}px`);
    }
    const { top, bottom } = bounds();
    // Keep the complete fighter field at its natural width when it fits. On a
    // short phone, shrink only enough to expose it above the actual controller.
    const fitting = ['ready','choosing','targeting','activating','resolving'].includes(context.mode);
    const stage = document.querySelector('#board-stage');
    const overhead = context.mode === 'resolving' || context.mode === 'activating'
      ? stage.getBoundingClientRect().height + document.querySelector('#conditions').getBoundingClientRect().height + 20 : 0;
    board.style.setProperty('--frame-board-size', fitting ? `${Math.max(250, Math.floor(bottom - top - overhead))}px` : '760px');
  }
  function region() {
    if (context.region === 'crew') return document.querySelector('#crew-list').getBoundingClientRect();
    const svg = document.querySelector('#board svg');
    if (!svg) return null;
    const full = svg.getBoundingClientRect();
    if (['activating','resolving'].includes(context.mode)) {
      return { top: document.querySelector('#board-stage').getBoundingClientRect().top, bottom: full.bottom };
    }
    const { top, bottom } = bounds();
    if (full.height <= bottom - top) return full;
    // If the entire field cannot fit at readable scale, favor the relevant
    // targets, worker and selected cells; preserve context with a margin.
    const targets = [...svg.querySelectorAll('.target-legal,.target-chosen')];
    const selected = context.actor && svg.querySelector(`[data-crew-id="${CSS.escape(context.actor)}"]`);
    if (selected) targets.push(selected);
    const rects = targets.map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
    if (!rects.length) return full;
    return { top: Math.max(full.top, Math.min(...rects.map(r => r.top)) - 28), bottom: Math.min(full.bottom, Math.max(...rects.map(r => r.bottom)) + 28) };
  }
  function schedule(force = false) {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // Pinch zoom is an intentional close inspection, not a new phone size.
      if (globalThis.visualViewport?.scale > 1.05) return;
      measure('viewport-layout', layout);
      frame = requestAnimationFrame(() => {
        if ((!force && interrupted) || document.querySelector('dialog[open]')) return;
        if (!force && !['ready','choosing','targeting','activating','resolving'].includes(context.mode)) return;
        measure('board-framing', () => {
          const r = region(); if (!r) return;
          const { top, bottom } = bounds();
          const y = frameScroll({ region: r, top, bottom, scrollY, maxScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight) });
          if (Math.abs(y - scrollY) > 3) scrollTo({ top: y, behavior: 'instant' });
          board.dataset.framed = context.mode;
        });
      });
    });
  }
  const observer = new ResizeObserver(() => {
    // A target chooser or expanded HUD changes the actual space available.
    // Refit at that boundary, unless a deliberate inspection owns the scroll.
    const height = dock.getBoundingClientRect().height, statusHeight = status.getBoundingClientRect().height;
    const changed = Math.abs(height - lastHeight) > 1 || Math.abs(statusHeight - lastStatusHeight) > 1;
    if (Math.abs(height - lastHeight) > 1) { lastHeight = height; root.style.setProperty('--controller-height', `${Math.ceil(height)}px`); }
    lastStatusHeight = statusHeight;
    if (changed && !interrupted && ['ready','choosing','targeting'].includes(context.mode)) schedule();
  });
  observer.observe(dock);
  observer.observe(status);
  const resized = () => schedule();
  addEventListener('resize', resized, { passive: true });
  visualViewport?.addEventListener('resize', resized, { passive: true });
  return {
    intent() { interrupted = false; },
    reset() { signature = ''; interrupted = false; cancelAnimationFrame(frame); },
    update(next) {
      context = next;
      const key = next.key;
      if (signature === key) return;
      signature = key;
      schedule();
    },
    crew() { context = { ...context, region: 'crew' }; interrupted = false; schedule(true); },
  };
}
