/**
 * Main map draws the open segment while it still has a line (someone is moving,
 * or they stopped but the walk/ride stay has not archived it yet).
 * After that stay, the segment lives in records and the live line is not drawn.
 * Records draw that person's saved day, including archived journeys.
 * Closing records does not erase an open segment: the main map shows it again.
 */
export function familyMapShowsTrail({ viewingRecords, detailOpen, showTrail, member, liveDrawable }) {
  if (!member) return false;
  if (viewingRecords) {
    if (detailOpen) return true;
    if (!showTrail) return false;
    return member.id === 'self' || member.share === 'allowed' || member.role === 'admin-share';
  }
  return liveDrawable === true;
}

/** Saved journeys for the selected day, plus the segment that is still live. */
export function recordsDayTrails({ journeys, livePoints, liveDrawable }) {
  const lines = [];
  for (const journey of Array.isArray(journeys) ? journeys : []) {
    const points = journey?.points;
    if (Array.isArray(points) && points.length >= 2) lines.push(points);
  }
  if (liveDrawable === true && Array.isArray(livePoints) && livePoints.length >= 2) lines.push(livePoints);
  return lines;
}
