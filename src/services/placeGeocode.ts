import { vworldApiKey } from './vworld';

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), ms);
  return controller.signal;
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
