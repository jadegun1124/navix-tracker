export function isRosterPlaceholder(member: { id?: string; role?: string; publisherId?: string } | null | undefined): boolean;

export function roomCodeOf(member: { id?: string; inviteCode?: string } | null | undefined): string;

export function absorbPlaceholderMembers<T extends { id: string; name?: string; publisherId?: string; role?: string; inviteCode?: string }>(
  members: T[],
  priorNames?: Record<string, string>,
): { members: T[]; moves: { from: string; to: string }[] };
