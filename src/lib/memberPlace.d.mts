export function cleanPlace(value: unknown): string;

export function samePlaceBucket(aLat: number, aLng: number, bLat: number, bLng: number): boolean;

export function carryPlace(previous: { lat?: number | null; lng?: number | null; place?: string | null } | null | undefined, lat: number, lng: number): string;

export function memberPlaceLabel(input: {
  place?: string | null;
  located: boolean;
  atHome?: boolean;
  homeLabel?: string | null;
  address?: string | null;
}): string;
