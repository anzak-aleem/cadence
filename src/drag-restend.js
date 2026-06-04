'use strict';

// Drag the rest-end knob (extends rest past 12 o'clock by up to workMinutes).

import { state, save, SNAP_STEP } from './state.js';
import { clamp, TOTAL_MINUTES, minutesFromPoint } from './geometry.js';
import { els, svgPointFromEvent } from './dom.js';
import { render } from './render.js';

let draggingRestEnd = false;

function setRestExtMinutes(rawMinute) {
  const maxExt = state.workMinutes;
  let m = rawMinute;
  // Values in the rest zone (workMinutes..TOTAL_MINUTES) are out of range.
  // Snap to the nearest valid edge (0 or maxExt).
  if (m > maxExt) {
    const distToMax  = m - maxExt;
    const distToZero = TOTAL_MINUTES - m;
    m = distToZero < distToMax ? 0 : maxExt;
  }
  const snapped = clamp(Math.round(m / SNAP_STEP) * SNAP_STEP, 0, maxExt);
  if (snapped === state.restExtMinutes) return;
  state.restExtMinutes = snapped;
  save();
  render();
}

function onPointerDown(e) {
  e.preventDefault();
  e.stopPropagation();
  draggingRestEnd = true;
  els.restEndKnob.classList.add('dragging');
  els.restEndKnob.setPointerCapture?.(e.pointerId);
  setRestExtMinutes(minutesFromPoint(svgPointFromEvent(e)));
}
function onPointerMove(e) {
  if (!draggingRestEnd) return;
  setRestExtMinutes(minutesFromPoint(svgPointFromEvent(e)));
}
function onPointerUp(e) {
  if (!draggingRestEnd) return;
  draggingRestEnd = false;
  els.restEndKnob.classList.remove('dragging');
  els.restEndKnob.releasePointerCapture?.(e.pointerId);
}

export function initRestEndDrag() {
  els.restEndKnob.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove',   onPointerMove);
  window.addEventListener('pointerup',     onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  els.restEndKnob.addEventListener('keydown', (e) => {
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   delta = +SNAP_STEP;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') delta = -SNAP_STEP;
    if (delta !== 0) {
      e.preventDefault();
      setRestExtMinutes(clamp(state.restExtMinutes + delta, 0, state.workMinutes));
    }
  });
}
