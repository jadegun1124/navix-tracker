// Family map selection. The first tap centers that person. A second tap on
// the same focused person opens their records. Another person replaces the
// focus. An empty-map tap clears it.

export function memberFocusStep(focus, target) {
  const focusedId = focus && typeof focus.focusedId === 'string' && focus.focusedId ? focus.focusedId : null;
  const recordsOpen = focus?.recordsOpen === true && focusedId != null;
  const id = typeof target === 'string' && target ? target : '';
  if (!id) return { focusedId: null, recordsOpen: false, action: 'clear' };
  if (recordsOpen && focusedId === id) return { focusedId: id, recordsOpen: true, action: 'keep' };
  if (focusedId === id && !recordsOpen) return { focusedId: id, recordsOpen: true, action: 'records' };
  return { focusedId: id, recordsOpen: false, action: 'focus' };
}
