'use strict';

// DOM references and DOM-coupled helpers.
// The els object is queried once at module load; type=module defers the script
// until after the DOM is parsed, so every selector resolves.

export const $ = (sel) => document.querySelector(sel);

export const els = {
  body:           document.body,
  phaseLabel:     $('#phaseLabel'),
  workArc:        $('#workArc'),
  restArc:        $('#restArc'),
  restExtArc:     $('#restExtArc'),
  hand:           $('#hand'),
  knob:           $('#boundaryKnob'),
  restEndKnob:    $('#restEndKnob'),
  readoutLabel:   $('#readoutLabel'),
  readoutMain:    $('#readoutMain'),
  readoutSub:     $('#readoutSub'),
  hint:           $('#hint'),
  workBtn:        $('#workBtn'),
  restBtn:        $('#restBtn'),
  stopToggle:     $('#stopToggle'),
  muteToggle:     $('#muteToggle'),
  footerHint:     $('#footerHint'),
  actionFeedback: $('#actionFeedback'),
};

// Map a pointer event to dial-local coords (the SVG uses viewBox 0 0 400 400).
export function svgPointFromEvent(e) {
  const svg = $('#dial');
  const rect = svg.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (400 / rect.width),
    y: (e.clientY - rect.top)  * (400 / rect.height),
  };
}

// Brief status message below the clock.
let feedbackTimer = null;
export function showFeedback(msg) {
  els.actionFeedback.textContent = msg;
  els.actionFeedback.classList.remove('hidden');
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => els.actionFeedback.classList.add('hidden'), 3000);
}
