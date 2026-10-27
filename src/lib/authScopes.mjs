// Google Identity Services ID token. Do not add OAuth scopes beyond this list.
export const GOOGLE_SIGN_IN_SCOPES = Object.freeze(['openid', 'email', 'profile']);

export function isExactSignInScopeList(scopes) {
  return Array.isArray(scopes)
    && scopes.length === GOOGLE_SIGN_IN_SCOPES.length
    && scopes.every((scope, index) => scope === GOOGLE_SIGN_IN_SCOPES[index]);
}
