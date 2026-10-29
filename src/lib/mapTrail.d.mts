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
