export function familyMapShowsTrail(input: {
  viewingRecords: boolean;
  detailOpen: boolean;
  showTrail: boolean;
  member: { id?: string; share?: string; role?: string } | null | undefined;
  liveDrawable?: boolean;
}): boolean;

export function recordsDayTrails(input: {
  journeys?: { points?: { lat: number; lng: number; at: number }[] }[] | null;
  livePoints?: { lat: number; lng: number; at: number }[] | null;
  liveDrawable?: boolean;
}): { lat: number; lng: number; at: number }[][];

export function mainOverviewTrails(input: {
  points?: { lat: number; lng: number; at: number; speedMps?: number | null; accuracyM?: number; stayEnd?: boolean }[] | null;
  motionPoints?: { lat: number; lng: number; at: number; speedMps?: number | null; accuracyM?: number; stayEnd?: boolean }[] | null;
  pin?: { lat: number; lng: number; at?: number; speedMps?: number | null; accuracyM?: number } | null;
  moving?: boolean | null;
  located?: boolean;
  now: number;
}): { lat: number; lng: number; at: number }[][];
