'use strict';

// Web Audio chime + alarm scheduling.
// audioCtx and lastChimedAt are module-private; the rest of the app uses the
// exported `resetChime()` to reset the cadence after a state change.

import { state, ALARM_REPEAT_MS } from './state.js';

let audioCtx = null;
let lastChimedAt = 0;

export function resetChime() { lastChimedAt = 0; }

export function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { /* unsupported — silent fallback */ }
}

function playTone(freq, when, duration) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.22, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

function chime() {
  if (state.muted || !audioCtx) return;
  const now = audioCtx.currentTime;
  // Two-note bell: A5 then E5
  playTone(880,    now,        0.25);
  playTone(659.25, now + 0.18, 0.40);
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 80, 200]); } catch {}
  }
}

export function triggerAlarmIfDue() {
  const now = Date.now();
  if (now - lastChimedAt >= ALARM_REPEAT_MS) {
    chime();
    lastChimedAt = now;
  }
}
