import { memberIsStale, memberPresence } from './memberPresence.mjs';
import { isImpossibleJump, liveMotionLabel, liveTrailPoints, seoulDayKey, trailDrawDashed, trailSegmentDashed } from './tracking.mjs';

/**
 * Main map draws the open segment only while the card still says 「지금」.
 * 「머무름」 draws no line. A dashed hole is not a line. The last vertex sits
 * on the pin when that pin is still on the move. Pins stay either way.
 * Records draw the saved day. Closing records does not erase a move that is still open.
 */
export function familyMapShowsTrail({ viewingRecords, detailOpen, showTrail, member, liveDrawable }) {
  if (!member) return false;
  if (viewingRecords) {
    if (detailOpen) return true;
    if (!showTrail) return false;
    return member.id === 'self' || member.share === 'allowed' || member.role === 'admin-share';
  }
  return liveDrawable === true;
}

/** Saved journeys for the selected day, plus the segment that is still live. */
export function recordsDayTrails({ journeys, livePoints, liveDrawable }) {
  const lines = [];
  for (const journey of Array.isArray(journeys) ? journeys : []) {
    const points = journey?.points;
    if (Array.isArray(points) && points.length >= 2) lines.push(points);
  }
  if (liveDrawable === true && Array.isArray(livePoints) && livePoints.length >= 2) lines.push(livePoints);
  return lines;
}

/** Pin and the live tip still describe the same step. Farther than this is a different place. */
const OVERVIEW_PIN_M = 40;

function meters(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Infinity;
  const radius = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dLat = p2 - p1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Solid runs only. Impossible jumps and dashed holes are omitted, not bridged.
 * Vertices inside a run are the stored samples. This does not simplify them.
 */
function solidRuns(points) {
  const runs = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };
  for (const point of Array.isArray(points) ? points : []) {
    if (!point || point.stayEnd || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    const prev = run[run.length - 1];
    const prior = run[run.length - 2];
    if (prev && (isImpossibleJump(prev, point) || trailDrawDashed(prev, point, prior))) {
      flush();
      run = [point];
      continue;
    }
    run.push(point);
  }
  flush();
  return runs;
}

/**
 * Polylines for the family overview.
 * 「머무름」 returns none, even when the open segment has not archived yet.
 * While 「지금」, each returned line is a dense solid run. A dashed chord is
 * never included. The last vertex is the displayed pin when the pin is still
 * on that run. A pin across a hole or an impossible jump does not grow a
 * connector, and it does not erase the solid run already drawn. The line
 * stays until the next sample can join the pin.
 */
function located(member) {
  return !!member && Number.isFinite(member.lat) && Number.isFinite(member.lng);
}

/**
 * Polylines the main map draws for one member, plus why the list is empty.
 * The screen and the diagnostic log share this so a phone report matches the layer.
 */
export function memberLiveLines(member, tracks, now, liveDay = seoulDayKey(now)) {
  const storedToday = (tracks?.[member?.id] ?? []).filter((point) => point && seoulDayKey(point.at) === liveDay);
  if (!member || member.role === 'guardian' || !located(member)) {
    return { lines: [], reason: 'no-pin', stored: storedToday.length, live: 0 };
  }
  if (memberIsStale(memberPresence(member, now))) {
    return { lines: [], reason: 'stale', stored: storedToday.length, live: 0 };
  }
  if (member.id !== 'self' && member.share !== 'allowed' && member.role !== 'admin-share') {
    return { lines: [], reason: 'share', stored: storedToday.length, live: 0 };
  }
  const points = liveTrailPoints(storedToday, now);
  const pin = { lat: member.lat, lng: member.lng, at: member.updatedAt || now, accuracyM: member.accuracyM };
  const lines = mainOverviewTrails({
    points,
    motionPoints: tracks?.[member.id],
    pin,
    moving: member.moving,
    located: true,
    now,
  });
  if (lines.length === 0) {
    const label = liveMotionLabel({
      located: true,
      moving: member.moving,
      points: tracks?.[member.id],
      now,
      pin,
    });
    return { lines: [], reason: label === '지금' ? 'no-solid' : `label:${label || 'empty'}`, stored: storedToday.length, live: points.length };
  }
  return { lines, reason: 'draw', stored: storedToday.length, live: points.length };
}

export function mainOverviewTrails({ points, motionPoints, pin, moving, located = true, now }) {
  const label = liveMotionLabel({
    located: located !== false,
    moving,
    points: motionPoints ?? points,
    now,
    pin,
  });
  if (label !== '지금') return [];
  const runs = solidRuns(points);
  if (!pin || !Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return runs;
  if (pinRepeatsRejectedHole(points, pin)) return runs;
  const anchor = runs.length > 0 ? runs[runs.length - 1][runs[runs.length - 1].length - 1] : lastDrawn(points);
  if (!anchor) return runs;
  const leg = {
    lat: pin.lat,
    lng: pin.lng,
    at: Number.isFinite(pin.at) ? pin.at : anchor.at,
    speedMps: pin.speedMps,
    accuracyM: pin.accuracyM,
  };
  if (isImpossibleJump(anchor, leg)) return runs;
  const away = meters(anchor, pin);
  if (away === 0) return runs;
  if (runs.length === 0) return away >= 15 ? [[anchor, leg]] : [];
  const lastRun = runs[runs.length - 1];
  if (away <= OVERVIEW_PIN_M) {
    const snapped = lastRun.slice(0, -1).concat([{ ...lastRun[lastRun.length - 1], lat: pin.lat, lng: pin.lng }]);
    return runs.slice(0, -1).concat([snapped]);
  }
  return runs.slice(0, -1).concat([lastRun.concat([leg])]);
}

function lastDrawn(points) {
  const list = Array.isArray(points) ? points : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const point = list[index];
    if (point && !point.stayEnd && Number.isFinite(point.lat) && Number.isFinite(point.lng)) return point;
  }
  return null;
}

/** A precise GPS hole already removed from the solid run must not be drawn back as the pin. */
function pinRepeatsRejectedHole(points, pin) {
  let prev = null;
  let prior = null;
  for (const point of Array.isArray(points) ? points : []) {
    if (!point || point.stayEnd || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    if (prev && (trailDrawDashed(prev, point, prior) || isImpossibleJump(prev, point))) {
      const sameTime = !Number.isFinite(pin.at) || !Number.isFinite(point.at) || Math.abs(pin.at - point.at) < 5_000;
      if (sameTime && meters(point, pin) < 3) return true;
    }
    prior = prev;
    prev = point;
  }
  return false;
}
