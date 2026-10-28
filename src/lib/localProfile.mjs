// Device-local display name. Not a Google account and not a phone number.
// profileKey stays on this device and authorizes profile writes for this member id.

const PROFILE_KEY = /^[A-Za-z0-9_-]{16,64}$/;

export function looksLikePhone(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  const compact = trimmed.replace(/[\s\-().+]/g, '');
  if (!compact) return false;
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  return digits.length / compact.length >= 0.8;
}

export function deviceProfileKey(existing) {
  if (typeof existing === 'string' && PROFILE_KEY.test(existing)) return existing;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function localProfile(name, id) {
  const trimmed = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!trimmed || looksLikePhone(trimmed)) return null;
  const existing = typeof id === 'string' && id.startsWith('local-') ? id.trim().slice(0, 80) : '';
  const nextId = existing || `local-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  return { id: nextId, name: trimmed };
}
