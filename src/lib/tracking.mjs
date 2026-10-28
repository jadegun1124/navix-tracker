// Stop-to-stop day record for Umap.
//
// Stops: linger inside STOP_RADIUS_M for STOP_MIN_MS (Samsung Health style).
// A segment is the travel between two consecutive stops. Travel time is
// arrival at the next stop minus departure from the previous stop.
//
// Mode uses the segment's average speed (distance / travel time):
//   도보     < 7 km/h
//   자전거   7–23 km/h
//   차량     23–200 km/h, and any faster burst that is too short to be a flight
//   비행기   >= 200 km/h AND >= 20 km AND >= 3 min
// Under 40 m is always 도보 so GPS creep inside a building is not a vehicle.
// 고속철(약 300 km/h)은 거리·시간 조건을 넘으면 비행기로 잡힐 수 있다.
//
// Steps: Capacitor core has no pedometer. 도보 segments estimate
// steps as distance / STRIDE_M (0.75 m) and the UI must say 추정.
//
// OS: a WebView watch dies overnight if the process sleeps. A cached fix
// older than FIX_STALE_MS is rejected so a stale point is not published as
// now. Stored trails and visits stay for HISTORY_DAYS Seoul calendar days
// (today through that many days ago) and older points are trimmed.
// Background publishing is a LocationManager registration started only after
// the user turns on the in-app keep-alive control. It does not post an
// ongoing notification. The app never changes the OS permission itself.

export const STOP_RADIUS_M = 50;
export const STOP_MIN_MS = 3 * 60 * 1000;
export const STRIDE_M = 0.75;
export const TRAIL_POINT_CAP = 1500;
/** Today plus this many Seoul calendar days back. 30 → 오늘부터 30일 전. */
export const HISTORY_DAYS = 30;
export const VISIT_DAY_CAP = 40;

export const MODE_WALK_MAX_KMH = 7;
export const MODE_BIKE_MAX_KMH = 23;
export const MODE_PLANE_MIN_KMH = 200;
export const MODE_PLANE_MIN_DISTANCE_M = 20_000;
export const MODE_PLANE_MIN_DURATION_MS = 3 * 60 * 1000;

export const FIX_STALE_MS = 30_000;
export const FIX_PRECISE_ACCURACY_M = 80;
export const FIX_APPROXIMATE_ACCURACY_M = 400;
export const FIX_MAX_JUMP_MPS = 350;
export const FIX_JUMP_WINDOW_MS = 180_000;
/** A later fix worse than this does not move the pin or the line. */
export const TRAIL_POOR_ACCURACY_M = 40;
/** Reported speed under this, while still, is not a new vertex. */
export const TRAIL_STAY_SPEED_MPS = 0.8;
/** A still phone must clear this before a far multipath spike becomes travel. */
export const TRAIL_STILL_CONFIRM_M = 80;
/**
 * Quiet leaps farther than this are a relocation, not courtyard multipath.
 * Above the 110m still-phone spike the sampler still rejects, and well under a
 * neighborhood move such as Hagye to Junggye.
 */
export const TRAIL_RELOCATION_M = 120;
/** Drawn wobble inside about one accuracy bubble is removed. Block corners sit outside it. */
const TRAIL_SIMPLIFY_MIN_M = 12;
const TRAIL_SIMPLIFY_MAX_M = 22;
/** A vertex this far off the shortcut, on a thin triangle, is courtyard multipath. */
const TRAIL_SPUR_DEVIATION_M = 32;
const TRAIL_SPUR_RATIO = 1.62;
const TRAIL_SPUR_MAX_LEG_M = 260;
const TRAIL_SPUR_WINDOW_MS = 180_000;

const MODE_LABELS = {
  walk: '도보',
  bike: '자전거',
  vehicle: '차량',
  plane: '비행기',
};

export function modeLabel(mode) {
  return MODE_LABELS[mode] || MODE_LABELS.walk;
}

export function seoulDayKey(epochMs) {
  const when = new Date(epochMs);
  if (Number.isNaN(when.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when);
}

export function needsDailyWipe(storedDay, now) {
  return storedDay !== seoulDayKey(now);
}

function haversineMeters(a, b) {
  const radius = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function positiveMeters(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function toMeters(point, origin) {
  const lat0 = (origin.lat * Math.PI) / 180;
  return {
    x: (point.lng - origin.lng) * 111_320 * Math.cos(lat0),
    y: (point.lat - origin.lat) * 111_320,
  };
}

function perpendicularDistanceM(point, start, end) {
  const endM = toMeters(end, start);
  const pointM = toMeters(point, start);
  const length = Math.hypot(endM.x, endM.y);
  if (length < 0.5) return Math.hypot(pointM.x, pointM.y);
  return Math.abs(endM.x * pointM.y - endM.y * pointM.x) / length;
}

function bearingDeg(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function signedTurnDeg(a, b, c) {
  const delta = bearingDeg(b, c) - bearingDeg(a, b);
  return ((delta + 540) % 360) - 180;
}

/** Meters off the neighboring chord when the vertex is a thin there-and-back spike, otherwise 0. */
function spikeDeviation(prev, tip, next) {
  if (!prev || !tip || !next) return 0;
  const ab = haversineMeters(prev, tip);
  const bc = haversineMeters(tip, next);
  const ac = haversineMeters(prev, next);
  if (ab < 18 || bc < 18 || Math.max(ab, bc) > TRAIL_SPUR_MAX_LEG_M) return 0;
  if (Math.abs(signedTurnDeg(prev, tip, next)) < 70) return 0;
  const dt = Number.isFinite(next.at) && Number.isFinite(prev.at) ? next.at - prev.at : 0;
  if (!Number.isFinite(dt) || dt < 0 || dt > TRAIL_SPUR_WINDOW_MS) return 0;
  const deviation = perpendicularDistanceM(tip, prev, next);
  if (deviation < TRAIL_SPUR_DEVIATION_M) return 0;
  if ((ab + bc) / Math.max(ac, 1) < TRAIL_SPUR_RATIO) return 0;
  return deviation;
}

function removeMultipathSpurs(points) {
  if (!Array.isArray(points) || points.length < 3) return points;
  let current = points;
  let removedAny = false;
  const limit = Math.min(current.length, 80);
  for (let guard = 0; guard < limit; guard += 1) {
    const indexes = [];
    for (let index = 0; index < current.length; index += 1) {
      if (current[index] && !current[index].stayEnd) indexes.push(index);
    }
    if (indexes.length < 3) break;
    let worstAt = -1;
    let worstDev = 0;
    for (let index = 1; index < indexes.length - 1; index += 1) {
      const dev = spikeDeviation(current[indexes[index - 1]], current[indexes[index]], current[indexes[index + 1]]);
      if (dev > worstDev) {
        worstDev = dev;
        worstAt = indexes[index];
      }
    }
    if (worstAt < 0) break;
    const nextPoints = current.slice();
    nextPoints.splice(worstAt, 1);
    current = nextPoints;
    removedAny = true;
  }
  if (!removedAny) return points;
  const anchors = current.filter((point) => point && !point.stayEnd);
  return current.filter((point) => {
    if (!point?.stayEnd) return true;
    return anchors.some((anchor) => haversineMeters(anchor, point) <= 20);
  });
}

function displaySimplifyMeters(points) {
  const samples = [];
  for (const point of points) {
    const accuracy = positiveMeters(point?.accuracyM);
    if (accuracy > 0) samples.push(accuracy);
  }
  samples.sort((left, right) => left - right);
  const median = samples.length ? samples[Math.floor((samples.length - 1) / 2)] : TRAIL_SIMPLIFY_MIN_M;
  return Math.min(TRAIL_SIMPLIFY_MAX_M, Math.max(TRAIL_SIMPLIFY_MIN_M, median * 1.2));
}

function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let cursor = start + 1; cursor < end; cursor += 1) {
      const dist = perpendicularDistanceM(points[cursor], points[start], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = cursor;
      }
    }
    if (index >= 0 && maxDist > epsilon) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  const simplified = points.filter((_, index) => keep[index]);
  return simplified.length >= 2 ? simplified : points;
}

/** Stay bubble while still. While moving, ignore steps inside ~1.35× the reported accuracy. */
export function trailMoveGate(last, point) {
  const accuracy = Math.max(positiveMeters(point?.accuracyM), positiveMeters(last?.accuracyM));
  const speed = typeof point?.speedMps === 'number' && Number.isFinite(point.speedMps) ? point.speedMps : null;
  const staying = point?.staying === true || (speed != null && speed < TRAIL_STAY_SPEED_MPS);
  if (staying) return Math.max(STOP_RADIUS_M, accuracy * 2);
  return Math.max(12, accuracy * 1.35);
}

/**
 * keep: the coordinate is travel, or a relocation past courtyard multipath, and may extend the polyline.
 * snap: inside the stay bubble, or a short still-phone spike. Not a live-pin hold by itself.
 * drop: the sample is too poor to use.
 */
export function trailDecision(last, point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !Number.isFinite(point.at)) return 'drop';
  if (!last) return 'keep';
  const accuracy = positiveMeters(point.accuracyM);
  if (accuracy > TRAIL_POOR_ACCURACY_M) return 'drop';
  const moved = haversineMeters(last, point);
  const dt = point.at - last.at;
  if (!Number.isFinite(moved) || !Number.isFinite(dt) || dt < 0) return 'drop';
  if (moved === 0 && dt === 0) return 'drop';
  const gate = trailMoveGate(last, point);
  if (moved <= gate) return 'snap';
  const speed = typeof point.speedMps === 'number' && Number.isFinite(point.speedMps) ? point.speedMps : null;
  const reportedStill = point.staying === true || (speed != null && speed < TRAIL_STAY_SPEED_MPS);
  // Precise fixes can still leap between towers. With no walking speed, a short leap is not a path.
  const quiet = reportedStill || (speed == null && accuracy > 0 && accuracy <= 30 && moved < TRAIL_STILL_CONFIRM_M);
  if (quiet && moved <= TRAIL_RELOCATION_M) {
    const implied = dt > 0 ? moved / (dt / 1000) : Infinity;
    // One courtyard hop often implies 3–8 m/s for a few seconds. A real departure holds walking pace.
    const sustainedWalk = moved >= Math.max(TRAIL_STILL_CONFIRM_M, accuracy * 3) && dt >= 45_000 && implied >= 0.7 && implied <= 2.5;
    if (!sustainedWalk) return 'snap';
  }
  const implied = dt > 0 ? moved / (dt / 1000) : Infinity;
  if (implied > FIX_MAX_JUMP_MPS) return 'drop';
  return 'keep';
}

/** Bubble inside which the live pin may reuse the anchor. A farther fix is where the phone is now. */
export function staySnapGate(last, point) {
  const accuracy = Math.max(positiveMeters(point?.accuracyM), positiveMeters(last?.accuracyM));
  return Math.max(STOP_RADIUS_M, accuracy * 2);
}

/**
 * Live pin and the coordinate published to the family.
 * Holds only inside the stay bubble. Bus, subway, and a sparse GPS jump past that
 * bubble move the pin even when the trail sampler still drops the vertex.
 * A dropped sample (poor accuracy, impossible jump) does not move the pin.
 */
export function liveCoordinate(anchor, point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    if (anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng)) {
      return { ...point, lat: anchor.lat, lng: anchor.lng };
    }
    return point;
  }
  if (!anchor || !Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lng)) return point;
  const decision = trailDecision(anchor, point);
  if (decision === 'keep') return point;
  if (decision === 'drop') return { ...point, lat: anchor.lat, lng: anchor.lng };
  if (haversineMeters(anchor, point) <= staySnapGate(anchor, point)) {
    return { ...point, lat: anchor.lat, lng: anchor.lng };
  }
  return point;
}

export function shouldKeepTrailPoint(last, point) {
  return trailDecision(last, point) === 'keep';
}

function drawnAnchor(points) {
  if (!Array.isArray(points)) return null;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point && !point.stayEnd) return point;
  }
  return null;
}

/** Drop stay jitter and multipath spurs. A long stay keeps one extra timestamp at the same coordinate. */
export function collapseStayTrail(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const kept = [];
  let changed = false;
  for (const point of points) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !Number.isFinite(point.at)) {
      changed = true;
      continue;
    }
    const anchor = drawnAnchor(kept);
    if (!anchor) {
      if (point.stayEnd) {
        changed = true;
        continue;
      }
      kept.push(point);
      continue;
    }
    const decision = trailDecision(anchor, point);
    if (decision === 'drop' || decision === 'snap') {
      changed = true;
      if (decision === 'snap' && point.at - anchor.at >= STOP_MIN_MS) {
        const last = kept[kept.length - 1];
        if (last && last.stayEnd) kept[kept.length - 1] = { ...last, at: point.at, accuracyM: point.accuracyM ?? last.accuracyM };
        else kept.push({ lat: anchor.lat, lng: anchor.lng, at: point.at, speedMps: 0, accuracyM: point.accuracyM, stayEnd: true });
      }
      continue;
    }
    if (point.stayEnd) {
      changed = true;
      continue;
    }
    kept.push(point);
  }
  const despiked = removeMultipathSpurs(kept);
  if (despiked !== kept) return despiked;
  if (!changed && kept.length === points.length) return points;
  return kept;
}

/**
 * Polyline vertices for every member.
 * Stay markers, accuracy-bubble wiggles, and apartment multipath spikes are not drawn.
 * Douglas–Peucker runs only here so stored history can still rebuild a real corner.
 */
export function visibleTrail(points) {
  const collapsed = collapseStayTrail(points);
  const drawn = [];
  for (const point of collapsed) {
    if (!point || point.stayEnd) continue;
    const prev = drawn[drawn.length - 1];
    if (prev && haversineMeters(prev, point) < 8) continue;
    drawn.push(point);
  }
  if (drawn.length < 3) return drawn;
  return douglasPeucker(drawn, displaySimplifyMeters(drawn));
}

export function displayCoordinate(points, point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return point;
  const anchor = drawnAnchor(visibleTrail(points));
  if (!anchor) return point;
  return liveCoordinate(anchor, point);
}

export function settleTrailPoint(points, point, now) {
  const existing = Array.isArray(points) ? points : [];
  const collapsed = collapseStayTrail(existing);
  const anchor = drawnAnchor(collapsed);
  const decision = trailDecision(anchor, point);
  const pin = liveCoordinate(anchor, point);
  if (decision !== 'keep') {
    const next = decision === 'snap' ? appendHistoryPoint(collapsed, point, now) : collapsed;
    return {
      points: next,
      lat: pin && Number.isFinite(pin.lat) ? pin.lat : (anchor ? anchor.lat : null),
      lng: pin && Number.isFinite(pin.lng) ? pin.lng : (anchor ? anchor.lng : null),
      decision,
    };
  }
  return {
    points: appendHistoryPoint(collapsed, point, now),
    lat: point.lat,
    lng: point.lng,
    decision: 'keep',
  };
}

export function tracksForSeoulDay(tracks, now) {
  const day = seoulDayKey(now);
  const next = {};
  if (!tracks || typeof tracks !== 'object') return next;
  for (const [id, points] of Object.entries(tracks)) {
    if (!Array.isArray(points)) continue;
    const kept = points.filter((point) => point && Number.isFinite(point.at) && seoulDayKey(point.at) === day).slice(-TRAIL_POINT_CAP);
    if (kept.length > 0) next[id] = kept;
  }
  return next;
}

export function visitsForSeoulDay(visits, now) {
  const day = seoulDayKey(now);
  const next = {};
  if (!visits || typeof visits !== 'object') return next;
  for (const [id, list] of Object.entries(visits)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((visit) => visit && Number.isFinite(visit.arrivedAt) && seoulDayKey(visit.arrivedAt) === day).slice(-VISIT_DAY_CAP);
    if (kept.length > 0) next[id] = kept;
  }
  return next;
}

function calendarDayKey(year, monthIndex, day) {
  const dt = new Date(Date.UTC(year, monthIndex, day));
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const date = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${month}-${date}`;
}

export function shiftDayKey(dayKey, deltaDays) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  if (!year || !month || !day) return '';
  return calendarDayKey(year, month - 1, day + deltaDays);
}

export function oldestHistoryDay(now) {
  return shiftDayKey(seoulDayKey(now), -HISTORY_DAYS);
}

export function isWithinHistory(epochMs, now) {
  const day = seoulDayKey(epochMs);
  const today = seoulDayKey(now);
  const oldest = oldestHistoryDay(now);
  return Boolean(day && today && oldest && day >= oldest && day <= today);
}

export function historyDayKeys(now) {
  const today = seoulDayKey(now);
  const keys = [];
  for (let offset = 0; offset <= HISTORY_DAYS; offset += 1) keys.push(shiftDayKey(today, -offset));
  return keys;
}

export function historyDayLabel(dayKey, now) {
  const today = seoulDayKey(now);
  if (dayKey === today) return '오늘';
  if (dayKey === shiftDayKey(today, -1)) return '어제';
  const [year, month, day] = String(dayKey).split('-');
  if (today.slice(0, 4) === year) return `${Number(month)}월 ${Number(day)}일`;
  return `${year}.${Number(month)}.${Number(day)}`;
}

export function seoulDayEndMs(dayKey) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  if (!year || !month || !day) return Date.now();
  return Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000 + 86_400_000 - 1;
}

function sameList(left, right) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

export function trimMemberPoints(points, now) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const today = seoulDayKey(now);
  const oldest = oldestHistoryDay(now);
  const byDay = new Map();
  let dropped = false;
  for (const point of points) {
    if (!point || !Number.isFinite(point.at)) {
      dropped = true;
      continue;
    }
    const day = seoulDayKey(point.at);
    if (!day || day < oldest || day > today) {
      dropped = true;
      continue;
    }
    const bucket = byDay.get(day);
    if (bucket) bucket.push(point);
    else byDay.set(day, [point]);
  }
  const kept = [];
  for (const day of [...byDay.keys()].sort()) {
    const bucket = byDay.get(day);
    const slice = bucket.length > TRAIL_POINT_CAP ? bucket.slice(-TRAIL_POINT_CAP) : bucket;
    if (slice.length !== bucket.length) dropped = true;
    kept.push(...slice);
  }
  if (!dropped && sameList(points, kept)) return points;
  return kept;
}

export function appendHistoryPoint(points, point, now) {
  const anchorNow = Number.isFinite(now) ? now : point?.at;
  const base = collapseStayTrail(Array.isArray(points) ? points : []);
  const anchor = drawnAnchor(base);
  const decision = trailDecision(anchor, point);
  if (decision === 'drop' || !point || !Number.isFinite(point.at)) {
    const trimmed = trimMemberPoints(base, anchorNow);
    return trimmed === points ? points : trimmed;
  }
  if (decision === 'snap' && anchor) {
    if (point.at - anchor.at < STOP_MIN_MS) {
      const trimmed = trimMemberPoints(base, anchorNow);
      return trimmed === points ? points : trimmed;
    }
    const next = base.slice();
    const last = next[next.length - 1];
    if (last && last.stayEnd) next[next.length - 1] = { ...last, at: point.at, accuracyM: point.accuracyM ?? last.accuracyM };
    else next.push({ lat: anchor.lat, lng: anchor.lng, at: point.at, speedMps: 0, accuracyM: point.accuracyM, stayEnd: true });
    return trimMemberPoints(next, anchorNow);
  }
  const next = base.slice();
  next.push(point);
  return trimMemberPoints(next, anchorNow);
}

export function tracksWithinHistory(tracks, now) {
  if (!tracks || typeof tracks !== 'object') return {};
  let changed = false;
  const next = {};
  const ids = Object.keys(tracks);
  for (const id of ids) {
    const points = tracks[id];
    if (!Array.isArray(points)) {
      changed = true;
      continue;
    }
    const trimmed = trimMemberPoints(points, now);
    if (trimmed.length === 0) {
      if (points.length > 0) changed = true;
      continue;
    }
    next[id] = trimmed;
    if (trimmed !== points) changed = true;
  }
  if (!changed && Object.keys(next).length === ids.length) return tracks;
  return next;
}

function trimVisitList(list, now) {
  if (!Array.isArray(list)) return [];
  const today = seoulDayKey(now);
  const oldest = oldestHistoryDay(now);
  const byDay = new Map();
  let dropped = false;
  for (const visit of list) {
    if (!visit || !Number.isFinite(visit.arrivedAt)) {
      dropped = true;
      continue;
    }
    const day = seoulDayKey(visit.arrivedAt);
    if (!day || day < oldest || day > today) {
      dropped = true;
      continue;
    }
    const bucket = byDay.get(day);
    if (bucket) bucket.push(visit);
    else byDay.set(day, [visit]);
  }
  const kept = [];
  for (const day of [...byDay.keys()].sort()) {
    const bucket = byDay.get(day);
    const slice = bucket.length > VISIT_DAY_CAP ? bucket.slice(-VISIT_DAY_CAP) : bucket;
    if (slice.length !== bucket.length) dropped = true;
    kept.push(...slice);
  }
  if (!dropped && sameList(list, kept)) return list;
  return kept;
}

export function visitsWithinHistory(visits, now) {
  if (!visits || typeof visits !== 'object') return {};
  let changed = false;
  const next = {};
  const ids = Object.keys(visits);
  for (const id of ids) {
    const list = visits[id];
    if (!Array.isArray(list)) {
      changed = true;
      continue;
    }
    const trimmed = trimVisitList(list, now);
    if (trimmed.length === 0) {
      if (list.length > 0) changed = true;
      continue;
    }
    next[id] = trimmed;
    if (trimmed !== list) changed = true;
  }
  if (!changed && Object.keys(next).length === ids.length) return visits;
  return next;
}

export function acceptFix(previous, reading, options = {}) {
  const precise = options.precise !== false;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const lat = Number(reading?.lat);
  const lng = Number(reading?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, reason: 'coords' };
  }
  const at = Number(reading?.at);
  if (!Number.isFinite(at) || now - at > FIX_STALE_MS || at > now + 10_000) {
    return { ok: false, reason: 'stale' };
  }
  let accuracy = Number(reading?.accuracy);
  const maxAccuracy = precise ? FIX_PRECISE_ACCURACY_M : FIX_APPROXIMATE_ACCURACY_M;
  if (!Number.isFinite(accuracy) || accuracy <= 0) {
    if (precise) return { ok: false, reason: 'accuracy' };
    accuracy = maxAccuracy;
  }
  if (accuracy > maxAccuracy) return { ok: false, reason: 'accuracy' };
  if (previous && accuracy > TRAIL_POOR_ACCURACY_M) return { ok: false, reason: 'accuracy' };
  if (previous && Number.isFinite(previous.at)) {
    const dtMs = at - previous.at;
    if (dtMs > 0 && dtMs <= FIX_JUMP_WINDOW_MS) {
      const speed = haversineMeters(previous, { lat, lng }) / (dtMs / 1000);
      if (speed > FIX_MAX_JUMP_MPS) return { ok: false, reason: 'jump' };
    }
  }
  let speedMps = null;
  if (typeof reading.speedMps === 'number' && Number.isFinite(reading.speedMps) && reading.speedMps >= 0 && reading.speedMps < 400) {
    speedMps = reading.speedMps;
  }
  return { ok: true, fix: { lat, lng, accuracy, at, speedMps } };
}

export function classifyMode(speedKmh, distanceM, durationMs) {
  const speed = Number.isFinite(speedKmh) ? speedKmh : 0;
  const distance = Number.isFinite(distanceM) ? distanceM : 0;
  const duration = Number.isFinite(durationMs) ? durationMs : 0;
  if (distance < 40) return 'walk';
  if (speed >= MODE_PLANE_MIN_KMH && distance >= MODE_PLANE_MIN_DISTANCE_M && duration >= MODE_PLANE_MIN_DURATION_MS) return 'plane';
  if (speed >= MODE_BIKE_MAX_KMH) return 'vehicle';
  if (speed >= MODE_WALK_MAX_KMH) return 'bike';
  return 'walk';
}

export function estimateSteps(distanceM) {
  if (!Number.isFinite(distanceM) || distanceM < 1) return 0;
  return Math.round(distanceM / STRIDE_M);
}

export function formatDurationMs(durationMs) {
  const totalMin = Math.max(0, Math.round((Number(durationMs) || 0) / 60_000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours <= 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

export function formatDistanceM(meters) {
  if (!Number.isFinite(meters) || meters < 0) return '0m';
  if (meters < 1000) return `${Math.round(meters)}m`;
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

function pathDistance(path) {
  let distance = 0;
  for (let index = 1; index < path.length; index += 1) distance += haversineMeters(path[index - 1], path[index]);
  return distance;
}

function summarizeSegment(path, departAt, arriveAt, open) {
  const distanceM = pathDistance(path);
  const durationMs = Math.max(0, arriveAt - departAt);
  if (open && distanceM < 30) return null;
  const speedKmh = durationMs > 0 ? (distanceM / 1000) / (durationMs / 3_600_000) : 0;
  const mode = classifyMode(speedKmh, distanceM, durationMs);
  const steps = mode === 'walk' ? estimateSteps(distanceM) : null;
  return {
    departAt,
    arriveAt,
    durationMs,
    distanceM,
    speedKmh,
    mode,
    steps,
    stepsEstimated: mode === 'walk',
    open: !!open,
  };
}

function clusterPoints(points) {
  const clusters = [];
  for (const point of points) {
    const last = clusters[clusters.length - 1];
    if (!last || haversineMeters(last, point) > STOP_RADIUS_M) {
      clusters.push({
        lat: point.lat,
        lng: point.lng,
        startAt: point.at,
        endAt: point.at,
        count: 1,
      });
      continue;
    }
    const count = last.count + 1;
    last.lat = (last.lat * last.count + point.lat) / count;
    last.lng = (last.lng * last.count + point.lng) / count;
    last.endAt = point.at;
    last.count = count;
  }
  return clusters;
}

export function buildDayRecord(points, now) {
  const sorted = (Array.isArray(points) ? points : [])
    .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Number.isFinite(point.at))
    .slice()
    .sort((left, right) => left.at - right.at);
  const when = Number.isFinite(now) ? now : Date.now();
  const clusters = clusterPoints(sorted);
  const stops = [];
  clusters.forEach((cluster, index) => {
    const closed = index < clusters.length - 1;
    const end = closed ? cluster.endAt : Math.max(cluster.endAt, when);
    if (end - cluster.startAt < STOP_MIN_MS) return;
    stops.push({
      lat: Number(cluster.lat.toFixed(6)),
      lng: Number(cluster.lng.toFixed(6)),
      arrivedAt: cluster.startAt,
      leftAt: closed ? cluster.endAt : null,
    });
  });
  const segments = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const departAt = stops[index].leftAt ?? stops[index].arrivedAt;
    const arriveAt = stops[index + 1].arrivedAt;
    if (arriveAt <= departAt) continue;
    const path = sorted.filter((point) => point.at >= departAt && point.at <= arriveAt);
    const segment = summarizeSegment(path, departAt, arriveAt, false);
    if (segment) segments.push(segment);
  }
  const lastStop = stops[stops.length - 1];
  if (lastStop?.leftAt != null && when - lastStop.leftAt >= 30_000) {
    const path = sorted.filter((point) => point.at >= lastStop.leftAt);
    const segment = summarizeSegment(path, lastStop.leftAt, when, true);
    if (segment) segments.push(segment);
  }
  return { stops, segments };
}
