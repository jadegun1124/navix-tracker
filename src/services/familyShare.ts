import { publishPlaceRemote } from './familySync';

export interface SharedPlace {
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number;
  at: number;
  sharing: boolean;
  batteryPct?: number | null;
  charging?: boolean | null;
  audience?: 'admin' | 'family';
  /** Stable id of the phone that publishes this place. */
  memberId?: string;
  /** Name this phone published before the current one. */
  priorName?: string;
}

export interface SharedProfile {
  memberId: string;
  name: string;
  photo: string | null;
  at: number;
}

const STORAGE_KEY = 'umap_family_places_v1';
const CHANNEL = 'umap-family-places';

function isPlace(value: unknown): value is SharedPlace {
  if (!value || typeof value !== 'object') return false;
  const place = value as SharedPlace;
  if (place.audience != null && place.audience !== 'admin' && place.audience !== 'family') return false;
  return typeof place.code === 'string' && place.code.length >= 4 && typeof place.at === 'number' && typeof place.sharing === 'boolean';
}

function storageKey(place: SharedPlace): string {
  const audience = place.audience === 'family' ? 'family' : 'admin';
  if (place.memberId) return `${place.code}:${audience}:id:${place.memberId}`;
  return `${place.code}:${audience}:${place.name}`;
}

function batteryOf(place: SharedPlace): number | null {
  return typeof place.batteryPct === 'number' && place.batteryPct >= 0 && place.batteryPct <= 100 ? Math.round(place.batteryPct) : null;
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

const remoteSent = new Set<string>();

function remoteFingerprint(place: SharedPlace): string {
  const audience = place.audience === 'family' ? 'family' : 'admin';
  const battery = batteryOf(place);
  const charging = place.charging === true ? '1' : place.charging === false ? '0' : '';
  return `${place.code}|${audience}|${place.memberId ?? ''}|${place.name}|${place.priorName ?? ''}|${place.sharing ? 1 : 0}|${place.lat ?? ''}|${place.lng ?? ''}|${battery ?? ''}|${charging}`;
}

export function publishSharedPlace(place: SharedPlace, syncToken?: string | null, profileKey?: string | null) {
  const places = readMap();
  const key = storageKey(place);
  const audience = place.audience === 'family' ? 'family' : 'admin';
  const legacy = places[place.code];
  if (legacy && legacy.name === place.name && (legacy.audience === 'family' ? 'family' : 'admin') === audience) {
    delete places[place.code];
  }
  if (place.memberId) {
    delete places[`${place.code}:${audience}:${place.name}`];
    if (place.priorName) delete places[`${place.code}:${audience}:${place.priorName}`];
  }
  const current = places[key];
  const battery = batteryOf(place);
  const charging = place.charging === true ? true : place.charging === false ? false : null;
  const same =
    current &&
    current.sharing === place.sharing &&
    current.lat === place.lat &&
    current.lng === place.lng &&
    current.name === place.name &&
    (current.memberId || '') === (place.memberId || '') &&
    current.accuracyM === place.accuracyM &&
    batteryOf(current) === battery &&
    (current.charging === true ? true : current.charging === false ? false : null) === charging &&
    (current.audience === 'family' ? 'family' : 'admin') === (place.audience === 'family' ? 'family' : 'admin') &&
    place.at - current.at < 7000;
  const next = { ...place, batteryPct: battery, charging };
  if (!same) {
    places[key] = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(next);
      channel.close();
    } catch {
      /* BroadcastChannel 이 없는 웹뷰 */
    }
  }
  const fingerprint = remoteFingerprint(next);
  if (syncToken && !remoteSent.has(fingerprint) && publishPlaceRemote(next, syncToken, profileKey)) {
    remoteSent.add(fingerprint);
    if (remoteSent.size > 200) remoteSent.clear();
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
