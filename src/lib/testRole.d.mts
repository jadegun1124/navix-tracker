export const TEST_ROLE_TO_ADMIN: string;
export const TEST_ROLE_TO_MANAGED: string;
export const TEST_ROLE_HINT: string;

export function testRoleLabel(mode: string | null): string;

export function isSelfEchoMember(member: { role?: string; id?: string; publisherId?: string } | null | undefined, profileId?: string, inviteCode?: string): boolean;

export function isSelfEchoPlace(place: { memberId?: string; code?: string; audience?: string } | null | undefined, profileId?: string, inviteCode?: string): boolean;

export function withoutSelfEcho<T>(members: T[] | null | undefined, profileId?: string, inviteCode?: string): T[];

export function applyRole<T extends {
  mode: string | null;
  stage: string;
  tab: string;
  inviteCode?: string;
  members?: unknown[];
  profile?: { id?: string } | null;
  permissions?: { completed?: boolean };
}>(session: T, mode: 'admin' | 'managed'): T;

export function testRoleFlip<T extends {
  mode: string | null;
  stage: string;
  tab: string;
  permissions?: { completed?: boolean };
}>(session: T): T;

export function rosterMembers<T extends { role?: string; id?: string }>(members: T[] | null | undefined, profileId?: string, inviteCode?: string): T[];

export function mapMembers<T extends { role?: string; id?: string; lat?: number | null; lng?: number | null; share?: string }>(members: T[] | null | undefined, profileId?: string, inviteCode?: string): T[];
