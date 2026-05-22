# Cadence — a manual work/rest timer

A single-page timer for the 45/15 work-rest rhythm. The clock doesn't try to align with the wall clock — meetings, interruptions and bathroom breaks make that pointless. Instead, you tap a button when you start working, tap the other one when you stand up, and the dial just shows where you are in your *current* phase.

## The idea in one paragraph

Two phases — **work** (green) and **rest** (red) — share one circular dial. A single hand sweeps around it. When the hand crosses from the green arc into the red arc, an alarm sounds — but the timer does **not** auto-advance. It waits for you to tap the red button, which resets the hand to the start of the red arc and begins the rest countdown. Same in reverse: tap the green button to begin (or restart) a work phase. The boundary between green and red is itself a draggable handle on the dial, so you can set the work/rest split to whatever you want (default 45/15).

## Why this exists

Pomodoro apps assume you can keep a rigid clock. Real workdays don't cooperate — a 10-minute Slack thread blows up a 25-minute timer and now the rest of your day is misaligned. This timer has no notion of "the schedule." It only knows: I am in phase X, I have been in it for Y minutes, the limit is Z. When the user starts the next phase is the user's call.

## Screens (see mockups)

The whole app is one screen:

- **Top half** — the circular dial. Green arc, red arc, one hand. A small numeric readout under the dial shows the elapsed time in the current phase (e.g. `23:14 / 45:00`).
- **Bottom half** — two large buttons stacked or side-by-side: green ("Start work") and red ("Start rest").
- **Adjusting the ratio** — long-press or drag the boundary point on the dial to slide it; the green/red arcs resize live. The chosen ratio persists.

Mockups for each state are in `mockups/`:

- `01-idle.svg` — first load, hand parked at 12 o'clock, nothing running
- `02-work-running.svg` — mid-work phase, hand in the green zone
- `03-rest-running.svg` — mid-rest phase, hand in the red zone
- `04-alarm.svg` — phase ended, alarm visual, waiting for tap
- `05-ratio-slider.svg` — user dragging the boundary to adjust the split

## States and transitions

There are four states:

1. **Idle** — no phase running. Hand parked at 12 o'clock (start of green). Both buttons are armed.
2. **Work running** — hand sweeps through the green arc. Tapping red switches to *Rest running*. Tapping green restarts the work phase.
3. **Rest running** — hand sweeps through the red arc. Tapping green switches to *Work running*. Tapping red restarts the rest phase.
4. **Alarm** — the active phase has elapsed. Hand stops at the boundary. Alarm sounds (one chime, repeating gently every few seconds until acknowledged). The button for the *next* phase pulses. Tapping it starts the next phase.

Both buttons remain enabled in every state — the user is always allowed to switch or restart manually.

## State persistence (browser-only)

Everything lives in `localStorage`. The shape is small:

```
{
  workMinutes: 45,            // snaps to multiples of 5
  restMinutes: 15,            // = 60 - workMinutes
  phase: "idle" | "work" | "rest" | "alarm",
  phaseStartedAt: <epoch ms, or null when idle>,
  phaseStartedFrom: "work" | "rest",  // which phase the alarm belongs to
  muted: false
}
```

Elapsed time is derived from `Date.now() - phaseStartedAt` rather than tracked by a counter. That way the timer survives tab refreshes and the dial reconstructs correctly even if the user closes the laptop for an hour. (If the laptop sleeps mid-phase, the elapsed time on reopen will be larger than the phase length, which puts us straight into the alarm state — that's correct behavior.)

## Sound

A short, calm chime via the Web Audio API (a sine-wave bell or two-note tone). No external audio file needed. On mobile, also trigger `navigator.vibrate()` if available. The user must have interacted with the page at least once (a button tap) before audio works — that's a browser constraint, not a design choice, but the very first interaction is itself a button tap so this isn't a problem in practice.

The chime repeats every ~5 seconds while in the alarm state until you tap a phase button. The mute icon in the corner suppresses both the chime and the vibration; its state persists.

## Tech stack (resolved)

**Vanilla HTML + ES-module JS, no build step, deployed to GitHub Pages.** One `index.html`, one `app.js`, one `styles.css`. The dial is an SVG inline in the HTML; the hand rotates with a CSS `transform: rotate()`; sound uses the Web Audio API. State persists to `localStorage`.

This keeps things small enough that the whole repo is grep-able and the deploy is just `git push` to the `main` branch (with GitHub Pages configured to serve from `/`). When v3 (native iOS) comes, the logic will be rewritten in Swift anyway — none of the web-stack choices port directly to watchOS, so there's nothing lost by starting plain.

## Design decisions (resolved)

1. **Dial total = 60 min, fixed.** The whole dial always represents 60 minutes; the ratio slider moves a single boundary point between green (work) and red (rest). This keeps the dial visually stable across cycles — at any glance you know exactly where you are in the rhythm.
2. **After the alarm: hand stops at the boundary.** The numeric readout in the center then displays overtime as a *negative* value in red, e.g. `-0:14`. So the dial freezes but the readout keeps ticking, signaling how late you are to switch phases. The alarm chime keeps repeating (subject to mute) until you tap a phase button.
3. **Ratio is adjustable mid-phase.** No confirmation prompt. If you shrink the current phase below the time already elapsed, the alarm fires immediately — that's the right behavior (you've effectively just shortened the rule for the phase you're already in).
4. **Mute toggle present.** A compact mute/unmute control is on screen (top-right corner icon by default — see mockups). When muted, the chime is suppressed; vibration on mobile is also suppressed. Mute state persists in localStorage.
5. **Ratio slider snaps to 5-min steps.** Drag gesture, with discrete stops every 5 minutes. Valid stops: `5/55`, `10/50`, `15/45`, `20/40`, `25/35`, `30/30`, `35/25`, `40/20`, `45/15`, `50/10`, `55/5` (eleven positions — neither phase can be zero). The dot snaps as you drag so you can feel the steps. *(If you also want the all-work `60/0` and all-rest `0/60` extremes, that's twelve — easy to toggle.)*

## Roadmap

**v1 — Web (this repo, soon).** Single page, browser storage, works as a PWA so you can "Add to Home Screen" on iOS and it behaves like an app.

**v2 — Polish PWA.** Manifest + service worker + offline + iOS install instructions + better sound + a mute switch. Still no native code.

**v3 — Native iPhone (SwiftUI).** Rewrite as a small SwiftUI app. State stays the same shape. You get real background notifications (so the alarm fires even when the app isn't open), Live Activities on the lock screen, and the foundation for…

**v4 — Apple Watch (SwiftUI + WatchConnectivity).** The Watch app is where this idea pays for itself — you tap the buttons on your wrist without breaking flow. The Watch and phone share state over WatchConnectivity.

The honest path is: ship v1/v2 quickly to validate that *you actually use it*, then commit to v3/v4 only if you do. A lot of personal-tool ideas don't survive the first month — better to find that out with a weekend of JS than a fortnight of Swift.

## Project layout

```
cadence/
├── README.md           ← this file
├── index.html          ← the whole UI (inline SVG dial + buttons)
├── styles.css          ← layout and colors
├── app.js              ← state machine, timer, sound, localStorage
└── mockups/            ← SVG mockups of each state (and PNG renders)
    ├── 01-idle.svg
    ├── 02-work-running.svg
    ├── 03-rest-running.svg
    ├── 04-alarm.svg
    └── 05-ratio-slider.svg
```

## Deployment

GitHub Pages, served from the `main` branch root. No build step needed — push the three files and the site updates. PWA manifest comes in v2 so the page is installable to the iOS home screen.
