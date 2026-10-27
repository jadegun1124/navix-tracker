import React, { createContext, useContext, useEffect, useReducer } from 'react';
import {
  classifySpeedMps,
  mergeSegments,
  mergeVisits,
  placeUpdateKind,
  pointsOnSeoulDay,
  seoulDayKey,
  stepActivity,
  type ActivitySnapshot,
  type PlaceVisit,
  type TripSegment,
} from '../../lib/activity';
import { appendTrail, hasLocation, haversineMeters } from '../../lib/geo';
import type { SharedPlace } from '../../services/familyShare';
import { createKeyPart, isKeyPart, splitSyncToken } from '../../services/familySync';
import {
  DEFAULT_CENTER,
  REQUIRED_TERMS,
  type AppMode,
  type FamilyMessage,
  type FamilyNotice,
  type FamilyTab,
  type GuardianLink,
  type HomeZone,
  type LeaveAlert,
  type Member,
  type MoveMode,
  type PermissionState,
  type Profile,
  type Session,
  type ShareState,
  type Stage,
  type TrackPoint,
} from '../../types/family';

const STORAGE_KEY = 'umap_family_v1';
const SESSION_KEYS = [STORAGE_KEY, `${STORAGE_KEY}:admin`, `${STORAGE_KEY}:managed`] as const;

function storageKey(mode: AppMode | null): string {
  return mode ? `${STORAGE_KEY}:${mode}` : STORAGE_KEY;
}

function clearStoredSessions() {
  sessionStorage.removeItem(STORAGE_KEY);
  for (const key of SESSION_KEYS) {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}:at`);
  }
}

function newestStoredRaw(): string | null {
  const tab = sessionStorage.getItem(STORAGE_KEY);
  if (tab) return tab;
  let best: string | null = null;
  let bestAt = -1;
  for (const key of SESSION_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const at = Number(localStorage.getItem(`${key}:at`) || 0);
    if (at >= bestAt) {
      best = raw;
      bestAt = at;
    }
  }
  return best;
}

const EMPTY_TERMS: Record<string, boolean> = {
  terms: false,
  location: false,
  privacy: false,
  guardian: false,
  marketing: false,
  overseas: false,
};

const EMPTY_PERMISSIONS: PermissionState = {
  notifications: 'unknown',
  accuracy: 'precise',
  locationMode: 'unknown',
  motion: 'unknown',
  battery: 'unknown',
  completed: false,
};

function readInvite(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('invite');
}

function cleanSyncToken(value: unknown): string | null {
  return typeof value === 'string' && splitSyncToken(value) ? value : null;
}

function takeSyncTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('sync')) return null;
  const token = cleanSyncToken(params.get('sync'));
  const url = new URL(window.location.href);
  url.searchParams.delete('sync');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  return token;
}

function shouldReset(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('reset') === '1';
}

function fresh(stage: Stage = 'splash'): Session {
  return {
    stage,
    profile: null,
    survey: null,
    terms: { ...EMPTY_TERMS },
    phone: '',
    permissions: { ...EMPTY_PERMISSIONS },
    members: [],
    tracks: {},
    home: null,
    inviteCode: String(10000 + Math.floor(Math.random() * 90000)),
    notices: [],
    tab: 'map',
    pendingInvite: readInvite(),
    mode: null,
    guardians: [],
    pendingLeaveAlert: readLeaveAlert(),
    syncWriteKey: createKeyPart(),
    syncReadKey: createKeyPart(),
    pendingSyncToken: null,
    segments: [],
    visits: [],
    messages: [],
    activity: null,
    deviceId: createKeyPart().replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'device',
    trailDay: seoulDayKey(Date.now()),
    chatReadAt: {},
  };
}

function readLeaveAlert(): LeaveAlert | null {
  if (typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  const lat = Number(query.get('homeLat'));
  const lng = Number(query.get('homeLng'));
  const radiusM = Number(query.get('homeRadius'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusM)) return null;
  return {
    label: (query.get('homeLabel') || '우리 집').slice(0, 40),
    lat,
    lng,
    radiusM: Math.min(2000, Math.max(50, Math.round(radiusM))),
  };
}

function cleanHome(value: unknown): HomeZone | null {
  if (!value || typeof value !== 'object') return null;
  const home = value as HomeZone;
  if (!Number.isFinite(home.lat) || !Number.isFinite(home.lng)) return null;
  const radius = Number(home.radiusM);
  return {
    label: home.label || '우리 집',
    address: home.address || '',
    lat: home.lat,
    lng: home.lng,
    radiusM: Number.isFinite(radius) ? Math.min(2000, Math.max(50, Math.round(radius))) : 200,
    alertPhone: typeof home.alertPhone === 'string' ? home.alertPhone.replace(/[^\d+]/g, '').slice(0, 16) : '',
  };
}

function cleanLeaveAlert(value: unknown): LeaveAlert | null {
  if (!value || typeof value !== 'object') return null;
  const alert = value as LeaveAlert;
  if (!Number.isFinite(alert.lat) || !Number.isFinite(alert.lng) || !Number.isFinite(alert.radiusM)) return null;
  return {
    label: alert.label || '우리 집',
    lat: alert.lat,
    lng: alert.lng,
    radiusM: Math.min(2000, Math.max(50, Math.round(alert.radiusM))),
  };
}

function membersFor(profile: Profile): Member[] {
  return [
    {
      id: 'self',
      name: profile.name,
      role: 'self',
      lat: null,
      lng: null,
      accuracyM: 0,
      battery: null,
      moveMode: null,
      speedMps: null,
      updatedAt: Date.now(),
      moving: null,
      share: 'allowed',
    },
  ];
}

function isSeedLocation(lat: number, lng: number): boolean {
  return Math.abs(lat - DEFAULT_CENTER.lat) < 1e-8 && Math.abs(lng - DEFAULT_CENTER.lng) < 1e-8;
}

function isPoint(value: unknown): value is TrackPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as TrackPoint;
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Number.isFinite(point.at);
}

function cleanTracks(value: unknown, now = Date.now()): Record<string, TrackPoint[]> {
  if (!value || typeof value !== 'object') return {};
  const day = seoulDayKey(now);
  const tracks: Record<string, TrackPoint[]> = {};
  for (const [id, points] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(points)) continue;
    const clean = points.filter(isPoint).filter((point) => seoulDayKey(point.at) === day).slice(-300);
    if (clean.length > 0) tracks[id] = clean;
  }
  return tracks;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asMoveMode(value: unknown): MoveMode | null {
  if (value === 'walk' || value === 'bike' || value === 'car' || value === 'plane' || value === 'still') return value;
  return null;
}

function withMove(member: Member): Member {
  const battery = typeof member.battery === 'number' && member.battery >= 0 && member.battery <= 100 ? Math.round(member.battery) : null;
  const speedMps = typeof member.speedMps === 'number' && Number.isFinite(member.speedMps) ? member.speedMps : null;
  return { ...member, battery, moveMode: asMoveMode(member.moveMode), speedMps };
}

function cleanSegment(value: unknown): TripSegment | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as TripSegment;
  if (typeof item.id !== 'string' || (item.mode !== 'walk' && item.mode !== 'bike' && item.mode !== 'car' && item.mode !== 'plane')) return null;
  if (!Number.isFinite(item.startAt) || !Number.isFinite(item.endAt) || !Number.isFinite(item.distanceM)) return null;
  if (!Number.isFinite(item.startLat) || !Number.isFinite(item.startLng) || !Number.isFinite(item.endLat) || !Number.isFinite(item.endLng)) return null;
  return {
    id: item.id.slice(0, 80),
    memberId: typeof item.memberId === 'string' ? item.memberId : 'self',
    startAt: item.startAt,
    endAt: item.endAt,
    startLat: item.startLat,
    startLng: item.startLng,
    endLat: item.endLat,
    endLng: item.endLng,
    distanceM: item.distanceM,
    mode: item.mode,
    steps: typeof item.steps === 'number' ? item.steps : null,
    stepsSource: item.stepsSource === 'device' || item.stepsSource === 'estimate' ? item.stepsSource : null,
    topSpeedMps: finite(item.topSpeedMps),
    path: Array.isArray(item.path) ? item.path.filter(isPoint).slice(-40) : [],
  };
}

function cleanVisit(value: unknown): PlaceVisit | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as PlaceVisit;
  if (typeof item.id !== 'string' || typeof item.label !== 'string') return null;
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng) || !Number.isFinite(item.startedAt)) return null;
  if (item.endedAt != null && !Number.isFinite(item.endedAt)) return null;
  return {
    id: item.id.slice(0, 80),
    memberId: typeof item.memberId === 'string' ? item.memberId : 'self',
    lat: item.lat,
    lng: item.lng,
    startedAt: item.startedAt,
    endedAt: item.endedAt ?? null,
    label: item.label.slice(0, 40),
  };
}

function cleanMessage(value: unknown): FamilyMessage | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as FamilyMessage;
  if (typeof item.id !== 'string' || typeof item.body !== 'string' || !Number.isFinite(item.at)) return null;
  const code = typeof item.code === 'string' ? item.code.replace(/\D/g, '').slice(0, 6) : '';
  const body = item.body.trim().slice(0, 500);
  if (code.length < 4 || !body) return null;
  return {
    id: item.id.slice(0, 80),
    code,
    from: (typeof item.from === 'string' && item.from.trim() ? item.from : '가족').slice(0, 80),
    fromId: (typeof item.fromId === 'string' && item.fromId.trim() ? item.fromId : 'member').replace(/[^\w.:@-]/g, '').slice(0, 80) || 'member',
    body,
    at: item.at,
  };
}

function cleanActivity(value: unknown): ActivitySnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as ActivitySnapshot;
  if (item.phase !== 'settling' && item.phase !== 'moving' && item.phase !== 'stopped') return null;
  if (!Number.isFinite(item.dwellLat) || !Number.isFinite(item.dwellLng) || !Number.isFinite(item.dwellSince)) return null;
  const meters = item.modeMeters ?? { walk: 0, bike: 0, car: 0, plane: 0 };
  return {
    phase: item.phase,
    dwellLat: item.dwellLat,
    dwellLng: item.dwellLng,
    dwellSince: item.dwellSince,
    lastLat: finite(item.lastLat, item.dwellLat),
    lastLng: finite(item.lastLng, item.dwellLng),
    lastAt: finite(item.lastAt, item.dwellSince),
    departLat: finite(item.departLat, item.dwellLat),
    departLng: finite(item.departLng, item.dwellLng),
    departAt: finite(item.departAt, item.dwellSince),
    distanceM: Math.max(0, finite(item.distanceM)),
    modeMeters: {
      walk: Math.max(0, finite(meters.walk)),
      bike: Math.max(0, finite(meters.bike)),
      car: Math.max(0, finite(meters.car)),
      plane: Math.max(0, finite(meters.plane)),
    },
    topSpeedMps: Math.max(0, finite(item.topSpeedMps)),
    path: Array.isArray(item.path) ? item.path.filter(isPoint).slice(-60) : [],
    openVisit: cleanVisit(item.openVisit),
    deviceStepsAtDepart: typeof item.deviceStepsAtDepart === 'number' ? item.deviceStepsAtDepart : null,
  };
}

function listOf<T>(value: unknown, clean: (item: unknown) => T | null, max: number): T[] {
  if (!Array.isArray(value)) return [];
  const items: T[] = [];
  for (const item of value) {
    const next = clean(item);
    if (next) items.push(next);
  }
  return items.slice(-max);
}

function withToday(state: Session, at: number): Session {
  const day = seoulDayKey(at);
  const minAt = at - 8 * 24 * 60 * 60 * 1000;
  if (state.trailDay === day) return state;
  const tracks: Record<string, TrackPoint[]> = {};
  for (const [id, points] of Object.entries(state.tracks)) {
    const kept = points.filter((point) => seoulDayKey(point.at) === day);
    if (kept.length > 0) tracks[id] = kept;
  }
  return {
    ...state,
    trailDay: day,
    tracks,
    segments: state.segments.filter((segment) => segment.endAt >= minAt),
    visits: state.visits.filter((visit) => (visit.endedAt ?? visit.startedAt) >= minAt),
    messages: state.messages.filter((message) => message.at >= minAt),
  };
}

function segmentFromPlace(memberId: string, segment: SharedPlace['segment']): TripSegment | null {
  if (!segment) return null;
  return cleanSegment({
    ...segment,
    memberId,
    path: segment.path.map((point, index) => ({ ...point, at: index === 0 ? segment.startAt : segment.endAt })),
  });
}

function visitsFromPlace(memberId: string, visits: SharedPlace['visits']): PlaceVisit[] {
  return listOf(visits ?? [], (item) => cleanVisit(item && typeof item === 'object' ? { ...(item as object), memberId } : item), 8);
}

function asShare(value: unknown, self: boolean): ShareState {
  if (self) return 'allowed';
  if (value === 'accepted' || value === 'allowed' || value === 'revoked' || value === 'invited') return value;
  return 'invited';
}

function cleanGuardians(value: unknown): GuardianLink[] {
  if (!Array.isArray(value)) return [];
  const links: GuardianLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const link = item as GuardianLink;
    const code = typeof link.code === 'string' ? link.code.replace(/\D/g, '').slice(0, 6) : '';
    if (typeof link.id !== 'string' || code.length < 4) continue;
    const share = link.share === 'allowed' || link.share === 'revoked' ? link.share : 'accepted';
    const syncToken = cleanSyncToken(link.syncToken);
    links.push({
      id: link.id,
      label: (link.label || '관리자').slice(0, 20),
      code,
      share,
      leaveAlert: cleanLeaveAlert(link.leaveAlert),
      ...(syncToken ? { syncToken } : {}),
    });
  }
  return links;
}

function scrubSeed(member: Member, share: ShareState): Member {
  if (hasLocation(member) && isSeedLocation(member.lat, member.lng) && member.accuracyM === 18) {
    return { ...member, share, lat: null, lng: null };
  }
  return { ...member, share };
}

function withoutDemo(session: Session): Session {
  const previewAlias = session.profile?.preview && (session.profile.name === '부건' || session.profile.name === 'Bukeon');
  const profile = previewAlias && session.profile ? { ...session.profile, name: '나' } : session.profile;
  const members = session.members
    .filter((member) => member.id !== 'sample' && member.name !== '샘플' && member.role !== 'guardian' && !('isSample' in member && (member as { isSample?: boolean }).isSample))
    .map((member) => {
      const renamed = member.id === 'self' && previewAlias ? { ...member, name: '나' } : member;
      const share = asShare(renamed.share, renamed.id === 'self');
      if (renamed.id !== 'self' && share !== 'allowed') return withMove({ ...renamed, share, lat: null, lng: null });
      return withMove(scrubSeed(renamed, share));
    });
  const kept = new Set(members.filter((member) => member.id === 'self' || hasLocation(member)).map((member) => member.id));
  const tracks: Record<string, TrackPoint[]> = {};
  for (const [id, points] of Object.entries(session.tracks)) {
    if (!kept.has(id)) continue;
    const clean = points.filter((point) => !isSeedLocation(point.lat, point.lng));
    if (clean.length > 0) tracks[id] = clean;
  }
  const mode = session.mode === 'admin' || session.mode === 'managed' ? session.mode : null;
  return { ...session, profile, members, tracks, mode, guardians: cleanGuardians(session.guardians) };
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const session = value as Session;
  return typeof session.inviteCode === 'string' && Array.isArray(session.members) && !!session.permissions;
}

function load(): Session {
  const pendingSyncToken = takeSyncTokenFromUrl();
  if (shouldReset()) {
    clearStoredSessions();
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return { ...fresh(), pendingSyncToken };
  }
  try {
    const raw = newestStoredRaw();
    if (!raw) return { ...fresh(), pendingSyncToken };
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) return { ...fresh(), pendingSyncToken };
    const invite = readInvite();
    const base = fresh();
    const session: Session = {
      ...base,
      ...parsed,
      terms: { ...EMPTY_TERMS, ...parsed.terms },
      permissions: { ...EMPTY_PERMISSIONS, ...parsed.permissions },
      tracks: cleanTracks((parsed as Session).tracks),
      home: cleanHome(parsed.home),
      pendingInvite: invite || parsed.pendingInvite,
      mode: parsed.mode === 'admin' || parsed.mode === 'managed' ? parsed.mode : null,
      guardians: cleanGuardians(parsed.guardians),
      pendingLeaveAlert: readLeaveAlert() || cleanLeaveAlert(parsed.pendingLeaveAlert),
      syncWriteKey: isKeyPart(parsed.syncWriteKey) ? parsed.syncWriteKey : base.syncWriteKey,
      syncReadKey: isKeyPart(parsed.syncReadKey) ? parsed.syncReadKey : base.syncReadKey,
      pendingSyncToken: pendingSyncToken || cleanSyncToken(parsed.pendingSyncToken),
      segments: listOf(parsed.segments, cleanSegment, 40),
      visits: listOf(parsed.visits, cleanVisit, 40),
      messages: listOf(parsed.messages, cleanMessage, 80),
      activity: cleanActivity(parsed.activity),
      deviceId: typeof parsed.deviceId === 'string' && /^[A-Za-z0-9]{6,16}$/.test(parsed.deviceId) ? parsed.deviceId : base.deviceId,
      trailDay: typeof parsed.trailDay === 'string' ? parsed.trailDay : base.trailDay,
      chatReadAt: parsed.chatReadAt && typeof parsed.chatReadAt === 'object' ? Object.fromEntries(Object.entries(parsed.chatReadAt).filter((entry) => typeof entry[1] === 'number')) : {},
    };
    if (session.profile && session.permissions.completed) session.stage = session.mode ? 'map' : 'mode';
    return withToday(withoutDemo(session), Date.now());
  } catch {
    return { ...fresh(), pendingSyncToken };
  }
}

type Action =
  | { type: 'splash-done' }
  | { type: 'login'; profile: Profile }
  | { type: 'choose-mode'; mode: AppMode }
  | { type: 'reopen-mode' }
  | { type: 'close-mode' }
  | { type: 'skip-survey' }
  | { type: 'pick-survey'; id: string }
  | { type: 'back' }
  | { type: 'toggle-term'; id: string; value: boolean }
  | { type: 'toggle-all-terms'; on: boolean }
  | { type: 'continue-terms' }
  | { type: 'save-phone'; phone: string }
  | { type: 'skip-phone' }
  | { type: 'finish-permissions'; permissions: PermissionState }
  | { type: 'set-tab'; tab: FamilyTab }
  | { type: 'save-home'; home: HomeZone }
  | { type: 'clear-home' }
  | { type: 'add-member'; name: string; code: string }
  | { type: 'remove-member'; id: string }
  | { type: 'accept-invite'; label: string; code: string; syncToken: string | null }
  | { type: 'set-guardian-share'; code: string; share: 'allowed' | 'revoked' }
  | { type: 'leave-guardian'; id: string }
  | { type: 'dismiss-invite' }
  | { type: 'mark-alerts-read' }
  | { type: 'update-self'; fix: { lat: number; lng: number; accuracyM: number; at: number; speedMps: number | null; heartbeat: boolean; battery: number | null; deviceSteps: number | null } }
  | { type: 'apply-shared-place'; place: SharedPlace }
  | { type: 'ingest-message'; message: FamilyMessage }
  | { type: 'mark-chat-read'; code: string; at: number }
  | { type: 'set-location-mode'; locationMode: PermissionState['locationMode'] }
  | { type: 'roll-day'; at: number }
  | { type: 'set-motion'; moving: boolean }
  | { type: 'notice'; notice: FamilyNotice }
  | { type: 'logout' }
  | { type: 'revisit-permissions' };

function notice(title: string, body: string): FamilyNotice {
  return { id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, body, at: Date.now(), read: false };
}

function reducer(state: Session, action: Action): Session {
  switch (action.type) {
    case 'splash-done':
      if (!state.profile) return { ...state, stage: 'login' };
      if (!state.mode) return { ...state, stage: 'mode' };
      return { ...state, stage: state.permissions.completed ? 'map' : 'survey' };
    case 'login': {
      const members = state.members.length > 0
        ? state.members.map((member) => (member.id === 'self' ? { ...member, name: action.profile.name } : member))
        : membersFor(action.profile);
      return withoutDemo({ ...state, profile: action.profile, members, stage: state.mode ? (state.permissions.completed ? 'map' : 'survey') : 'mode' });
    }
    case 'choose-mode':
      return { ...state, mode: action.mode, stage: state.permissions.completed ? 'map' : 'survey' };
    case 'reopen-mode':
      return { ...state, stage: 'mode' };
    case 'close-mode':
      if (!state.mode) return state;
      return { ...state, stage: state.permissions.completed ? 'map' : 'survey' };
    case 'skip-survey':
      return { ...state, stage: 'terms' };
    case 'pick-survey':
      return { ...state, survey: action.id, stage: 'terms' };
    case 'back': {
      const order: Stage[] = ['login', 'mode', 'survey', 'terms', 'phone', 'permissions'];
      const index = order.indexOf(state.stage);
      if (index <= 0) return state;
      return { ...state, stage: order[index - 1] };
    }
    case 'toggle-term':
      return { ...state, terms: { ...state.terms, [action.id]: action.value } };
    case 'toggle-all-terms':
      return {
        ...state,
        terms: Object.fromEntries(Object.keys(EMPTY_TERMS).map((id) => [id, action.on])),
      };
    case 'continue-terms':
      if (!REQUIRED_TERMS.every((id) => state.terms[id])) return state;
      return { ...state, stage: 'phone' };
    case 'save-phone':
      return { ...state, phone: action.phone.trim(), stage: 'permissions' };
    case 'skip-phone':
      return { ...state, stage: 'permissions' };
    case 'finish-permissions':
      return { ...state, permissions: { ...action.permissions, completed: true }, stage: 'map', tab: 'map' };
    case 'set-tab':
      return { ...state, tab: action.tab };
    case 'save-home': {
      const created = notice(
        '우리 집을 저장했습니다',
        `반경 ${action.home.radiusM}m입니다. 위치 공유를 허용한 피관리자가 이 원을 나가면 관리자 화면에 사이렌이 울립니다. 피관리자 폰에서는 울리지 않습니다.`,
      );
      return {
        ...state,
        home: { ...action.home, alertPhone: '' },
        phone: state.phone,
        notices: [created, ...state.notices],
        tab: 'map',
      };
    }
    case 'clear-home':
      return { ...state, home: null };
    case 'add-member': {
      if (state.mode !== 'admin') return state;
      const name = action.name.trim();
      if (name.length < 1) return state;
      const member: Member = {
        id: `m-${Date.now()}`,
        name,
        role: 'child',
        lat: null,
        lng: null,
        accuracyM: 0,
        battery: null,
        moveMode: null,
        speedMps: null,
        updatedAt: Date.now(),
        moving: null,
        inviteCode: action.code,
        share: 'invited',
      };
      return {
        ...state,
        members: [...state.members, member],
        notices: [notice('초대를 만들었습니다', `${member.name} 님은 자기 폰에서 코드를 수락한 뒤, 위치 공유를 따로 허용해야 지도에 나타납니다.`), ...state.notices],
      };
    }
    case 'remove-member': {
      if (state.mode !== 'admin' || action.id === 'self') return state;
      const removed = state.members.find((member) => member.id === action.id);
      if (!removed) return state;
      const tracks = { ...state.tracks };
      delete tracks[action.id];
      return {
        ...state,
        members: state.members.filter((member) => member.id !== action.id),
        tracks,
        notices: [notice('가족을 지웠습니다', `${removed.name} 님을 이 기기의 목록과 지도에서 뺐습니다.`), ...state.notices],
      };
    }
    case 'accept-invite': {
      if (state.mode !== 'managed') return state;
      const code = action.code.replace(/\D/g, '').slice(0, 6);
      const label = action.label.trim().slice(0, 20) || '관리자';
      if (code.length < 4) return state;
      if (state.guardians.some((link) => link.code === code)) return state;
      const leaveAlert = state.pendingInvite === code || readInvite() === code ? state.pendingLeaveAlert : null;
      const syncToken = cleanSyncToken(action.syncToken) || (state.pendingInvite === code ? cleanSyncToken(state.pendingSyncToken) : null);
      const link: GuardianLink = { id: `g-${Date.now()}`, label, code, share: 'accepted', leaveAlert, ...(syncToken ? { syncToken } : {}) };
      const alertNote = leaveAlert ? ` 위치 공유를 허용한 뒤 집 반경 ${leaveAlert.radiusM}m를 나가면 관리자 화면에 사이렌이 울립니다. 이 폰에서는 울리지 않습니다.` : '';
      return {
        ...state,
        guardians: [...state.guardians, link],
        pendingInvite: null,
        pendingLeaveAlert: null,
        pendingSyncToken: null,
        notices: [notice('초대를 수락했습니다', `${label} 님의 가족으로 참여했습니다. 위치를 보내려면 다음 화면에서 따로 허용하세요.${alertNote}`), ...state.notices],
      };
    }
    case 'set-guardian-share': {
      if (state.mode !== 'managed') return state;
      const current = state.guardians.find((link) => link.code === action.code);
      if (!current || current.share === action.share) return state;
      const guardians = state.guardians.map((link) => (link.code === action.code ? { ...link, share: action.share } : link));
      const zoneNote = action.share === 'allowed' && current.leaveAlert
        ? ` ${current.leaveAlert.label} 반경 ${current.leaveAlert.radiusM}m를 나가면 관리자 화면에만 사이렌이 울립니다.`
        : '';
      const body = action.share === 'allowed'
        ? `${current.label} 님에게 내 위치 공유를 허용했습니다. 끄기 전에는 이 폰에서 공유 상태가 유지됩니다.${zoneNote}`
        : `${current.label} 님에게 보내던 위치 공유를 껐습니다. 집 이탈 알림도 함께 멈춥니다.`;
      return {
        ...state,
        guardians,
        notices: [notice(action.share === 'allowed' ? '위치 공유를 허용했습니다' : '위치 공유를 껐습니다', body), ...state.notices],
      };
    }
    case 'leave-guardian': {
      if (state.mode !== 'managed') return state;
      const current = state.guardians.find((link) => link.id === action.id);
      if (!current) return state;
      return {
        ...state,
        guardians: state.guardians.filter((link) => link.id !== action.id),
        notices: [notice('연결을 끊었습니다', `${current.label} 님과의 초대와 위치 공유를 이 폰에서 지웠습니다.`), ...state.notices],
      };
    }
    case 'dismiss-invite':
      return { ...state, pendingInvite: null };
    case 'mark-alerts-read':
      return { ...state, notices: state.notices.map((item) => ({ ...item, read: true })) };
    case 'update-self': {
      const fix = action.fix;
      const rolled = withToday(state, fix.at);
      const home = rolled.home;
      const insideHome = home != null && haversineMeters(fix, home) <= home.radiusM;
      const speed = fix.speedMps ?? 0;
      const moveMode = fix.heartbeat || speed < 0.5 ? 'still' : classifySpeedMps(speed);
      const stepped = stepActivity(rolled.activity, {
        lat: fix.lat,
        lng: fix.lng,
        at: fix.at,
        accuracyM: fix.accuracyM,
        speedMps: fix.speedMps,
      }, {
        memberId: 'self',
        deviceSteps: fix.deviceSteps,
        label: home && insideHome ? home.label : '머문 곳',
      });
      const tracks = { ...rolled.tracks };
      if (!fix.heartbeat) tracks.self = appendTrail(pointsOnSeoulDay(tracks.self, fix.at), { lat: fix.lat, lng: fix.lng, at: fix.at });
      return {
        ...rolled,
        activity: stepped.snapshot,
        segments: mergeSegments(rolled.segments, stepped.segment),
        visits: stepped.visit ? mergeVisits(rolled.visits, [stepped.visit]) : rolled.visits,
        members: rolled.members.map((member) =>
          member.id === 'self'
            ? {
                ...member,
                lat: fix.lat,
                lng: fix.lng,
                accuracyM: Math.max(1, Math.round(fix.accuracyM)),
                battery: fix.battery == null ? member.battery : fix.battery,
                moveMode,
                speedMps: fix.speedMps,
                updatedAt: fix.at,
                moving: moveMode !== 'still',
              }
            : member,
        ),
        tracks,
      };
    }
    case 'apply-shared-place': {
      if (state.mode !== 'admin') return state;
      const place = action.place;
      const rolled = withToday(state, Number.isFinite(place.at) ? place.at : Date.now());
      const children = rolled.members.filter((member) => member.id !== 'self' && member.role !== 'guardian' && member.inviteCode === place.code);
      const member = children.find((item) => item.name === place.name) ?? (children.length === 1 ? children[0] : undefined);
      if (!member) return rolled === state ? state : rolled;
      if (!place.sharing) {
        if (member.share !== 'allowed' && !hasLocation(member)) return rolled === state ? state : rolled;
        const tracks = { ...rolled.tracks };
        delete tracks[member.id];
        return {
          ...rolled,
          members: rolled.members.map((item) => (item.id === member.id ? { ...item, share: 'revoked', lat: null, lng: null, battery: null, moveMode: null, speedMps: null, updatedAt: place.at } : item)),
          tracks,
          segments: rolled.segments.filter((segment) => segment.memberId !== member.id),
          visits: rolled.visits.filter((visit) => visit.memberId !== member.id),
        };
      }
      if (place.lat == null || place.lng == null || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
        if (member.share === 'allowed' && !hasLocation(member)) return rolled === state ? state : rolled;
        return {
          ...rolled,
          members: rolled.members.map((item) => (item.id === member.id ? { ...item, share: 'allowed', lat: null, lng: null } : item)),
        };
      }
      if (isSeedLocation(place.lat, place.lng) && place.accuracyM === 18) return rolled === state ? state : rolled;
      const battery = Object.prototype.hasOwnProperty.call(place, 'battery') ? (typeof place.battery === 'number' ? place.battery : null) : member.battery;
      const moveMode = Object.prototype.hasOwnProperty.call(place, 'mode') ? asMoveMode(place.mode) : member.moveMode;
      const speedMps = Object.prototype.hasOwnProperty.call(place, 'speedMps') ? (typeof place.speedMps === 'number' ? place.speedMps : null) : member.speedMps;
      const kind = placeUpdateKind(member, { lat: place.lat, lng: place.lng, at: place.at, battery, mode: moveMode });
      if (kind === 'ignore') return rolled === state ? state : rolled;
      const segment = Object.prototype.hasOwnProperty.call(place, 'segment') ? segmentFromPlace(member.id, place.segment) : null;
      const visits = Object.prototype.hasOwnProperty.call(place, 'visits') ? visitsFromPlace(member.id, place.visits) : [];
      return {
        ...rolled,
        segments: mergeSegments(rolled.segments, segment),
        visits: visits.length > 0 ? mergeVisits(rolled.visits, visits) : rolled.visits,
        members: rolled.members.map((item) =>
          item.id === member.id
            ? {
                ...item,
                share: 'allowed',
                lat: place.lat,
                lng: place.lng,
                accuracyM: Math.max(1, Math.round(place.accuracyM || item.accuracyM || 1)),
                battery,
                moveMode,
                speedMps,
                updatedAt: place.at,
                moving: moveMode != null && moveMode !== 'still',
              }
            : item,
        ),
        tracks: kind === 'move'
          ? {
              ...rolled.tracks,
              [member.id]: appendTrail(pointsOnSeoulDay(rolled.tracks[member.id], place.at), { lat: place.lat, lng: place.lng, at: place.at }),
            }
          : rolled.tracks,
      };
    }
    case 'ingest-message': {
      if (state.messages.some((item) => item.id === action.message.id)) return state;
      return { ...state, messages: [...state.messages, action.message].sort((left, right) => left.at - right.at).slice(-80) };
    }
    case 'mark-chat-read':
      return { ...state, chatReadAt: { ...state.chatReadAt, [action.code]: action.at } };
    case 'set-location-mode':
      return { ...state, permissions: { ...state.permissions, locationMode: action.locationMode } };
    case 'roll-day':
      return withToday(state, action.at);
    case 'set-motion':
      return {
        ...state,
        members: state.members.map((member) => (member.id === 'self' ? { ...member, moving: action.moving } : member)),
      };
    case 'notice':
      return { ...state, notices: [action.notice, ...state.notices].slice(0, 40) };
    case 'logout':
      return fresh('login');
    case 'revisit-permissions':
      return { ...state, stage: 'permissions' };
    default:
      return state;
  }
}

interface FamilyApi {
  state: Session;
  splashDone: () => void;
  login: (profile: Profile) => void;
  chooseMode: (mode: AppMode) => void;
  reopenMode: () => void;
  closeMode: () => void;
  skipSurvey: () => void;
  pickSurvey: (id: string) => void;
  back: () => void;
  toggleTerm: (id: string, value: boolean) => void;
  toggleAllTerms: (on: boolean) => void;
  continueTerms: () => void;
  savePhone: (phone: string) => void;
  skipPhone: () => void;
  finishPermissions: (permissions: PermissionState) => void;
  setTab: (tab: FamilyTab) => void;
  saveHome: (home: HomeZone) => void;
  clearHome: () => void;
  addMember: (name: string, code: string) => void;
  removeMember: (id: string) => void;
  acceptInvite: (label: string, code: string, syncToken?: string | null) => void;
  setGuardianShare: (code: string, share: 'allowed' | 'revoked') => void;
  leaveGuardian: (id: string) => void;
  dismissInvite: () => void;
  markAlertsRead: () => void;
  updateSelf: (fix: { lat: number; lng: number; accuracyM: number; at: number; speedMps: number | null; heartbeat: boolean; battery: number | null; deviceSteps: number | null }) => void;
  ingestMessage: (message: FamilyMessage) => void;
  markChatRead: (code: string, at: number) => void;
  setLocationMode: (locationMode: PermissionState['locationMode']) => void;
  rollDay: (at: number) => void;
  applySharedPlace: (place: SharedPlace) => void;
  setMotion: (moving: boolean) => void;
  pushNotice: (title: string, body: string) => void;
  logout: () => void;
  revisitPermissions: () => void;
}

const FamilyContext = createContext<FamilyApi | null>(null);

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    const raw = JSON.stringify(state);
    const key = storageKey(state.mode);
    sessionStorage.setItem(STORAGE_KEY, raw);
    localStorage.setItem(key, raw);
    localStorage.setItem(`${key}:at`, String(Date.now()));
    if (!state.profile) {
      localStorage.removeItem(`${STORAGE_KEY}:admin`);
      localStorage.removeItem(`${STORAGE_KEY}:managed`);
      localStorage.removeItem(`${STORAGE_KEY}:admin:at`);
      localStorage.removeItem(`${STORAGE_KEY}:managed:at`);
    }
  }, [state]);

  const api: FamilyApi = {
    state,
    splashDone: () => dispatch({ type: 'splash-done' }),
    login: (profile) => dispatch({ type: 'login', profile }),
    chooseMode: (mode) => dispatch({ type: 'choose-mode', mode }),
    reopenMode: () => dispatch({ type: 'reopen-mode' }),
    closeMode: () => dispatch({ type: 'close-mode' }),
    skipSurvey: () => dispatch({ type: 'skip-survey' }),
    pickSurvey: (id) => dispatch({ type: 'pick-survey', id }),
    back: () => dispatch({ type: 'back' }),
    toggleTerm: (id, value) => dispatch({ type: 'toggle-term', id, value }),
    toggleAllTerms: (on) => dispatch({ type: 'toggle-all-terms', on }),
    continueTerms: () => dispatch({ type: 'continue-terms' }),
    savePhone: (phone) => dispatch({ type: 'save-phone', phone }),
    skipPhone: () => dispatch({ type: 'skip-phone' }),
    finishPermissions: (permissions) => dispatch({ type: 'finish-permissions', permissions }),
    setTab: (tab) => dispatch({ type: 'set-tab', tab }),
    saveHome: (home) => dispatch({ type: 'save-home', home }),
    clearHome: () => dispatch({ type: 'clear-home' }),
    addMember: (name, code) => dispatch({ type: 'add-member', name, code }),
    removeMember: (id) => dispatch({ type: 'remove-member', id }),
    acceptInvite: (label, code, syncToken) => dispatch({ type: 'accept-invite', label, code, syncToken: syncToken ?? null }),
    setGuardianShare: (code, share) => dispatch({ type: 'set-guardian-share', code, share }),
    leaveGuardian: (id) => dispatch({ type: 'leave-guardian', id }),
    dismissInvite: () => dispatch({ type: 'dismiss-invite' }),
    markAlertsRead: () => dispatch({ type: 'mark-alerts-read' }),
    updateSelf: (fix) => dispatch({ type: 'update-self', fix }),
    ingestMessage: (message) => dispatch({ type: 'ingest-message', message }),
    markChatRead: (code, at) => dispatch({ type: 'mark-chat-read', code, at }),
    setLocationMode: (locationMode) => dispatch({ type: 'set-location-mode', locationMode }),
    rollDay: (at) => dispatch({ type: 'roll-day', at }),
    applySharedPlace: (place) => dispatch({ type: 'apply-shared-place', place }),
    setMotion: (moving) => dispatch({ type: 'set-motion', moving }),
    pushNotice: (title, body) => dispatch({ type: 'notice', notice: notice(title, body) }),
    logout: () => dispatch({ type: 'logout' }),
    revisitPermissions: () => dispatch({ type: 'revisit-permissions' }),
  };

  return <FamilyContext.Provider value={api}>{children}</FamilyContext.Provider>;
}

export function useFamily(): FamilyApi {
  const value = useContext(FamilyContext);
  if (!value) throw new Error('FamilyProvider가 없습니다.');
  return value;
}
