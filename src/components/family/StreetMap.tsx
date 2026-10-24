import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HomeZone, Member, TrackPoint } from '../../types/family';

export type BasemapStyle = 'satellite' | 'street';

export const BASEMAPS: Record<BasemapStyle, {
  label: string;
  url: string;
  labels: string;
  attribution: string;
  subdomains?: string;
  maxZoom: number;
}> = {
  satellite: {
    label: '위성 지도 · Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
  street: {
    label: '일반 지도 · OpenStreetMap / CARTO',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    labels: '',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
};

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
  basemap: BasemapStyle;
  onTileProblem: () => void;
  onSelect: (id: string) => void;
}>(function StreetMap({ center, zoom, members, home, trail, trailColor, selectedId, basemap, onTileProblem, onSelect }, ref) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const initialRef = useRef({ center, zoom });
  const onSelectRef = useRef(onSelect);
  const onTileProblemRef = useRef(onTileProblem);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onTileProblemRef.current = onTileProblem;
  });

  useImperativeHandle(ref, () => ({
    panTo(lat, lng) {
      mapRef.current?.panTo([lat, lng], { animate: true });
    },
    zoomBy(delta) {
      const map = mapRef.current;
      if (!map) return;
      const maxZoom = BASEMAPS[basemap].maxZoom;
      map.setZoom(Math.min(maxZoom, Math.max(12, map.getZoom() + delta)));
    },
    fit(points) {
      const map = mapRef.current;
      if (!map || points.length < 2) return;
      map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng])), {
        padding: [48, 48],
        maxZoom: Math.min(17, BASEMAPS[basemap].maxZoom),
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
    if (!ready || !map) return;
    const spec = BASEMAPS[basemap];
    const control = map.attributionControl as L.Control.Attribution & { _attributions?: Record<string, number> };
    for (const key of Object.keys(control._attributions ?? {})) control.removeAttribution(key);
    const tileOptions: L.TileLayerOptions = {
      attribution: spec.attribution,
      maxZoom: spec.maxZoom,
    };
    if (spec.subdomains) tileOptions.subdomains = spec.subdomains;
    const tiles = L.tileLayer(spec.url, tileOptions);
    const labels = spec.labels
      ? L.tileLayer(spec.labels, { maxZoom: spec.maxZoom, opacity: 0.92 })
      : null;
    tiles.addTo(map);
    labels?.addTo(map);
    let loads = 0;
    let errors = 0;
    let reported = false;
    const report = () => {
      if (reported || loads > 0) return;
      reported = true;
      onTileProblemRef.current();
    };
    const onError = () => {
      errors += 1;
      if (errors >= 3) report();
    };
    tiles.on('tileload', () => {
      loads += 1;
    });
    tiles.on('tileerror', onError);
    const watchdog = window.setTimeout(() => {
      if (loads === 0) report();
    }, 8000);
    return () => {
      window.clearTimeout(watchdog);
      tiles.off();
      map.removeLayer(tiles);
      if (labels) map.removeLayer(labels);
    };
  }, [basemap, ready]);

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

  return <div ref={nodeRef} className="umap-street-map h-full min-h-[240px] w-full" />;
});
