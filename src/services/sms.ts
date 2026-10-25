export function openSmsComposer(phone: string, body: string): boolean {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 8 || typeof window === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const href = `sms:${digits}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`;
  window.location.assign(href);
  return true;
}
