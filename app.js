// Cadence — vanilla JS, no build step.
// Single state object, render() rewrites the DOM from it, setInterval ticks
// every 250ms while the page is open. localStorage persists everything that
// must survive a refresh.

'use strict';

// =====================================================================
// Constants & defaults
// =====================================================================

const STORAGE_KEY = 'cadence-v1';
const TIMELINE_KEY = 'cadence-timeline-v1';
const TOTAL_MINUTES = 60;          // the dial always represents 60 min
const SNAP_STEP = 5;               // ratio slider snaps to multiples of 5
const MIN_PHASE = 5;               // each phase is at least 5 min
const MAX_PHASE = TOTAL_MINUTES - MIN_PHASE; // 55
const TICK_MS = 250;
const ALARM_REPEAT_MS = 5000;

const DEFAULT_STATE = {
  workMinutes: 45,
  restMinutes: 15,
  phase: 'idle',          // 'idle' | 'work' | 'rest'
  phaseStartedAt: null,   // epoch ms, or null when idle
  muted: false,
};

// =====================================================================
// State (loaded from localStorage, merged with defaults)
// =====================================================================

const state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const saved = JSON.parse(raw);
    // Merge defensively — older versions may have missing fields.
    const merged = { ...DEFAULT_STATE, ...saved };
    // Keep work/rest consistent with the fixed 60-min total.
    merged.workMinutes = clamp(merged.workMinutes, MIN_PHASE, MAX_PHASE);
    merged.restMinutes = TOTAL_MINUTES - merged.workMinutes;
    return merged;
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { /* localStorage full or disabled — nothing we can do */ }
}

// =====================================================================
// Geometry helpers — keep math out of render()
// =====================================================================

const CENTER = { x: 200, y: 200 };
const RING_R = 130;   // centerline of the colored ring

// Returns {x,y} on a circle of radius r at a given minute (0 = top, clockwise).
function polar(minute, r) {
  const a = -Math.PI / 2 + (minute / TOTAL_MINUTES) * 2 * Math.PI;
  return { x: CENTER.x + r * Math.cos(a), y: CENTER.y + r * Math.sin(a) };
}

// SVG arc path from startMin to endMin (clockwise), radius r.
function arcPath(startMin, endMin, r) {
  // Avoid drawing zero-length arcs (would be invisible anyway).
  if (endMin <= startMin) return '';
  const p1 = polar(startMin, r);
  const p2 = polar(endMin, r);
  const sweep = endMin - startMin;
  const largeArc = sweep > TOTAL_MINUTES / 2 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// =====================================================================
// Derived state — computed every tick from the persistent state
// =====================================================================

function derive() {
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

  const elapsedSec = (now - phaseStartedAt) / 1000;
  const limitSec = (phase === 'work' ? workMinutes : restMinutes) * 60;
  const isOvertime = elapsedSec >= limitSec;
  const overtimeSec = isOvertime ? elapsedSec - limitSec : 0;

  // Hand position: sweeps through the phase's arc, then freezes at the boundary.
  let handMinute;
  if (phase === 'work') {
    handMinute = isOvertime
      ? workMinutes                            // boundary between green and red
      : (elapsedSec / 60);                     // 0 .. workMinutes
  } else {
    handMinute = isOvertime
      ? TOTAL_MINUTES                          // top of dial (also = 0)
      : workMinutes + (elapsedSec / 60);       // workMinutes .. 60
  }

  return {
    uiPhase: isOvertime ? 'alarm' : phase,
    elapsedSec, limitSec, isOvertime, overtimeSec, handMinute,
  };
}

// =====================================================================
// Formatting
// =====================================================================

function fmtMS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtHMS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// =====================================================================
// DOM references
// =====================================================================

const $ = (sel) => document.querySelector(sel);
const els = {
  body:          document.body,
  phaseLabel:    $('#phaseLabel'),
  workArc:       $('#workArc'),
  restArc:       $('#restArc'),
  hand:          $('#hand'),
  knob:          $('#boundaryKnob'),
  readoutLabel:  $('#readoutLabel'),
  readoutMain:   $('#readoutMain'),
  readoutSub:    $('#readoutSub'),
  hint:          $('#hint'),
  workBtn:       $('#workBtn'),
  restBtn:       $('#restBtn'),
  stopToggle:    $('#stopToggle'),
  muteToggle:    $('#muteToggle'),
  footerHint:    $('#footerHint'),
};

// =====================================================================
// Render — single function, called every tick and after any state change
// =====================================================================

function render() {
  const d = derive();

  // ---- Arcs ----
  els.workArc.setAttribute('d', arcPath(0, state.workMinutes, RING_R));
  els.restArc.setAttribute('d', arcPath(state.workMinutes, TOTAL_MINUTES, RING_R));

  // ---- Boundary knob ----
  const knobPos = polar(state.workMinutes, RING_R);
  els.knob.setAttribute('cx', knobPos.x);
  els.knob.setAttribute('cy', knobPos.y);
  els.knob.setAttribute('aria-valuenow', state.workMinutes);

  // ---- Hand rotation ----
  // The hand's local geometry already points straight up; we just rotate.
  const angle = d.handMinute * 6;  // 360° / 60min = 6° per minute
  els.hand.setAttribute('transform', `rotate(${angle} ${CENTER.x} ${CENTER.y})`);

  // ---- Body data-phase (CSS hooks off this) ----
  els.body.dataset.phase = d.uiPhase;

  // ---- Readout & hint text ----
  let label, main, sub, hint;
  let footer = (d.uiPhase === 'idle')
    ? 'Drag the dot on the dial to adjust the split.'
    : 'Drag the hand to adjust elapsed time · Drag the dot to change the split.';

  if (d.uiPhase === 'idle') {
    label = 'IDLE';
    main  = '0:00';
    sub   = `/ ${state.workMinutes}:00`;
    hint  = 'Tap a button to begin.';
  } else if (d.uiPhase === 'work') {
    label = 'WORK';
    main  = fmtMS(d.elapsedSec);
    sub   = `/ ${state.workMinutes}:00`;
    const remain = state.workMinutes * 60 - d.elapsedSec;
    hint  = `${fmtMS(remain)} until your break.`;
  } else if (d.uiPhase === 'rest') {
    label = 'REST';
    main  = fmtMS(d.elapsedSec);
    sub   = `/ ${state.restMinutes}:00`;
    const remain = state.restMinutes * 60 - d.elapsedSec;
    hint  = `${fmtMS(remain)} of rest left.`;
  } else if (d.uiPhase === 'alarm') {
    // state.phase tells us which phase just ended
    if (state.phase === 'work') {
      label = 'OVERTIME';
      main  = `−${fmtMS(d.overtimeSec)}`;
      sub   = `past ${state.workMinutes}:00`;
      hint  = `Tap red to begin your ${state.restMinutes} min rest.`;
    } else {
      label = 'OVERTIME';
      main  = `−${fmtMS(d.overtimeSec)}`;
      sub   = `past ${state.restMinutes}:00`;
      hint  = `Tap green to begin your ${state.workMinutes} min of work.`;
    }
    footer = 'Chime repeats every 5 s — tap the bell to mute.';
  }

  els.phaseLabel.textContent = (d.uiPhase === 'idle')
    ? `${state.workMinutes} min work · ${state.restMinutes} min rest`
    : (d.uiPhase === 'work' ? 'Working'
       : d.uiPhase === 'rest' ? 'Resting'
       : state.phase === 'work' ? '⏰ Time to stand up'
       : '⏰ Back to work');

  els.readoutLabel.textContent = label;
  els.readoutMain.textContent  = main;
  els.readoutSub.textContent   = sub;
  els.hint.textContent         = hint;
  els.footerHint.textContent   = footer;

  // ---- Buttons ----
  updateButton(els.workBtn, 'work', d.uiPhase);
  updateButton(els.restBtn, 'rest', d.uiPhase);

  // ---- Mute icon ----
  els.muteToggle.classList.toggle('muted', state.muted);
  els.muteToggle.setAttribute('aria-pressed', String(state.muted));

  // ---- Alarm chime (fires on first frame in alarm, then every 5 s) ----
  if (d.uiPhase === 'alarm') triggerAlarmIfDue();
}

// Decide a button's label and CSS classes based on the current UI phase.
function updateButton(btn, kind, uiPhase) {
  // Reset modifier classes
  btn.classList.remove('active', 'suggested', 'skip');
  let text;

  if (uiPhase === 'idle') {
    text = (kind === 'work') ? 'Start work' : 'Start rest';
  } else if (uiPhase === 'work') {
    text = (kind === 'work') ? 'Restart work' : 'Start rest';
    if (kind === 'work') btn.classList.add('active');
  } else if (uiPhase === 'rest') {
    text = (kind === 'rest') ? 'Restart rest' : 'Start work';
    if (kind === 'rest') btn.classList.add('active');
  } else if (uiPhase === 'alarm') {
    // The phase we just finished — pressing its button RESTARTS it (a "skip").
    // The other button is the suggested next action.
    const justFinished = state.phase;            // 'work' | 'rest'
    const isJustFinishedBtn = (kind === justFinished);
    if (isJustFinishedBtn) {
      text = (kind === 'work') ? 'Skip rest — restart work' : 'Skip work — restart rest';
      btn.classList.add('skip');
    } else {
      text = (kind === 'work') ? 'Start work' : 'Start rest';
      btn.classList.add('suggested');
    }
  }
  btn.textContent = text;
}

// =====================================================================
// Audio (Web Audio API) — built on first user gesture, then reused
// =====================================================================

let audioCtx = null;
let lastChimedAt = 0;

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    // Web Audio not supported — silent fallback.
  }
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

function triggerAlarmIfDue() {
  const now = Date.now();
  if (now - lastChimedAt >= ALARM_REPEAT_MS) {
    chime();
    lastChimedAt = now;
  }
}

// =====================================================================
// User interactions
// =====================================================================

function startPhase(phase) {
  ensureAudio();             // unlock audio on the first user gesture
  recordPhaseChange(phase);
  state.phase = phase;
  state.phaseStartedAt = Date.now();
  lastChimedAt = 0;          // reset chime cadence
  save();
  render();
}

els.workBtn.addEventListener('click', () => startPhase('work'));
els.restBtn.addEventListener('click', () => startPhase('rest'));

els.muteToggle.addEventListener('click', () => {
  state.muted = !state.muted;
  save();
  render();
});

function doStop() {
  recordPhaseChange('idle');
  state.phase = 'idle';
  state.phaseStartedAt = null;
  lastChimedAt = 0;
  save();
  render();
}
els.stopToggle.addEventListener('click', doStop);
document.getElementById('stopBtn').addEventListener('click', doStop);

// ----- Drag the hand (scrub elapsed time, 5-min snaps) -----
let draggingHand = false;

function setHandMinute(rawMinute) {
  const { phase, workMinutes, restMinutes } = state;
  if (phase === 'idle') return;

  let newElapsedMin;
  if (phase === 'work') {
    const snapped = clamp(Math.round(rawMinute / SNAP_STEP) * SNAP_STEP, 0, workMinutes);
    newElapsedMin = snapped;
  } else {
    // rest phase: hand spans workMinutes → TOTAL_MINUTES
    const snapped = clamp(Math.round(rawMinute / SNAP_STEP) * SNAP_STEP, workMinutes, TOTAL_MINUTES);
    newElapsedMin = snapped - workMinutes;
  }

  state.phaseStartedAt = Date.now() - newElapsedMin * 60 * 1000;
  lastChimedAt = 0;
  save();
  render();
}

function onHandPointerDown(e) {
  if (state.phase === 'idle') return;
  e.preventDefault();
  e.stopPropagation();   // don't let knob or window handlers fire too
  draggingHand = true;
  els.hand.classList.add('dragging');
  setHandMinute(minutesFromPoint(svgPointFromEvent(e)));
}
function onHandPointerMove(e) {
  if (!draggingHand) return;
  setHandMinute(minutesFromPoint(svgPointFromEvent(e)));
}
function onHandPointerUp() {
  if (!draggingHand) return;
  draggingHand = false;
  els.hand.classList.remove('dragging');
}

els.hand.addEventListener('pointerdown', onHandPointerDown);
window.addEventListener('pointermove',   onHandPointerMove);
window.addEventListener('pointerup',     onHandPointerUp);
window.addEventListener('pointercancel', onHandPointerUp);

// ----- Drag the boundary knob -----
let dragging = false;

function svgPointFromEvent(e) {
  const svg = $('#dial');
  const rect = svg.getBoundingClientRect();
  // The SVG uses viewBox 0 0 400 400; map client coords to that space.
  return {
    x: (e.clientX - rect.left) * (400 / rect.width),
    y: (e.clientY - rect.top)  * (400 / rect.height),
  };
}

function minutesFromPoint(pt) {
  const dx = pt.x - CENTER.x;
  const dy = pt.y - CENTER.y;
  // atan2 -> angle from +x, then shift so top = 0 and go clockwise.
  let a = Math.atan2(dy, dx) + Math.PI / 2;     // 0 at top
  if (a < 0) a += 2 * Math.PI;
  return (a / (2 * Math.PI)) * TOTAL_MINUTES;   // 0 .. 60
}

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

els.knob.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup',   onPointerUp);
window.addEventListener('pointercancel', onPointerUp);

// Keyboard control on the knob (left/right or up/down by 5 min)
els.knob.addEventListener('keydown', (e) => {
  let delta = 0;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   delta = +SNAP_STEP;
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') delta = -SNAP_STEP;
  if (delta !== 0) {
    e.preventDefault();
    setWorkMinutes(state.workMinutes + delta);
  }
});

// =====================================================================
// Timeline — records phase segments for the current calendar day
// =====================================================================
// Storage format: { date: 'YYYY-MM-DD', segments: [{phase, start, end|null}] }
//   phase: 'work' | 'rest' | 'stopped'
//   start/end: epoch ms
//   end === null means the segment is ongoing (closed when phase changes)
// Historical days are kept keyed by date string in a separate store.

const TIMELINE_HISTORY_KEY = 'cadence-timeline-history-v1';

function todayStr() {
  return new Date().toLocaleDateString('sv');  // 'YYYY-MM-DD', locale-independent
}

function loadTimeline() {
  try {
    const raw = localStorage.getItem(TIMELINE_KEY);
    if (!raw) return { date: todayStr(), segments: [] };
    const saved = JSON.parse(raw);
    // If the saved day isn't today, archive it and start fresh
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
    // Close any open segment before archiving
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
  catch (e) { /* storage full */ }
}

// timeline is the live mutable object for today
const timeline = loadTimeline();

// Called whenever the phase changes (including to 'idle' / stopped)
function recordPhaseChange(newPhase) {
  const now = Date.now();
  const segs = timeline.segments;

  // Close any open segment
  if (segs.length && segs[segs.length - 1].end === null) {
    segs[segs.length - 1].end = now;
  }

  // Don't open a "stopped" segment — we infer those from gaps.
  // Only open for work / rest.
  if (newPhase === 'work' || newPhase === 'rest') {
    segs.push({ phase: newPhase, start: now, end: null });
  }

  saveTimeline();
}

// ---- Timeline rendering ----

const DAY_MS = 24 * 60 * 60 * 1000;

// Returns the fraction of the day (0‒1) for an epoch ms timestamp.
function dayFrac(ms) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return clamp((ms - midnight.getTime()) / DAY_MS, 0, 1);
}

function fmtHHMM(ms) {
  const d = new Date(ms);
  return d.getHours().toString().padStart(2, '0') + ':' +
         d.getMinutes().toString().padStart(2, '0') + ':' +
         d.getSeconds().toString().padStart(2, '0');
}

function fmtDuration(ms) {
  return fmtHMS(ms / 1000);
}

// Build the list of drawable segments (including implicit "stopped" gaps)
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

    // Gap before this segment = stopped time
    if (start > cursor) {
      result.push({ phase: 'stopped', start: cursor, end: start });
    }
    result.push({ phase: s.phase, start, end });
    cursor = end;
  }

  // Remaining time up to now = stopped (if we're idle) or already closed above
  if (cursor < now) {
    result.push({ phase: 'stopped', start: cursor, end: now });
  }

  return result;
}

function renderTimeline() {
  // Check for day rollover mid-session
  if (timeline.date !== todayStr()) {
    archiveTimeline(timeline);
    timeline.date = todayStr();
    timeline.segments = [];
    saveTimeline();
  }

  const track     = document.getElementById('timelineTrack');
  const nowEl     = document.getElementById('timelineNow');
  const tooltip   = document.getElementById('timelineTooltip');

  const drawSegs  = buildDrawSegments();
  const nowFrac   = dayFrac(Date.now());

  // Position the "now" marker
  nowEl.style.left = `${nowFrac * 100}%`;

  // Diff-update segments: remove old, add new
  // Simple approach: clear and redraw (timeline is small, no perf issue)
  const existing = track.querySelectorAll('.timeline-seg');
  existing.forEach(el => el.remove());

  for (let i = 0; i < drawSegs.length; i++) {
    const s = drawSegs[i];
    const left  = dayFrac(s.start) * 100;
    const width = (dayFrac(s.end) - dayFrac(s.start)) * 100;
    if (width < 0.05) continue;  // skip hair-thin segments

    const el = document.createElement('div');
    el.className = `timeline-seg ${s.phase}`;
    el.style.left  = `${left}%`;
    el.style.width = `${width}%`;
    el._segData = s;  // attach for tooltip

    el.addEventListener('pointerenter', onSegHover);
    el.addEventListener('pointerleave', onSegLeave);
    el.addEventListener('pointermove',  onSegMove);

    track.appendChild(el);
  }

  // Re-apply rounded corners (first/last among siblings)
  const allSegs = track.querySelectorAll('.timeline-seg');
  allSegs.forEach((el, i) => {
    el.classList.remove('first-seg', 'last-seg');
    // CSS :first-of-type / :last-of-type handles this since they're all divs
  });

  // Keep tooltip on top of newly added segments
  track.appendChild(nowEl);
}

// ---- Tooltip ----

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

  // Label
  const labelMap = { work: 'Work', rest: 'Break', stopped: 'Stopped' };
  document.getElementById('tooltipLabel').textContent = labelMap[s.phase] ?? s.phase;

  // Dot colour class
  const dot = document.getElementById('tooltipDot');
  dot.className = `timeline-tooltip-dot ${s.phase}`;

  // Time range
  const endLabel = isLive ? 'now' : fmtHHMM(s.end);
  document.getElementById('tooltipRange').textContent =
    `${fmtHHMM(s.start)} – ${endLabel}`;

  // Duration
  const durMs = (isLive ? now : s.end) - s.start;
  const durText = isLive
    ? `${fmtDuration(durMs)} · ongoing`
    : fmtDuration(durMs);
  document.getElementById('tooltipDur').textContent = durText;

  // Position: centre over the hovered segment, clamped to viewport
  tooltip.classList.add('visible');
  const trackRect = track.getBoundingClientRect();
  const segRect   = segEl.getBoundingClientRect();
  const tipW      = tooltip.offsetWidth;
  const segCentreX = segRect.left + segRect.width / 2 - trackRect.left;
  const leftPx = clamp(segCentreX - tipW / 2, 0, trackRect.width - tipW);
  tooltip.style.left = `${leftPx}px`;
}

// =====================================================================
// Hook timeline into phase transitions
// =====================================================================

// Wrap startPhase to also record it
const _startPhase = startPhase;
// (we redefine startPhase below after this block — handled inline)

// =====================================================================
// History panel
// =====================================================================

let historyPanelOpen = false;

function openHistoryPanel() {
  historyPanelOpen = true;
  const panel   = document.getElementById('historyPanel');
  const overlay = document.getElementById('historyOverlay');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  document.body.classList.add('history-open');
  renderHistoryPanel();
}

function closeHistoryPanel() {
  historyPanelOpen = false;
  const panel   = document.getElementById('historyPanel');
  const overlay = document.getElementById('historyOverlay');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('open');
  document.body.classList.remove('history-open');
}

// Close when clicking the overlay
document.getElementById('historyOverlay').addEventListener('click', closeHistoryPanel);

// Build rows from today's recorded activity (excluding leading stopped gap)
function buildHistoryRows() {
  const segs = buildDrawSegments();
  const firstActive = segs.findIndex(s => s.phase !== 'stopped');
  if (firstActive === -1) return [];
  return segs.slice(firstActive);
}

function renderHistoryPanel() {
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
             `<span class="history-range">${startStr}\u2013${endStr}</span>` +
             `<span class="history-elapsed">${elapsedStr}${dot}</span>` +
             `</td>`;
    };

    html += `<tr>${cell('work')}${cell('rest')}${cell('stopped')}</tr>`;
  }

  // Totals row
  const fmtTotal = (ms) => ms > 0 ? fmtHMS(ms / 1000) : '\u2014';
  html += `<tr class="history-totals">` +
          `<td class="history-cell work"><span class="history-elapsed">${fmtTotal(totals.work)}</span></td>` +
          `<td class="history-cell rest"><span class="history-elapsed">${fmtTotal(totals.rest)}</span></td>` +
          `<td class="history-cell stopped"><span class="history-elapsed">${fmtTotal(totals.stopped)}</span></td>` +
          `</tr>`;

  tbody.innerHTML = html;
}

// =====================================================================
// Swipe & keyboard gestures for the history panel
// =====================================================================

// Touch swipe: right-to-left on app → open; left-to-right on panel → close
let touchStartX = null;
let touchStartY = null;
const SWIPE_THRESHOLD = 60;  // px
const SWIPE_RATIO     = 2;   // horizontal must exceed vertical by this factor

document.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;

  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) {
    touchStartX = null;
    touchStartY = null;
    return;
  }

  if (dx < 0 && !historyPanelOpen) {
    // Right-to-left anywhere on the page → open
    openHistoryPanel();
  } else if (dx > 0 && historyPanelOpen) {
    // Left-to-right anywhere → close
    closeHistoryPanel();
  }

  touchStartX = null;
  touchStartY = null;
}, { passive: true });

// Keyboard: ArrowLeft opens; ArrowRight / Escape closes
window.addEventListener('keydown', (e) => {
  // Don't steal from the boundary knob's own arrow handler
  if (e.target === els.knob) return;
  if (e.key === 'ArrowLeft' && !historyPanelOpen) {
    openHistoryPanel();
    e.preventDefault();
  } else if ((e.key === 'ArrowRight' || e.key === 'Escape') && historyPanelOpen) {
    closeHistoryPanel();
    e.preventDefault();
  }
});

// =====================================================================
// Tick loop
// =====================================================================

// Re-render every 250 ms while the page is visible. When hidden, browsers
// throttle setInterval anyway; on visibilitychange we force one re-render so
// the dial doesn't appear frozen when the user comes back.
setInterval(() => { render(); renderTimeline(); renderHistoryPanel(); }, TICK_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { render(); renderTimeline(); renderHistoryPanel(); }
});

// =====================================================================
// Initial render
// =====================================================================

render();
renderTimeline();
