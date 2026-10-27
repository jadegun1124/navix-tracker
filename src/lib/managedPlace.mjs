// Bind a live Worker place to the admin roster.
// The managed phone publishes its own display name. The admin may have typed a different label.
// One invited member on that code receives the fix. Extra names stay visible instead of being dropped.

export function resolveManagedTarget(members, place) {
  const list = Array.isArray(members) ? members : [];
  const roster = list.filter((member) => member
    && member.id !== 'self'
    && member.role !== 'guardian'
    && member.role !== 'admin-share'
    && member.inviteCode === place.code
    && !String(member.id).startsWith('remote:'));
  const named = roster.find((member) => member.name === place.name);
  if (named) return { id: named.id, create: null };
  if (roster.length === 1) return { id: roster[0].id, create: null };
  const remoteId = `remote:${place.code}:${place.name}`;
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
    },
  };
}
