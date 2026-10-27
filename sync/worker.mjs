import { applyAlert, applyPlace, emptyRoom, parseOperation, viewFamilyPlaces, viewRoom, withCors } from './protocol.mjs';

// One Durable Object per family room. The id is a hash of the invite code,
// the write key, and the read-key hash. The read key itself is not stored.
export class FamilyRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const op = await request.json();
    let room = (await this.ctx.storage.get('room')) || emptyRoom();
    if (op.kind === 'get') return Response.json(viewRoom(room, op.since));
    if (op.kind === 'family') return Response.json(viewFamilyPlaces(room));
    if (op.kind === 'place') {
      const next = applyPlace(room, op.place);
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
      }
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'method' }, { status: 405 });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
    const op = await parseOperation(request);
    if (op instanceof Response) return withCors(op);
    if (op.kind === 'health') {
      return withCors(Response.json({ ok: true, service: 'umap-family-sync' }));
    }
    const stub = env.FAMILY_ROOM.get(env.FAMILY_ROOM.idFromName(op.token));
    const response = await stub.fetch('https://room.internal/op', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(op),
    });
    return withCors(response);
  },
};

