export interface AliasStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function placePriorName(code: string, audience: string, name: string, storage?: AliasStorage | null): string;
export function rememberPlaceName(code: string, audience: string, name: string, storage?: AliasStorage | null): void;
