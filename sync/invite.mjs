// One-time family invite. The room sync token stays off the link until redeem,
// then the ticket is deleted. A second redeem or an expired ticket fails.

const CODE_PART = /^\d{4,6}$/;
const TICKET_PART = /^[A-Za-z0-9_-]{16,64}$/;
const TOKEN_PART = /^[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{16,128}$/;
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function ticketId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function inviteKey(id) {
  return `invite:${id}`;
}

export async function mintInvite(store, { code, syncToken, memberId }, now = Date.now()) {
  if (!CODE_PART.test(code || '')) return { error: 'code' };
  if (typeof syncToken !== 'string' || !TOKEN_PART.test(syncToken)) return { error: 'sync' };
  const id = ticketId();
  const exp = now + INVITE_TTL_MS;
  await store.put(inviteKey(id), {
    code,
    syncToken,
    memberId: typeof memberId === 'string' ? memberId.slice(0, 80) : '',
    exp,
  });
  return { ok: true, ticket: id, exp };
}

export async function redeemInvite(store, ticket, now = Date.now()) {
  if (typeof ticket !== 'string' || !TICKET_PART.test(ticket)) return { error: 'invite' };
  const row = await store.get(inviteKey(ticket));
  if (!row || typeof row !== 'object') return { error: 'invite' };
  await store.delete(inviteKey(ticket));
  if (!Number.isInteger(row.exp) || row.exp <= now) return { error: 'expired' };
  if (!CODE_PART.test(row.code) || typeof row.syncToken !== 'string') return { error: 'invite' };
  return { ok: true, code: row.code, syncToken: row.syncToken };
}
