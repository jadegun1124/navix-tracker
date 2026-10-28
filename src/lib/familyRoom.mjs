// Leave or delete the family room on this phone.
// The device that created the room holds the read key. Invitees only have
// the write token, so they can stop sharing but cannot wipe the room.

import { familyPinId } from './sharedIdentity.mjs';

/**
 * Wipe the worker room when this phone created it and either the user chose
 * delete, or nobody else is still sharing a place.
 * otherSharers null means the member list could not be read; delete still
 * proceeds because that is what the button asked for.
 */
export function shouldDeleteCreatedRoom(otherSharers, intent) {
  if (intent === 'delete') return true;
  return otherSharers === 0;
}

export function countOtherSharers(places, selfMemberId) {
  if (!Array.isArray(places)) return null;
  let count = 0;
  for (const place of places) {
    if (!place || place.sharing === false) continue;
    if (!place.lat && place.lat !== 0) continue;
    if (selfMemberId && place.memberId === selfMemberId) continue;
    count += 1;
  }
  return count;
}

export function hiddenKeysForMember(member) {
  const keys = [];
  if (!member || typeof member !== 'object') return keys;
  if (typeof member.id === 'string' && member.id) keys.push(member.id);
  if (typeof member.publisherId === 'string' && member.publisherId) keys.push(member.publisherId);
  if (typeof member.inviteCode === 'string' && member.inviteCode && typeof member.name === 'string' && member.name) {
    keys.push(`family:${member.inviteCode}:${member.name}`);
  }
  if (!member.publisherId && typeof member.name === 'string' && member.name) keys.push(`name:${member.name}`);
  return keys;
}

export function placeHidden(code, place, hidden) {
  const set = hidden instanceof Set ? hidden : new Set(Array.isArray(hidden) ? hidden : []);
  if (set.size === 0 || !place) return false;
  if (typeof place.memberId === 'string' && place.memberId && set.has(place.memberId)) return true;
  if (set.has(familyPinId(code, place))) return true;
  if (typeof place.name === 'string' && place.name) {
    if (set.has(`family:${code}:${place.name}`)) return true;
    if (set.has(`name:${place.name}`)) return true;
  }
  return false;
}
