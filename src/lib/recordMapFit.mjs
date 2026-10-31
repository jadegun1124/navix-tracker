/**
 * Records map auto-fit.
 * Fit the selected journey the first time it has points, and again when the
 * person, day, or journey changes. A pinch, drag, or zoom button locks the
 * camera. Later point-list refreshes and playback ticks must not call fitBounds.
 * Playback itself only pans, and only when the marker leaves the padded view.
 */
export function shouldAutoFitRecord({ recordKey, fittedKey, userAdjusted, pointCount }) {
  if (userAdjusted) return false;
  if (!recordKey || pointCount < 1) return false;
  return fittedKey !== recordKey;
}
