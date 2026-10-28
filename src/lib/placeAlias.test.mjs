import assert from 'node:assert/strict';
import test from 'node:test';
import { placePriorName, rememberPlaceName } from './placeAlias.mjs';

function memory() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

test('a rename reports the previous published name once it was remembered', () => {
  const storage = memory();
  assert.equal(placePriorName('48291', 'admin', '민지', storage), '');
  rememberPlaceName('48291', 'admin', '딸', storage);
  assert.equal(placePriorName('48291', 'admin', '민지', storage), '딸');
  assert.equal(placePriorName('48291', 'admin', '딸', storage), '');
  assert.equal(placePriorName('48291', 'family', '민지', storage), '');
  rememberPlaceName('48291', 'admin', '민지', storage);
  assert.equal(placePriorName('48291', 'admin', '민지', storage), '');
});
