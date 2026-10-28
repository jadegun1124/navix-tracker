import assert from 'node:assert/strict';
import test from 'node:test';
import { memberPlaceLabel } from './memberPlace.mjs';
import { NOMINATIM_USER_AGENT, nominatimAddress, reverseGeocode, shortenAddress } from './placeGeocode.mjs';

const SUTAEK = {
  display_name: '수택동, 구리시, 경기도, 11932, 대한민국',
  address: { quarter: '수택동', city: '구리시', province: '경기도' },
};

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

test('shortenAddress keeps the city and neighborhood and drops 근처', () => {
  assert.equal(shortenAddress('경기도 구리시 수택동 12-3'), '구리시 수택동');
  assert.equal(shortenAddress('수택동, 구리시, 경기도, 11932, 대한민국'), '구리시 수택동');
  assert.equal(shortenAddress('경기도 남양주시 다산동'), '남양주시 다산동');
  assert.equal(shortenAddress('근처'), '');
  assert.equal(shortenAddress('근처 근처'), '');
});

test('a Nominatim body becomes 구리시 수택동', () => {
  assert.equal(nominatimAddress(SUTAEK), '구리시 수택동');
  assert.equal(nominatimAddress({ display_name: '다산동, 남양주시, 경기도' }), '남양주시 다산동');
  assert.equal(nominatimAddress({
    display_name: '3404, 29, 다산중앙로123번길, 지막, 다산1동, 남양주시, 경기도, 12248, 대한민국',
    address: { hamlet: '지막', city_district: '다산1동', city: '남양주시', province: '경기도' },
  }), '남양주시 다산1동');
});

test('a missing VWorld key uses Nominatim and never says 근처', async () => {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(String(url));
    assert.equal(init.headers['User-Agent'], NOMINATIM_USER_AGENT);
    assert.equal(init.headers['Accept-Language'], undefined);
    assert.match(String(url), /nominatim\.openstreetmap\.org\/reverse/);
    assert.match(String(url), /accept-language=ko/);
    return jsonResponse(SUTAEK);
  };
  const label = await reverseGeocode(37.5942, 127.1432, { fetch: fetchImpl, key: '', pace: false });
  assert.equal(label, '구리시 수택동');
  assert.equal(urls.some((url) => url.includes('vworld')), false);
  assert.equal(String(label).includes('근처'), false);
});

test('VWorld is primary and Nominatim covers a failed VWorld response', async () => {
  let calls = 0;
  const vworldOnly = async (url) => {
    calls += 1;
    assert.match(String(url), /api\.vworld\.kr/);
    return jsonResponse({ response: { result: [{ text: '경기도 남양주시 다산동 123' }] } });
  };
  const label = await reverseGeocode(37.6, 127.15, { fetch: vworldOnly, key: 'test-key', pace: false });
  assert.equal(label, '남양주시 다산동');
  assert.equal(calls, 1);

  const urls = [];
  const fallback = async (url) => {
    urls.push(String(url));
    if (String(url).includes('vworld.kr')) return jsonResponse({ response: { status: 'ERROR' } }, false);
    return jsonResponse(SUTAEK);
  };
  const recovered = await reverseGeocode(37.5942, 127.1432, { fetch: fallback, key: 'test-key', pace: false });
  assert.equal(recovered, '구리시 수택동');
  assert.equal(urls.some((url) => url.includes('nominatim.openstreetmap.org')), true);
  assert.equal(recovered.includes('근처'), false);
});

test('a browser that refuses User-Agent still receives the neighborhood', async () => {
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    if (init.headers && init.headers['User-Agent']) throw new TypeError('Refused to set unsafe header "User-Agent"');
    return jsonResponse({ display_name: '다산동, 남양주시, 경기도' });
  };
  const label = await reverseGeocode(37.6, 127.15, { fetch: fetchImpl, key: '', pace: false });
  assert.equal(label, '남양주시 다산동');
  assert.equal(calls, 2);
  assert.equal(label.includes('근처'), false);
});

test('family card status starts with the neighborhood, never 근처', () => {
  const line = (place, live) => [memberPlaceLabel({ place, located: true }), live].filter(Boolean).join(' · ');
  assert.equal(line('구리시 수택동', '지금'), '구리시 수택동 · 지금');
  assert.equal(line('남양주시 다산동', '머무름'), '남양주시 다산동 · 머무름');
  assert.equal(line('근처', '머무름'), '머무름');
  assert.equal(line('근처', '지금').includes('근처'), false);
  assert.equal(line('구리시 수택동', '지금').startsWith('구리시 수택동'), true);
  assert.equal(line('', '지금').includes('근처'), false);
});
