// Local role flip for testing. Admin and managed stay different roles.
// The same session, member ids, and room keys are kept. No new person is created.

export const TEST_ROLE_TO_ADMIN = '관리자로 전환 (시험)';
export const TEST_ROLE_TO_MANAGED = '피관리자로 전환 (시험)';
export const TEST_ROLE_HINT = '시험용 · 같은 가족 방';

export function testRoleLabel(mode) {
  if (mode === 'managed') return TEST_ROLE_TO_ADMIN;
  if (mode === 'admin') return TEST_ROLE_TO_MANAGED;
  return '';
}

export function isSelfEchoMember(member, profileId, inviteCode) {
  if (!member || member.role !== 'admin-share') return false;
  if (profileId && member.publisherId === profileId) return true;
  if (profileId && inviteCode && member.id === `family:${inviteCode}:${profileId}`) return true;
  return false;
}

export function isSelfEchoPlace(place, profileId, inviteCode) {
  if (!place) return false;
  if (profileId && place.memberId === profileId) return true;
  if (inviteCode && place.code === inviteCode && place.audience === 'family') return true;
  return false;
}

export function withoutSelfEcho(members, profileId, inviteCode) {
  return (Array.isArray(members) ? members : []).filter((member) => !isSelfEchoMember(member, profileId, inviteCode));
}

export function applyRole(session, mode) {
  if (!session || (mode !== 'admin' && mode !== 'managed')) return session;
  if (session.mode === mode) return session;
  const profileId = session.profile && session.profile.id;
  const members = withoutSelfEcho(session.members, profileId, session.inviteCode);
  return {
    ...session,
    mode,
    members,
    stage: session.permissions && session.permissions.completed ? 'map' : session.stage,
    tab: 'map',
  };
}

export function testRoleFlip(session) {
  const next = session && session.mode === 'managed' ? 'admin' : session && session.mode === 'admin' ? 'managed' : null;
  if (!next) return session;
  return applyRole(session, next);
}

export function rosterMembers(members, profileId, inviteCode) {
  return withoutSelfEcho(members, profileId, inviteCode).filter((member) => member && member.role !== 'guardian');
}

export function mapMembers(members, profileId, inviteCode) {
  return rosterMembers(members, profileId, inviteCode).filter((member) => {
    if (member.id === 'self') return true;
    if (member.lat == null || member.lng == null) return false;
    if (member.role === 'admin-share') return true;
    return member.share === 'allowed';
  });
}
