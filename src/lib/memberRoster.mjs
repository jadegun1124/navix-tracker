// One real person, one roster row.
// The name typed while inviting is only a seat. Once that person's own
// memberId is known, the seat is removed and the row keeps the nickname
// they set. Coordinates stay on the memberId row.

import { isMemberId } from './sharedIdentity.mjs';

export function isRosterPlaceholder(member) {
  if (!member || member.id === 'self' || member.role === 'self' || member.role === 'guardian') return false;
  if (member.role === 'admin-share') return false;
  return !isMemberId(member.publisherId);
}

export function roomCodeOf(member) {
  if (!member) return '';
  if (typeof member.inviteCode === 'string' && member.inviteCode) return member.inviteCode;
  const match = /^(?:family|remote):(\d{4,6}):/.exec(typeof member.id === 'string' ? member.id : '');
  return match ? match[1] : '';
}

function sameRoom(placeholder, real) {
  const left = roomCodeOf(placeholder);
  const right = roomCodeOf(real);
  if (!left || !right) return true;
  return left === right;
}

function cleanPrior(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Drop invite seats that belong to a publisher already in the room.
 * priorNames maps publisher memberId → the name on the invite.
 * The publisher row keeps its own display name.
 */
export function absorbPlaceholderMembers(members, priorNames = {}) {
  const list = Array.isArray(members) ? members.slice() : [];
  const real = list.filter((member) => member && member.id !== 'self' && isMemberId(member.publisherId));
  const placeholders = list.filter(isRosterPlaceholder);
  if (real.length === 0 || placeholders.length === 0) return { members: list, moves: [] };
  const taken = new Set();
  const moves = [];
  for (const publisher of real) {
    const prior = cleanPrior(priorNames[publisher.publisherId]);
    const open = placeholders.filter((member) => !taken.has(member.id) && sameRoom(member, publisher));
    const realsInRoom = real.filter((member) => sameRoom(member, publisher));
    let chosen = null;
    if (prior) {
      const named = open.filter((member) => member.name === prior);
      if (named.length === 1) chosen = named[0];
    }
    if (!chosen && publisher.name) {
      const named = open.filter((member) => member.name === publisher.name);
      if (named.length === 1 && named[0] !== chosen) chosen = named[0];
    }
    if (!chosen && open.length === 1 && realsInRoom.length === 1) chosen = open[0];
    if (!chosen) continue;
    taken.add(chosen.id);
    moves.push({ from: chosen.id, to: publisher.id });
  }
  if (moves.length === 0) return { members: list, moves: [] };
  const drop = new Set(moves.map((move) => move.from));
  return {
    members: list.filter((member) => !drop.has(member.id)),
    moves,
  };
}
