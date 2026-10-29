import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  GOOGLE_CANCEL_MESSAGE,
  GOOGLE_SETUP_MESSAGE,
  GOOGLE_VERIFY_MESSAGE,
  googleWebClientId,
  profileFromGoogle,
  readGoogleAccount,
  writeGoogleAccount,
} from '../lib/googleAuth.mjs';
import { localProfile } from '../lib/localProfile.mjs';
import { restoredProfile } from '../lib/accountRestore.mjs';
import { linkGoogleAccount, persistAccountResult, type AccountSnapshot } from './familyAccount';
import { familySyncUrl } from './familySync';

interface NativeGoogleSignIn {
  signIn(options: { webClientId: string }): Promise<{ ok: boolean; idToken?: string; code?: string }>;
}

const nativeAuth = registerPlugin<NativeGoogleSignIn>('UmapAuth');

export interface GoogleSignInResult {
  ok: boolean;
  profile?: { id: string; name: string; profileKey?: string; photo?: string };
  snapshot?: AccountSnapshot;
  restored?: boolean;
  message?: string;
}

export function configuredGoogleWebClientId() {
  return googleWebClientId(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID);
}

async function fetchGoogleCerts() {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) return null;
  return response.json() as Promise<{ keys?: Array<{ kid?: string; kty?: string; n?: string; e?: string }> }>;
}

function profileFromAccount(account: AccountSnapshot) {
  return restoredProfile(account) || localProfile(account.profile?.name || '가족', account.memberId);
}

async function acceptToken(idToken: string, snapshot?: AccountSnapshot | null): Promise<GoogleSignInResult> {
  if (familySyncUrl()) {
    const linked = await linkGoogleAccount(idToken, snapshot).catch(() => ({ ok: false as const, message: GOOGLE_VERIFY_MESSAGE }));
    if (!linked.ok || !linked.account) return { ok: false, message: linked.message || GOOGLE_VERIFY_MESSAGE };
    await persistAccountResult(linked);
    const profile = profileFromAccount(linked.account);
    if (!profile) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
    return { ok: true, profile, snapshot: linked.account, restored: linked.restored === true };
  }
  const { verifyGoogleIdToken } = await import('../lib/googleAuth.mjs');
  const verified = await verifyGoogleIdToken(idToken, configuredGoogleWebClientId(), { fetchCerts: fetchGoogleCerts });
  if (!verified.ok) return verified;
  const linked = profileFromGoogle(verified.claims, readGoogleAccount(localStorage));
  if (!linked) return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
  writeGoogleAccount(localStorage, linked.account);
  return { ok: true, profile: linked.profile };
}

async function nativeIdToken(webClientId: string): Promise<{ ok: boolean; idToken?: string; code?: string }> {
  return nativeAuth.signIn({ webClientId }).catch(() => ({ ok: false as const, code: 'failed' }));
}

interface GoogleIdHost {
  google?: {
    accounts?: {
      id?: {
        initialize(config: { client_id: string; callback: (response: { credential?: string }) => void; nonce?: string; use_fedcm_for_prompt?: boolean }): void;
        prompt(callback?: (notification: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean }) => void): void;
      };
    };
  };
}

function googleWindow() {
  return window as unknown as GoogleIdHost;
}

function loadGoogleScript() {
  const existing = document.querySelector('script[data-umap-google="1"]');
  if (existing && googleWindow().google?.accounts?.id) return Promise.resolve();
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

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function browserIdToken(webClientId: string): Promise<string> {
  await loadGoogleScript();
  const id = googleWindow().google?.accounts?.id;
  if (!id) throw new Error('gis');
  const nonce = randomNonce();
  return new Promise<string>((resolve, reject) => {
    id.initialize({
      client_id: webClientId,
      nonce,
      use_fedcm_for_prompt: true,
      callback: (response) => {
        if (response?.credential) resolve(response.credential);
        else reject(new Error('token'));
      },
    });
    id.prompt((notification) => {
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) reject(new Error('canceled'));
    });
  });
}

export async function signInWithGoogle(snapshot?: AccountSnapshot | null): Promise<GoogleSignInResult> {
  const webClientId = configuredGoogleWebClientId();
  if (!webClientId) return { ok: false, message: GOOGLE_SETUP_MESSAGE };
  let idToken = '';
  if (Capacitor.isNativePlatform()) {
    const result = await nativeIdToken(webClientId);
    if (!result.ok || !result.idToken) {
      if (result.code === 'missing-client') return { ok: false, message: GOOGLE_SETUP_MESSAGE };
      if (result.code === 'canceled') return { ok: false, message: GOOGLE_CANCEL_MESSAGE };
      return { ok: false, message: GOOGLE_VERIFY_MESSAGE };
    }
    idToken = result.idToken;
  } else {
    try {
      idToken = await browserIdToken(webClientId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return { ok: false, message: message === 'canceled' ? GOOGLE_CANCEL_MESSAGE : GOOGLE_VERIFY_MESSAGE };
    }
  }
  return acceptToken(idToken, snapshot);
}
