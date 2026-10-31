import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { memberLiveLines } from '../../lib/mapTrail.mjs';
import { liveTrailPoints, settleTrailPoint } from '../../lib/tracking.mjs';

// Node 20's zlib has no zstd. jsdom's undici calls createZstdDecompress.bind at load.
if (typeof zlib.createZstdDecompress !== 'function') {
  zlib.createZstdDecompress = function createZstdDecompress() {
    throw new Error('zstd');
  };
}

const require = createRequire(import.meta.url);

function east(lat, lng, meters) {
  return lng + meters / (111_320 * Math.cos((lat * Math.PI) / 180));
}

function walkFixes(count) {
  const lat = 37.57;
  let lng = 127.03;
  const start = Date.UTC(2026, 9, 31, 5, 48, 0);
  const fixes = [];
  for (let index = 0; index < count; index += 1) {
    fixes.push({
      lat,
      lng,
      at: start + index * 2_500,
      accuracyM: 12,
      speedMps: 1.3,
      staying: false,
    });
    lng = east(lat, lng, 3.5);
  }
  return fixes;
}

function ingest(fixes) {
  let points = [];
  for (const fix of fixes) points = settleTrailPoint(points, fix, fix.at).points;
  return points;
}

function trailCount(text) {
  return String(text || '').split(/[; ]/).filter((item) => item.includes(',')).length;
}

test('the main map polyline grows as a foreground walk streams in', async () => {
  const { JSDOM } = require('jsdom');
  const esbuild = require('esbuild');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.SVGElement = window.SVGElement;
  globalThis.Node = window.Node;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.ResizeObserver = globalThis.ResizeObserver;
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { x: 0, y: 0, width: 390, height: 700, top: 0, left: 0, right: 390, bottom: 700, toJSON() { return {}; } };
  };
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 390; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 390; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 700; } });

  const dir = path.resolve('node_modules/.cache');
  mkdirSync(dir, { recursive: true });
  const outfile = path.join(dir, 'street-map-trail.mjs');
  await esbuild.build({
    absWorkingDir: path.resolve('src/components/family'),
    entryPoints: ['streetMapTrail.entry.tsx'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    define: {
      'import.meta.env.VITE_VWORLD_API_KEY': '""',
    },
    plugins: [{
      name: 'css-empty',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css-empty' }));
        build.onLoad({ filter: /.*/, namespace: 'css-empty' }, () => ({ contents: 'export default "";', loader: 'js' }));
      },
    }],
  });
  const bundled = await import(pathToFileURL(outfile).href);
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { act } = React;
  const rootNode = document.getElementById('root');
  const root = createRoot(rootNode);
  const firstFixes = walkFixes(8);
  const firstPoints = ingest(firstFixes);
  const now = firstFixes[firstFixes.length - 1].at + 1_000;
  const member = {
    id: 'self',
    role: 'self',
    share: 'allowed',
    lat: firstFixes[firstFixes.length - 1].lat,
    lng: firstFixes[firstFixes.length - 1].lng,
    updatedAt: now,
    accuracyM: 12,
    moving: true,
  };
  const first = memberLiveLines(member, { self: firstPoints }, now);
  assert.equal(first.reason, 'draw', `${first.reason} live ${liveTrailPoints(firstPoints, now).length}`);
  const host = document.createElement('div');
  host.style.width = '390px';
  host.style.height = '700px';
  rootNode.appendChild(host);
  const mapRef = React.createRef();
  await act(async () => {
    root.render(React.createElement(bundled.StreetMap, {
      ref: mapRef,
      center: { lat: member.lat, lng: member.lng },
      zoom: 16,
      members: [],
      home: null,
      trails: first.lines,
      trailColor: '#0084FF',
      solidOnly: true,
      onSelect: () => {},
    }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const mapNode = document.querySelector('.leaflet-container');
  const earlyText = mapNode?.dataset?.trail || '';
  const early = trailCount(earlyText);
  assert.ok(early >= 2, `early polyline ${earlyText}`);

  const moreFixes = walkFixes(24);
  const morePoints = ingest(moreFixes);
  const laterNow = moreFixes[moreFixes.length - 1].at + 1_000;
  const laterMember = {
    ...member,
    lat: moreFixes[moreFixes.length - 1].lat,
    lng: moreFixes[moreFixes.length - 1].lng,
    updatedAt: laterNow,
  };
  const later = memberLiveLines(laterMember, { self: morePoints }, laterNow);
  assert.equal(later.reason, 'draw');
  await act(async () => {
    root.render(React.createElement(bundled.StreetMap, {
      ref: mapRef,
      center: { lat: laterMember.lat, lng: laterMember.lng },
      zoom: 16,
      members: [],
      home: null,
      trails: later.lines,
      trailColor: '#0084FF',
      solidOnly: true,
      onSelect: () => {},
    }));
  });
  const grownText = mapNode?.dataset?.trail || '';
  const lastLng = (text) => {
    const pairs = String(text).split(/[; ]/).filter((item) => item.includes(','));
    return Number(pairs[pairs.length - 1].split(',')[1]);
  };
  assert.ok(trailCount(grownText) >= 2 && lastLng(grownText) > lastLng(earlyText), `${earlyText} -> ${grownText}`);
  root.unmount();
});
