'use strict';

// Timeline — records phase segments for the current calendar day, draws the
// bar at the bottom of the app, and renders the history panel + its gestures.
//
// Storage format: { date: 'YYYY-MM-DD', segments: [{phase, start, end|null}] }
//   phase: 'work' | 'rest' | 'stopped'
//   start/end: epoch ms; end === null means the segment is ongoing.
// Historical days are kept keyed by date string in a separate store.

import { TIMELINE_KEY, TIMELINE_HISTORY_KEY } from './state.js';
import { clamp } from './geometry.js';
import { fmtHMS, fmtHHMM, fmtDuration, msToHHMM, todayStr } from './format.js';

// =====================================================================
// Storage
// =====================================================================

function loadTimeline() {
  try {
    const raw = localStorage.getItem(TIMELINE_KEY);
    if (!raw) return { date: todayStr(), segments: [] };
    const saved = JSON.parse(raw);
    // If the saved day isn't today, archive it and start fresh.
    if (saved.date !== todayStr()) {
      archiveTimeline(saved);
      return { date: todayStr(), segments: [] };
    }
    return saved;
  } catch (e) {
    return { date: todayStr(), segments: [] };
  }
}

function archiveTimeline(tl) {
  if (!tl || !tl.date || !tl.segments.length) return;
  try {
    const raw = localStorage.getItem(TIMELINE_HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : {};
    const segs = tl.segments;
    if (segs.length && segs[segs.length - 1].end === null) {
      segs[segs.length - 1].end = Date.now();
    }
    history[tl.date] = segs;
    localStorage.setItem(TIMELINE_HISTORY_KEY, JSON.stringify(history));
  } catch (e) { /* storage full — skip */ }
}

function saveTimeline() {
  try { localStorage.setItem(TIMELINE_KEY, JSON.stringify(timeline)); }
  catch (e) {}
}

const timeline = loadTimeline();

// Called whenever the phase changes (including to 'idle' / stopped).
export function recordPhaseChange(newPhase) {
  const now = Date.now();
  const segs = timeline.segments;

  // Close any open segment
  if (segs.length && segs[segs.length - 1].end === null) {
    segs[segs.length - 1].end = now;
  }

  // Don't open a "stopped" segment — we infer those from gaps.
  if (newPhase === 'work' || newPhase === 'rest') {
    segs.push({ phase: newPhase, start: now, end: null });
  }

  saveTimeline();
}

// =====================================================================
// Bar rendering
// =====================================================================

// Compute the bar's visible time range: defaults 08:00–20:00, expands to fit
// any segment that spills outside.
function computeBarRange() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = today.getTime();
  let startMs = t + 8  * 3600_000;
  let endMs   = t + 20 * 3600_000;

  const now = Date.now();
  for (const s of timeline.segments) {
    const segStart = s.start;
    const segEnd   = s.end !== null ? s.end : now;
    if (segStart < startMs) startMs = segStart;
    if (segEnd   > endMs)   endMs   = segEnd;
  }
  if (now > endMs)   endMs   = now;
  if (now < startMs) startMs = now;

  return { startMs, endMs };
}

function barFrac(ms, startMs, endMs) {
  return clamp((ms - startMs) / (endMs - startMs), 0, 1);
}

// Build the list of drawable segments (including implicit "stopped" gaps).
function buildDrawSegments() {
  const now = Date.now();
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const midnightMs = midnight.getTime();

  const segs = timeline.segments;
  const result = [];
  let cursor = midnightMs;

  for (const s of segs) {
    const start = Math.max(s.start, midnightMs);
    const end   = s.end !== null ? s.end : now;

    if (start > cursor) {
      result.push({ phase: 'stopped', start: cursor, end: start });
    }
    result.push({ phase: s.phase, start, end });
    cursor = end;
  }

  if (cursor < now) {
    result.push({ phase: 'stopped', start: cursor, end: now });
  }

  return result;
}

export function renderTimeline() {
  // Day rollover mid-session: archive yesterday, start fresh.
  if (timeline.date !== todayStr()) {
    archiveTimeline(timeline);
    timeline.date = todayStr();
    timeline.segments = [];
    saveTimeline();
  }

  const track = document.getElementById('timelineTrack');
  const nowEl = document.getElementById('timelineNow');

  const drawSegs            = buildDrawSegments();
  const { startMs, endMs }  = computeBarRange();
  const nowFrac             = barFrac(Date.now(), startMs, endMs);

  // Update labels to reflect bar range
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const labels = document.querySelectorAll('.timeline-labels span');
  if (labels.length >= 2) {
    labels[0].textContent = msToHHMM(startMs - todayMidnight.getTime());
    labels[labels.length - 1].textContent = msToHHMM(endMs - todayMidnight.getTime());
  }

  // Position the "now" marker
  nowEl.style.left = `${nowFrac * 100}%`;

  // Diff-update segments: clear and redraw (small DOM, no perf issue).
  track.querySelectorAll('.timeline-seg').forEach(el => el.remove());

  for (const s of drawSegs) {
    const leftFrac  = barFrac(s.start, startMs, endMs);
    const rightFrac = barFrac(s.end,   startMs, endMs);
    const widthFrac = rightFrac - leftFrac;
    if (widthFrac < 0.0005) continue;  // skip hair-thin segments

    const el = document.createElement('div');
    el.className = `timeline-seg ${s.phase}`;
    el.style.left  = `${leftFrac * 100}%`;
    el.style.width = `${widthFrac * 100}%`;
    el._segData = s;

    el.addEventListener('pointerenter', onSegHover);
    el.addEventListener('pointerleave', onSegLeave);
    el.addEventListener('pointermove',  onSegMove);

    track.appendChild(el);
  }

  // Keep "now" marker on top of newly added segments
  track.appendChild(nowEl);
}

// =====================================================================
// Tooltip
// =====================================================================

let tooltipSeg = null;

function onSegHover(e) {
  const seg = e.currentTarget;
  seg.classList.add('hovered');
  tooltipSeg = seg;
  showTooltip(seg, e);
}

function onSegLeave(e) {
  const seg = e.currentTarget;
  seg.classList.remove('hovered');
  tooltipSeg = null;
  document.getElementById('timelineTooltip').classList.remove('visible');
}

function onSegMove(e) {
  if (tooltipSeg) showTooltip(tooltipSeg, e);
}

function showTooltip(segEl, e) {
  const s       = segEl._segData;
  const now     = Date.now();
  const tooltip = document.getElementById('timelineTooltip');
  const track   = document.getElementById('timelineTrack');
  const isLive  = s.end >= now - 1500;  // within 1.5s = ongoing

  const labelMap = { work: 'Work', rest: 'Break', stopped: 'Stopped' };
  document.getElementById('tooltipLabel').textContent = labelMap[s.phase] ?? s.phase;

  const dot = document.getElementById('tooltipDot');
  dot.className = `timeline-tooltip-dot ${s.phase}`;

  const endLabel = isLive ? 'now' : fmtHHMM(s.end);
  document.getElementById('tooltipRange').textContent =
    `${fmtHHMM(s.start)} – ${endLabel}`;

  const durMs = (isLive ? now : s.end) - s.start;
  const durText = isLive ? `${fmtDuration(durMs)} · ongoing` : fmtDuration(durMs);
  document.getElementById('tooltipDur').textContent = durText;

  tooltip.classList.add('visible');
  const trackRect = track.getBoundingClientRect();
  const segRect   = segEl.getBoundingClientRect();
  const tipW      = tooltip.offsetWidth;
  const segCentreX = segRect.left + segRect.width / 2 - trackRect.left;
  const leftPx = clamp(segCentreX - tipW / 2, 0, trackRect.width - tipW);
  tooltip.style.left = `${leftPx}px`;
}

// =====================================================================
// History panel
// =====================================================================

let historyPanelOpen = false;

export function isHistoryPanelOpen() { return historyPanelOpen; }

export function openHistoryPanel() {
  historyPanelOpen = true;
  const panel   = document.getElementById('historyPanel');
  const overlay = document.getElementById('historyOverlay');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  document.body.classList.add('history-open');
  renderHistoryPanel();
}

export function closeHistoryPanel() {
  historyPanelOpen = false;
  const panel   = document.getElementById('historyPanel');
  const overlay = document.getElementById('historyOverlay');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('open');
  document.body.classList.remove('history-open');
}

// Build rows from today's recorded activity (excluding leading stopped gap)
function buildHistoryRows() {
  const segs = buildDrawSegments();
  const firstActive = segs.findIndex(s => s.phase !== 'stopped');
  if (firstActive === -1) return [];
  return segs.slice(firstActive);
}

export function renderHistoryPanel() {
  if (!historyPanelOpen) return;
  const tbody = document.getElementById('historyTbody');
  const rows  = buildHistoryRows();
  const now   = Date.now();

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="history-empty">No activity recorded yet today.</td></tr>';
    return;
  }

  const totals = { work: 0, rest: 0, stopped: 0 };

  let html = '';
  for (const s of rows) {
    const isLive    = s.end === null || s.end >= now - 1500;
    const endMs     = isLive ? now : s.end;
    const elapsedMs = endMs - s.start;
    totals[s.phase] += elapsedMs;

    const startStr   = fmtHHMM(s.start);
    const endStr     = isLive ? 'now' : fmtHHMM(s.end);
    const elapsedStr = fmtHMS(elapsedMs / 1000);
    const dot        = isLive ? '<span class="history-dot"></span>' : '';

    const cell = (phase) => {
      if (s.phase !== phase) return '<td></td>';
      return `<td class="history-cell ${phase}${isLive ? ' live' : ''}">` +
             `<span class="history-range">${startStr}–${endStr}</span>` +
             `<span class="history-elapsed">${elapsedStr}${dot}</span>` +
             `</td>`;
    };

    html += `<tr>${cell('work')}${cell('rest')}${cell('stopped')}</tr>`;
  }

  // Totals row
  const fmtTotal = (ms) => ms > 0 ? fmtHMS(ms / 1000) : '—';
  html += `<tr class="history-totals">` +
          `<td class="history-cell work"><span class="history-elapsed">${fmtTotal(totals.work)}</span></td>` +
          `<td class="history-cell rest"><span class="history-elapsed">${fmtTotal(totals.rest)}</span></td>` +
          `<td class="history-cell stopped"><span class="history-elapsed">${fmtTotal(totals.stopped)}</span></td>` +
          `</tr>`;

  tbody.innerHTML = html;
}

// =====================================================================
// Gestures (swipe + overlay click)
// =====================================================================

export function initTimeline() {
  document.getElementById('historyOverlay').addEventListener('click', closeHistoryPanel);

  // Touch swipe: right-to-left on app → open; left-to-right on panel → close.
  let touchStartX = null;
  let touchStartY = null;
  const SWIPE_THRESHOLD = 60;
  const SWIPE_RATIO     = 2;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) {
      touchStartX = null; touchStartY = null;
      return;
    }

    if (dx < 0 && !historyPanelOpen)     openHistoryPanel();
    else if (dx > 0 && historyPanelOpen) closeHistoryPanel();

    touchStartX = null; touchStartY = null;
  }, { passive: true });
}
