// Start and stop shade alerts follow the same 지금 / 머무름 dwell as the family card.
// A walk must be quiet for about 45s, and a ride (about 7 km/h or faster) for 3 minutes,
// before a stop alert. A start alert waits for a real travel step. Accelerometer-only
// motion and courtyard jitter do not send one. The first sample only adopts the phase
// so opening the app does not repeat an alert for a trip already underway.

import { lastTravelAt, stayLabelDwellMs } from './tracking.mjs';

export function nextMotionAlert({ points, now, phase }) {
  const known = phase === 'moving' || phase === 'still';
  if (!Number.isFinite(now)) return { phase: known ? phase : 'unknown', event: null };
  const movedAt = lastTravelAt(points);
  const dwell = stayLabelDwellMs(points);
  const traveling = movedAt != null && now >= movedAt && now - movedAt < dwell;
  const next = traveling ? 'moving' : 'still';
  if (!known) return { phase: next, event: null };
  if (phase !== 'moving' && traveling) return { phase: 'moving', event: 'start' };
  if (phase === 'moving' && !traveling) return { phase: 'still', event: 'stop' };
  return { phase, event: null };
}

export function motionAlertCopy(name, event) {
  const who = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 20) || '가족';
  if (event === 'start') return `${who}님이 움직이기 시작했어요`;
  if (event === 'stop') return `${who}님이 멈췄어요`;
  return '';
}

/** Display names for the members this phone should tell. Self is never a target. Empty means send nothing. */
export function motionNotifyNames(members, ids) {
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  const names = [];
  for (const member of Array.isArray(members) ? members : []) {
    if (!member || member.id === 'self' || !wanted.has(member.id)) continue;
    const name = String(member.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!name || names.includes(name)) continue;
    names.push(name);
  }
  return names.slice(0, 8);
}
