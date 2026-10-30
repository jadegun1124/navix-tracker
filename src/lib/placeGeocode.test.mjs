import assert from 'node:assert/strict';
import test from 'node:test';
import { memberPlaceLabel } from './memberPlace.mjs';
import { choosePlaceLabel, formatPrecisePlace, NOMINATIM_USER_AGENT, nominatimAddress, placeGridKey, presentPlace, reverseGeocode, shortenAddress } from './placeGeocode.mjs';
import { stayLabelPoint } from './tracking.mjs';

const SUTAEK = {
  display_name: '수택동, 구리시, 경기도, 11932, 대한민국',
  address: { quarter: '수택동', city: '구리시', province: '경기도' },
};

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

test('place labels refresh about every 30m and stay inside one cell for a shorter step', () => {
  const step = 30 / 111_320;
  const center = Math.round(37.6365 / step) * step;
  const here = placeGridKey(center, 127.0678);
  assert.equal(placeGridKey(center + step * 0.2, 127.0678), here);
  assert.notEqual(placeGridKey(center + step * 1.2, 127.0678), here);
});

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

test('formatPrecisePlace keeps an apartment and a shop, and presentPlace does not strip them', () => {
  assert.equal(formatPrecisePlace({
    dong: '하계동',
    building: '하계1차청구아파트',
    unit: '104',
  }), '하계1차청구아파트 104동');
  assert.equal(formatPrecisePlace({ dong: '다산2동', poi: '이마트' }), '이마트');
  assert.equal(formatPrecisePlace({ dong: '수택동' }), '');
  assert.equal(presentPlace('하계1차청구아파트 104동'), '하계1차청구아파트 104동');
  assert.equal(presentPlace('경기도 구리시 수택동 12-3'), '구리시 수택동');
  assert.equal(presentPlace('근처'), '');
  assert.equal(String(formatPrecisePlace({ dong: '하계동', building: '청구아파트', unit: '104동' })).includes('근처'), false);
});

test('a missing VWorld key uses Nominatim and never says 근처', async () => {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(String(url));
    if (String(url).includes('nominatim.openstreetmap.org')) {
      assert.equal(init.headers['User-Agent'], NOMINATIM_USER_AGENT);
      assert.equal(init.headers['Accept-Language'], undefined);
      assert.match(String(url), /accept-language=ko/);
      assert.match(String(url), /namedetails=1/);
      return jsonResponse(SUTAEK);
    }
    return jsonResponse({ elements: [] });
  };
  const label = await reverseGeocode(37.5942, 127.1432, { fetch: fetchImpl, key: '', pace: false });
  assert.equal(label, '구리시 수택동');
  assert.equal(urls.some((url) => url.includes('vworld')), false);
  assert.equal(String(label).includes('근처'), false);
});

test('VWorld is primary and Nominatim covers a failed VWorld response', async () => {
  const urls = [];
  const vworldThenOsm = async (url) => {
    urls.push(String(url));
    if (String(url).includes('vworld.kr')) {
      return jsonResponse({ response: { result: [{ text: '서울특별시 노원구 하계동 273' }] } });
    }
    if (String(url).includes('nominatim.openstreetmap.org')) {
      return jsonResponse({
        display_name: '하계1차청구아파트, 하계동, 노원구, 서울',
        address: { building: '하계1차청구아파트', suburb: '하계동', borough: '노원구' },
        namedetails: { name: '하계1차청구아파트' },
      });
    }
    return jsonResponse({ elements: [] });
  };
  const label = await reverseGeocode(37.6362, 127.0675, { fetch: vworldThenOsm, key: 'test-key', pace: false });
  assert.equal(label, '하계1차청구아파트');
  assert.equal(urls.some((url) => String(url).includes('type=ROAD')), true);
  assert.equal(urls.some((url) => String(url).includes('type=PARCEL')), true);

  const recoveredUrls = [];
  const fallback = async (url) => {
    recoveredUrls.push(String(url));
    if (String(url).includes('vworld.kr')) return jsonResponse({ response: { status: 'ERROR' } }, false);
    return jsonResponse(SUTAEK);
  };
  const recovered = await reverseGeocode(37.5942, 127.1432, { fetch: fallback, key: 'test-key', pace: false });
  assert.equal(recovered, '구리시 수택동');
  assert.equal(recoveredUrls.some((url) => url.includes('nominatim.openstreetmap.org')), true);
  assert.equal(recovered.includes('근처'), false);
});

test('VWorld building layer becomes an apartment and 동 number', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('LT_C_BLDGINFO')) {
      return jsonResponse({
        response: {
          result: {
            featureCollection: {
              features: [{ properties: { buld_nm: '하계1차청구아파트', dong_nm: '104동' } }],
            },
          },
        },
      });
    }
    if (String(url).includes('vworld.kr')) {
      return jsonResponse({
        response: {
          result: [{
            text: '서울특별시 노원구 하계동',
            structure: { level2: '노원구', level4L: '하계동' },
          }],
        },
      });
    }
    return jsonResponse({ elements: [] });
  };
  const label = await reverseGeocode(37.6362, 127.0675, { fetch: fetchImpl, key: 'test-key', pace: false });
  assert.equal(label, '하계1차청구아파트 104동');
  assert.equal(String(label).includes('근처'), false);
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
  assert.ok(calls >= 2);
  assert.equal(label.includes('근처'), false);
});

test('an apartment polygon beats the fire station next door', async () => {
  const hagye = { lat: 37.6365, lng: 127.0680 };
  const fire = { lat: 37.6354, lng: 127.0678 };
  const apartment = {
    name: '하계1차청구아파트',
    unit: '104동',
    kind: 'residential',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [127.0672, 37.6372],
        [127.0688, 37.6372],
        [127.0688, 37.6358],
        [127.0672, 37.6358],
        [127.0672, 37.6372],
      ]],
    },
  };
  const station = { name: '노원소방서', kind: 'poi', lat: fire.lat, lng: fire.lng };
  assert.equal(choosePlaceLabel([station, apartment], hagye), '하계1차청구아파트 104동');
  assert.equal(choosePlaceLabel([station, apartment], { lat: 37.6359, lng: 127.0680 }), '하계1차청구아파트 104동');
  assert.equal(choosePlaceLabel([station, apartment], { lat: 37.6353, lng: 127.0680 }), '하계1차청구아파트 104동');
  assert.equal(String(choosePlaceLabel([station, apartment], hagye)).includes('소방서'), false);

  const fetchImpl = async (url) => {
    if (String(url).includes('LT_C_BLDGINFO')) {
      return jsonResponse({
        response: {
          result: {
            featureCollection: {
              features: [
                { properties: { buld_nm: '노원소방서' }, geometry: { type: 'Point', coordinates: [fire.lng, fire.lat] } },
                { properties: { buld_nm: '하계1차청구아파트', dong_nm: '104동' }, geometry: apartment.geometry },
              ],
            },
          },
        },
      });
    }
    if (String(url).includes('vworld.kr')) {
      return jsonResponse({ response: { result: [{ text: '서울특별시 노원구 하계동' }] } });
    }
    if (String(url).includes('nominatim.openstreetmap.org')) {
      return jsonResponse({
        display_name: '노원소방서, 하계동, 노원구, 서울',
        address: { amenity: '노원소방서', suburb: '하계동', borough: '노원구' },
        namedetails: { name: '노원소방서' },
      });
    }
    return jsonResponse({
      elements: [
        { type: 'node', lat: fire.lat, lon: fire.lng, tags: { name: '노원소방서', amenity: 'fire_station' } },
        { type: 'way', tags: { name: '하계1차청구아파트', building: 'apartments', ref: '104동' }, geometry: apartment.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lon: lng })) },
      ],
    });
  };
  const label = await reverseGeocode(hagye.lat, hagye.lng, { fetch: fetchImpl, key: 'test-key', pace: false });
  assert.equal(label, '하계1차청구아파트 104동');
  assert.equal(String(label).includes('소방서'), false);
  const yard = await reverseGeocode(37.6353, 127.0680, { fetch: fetchImpl, key: 'test-key', pace: false });
  assert.equal(yard, '하계1차청구아파트 104동');

  const jitter = [
    { lat: 37.6366, lng: 127.0679, at: 1, staying: true },
    { lat: 37.6364, lng: 127.0681, at: 2, staying: true },
    { lat: 37.6365, lng: 127.0680, at: 3, staying: true },
    { lat: fire.lat, lng: fire.lng, at: 4, staying: true },
  ];
  const snapped = stayLabelPoint(jitter, fire, false);
  assert.ok(snapped);
  assert.ok(Math.abs(snapped.lat - 37.63625) < 0.002);
  const snappedLabel = choosePlaceLabel([station, apartment], snapped);
  assert.equal(snappedLabel, '하계1차청구아파트 104동');
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
