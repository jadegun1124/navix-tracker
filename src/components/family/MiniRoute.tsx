import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { VWORLD_ATTRIBUTION, vworldApiKey, vworldBaseTileUrl } from '../../services/vworld';

function RouteSvg({ points }: { points: { lat: number; lng: number }[] }) {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const width = Math.max(maxLng - minLng, 0.0008);
  const height = Math.max(maxLat - minLat, 0.0008);
  const line = points
    .map((point) => {
      const x = ((point.lng - minLng) / width) * 280 + 16;
      const y = (1 - (point.lat - minLat) / height) * 112 + 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 312 136" className="h-full w-full" role="img" aria-label="이동 경로">
      <polyline points={line} fill="none" stroke="#0084FF" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function MiniRoute({ points }: { points: { lat: number; lng: number }[] }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const key = vworldApiKey();
  const signature = points.map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`).join(';');

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !key || points.length < 2) return;
    const map = L.map(node, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    map.attributionControl.setPrefix('');
    const tiles = L.tileLayer(vworldBaseTileUrl(key), {
      attribution: VWORLD_ATTRIBUTION,
      minZoom: 6,
      maxZoom: 19,
      bounds: L.latLngBounds([32.8, 124.0], [39.8, 132.1]),
    });
    tiles.addTo(map);
    const latlngs = points.map((point) => [point.lat, point.lng] as [number, number]);
    L.polyline(latlngs, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(map);
    const line = L.polyline(latlngs, { color: '#0084FF', weight: 4 }).addTo(map);
    const start = latlngs[0];
    const end = latlngs[latlngs.length - 1];
    if (start) L.circleMarker(start, { radius: 5, color: '#0084FF', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(map);
    if (end) L.circleMarker(end, { radius: 6, color: '#0084FF', fillColor: '#0084FF', fillOpacity: 1, weight: 2 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [18, 18], maxZoom: 16 });
    const timer = window.setTimeout(() => map.invalidateSize(), 180);
    return () => {
      window.clearTimeout(timer);
      map.remove();
    };
  }, [key, signature, points]);

  if (points.length < 2) {
    return <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">경로 점이 아직 없습니다.</p>;
  }

  return (
    <div className="relative mt-3 h-36 overflow-hidden rounded-2xl bg-[#e7eef6]">
      {key ? <div ref={nodeRef} className="h-full w-full" /> : <RouteSvg points={points} />}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-500">
        {key ? 'VWorld 2D' : 'VWorld 키 없음 · 경로 모양'}
      </span>
    </div>
  );
}
