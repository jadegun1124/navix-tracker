// Reverse geocode for the family card.
// VWorld is first when VITE_VWORLD_API_KEY is set. A building layer, and Kakao
// when VITE_KAKAO_REST_API_KEY is set, add an apartment or POI name.
// Nominatim covers a missing key and a failed VWorld response. Overpass fills
// a named building only when the address is still just a neighborhood.
// The literal place label 「근처」 is never returned.

import { APP_VERSION_NAME } from './appRelease.mjs';

const NOMINATIM_UA = `Kinnex/${APP_VERSION_NAME} (family location; https://github.com/jadegun1124/umap)`;
const CACHE_KEY = 'umap_geocode_cache_v3';
const PLACE_LIMIT = 56;
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

function readEnvKey(env, name) {
  const key = String(env && env[name] ? env[name] : '').trim();
  if (!key || key === 'undefined' || key === 'null') return '';
  return key;
}

export function readVworldKey(env = import.meta.env) {
  return readEnvKey(env, 'VITE_VWORLD_API_KEY');
}

export function readKakaoKey(env = import.meta.env) {
  return readEnvKey(env, 'VITE_KAKAO_REST_API_KEY');
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

const PRECISE_WORD = /(?:아파트|단지|빌라|맨션|오피스텔|타운|하우스|마트|백화점|슈퍼|편의점|학교|병원|의원|약국|공원|회관|센터|교회|성당|사찰|역사|역$)/;

function cleanToken(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text || text === '근처') return '';
  return text;
}

function isPrecisePlace(text) {
  return PRECISE_WORD.test(text) || /\d+\s*동/.test(text);
}

function formatUnit(value) {
  const text = cleanToken(value);
  if (!text) return '';
  if (/^\d+\s*동$/.test(text)) return text.replace(/\s+/g, '');
  if (/^\d+$/.test(text)) return `${text}동`;
  return '';
}

/** Apartment + 동, or a named POI. A plain 구·동 address returns empty. */
export function formatPrecisePlace(parts = {}) {
  const dong = cleanToken(parts.dong);
  const building = cleanToken(parts.building);
  const unit = formatUnit(parts.unit);
  const poi = cleanToken(parts.poi);
  if (building) return [building, unit].filter(Boolean).join(' ').slice(0, PLACE_LIMIT);
  if (poi && poi !== dong) return poi.slice(0, PLACE_LIMIT);
  return '';
}

/** Keep a building line. A plain address still becomes 시·동. */
export function presentPlace(text) {
  const clean = cleanToken(String(text || '').replace(/[,，]/g, ' '));
  if (!clean) return '';
  if (isPrecisePlace(clean)) return clean.slice(0, PLACE_LIMIT);
  return shortenAddress(clean);
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

function namedFromAddress(address, namedetails) {
  const sources = [address, namedetails];
  let building = '';
  let poi = '';
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of ['building', 'residential', 'apartments']) {
      const value = cleanToken(source[key]);
      if (value && !building) building = value;
    }
    for (const key of ['amenity', 'shop', 'tourism', 'leisure', 'office']) {
      const value = cleanToken(source[key]);
      if (value && !poi && !isDong(value)) poi = value;
    }
    const name = cleanToken(source.name);
    if (name && !isDong(name) && !/^(대한민국|한국)$/.test(name)) {
      if (PRECISE_WORD.test(name) && !building) building = name;
      else if (!poi) poi = name;
    }
  }
  return { building, poi };
}

export function nominatimAddress(body) {
  const address = body && typeof body === 'object' ? body.address : null;
  const district = addressValues(address, DISTRICT_KEYS).find((value) => /(?:시|군|구)$/.test(value) && !/특별|광역|자치/.test(value)) || '';
  const dong = addressValues(address, DONG_KEYS).find(isDong) || '';
  const named = namedFromAddress(address, body && body.namedetails);
  const precise = formatPrecisePlace({ dong, building: named.building, poi: named.poi });
  if (precise) return precise;
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

/** About 30m. The same cell keeps one label so a building next door can still refresh. */
export function placeGridKey(lat, lng) {
  const latStep = 30 / 111_320;
  const latNumber = Number(lat);
  const lngNumber = Number(lng);
  const latB = Math.round(latNumber / latStep) * latStep;
  const lngStep = latStep / Math.max(0.2, Math.cos((latB * Math.PI) / 180));
  const lngB = Math.round(lngNumber / lngStep) * lngStep;
  return `${latB.toFixed(5)},${lngB.toFixed(5)}`;
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
  const hit = readCache()[placeGridKey(lat, lng)];
  const label = hit ? presentPlace(hit) : '';
  return label || null;
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

function firstText(source, keys) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = cleanToken(source[key]);
    if (value) return value;
  }
  return '';
}

function vworldStructure(body) {
  const item = body && body.response && Array.isArray(body.response.result) ? body.response.result[0] : null;
  const structure = item && item.structure && typeof item.structure === 'object' ? item.structure : {};
  const text = item && typeof item.text === 'string' ? item.text : '';
  const dong = [structure.level4L, structure.level4A, structure.level3].map(cleanToken).find(isDong) || '';
  const district = [structure.level2, structure.level3].map(cleanToken).find((value) => /(?:시|군|구)$/.test(value) && !/특별|광역|자치/.test(value)) || '';
  const fromText = buildingFromText(text);
  const detail = cleanToken(structure.detail);
  const detailBuilding = buildingFromText(detail);
  return {
    text,
    dong,
    district,
    building: fromText.building || detailBuilding.building,
    unit: fromText.unit || detailBuilding.unit,
    poi: fromText.poi || detailBuilding.poi,
  };
}

function buildingFromText(text) {
  const parts = cleanToken(text).split(' ').filter(Boolean);
  let building = '';
  let poi = '';
  let unit = '';
  for (const part of parts) {
    if (!unit && /^\d+동$/.test(part)) unit = part;
    if (!building && /(?:아파트|빌라|맨션|오피스텔|타운|하우스|단지)/.test(part)) building = part;
    else if (!poi && /(?:마트|백화점|슈퍼|편의점|학교|병원|의원|약국|공원|회관|센터)/.test(part) && !isDong(part)) poi = part;
  }
  return { building, unit, poi };
}

function featureName(properties) {
  if (!properties || typeof properties !== 'object') return { building: '', unit: '', poi: '' };
  const building = firstText(properties, ['buld_nm', 'bld_nm', 'bldnm', 'buldNm', 'building_name', 'bldg_nm']);
  const unit = firstText(properties, ['dong_nm', 'buld_dong', 'dongNm']);
  const named = buildingFromText(`${building} ${unit}`);
  return {
    building: named.building || (building && !isDong(building) ? building : ''),
    unit: named.unit || formatUnit(unit),
    poi: named.poi,
  };
}

function vworldBuilding(body) {
  const features = body && body.response && body.response.result && body.response.result.featureCollection
    ? body.response.result.featureCollection.features
    : [];
  if (!Array.isArray(features)) return { building: '', unit: '', poi: '' };
  for (const feature of features) {
    const named = featureName(feature && feature.properties);
    if (named.building || named.poi) return named;
  }
  return { building: '', unit: '', poi: '' };
}

async function fetchVworldAddress(fetchImpl, lat, lng, key, type) {
  const url = new URL('https://api.vworld.kr/req/address');
  url.searchParams.set('service', 'address');
  url.searchParams.set('request', 'getAddress');
  url.searchParams.set('version', '2.0');
  url.searchParams.set('crs', 'epsg:4326');
  url.searchParams.set('point', `${lng},${lat}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('type', type);
  url.searchParams.set('simple', 'false');
  url.searchParams.set('key', key);
  const response = await fetchImpl(url.toString(), { signal: timeoutSignal(8000) });
  return vworldStructure(await readJson(response));
}

function mergeVworldParts(primary, extra) {
  return {
    text: primary.text || extra.text,
    dong: primary.dong || extra.dong,
    district: primary.district || extra.district,
    building: primary.building || extra.building,
    unit: primary.unit || extra.unit,
    poi: primary.poi || extra.poi,
  };
}

async function fetchVworld(fetchImpl, lat, lng, key) {
  let parts = { text: '', dong: '', district: '', building: '', unit: '', poi: '' };
  try {
    parts = mergeVworldParts(parts, await fetchVworldAddress(fetchImpl, lat, lng, key, 'ROAD'));
  } catch {
    /* PARCEL로 이어간다 */
  }
  try {
    parts = mergeVworldParts(parts, await fetchVworldAddress(fetchImpl, lat, lng, key, 'PARCEL'));
  } catch {
    /* 건물 레이어로 이어간다 */
  }
  const precise = formatPrecisePlace(parts);
  if (precise) return precise;
  let building = { building: '', unit: '', poi: '' };
  try {
    const dataUrl = new URL('https://api.vworld.kr/req/data');
    dataUrl.searchParams.set('service', 'data');
    dataUrl.searchParams.set('request', 'GetFeature');
    dataUrl.searchParams.set('data', 'LT_C_BLDGINFO');
    dataUrl.searchParams.set('key', key);
    dataUrl.searchParams.set('format', 'json');
    dataUrl.searchParams.set('crs', 'EPSG:4326');
    dataUrl.searchParams.set('geomFilter', `POINT(${lng} ${lat})`);
    dataUrl.searchParams.set('buffer', '80');
    dataUrl.searchParams.set('size', '8');
    dataUrl.searchParams.set('geometry', 'false');
    const buildingResponse = await fetchImpl(dataUrl.toString(), { signal: timeoutSignal(8000) });
    building = vworldBuilding(await readJson(buildingResponse));
  } catch {
    building = { building: '', unit: '', poi: '' };
  }
  const named = formatPrecisePlace({
    dong: parts.dong,
    building: building.building || parts.building,
    unit: building.unit || parts.unit,
    poi: building.poi || parts.poi,
  });
  if (named) return named;
  return presentPlace(parts.text) || [parts.district, parts.dong].filter(Boolean).join(' ');
}

async function fetchNominatim(fetchImpl, lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('namedetails', '1');
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

async function fetchKakao(fetchImpl, lat, lng, key) {
  const url = new URL('https://dapi.kakao.com/v2/local/geo/coord2address.json');
  url.searchParams.set('x', String(lng));
  url.searchParams.set('y', String(lat));
  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: timeoutSignal(8000),
  });
  const body = await readJson(response);
  const document = body && Array.isArray(body.documents) ? body.documents[0] : null;
  if (!document) return '';
  const road = document.road_address || {};
  const parcel = document.address || {};
  const dong = cleanToken(parcel.region_3depth_name || road.region_3depth_name);
  const building = cleanToken(road.building_name);
  const parsed = buildingFromText(building);
  return formatPrecisePlace({
    dong,
    building: parsed.building || building,
    unit: parsed.unit,
    poi: parsed.poi,
  });
}

async function fetchOverpass(fetchImpl, lat, lng) {
  const query = `[out:json][timeout:8];(way(around:70,${lat},${lng})["name"]["building"];node(around:70,${lat},${lng})["name"];);out tags 8;`;
  const response = await fetchImpl('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
    signal: timeoutSignal(8000),
  });
  const body = await readJson(response);
  const elements = body && Array.isArray(body.elements) ? body.elements : [];
  for (const element of elements) {
    const tags = element && element.tags;
    if (!tags || typeof tags.name !== 'string') continue;
    const name = cleanToken(tags.name);
    if (!name || name === '근처' || isDong(name)) continue;
    const building = tags.building ? name : '';
    const poi = tags.building ? '' : name;
    const precise = formatPrecisePlace({ building, poi });
    if (precise) return precise;
  }
  return '';
}

export async function reverseGeocode(lat, lng, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;
  const key = options.key !== undefined ? String(options.key || '') : readVworldKey();
  const kakaoKey = options.kakaoKey !== undefined ? String(options.kakaoKey || '') : readKakaoKey();
  let coarse = '';
  if (key) {
    try {
      const fromVworld = await fetchVworld(fetchImpl, lat, lng, key);
      if (fromVworld && isPrecisePlace(fromVworld)) return presentPlace(fromVworld);
      if (fromVworld) coarse = fromVworld;
    } catch {
      /* Kakao·Nominatim으로 넘어간다 */
    }
  }
  if (kakaoKey) {
    try {
      const fromKakao = await fetchKakao(fetchImpl, lat, lng, kakaoKey);
      if (fromKakao) return fromKakao;
    } catch {
      /* Nominatim으로 넘어간다 */
    }
  }
  try {
    if (options.pace !== false) await paceNominatim();
    const fromNominatim = await fetchNominatim(fetchImpl, lat, lng);
    if (fromNominatim && isPrecisePlace(fromNominatim)) return presentPlace(fromNominatim);
    try {
      const poi = await fetchOverpass(fetchImpl, lat, lng);
      if (poi) return presentPlace(poi);
    } catch {
      /* 동네 표기를 유지한다 */
    }
    if (fromNominatim) return presentPlace(fromNominatim);
  } catch {
    /* VWorld 동네 표기로 내려간다 */
  }
  return coarse ? presentPlace(coarse) : null;
}

export async function reverseGeocodeCached(lat, lng, options = {}) {
  const key = placeGridKey(lat, lng);
  const cached = readCache()[key];
  if (cached) {
    const label = presentPlace(cached);
    if (label) return label;
  }
  const label = await reverseGeocode(lat, lng, options);
  if (!label || label === '근처') return null;
  const cache = readCache();
  cache[key] = label;
  writeCache(cache);
  return label;
}

export const NOMINATIM_USER_AGENT = NOMINATIM_UA;
