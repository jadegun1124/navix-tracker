import type { Member } from '../types/family';

export interface ManagedPlaceRef {
  code: string;
  name: string;
}

export interface ManagedTarget {
  id: string;
  create: Member | null;
}

export function resolveManagedTarget(members: readonly Member[], place: ManagedPlaceRef): ManagedTarget;
