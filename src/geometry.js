'use strict';

// Dial geometry constants and pure math helpers.
// No DOM, no state — these are the bits that port directly to Swift later.

export const CENTER = { x: 200, y: 200 };
export const RING_R = 130;          // centerline of the colored ring
export const TOTAL_MINUTES = 60;    // the dial always represents 60 min

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Returns {x,y} on a circle of radius r at a given minute (0 = top, clockwise).
export function polar(minute, r) {
  const a = -Math.PI / 2 + (minute / TOTAL_MINUTES) * 2 * Math.PI;
  return { x: CENTER.x + r * Math.cos(a), y: CENTER.y + r * Math.sin(a) };
}

// SVG arc path from startMin to endMin (clockwise), radius r.
export function arcPath(startMin, endMin, r) {
  if (endMin <= startMin) return '';
  const p1 = polar(startMin, r);
  const p2 = polar(endMin, r);
  const sweep = endMin - startMin;
  const largeArc = sweep > TOTAL_MINUTES / 2 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
}

// Convert a point in dial-local coords to a minute value (0..TOTAL_MINUTES).
// atan2 -> angle from +x, then shift so top = 0 and go clockwise.
export function minutesFromPoint(pt) {
  const dx = pt.x - CENTER.x;
  const dy = pt.y - CENTER.y;
  let a = Math.atan2(dy, dx) + Math.PI / 2;
  if (a < 0) a += 2 * Math.PI;
  return (a / (2 * Math.PI)) * TOTAL_MINUTES;
}
