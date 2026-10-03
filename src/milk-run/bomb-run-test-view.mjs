import { BombRunTest } from './bomb-run-test.mjs';
import { bombRunMarkup } from './bomb-run-view.mjs';
import { BOMBING_TARGETS } from './bombing.mjs';
import { eventMarkup } from './views.mjs';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The only host capability suspends/resumes presentation timers. Rendering and
 * commands stay here: never call the host renderer (which autosaves/finalizes).
 */
export function mountBombRunTest(dialog, suspendPresentation = () => () => {}) {
  let test = null, selected = null, selection = 'random', resume = null;
  function render() {
    const result = test.events.findLast(event => event.type === 'BOMBING_RESOLVED');
    dialog.innerHTML = `<div class="dialog-heading bomb-test-banner"><h2>BOMB RUN TEST — RESULTS ARE NOT SAVED</h2><button type="button" data-test-close class="close" aria-label="Close Bomb Run test">×</button></div><div class="dialog-content"><label class="bomb-target-choice">Target<select data-test-target><option value="random">Random</option>${Object.values(BOMBING_TARGETS).map(target => `<option value="${esc(target.id)}">${esc(target.name)}</option>`).join('')}</select></label>${bombRunMarkup(test.state, selected)}${result ? `<div class="event-card bomb-test-result" role="status">${eventMarkup(result).stage}</div>` : ''}</div><footer class="dialog-footer bomb-test-controls">${result ? '<button type="button" data-test-again>Test Again</button><button type="button" data-test-random>New Random Target</button>' : ''}<button type="button" data-test-close>Close</button></footer>`;
    dialog.querySelector('[data-test-target]').value = selection;
  }
  function discard() {
    if (!test) return;
    test = null; selected = null;
    dialog.innerHTML = '';
    const callback = resume; resume = null; callback?.();
  }
  function close() { dialog.close(); discard(); }
  dialog.addEventListener('close', () => { if (!dialog.open) discard(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // Production markup deliberately retains its selectors. Stop here before the
  // host's document handlers can send them to the active sortie's queue.
  dialog.addEventListener('click', event => {
    event.stopImmediatePropagation();
    if (!test) return;
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
      return;
    }
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-test-close')) { close(); return; }
    if (button.hasAttribute('data-test-again')) { test.again(); selected = null; render(); return; }
    if (button.hasAttribute('data-test-random')) { test.start('random'); selection = 'random'; selected = null; render(); return; }
    if (button.dataset.bombDie !== undefined) selected = Number(button.dataset.bombDie);
    else if (button.dataset.bombSlot) test.send({ type: 'placeBombDie', slot: button.dataset.bombSlot, dieIndex: selected });
    else if (button.dataset.bombReroll) test.send({ type: 'rerollBombDie', dieIndex: selected, source: button.dataset.bombReroll });
    else if (button.dataset.command === 'commitBombRun') { test.send({ type: 'commitBombRun' }); selected = null; }
    render();
  });
  dialog.addEventListener('change', event => {
    event.stopImmediatePropagation();
    if (test && event.target.matches('[data-test-target]')) {
      selection = event.target.value; test.start(selection); selected = null; render();
    }
  });
  return {
    open() {
      if (test) return;
      test = new BombRunTest(); selection = 'random'; selected = null;
      resume = suspendPresentation(); render(); dialog.showModal();
    },
    // Read-only diagnostics: never expose a mutable test or host capability.
    snapshot: () => test ? structuredClone({ state: test.state, events: test.events, number: test.number }) : null,
  };
}
