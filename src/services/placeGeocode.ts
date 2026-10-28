import { vworldApiKey } from './vworld';

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

const CACHE_KEY = 'umap_geocode_cache_v1';
const failed = new Set<string>();

function bucket(lat: number, lng: number) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function readCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cache: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) cache[key] = value;
    }
    return cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, string>) {
  try {
    const keys = Object.keys(cache);
    const trimmed = keys.length > 200
      ? Object.fromEntries(keys.slice(-200).map((key) => [key, cache[key]]))
      : cache;
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* 저장 공간이 꽉 차도 주소 표시는 계속한다 */
  }
}

export function cachedAddress(lat: number, lng: number): string | null {
  const hit = readCache()[bucket(lat, lng)];
  return hit?.trim() ? hit : null;
}

export function shortenAddress(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const parts = clean.split(' ');
  const district = parts.find((part) => /(?:시|군|구)$/.test(part) && !/특별|광역|자치/.test(part));
  const dong = parts.find((part) => /(?:동|읍|면|리|가)$/.test(part));
  if (district && dong) return `${district} ${dong}`;
  if (district) return district;
  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean;
}

export async function reverseGeocodeCached(lat: number, lng: number): Promise<string | null> {
  const key = bucket(lat, lng);
  const cached = readCache()[key];
  if (cached) return cached;
  if (failed.has(key)) return null;
  const label = await reverseGeocode(lat, lng);
  if (!label) {
    failed.add(key);
    return null;
  }
  const cache = readCache();
  cache[key] = label;
  writeCache(cache);
  return label;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = vworldApiKey();
  if (!key) return null;
  const url = new URL('https://api.vworld.kr/req/address');
  url.searchParams.set('service', 'address');
  url.searchParams.set('request', 'getAddress');
  url.searchParams.set('version', '2.0');
  url.searchParams.set('crs', 'epsg:4326');
  url.searchParams.set('point', `${lng},${lat}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('type', 'both');
  url.searchParams.set('simple', 'true');
  url.searchParams.set('key', key);
  try {
    const response = await fetch(url.toString(), { signal: timeoutSignal(8000) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const text = body && typeof body === 'object'
      ? (body as { response?: { result?: { text?: string }[] } }).response?.result?.[0]?.text
      : null;
    return typeof text === 'string' && text.trim() ? text.trim().slice(0, 120) : null;
  } catch {
    return null;
  }
}
