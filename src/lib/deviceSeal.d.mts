export function deviceSealAvailable(): boolean;
export function sealDeviceText(plain: string): Promise<string>;
export function openDeviceText(sealed: string): Promise<string>;
