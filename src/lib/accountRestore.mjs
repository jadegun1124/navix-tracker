// Apply a Worker account snapshot onto this phone. The member id stays the
// same so the family room does not mint a second card.

import { formatRecoveryCode, normalizeRecoveryCode } from '../../sync/account.mjs';
import { clearGoogleAccount } from './googleAuth.mjs';

export const ACCOUNT_KEY_STORAGE = 'umap_account_key_v1';
export const RECOVERY_CODE_STORAGE = 'umap_recovery_code_v1';

const MEMBER_ID = /^local-[a-z0-9]{3,64}$/;
const KEY_PART = /^[A-Za-z0-9_-]{16,64}$/;

export function readStoredAccountKey(storage) {
  if (!storage) return '';
  const value = storage.getItem(ACCOUNT_KEY_STORAGE);
  return typeof value === 'string' && KEY_PART.test(value) ? value : '';
}

export function writeStoredAccountKey(storage, key) {
  if (!storage || !key || !KEY_PART.test(key)) return;
  storage.setItem(ACCOUNT_KEY_STORAGE, key);
}

export function readStoredRecoveryCode(storage) {
  if (!storage) return '';
  return formatRecoveryCode(storage.getItem(RECOVERY_CODE_STORAGE) || '');
}

export function writeStoredRecoveryCode(storage, code) {
  if (!storage) return;
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return;
  storage.setItem(RECOVERY_CODE_STORAGE, normalized);
}

export function clearStoredAccount(storage) {
  if (!storage) return;
  storage.removeItem(ACCOUNT_KEY_STORAGE);
  storage.removeItem(RECOVERY_CODE_STORAGE);
}

let accountBackupEpoch = 0;

export function currentAccountBackupEpoch() {
  return accountBackupEpoch;
}

export function invalidateAccountBackup() {
  accountBackupEpoch += 1;
  return accountBackupEpoch;
}

export function persistAccountSecretsIfCurrent(storage, account, epoch) {
  if (epoch !== accountBackupEpoch) return false;
  rememberAccountSecrets(storage, account);
  return true;
}

export function logoutLocalAccount(storage) {
  invalidateAccountBackup();
  clearStoredAccount(storage);
  clearGoogleAccount(storage);
}

export function rememberAccountSecrets(storage, account) {
  if (!account) return;
  if (account.accountKey) writeStoredAccountKey(storage, account.accountKey);
  if (account.recoveryCode) writeStoredRecoveryCode(storage, account.recoveryCode);
}

export const ACCOUNT_LINKED_OTHER_MESSAGE = '이 로그인은 다른 사람에 이미 연결되어 있습니다. 이 폰의 지도를 바꾸지 않았습니다.';

export function linkedAccountWouldSwitch(currentMemberId, account) {
  const current = typeof currentMemberId === 'string' ? currentMemberId : '';
  const next = account && typeof account.memberId === 'string' ? account.memberId : '';
  return Boolean(current && next && current !== next);
}

function selfJourneys(journeys, memberId) {
  if (!journeys || typeof journeys !== 'object') return [];
  if (Array.isArray(journeys.self) && journeys.self.length) return journeys.self;
  if (memberId && Array.isArray(journeys[memberId])) return journeys[memberId];
  return [];
}

function selfVisits(visits, memberId) {
  if (!visits || typeof visits !== 'object') return [];
  if (Array.isArray(visits.self) && visits.self.length) return visits.self;
  if (memberId && Array.isArray(visits[memberId])) return visits[memberId];
  return [];
}

export function snapshotFromSession(state) {
  const profile = state && state.profile;
  if (!profile || !MEMBER_ID.test(profile.id) || !KEY_PART.test(profile.profileKey || '')) return null;
  if (!state.inviteCode || !KEY_PART.test(state.syncWriteKey || '') || !KEY_PART.test(state.syncReadKey || '')) return null;
  return {
    memberId: profile.id,
    profileKey: profile.profileKey,
    profile: { name: profile.name, photo: profile.photo || null },
    room: {
      code: state.inviteCode,
      writeKey: state.syncWriteKey,
      readKey: state.syncReadKey,
    },
    guardians: Array.isArray(state.guardians) ? state.guardians : [],
    home: state.home || null,
    journeys: selfJourneys(state.journeys, profile.id),
    visits: selfVisits(state.visits, profile.id),
  };
}

function selfMember(profile) {
  return {
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
    ...(profile.photo ? { photo: profile.photo } : {}),
  };
}

export function applyAccountSnapshot(state, account) {
  if (!account || !MEMBER_ID.test(account.memberId || '') || !account.room) return state;
  if (!KEY_PART.test(account.profileKey || '') || !KEY_PART.test(account.room.writeKey || '') || !KEY_PART.test(account.room.readKey || '')) {
    return state;
  }
  const name = typeof account.profile?.name === 'string' ? account.profile.name.trim().slice(0, 20) : '';
  if (!name) return state;
  const photo = typeof account.profile?.photo === 'string' && account.profile.photo.startsWith('data:image/')
    ? account.profile.photo
    : undefined;
  const profile = {
    id: account.memberId,
    name,
    profileKey: account.profileKey,
    ...(photo ? { photo } : {}),
  };
  const journeys = Array.isArray(account.journeys) ? account.journeys : [];
  const visits = Array.isArray(account.visits) ? account.visits : [];
  const nextStage = state.permissions?.completed ? 'map' : 'survey';
  return {
    ...state,
    profile,
    members: [selfMember(profile)],
    inviteCode: account.room.code,
    syncWriteKey: account.room.writeKey,
    syncReadKey: account.room.readKey,
    guardians: Array.isArray(account.guardians) ? account.guardians : [],
    home: account.home || null,
    journeys: journeys.length ? { self: journeys } : {},
    visits: visits.length ? { self: visits } : {},
    tracks: {},
    trailRevisions: {},
    hiddenMemberIds: [],
    pendingInvite: null,
    pendingLeaveAlert: null,
    pendingSyncToken: null,
    shareSelfWithFamily: state.permissions?.completed === true,
    mode: null,
    stage: nextStage,
    tab: 'map',
  };
}

export function restoredProfile(account) {
  if (!account || !MEMBER_ID.test(account.memberId || '')) return null;
  const name = typeof account.profile?.name === 'string' ? account.profile.name.trim().slice(0, 20) : '';
  if (!name) return null;
  return {
    id: account.memberId,
    name,
    profileKey: account.profileKey,
    ...(account.profile?.photo ? { photo: account.profile.photo } : {}),
  };
}
