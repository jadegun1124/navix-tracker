export const MEMBER_STALE_MS: number;
export const MEMBER_DISCONNECTED_MS: number;

export type PresenceKind = 'live' | 'stale' | 'disconnected' | 'unknown';

export interface MemberPresence {
  kind: PresenceKind;
  ago: string;
}

export function relativePlaceAge(at: number, now: number): string;

export function memberPresence(
  member: { id?: string; role?: string; updatedAt?: number } | null | undefined,
  now: number,
): MemberPresence;

export function memberPresenceLabel(presence: MemberPresence | null | undefined): string;

export function memberIsStale(presence: MemberPresence | null | undefined): boolean;

export function cleanDepartedIds(values: unknown): string[];
