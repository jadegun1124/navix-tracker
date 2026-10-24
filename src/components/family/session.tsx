import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { haversineMeters } from '../../lib/geo';
import {
  DEFAULT_CENTER,
  REQUIRED_TERMS,
  type FamilyNotice,
  type FamilyTab,
  type HomeZone,
  type Member,
  type PermissionState,
  type Profile,
  type Session,
  type Stage,
} from '../../types/family';

const STORAGE_KEY = 'umap_family_v1';

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
    home: null,
    inviteCode: String(10000 + Math.floor(Math.random() * 90000)),
    notices: [],
    tab: 'map',
    pendingInvite: readInvite(),
  };
}

function membersFor(profile: Profile): Member[] {
  const now = Date.now();
  return [
    {
      id: 'self',
      name: profile.name,
      role: 'self',
      lat: DEFAULT_CENTER.lat,
      lng: DEFAULT_CENTER.lng,
      accuracyM: 18,
      battery: null,
      updatedAt: now,
      moving: null,
    },
    {
      id: 'sample',
      name: '샘플',
      role: 'child',
      isSample: true,
      lat: DEFAULT_CENTER.lat + 0.00115,
      lng: DEFAULT_CENTER.lng + 0.00105,
      accuracyM: 10,
      battery: 50,
      updatedAt: now,
      moving: false,
    },
  ];
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const session = value as Session;
  return typeof session.inviteCode === 'string' && Array.isArray(session.members) && !!session.permissions;
}

function load(): Session {
  if (shouldReset()) {
    localStorage.removeItem(STORAGE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return fresh();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) return fresh();
    const invite = readInvite();
    const session: Session = {
      ...fresh(),
      ...parsed,
      terms: { ...EMPTY_TERMS, ...parsed.terms },
      permissions: { ...EMPTY_PERMISSIONS, ...parsed.permissions },
      pendingInvite: invite || parsed.pendingInvite,
    };
    if (session.profile && session.permissions.completed) session.stage = 'map';
    return session;
  } catch {
    return fresh();
  }
}

type Action =
  | { type: 'splash-done' }
  | { type: 'login'; profile: Profile }
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
  | { type: 'dismiss-invite' }
  | { type: 'mark-alerts-read' }
  | { type: 'update-self'; lat: number; lng: number; accuracyM: number }
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
      return { ...state, stage: state.profile ? (state.permissions.completed ? 'map' : 'survey') : 'login' };
    case 'login': {
      const members = state.members.length > 0
        ? state.members.map((member) => (member.id === 'self' ? { ...member, name: action.profile.name } : member))
        : membersFor(action.profile);
      return { ...state, profile: action.profile, members, stage: 'survey' };
    }
    case 'skip-survey':
      return { ...state, stage: 'terms' };
    case 'pick-survey':
      return { ...state, survey: action.id, stage: 'terms' };
    case 'back': {
      const order: Stage[] = ['login', 'survey', 'terms', 'phone', 'permissions'];
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
      const sample = state.members.find((member) => member.isSample);
      const inside = sample ? haversineMeters(sample, action.home) <= action.home.radiusM : false;
      const created = notice(
        inside ? '샘플이 우리 집 안에 있습니다' : '우리 집을 저장했습니다',
        inside
          ? '안심존 안에 샘플이 있습니다. 들어오거나 나가면 다시 알려 드립니다.'
          : '가족이 이 원에 들어오거나 나가면 알림에 기록됩니다.',
      );
      return { ...state, home: action.home, notices: [created, ...state.notices], tab: 'map' };
    }
    case 'clear-home':
      return { ...state, home: null };
    case 'add-member': {
      const anchor = state.home ?? state.members.find((member) => member.id === 'self') ?? DEFAULT_CENTER;
      const offset = state.members.filter((member) => member.role !== 'self').length + 1;
      const member: Member = {
        id: `m-${Date.now()}`,
        name: action.name.trim(),
        role: 'child',
        lat: anchor.lat + 0.00045 * offset,
        lng: anchor.lng - 0.0004 * offset,
        accuracyM: 15,
        battery: null,
        updatedAt: Date.now(),
        moving: null,
        inviteCode: action.code,
      };
      return {
        ...state,
        members: [...state.members, member],
        pendingInvite: null,
        notices: [notice('가족을 추가했습니다', `${member.name} 님이 이 기기의 가족 목록에 표시됩니다.`), ...state.notices],
      };
    }
    case 'remove-member':
      if (action.id === 'self') return state;
      return { ...state, members: state.members.filter((member) => member.id !== action.id) };
    case 'dismiss-invite':
      return { ...state, pendingInvite: null };
    case 'mark-alerts-read':
      return { ...state, notices: state.notices.map((item) => ({ ...item, read: true })) };
    case 'update-self':
      return {
        ...state,
        members: state.members.map((member) =>
          member.id === 'self'
            ? { ...member, lat: action.lat, lng: action.lng, accuracyM: Math.max(1, Math.round(action.accuracyM)), updatedAt: Date.now() }
            : member,
        ),
      };
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
  dismissInvite: () => void;
  markAlertsRead: () => void;
  updateSelf: (lat: number, lng: number, accuracyM: number) => void;
  setMotion: (moving: boolean) => void;
  pushNotice: (title: string, body: string) => void;
  logout: () => void;
  revisitPermissions: () => void;
}

const FamilyContext = createContext<FamilyApi | null>(null);

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const api: FamilyApi = {
    state,
    splashDone: () => dispatch({ type: 'splash-done' }),
    login: (profile) => dispatch({ type: 'login', profile }),
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
    dismissInvite: () => dispatch({ type: 'dismiss-invite' }),
    markAlertsRead: () => dispatch({ type: 'mark-alerts-read' }),
    updateSelf: (lat, lng, accuracyM) => dispatch({ type: 'update-self', lat, lng, accuracyM }),
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
