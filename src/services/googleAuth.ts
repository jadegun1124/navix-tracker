import { decodeIdTokenPayload, signInFailureCopy } from '../lib/googleIdToken.mjs';
import type { Profile } from '../types/family';

export { GOOGLE_SIGN_IN_SCOPES } from '../lib/authScopes.mjs';
export { signInFailureCopy };

export function googleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error('gis'));
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-umap-gis="1"]');
    if (existing) {
      const readyState = (existing as HTMLScriptElement & { readyState?: string }).readyState;
      const ready = existing.dataset.umapGisReady === '1' || readyState === 'complete' || readyState === 'loaded';
      if (ready) {
        finish();
        return;
      }
      existing.addEventListener('load', () => finish(), { once: true });
      existing.addEventListener('error', () => reject(new Error('gis')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=ko';
    script.async = true;
    script.dataset.umapGis = '1';
    script.onload = () => {
      script.dataset.umapGisReady = '1';
      finish();
    };
    script.onerror = () => reject(new Error('gis'));
    document.head.appendChild(script);
  });
}

export function decodeGoogleCredential(credential: string): Profile | null {
  return decodeIdTokenPayload(credential);
}

export function previewProfile(): Profile {
  return {
    sub: 'preview',
    name: '나',
    email: '',
    picture: null,
    preview: true,
    verifiedPhone: null,
  };
}
