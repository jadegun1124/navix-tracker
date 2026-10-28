import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { hasLocation, haversineMeters } from '../../lib/geo';
import { deviceProfileKey, localProfile } from '../../lib/localProfile.mjs';
import { carryPlace, cleanPlace } from '../../lib/memberPlace.mjs';
import { applyRole, isSelfEchoPlace, testRoleFlip } from '../../lib/testRole.mjs';
import { resolveManagedTarget } from '../../lib/managedPlace.mjs';
import { familyPinId, isMemberId, moveKeyed } from '../../lib/sharedIdentity.mjs';
import { HISTORY_DAYS, JOURNEY_POINT_CAP, TRAIL_POINT_CAP, isWithinHistory, journeysWithinHistory, labelJourneyPlace, mergeJourneyLists, seoulDayKey, settleTrailPoint, splitClosedJourneys, tracksWithinHistory, trimJourneyList, visitsWithinHistory, type JourneyRecord } from '../../lib/tracking.mjs';
import type { DayStop } from '../../lib/tracking.mjs';
import type { SharedPlace, SharedProfile } from '../../services/familyShare';
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
  type Journey,
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
    journeys: {},
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

function cleanPhoto(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('data:image/') || value.length > 120_000) return undefined;
  return value;
}

function membersFor(profile: Profile): Member[] {
  const photo = cleanPhoto(profile.photo);
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
      ...(photo ? { photo } : {}),
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

function cleanJourneys(value: unknown): Record<string, Journey[]> {
  if (!value || typeof value !== 'object') return {};
  const journeys: Record<string, Journey[]> = {};
  for (const [id, list] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const clean: Journey[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const journey = item as Journey;
      if (typeof journey.id !== 'string' || !Number.isFinite(journey.startedAt) || !Number.isFinite(journey.endedAt)) continue;
      if (!journey.start || !journey.end || !Number.isFinite(journey.start.lat) || !Number.isFinite(journey.start.lng) || !Number.isFinite(journey.end.lat) || !Number.isFinite(journey.end.lng)) continue;
      const points = Array.isArray(journey.points) ? journey.points.filter(isPoint).slice(-JOURNEY_POINT_CAP) : [];
      if (points.length < 2) continue;
      const placeLabel = (label: unknown) => (typeof label === 'string' && label.trim() ? label.trim().slice(0, 120) : null);
      clean.push({
        id: journey.id.slice(0, 160),
        startedAt: journey.startedAt,
        endedAt: journey.endedAt,
        distanceM: Number.isFinite(journey.distanceM) ? Math.max(0, Math.round(journey.distanceM)) : 0,
        points,
        start: { lat: journey.start.lat, lng: journey.start.lng, label: placeLabel(journey.start.label) },
        end: { lat: journey.end.lat, lng: journey.end.lng, label: placeLabel(journey.end.label) },
      });
    }
    if (clean.length > 0) journeys[id] = clean.slice(-80);
  }
  return journeys;
}

function knownSpots(state: Session, memberId: string) {
  const spots: { lat: number; lng: number; label: string; radiusM: number }[] = [];
  if (state.home && Number.isFinite(state.home.lat) && Number.isFinite(state.home.lng)) {
    spots.push({ lat: state.home.lat, lng: state.home.lng, label: state.home.label || '우리 집', radiusM: state.home.radiusM });
  }
  for (const visit of state.visits[memberId] ?? []) {
    if (visit.label) spots.push({ lat: visit.lat, lng: visit.lng, label: visit.label, radiusM: 120 });
  }
  return spots;
}

function archiveJourneys(state: Session, now: number): Session {
  const tracks = tracksWithinHistory(state.tracks, now);
  let journeys = journeysWithinHistory(state.journeys ?? {}, now);
  for (const [id, points] of Object.entries(tracks)) {
    const split = splitClosedJourneys(points, now);
    if (split.journeys.length === 0) continue;
    const spots = knownSpots({ ...state, journeys }, id);
    const labeled = split.journeys.map((journey: JourneyRecord) => ({
      ...journey,
      start: labelJourneyPlace(journey.start, spots),
      end: labelJourneyPlace(journey.end, spots),
    }));
    const merged = trimJourneyList(mergeJourneyLists(journeys[id], labeled), now);
    const current = journeys[id] ?? [];
    if (merged === current) continue;
    const next = { ...journeys };
    if (merged.length === 0) delete next[id];
    else next[id] = merged;
    journeys = next;
  }
  if (tracks === state.tracks && journeys === (state.journeys ?? {})) return state;
  return {
    ...state,
    trailDay: seoulDayKey(now),
    tracks,
    journeys,
  };
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
    const rosterName = typeof link.rosterName === 'string' ? link.rosterName.trim().slice(0, 80) : '';
    const adminName = typeof link.adminName === 'string' ? link.adminName.trim().slice(0, 20) : '';
    links.push({
      id: link.id,
      label: (link.label || '관리자').slice(0, 20),
      code,
      share,
      leaveAlert: cleanLeaveAlert(link.leaveAlert),
      ...(syncToken ? { syncToken } : {}),
      ...(rosterName ? { rosterName } : {}),
      ...(adminName ? { adminName } : {}),
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
  const raw = value as { id?: unknown; name?: unknown; preview?: unknown; photo?: unknown; profileKey?: unknown };
  let name = typeof raw.name === 'string' ? raw.name : '';
  if (raw.preview === true && (name === '부건' || name === 'Bukeon')) name = '나';
  const id = typeof raw.id === 'string' ? raw.id : '';
  const profile = localProfile(name, id);
  if (!profile) return null;
  const photo = cleanPhoto(raw.photo);
  const profileKey = deviceProfileKey(raw.profileKey);
  return { ...profile, profileKey, ...(photo ? { photo } : {}) };
}

function memberIdOf(place: SharedPlace): string {
  return isMemberId(place.memberId) ? place.memberId : '';
}

function withPublisher(member: Member, place: SharedPlace): Member {
  const memberId = memberIdOf(place);
  if (!memberId) return member;
  const name = place.name.trim().slice(0, 80);
  return { ...member, ...(name ? { name } : {}), publisherId: memberId };
}

function describeFamilyPlace(code: string, place: SharedPlace, profiles: SharedProfile[], current: Member[]) {
  const memberId = memberIdOf(place);
  const profile = memberId ? profiles.find((item) => item.memberId === memberId) : undefined;
  const name = (profile?.name || place.name).trim().slice(0, 80) || place.name;
  const photo = profile?.photo ? cleanPhoto(profile.photo) : undefined;
  const id = familyPinId(code, place);
  const legacyId = place.priorName ? `family:${code}:${place.priorName}` : `family:${code}:${place.name}`;
  const battery = typeof place.batteryPct === 'number' ? Math.round(place.batteryPct) : null;
  const charging = place.charging === true ? true : place.charging === false ? false : null;
  const previous = current.find((entry) => entry.id === id || (memberId !== '' && entry.publisherId === memberId));
  return { id, legacyId, memberId, name, photo: photo || previous?.photo, battery, charging, place };
}

function memberIndexForProfile(members: Member[], profile: SharedProfile, code: string): number {
  const byPublisher = members.findIndex((member) => member.id !== 'self' && member.publisherId === profile.memberId);
  if (byPublisher >= 0) return byPublisher;
  return members.findIndex((member) => member.id === `remote:${code}:${profile.memberId}` || member.id === `family:${code}:${profile.memberId}`);
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
      const photo = cleanPhoto(renamed.photo) || (renamed.id === 'self' ? cleanPhoto(profile?.photo) : undefined);
      const place = typeof renamed.place === 'string' ? renamed.place.trim().slice(0, 40) : '';
      const publisherId = isMemberId(renamed.publisherId) ? renamed.publisherId : '';
      const next = {
        ...renamed,
        share,
        charging,
        battery,
        ...(photo ? { photo } : { photo: undefined }),
        ...(publisherId ? { publisherId } : { publisherId: undefined }),
        ...(place ? { place } : { place: undefined }),
      };
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
  const journeys: Record<string, Journey[]> = {};
  for (const [id, list] of Object.entries(session.journeys ?? {})) {
    if (!kept.has(id) || !Array.isArray(list) || list.length === 0) continue;
    const trimmed = trimJourneyList(list, Date.now());
    if (trimmed.length === 0) continue;
    journeys[id] = trimmed;
  }
  const mode = session.mode === 'admin' || session.mode === 'managed' ? session.mode : null;
  return { ...session, profile, members, tracks, journeys, mode, guardians: cleanGuardians(session.guardians) };
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
      journeys: cleanJourneys((parsed as Session).journeys),
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
    return archiveJourneys({
      ...loaded,
      profile,
      phone: '',
      phoneVerified: false,
      stage,
      trailDay: seoulDayKey(now),
      tracks: tracksWithinHistory(loaded.tracks, now),
      visits: visitsWithinHistory(loaded.visits, now),
      journeys: journeysWithinHistory(loaded.journeys ?? {}, now),
    }, now);
  } catch {
    return { ...fresh(), pendingSyncToken };
  }
}

type Action =
  | { type: 'splash-done' }
  | { type: 'login'; profile: Profile }
  | { type: 'choose-mode'; mode: AppMode }
  | { type: 'test-switch-mode' }
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
  | { type: 'accept-invite'; label: string; code: string; syncToken: string | null; rosterName: string | null; adminName: string | null }
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
  | { type: 'apply-shared-profiles'; code: string; profiles: SharedProfile[] }
  | { type: 'set-room-family-places'; code: string; places: SharedPlace[]; profiles: SharedProfile[] }
  | { type: 'merge-visits'; memberId: string; stops: DayStop[] }
  | { type: 'set-visit-label'; memberId: string; id: string; label: string }
  | { type: 'set-journey-label'; memberId: string; id: string; which: 'start' | 'end'; label: string; lat?: number; lng?: number }
  | { type: 'set-photo'; photo: string | null }
  | { type: 'set-display-name'; name: string }
  | { type: 'set-self-place'; place: string | null }
  | { type: 'set-member-place'; id: string; place: string | null }
  | { type: 'close-journeys'; now: number }
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
      const cleaned = cleanProfile({ ...action.profile, profileKey: action.profile.profileKey || state.profile?.profileKey });
      if (!cleaned) return state;
      const photo = cleaned.photo || cleanPhoto(state.profile?.photo);
      const profile = photo ? { ...cleaned, photo } : cleaned;
      const members = state.members.some((member) => member.id === 'self')
        ? state.members.map((member) => (member.id === 'self' ? { ...member, name: profile.name, ...(photo ? { photo } : {}) } : member))
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
      if (state.mode && state.mode !== action.mode) return applyRole(state, action.mode);
      return { ...state, mode: action.mode, stage: state.permissions.completed ? 'map' : 'survey' };
    case 'test-switch-mode':
      return testRoleFlip(state);
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
      return archiveJourneys({
        ...state,
        home: { ...action.home, alertPhone: '' },
        phone: state.phone,
        notices: [created, ...state.notices],
        tab: 'map',
      }, Date.now());
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
      const journeys = { ...state.journeys };
      delete journeys[action.id];
      return {
        ...state,
        members: state.members.filter((member) => member.id !== action.id),
        tracks,
        journeys,
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
      const rosterName = typeof action.rosterName === 'string' ? action.rosterName.trim().slice(0, 80) : '';
      const adminName = typeof action.adminName === 'string' ? action.adminName.trim().slice(0, 20) : '';
      const link: GuardianLink = {
        id: `g-${Date.now()}`,
        label,
        code,
        share: 'accepted',
        leaveAlert,
        ...(syncToken ? { syncToken } : {}),
        ...(rosterName ? { rosterName } : {}),
        ...(adminName ? { adminName } : {}),
      };
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
      const self = state.members.find((member) => member.id === 'self');
      const sample = {
        lat: action.lat,
        lng: action.lng,
        at,
        speedMps: speed,
        accuracyM: action.accuracyM,
        staying: self?.moving === false,
      };
      const settled = settleTrailPoint(state.tracks.self, sample, at);
      if (settled.decision === 'drop') {
        if (settled.points === state.tracks.self) return archiveJourneys(state, at);
        return archiveJourneys({
          ...state,
          tracks: tracksWithinHistory({ ...state.tracks, self: settled.points }, at),
        }, at);
      }
      const tracks = tracksWithinHistory(
        settled.points === state.tracks.self ? state.tracks : { ...state.tracks, self: settled.points },
        at,
      );
      const nextLat = settled.lat ?? action.lat;
      const nextLng = settled.lng ?? action.lng;
      const keptPlace = carryPlace(self, nextLat, nextLng);
      return archiveJourneys({
        ...state,
        visits: visitsWithinHistory(state.visits, at),
        members: state.members.map((member) =>
          member.id === 'self'
            ? {
                ...member,
                lat: nextLat,
                lng: nextLng,
                accuracyM: Math.max(1, Math.round(action.accuracyM)),
                updatedAt: at,
                ...(keptPlace ? { place: keptPlace } : { place: undefined }),
              }
            : member,
        ),
        tracks,
      }, at);
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
      const visits = visitsWithinHistory(state.visits, action.now);
      const base = visits === state.visits ? state : { ...state, visits };
      return archiveJourneys(base, action.now);
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
      const place = action.place;
      if (place.audience === 'family') return state;
      const target = resolveManagedTarget(state.members, place);
      const liveFix = place.sharing && place.lat != null && place.lng != null && Number.isFinite(place.lat) && Number.isFinite(place.lng);
      if (target.create && (state.mode !== 'admin' || !liveFix)) return state;
      const members = target.create ? [...state.members, target.create] : state.members;
      const member = members.find((item) => item.id === target.id);
      if (!member) return state;
      state = { ...state, members };
      if (!place.sharing) {
        if (member.share !== 'allowed' && !hasLocation(member)) return state;
        const archived = archiveJourneys(state, place.at || Date.now());
        const tracks = { ...archived.tracks };
        delete tracks[member.id];
        return {
          ...archived,
          members: archived.members.map((item) => (item.id === member.id ? withPublisher({ ...item, share: 'revoked', lat: null, lng: null, updatedAt: place.at }, place) : item)),
          tracks,
        };
      }
      if (place.lat == null || place.lng == null || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
        const battery = typeof place.batteryPct === 'number' ? Math.round(place.batteryPct) : member.battery;
        const charging = place.charging === true ? true : place.charging === false ? false : member.charging;
        if (hasLocation(member)) {
          const nextName = memberIdOf(place) ? place.name.trim().slice(0, 80) : member.name;
          if (member.share === 'allowed' && member.battery === battery && member.charging === charging && member.name === nextName && (member.publisherId || '') === (memberIdOf(place) || '')) return state;
          return {
            ...state,
            members: state.members.map((item) => (item.id === member.id ? withPublisher({ ...item, share: 'allowed', battery, charging }, place) : item)),
          };
        }
        if (member.share === 'allowed' && (member.publisherId || '') === (memberIdOf(place) || '') && member.name === (memberIdOf(place) ? place.name.trim().slice(0, 80) : member.name)) return state;
        return {
          ...state,
          members: state.members.map((item) => (item.id === member.id ? withPublisher({ ...item, share: 'allowed', lat: null, lng: null, battery, charging }, place) : item)),
        };
      }
      if (isSeedLocation(place.lat, place.lng) && place.accuracyM === 18) return state;
      if (member.updatedAt > place.at && hasLocation(member)) return state;
      const battery = typeof place.batteryPct === 'number' ? Math.round(place.batteryPct) : member.battery;
      const charging = place.charging === true ? true : place.charging === false ? false : member.charging;
      const sameSpot = hasLocation(member) && member.lat === place.lat && member.lng === place.lng;
      const nextName = memberIdOf(place) ? place.name.trim().slice(0, 80) : member.name;
      if (
        sameSpot
        && member.updatedAt === place.at
        && member.battery === battery
        && member.charging === charging
        && member.share === 'allowed'
        && member.name === nextName
        && (member.publisherId || '') === (memberIdOf(place) || '')
      ) return state;
      const now = Date.now();
      const keptTracks = tracksWithinHistory(state.tracks, now);
      const settled = settleTrailPoint(keptTracks[member.id], {
        lat: place.lat,
        lng: place.lng,
        at: place.at,
        accuracyM: place.accuracyM,
      }, now);
      const tracks = isWithinHistory(place.at, now)
        ? { ...keptTracks, [member.id]: settled.points }
        : keptTracks;
      const lat = settled.decision === 'drop' && hasLocation(member) ? member.lat : (settled.lat ?? place.lat);
      const lng = settled.decision === 'drop' && hasLocation(member) ? member.lng : (settled.lng ?? place.lng);
      const keptPlace = carryPlace(member, lat, lng);
      return archiveJourneys({
        ...state,
        visits: visitsWithinHistory(state.visits, now),
        members: state.members.map((item) =>
          item.id === member.id
            ? withPublisher({
                ...item,
                share: 'allowed',
                lat,
                lng,
                accuracyM: Math.max(1, Math.round(place.accuracyM || item.accuracyM || 1)),
                battery,
                charging,
                updatedAt: place.at,
                ...(keptPlace ? { place: keptPlace } : { place: undefined }),
              }, place)
            : item,
        ),
        tracks,
      }, now);
    }
    case 'set-room-family-places': {
      const joinedRoom = state.guardians.some((link) => link.code === action.code);
      if (state.mode !== 'managed' && !joinedRoom) return state;
      const prefix = `family:${action.code}:`;
      const now = Date.now();
      const today = seoulDayKey(now);
      const profiles = action.profiles ?? [];
      const incoming = action.places.filter((place) => place.audience === 'family' && place.sharing && place.lat != null && place.lng != null && Number.isFinite(place.lat) && Number.isFinite(place.lng) && !isSelfEchoPlace(place, state.profile?.id, state.inviteCode));
      const current = state.members.filter((member) => member.id.startsWith(prefix));
      const described = incoming.map((place) => describeFamilyPlace(action.code, place, profiles, current));
      const unchanged = current.length === described.length && described.every((item) => {
        const member = current.find((entry) => entry.id === item.id || (item.memberId && entry.publisherId === item.memberId));
        return !!member
          && member.id === item.id
          && member.updatedAt === item.place.at
          && member.lat === item.place.lat
          && member.lng === item.place.lng
          && member.battery === item.battery
          && member.charging === item.charging
          && member.name === item.name
          && (member.photo || '') === (item.photo || '');
      });
      if (unchanged) return state;
      let tracks = tracksWithinHistory(state.tracks, now);
      let visits = visitsWithinHistory(state.visits, now);
      let journeys = state.journeys ?? {};
      let members = state.members.filter((member) => !member.id.startsWith(prefix));
      for (const item of described) {
        const place = item.place;
        if (place.lat == null || place.lng == null) continue;
        const previous = current.find((entry) => entry.id === item.id || (item.memberId !== '' && entry.publisherId === item.memberId) || entry.id === item.legacyId);
        if (previous && previous.id !== item.id) {
          tracks = moveKeyed(tracks, previous.id, item.id);
          visits = moveKeyed(visits, previous.id, item.id);
          journeys = moveKeyed(journeys, previous.id, item.id);
        }
        const keptPlace = previous ? carryPlace(previous, place.lat, place.lng) : '';
        members = [...members, {
          id: item.id,
          name: item.name,
          role: 'admin-share',
          lat: place.lat,
          lng: place.lng,
          accuracyM: Math.max(1, Math.round(place.accuracyM || 1)),
          battery: item.battery,
          charging: item.charging,
          updatedAt: place.at,
          moving: null,
          share: 'allowed',
          ...(item.memberId ? { publisherId: item.memberId } : {}),
          ...(item.photo ? { photo: item.photo } : {}),
          ...(keptPlace ? { place: keptPlace } : {}),
        }];
        if (isWithinHistory(place.at, now)) {
          const settled = settleTrailPoint(tracks[item.id], { lat: place.lat, lng: place.lng, at: place.at, accuracyM: place.accuracyM }, now);
          tracks = { ...tracks, [item.id]: settled.points };
          const pinned = members[members.length - 1];
          if (pinned && settled.decision !== 'keep' && settled.lat != null && settled.lng != null) {
            members[members.length - 1] = { ...pinned, lat: settled.lat, lng: settled.lng };
          }
        }
      }
      for (const member of current) {
        if (!members.some((item) => item.id === member.id)) delete tracks[member.id];
      }
      return archiveJourneys({ ...state, members, tracks, visits, journeys, trailDay: today }, now);
    }
    case 'apply-shared-profiles': {
      const profiles = action.profiles.filter((profile) => isMemberId(profile.memberId) && profile.memberId !== state.profile?.id);
      if (profiles.length === 0) return state;
      let members = state.members;
      let changed = false;
      for (const profile of profiles) {
        const index = memberIndexForProfile(members, profile, action.code);
        if (index < 0) continue;
        const member = members[index];
        const name = profile.name.trim().slice(0, 20);
        if (!name) continue;
        const sentPhoto = typeof profile.photo === 'string' ? cleanPhoto(profile.photo) : undefined;
        const photo = typeof profile.photo === 'string' ? (sentPhoto || member.photo) : undefined;
        if (member.name === name && (member.photo || '') === (photo || '') && member.publisherId === profile.memberId) continue;
        changed = true;
        members = members.map((item, itemIndex) => (itemIndex === index
          ? { ...item, name, publisherId: profile.memberId, ...(photo ? { photo } : { photo: undefined }) }
          : item));
      }
      return changed ? { ...state, members } : state;
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
    case 'close-journeys':
      return archiveJourneys(state, action.now);
    case 'set-journey-label': {
      const list = state.journeys[action.memberId];
      if (!list) return state;
      const label = action.label.trim().slice(0, 120);
      if (!label) return state;
      let changed = false;
      const next = list.map((journey) => {
        const place = journey[action.which];
        if (!place || place.label === label) return journey;
        const near = Number.isFinite(action.lat) && Number.isFinite(action.lng)
          && haversineMeters(place, { lat: action.lat as number, lng: action.lng as number }) <= 80;
        if (journey.id !== action.id && !near) return journey;
        if (place.label && journey.id !== action.id) return journey;
        changed = true;
        return { ...journey, [action.which]: { ...place, label } };
      });
      if (!changed) return state;
      return { ...state, journeys: { ...state.journeys, [action.memberId]: next } };
    }
    case 'set-display-name': {
      if (!state.profile) return state;
      const next = localProfile(action.name, state.profile.id);
      if (!next) return state;
      const profile = {
        ...next,
        profileKey: state.profile.profileKey || deviceProfileKey(),
        ...(state.profile.photo ? { photo: state.profile.photo } : {}),
      };
      return {
        ...state,
        profile,
        members: state.members.map((member) => (member.id === 'self' ? { ...member, name: profile.name } : member)),
      };
    }
    case 'set-photo': {
      if (!state.profile) return state;
      const photo = cleanPhoto(action.photo);
      const profile = photo ? { ...state.profile, photo } : { ...state.profile, photo: undefined };
      return {
        ...state,
        profile,
        members: state.members.map((member) => (
          member.id === 'self' ? { ...member, ...(photo ? { photo } : { photo: undefined }) } : member
        )),
      };
    }
    case 'set-self-place':
      return reducer(state, { type: 'set-member-place', id: 'self', place: action.place });
    case 'set-member-place': {
      const place = cleanPlace(action.place);
      const current = state.members.find((member) => member.id === action.id);
      if (!current || cleanPlace(current.place) === place) return state;
      return {
        ...state,
        members: state.members.map((member) => (
          member.id === action.id ? { ...member, ...(place ? { place } : { place: undefined }) } : member
        )),
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
  testSwitchMode: () => void;
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
  acceptInvite: (label: string, code: string, syncToken?: string | null, rosterName?: string | null, adminName?: string | null) => void;
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
  applySharedProfiles: (code: string, profiles: SharedProfile[]) => void;
  setRoomFamilyPlaces: (code: string, places: SharedPlace[], profiles?: SharedProfile[]) => void;
  mergeVisits: (memberId: string, stops: DayStop[]) => void;
  setVisitLabel: (memberId: string, id: string, label: string) => void;
  closeJourneys: (now: number) => void;
  setJourneyLabel: (memberId: string, id: string, which: 'start' | 'end', label: string, lat?: number, lng?: number) => void;
  setPhoto: (photo: string | null) => void;
  setDisplayName: (name: string) => void;
  setSelfPlace: (place: string | null) => void;
  setMemberPlace: (id: string, place: string | null) => void;
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
    try {
      sessionStorage.setItem(STORAGE_KEY, raw);
      localStorage.setItem(key, raw);
      localStorage.setItem(`${key}:at`, String(Date.now()));
    } catch {
      /* 용량이 가득 차도 화면의 상태는 유지한다 */
    }
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
    testSwitchMode: () => dispatch({ type: 'test-switch-mode' }),
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
    acceptInvite: (label, code, syncToken, rosterName, adminName) => dispatch({ type: 'accept-invite', label, code, syncToken: syncToken ?? null, rosterName: rosterName ?? null, adminName: adminName ?? null }),
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
    applySharedProfiles: (code, profiles) => dispatch({ type: 'apply-shared-profiles', code, profiles }),
    setRoomFamilyPlaces: (code, places, profiles) => dispatch({ type: 'set-room-family-places', code, places, profiles: profiles ?? [] }),
    mergeVisits: (memberId, stops) => dispatch({ type: 'merge-visits', memberId, stops }),
    setVisitLabel: (memberId, id, label) => dispatch({ type: 'set-visit-label', memberId, id, label }),
    closeJourneys: (now) => dispatch({ type: 'close-journeys', now }),
    setJourneyLabel: (memberId, id, which, label, lat, lng) => dispatch({ type: 'set-journey-label', memberId, id, which, label, lat, lng }),
    setPhoto: (photo) => dispatch({ type: 'set-photo', photo }),
    setDisplayName: (name) => dispatch({ type: 'set-display-name', name }),
    setSelfPlace: (place) => dispatch({ type: 'set-self-place', place }),
    setMemberPlace: (id, place) => dispatch({ type: 'set-member-place', id, place }),
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
