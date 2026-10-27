export interface GoogleProfileClaims {
  sub: string;
  name: string;
  email: string;
  picture: string | null;
  preview: false;
  verifiedPhone: string | null;
}

export function decodeBase64Url(part: string): string;
export function verifiedPhoneFromClaims(claims: Record<string, unknown> | null | undefined): string | null;
export function profileFromIdTokenClaims(claims: Record<string, unknown> | null | undefined): GoogleProfileClaims | null;
export function decodeIdTokenPayload(credential: string): GoogleProfileClaims | null;
export function signInFailureCopy(code: string): string;
