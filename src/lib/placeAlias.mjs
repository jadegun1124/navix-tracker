// Last name this device successfully published for a room audience.
// The next publish sends it as priorName so a rename can move the old name key.

const STORAGE_KEY = 'umap_place_alias_v1';

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* 비공개 창 */
  }
  return null;
}

function readAll(storage) {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function slotKey(code, audience) {
  return `${code}|${audience === 'family' ? 'family' : 'admin'}`;
}

export function placePriorName(code, audience, name, storage = defaultStorage()) {
  const slot = readAll(storage)[slotKey(code, audience)];
  const previous = slot && typeof slot.name === 'string' ? slot.name : '';
  if (!previous || previous === name) return '';
  return previous;
}

export function rememberPlaceName(code, audience, name, storage = defaultStorage()) {
  if (!storage || !code || !name) return;
  const all = readAll(storage);
  all[slotKey(code, audience)] = { name };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* 저장 공간이 없어도 이번 전송은 유지한다 */
  }
}
