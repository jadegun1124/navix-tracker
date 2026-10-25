export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const radius = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function projectMeters(
  point: { lat: number; lng: number },
  origin: { lat: number; lng: number },
): { x: number; y: number } {
  const latM = (point.lat - origin.lat) * 111_320;
  const lngM = (point.lng - origin.lng) * 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: lngM, y: -latM };
}

export function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

export interface TrailPoint {
  lat: number;
  lng: number;
  at: number;
}

export function hasLocation<T extends { lat: number | null; lng: number | null }>(
  point: T,
): point is T & { lat: number; lng: number } {
  return point.lat != null && point.lng != null && Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

export function appendTrail(points: TrailPoint[] | undefined, point: TrailPoint): TrailPoint[] {
  const list = points ? points.slice(-299) : [];
  const last = list[list.length - 1];
  if (last && haversineMeters(last, point) < 12) return points ? points.slice(-300) : [];
  list.push(point);
  return list.slice(-300);
}

export function buildInviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('app', '1');
  url.searchParams.set('invite', code);
  url.searchParams.delete('reset');
  return url.toString();
}
