/** 가족 지도의 정지·이동 구간. 브라우저 테스트가 이 파일만 바로 읽도록 다른 모듈을 부르지 않는다. */

export type TravelMode = 'walk' | 'bike' | 'car' | 'plane';
export type MoveMode = TravelMode | 'still';
export type StepSource = 'device' | 'estimate';

export const STOP_RADIUS_M = 50;
export const STOP_HOLD_MS = 3 * 60 * 1000;
export const MIN_TRIP_M = 80;
export const STEP_METERS = 0.75;
export const SEOUL_TZ = 'Asia/Seoul';

export interface FixSample {
  lat: number;
  lng: number;
  at: number;
  accuracyM: number;
  speedMps: number | null;
}

export interface PlaceVisit {
  id: string;
  memberId: string;
  lat: number;
  lng: number;
  startedAt: number;
  endedAt: number | null;
  label: string;
}

export interface TripSegment {
  id: string;
  memberId: string;
  startAt: number;
  endAt: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceM: number;
  mode: TravelMode;
  steps: number | null;
  stepsSource: StepSource | null;
  topSpeedMps: number;
  path: { lat: number; lng: number; at: number }[];
  provisional?: boolean;
}

export interface ActivitySnapshot {
  phase: 'settling' | 'moving' | 'stopped';
  dwellLat: number;
  dwellLng: number;
  dwellSince: number;
  lastLat: number;
  lastLng: number;
  lastAt: number;
  departLat: number;
  departLng: number;
  departAt: number;
  distanceM: number;
  modeMeters: Record<TravelMode, number>;
  topSpeedMps: number;
  path: { lat: number; lng: number; at: number }[];
  openVisit: PlaceVisit | null;
  deviceStepsAtDepart: number | null;
}

export interface ActivityMeta {
  memberId: string;
  deviceSteps: number | null;
  label: string;
}

export interface ActivityResult {
  snapshot: ActivitySnapshot;
  segment: TripSegment | null;
  visit: PlaceVisit | null;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function blankMeters(): Record<TravelMode, number> {
  return { walk: 0, bike: 0, car: 0, plane: 0 };
}

function rid(prefix: string, at: number): string {
  const raw = `${prefix}-${Math.abs(Math.trunc(at)).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
}

export function seoulDayKey(at: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}

export function pointsOnSeoulDay<T extends { at: number }>(points: T[] | null | undefined, now: number): T[] {
  const day = seoulDayKey(now);
  return (points ?? []).filter((point) => seoulDayKey(point.at) === day);
}

export function classifySpeedMps(speedMps: number): MoveMode {
  if (!Number.isFinite(speedMps) || speedMps < 0.5) return 'still';
  if (speedMps < 2.1) return 'walk';
  if (speedMps < 7) return 'bike';
  if (speedMps < 44.4) return 'car';
  return 'plane';
}

export function modeLabel(mode: MoveMode | null | undefined): string {
  if (mode === 'walk') return '도보';
  if (mode === 'bike') return '자전거';
  if (mode === 'car') return '차량';
  if (mode === 'plane') return '비행기';
  if (mode === 'still') return '머무름';
  return '이동';
}

export function estimateSteps(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 0;
  return Math.round(distanceM / STEP_METERS);
}

export function resolveSteps(
  mode: TravelMode,
  distanceM: number,
  deviceStepsNow: number | null,
  deviceStepsAtDepart: number | null,
): { steps: number | null; stepsSource: StepSource | null } {
  if (mode !== 'walk') return { steps: null, stepsSource: null };
  const estimate = estimateSteps(distanceM);
  if (deviceStepsNow != null && deviceStepsAtDepart != null) {
    const delta = deviceStepsNow - deviceStepsAtDepart;
    const maxSane = estimate * 4 + 80;
    const minSane = estimate < 50 ? 0 : estimate * 0.15;
    if (delta >= 0 && delta <= maxSane && delta >= minSane) {
      return { steps: Math.round(delta), stepsSource: 'device' };
    }
  }
  return { steps: estimate, stepsSource: 'estimate' };
}

export function formatClockSeoul(at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SEOUL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));
}

export function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  if (minutes > 0) return `${minutes}분`;
  return `${seconds}초`;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  if (km >= 100) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}

export function formatRange(startAt: number, endAt: number): string {
  return `${formatClockSeoul(startAt)} ~ ${formatClockSeoul(endAt)} (${formatDuration(endAt - startAt)})`;
}

export function freshnessLabel(at: number, now: number): string {
  if (!Number.isFinite(at) || now - at > 2 * 60 * 1000) return formatClockSeoul(at);
  return '지금';
}

export function isFreshFix(fixAt: number, now: number): boolean {
  return fixAt <= now + 60_000 && now - fixAt <= 25_000;
}

export function judgeTrackFix(
  previous: { lat: number; lng: number; at: number } | null,
  fix: FixSample,
): { ok: boolean; reason: string; heartbeat: boolean; lat: number; lng: number; speedMps: number | null } {
  const accuracy = Number.isFinite(fix.accuracyM) && fix.accuracyM > 0 ? fix.accuracyM : 50;
  if (accuracy > 250) {
    return { ok: false, reason: 'accuracy', heartbeat: false, lat: fix.lat, lng: fix.lng, speedMps: null };
  }
  if (!previous) {
    return { ok: true, reason: 'first', heartbeat: false, lat: fix.lat, lng: fix.lng, speedMps: fix.speedMps };
  }
  const distance = haversineMeters(previous, fix);
  const dt = (fix.at - previous.at) / 1000;
  if (dt > 0 && distance / dt > 320) {
    return { ok: false, reason: 'jump', heartbeat: false, lat: previous.lat, lng: previous.lng, speedMps: null };
  }
  const jitter = distance < 12 || (accuracy > 80 && distance < accuracy);
  if (jitter) {
    return { ok: true, reason: 'jitter', heartbeat: true, lat: previous.lat, lng: previous.lng, speedMps: 0 };
  }
  const speed = dt > 0 ? distance / dt : 0;
  return { ok: true, reason: 'move', heartbeat: false, lat: fix.lat, lng: fix.lng, speedMps: speed };
}

/** 같은 좌표라도 더 새로운 시각이면 관리자 카드의 갱신 시각을 올린다. */
export function placeUpdateKind(
  member: { lat: number | null; lng: number | null; updatedAt: number; battery: number | null; moveMode: string | null },
  place: { lat: number; lng: number; at: number; battery: number | null; mode: string | null },
): 'ignore' | 'touch' | 'move' {
  if (member.lat == null || member.lng == null) return 'move';
  if (place.at < member.updatedAt) return 'ignore';
  const sameSpot = member.lat === place.lat && member.lng === place.lng;
  if (!sameSpot) return 'move';
  if (place.at === member.updatedAt && member.battery === place.battery && member.moveMode === place.mode) return 'ignore';
  return 'touch';
}

function dominantMode(meters: Record<TravelMode, number>): TravelMode {
  let best: TravelMode = 'walk';
  let score = -1;
  for (const mode of ['walk', 'bike', 'car', 'plane'] as const) {
    if (meters[mode] > score) {
      score = meters[mode];
      best = mode;
    }
  }
  return best;
}

function createSnapshot(fix: FixSample): ActivitySnapshot {
  return {
    phase: 'settling',
    dwellLat: fix.lat,
    dwellLng: fix.lng,
    dwellSince: fix.at,
    lastLat: fix.lat,
    lastLng: fix.lng,
    lastAt: fix.at,
    departLat: fix.lat,
    departLng: fix.lng,
    departAt: fix.at,
    distanceM: 0,
    modeMeters: blankMeters(),
    topSpeedMps: 0,
    path: [{ lat: fix.lat, lng: fix.lng, at: fix.at }],
    openVisit: null,
    deviceStepsAtDepart: null,
  };
}

function finishTrip(snapshot: ActivitySnapshot, meta: ActivityMeta): { snapshot: ActivitySnapshot; segment: TripSegment | null } {
  let segment: TripSegment | null = null;
  if (snapshot.phase === 'moving' && snapshot.distanceM >= MIN_TRIP_M) {
    const mode = dominantMode(snapshot.modeMeters);
    const steps = resolveSteps(mode, snapshot.distanceM, meta.deviceSteps, snapshot.deviceStepsAtDepart);
    const path = snapshot.path.length > 0 ? snapshot.path.slice(-40) : [{ lat: snapshot.departLat, lng: snapshot.departLng, at: snapshot.departAt }];
    segment = {
      id: rid('s', snapshot.departAt),
      memberId: meta.memberId,
      startAt: snapshot.departAt,
      endAt: snapshot.dwellSince,
      startLat: snapshot.departLat,
      startLng: snapshot.departLng,
      endLat: snapshot.dwellLat,
      endLng: snapshot.dwellLng,
      distanceM: Math.round(snapshot.distanceM),
      mode,
      steps: steps.steps,
      stepsSource: steps.stepsSource,
      topSpeedMps: Math.round(snapshot.topSpeedMps * 100) / 100,
      path,
    };
  }
  return {
    segment,
    snapshot: {
      ...snapshot,
      phase: 'stopped',
      distanceM: 0,
      modeMeters: blankMeters(),
      topSpeedMps: 0,
      path: [],
      deviceStepsAtDepart: null,
    },
  };
}

export function stepActivity(snapshot: ActivitySnapshot | null, fix: FixSample, meta: ActivityMeta): ActivityResult {
  if (!snapshot) return { snapshot: createSnapshot(fix), segment: null, visit: null };
  const dist = haversineMeters({ lat: snapshot.dwellLat, lng: snapshot.dwellLng }, fix);
  if (dist <= STOP_RADIUS_M) {
    let next: ActivitySnapshot = { ...snapshot, lastLat: fix.lat, lastLng: fix.lng, lastAt: fix.at };
    let segment: TripSegment | null = null;
    let visit: PlaceVisit | null = null;
    if (next.phase !== 'stopped' && fix.at - next.dwellSince >= STOP_HOLD_MS) {
      const closed = finishTrip(next, meta);
      segment = closed.segment;
      next = closed.snapshot;
      if (!next.openVisit) {
        visit = {
          id: rid('v', next.dwellSince),
          memberId: meta.memberId,
          lat: next.dwellLat,
          lng: next.dwellLng,
          startedAt: next.dwellSince,
          endedAt: null,
          label: meta.label.slice(0, 40) || '머문 곳',
        };
        next = { ...next, openVisit: visit };
      }
    }
    return { snapshot: next, segment, visit };
  }

  let visit: PlaceVisit | null = null;
  let next = snapshot;
  if (next.openVisit && next.openVisit.endedAt == null) {
    visit = { ...next.openVisit, endedAt: fix.at };
    next = { ...next, openVisit: null };
  }
  const starting = next.phase !== 'moving';
  const hop = dist;
  const dt = Math.max(1, (fix.at - next.dwellSince) / 1000);
  const speed = hop / dt;
  let mode = classifySpeedMps(speed);
  if (mode === 'plane' && fix.accuracyM > 40) mode = 'car';
  const modeMeters = starting ? blankMeters() : { ...next.modeMeters };
  if (mode !== 'still') modeMeters[mode] += hop;
  const departLat = starting ? next.dwellLat : next.departLat;
  const departLng = starting ? next.dwellLng : next.departLng;
  const departAt = starting ? next.dwellSince : next.departAt;
  const pathStart = starting ? [{ lat: departLat, lng: departLng, at: departAt }] : next.path.slice();
  const last = pathStart[pathStart.length - 1];
  const path = !last || haversineMeters(last, fix) >= 12 ? [...pathStart, { lat: fix.lat, lng: fix.lng, at: fix.at }].slice(-60) : pathStart;
  return {
    visit,
    segment: null,
    snapshot: {
      ...next,
      phase: 'moving',
      dwellLat: fix.lat,
      dwellLng: fix.lng,
      dwellSince: fix.at,
      lastLat: fix.lat,
      lastLng: fix.lng,
      lastAt: fix.at,
      departLat,
      departLng,
      departAt,
      deviceStepsAtDepart: starting ? meta.deviceSteps : next.deviceStepsAtDepart,
      distanceM: (starting ? 0 : next.distanceM) + hop,
      modeMeters,
      topSpeedMps: Math.max(starting ? 0 : next.topSpeedMps, speed),
      path,
      openVisit: null,
    },
  };
}

export function simplifyPath<T extends { lat: number; lng: number }>(points: T[], max: number): T[] {
  if (points.length <= max || max < 2) return points.slice(0, Math.max(0, max));
  const out: T[] = [];
  const last = points.length - 1;
  for (let index = 0; index < max; index += 1) {
    const cursor = Math.round((index * last) / (max - 1));
    const point = points[cursor];
    if (!point) continue;
    if (out[out.length - 1] !== point) out.push(point);
  }
  return out;
}

export function openTripPreview(snapshot: ActivitySnapshot | null, memberId: string, now: number): TripSegment | null {
  if (!snapshot || snapshot.phase !== 'moving' || snapshot.distanceM < 40) return null;
  const mode = dominantMode(snapshot.modeMeters);
  const steps = resolveSteps(mode, snapshot.distanceM, null, snapshot.deviceStepsAtDepart);
  return {
    id: 'open',
    memberId,
    startAt: snapshot.departAt,
    endAt: now,
    startLat: snapshot.departLat,
    startLng: snapshot.departLng,
    endLat: snapshot.dwellLat,
    endLng: snapshot.dwellLng,
    distanceM: Math.round(snapshot.distanceM),
    mode,
    steps: steps.steps,
    stepsSource: steps.stepsSource,
    topSpeedMps: Math.round(snapshot.topSpeedMps * 100) / 100,
    path: snapshot.path.slice(-40),
    provisional: true,
  };
}

export function latestTodaySegment(segments: TripSegment[], memberId: string, now: number): TripSegment | null {
  const day = seoulDayKey(now);
  let best: TripSegment | null = null;
  for (const segment of segments) {
    if (segment.memberId !== memberId || segment.provisional) continue;
    if (seoulDayKey(segment.endAt) !== day && seoulDayKey(segment.startAt) !== day) continue;
    if (!best || segment.endAt > best.endAt) best = segment;
  }
  return best;
}

export function summarizeTrips(segments: TripSegment[]): {
  distanceM: number;
  durationMs: number;
  topSpeedMps: number;
  byMode: Record<TravelMode, number>;
} {
  const byMode = blankMeters();
  let distanceM = 0;
  let durationMs = 0;
  let topSpeedMps = 0;
  for (const segment of segments) {
    if (segment.provisional) continue;
    distanceM += segment.distanceM;
    durationMs += Math.max(0, segment.endAt - segment.startAt);
    topSpeedMps = Math.max(topSpeedMps, segment.topSpeedMps);
    byMode[segment.mode] += segment.distanceM;
  }
  return { distanceM, durationMs, topSpeedMps, byMode };
}

export function mergeSegments(existing: TripSegment[], incoming: TripSegment | null): TripSegment[] {
  if (!incoming || incoming.provisional) return existing;
  if (existing.some((item) => item.id === incoming.id)) return existing;
  return [...existing, incoming].sort((a, b) => a.startAt - b.startAt).slice(-40);
}

export function mergeVisits(existing: PlaceVisit[], incoming: PlaceVisit[]): PlaceVisit[] {
  const map = new Map(existing.map((visit) => [visit.id, visit]));
  for (const visit of incoming) map.set(visit.id, visit);
  return [...map.values()].sort((a, b) => a.startedAt - b.startedAt).slice(-40);
}

export function stepsCaption(segment: TripSegment): string | null {
  if (segment.steps == null || segment.mode !== 'walk') return null;
  if (segment.stepsSource === 'device') return `${segment.steps.toLocaleString('ko-KR')}걸음 · 기기 만보계`;
  return `약 ${segment.steps.toLocaleString('ko-KR')}걸음 · 거리로 추정`;
}
