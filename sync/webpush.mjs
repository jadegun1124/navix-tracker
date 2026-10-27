// Web Push (RFC 8291 / aes128gcm) for SOS. The push service only sees ciphertext.
// Payloads must not include coordinates or phone numbers.

const VAPID_SUB = 'mailto:umap@jadegun1124.github.io';

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function utf8(value) {
  return new TextEncoder().encode(value);
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

async function hkdfExtract(salt, ikm) {
  const used = salt && salt.length ? salt : new Uint8Array(32);
  return hmac(used, ikm);
}

async function hkdfExpand(prk, info, length) {
  const block = await hmac(prk, concat([info, new Uint8Array([1])]));
  return block.slice(0, length);
}

async function importEcdhPublic(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

async function sharedSecret(privateKey, publicRaw) {
  const remote = await importEcdhPublic(publicRaw);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: remote }, privateKey, 256);
  return new Uint8Array(bits);
}

async function aes128gcmKeys(subscriptionPublic, auth, asPublic, salt, ikm) {
  const prkKey = await hkdfExtract(auth, ikm);
  const keyInfo = concat([utf8('WebPush: info\0'), subscriptionPublic, asPublic]);
  const ikm2 = await hkdfExpand(prkKey, keyInfo, 32);
  const prk = await hkdfExtract(salt, ikm2);
  const cek = await hkdfExpand(prk, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(prk, utf8('Content-Encoding: nonce\0'), 12);
  return { cek, nonce };
}

export async function encryptWebPush(subscriptionPublic, auth, payload) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const ikm = await sharedSecret(local.privateKey, subscriptionPublic);
  const { cek, nonce } = await aes128gcmKeys(subscriptionPublic, auth, asPublic, salt, ikm);
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const record = concat([payload, new Uint8Array([2])]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat([salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher]);
}

export async function decryptWebPush(body, subscriptionPrivate, auth) {
  if (body.length < 22) throw new Error('push-body');
  const salt = body.slice(0, 16);
  const idLen = body[20];
  const header = 21 + idLen;
  const asPublic = body.slice(21, header);
  const cipher = body.slice(header);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', subscriptionPrivate.publicKey));
  const ikm = await sharedSecret(subscriptionPrivate.privateKey, asPublic);
  const { cek, nonce } = await aes128gcmKeys(publicRaw, auth, asPublic, salt, ikm);
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const clear = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  const delimiter = clear.lastIndexOf(2);
  if (delimiter < 0) throw new Error('push-pad');
  return clear.slice(0, delimiter);
}

export async function createVapidKeys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', key.privateKey);
  const publicKey = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey)));
  return { jwk, publicKey };
}

export async function vapidAuthorization(keys, endpoint, expSeconds) {
  const audience = new URL(endpoint).origin;
  const header = bytesToBase64Url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToBase64Url(utf8(JSON.stringify({ aud: audience, exp: expSeconds, sub: VAPID_SUB })));
  const unsigned = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    keys.jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = bytesToBase64Url(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, utf8(unsigned))));
  return `vapid t=${unsigned}.${signature}, k=${keys.publicKey}`;
}

export function pushEndpointAllowed(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === '::1' || host === '0.0.0.0') return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return false;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return false;
  }
  return true;
}

export async function buildWebPushRequest(keys, subscription, payload, now = Date.now()) {
  if (!pushEndpointAllowed(subscription.endpoint)) throw new Error('endpoint');
  const userPublic = base64UrlToBytes(subscription.p256dh);
  const auth = base64UrlToBytes(subscription.auth);
  if (userPublic.length !== 65 || userPublic[0] !== 4 || auth.length < 16) throw new Error('keys');
  const body = await encryptWebPush(userPublic, auth, utf8(JSON.stringify(payload)));
  const authorization = await vapidAuthorization(keys, subscription.endpoint, Math.floor(now / 1000) + 12 * 60 * 60);
  return {
    url: subscription.endpoint,
    init: {
      method: 'POST',
      headers: {
        authorization,
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: '3600',
        urgency: 'high',
      },
      body,
    },
  };
}

export async function sendWebPush(keys, subscription, payload, fetchImpl = fetch) {
  const request = await buildWebPushRequest(keys, subscription, payload);
  const response = await fetchImpl(request.url, request.init);
  return response.status;
}
