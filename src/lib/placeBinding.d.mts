export function placeMemberId(place: { memberId?: string } | null | undefined): string;

export function placeStorageKey(place: {
  code?: string;
  memberId?: string;
  audience?: string;
} | null | undefined): string | null;

export function familyPlacePinId(
  code: string | null | undefined,
  place: { memberId?: string } | null | undefined,
): string;

export function bindPlaceToMember<T extends { id?: string; role?: string; publisherId?: string }>(
  members: readonly T[] | null | undefined,
  place: { memberId?: string } | null | undefined,
): T | null;

export function placeIsSelf(
  place: { memberId?: string } | null | undefined,
  profileId?: string | null,
): boolean;
