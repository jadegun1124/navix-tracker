export const ACCOUNT_KEY_STORAGE: string;
export const RECOVERY_CODE_STORAGE: string;

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} | null;

export type AccountSnapshot = {
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
};

export function readStoredAccountKey(storage: StorageLike): string;
export function writeStoredAccountKey(storage: StorageLike, key: string): void;
export function readStoredRecoveryCode(storage: StorageLike): string;
export function writeStoredRecoveryCode(storage: StorageLike, code: string): void;
export function clearStoredAccount(storage: StorageLike): void;
export function logoutLocalAccount(storage: StorageLike): void;
export function rememberAccountSecrets(storage: StorageLike, account: AccountSnapshot | null | undefined): void;

export function snapshotFromSession(state: unknown): AccountSnapshot | null;
export function applyAccountSnapshot<T>(state: T, account: AccountSnapshot | null | undefined): T;
export function restoredProfile(account: AccountSnapshot | null | undefined): {
  id: string;
  name: string;
  profileKey?: string;
  photo?: string;
} | null;
