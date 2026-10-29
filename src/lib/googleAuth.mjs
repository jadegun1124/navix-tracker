// Real Google account check. The Google subject is never the family member id.

import { localProfile } from './localProfile.mjs';

export const GOOGLE_ACCOUNT_KEY = 'umap_google_account_v1';

export const GOOGLE_SETUP_MESSAGE = [
  'Google 로그인을 마치지 못했습니다. 이 상태로 시작하지 않습니다.',
  '1. Google Cloud에서 OAuth 웹 클라이언트를 만듭니다.',
  '2. Android 클라이언트 패키지는 kr.co.umap.tracker 이고, SHA-1은 사이드로드 키입니다.',
  '3. VITE_GOOGLE_WEB_CLIENT_ID에 웹 클라이언트 ID를 넣고 앱을 다시 빌드합니다.',
].join('\n');

export const GOOGLE_VERIFY_MESSAGE = 'Google 계정 확인에 실패했습니다. 다시 로그인해 주세요.';
export const GOOGLE_CANCEL_MESSAGE = 'Google 로그인을 취소했습니다.';

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export function googleWebClientId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || !id.endsWith('.apps.googleusercontent.com')) return '';
  if (/your-|placeholder|example/i.test(id)) return '';
  return id;
}

function bytesToB64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(input) {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function decodeJwt(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: b64urlToBytes(parts[2]),
    };
  } catch {
    return null;
  }
}

export function claimsLookVerified(payload, clientId, now) {
  if (!payload || typeof payload !== 'object') return false;
  if (!ISSUERS.has(payload.iss)) return false;
  const audience = payload.aud;
  const matches = audience === clientId || (Array.isArray(audience) && audience.includes(clientId));
  if (!matches) return false;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return false;
  return typeof payload.sub === 'string' && /^[0-9]{5,}$/.test(payload.sub);
}

export async function verifyGoogleIdToken(token, clientId, options = {}) {
  const id = googleWebClientId(clientId);
  if (!id) return { ok: false, message: GOOGLE_SETUP_MESSAGE };
  const decoded = decodeJwt(token);
  const now = typeof options.now === 'number' ? options.now : Date.now();
  if (!decoded || decoded.header?.alg !== 'RS256' || !claimsLookVerified(decoded.payload, id, now)) {
    return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  }
  const fetchCerts = options.fetchCerts;
  if (typeof fetchCerts !== 'function') return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  const certs = await fetchCerts(decoded.header.kid).catch(() => null);
  const jwk = Array.isArray(certs?.keys) ? certs.keys.find((key) => key && key.kid === decoded.header.kid && key.kty === 'RSA' && key.n && key.e) : null;
  if (!jwk) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  ).catch(() => null);
  if (!cryptoKey) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    decoded.signature,
    new TextEncoder().encode(decoded.signingInput),
  ).catch(() => false);
  if (!valid) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  return { ok: true, claims: decoded.payload };
}

export function readGoogleAccount(storage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(GOOGLE_ACCOUNT_KEY) || 'null');
    if (!parsed || typeof parsed.sub !== 'string' || typeof parsed.localId !== 'string' || !parsed.localId.startsWith('local-')) return null;
    return {
      sub: parsed.sub,
      localId: parsed.localId,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
    };
  } catch {
    return null;
  }
}

export function writeGoogleAccount(storage, account) {
  if (!storage || !account) return;
  storage.setItem(GOOGLE_ACCOUNT_KEY, JSON.stringify(account));
}

export function clearGoogleAccount(storage) {
  if (!storage) return;
  storage.removeItem(GOOGLE_ACCOUNT_KEY);
}

export function profileFromGoogle(claims, saved) {
  const sub = claims && claims.sub;
  if (typeof sub !== 'string') return null;
  const reused = saved && saved.sub === sub ? saved.localId : '';
  const name = (saved && saved.sub === sub && saved.name) || (typeof claims.name === 'string' ? claims.name : '') || '가족';
  const profile = localProfile(name, reused);
  if (!profile || profile.id === sub || !profile.id.startsWith('local-')) return null;
  return {
    profile,
    account: {
      sub,
      localId: profile.id,
      name: profile.name,
      email: typeof claims.email === 'string' ? claims.email : '',
    },
  };
}

export { bytesToB64url };
