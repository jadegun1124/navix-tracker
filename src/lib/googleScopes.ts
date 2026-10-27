/** Google Identity Services ID 토큰에 쓰는 무료 OpenID 범위. 유료 Google API 범위는 넣지 않는다. */
export const GOOGLE_SIGN_IN_SCOPES = ['openid', 'email', 'profile'] as const;

const FREE = new Set<string>(GOOGLE_SIGN_IN_SCOPES);

export function isFreeGoogleSignInScope(scope: string): boolean {
  return FREE.has(scope);
}

export function usesOnlyFreeGoogleSignInScopes(scopes: readonly string[] = GOOGLE_SIGN_IN_SCOPES): boolean {
  return scopes.length > 0 && scopes.every((scope) => FREE.has(scope));
}
