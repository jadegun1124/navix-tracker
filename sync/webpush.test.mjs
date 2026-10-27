import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWebPushRequest,
  createVapidKeys,
  decryptWebPush,
  encryptWebPush,
  pushEndpointAllowed,
  vapidAuthorization,
} from './webpush.mjs';

test('web push payload round-trips and does not leak the plaintext to the body', async () => {
  const subscription = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', subscription.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const payload = new TextEncoder().encode(JSON.stringify({ title: 'SOS', body: '하나 님이 SOS를 눌렀습니다.', kind: 'sos' }));
  const body = await encryptWebPush(publicRaw, auth, payload);
  assert.ok(body.length > payload.length + 16);
  assert.equal(new TextDecoder().decode(body).includes('SOS'), false);
  const clear = await decryptWebPush(body, subscription, auth);
  assert.deepEqual(clear, payload);
});

test('vapid request targets only the push endpoint and rejects private hosts', async () => {
  const keys = await createVapidKeys();
  assert.match(keys.publicKey, /^[A-Za-z0-9_-]+$/);
  const authorization = await vapidAuthorization(keys, 'https://fcm.googleapis.com/fcm/send/abc', 1_800_000_000);
  assert.match(authorization, /^vapid t=/);
  assert.match(authorization, new RegExp(`k=${keys.publicKey}$`));

  const subscription = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', subscription.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const { bytesToBase64Url } = await import('./webpush.mjs');
  const request = await buildWebPushRequest(keys, {
    endpoint: 'https://fcm.googleapis.com/fcm/send/device',
    p256dh: bytesToBase64Url(publicRaw),
    auth: bytesToBase64Url(auth),
  }, { title: 'SOS', body: '알림', kind: 'sos', id: 'a-1' });
  assert.equal(request.url, 'https://fcm.googleapis.com/fcm/send/device');
  assert.equal(request.init.headers['content-encoding'], 'aes128gcm');
  assert.equal(request.init.headers.urgency, 'high');
  assert.equal(JSON.stringify(request.init.headers).includes('37.'), false);

  assert.equal(pushEndpointAllowed('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(pushEndpointAllowed('http://fcm.googleapis.com/x'), false);
  assert.equal(pushEndpointAllowed('https://127.0.0.1/push'), false);
  assert.equal(pushEndpointAllowed('https://10.0.0.4/push'), false);
  assert.equal(pushEndpointAllowed('https://localhost/push'), false);
});
