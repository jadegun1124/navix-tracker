import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  GOOGLE_CANCEL_MESSAGE,
  GOOGLE_SETUP_MESSAGE,
  GOOGLE_VERIFY_MESSAGE,
  googleWebClientId,
  profileFromGoogle,
  readGoogleAccount,
  verifyGoogleIdToken,
  writeGoogleAccount,
} from '../lib/googleAuth.mjs';

interface NativeGoogleSignIn {
  signIn(options: { webClientId: string }): Promise<{ ok: boolean; idToken?: string; code?: string }>;
}

const nativeAuth = registerPlugin<NativeGoogleSignIn>('UmapAuth');

export interface GoogleSignInResult {
  ok: boolean;
  profile?: { id: string; name: string };
  message?: string;
}

function clientId() {
  return googleWebClientId(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID);
}

async function fetchGoogleCerts() {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) return null;
  return response.json() as Promise<{ keys?: Array<{ kid?: string; kty?: string; n?: string; e?: string }> }>;
}

function acceptClaims(claims: { sub?: string; name?: string; email?: string }): GoogleSignInResult {
  const linked = profileFromGoogle(claims, readGoogleAccount(localStorage));
  if (!linked) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  writeGoogleAccount(localStorage, linked.account);
  return { ok: true, profile: linked.profile };
}

async function signInNative(webClientId: string): Promise<GoogleSignInResult> {
  const result = await nativeAuth.signIn({ webClientId }).catch(() => ({ ok: false as const, code: 'failed' }));
  if (!result.ok || !result.idToken) {
    if (result.code === 'missing-client') return { ok: false, message: GOOGLE_SETUP_MESSAGE };
    if (result.code === 'canceled') return { ok: false, message: GOOGLE_CANCEL_MESSAGE };
    return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  }
  const verified = await verifyGoogleIdToken(result.idToken, webClientId, { fetchCerts: fetchGoogleCerts });
  if (!verified.ok) return verified;
  return acceptClaims(verified.claims);
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface GoogleOAuthHost {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: { access_token?: string; error?: string }) => void;
          error_callback?: () => void;
        }): GoogleTokenClient;
      };
    };
  };
}

function googleWindow() {
  return window as unknown as GoogleOAuthHost;
}

function loadGoogleScript() {
  const existing = document.querySelector('script[data-umap-google="1"]');
  if (existing && googleWindow().google?.accounts?.oauth2) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.umapGoogle = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gis'));
    document.head.appendChild(script);
  });
}

async function signInBrowser(webClientId: string): Promise<GoogleSignInResult> {
  await loadGoogleScript();
  const oauth = googleWindow().google?.accounts?.oauth2;
  if (!oauth) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  const accessToken = await new Promise<string>((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: webClientId,
      scope: 'openid email profile',
      callback: (response) => {
        if (!response?.access_token) reject(new Error(response?.error || 'token'));
        else resolve(response.access_token);
      },
      error_callback: () => reject(new Error('canceled')),
    });
    client.requestAccessToken();
  }).catch((error: Error) => error);
  if (accessToken instanceof Error) {
    return { ok: false, message: accessToken.message === 'canceled' ? GOOGLE_CANCEL_MESSAGE : GOOGLE_VERIFY_MESSAGE };
  }
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  const claims = await response.json() as { sub?: string; name?: string; email?: string };
  if (!claims.sub) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  return acceptClaims(claims);
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const webClientId = clientId();
  if (!webClientId) return { ok: false, message: GOOGLE_SETUP_MESSAGE };
  if (Capacitor.isNativePlatform()) return signInNative(webClientId);
  return signInBrowser(webClientId);
}
