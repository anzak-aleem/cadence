'use strict';

// derive() — the pure state → view function.
// Given the persistent state and the current time, produces everything the
// renderer needs to draw a frame. Has no side effects and no DOM access.
// This is the file that maps most directly to Swift later.

import { state } from './state.js';
import { TOTAL_MINUTES } from './geometry.js';

export function derive() {
  const now = Date.now();
  const { phase, phaseStartedAt, workMinutes, restMinutes } = state;

  if (phase === 'idle' || !phaseStartedAt) {
    return {
      uiPhase: 'idle',
      elapsedSec: 0,
      limitSec: workMinutes * 60,
      isOvertime: false,
      overtimeSec: 0,
      handMinute: 0,
    };
  }

  const { restExtMinutes } = state;
  const elapsedSec = (now - phaseStartedAt) / 1000;
  const limitSec = (phase === 'work' ? workMinutes : restMinutes + restExtMinutes) * 60;
  const isOvertime = elapsedSec >= limitSec;
  const overtimeSec = isOvertime ? elapsedSec - limitSec : 0;

  // Hand position: sweeps through the phase's arc, then freezes at the boundary.
  let handMinute;
  if (phase === 'work') {
    handMinute = isOvertime
      ? workMinutes                            // boundary between green and red
      : (elapsedSec / 60);                     // 0 .. workMinutes
  } else {
    // rest can extend past 60 min on the dial (wraps past 12 o'clock)
    handMinute = isOvertime
      ? TOTAL_MINUTES + restExtMinutes         // final position past 12
      : workMinutes + (elapsedSec / 60);       // workMinutes .. TOTAL+restExt
  }

  return {
    uiPhase: isOvertime ? 'alarm' : phase,
    elapsedSec, limitSec, isOvertime, overtimeSec, handMinute,
  };
}
