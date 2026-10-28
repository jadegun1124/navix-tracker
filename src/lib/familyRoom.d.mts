export function shouldDeleteCreatedRoom(otherSharers: number | null, intent: 'delete' | 'leave'): boolean;

export function countOtherSharers(
  places: Array<{ memberId?: string; sharing?: boolean; lat?: number | null }> | null | undefined,
  selfMemberId?: string,
): number | null;

export function hiddenKeysForMember(member: {
  id?: string;
  publisherId?: string;
  inviteCode?: string;
  name?: string;
} | null | undefined): string[];

export function placeHidden(
  code: string,
  place: { memberId?: string; name?: string } | null | undefined,
  hidden: string[] | Set<string> | null | undefined,
): boolean;
