import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { hasLocation } from '../../lib/geo';
import { localProfile } from '../../lib/localProfile.mjs';
import { HISTORY_DAYS, TRAIL_POINT_CAP, appendHistoryPoint, isWithinHistory, seoulDayKey, tracksWithinHistory, visitsWithinHistory } from '../../lib/tracking.mjs';
import type { DayStop } from '../../lib/tracking.mjs';
import type { SharedPlace } from '../../services/familyShare';
import { umapLocation } from '../../services/umapLocation';
import { createKeyPart, isKeyPart, splitSyncToken } from '../../services/familySync';
import {
  DEFAULT_CENTER,
  REQUIRED_TERMS,
  type AppMode,
  type FamilyNotice,
  type FamilyTab,
  type GuardianLink,
  type HomeZone,
  type LeaveAlert,
  type Member,
  type PermissionState,
  type Profile,
  type Session,
  type ShareState,
  type Stage,
  type TrackPoint,
  type Visit,
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
    phoneVerified: false,
    permissions: { ...EMPTY_PERMISSIONS },
    members: [],
    tracks: {},
    trailDay: seoulDayKey(Date.now()),
    visits: {},
    shareSelfWithFamily: false,
    backgroundKeepAlive: false,
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
    alertPhone: '',
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
      charging: null,
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

function cleanTracks(value: unknown): Record<string, TrackPoint[]> {
  if (!value || typeof value !== 'object') return {};
  const tracks: Record<string, TrackPoint[]> = {};
  for (const [id, points] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(points)) continue;
    const clean = points.filter(isPoint).slice(-(TRAIL_POINT_CAP * (HISTORY_DAYS + 1)));
    if (clean.length > 0) tracks[id] = clean;
  }
  return tracks;
}

function cleanVisits(value: unknown): Record<string, Visit[]> {
  if (!value || typeof value !== 'object') return {};
  const visits: Record<string, Visit[]> = {};
  for (const [id, list] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const clean: Visit[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const visit = item as Visit;
      if (typeof visit.id !== 'string' || !Number.isFinite(visit.lat) || !Number.isFinite(visit.lng) || !Number.isFinite(visit.arrivedAt)) continue;
      clean.push({
        id: visit.id.slice(0, 120),
        lat: visit.lat,
        lng: visit.lng,
        arrivedAt: visit.arrivedAt,
        leftAt: typeof visit.leftAt === 'number' && Number.isFinite(visit.leftAt) ? visit.leftAt : null,
        label: typeof visit.label === 'string' && visit.label.trim() ? visit.label.trim().slice(0, 120) : null,
        source: visit.source === 'geocode' ? 'geocode' : 'coords',
      });
    }
    if (clean.length > 0) visits[id] = clean.slice(-40);
  }
  return visits;
}

function visitsSame(current: Visit[], next: Visit[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((visit, index) => {
    const other = next[index];
    return other && visit.id === other.id && visit.leftAt === other.leftAt && visit.lat === other.lat && visit.lng === other.lng && visit.label === other.label;
  });
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

function cleanProfile(value: unknown): Profile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { id?: unknown; name?: unknown; preview?: unknown };
  let name = typeof raw.name === 'string' ? raw.name : '';
  if (raw.preview === true && (name === '부건' || name === 'Bukeon')) name = '나';
  const id = typeof raw.id === 'string' ? raw.id : '';
  return localProfile(name, id);
}

function withoutDemo(session: Session): Session {
  const legacy = session.profile as (Profile & { preview?: boolean }) | null;
  const previewAlias = !!legacy && legacy.preview === true && (legacy.name === '부건' || legacy.name === 'Bukeon');
  const profile = cleanProfile(previewAlias && session.profile ? { ...session.profile, name: '나' } : session.profile);
  const members = session.members
    .filter((member) => member.id !== 'sample' && member.name !== '샘플' && member.role !== 'guardian' && !('isSample' in member && (member as { isSample?: boolean }).isSample))
    .map((member) => {
      const renamed = member.id === 'self' && previewAlias ? { ...member, name: '나' } : member;
      const share = renamed.role === 'admin-share' ? 'allowed' : asShare(renamed.share, renamed.id === 'self');
      const charging = renamed.charging === true ? true : renamed.charging === false ? false : null;
      const battery = typeof renamed.battery === 'number' && renamed.battery >= 0 && renamed.battery <= 100 ? Math.round(renamed.battery) : null;
      const next = { ...renamed, share, charging, battery };
      if (renamed.role === 'admin-share') return next;
      if (renamed.id !== 'self' && share !== 'allowed') return { ...next, lat: null, lng: null };
      return scrubSeed(next, share);
    });
  const kept = new Set(members.map((member) => member.id));
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
      trailDay: typeof parsed.trailDay === 'string' ? parsed.trailDay : '',
      visits: cleanVisits(parsed.visits),
      shareSelfWithFamily: parsed.shareSelfWithFamily === true,
      backgroundKeepAlive: parsed.backgroundKeepAlive === true,
      phoneVerified: false,
      phone: '',
      tab: parsed.tab === 'history' || parsed.tab === 'menu' ? parsed.tab : 'map',
    };
    if (session.stage === 'phone') session.stage = 'permissions';
    const loaded = withoutDemo(session);
    const profile = loaded.profile;
    const now = Date.now();
    const stage = !profile
      ? (loaded.stage === 'splash' ? 'splash' : 'login')
      : loaded.permissions.completed
        ? (loaded.mode ? 'map' : 'mode')
        : loaded.stage;
    return {
      ...loaded,
      profile,
      phone: '',
      phoneVerified: false,
      stage,
      trailDay: seoulDayKey(now),
      tracks: tracksWithinHistory(loaded.tracks, now),
      visits: visitsWithinHistory(loaded.visits, now),
    };
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
  | { type: 'update-self'; lat: number; lng: number; accuracyM: number; speedMps: number | null }
  | { type: 'set-battery'; battery: number | null; charging: boolean | null }
  | { type: 'roll-day'; now: number }
  | { type: 'set-share-self'; share: boolean }
  | { type: 'set-keep-alive'; on: boolean }
  | { type: 'apply-shared-place'; place: SharedPlace }
  | { type: 'set-room-family-places'; code: string; places: SharedPlace[] }
  | { type: 'merge-visits'; memberId: string; stops: DayStop[] }
  | { type: 'set-visit-label'; memberId: string; id: string; label: string }
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
      const profile = cleanProfile(action.profile);
      if (!profile) return state;
      const members = state.members.some((member) => member.id === 'self')
        ? state.members.map((member) => (member.id === 'self' ? { ...member, name: profile.name } : member))
        : membersFor(profile);
      return withoutDemo({
        ...state,
        profile,
        members,
        phone: '',
        phoneVerified: false,
        stage: state.mode ? (state.permissions.completed ? 'map' : 'survey') : 'mode',
      });
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
      const order: Stage[] = ['login', 'mode', 'survey', 'terms', 'permissions'];
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
      return { ...state, stage: 'permissions' };
    case 'save-phone':
    case 'skip-phone':
      return { ...state, phone: '', phoneVerified: false, stage: 'permissions' };
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
        charging: null,
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
      const at = Date.now();
      const speed = typeof action.speedMps === 'number' && Number.isFinite(action.speedMps) ? action.speedMps : null;
      const selfTrail = appendHistoryPoint(state.tracks.self, { lat: action.lat, lng: action.lng, at, speedMps: speed }, at);
      const tracks = tracksWithinHistory(selfTrail === state.tracks.self ? state.tracks : { ...state.tracks, self: selfTrail }, at);
      return {
        ...state,
        trailDay: seoulDayKey(at),
        visits: visitsWithinHistory(state.visits, at),
        members: state.members.map((member) =>
          member.id === 'self'
            ? { ...member, lat: action.lat, lng: action.lng, accuracyM: Math.max(1, Math.round(action.accuracyM)), updatedAt: at }
            : member,
        ),
        tracks,
      };
    }
    case 'set-battery': {
      const self = state.members.find((member) => member.id === 'self');
      if (!self || (self.battery === action.battery && self.charging === action.charging)) return state;
      return {
        ...state,
        members: state.members.map((member) => (member.id === 'self' ? { ...member, battery: action.battery, charging: action.charging } : member)),
      };
    }
    case 'roll-day': {
      const trailDay = seoulDayKey(action.now);
      const tracks = tracksWithinHistory(state.tracks, action.now);
      const visits = visitsWithinHistory(state.visits, action.now);
      if (state.trailDay === trailDay && tracks === state.tracks && visits === state.visits) return state;
      return { ...state, trailDay, tracks, visits };
    }
    case 'set-share-self':
      if (state.mode !== 'admin' || state.shareSelfWithFamily === action.share) return state;
      return {
        ...state,
        shareSelfWithFamily: action.share,
        notices: [notice(action.share ? '내 위치를 가족에게 공유합니다' : '내 위치 공유를 껐습니다', action.share ? '피관리자 지도에 내 핀이 나타납니다. 언제든 끌 수 있습니다.' : '피관리자 지도에서 내 핀이 곧 사라집니다.'), ...state.notices],
      };
    case 'set-keep-alive':
      if (state.backgroundKeepAlive === action.on) return state;
      return { ...state, backgroundKeepAlive: action.on };
    case 'apply-shared-place': {
      if (state.mode !== 'admin') return state;
      const place = action.place;
      if (place.audience === 'family') return state;
      const children = state.members.filter((member) => member.id !== 'self' && member.role !== 'guardian' && member.role !== 'admin-share' && member.inviteCode === place.code);
      const member = children.find((item) => item.name === place.name) ?? (children.length === 1 ? children[0] : undefined);
      if (!member) return state;
      if (!place.sharing) {
        if (member.share !== 'allowed' && !hasLocation(member)) return state;
        const tracks = { ...state.tracks };
        delete tracks[member.id];
        return {
          ...state,
          members: state.members.map((item) => (item.id === member.id ? { ...item, share: 'revoked', lat: null, lng: null, updatedAt: place.at } : item)),
          tracks,
        };
      }
      if (place.lat == null || place.lng == null || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
        if (member.share === 'allowed' && !hasLocation(member)) return state;
        return {
          ...state,
          members: state.members.map((item) => (item.id === member.id ? { ...item, share: 'allowed', lat: null, lng: null } : item)),
        };
      }
      if (isSeedLocation(place.lat, place.lng) && place.accuracyM === 18) return state;
      if (member.updatedAt > place.at && hasLocation(member)) return state;
      const battery = typeof place.batteryPct === 'number' ? Math.round(place.batteryPct) : member.battery;
      const charging = place.charging === true ? true : place.charging === false ? false : member.charging;
      const sameSpot = hasLocation(member) && member.lat === place.lat && member.lng === place.lng;
      if (sameSpot && member.updatedAt === place.at && member.battery === battery && member.charging === charging && member.share === 'allowed') return state;
      const now = Date.now();
      const keptTracks = tracksWithinHistory(state.tracks, now);
      const tracks = isWithinHistory(place.at, now)
        ? { ...keptTracks, [member.id]: appendHistoryPoint(keptTracks[member.id], { lat: place.lat, lng: place.lng, at: place.at }, now) }
        : keptTracks;
      return {
        ...state,
        trailDay: seoulDayKey(now),
        visits: visitsWithinHistory(state.visits, now),
        members: state.members.map((item) =>
          item.id === member.id
            ? {
                ...item,
                share: 'allowed',
                lat: place.lat,
                lng: place.lng,
                accuracyM: Math.max(1, Math.round(place.accuracyM || item.accuracyM || 1)),
                battery,
                charging,
                updatedAt: place.at,
              }
            : item,
        ),
        tracks,
      };
    }
    case 'set-room-family-places': {
      if (state.mode !== 'managed') return state;
      const prefix = `family:${action.code}:`;
      const now = Date.now();
      const today = seoulDayKey(now);
      const incoming = action.places.filter((place) => place.audience === 'family' && place.sharing && place.lat != null && place.lng != null && Number.isFinite(place.lat) && Number.isFinite(place.lng));
      const current = state.members.filter((member) => member.id.startsWith(prefix));
      const unchanged = current.length === incoming.length && incoming.every((place) => {
        const member = current.find((item) => item.id === `family:${action.code}:${place.name}`);
        const battery = typeof place.batteryPct === 'number' ? Math.round(place.batteryPct) : null;
        const charging = place.charging === true ? true : place.charging === false ? false : null;
        return !!member && member.updatedAt === place.at && member.lat === place.lat && member.lng === place.lng && member.battery === battery && member.charging === charging;
      });
      if (unchanged) return state;
      let tracks = tracksWithinHistory(state.tracks, now);
      const visits = visitsWithinHistory(state.visits, now);
      let members = state.members.filter((member) => !member.id.startsWith(prefix));
      for (const place of incoming) {
        if (place.lat == null || place.lng == null) continue;
        const id = `family:${action.code}:${place.name}`;
        const battery = typeof place.batteryPct === 'number' ? Math.round(place.batteryPct) : null;
        const charging = place.charging === true ? true : place.charging === false ? false : null;
        members = [...members, {
          id,
          name: place.name,
          role: 'admin-share',
          lat: place.lat,
          lng: place.lng,
          accuracyM: Math.max(1, Math.round(place.accuracyM || 1)),
          battery,
          charging,
          updatedAt: place.at,
          moving: null,
          share: 'allowed',
        }];
        if (isWithinHistory(place.at, now)) tracks = { ...tracks, [id]: appendHistoryPoint(tracks[id], { lat: place.lat, lng: place.lng, at: place.at }, now) };
      }
      for (const member of current) {
        if (!members.some((item) => item.id === member.id)) delete tracks[member.id];
      }
      return { ...state, members, tracks, visits, trailDay: today };
    }
    case 'merge-visits': {
      const now = Date.now();
      const base = visitsWithinHistory(state.visits, now);
      const current = base[action.memberId] ?? [];
      const next = action.stops
        .filter((stop) => isWithinHistory(stop.arrivedAt, now))
        .map((stop) => {
          const id = `${action.memberId}:${stop.arrivedAt}:${stop.lat.toFixed(4)}:${stop.lng.toFixed(4)}`;
          const prev = current.find((visit) => visit.id === id);
          return {
            id,
            lat: stop.lat,
            lng: stop.lng,
            arrivedAt: stop.arrivedAt,
            leftAt: stop.leftAt,
            label: prev?.label ?? null,
            source: prev?.label ? 'geocode' as const : 'coords' as const,
          };
        });
      const visits = visitsWithinHistory({ ...base, [action.memberId]: next }, now);
      const stored = visits[action.memberId] ?? [];
      if (visitsSame(current, stored) && base === state.visits) return state;
      return {
        ...state,
        trailDay: seoulDayKey(now),
        tracks: tracksWithinHistory(state.tracks, now),
        visits,
      };
    }
    case 'set-visit-label': {
      const list = state.visits[action.memberId];
      if (!list || list.some((visit) => visit.id === action.id && visit.label === action.label)) return state;
      return {
        ...state,
        visits: {
          ...state.visits,
          [action.memberId]: list.map((visit) => (visit.id === action.id ? { ...visit, label: action.label, source: 'geocode' } : visit)),
        },
      };
    }
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
  updateSelf: (lat: number, lng: number, accuracyM: number, speedMps?: number | null) => void;
  setBattery: (battery: number | null, charging: boolean | null) => void;
  rollDay: (now: number) => void;
  setShareSelf: (share: boolean) => void;
  setKeepAlive: (on: boolean) => void;
  applySharedPlace: (place: SharedPlace) => void;
  setRoomFamilyPlaces: (code: string, places: SharedPlace[]) => void;
  mergeVisits: (memberId: string, stops: DayStop[]) => void;
  setVisitLabel: (memberId: string, id: string, label: string) => void;
  setMotion: (moving: boolean) => void;
  pushNotice: (title: string, body: string) => void;
  logout: () => void;
  revisitPermissions: () => void;
}

const FamilyContext = createContext<FamilyApi | null>(null);

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    if (state.profile) return;
    void umapLocation.stop();
  }, [state.profile]);

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
    updateSelf: (lat, lng, accuracyM, speedMps) => dispatch({ type: 'update-self', lat, lng, accuracyM, speedMps: speedMps ?? null }),
    setBattery: (battery, charging) => dispatch({ type: 'set-battery', battery, charging }),
    rollDay: (now) => dispatch({ type: 'roll-day', now }),
    setShareSelf: (share) => dispatch({ type: 'set-share-self', share }),
    setKeepAlive: (on) => dispatch({ type: 'set-keep-alive', on }),
    applySharedPlace: (place) => dispatch({ type: 'apply-shared-place', place }),
    setRoomFamilyPlaces: (code, places) => dispatch({ type: 'set-room-family-places', code, places }),
    mergeVisits: (memberId, stops) => dispatch({ type: 'merge-visits', memberId, stops }),
    setVisitLabel: (memberId, id, label) => dispatch({ type: 'set-visit-label', memberId, id, label }),
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
