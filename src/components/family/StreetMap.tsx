import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { VWORLD_ATTRIBUTION, vworldApiKey, vworldBaseTileUrl } from '../../services/vworld';
import type { HomeZone, Member, TrackPoint } from '../../types/family';
import { hasLocation } from '../../lib/geo';

export interface StreetMapHandle {
  panTo: (lat: number, lng: number) => void;
  zoomBy: (delta: number) => void;
  fit: (points: { lat: number; lng: number }[]) => void;
  getCenter: () => { lat: number; lng: number };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export const StreetMap = forwardRef<StreetMapHandle, {
  center: { lat: number; lng: number };
  zoom: number;
  members: Member[];
  home: HomeZone | null;
  trail: TrackPoint[];
  trailColor: string;
  selectedId?: string;
  onSelect: (id: string) => void;
}>(function StreetMap({ center, zoom, members, home, trail, trailColor, selectedId, onSelect }, ref) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [tileNote, setTileNote] = useState('');
  const key = vworldApiKey();
  const initialRef = useRef({ center, zoom });
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useImperativeHandle(ref, () => ({
    panTo(lat, lng) {
      mapRef.current?.panTo([lat, lng], { animate: true });
    },
    zoomBy(delta) {
      const map = mapRef.current;
      if (!map) return;
      map.setZoom(Math.min(19, Math.max(7, map.getZoom() + delta)));
    },
    fit(points) {
      const map = mapRef.current;
      if (!map || points.length < 2) return;
      map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng])), {
        padding: [48, 48],
        maxZoom: 17,
        animate: true,
      });
    },
    getCenter() {
      const current = mapRef.current?.getCenter();
      return current ? { lat: current.lat, lng: current.lng } : center;
    },
  }));

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || mapRef.current) return;
    const start = initialRef.current;
    const map = L.map(node, {
      center: [start.center.lat, start.center.lng],
      zoom: start.zoom,
      zoomControl: false,
      attributionControl: true,
      minZoom: 6,
      maxZoom: 19,
    });
    map.attributionControl.setPosition('bottomleft');
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setReady(true);
    const resize = () => map.invalidateSize();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    const timer = window.setTimeout(resize, 250);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      setReady(false);
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !key) return;
    const tiles = L.tileLayer(vworldBaseTileUrl(key), {
      attribution: VWORLD_ATTRIBUTION,
      minZoom: 6,
      maxZoom: 19,
      // 브이월드 Base는 한국 영역만 제공한다. 영역 밖 404가 키 오류로 남지 않게 한다.
      bounds: L.latLngBounds([32.8, 124.0], [39.8, 132.1]),
    });
    tiles.addTo(map);
    let loads = 0;
    const report = () => {
      if (loads > 0) return;
      const origin = window.location.origin;
      setTileNote(`브이월드 지도를 불러오지 못했습니다. 키는 이 빌드에 있습니다. 인증키 도메인에 ${origin} 을 등록해 주세요.`);
    };
    tiles.on('tileload', () => {
      loads += 1;
      setTileNote('');
    });
    const watchdog = window.setTimeout(report, 8000);
    return () => {
      window.clearTimeout(watchdog);
      tiles.off();
      map.removeLayer(tiles);
    };
  }, [key, ready]);

  useEffect(() => {
    const group = layersRef.current;
    if (!ready || !group) return;
    group.clearLayers();

    if (home) {
      L.circle([home.lat, home.lng], {
        radius: home.radiusM,
        color: '#0084FF',
        weight: 2,
        fillColor: '#0084FF',
        fillOpacity: 0.14,
      }).addTo(group);
      L.marker([home.lat, home.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'umap-home-label',
          html: '<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#fff;color:#0f172a;font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(15,23,42,.16)">우리 집</span>',
          iconSize: [64, 22],
          iconAnchor: [32, 28],
        }),
      }).addTo(group);
    }

    if (trail.length >= 2) {
      const latlngs = trail.map((point) => [point.lat, point.lng] as [number, number]);
      const split = Math.max(1, latlngs.length - 3);
      L.polyline(latlngs, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(group);
      L.polyline(latlngs.slice(0, split), {
        color: trailColor,
        weight: 4,
        opacity: 0.95,
        dashArray: '6 8',
      }).addTo(group);
      L.polyline(latlngs.slice(split - 1), {
        color: trailColor,
        weight: 6,
        opacity: 1,
      }).addTo(group);
      const start = trail[0];
      L.circleMarker([start.lat, start.lng], {
        radius: 5,
        color: trailColor,
        weight: 2,
        fillColor: '#ffffff',
        fillOpacity: 1,
      }).addTo(group);
    }

    for (const member of members) {
      if (!hasLocation(member)) continue;
      const selected = member.id === selectedId;
      const color = '#0084FF';
      const label = escapeHtml(member.name);
      const initial = escapeHtml(member.name.slice(0, 1));
      const marker = L.marker([member.lat, member.lng], {
        zIndexOffset: selected ? 800 : 400,
        icon: L.divIcon({
          className: 'umap-member-pin',
          html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%)">
            <span style="margin-bottom:4px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(15,23,42,.16);background:${selected ? '#0084FF' : '#fff'};color:${selected ? '#fff' : '#0f172a'}">${label}</span>
            <span style="width:42px;height:42px;border-radius:999px;border:4px solid #fff;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;box-shadow:0 6px 16px rgba(15,23,42,.2)">${initial}</span>
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      });
      marker.on('click', () => onSelectRef.current(member.id));
      marker.addTo(group);
    }
  }, [home, members, ready, selectedId, trail, trailColor]);

  const missingKey = !key;

  return (
    <div className="relative h-full min-h-[240px] w-full">
      <div ref={nodeRef} className="umap-street-map h-full min-h-[240px] w-full" />
      {(missingKey || tileNote) && (
        <div className="pointer-events-none absolute inset-x-4 top-16 z-20 rounded-2xl bg-white/95 px-4 py-3 text-center text-sm font-semibold leading-6 text-slate-700 shadow">
          {missingKey
            ? 'VWorld 지도 키가 이 빌드에 없습니다. APK와 Pages는 빌드 시 VITE_VWORLD_API_KEY가 있어야 타일을 받습니다.'
            : tileNote}
        </div>
      )}
    </div>
  );
});
