export const STOP_RADIUS_M: number;
export const STOP_MIN_MS: number;
export const STRIDE_M: number;
export const TRAIL_POINT_CAP: number;
export const HISTORY_DAYS: number;
export const VISIT_DAY_CAP: number;
export const MODE_WALK_MAX_KMH: number;
export const MODE_BIKE_MAX_KMH: number;
export const MODE_PLANE_MIN_KMH: number;
export const MODE_PLANE_MIN_DISTANCE_M: number;
export const MODE_PLANE_MIN_DURATION_MS: number;
export const FIX_STALE_MS: number;
export const FIX_PRECISE_ACCURACY_M: number;
export const FIX_APPROXIMATE_ACCURACY_M: number;
export const FIX_MAX_JUMP_MPS: number;
export const FIX_JUMP_WINDOW_MS: number;
export const TRAIL_POOR_ACCURACY_M: number;
export const TRAIL_STAY_SPEED_MPS: number;
export const TRAIL_STILL_CONFIRM_M: number;

export type TravelMode = 'walk' | 'bike' | 'vehicle' | 'plane';

export interface TrailSample {
  lat: number;
  lng: number;
  at: number;
  speedMps?: number | null;
  accuracyM?: number;
  staying?: boolean;
  stayEnd?: boolean;
}

export type TrailDecision = 'keep' | 'snap' | 'drop';

export interface DayStop {
  lat: number;
  lng: number;
  arrivedAt: number;
  leftAt: number | null;
}

export interface DaySegment {
  departAt: number;
  arriveAt: number;
  durationMs: number;
  distanceM: number;
  speedKmh: number;
  mode: TravelMode;
  steps: number | null;
  stepsEstimated: boolean;
  open: boolean;
}

export interface VisitRecord {
  arrivedAt: number;
  label?: string | null;
}

export interface AcceptedFix {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
  speedMps: number | null;
}

export function modeLabel(mode: TravelMode | string): string;
export function seoulDayKey(epochMs: number): string;
export function needsDailyWipe(storedDay: string | null | undefined, now: number): boolean;
export function trailMoveGate(last: TrailSample | null | undefined, point: TrailSample | null | undefined): number;
export function trailDecision(last: TrailSample | null | undefined, point: TrailSample | null | undefined): TrailDecision;
export function shouldKeepTrailPoint(last: TrailSample | null | undefined, point: TrailSample): boolean;
export function collapseStayTrail(points: TrailSample[] | null | undefined): TrailSample[];
export function visibleTrail(points: TrailSample[] | null | undefined): TrailSample[];
export function displayCoordinate<T extends TrailSample>(points: TrailSample[] | null | undefined, point: T): T;
export function settleTrailPoint(
  points: TrailSample[] | null | undefined,
  point: TrailSample,
  now: number,
): { points: TrailSample[]; lat: number | null; lng: number | null; decision: TrailDecision };
export function tracksForSeoulDay(tracks: Record<string, TrailSample[]> | null | undefined, now: number): Record<string, TrailSample[]>;
export function visitsForSeoulDay<T extends VisitRecord>(visits: Record<string, T[]> | null | undefined, now: number): Record<string, T[]>;
export function shiftDayKey(dayKey: string, deltaDays: number): string;
export function oldestHistoryDay(now: number): string;
export function isWithinHistory(epochMs: number, now: number): boolean;
export function historyDayKeys(now: number): string[];
export function historyDayLabel(dayKey: string, now: number): string;
export function seoulDayEndMs(dayKey: string): number;
export function trimMemberPoints(points: TrailSample[] | null | undefined, now: number): TrailSample[];
export function appendHistoryPoint(points: TrailSample[] | null | undefined, point: TrailSample, now: number): TrailSample[];
export function tracksWithinHistory(tracks: Record<string, TrailSample[]> | null | undefined, now: number): Record<string, TrailSample[]>;
export function visitsWithinHistory<T extends VisitRecord>(visits: Record<string, T[]> | null | undefined, now: number): Record<string, T[]>;
export function acceptFix(
  previous: { lat: number; lng: number; at: number } | null | undefined,
  reading: { lat?: number; lng?: number; accuracy?: number; at?: number; speedMps?: number | null } | null | undefined,
  options?: { precise?: boolean; now?: number },
): { ok: true; fix: AcceptedFix } | { ok: false; reason: 'coords' | 'stale' | 'accuracy' | 'jump' };
export function classifyMode(speedKmh: number, distanceM: number, durationMs: number): TravelMode;
export function estimateSteps(distanceM: number): number;
export function formatDurationMs(durationMs: number): string;
export function formatDistanceM(meters: number): string;
export function buildDayRecord(points: TrailSample[] | null | undefined, now: number): { stops: DayStop[]; segments: DaySegment[] };
