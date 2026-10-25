/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_VWORLD_API_KEY?: string;
  /** Cloudflare Worker origin. Public in the built app. Empty keeps same-browser sharing. */
  readonly VITE_FAMILY_SYNC_URL?: string;
}
