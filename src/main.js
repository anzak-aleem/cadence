'use strict';

// Entry point: wires button/keyboard/visibility listeners and starts the tick.
// All actual logic lives in the modules below — this file is just plumbing.

import { state, save, TICK_MS } from './state.js';
import { els, showFeedback } from './dom.js';
import { render } from './render.js';
import {
  renderTimeline, renderHistoryPanel,
  openHistoryPanel, closeHistoryPanel, isHistoryPanelOpen,
  initTimeline,
} from './timeline.js';
import { startPhase, doStop } from './phases.js';
import { resetChime } from './audio.js';
import { initHandDrag } from './drag-hand.js';
import { initBoundaryDrag } from './drag-boundary.js';
import { initRestEndDrag } from './drag-restend.js';

// ---- Phase buttons + toggles ----

els.workBtn.addEventListener('click', () => startPhase('work'));
els.restBtn.addEventListener('click', () => startPhase('rest'));

els.muteToggle.addEventListener('click', () => {
  state.muted = !state.muted;
  save();
  render();
});

els.stopToggle.addEventListener('click', doStop);
document.getElementById('stopBtn').addEventListener('click', doStop);

// ---- Drag handlers ----

initHandDrag();
initBoundaryDrag();
initRestEndDrag();

// ---- Timeline & history panel gestures ----

initTimeline();

// ---- Global keyboard shortcuts ----

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Escape: close history panel if open, otherwise stop the timer
  if (e.key === 'Escape') {
    if (isHistoryPanelOpen()) {
      closeHistoryPanel();
    } else if (state.phase !== 'idle') {
      doStop();
      showFeedback('Timer stopped');
    }
    e.preventDefault();
    return;
  }

  // Let the knobs handle their own arrow keys
  if (e.target === els.knob || e.target === els.restEndKnob) return;

  // Arrow left/right: history panel navigation
  if (e.key === 'ArrowLeft' && !isHistoryPanelOpen()) {
    openHistoryPanel();
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowRight' && isHistoryPanelOpen()) {
    closeHistoryPanel();
    e.preventDefault();
    return;
  }

  // Space: start work (idle only) or restart work (shift/cmd)
  if (e.key === ' ') {
    e.preventDefault();
    if (e.shiftKey || e.metaKey) {
      startPhase('work');
      showFeedback('Work restarted');
    } else if (state.phase === 'idle') {
      startPhase('work');
      showFeedback('Work started');
    }
    return;
  }

  // R / Shift+R / Cmd+R: start or restart rest
  if (e.key === 'r' || e.key === 'R') {
    if (e.metaKey) e.preventDefault();  // prevent browser refresh on Cmd+R
    const restart = e.shiftKey || e.metaKey;
    const wasResting = state.phase === 'rest';
    startPhase('rest');
    showFeedback(restart || wasResting ? 'Rest restarted' : 'Rest started');
    return;
  }

  // Arrow up/down: adjust elapsed time ±1 minute while a phase is running
  if (e.key === 'ArrowUp' && state.phase !== 'idle') {
    e.preventDefault();
    state.phaseStartedAt -= 60_000;
    resetChime();
    save();
    render();
    showFeedback('Time increased by 1 minute');
    return;
  }
  if (e.key === 'ArrowDown' && state.phase !== 'idle') {
    e.preventDefault();
    const now = Date.now();
    state.phaseStartedAt = Math.min(state.phaseStartedAt + 60_000, now);
    resetChime();
    save();
    render();
    showFeedback('Time decreased by 1 minute');
    return;
  }
});

// ---- Tick loop ----
// Re-render every 250 ms while the page is visible. When hidden, browsers
// throttle setInterval anyway; on visibilitychange we force one re-render so
// the dial doesn't appear frozen when the user comes back.

setInterval(() => { render(); renderTimeline(); renderHistoryPanel(); }, TICK_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { render(); renderTimeline(); renderHistoryPanel(); }
});

// ---- Initial render ----

render();
renderTimeline();
