'use strict';

// render() — single function, called every tick and after any state change.
// Rewrites the DOM from the current state + derived view. The only "smart"
// thing it does is dispatch the alarm chime when uiPhase is 'alarm'.

import { state } from './state.js';
import { CENTER, RING_R, TOTAL_MINUTES, arcPath, polar } from './geometry.js';
import { els } from './dom.js';
import { derive } from './derive.js';
import { fmtMS } from './format.js';
import { triggerAlarmIfDue } from './audio.js';

export function render() {
  const d = derive();

  // ---- Arcs ----
  // Green arc starts where the red extension ends, shortening when rest is extended.
  els.workArc.setAttribute('d', arcPath(state.restExtMinutes, state.workMinutes, RING_R));
  els.restArc.setAttribute('d', arcPath(state.workMinutes, TOTAL_MINUTES, RING_R));
  els.restExtArc.setAttribute('d', state.restExtMinutes > 0
    ? arcPath(0, state.restExtMinutes, RING_R)
    : '');

  // ---- Boundary knob ----
  const knobPos = polar(state.workMinutes, RING_R);
  els.knob.setAttribute('cx', knobPos.x);
  els.knob.setAttribute('cy', knobPos.y);
  els.knob.setAttribute('aria-valuenow', state.workMinutes);

  // ---- Rest-end knob ----
  const restEndPos = polar(state.restExtMinutes, RING_R);
  els.restEndKnob.setAttribute('cx', restEndPos.x);
  els.restEndKnob.setAttribute('cy', restEndPos.y);
  els.restEndKnob.setAttribute('aria-valuenow', state.restExtMinutes);
  els.restEndKnob.setAttribute('aria-valuemax', state.workMinutes);

  // ---- Hand rotation ----
  const angle = d.handMinute * 6;  // 360° / 60min = 6° per minute
  els.hand.setAttribute('transform', `rotate(${angle} ${CENTER.x} ${CENTER.y})`);

  // ---- Body data-phase (CSS hooks off this) ----
  els.body.dataset.phase = d.uiPhase;

  // ---- Readout & hint text ----
  let label, main, sub, hint;
  let footer = (d.uiPhase === 'idle')
    ? 'White dot = work/rest split · Red dot = rest end · Drag to adjust.'
    : 'Drag hand to scrub · White dot = split · Red dot = rest end';

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
    sub   = `/ ${state.restMinutes + state.restExtMinutes}:00`;
    const remain = (state.restMinutes + state.restExtMinutes) * 60 - d.elapsedSec;
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
      sub   = `past ${state.restMinutes + state.restExtMinutes}:00`;
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
