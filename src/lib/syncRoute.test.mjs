import assert from 'node:assert/strict';
import test from 'node:test';
import { optionalRouteMissing } from './syncRoute.mjs';

test('a missing trail or profile route does not count as the location server being down', () => {
  assert.equal(optionalRouteMissing('/v1/rooms/12345/trail', 404), true);
  assert.equal(optionalRouteMissing('/v1/rooms/12345/profile', 404), true);
  assert.equal(optionalRouteMissing('/v1/rooms/12345/place', 404), false);
  assert.equal(optionalRouteMissing('/v1/rooms/12345/trail', 500), false);
  assert.equal(optionalRouteMissing('/v1/rooms/12345/trail', 401), false);
});
