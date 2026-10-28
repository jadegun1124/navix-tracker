// Reverse geocode for the family card.
// VWorld is first when VITE_VWORLD_API_KEY is set. Nominatim covers a missing
// key and a failed VWorld response. The card stores the shortened 시·동 line.
// The literal place label 「근처」 is never returned.

import { APP_VERSION_NAME } from './appRelease.mjs';

const NOMINATIM_UA = `Umap/${APP_VERSION_NAME} (family location; https://github.com/jadegun1124/umap)`;
const CACHE_KEY = 'umap_geocode_cache_v1';
const NOMINATIM_GAP_MS = 1100;
let nominatimNotBefore = 0;

const DONG_KEYS = ['quarter', 'suburb', 'neighbourhood', 'village', 'hamlet', 'city_district'];
const DISTRICT_KEYS = ['borough', 'city', 'town', 'county', 'municipality'];

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function readVworldKey(env = import.meta.env) {
  const key = String(env && env.VITE_VWORLD_API_KEY ? env.VITE_VWORLD_API_KEY : '').trim();
  if (!key || key === 'undefined' || key === 'null') return '';
  return key;
}

export function shortenAddress(text) {
  const clean = String(text || '').trim().replace(/[,，]/g, ' ').replace(/\s+/g, ' ');
  if (!clean || clean === '근처') return '';
  const parts = clean.split(' ').filter((part) => part && part !== '근처');
  const district = parts.find((part) => /(?:시|군|구)$/.test(part) && !/특별|광역|자치/.test(part));
  const dong = parts.find((part) => /(?:동|읍|면|리|가)$/.test(part));
  if (district && dong) return `${district} ${dong}`;
  if (district) return district;
  const joined = parts.join(' ');
  if (!joined || joined === '근처') return '';
  return joined.length > 28 ? `${joined.slice(0, 28)}…` : joined;
}

function addressValues(address, keys) {
  if (!address || typeof address !== 'object') return [];
  const values = [];
  for (const key of keys) {
    const value = address[key];
    if (typeof value === 'string' && value.trim() && value.trim() !== '근처') values.push(value.trim());
  }
  return values;
}

function isDong(value) {
  return /(?:동|읍|면|리|가)$/.test(value);
}

export function nominatimAddress(body) {
  const address = body && typeof body === 'object' ? body.address : null;
  const district = addressValues(address, DISTRICT_KEYS).find((value) => /(?:시|군|구)$/.test(value) && !/특별|광역|자치/.test(value)) || '';
  const dong = addressValues(address, DONG_KEYS).find(isDong) || '';
  const structured = shortenAddress([district, dong].filter(Boolean).join(' '));
  const display = shortenAddress(body && typeof body.display_name === 'string' ? body.display_name : '');
  const hasDong = (label) => isDong((label || '').split(' ').at(-1) || '');
  if (hasDong(structured)) return structured;
  if (hasDong(display)) return display;
  return structured || display;
}

export function vworldAddress(body) {
  const text = body && typeof body === 'object' ? body.response?.result?.[0]?.text : '';
  return shortenAddress(typeof text === 'string' ? text : '');
}

function bucket(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readCache() {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cache = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim() && value.trim() !== '근처') cache[key] = value;
    }
    return cache;
  } catch {
    return {};
  }
}

function writeCache(cache) {
  const store = storage();
  if (!store) return;
  try {
    const keys = Object.keys(cache);
    const trimmed = keys.length > 200
      ? Object.fromEntries(keys.slice(-200).map((key) => [key, cache[key]]))
      : cache;
    store.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* 저장 공간이 꽉 차도 주소 표시는 계속한다 */
  }
}

export function cachedAddress(lat, lng) {
  const hit = readCache()[bucket(lat, lng)];
  const short = hit ? shortenAddress(hit) : '';
  return short || null;
}

async function paceNominatim() {
  const now = Date.now();
  const wait = nominatimNotBefore - now;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  nominatimNotBefore = Date.now() + NOMINATIM_GAP_MS;
}

async function readJson(response) {
  if (!response || response.ok === false) return null;
  if (typeof response.json !== 'function') return null;
  return response.json();
}

async function fetchVworld(fetchImpl, lat, lng, key) {
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
  const response = await fetchImpl(url.toString(), { signal: timeoutSignal(8000) });
  return vworldAddress(await readJson(response));
}

async function fetchNominatim(fetchImpl, lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '18');
  // 한국어는 쿼리로만 받는다. Accept-Language 헤더를 같이 보내면
  // 브라우저에서 Access-Control-Allow-Origin이 빠져 요청이 실패한다.
  url.searchParams.set('accept-language', 'ko');
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { 'User-Agent': NOMINATIM_UA },
      signal: timeoutSignal(8000),
    });
  } catch (error) {
    const message = error && error.message ? String(error.message) : '';
    if (!(error instanceof TypeError) || !/unsafe header|User-Agent/i.test(message)) throw error;
    response = await fetchImpl(url.toString(), { signal: timeoutSignal(8000) });
  }
  return nominatimAddress(await readJson(response));
}

export async function reverseGeocode(lat, lng, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;
  const key = options.key !== undefined ? String(options.key || '') : readVworldKey();
  if (key) {
    try {
      const fromVworld = await fetchVworld(fetchImpl, lat, lng, key);
      if (fromVworld) return fromVworld;
    } catch {
      /* Nominatim으로 넘어간다 */
    }
  }
  try {
    if (options.pace !== false) await paceNominatim();
    const fromNominatim = await fetchNominatim(fetchImpl, lat, lng);
    return fromNominatim || null;
  } catch {
    return null;
  }
}

export async function reverseGeocodeCached(lat, lng, options = {}) {
  const key = bucket(lat, lng);
  const cached = readCache()[key];
  if (cached) {
    const short = shortenAddress(cached);
    if (short) return short;
  }
  const label = await reverseGeocode(lat, lng, options);
  if (!label || label === '근처') return null;
  const cache = readCache();
  cache[key] = label;
  writeCache(cache);
  return label;
}

export const NOMINATIM_USER_AGENT = NOMINATIM_UA;
