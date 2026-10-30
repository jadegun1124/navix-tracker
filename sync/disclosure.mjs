// Third-party disclosure ledger. Family-room sync is not a disclosure.
// The only way to hand an account's personal data, location, history, or
// place material to someone outside that family is releaseToThirdParty.
// It appends one hash-chained entry, then returns the checked payload.
// A failed check writes nothing and returns no payload.
//
// Each entry lists the exact categories in the payload. Display name,
// Kakao id, Naver id, family membership, device info, and account or
// recovery metadata are categories, not stored values. Coordinates are
// rejected and never logged.
// The chain lives at disclosure:${memberId}, outside acct:, so account
// erasure does not delete it.
//
// Retention follows 위치정보의 관리적·기술적 보호조치 기준 (방송미디어통신위원회고시,
// 시행 2026-05-18) 제6조⑤: the handling ledger is kept at least six months.
// 위치정보법 제23조제1항 destroys personal location once the purpose is done,
// except the confirmation record 제16조제2항 requires. The one-year cap in
// 시행령 제26조의2③ applies to personal location held with separate consent,
// not to this ledger. Six calendar months is the minimum that meets the
// notice, so withdrawal keeps only entries still inside that window.

const MEMBER_ID = /^local-[a-z0-9]{3,64}$/;
export const DISCLOSURE_CATEGORIES = Object.freeze([
  'name', 'kakao', 'naver', 'family', 'device', 'account', 'location', 'history', 'place', 'other',
]);
const CATEGORIES = new Set(DISCLOSURE_CATEGORIES);
const OPAQUE = new Set(['location', 'history', 'place']);
const STRUCTURAL = new Set(['profile', 'snapshot', 'data', 'items', 'sealed', 'seal', 'envelope', 'record']);
const KEY_CATEGORY = {
  name: 'name',
  displayname: 'name',
  nickname: 'name',
  kakaoid: 'kakao',
  kakaouserid: 'kakao',
  naverid: 'naver',
  naveruserid: 'naver',
  guardians: 'family',
  members: 'family',
  room: 'family',
  invitecode: 'family',
  memberid: 'family',
  membership: 'family',
  device: 'device',
  deviceid: 'device',
  useragent: 'device',
  installid: 'device',
  platform: 'device',
  recoverycode: 'account',
  recoveryhash: 'account',
  accountkey: 'account',
  sessionhash: 'account',
  profilekey: 'account',
  vault: 'account',
  journeys: 'history',
  visits: 'history',
  tracks: 'history',
  history: 'history',
  sealedhistory: 'history',
  placename: 'place',
  address: 'place',
  placelabel: 'place',
  location: 'location',
};
const EARLIEST_AT = Date.UTC(2024, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 366 * DAY_MS;
const MAX_ENTRIES = 400;
const INDEX_KEY = 'disclosure-members';
const COORD_KEYS = new Set(['lat', 'lng', 'latitude', 'longitude', 'coordinates', 'coords', 'coord']);

export const DISCLOSURE_AUDIENCE = 'third-party';

export function disclosureKey(memberId) {
  return `disclosure:${memberId}`;
}

export function disclosureExpiresAt(at) {
  const date = new Date(at);
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 6);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  date.setUTCHours(hours, minutes, seconds, ms);
  return date.getTime();
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function looksLikePhone(value) {
  const compact = String(value ?? '').replace(/[\s\-().+]/g, '');
  if (!compact) return false;
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  return digits.length / compact.length >= 0.8;
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > max || looksLikePhone(text)) return '';
  return text;
}

function familyRecipient(value) {
  const text = value.trim().toLowerCase();
  return text === 'family' || text === '가족' || text === '가족 방' || text === '가족방' || text === 'family-room';
}

function containsCoordinates(value, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === 'string') return /"(?:lat|lng|latitude|longitude)"\s*:/.test(value);
  if (Array.isArray(value)) return value.some((item) => containsCoordinates(item, depth + 1));
  if (typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if (COORD_KEYS.has(String(key).toLowerCase())) return true;
    if (containsCoordinates(child, depth + 1)) return true;
  }
  return false;
}

function canonicalBody(entry) {
  return JSON.stringify({
    v: 2,
    memberId: entry.memberId,
    categories: entry.categories,
    detail: entry.detail,
    rangeStart: entry.rangeStart,
    rangeEnd: entry.rangeEnd,
    recipient: entry.recipient,
    purpose: entry.purpose,
    at: entry.at,
    actor: entry.actor,
    prevHash: entry.prevHash,
  });
}

async function hashEntry(entry) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalBody(entry)));
  return bytesToBase64Url(new Uint8Array(digest));
}

function copyEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const categories = Array.isArray(entry.categories) ? entry.categories.filter((item) => typeof item === 'string') : [];
  return {
    memberId: entry.memberId,
    categories,
    detail: typeof entry.detail === 'string' ? entry.detail : '',
    rangeStart: entry.rangeStart,
    rangeEnd: entry.rangeEnd,
    recipient: entry.recipient,
    purpose: entry.purpose,
    at: entry.at,
    actor: entry.actor,
    prevHash: entry.prevHash,
    hash: entry.hash,
  };
}

async function readChain(store, memberId) {
  const raw = await store.get(disclosureKey(memberId));
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) {
    return { anchor: '', entries: [], broken: true };
  }
  return {
    anchor: typeof raw.anchor === 'string' ? raw.anchor : '',
    entries: raw.entries.map(copyEntry).filter(Boolean),
    broken: false,
  };
}

async function writeChain(store, memberId, chain) {
  await store.put(disclosureKey(memberId), {
    anchor: chain.anchor,
    entries: chain.entries.map(copyEntry),
  });
}

async function rememberMember(store, memberId) {
  const current = await store.get(INDEX_KEY);
  const list = Array.isArray(current) ? current.filter((id) => typeof id === 'string') : [];
  if (!list.includes(memberId)) list.push(memberId);
  await store.put(INDEX_KEY, list);
}

async function forgetMemberIndex(store, memberId) {
  const current = await store.get(INDEX_KEY);
  if (!Array.isArray(current)) return;
  await store.put(INDEX_KEY, current.filter((id) => id !== memberId));
}

export async function verifyDisclosureChain(chain) {
  if (!chain || chain.broken || !Array.isArray(chain.entries)) return false;
  let prev = typeof chain.anchor === 'string' ? chain.anchor : '';
  for (const entry of chain.entries) {
    if (!entry) return false;
    if (entry.prevHash !== prev) return false;
    if (containsCoordinates(entry)) return false;
    const expected = await hashEntry(entry);
    if (entry.hash !== expected) return false;
    prev = entry.hash;
  }
  return true;
}

export async function purgeExpiredDisclosureIndex(store, now = Date.now()) {
  const current = await store.get(INDEX_KEY);
  const list = Array.isArray(current) ? [...current] : [];
  for (const memberId of list) {
    if (typeof memberId === 'string') await purgeExpiredDisclosures(store, memberId, now);
  }
}

export async function purgeExpiredDisclosures(store, memberId, now = Date.now()) {
  if (typeof memberId !== 'string' || !MEMBER_ID.test(memberId)) return { kept: 0 };
  const chain = await readChain(store, memberId);
  if (!chain || chain.broken) return { kept: chain?.entries?.length || 0 };
  let cut = 0;
  while (cut < chain.entries.length) {
    const at = chain.entries[cut].at;
    if (!Number.isInteger(at) || disclosureExpiresAt(at) > now) break;
    cut += 1;
  }
  if (cut === 0) return { kept: chain.entries.length };
  const kept = chain.entries.slice(cut);
  if (!kept.length) {
    await store.delete(disclosureKey(memberId));
    await forgetMemberIndex(store, memberId);
    return { kept: 0 };
  }
  const anchor = chain.entries[cut - 1].hash;
  await writeChain(store, memberId, {
    anchor: typeof anchor === 'string' ? anchor : chain.anchor,
    entries: kept,
  });
  return { kept: kept.length };
}

function normalizeCategories(value) {
  if (!Array.isArray(value) || !value.length || value.length > DISCLOSURE_CATEGORIES.length) return null;
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !CATEGORIES.has(item) || seen.has(item)) return null;
    seen.add(item);
  }
  return DISCLOSURE_CATEGORIES.filter((item) => seen.has(item));
}

function isSealShape(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && value.v === 1 && value.alg === 'A256GCM'
    && typeof value.kid === 'string' && typeof value.iv === 'string' && typeof value.ct === 'string';
}

function inspectPayload(value, state, depth = 0, parentKey = '') {
  if (depth > 8 || value == null) return;
  if (isSealShape(value)) {
    const mapped = KEY_CATEGORY[parentKey.toLowerCase()];
    if (OPAQUE.has(mapped)) state.detected.add(mapped);
    else state.unlabeledSeal = true;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) inspectPayload(item, state, depth + 1, parentKey);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const mapped = KEY_CATEGORY[key.toLowerCase()];
    if (mapped) state.detected.add(mapped);
    else if (!STRUCTURAL.has(key) && !isSealShape(child)) state.unknown.push(key);
    inspectPayload(child, state, depth + 1, key);
  }
}

function categoriesMatch(declared, payload) {
  const state = { detected: new Set(), unknown: [], unlabeledSeal: false };
  inspectPayload(payload, state);
  if (state.unknown.length > 0) {
    if (!declared.includes('other')) return false;
  } else if (declared.includes('other')) return false;
  for (const category of state.detected) {
    if (!declared.includes(category)) return false;
  }
  for (const category of declared) {
    if (category === 'other') continue;
    if (state.detected.has(category)) continue;
    if (state.unlabeledSeal && OPAQUE.has(category)) continue;
    return false;
  }
  if (state.unlabeledSeal && !declared.some((category) => OPAQUE.has(category))) return false;
  return true;
}

function cleanDetail(categories, value) {
  if (!categories.includes('other')) return value == null || value === '' ? '' : null;
  const detail = cleanText(value, 40);
  if (!detail) return null;
  const compact = detail.replace(/-/g, '');
  if (/^[A-Z0-9]{12}$/.test(compact) || /^[A-Za-z0-9_-]{16,}$/.test(detail)) return null;
  if (containsCoordinates(detail)) return null;
  return detail;
}

function publicEntry(entry) {
  if (!entry || !Array.isArray(entry.categories) || !entry.categories.length) return null;
  if (entry.categories.some((item) => !CATEGORIES.has(item))) return null;
  if (!Number.isInteger(entry.rangeStart) || !Number.isInteger(entry.rangeEnd) || !Number.isInteger(entry.at)) return null;
  if (typeof entry.recipient !== 'string' || typeof entry.purpose !== 'string' || typeof entry.actor !== 'string') return null;
  if (entry.categories.includes('other') && (typeof entry.detail !== 'string' || !entry.detail)) return null;
  return {
    categories: entry.categories,
    ...(entry.detail ? { detail: entry.detail } : {}),
    rangeStart: entry.rangeStart,
    rangeEnd: entry.rangeEnd,
    recipient: entry.recipient,
    purpose: entry.purpose,
    at: entry.at,
    actor: entry.actor,
  };
}

export async function listDisclosures(store, memberId, now = Date.now()) {
  if (typeof memberId !== 'string' || !MEMBER_ID.test(memberId)) return { error: 'member' };
  await purgeExpiredDisclosures(store, memberId, now);
  const chain = await readChain(store, memberId);
  if (!chain) return { intact: true, disclosures: [] };
  const intact = await verifyDisclosureChain(chain);
  return {
    intact,
    disclosures: chain.entries.map(publicEntry).filter(Boolean),
  };
}

function approvedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'payload' };
  let copy;
  try {
    copy = structuredClone(payload);
  } catch {
    return { error: 'payload' };
  }
  if (containsCoordinates(copy)) return { error: 'coordinates' };
  return { released: copy };
}

export async function releaseToThirdParty(store, input = {}, now = Date.now()) {
  const memberId = typeof input.memberId === 'string' ? input.memberId : '';
  if (!MEMBER_ID.test(memberId)) return { error: 'member' };
  if (input.audience !== DISCLOSURE_AUDIENCE) return { error: 'audience' };
  const categories = normalizeCategories(input.categories);
  if (!categories) return { error: 'category' };
  const detail = cleanDetail(categories, input.detail);
  if (detail == null) return { error: 'category' };
  const recipient = cleanText(input.recipient, 80);
  if (!recipient || familyRecipient(recipient)) return { error: 'recipient' };
  const purpose = cleanText(input.purpose, 200);
  if (!purpose) return { error: 'purpose' };
  const actor = cleanText(input.actor, 80);
  if (!actor) return { error: 'actor' };
  const at = input.at == null ? now : input.at;
  if (!Number.isInteger(at) || at < EARLIEST_AT || at > now + 5 * 60 * 1000) return { error: 'range' };
  if (!Number.isInteger(input.rangeStart) || !Number.isInteger(input.rangeEnd)) return { error: 'range' };
  if (input.rangeStart < EARLIEST_AT || input.rangeEnd < input.rangeStart) return { error: 'range' };
  if (input.rangeEnd > at + DAY_MS || input.rangeEnd - input.rangeStart > MAX_RANGE_MS) return { error: 'range' };
  const checked = approvedPayload(input.payload);
  if (checked.error) return checked;
  if (!categoriesMatch(categories, checked.released)) return { error: 'category' };

  await purgeExpiredDisclosures(store, memberId, now);
  const chain = await readChain(store, memberId);
  if (chain?.broken) return { error: 'chain' };
  const entries = chain ? chain.entries : [];
  if (entries.length >= MAX_ENTRIES) return { error: 'full' };
  const prevHash = entries.length ? entries[entries.length - 1].hash : (chain ? chain.anchor : '');
  const entry = {
    memberId,
    categories,
    detail,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    recipient,
    purpose,
    at,
    actor,
    prevHash: typeof prevHash === 'string' ? prevHash : '',
  };
  entry.hash = await hashEntry(entry);
  const next = {
    anchor: chain ? chain.anchor : '',
    entries: [...entries, entry],
  };
  if (!(await verifyDisclosureChain(next))) return { error: 'chain' };
  await writeChain(store, memberId, next);
  await rememberMember(store, memberId);
  return { ok: true, entry: publicEntry(entry), released: checked.released };
}

export const discloseToThirdParty = releaseToThirdParty;
