export const APP_VERSION_NAME: string;
export const APP_VERSION_CODE: number;

export function formatAppVersion(name?: string, code?: string | number): string;
export function parseInstalledAppVersion(raw: unknown): { name: string; code: string } | null;
export function labelFromInstalled(raw: unknown): string;
export function currentAppVersionLabel(): string;
