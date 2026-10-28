const MEMBER_ID = /^local-[a-z0-9]{3,64}$/;

export function isMemberId(value) {
  return typeof value === 'string' && MEMBER_ID.test(value);
}

export function familyPinId(code, place) {
  const name = typeof place?.name === 'string' ? place.name : '';
  return isMemberId(place?.memberId) ? `family:${code}:${place.memberId}` : `family:${code}:${name}`;
}

export function moveKeyed(records, fromId, toId) {
  if (!records || !fromId || !toId || fromId === toId || !Object.prototype.hasOwnProperty.call(records, fromId)) return records;
  const next = { ...records };
  if (!Object.prototype.hasOwnProperty.call(next, toId)) next[toId] = next[fromId];
  delete next[fromId];
  return next;
}
