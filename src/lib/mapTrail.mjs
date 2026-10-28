/**
 * Family overview draws pins only.
 * A person's trail is drawn only while that person's records are open.
 * Closing records (the X / 닫기 control) must hide the line. GPS collection is unchanged.
 */
export function familyMapShowsTrail({ viewingRecords, detailOpen, showTrail, member }) {
  if (!viewingRecords || !member) return false;
  if (detailOpen) return true;
  if (!showTrail) return false;
  return member.id === 'self' || member.share === 'allowed' || member.role === 'admin-share';
}
