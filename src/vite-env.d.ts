/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Kakao native app key. Not a secret. Empty keeps Kakao sign-in closed on Android. */
  readonly VITE_KAKAO_NATIVE_APP_KEY?: string;
  /** Kakao JavaScript key. Not a secret. Empty keeps Kakao sign-in closed on web. */
  readonly VITE_KAKAO_JAVASCRIPT_KEY?: string;
  /** Naver Login client id. Not a secret. Empty keeps Naver sign-in closed. */
  readonly VITE_NAVER_CLIENT_ID?: string;
  readonly VITE_VWORLD_API_KEY?: string;
  /** Cloudflare Worker origin. Public in the built app. Empty keeps same-browser sharing. */
  readonly VITE_FAMILY_SYNC_URL?: string;
}
