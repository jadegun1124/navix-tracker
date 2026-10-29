export function shortenAddress(text: unknown): string;

export function formatPrecisePlace(parts?: {
  dong?: string;
  building?: string;
  unit?: string | number;
  poi?: string;
}): string;

export function presentPlace(text: unknown): string;

export function placeGridKey(lat: number, lng: number): string;

export function nominatimAddress(body: unknown): string;

export function vworldAddress(body: unknown): string;

export function cachedAddress(lat: number, lng: number): string | null;

export function reverseGeocode(
  lat: number,
  lng: number,
  options?: { fetch?: typeof fetch; key?: string; pace?: boolean },
): Promise<string | null>;

export function reverseGeocodeCached(
  lat: number,
  lng: number,
  options?: { fetch?: typeof fetch; key?: string; pace?: boolean },
): Promise<string | null>;

export const NOMINATIM_USER_AGENT: string;
