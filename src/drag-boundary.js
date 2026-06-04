'use strict';

// Drag the boundary knob to adjust the work/rest split (5-min snaps).

import { state, save, SNAP_STEP, MIN_PHASE, MAX_PHASE } from './state.js';
import { clamp, TOTAL_MINUTES, minutesFromPoint } from './geometry.js';
import { els, svgPointFromEvent } from './dom.js';
import { render } from './render.js';

let dragging = false;

function setWorkMinutes(newWork) {
  newWork = clamp(Math.round(newWork / SNAP_STEP) * SNAP_STEP, MIN_PHASE, MAX_PHASE);
  if (newWork === state.workMinutes) return;
  state.workMinutes = newWork;
  state.restMinutes = TOTAL_MINUTES - newWork;
  save();
  render();
}

function onPointerDown(e) {
  e.preventDefault();
  dragging = true;
  els.knob.classList.add('dragging');
  els.knob.setPointerCapture?.(e.pointerId);
  setWorkMinutes(minutesFromPoint(svgPointFromEvent(e)));
}
function onPointerMove(e) {
  if (!dragging) return;
  setWorkMinutes(minutesFromPoint(svgPointFromEvent(e)));
}
function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;
  els.knob.classList.remove('dragging');
  els.knob.releasePointerCapture?.(e.pointerId);
}

export function initBoundaryDrag() {
  els.knob.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove',   onPointerMove);
  window.addEventListener('pointerup',     onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // Keyboard: left/right or up/down nudges by 5 min.
  els.knob.addEventListener('keydown', (e) => {
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   delta = +SNAP_STEP;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') delta = -SNAP_STEP;
    if (delta !== 0) {
      e.preventDefault();
      setWorkMinutes(state.workMinutes + delta);
    }
  });
}
