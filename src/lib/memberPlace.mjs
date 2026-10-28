// Card status is the nearest saved address for that pin, not a proximity claim.

export function cleanPlace(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text === '근처') return '';
  return text.slice(0, 40);
}

export function samePlaceBucket(aLat, aLng, bLat, bLng) {
  return Math.abs(aLat - bLat) < 0.001 && Math.abs(aLng - bLng) < 0.001;
}

export function carryPlace(previous, lat, lng) {
  if (!previous || previous.lat == null || previous.lng == null) return '';
  if (!samePlaceBucket(previous.lat, previous.lng, lat, lng)) return '';
  return cleanPlace(previous.place);
}

export function memberPlaceLabel({ place, located, atHome, homeLabel, address }) {
  const named = cleanPlace(place);
  if (named) return named;
  if (atHome) return homeLabel || '우리 집';
  if (!located) return '위치 기다리는 중';
  const near = cleanPlace(address);
  if (near) return near;
  return '';
}
