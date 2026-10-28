export const GOOGLE_ACCOUNT_KEY: string;
export const GOOGLE_SETUP_MESSAGE: string;
export const GOOGLE_VERIFY_MESSAGE: string;
export const GOOGLE_CANCEL_MESSAGE: string;

export function googleWebClientId(value: unknown): string;

export function decodeJwt(token: unknown): {
  header: { alg?: string; kid?: string };
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array;
} | null;

export function claimsLookVerified(payload: { iss?: string; aud?: string | string[]; exp?: number; sub?: string } | null, clientId: string, now: number): boolean;

export function verifyGoogleIdToken(
  token: string,
  clientId: string,
  options?: { now?: number; fetchCerts?: (kid: string) => Promise<{ keys?: Array<{ kid?: string; kty?: string; n?: string; e?: string }> } | null> },
): Promise<{ ok: true; claims: Record<string, unknown> } | { ok: false; message: string }>;

export function readGoogleAccount(storage: { getItem: (key: string) => string | null } | null): { sub: string; localId: string; name: string; email: string } | null;

export function writeGoogleAccount(storage: { setItem: (key: string, value: string) => void } | null, account: { sub: string; localId: string; name: string; email: string }): void;

export function profileFromGoogle(
  claims: { sub?: string; name?: string; email?: string } | null,
  saved: { sub: string; localId: string; name: string; email?: string } | null,
): { profile: { id: string; name: string }; account: { sub: string; localId: string; name: string; email: string } } | null;
