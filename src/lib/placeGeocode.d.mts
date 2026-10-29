export function shortenAddress(text: unknown): string;

export function formatPrecisePlace(parts?: {
  dong?: string;
  building?: string;
  unit?: string | number;
  poi?: string;
}): string;

export const RESIDENTIAL_SNAP_M: number;
export const POI_SNAP_M: number;

export function choosePlaceLabel(
  candidates: Array<Record<string, unknown>>,
  point: { lat: number; lng: number },
): string;

export function isResidentialPlace(candidate: Record<string, unknown> | null | undefined): boolean;

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
