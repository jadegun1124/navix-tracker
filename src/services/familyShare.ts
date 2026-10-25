import { publishPlaceRemote } from './familySync';

export interface SharedPlace {
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number;
  at: number;
  sharing: boolean;
}

const STORAGE_KEY = 'umap_family_places_v1';
const CHANNEL = 'umap-family-places';

function isPlace(value: unknown): value is SharedPlace {
  if (!value || typeof value !== 'object') return false;
  const place = value as SharedPlace;
  return typeof place.code === 'string' && place.code.length >= 4 && typeof place.at === 'number' && typeof place.sharing === 'boolean';
}

function readMap(): Record<string, SharedPlace> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const places: Record<string, SharedPlace> = {};
    for (const [code, value] of Object.entries(parsed)) {
      if (isPlace(value)) places[code] = value;
    }
    return places;
  } catch {
    return {};
  }
}

export function readSharedPlaces(): SharedPlace[] {
  return Object.values(readMap());
}

export function publishSharedPlace(place: SharedPlace, syncToken?: string | null) {
  const places = readMap();
  const current = places[place.code];
  const same =
    current &&
    current.sharing === place.sharing &&
    current.lat === place.lat &&
    current.lng === place.lng &&
    current.name === place.name &&
    current.accuracyM === place.accuracyM &&
    place.at - current.at < 7000;
  if (!same) {
    places[place.code] = place;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(place);
      channel.close();
    } catch {
      /* BroadcastChannel 이 없는 웹뷰 */
    }
    publishPlaceRemote(place, syncToken);
  }
}

export function subscribeSharedPlaces(onPlace: (place: SharedPlace) => void): () => void {
  let channel: BroadcastChannel | null = null;
  const onMessage = (event: MessageEvent) => {
    if (isPlace(event.data)) onPlace(event.data);
  };
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', onMessage);
  } catch {
    channel = null;
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed: unknown = JSON.parse(event.newValue);
      if (!parsed || typeof parsed !== 'object') return;
      for (const value of Object.values(parsed)) {
        if (isPlace(value)) onPlace(value);
      }
    } catch {
      /* 손상된 좌표 */
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
