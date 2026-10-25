import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { appendTrail, hasLocation } from '../../lib/geo';
import type { SharedPlace } from '../../services/familyShare';
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
    const clean = points.filter(isPoint).slice(-300);
    if (clean.length > 0) tracks[id] = clean;
  }
  return tracks;
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
      if (renamed.id !== 'self' && share !== 'allowed') return { ...renamed, share, lat: null, lng: null };
      return scrubSeed(renamed, share);
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
    };
    if (session.profile && session.permissions.completed) session.stage = session.mode ? 'map' : 'mode';
    return withoutDemo(session);
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
  | { type: 'update-self'; lat: number; lng: number; accuracyM: number }
  | { type: 'apply-shared-place'; place: SharedPlace }
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
      return {
        ...state,
        members: state.members.map((member) =>
          member.id === 'self'
            ? { ...member, lat: action.lat, lng: action.lng, accuracyM: Math.max(1, Math.round(action.accuracyM)), updatedAt: at }
            : member,
        ),
        tracks: {
          ...state.tracks,
          self: appendTrail(state.tracks.self, { lat: action.lat, lng: action.lng, at }),
        },
      };
    }
    case 'apply-shared-place': {
      if (state.mode !== 'admin') return state;
      const place = action.place;
      const children = state.members.filter((member) => member.id !== 'self' && member.role !== 'guardian' && member.inviteCode === place.code);
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
      if (member.share === 'allowed' && member.lat === place.lat && member.lng === place.lng) return state;
      if (member.updatedAt > place.at && hasLocation(member)) return state;
      return {
        ...state,
        members: state.members.map((item) =>
          item.id === member.id
            ? {
                ...item,
                share: 'allowed',
                lat: place.lat,
                lng: place.lng,
                accuracyM: Math.max(1, Math.round(place.accuracyM || item.accuracyM || 1)),
                updatedAt: place.at,
              }
            : item,
        ),
        tracks: {
          ...state.tracks,
          [member.id]: appendTrail(state.tracks[member.id], { lat: place.lat, lng: place.lng, at: place.at }),
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
  updateSelf: (lat: number, lng: number, accuracyM: number) => void;
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
    updateSelf: (lat, lng, accuracyM) => dispatch({ type: 'update-self', lat, lng, accuracyM }),
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
