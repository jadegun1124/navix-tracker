import { applyAlert, applyDirectMessage, applySubscription, alertPushPayload, chatPushPayload, commitPlace, commitProfile, emptyRoom, parseOperation, pushesForAlert, pushesForChat, removeSubscriptions, viewDirectMessages, viewFamilyPlaces, viewMyThreads, viewRoom, withCors } from './protocol.mjs';
import { createVapidKeys, sendWebPush } from './webpush.mjs';

// One Durable Object per family room. The id is a hash of the invite code,
// the write key, and the read-key hash. The read key itself is not stored.
// idFromName('umap-push-meta') keeps the VAPID keypair. It is not a family room.
export class FamilyRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const op = await request.json();
    if (op.kind === 'vapid') {
      let keys = await this.ctx.storage.get('vapid');
      if (!keys || !keys.publicKey || !keys.jwk) {
        keys = await createVapidKeys();
        await this.ctx.storage.put('vapid', keys);
      }
      return Response.json({ publicKey: keys.publicKey, jwk: keys.jwk });
    }
    if (op.kind === 'vapid-public') {
      let keys = await this.ctx.storage.get('vapid');
      if (!keys || !keys.publicKey || !keys.jwk) {
        keys = await createVapidKeys();
        await this.ctx.storage.put('vapid', keys);
      }
      return Response.json({ publicKey: keys.publicKey });
    }

    let room = (await this.ctx.storage.get('room')) || emptyRoom();
    if (op.kind === 'get') return Response.json(viewRoom(room, op.since));
    if (op.kind === 'family') return Response.json(viewFamilyPlaces(room));
    if (op.kind === 'chat-get') {
      const view = op.peer ? viewDirectMessages(room, op.me, op.peer) : viewMyThreads(room, op.me);
      if (!view) return Response.json({ error: 'chat' }, { status: 400 });
      return Response.json(view);
    }
    if (op.kind === 'chat') {
      const next = applyDirectMessage(room, op.message, Date.now());
      const view = viewDirectMessages(next.room, op.message.from, op.message.to) || { messages: [] };
      if (!next.ignored) {
        room = next.room;
        await this.ctx.storage.put('room', room);
        return Response.json({
          ...view,
          pushes: pushesForChat(room, op.message),
          payload: chatPushPayload(op.message, op.code || ''),
        });
      }
      return Response.json(view);
    }
    if (op.kind === 'place') {
      const next = await commitPlace(room, op.place, op.profileKey || '');
      if (next.error) return next.error;
      if (!next.ignored) {
        room = next.room;
        await this.ctx.storage.put('room', room);
      }
      return Response.json({ ok: true });
    }
    if (op.kind === 'profile') {
      const next = await commitProfile(room, op.profile, op.profileKey || '');
      if (next.error) return next.error;
      if (!next.ignored) {
        room = next.room;
        await this.ctx.storage.put('room', room);
      }
      return Response.json({ ok: true });
    }
    if (op.kind === 'alert') {
      const next = applyAlert(room, op.alert, Date.now());
      if (!next.ignored) {
        room = next.room;
        await this.ctx.storage.put('room', room);
        return Response.json({ ok: true, pushes: pushesForAlert(room, op.alert), payload: alertPushPayload(op.alert) });
      }
      return Response.json({ ok: true, pushes: [], payload: null });
    }
    if (op.kind === 'push-subscribe') {
      room = applySubscription(room, op.subscription);
      await this.ctx.storage.put('room', room);
      return Response.json({ ok: true });
    }
    if (op.kind === 'push-remove') {
      room = removeSubscriptions(room, op.endpoints || []);
      await this.ctx.storage.put('room', room);
      return Response.json({ ok: true });
    }
    if (op.kind === 'delete') {
      await this.ctx.storage.delete('room');
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'method' }, { status: 405 });
  }
}

async function vapidKeys(env) {
  const stub = env.FAMILY_ROOM.get(env.FAMILY_ROOM.idFromName('umap-push-meta'));
  const response = await stub.fetch('https://room.internal/op', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'vapid' }),
  });
  return response.json();
}

async function deliverAlert(env, stub, data) {
  const pushes = Array.isArray(data.pushes) ? data.pushes : [];
  if (!pushes.length || !data.payload) return;
  let keys;
  try {
    keys = await vapidKeys(env);
  } catch {
    return;
  }
  const gone = [];
  await Promise.all(pushes.map(async (subscription) => {
    try {
      const status = await sendWebPush(keys, subscription, data.payload);
      if (status === 404 || status === 410) gone.push(subscription.endpoint);
    } catch {
      /* 다음 알림에서 다시 보낸다 */
    }
  }));
  if (!gone.length) return;
  await stub.fetch('https://room.internal/op', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'push-remove', endpoints: gone }),
  }).catch(() => undefined);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
    const op = await parseOperation(request);
    if (op instanceof Response) return withCors(op);
    if (op.kind === 'health') {
      return withCors(Response.json({ ok: true, service: 'umap-family-sync' }));
    }
    if (op.kind === 'vapid-public') {
      try {
        const keys = await vapidKeys(env);
        return withCors(Response.json({ publicKey: keys.publicKey }));
      } catch {
        return withCors(Response.json({ error: 'vapid' }, { status: 503 }));
      }
    }
    const stub = env.FAMILY_ROOM.get(env.FAMILY_ROOM.idFromName(op.token));
    const response = await stub.fetch('https://room.internal/op', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(op),
    });
    if (op.kind !== 'alert' && op.kind !== 'chat') return withCors(response);
    const data = await response.json();
    await deliverAlert(env, stub, data);
    if (op.kind === 'alert') return withCors(Response.json({ ok: data.ok === true }));
    return withCors(Response.json({ messages: Array.isArray(data.messages) ? data.messages : [] }));
  },
};
