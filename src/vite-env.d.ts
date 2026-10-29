/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Public OAuth web client id. Not a secret. Empty keeps Google sign-in closed. */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  /** Kakao native app key. Not a secret. Empty keeps Kakao sign-in closed. */
  readonly VITE_KAKAO_NATIVE_APP_KEY?: string;
  /** Naver Login client id. Not a secret. Empty keeps Naver sign-in closed. */
  readonly VITE_NAVER_CLIENT_ID?: string;
  readonly VITE_VWORLD_API_KEY?: string;
  /** Cloudflare Worker origin. Public in the built app. Empty keeps same-browser sharing. */
  readonly VITE_FAMILY_SYNC_URL?: string;
}
