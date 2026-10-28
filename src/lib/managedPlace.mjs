// Bind a live Worker place to the admin roster.
// memberId is the phone's own id, so a rename stays on the same roster row.
// priorName matches the label this phone published before the rename.
// One invited member on that code receives the fix. Extra phones stay visible.

const MEMBER_ID = /^local-[a-z0-9]{3,64}$/;

function memberIdOf(place) {
  return typeof place?.memberId === 'string' && MEMBER_ID.test(place.memberId) ? place.memberId : '';
}

export function resolveManagedTarget(members, place) {
  const list = Array.isArray(members) ? members : [];
  const memberId = memberIdOf(place);
  const names = [place?.name, place?.priorName].filter((name) => typeof name === 'string' && name);
  if (memberId) {
    const bound = list.find((member) => member
      && member.id !== 'self'
      && member.role !== 'guardian'
      && member.role !== 'admin-share'
      && member.inviteCode === place.code
      && member.publisherId === memberId);
    if (bound) return { id: bound.id, create: null };
  }
  const roster = list.filter((member) => member
    && member.id !== 'self'
    && member.role !== 'guardian'
    && member.role !== 'admin-share'
    && member.inviteCode === place.code
    && !String(member.id).startsWith('remote:'));
  const named = roster.find((member) => names.includes(member.name));
  if (named) return { id: named.id, create: null };
  if (roster.length === 1) return { id: roster[0].id, create: null };
  const remoteId = memberId ? `remote:${place.code}:${memberId}` : `remote:${place.code}:${place.name}`;
  const aliasRemote = list.find((member) => member && names.some((name) => member.id === `remote:${place.code}:${name}`));
  if (aliasRemote) return { id: aliasRemote.id, create: null };
  if (list.some((member) => member && member.id === remoteId)) return { id: remoteId, create: null };
  return {
    id: remoteId,
    create: {
      id: remoteId,
      name: place.name,
      role: 'child',
      lat: null,
      lng: null,
      accuracyM: 0,
      battery: null,
      charging: null,
      updatedAt: 0,
      moving: null,
      inviteCode: place.code,
      share: 'invited',
      ...(memberId ? { publisherId: memberId } : {}),
    },
  };
}
