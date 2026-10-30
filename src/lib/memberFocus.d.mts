export function memberFocusStep(
  focus: { focusedId?: string | null; recordsOpen?: boolean } | null | undefined,
  target: string | null | undefined,
): { focusedId: string | null; recordsOpen: boolean; action: 'focus' | 'records' | 'keep' | 'clear' };
