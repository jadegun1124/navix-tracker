import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HomeZone, Member, TrackPoint } from '../../types/family';

export interface StreetMapHandle {
  panTo: (lat: number, lng: number) => void;
  zoomBy: (delta: number) => void;
  fit: (points: { lat: number; lng: number }[]) => void;
  getCenter: () => { lat: number; lng: number };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

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
      map.setZoom(Math.min(19, Math.max(12, map.getZoom() + delta)));
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
    if (!nodeRef.current || mapRef.current) return;
    const start = initialRef.current;
    const map = L.map(nodeRef.current, {
      center: [start.center.lat, start.center.lng],
      zoom: start.zoom,
      zoomControl: false,
      attributionControl: true,
    });
    L.tileLayer(TILES, {
      attribution: ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setReady(true);
    const resize = () => map.invalidateSize();
    resize();
    const timer = window.setTimeout(resize, 200);
    return () => {
      window.clearTimeout(timer);
      setReady(false);
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

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
      L.polyline(latlngs.slice(0, split), {
        color: trailColor,
        weight: 4,
        opacity: 0.4,
        dashArray: '6 8',
      }).addTo(group);
      L.polyline(latlngs.slice(split - 1), {
        color: trailColor,
        weight: 6,
        opacity: 0.95,
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
      const selected = member.id === selectedId;
      const color = member.isSample ? '#ff8a34' : '#0084FF';
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

  return <div ref={nodeRef} className="umap-street-map h-full w-full" />;
});
