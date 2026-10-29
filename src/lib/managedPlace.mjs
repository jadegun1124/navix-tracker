// Bind a live Worker place to the admin roster.
// memberId is the only key. Name, a lone invited child, and self never receive
// another phone's coordinates.

import { placeMemberId } from './placeBinding.mjs';

export function resolveManagedTarget(members, place) {
  const list = Array.isArray(members) ? members : [];
  const memberId = placeMemberId(place);
  if (!memberId) return { id: '', create: null };
  const bound = list.find((member) => member
    && member.id !== 'self'
    && member.role !== 'self'
    && member.role !== 'guardian'
    && member.role !== 'admin-share'
    && member.inviteCode === place.code
    && member.publisherId === memberId);
  if (bound) return { id: bound.id, create: null };
  const remoteId = `remote:${place.code}:${memberId}`;
  if (list.some((member) => member && member.id === remoteId)) return { id: remoteId, create: null };
  const name = typeof place?.name === 'string' ? place.name : '';
  return {
    id: remoteId,
    create: {
      id: remoteId,
      name,
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
      publisherId: memberId,
    },
  };
}
