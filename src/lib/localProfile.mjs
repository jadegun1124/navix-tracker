// Device-local display name. Not a Google account and not a phone number.

export function looksLikePhone(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  const compact = trimmed.replace(/[\s\-().+]/g, '');
  if (!compact) return false;
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  return digits.length / compact.length >= 0.8;
}

export function localProfile(name, id) {
  const trimmed = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!trimmed || looksLikePhone(trimmed)) return null;
  const existing = typeof id === 'string' && id.startsWith('local-') ? id.trim().slice(0, 80) : '';
  const nextId = existing || `local-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  return { id: nextId, name: trimmed };
}
