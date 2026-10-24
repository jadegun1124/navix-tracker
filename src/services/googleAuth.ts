import type { Profile } from '../types/family';

export function googleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-umap-gis="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('gis')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=ko';
    script.async = true;
    script.dataset.umapGis = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gis'));
    document.head.appendChild(script);
  });
}

export function decodeGoogleCredential(credential: string): Profile | null {
  try {
    const part = credential.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes)) as {
      sub?: string;
      name?: string;
      email?: string;
      picture?: string;
    };
    if (!json.sub) return null;
    return {
      sub: json.sub,
      name: json.name || json.email || 'Google 사용자',
      email: json.email || '',
      picture: json.picture || null,
      preview: false,
    };
  } catch {
    return null;
  }
}

export function previewProfile(): Profile {
  return {
    sub: 'preview',
    name: '부건',
    email: '',
    picture: null,
    preview: true,
  };
}
