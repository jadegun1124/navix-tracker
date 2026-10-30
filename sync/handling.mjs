// Collection and use ledger for the subject's own location.
// Third-party provision stays in disclosure.mjs. Both are metadata only.
// Retention matches the disclosure ledger: six calendar months.

import { disclosureExpiresAt } from './disclosure.mjs';

const MEMBER_ID = /^local-[a-z0-9]{3,64}$/;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{16,64}$/;
const KINDS = new Set(['collect', 'use']);
const CATEGORIES = new Set(['location', 'history', 'place']);
const INDEX_KEY = 'disclosure-members';

export function handlingKey(accountId) {
  return `handling:${accountId}`;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function canonical(entry) {
  return JSON.stringify({
    v: 1,
    kind: entry.kind,
    memberId: entry.memberId,
    actor: entry.actor,
    categories: entry.categories,
    at: entry.at,
    prevHash: entry.prevHash,
  });
}

async function hashEntry(entry) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(entry)));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function accountIdForMember(store, memberId) {
  if (!MEMBER_ID.test(memberId || '')) return '';
  const id = await store.get(`member:${memberId}`);
  if (typeof id !== 'string' || !ACCOUNT_ID.test(id)) return '';
  const record = await store.get(`acct:${id}`);
  if (!record || record.id !== id) return '';
  return id;
}

async function readChain(store, accountId) {
  const raw = await store.get(handlingKey(accountId));
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) return { anchor: '', entries: [], broken: true };
  return {
    anchor: typeof raw.anchor === 'string' ? raw.anchor : '',
    entries: raw.entries.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : null)).filter(Boolean),
    broken: false,
  };
}

async function remember(store, accountId) {
  const current = await store.get(INDEX_KEY);
  const list = Array.isArray(current) ? current.filter((id) => typeof id === 'string') : [];
  if (!list.includes(accountId)) list.push(accountId);
  await store.put(INDEX_KEY, list);
}

export async function verifyHandlingChain(chain) {
  if (!chain || chain.broken || !Array.isArray(chain.entries)) return false;
  let prev = typeof chain.anchor === 'string' ? chain.anchor : '';
  for (const entry of chain.entries) {
    if (!entry || entry.prevHash !== prev) return false;
    if (JSON.stringify(entry).includes('"lat"')) return false;
    if (entry.hash !== await hashEntry(entry)) return false;
    prev = entry.hash;
  }
  return true;
}

export async function purgeHandling(store, accountId, now = Date.now()) {
  if (!ACCOUNT_ID.test(accountId || '')) return { kept: 0 };
  const chain = await readChain(store, accountId);
  if (!chain || chain.broken) return { kept: chain?.entries?.length || 0 };
  let cut = 0;
  while (cut < chain.entries.length && Number.isInteger(chain.entries[cut].at) && disclosureExpiresAt(chain.entries[cut].at) <= now) cut += 1;
  if (cut === 0) return { kept: chain.entries.length };
  const kept = chain.entries.slice(cut);
  if (!kept.length) {
    await store.delete(handlingKey(accountId));
    return { kept: 0 };
  }
  await store.put(handlingKey(accountId), {
    anchor: chain.entries[cut - 1].hash || chain.anchor,
    entries: kept.map((entry) => ({ ...entry })),
  });
  return { kept: kept.length };
}

function publicEntry(entry) {
  if (!entry || !KINDS.has(entry.kind) || !MEMBER_ID.test(entry.memberId || '')) return null;
  if (!Array.isArray(entry.categories) || !entry.categories.length || entry.categories.some((item) => !CATEGORIES.has(item))) return null;
  if (!Number.isInteger(entry.at) || typeof entry.actor !== 'string' || !entry.actor) return null;
  return {
    kind: entry.kind,
    memberId: entry.memberId,
    actor: entry.actor,
    categories: entry.categories,
    at: entry.at,
  };
}

export async function listHandling(store, accountId, now = Date.now()) {
  if (!ACCOUNT_ID.test(accountId || '')) return { error: 'account' };
  await purgeHandling(store, accountId, now);
  const chain = await readChain(store, accountId);
  if (!chain) return { intact: true, events: [] };
  return { intact: await verifyHandlingChain(chain), events: chain.entries.map(publicEntry).filter(Boolean) };
}

export async function recordHandling(store, input = {}, now = Date.now()) {
  const memberId = typeof input.memberId === 'string' ? input.memberId : '';
  const accountId = await accountIdForMember(store, memberId);
  if (!accountId) return { skipped: true };
  if (!KINDS.has(input.kind)) return { error: 'kind' };
  const categories = Array.isArray(input.categories) ? input.categories.filter((item) => CATEGORIES.has(item)) : [];
  if (!categories.length) return { error: 'category' };
  const actor = typeof input.actor === 'string' && input.actor.trim() ? input.actor.trim().slice(0, 80) : memberId;
  const at = Number.isInteger(input.at) ? input.at : now;
  await purgeHandling(store, accountId, now);
  const existing = await readChain(store, accountId);
  const previous = existing && !existing.broken ? existing.entries : [];
  const signature = `${input.kind}\0${actor}\0${categories.join(',')}`;
  const seoulDay = (stamp) => new Date(stamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const day = seoulDay(at);
  const already = previous.some((item) => `${item.kind}\0${item.actor}\0${(item.categories || []).join(',')}` === signature && seoulDay(item.at) === day);
  if (already) return { ok: true, skipped: true };
  const chain = await readChain(store, accountId);
  if (chain?.broken) return { error: 'chain' };
  const entries = chain ? chain.entries : [];
  const entry = {
    kind: input.kind,
    memberId,
    actor,
    categories,
    at,
    prevHash: entries.length ? entries[entries.length - 1].hash : (chain ? chain.anchor : ''),
  };
  entry.hash = await hashEntry(entry);
  const next = { anchor: chain ? chain.anchor : '', entries: [...entries, entry] };
  if (!(await verifyHandlingChain(next))) return { error: 'chain' };
  await store.put(handlingKey(accountId), {
    anchor: next.anchor,
    entries: next.entries.map((item) => ({ ...item })),
  });
  await remember(store, accountId);
  return { ok: true, event: publicEntry(entry) };
}
