import {
  ACCOUNT_KEY_STORAGE,
  RECOVERY_CODE_STORAGE,
  applyAccountSnapshot,
  currentAccountBackupEpoch,
  persistAccountSecretsIfCurrent,
  readStoredAccountKey,
  readStoredRecoveryCode,
  rememberAccountSecrets,
  snapshotFromSession,
  writeStoredAccountKey,
  writeStoredRecoveryCode,
} from '../lib/accountRestore.mjs';
import { familySyncUrl } from './familySync';

export {
  ACCOUNT_KEY_STORAGE,
  RECOVERY_CODE_STORAGE,
  applyAccountSnapshot,
  readStoredAccountKey,
  readStoredRecoveryCode,
  rememberAccountSecrets,
  snapshotFromSession,
  writeStoredAccountKey,
  writeStoredRecoveryCode,
};

export interface AccountSnapshot {
  memberId: string;
  profileKey: string;
  profile: { name: string; photo?: string | null };
  room: { code: string; writeKey: string; readKey: string };
  guardians?: unknown[];
  home?: unknown;
  journeys?: unknown[];
  visits?: unknown[];
  recoveryCode?: string;
  accountKey?: string;
  googleLinked?: boolean;
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const base = familySyncUrl();
  if (!base) throw new Error('off');
  return fetch(`${base}${path}`, { ...init, signal: timeoutSignal(10_000), cache: 'no-store' });
}

function accountHeaders(accountKey?: string): Headers {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (accountKey) headers.set('x-umap-account-key', accountKey);
  return headers;
}

async function readAccountBody(response: Response): Promise<{ ok: boolean; account?: AccountSnapshot; restored?: boolean; message?: string }> {
  const body = await response.json().catch(() => null) as { ok?: boolean; account?: AccountSnapshot; restored?: boolean; message?: string } | null;
  if (!response.ok || !body || body.ok !== true || !body.account) {
    return { ok: false, message: body && typeof body.message === 'string' ? body.message : '계정을 불러오지 못했습니다.' };
  }
  return { ok: true, account: body.account, restored: body.restored === true };
}

export async function registerFamilyAccount(snapshot: AccountSnapshot) {
  const response = await request('/v1/account', {
    method: 'POST',
    headers: accountHeaders(),
    body: JSON.stringify(snapshot),
  });
  return readAccountBody(response);
}

export async function backupFamilyAccount(snapshot: AccountSnapshot, accountKey = readStoredAccountKey(localStorage)) {
  if (!accountKey) return registerFamilyAccount(snapshot);
  const response = await request('/v1/account', {
    method: 'PUT',
    headers: accountHeaders(accountKey),
    body: JSON.stringify(snapshot),
  });
  return readAccountBody(response);
}

export async function recoverFamilyAccount(code: string) {
  const response = await request('/v1/account/recover', {
    method: 'POST',
    headers: accountHeaders(),
    body: JSON.stringify({ code }),
  });
  return readAccountBody(response);
}

export async function linkGoogleAccount(idToken: string, snapshot?: AccountSnapshot | null) {
  const accountKey = readStoredAccountKey(typeof localStorage === 'undefined' ? null : localStorage);
  const response = await request('/v1/account/google', {
    method: 'POST',
    headers: accountHeaders(accountKey),
    body: JSON.stringify({
      idToken,
      ...(snapshot ? { snapshot } : {}),
      ...(accountKey ? { accountKey } : {}),
    }),
  });
  return readAccountBody(response);
}

export async function persistAccountResult(result: { ok: boolean; account?: AccountSnapshot }) {
  if (!result.ok || !result.account) return;
  rememberAccountSecrets(localStorage, result.account);
}

let backupTimer = 0;
let backupInflight = false;

export function cancelAccountBackup() {
  if (typeof window !== 'undefined') window.clearTimeout(backupTimer);
  backupTimer = 0;
  backupInflight = false;
}

export function scheduleAccountBackup(state: unknown) {
  if (typeof window === 'undefined' || !familySyncUrl()) return;
  const snapshot = snapshotFromSession(state);
  if (!snapshot) return;
  const epoch = currentAccountBackupEpoch();
  window.clearTimeout(backupTimer);
  backupTimer = window.setTimeout(() => {
    if (backupInflight || epoch !== currentAccountBackupEpoch()) return;
    backupInflight = true;
    void backupFamilyAccount(snapshot)
      .then((result) => {
        if (!result.ok || !result.account) return;
        persistAccountSecretsIfCurrent(
          typeof localStorage === 'undefined' ? null : localStorage,
          result.account,
          epoch,
        );
      })
      .catch(() => undefined)
      .finally(() => {
        backupInflight = false;
      });
  }, 1600);
}
