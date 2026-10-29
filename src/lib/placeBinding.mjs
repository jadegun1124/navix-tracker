// A live place binds to a roster row only by publisher memberId.
// Display name, a lone invited child, and the viewer's self pin never receive
// another phone's coordinates.

import { isMemberId } from './sharedIdentity.mjs';

export function placeMemberId(place) {
  return isMemberId(place?.memberId) ? place.memberId : '';
}

export function placeStorageKey(place) {
  const memberId = placeMemberId(place);
  if (!memberId || typeof place?.code !== 'string' || !place.code) return null;
  const audience = place.audience === 'family' ? 'family' : 'admin';
  return `${place.code}:${audience}:id:${memberId}`;
}

export function familyPlacePinId(code, place) {
  const memberId = placeMemberId(place);
  if (!memberId || !code) return '';
  return `family:${code}:${memberId}`;
}

function isSelfRow(member) {
  return !member || member.id === 'self' || member.role === 'self';
}

/** The roster or pin row that already owns this publisher id. Never name or self. */
export function bindPlaceToMember(members, place) {
  const memberId = placeMemberId(place);
  if (!memberId) return null;
  const list = Array.isArray(members) ? members : [];
  return list.find((member) => (
    member
    && !isSelfRow(member)
    && member.publisherId === memberId
  )) || null;
}

/** True when this place is this phone's own publish and must not paint another card. */
export function placeIsSelf(place, profileId) {
  const memberId = placeMemberId(place);
  return !!profileId && memberId !== '' && memberId === profileId;
}
