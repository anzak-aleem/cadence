'use strict';

// Drag the hand to scrub elapsed time (5-min snaps).
// Re-derives state.phaseStartedAt from the new elapsed-minute value so the
// rest of the app keeps working off the same single source of truth.

import { state, save, SNAP_STEP } from './state.js';
import { clamp, TOTAL_MINUTES, minutesFromPoint } from './geometry.js';
import { els, svgPointFromEvent } from './dom.js';
import { resetChime } from './audio.js';
import { render } from './render.js';

let draggingHand = false;

function setHandMinute(rawMinute) {
  const { phase, workMinutes } = state;
  if (phase === 'idle') return;

  let newElapsedMin;
  if (phase === 'work') {
    const snapped = clamp(Math.round(rawMinute / SNAP_STEP) * SNAP_STEP, 0, workMinutes);
    newElapsedMin = snapped;
  } else {
    // rest phase: hand spans workMinutes → workMinutes + restMinutes + restExtMinutes
    const totalRest = state.restMinutes + state.restExtMinutes;
    const maxHandMin = state.workMinutes + totalRest;
    // Values near 0 could be in the "past midnight" extension zone — shift them up.
    let adjusted = rawMinute;
    if (rawMinute <= state.restExtMinutes) adjusted = rawMinute + TOTAL_MINUTES;
    const snapped = clamp(Math.round(adjusted / SNAP_STEP) * SNAP_STEP, state.workMinutes, maxHandMin);
    newElapsedMin = snapped - state.workMinutes;
  }

  state.phaseStartedAt = Date.now() - newElapsedMin * 60 * 1000;
  resetChime();
  save();
  render();
}

function onPointerDown(e) {
  if (state.phase === 'idle') return;
  e.preventDefault();
  e.stopPropagation();   // don't let knob or window handlers fire too
  draggingHand = true;
  els.hand.classList.add('dragging');
  setHandMinute(minutesFromPoint(svgPointFromEvent(e)));
}
function onPointerMove(e) {
  if (!draggingHand) return;
  setHandMinute(minutesFromPoint(svgPointFromEvent(e)));
}
function onPointerUp() {
  if (!draggingHand) return;
  draggingHand = false;
  els.hand.classList.remove('dragging');
}

export function initHandDrag() {
  els.hand.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove',   onPointerMove);
  window.addEventListener('pointerup',     onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}
