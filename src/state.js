'use strict';

// Persistent state — the single source of truth.
// Mutated in-place by phases/drag/keyboard handlers, then `save()` writes to
// localStorage. The shape is small enough to fit in your head:
//   { workMinutes, restMinutes, restExtMinutes, phase, phaseStartedAt, muted }

import { clamp, TOTAL_MINUTES } from './geometry.js';

export const STORAGE_KEY            = 'cadence-v1';
export const TIMELINE_KEY           = 'cadence-timeline-v1';
export const TIMELINE_HISTORY_KEY   = 'cadence-timeline-history-v1';
export const SNAP_STEP              = 5;                   // ratio snaps to 5 min
export const MIN_PHASE              = 5;                   // each phase ≥ 5 min
export const MAX_PHASE              = TOTAL_MINUTES - MIN_PHASE;
export const TICK_MS                = 250;
export const ALARM_REPEAT_MS        = 5000;

const DEFAULT_STATE = {
  workMinutes: 45,
  restMinutes: 15,
  restExtMinutes: 0,    // one-time extension added on top of restMinutes
  phase: 'idle',        // 'idle' | 'work' | 'rest'
  phaseStartedAt: null, // epoch ms, or null when idle
  muted: false,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const saved = JSON.parse(raw);
    // Merge defensively — older versions may have missing fields.
    const merged = { ...DEFAULT_STATE, ...saved };
    merged.workMinutes = clamp(merged.workMinutes, MIN_PHASE, MAX_PHASE);
    merged.restMinutes = TOTAL_MINUTES - merged.workMinutes;
    merged.restExtMinutes = clamp(merged.restExtMinutes ?? 0, 0, merged.workMinutes);
    return merged;
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

export const state = loadState();

export function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { /* localStorage full or disabled — nothing we can do */ }
}
