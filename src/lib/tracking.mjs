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
// older than FIX_STALE_MS is rejected so yesterday's point is not published
// as today. Background publishing is a foreground service started only after
// the user turns on the in-app keep-alive control. The app never changes the
// OS permission itself.

export const STOP_RADIUS_M = 50;
export const STOP_MIN_MS = 3 * 60 * 1000;
export const STRIDE_M = 0.75;
export const TRAIL_POINT_CAP = 1500;

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

export function shouldKeepTrailPoint(last, point) {
  if (!last) return true;
  const moved = haversineMeters(last, point);
  const dt = point.at - last.at;
  if (!Number.isFinite(moved) || !Number.isFinite(dt) || dt < 0) return false;
  if (moved >= 100) return true;
  if (moved >= 20 && dt >= 8_000) return true;
  if (dt >= STOP_MIN_MS && moved <= STOP_RADIUS_M) return true;
  return false;
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
    const kept = list.filter((visit) => visit && Number.isFinite(visit.arrivedAt) && seoulDayKey(visit.arrivedAt) === day).slice(-40);
    if (kept.length > 0) next[id] = kept;
  }
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
