'use strict';

// Phase transitions — startPhase() and doStop(). The two are the only paths
// (besides drag-hand scrubbing) that change state.phase or state.phaseStartedAt.

import { state, save } from './state.js';
import { ensureAudio, resetChime } from './audio.js';
import { render } from './render.js';
import { recordPhaseChange } from './timeline.js';

export function startPhase(phase) {
  ensureAudio();             // unlock audio on the first user gesture
  recordPhaseChange(phase);
  if (phase === 'work') state.restExtMinutes = 0;  // discard one-time rest extension
  state.phase = phase;
  state.phaseStartedAt = Date.now();
  resetChime();              // reset chime cadence
  save();
  render();
}

export function doStop() {
  recordPhaseChange('idle');
  state.phase = 'idle';
  state.phaseStartedAt = null;
  state.restExtMinutes = 0;  // discard one-time rest extension
  resetChime();
  save();
  render();
}
