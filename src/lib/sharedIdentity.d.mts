export function isMemberId(value: unknown): value is string;
export function familyPinId(code: string, place: { memberId?: string; name?: string } | null | undefined): string;
export function moveKeyed<T extends Record<string, unknown>>(records: T, fromId: string, toId: string): T;
