'use strict';

// Pure formatting helpers. No DOM, no state.

export function fmtMS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtHMS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Minutes-of-day → "HH:MM"
export function msToHHMM(ms) {
  const total = Math.round(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
}

// Wall-clock "HH:MM:SS" from epoch ms
export function fmtHHMM(ms) {
  const d = new Date(ms);
  return d.getHours().toString().padStart(2, '0') + ':' +
         d.getMinutes().toString().padStart(2, '0') + ':' +
         d.getSeconds().toString().padStart(2, '0');
}

export function fmtDuration(ms) {
  return fmtHMS(ms / 1000);
}

// Locale-independent 'YYYY-MM-DD'
export function todayStr() {
  return new Date().toLocaleDateString('sv');
}
