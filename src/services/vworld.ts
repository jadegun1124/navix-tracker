export function vworldApiKey(): string {
  const fromVite = import.meta.env.VITE_VWORLD_API_KEY ?? '';
  const fromPlain = import.meta.env.VWORLD_API_KEY ?? '';
  return (fromVite || fromPlain).trim();
}

export function vworldBaseTileUrl(key: string): string {
  return `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(key)}/Base/{z}/{y}/{x}.png`;
}

export const VWORLD_ATTRIBUTION = '&copy; <a href="https://www.vworld.kr/">VWorld</a> / 국토교통부';
