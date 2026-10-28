import { useMemo } from 'react';
import { Route } from 'lucide-react';
import { haversineMeters } from '../../lib/geo';
import { formatJourneyDistance } from '../../lib/tracking.mjs';
import type { Journey } from '../../types/family';

type Place = { lat: number; lng: number; label: string | null };
type Sample = { lat: number; lng: number; at: number; speedMps?: number | null };

export type OpenJourney = {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  points: Sample[];
  start: Place;
  end: Place;
};

function placeText(place: Place) {
  if (place.label && place.label.trim()) return place.label.trim();
  return `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
}

function seoulClock(at: number) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function rangeLabel(startedAt: number, endedAt: number) {
  return `${seoulClock(startedAt)} - ${seoulClock(endedAt)} (${formatDuration(endedAt - startedAt)})`;
}

function spacedDistance(meters: number) {
  const raw = formatJourneyDistance(meters);
  if (raw.endsWith('km')) return `${raw.slice(0, -2)} km`;
  if (raw.endsWith('m')) return `${raw.slice(0, -1)} m`;
  return raw;
}

export function playbackMark(points: Sample[], ratio: number): { lat: number; lng: number; label: string } | null {
  if (!points.length) return null;
  const clamped = Math.min(1, Math.max(0, ratio));
  const target = points[0].at + (points[points.length - 1].at - points[0].at) * clamped;
  let index = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].at <= target) index = i;
    else break;
  }
  const point = points[index];
  const next = points[Math.min(points.length - 1, index + 1)];
  let speed = typeof point.speedMps === 'number' ? point.speedMps : null;
  if (speed == null && next !== point) {
    const dt = (next.at - point.at) / 1000;
    if (dt > 0) speed = haversineMeters(point, next) / dt;
  }
  const kmh = speed == null || !Number.isFinite(speed) ? 0 : Math.max(0, Math.round(speed * 3.6));
  return { lat: point.lat, lng: point.lng, label: `${seoulClock(point.at)} / ${kmh} km/h` };
}

function MiniTrail({ points }: { points: { lat: number; lng: number }[] }) {
  const line = useMemo(() => {
    if (points.length < 2) return '';
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const point of points) {
      minLat = Math.min(minLat, point.lat);
      maxLat = Math.max(maxLat, point.lat);
      minLng = Math.min(minLng, point.lng);
      maxLng = Math.max(maxLng, point.lng);
    }
    const latSpan = Math.max(maxLat - minLat, 0.0004);
    const lngSpan = Math.max(maxLng - minLng, 0.0004);
    return points.map((point) => {
      const x = ((point.lng - minLng) / lngSpan) * 260 + 10;
      const y = (1 - (point.lat - minLat) / latSpan) * 76 + 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [points]);
  if (!line) return null;
  const ends = line.split(' ');
  const first = ends[0]?.split(',') ?? [];
  const last = ends[ends.length - 1]?.split(',') ?? [];
  return (
    <svg viewBox="0 0 280 96" className="mt-3 h-24 w-full rounded-xl bg-[#e8f3ff]" aria-hidden="true">
      <polyline points={line} fill="none" stroke="#0084FF" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {first.length === 2 && <circle cx={first[0]} cy={first[1]} r="4.5" fill="#0084FF" />}
      {last.length === 2 && <circle cx={last[0]} cy={last[1]} r="5" fill="#ffffff" stroke="#0084FF" strokeWidth="2.5" />}
    </svg>
  );
}

function PlaceLine({ hollow, text }: { hollow: boolean; text: string }) {
  return (
    <span className="flex items-center gap-2 text-xs leading-5 text-slate-600">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${hollow ? 'border-2 border-[#0084FF] bg-white' : 'bg-[#0084FF]'}`} />
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

function SummaryCard({
  journey,
  selected,
  onSelect,
}: {
  journey: Journey;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-3xl px-3 py-3 text-left ${selected ? 'bg-blue-50 ring-2 ring-[#0084FF]' : 'bg-slate-50'}`}
    >
      <span className="block text-xs font-black text-slate-400">최근 여정</span>
      <span className="mt-1 block text-sm font-black text-slate-900">{rangeLabel(journey.startedAt, journey.endedAt)}</span>
      <span className="mt-2 flex items-center gap-1.5 text-lg font-black text-slate-900">
        <Route className="h-4 w-4 text-[#0084FF]" aria-hidden="true" />
        {spacedDistance(journey.distanceM)}
      </span>
      <span className="mt-2 block space-y-1">
        <PlaceLine hollow={false} text={placeText(journey.start)} />
        <PlaceLine hollow text={placeText(journey.end)} />
      </span>
      <MiniTrail points={journey.points} />
      <span className="mt-3 inline-flex rounded-full bg-[#0084FF] px-3 py-1.5 text-xs font-bold text-white">전체 기록 보기 →</span>
    </button>
  );
}

export function JourneyScrubber({
  journey,
  scrub,
  label,
  onScrub,
}: {
  journey: Journey;
  scrub: number;
  label: string;
  onScrub: (value: number) => void;
}) {
  return (
    <div className="rounded-3xl bg-slate-50 px-3 py-3">
      <p className="text-sm font-black text-slate-900">{label}</p>
      <input
        type="range"
        min={0}
        max={1000}
        value={scrub}
        aria-label="여정 시간"
        onChange={(event) => onScrub(Number(event.target.value))}
        className="mt-2 w-full accent-[#0084FF]"
      />
      <div className="mt-2 space-y-1">
        <p className="flex items-center gap-2 text-xs text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full bg-[#0084FF]" />
          <span className="min-w-0 flex-1 truncate">{placeText(journey.start)}</span>
          <span className="font-bold">{seoulClock(journey.startedAt)}</span>
        </p>
        <p className="flex items-center gap-2 text-xs text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[#0084FF] bg-white" />
          <span className="min-w-0 flex-1 truncate">{placeText(journey.end)}</span>
          <span className="font-bold">{seoulClock(journey.endedAt)}</span>
        </p>
      </div>
    </div>
  );
}

export function JourneyCards({
  journeys,
  open,
  selectedId,
  onSelect,
}: {
  journeys: Journey[];
  open: OpenJourney | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [latest, ...older] = journeys;
  return (
    <div className="space-y-2">
      {open && (
        <button
          type="button"
          onClick={() => onSelect('open')}
          className={`w-full rounded-2xl px-3 py-2 text-left ${selectedId === 'open' ? 'bg-blue-50 ring-2 ring-[#0084FF]' : 'bg-white ring-1 ring-slate-200'}`}
        >
          <span className="block text-xs font-black text-[#0084FF]">지금</span>
          <span className="mt-0.5 block text-sm font-bold text-slate-800">
            {rangeLabel(open.startedAt, open.endedAt)} · {spacedDistance(open.distanceM)}
          </span>
        </button>
      )}
      {latest ? (
        <SummaryCard journey={latest} selected={selectedId === latest.id} onSelect={() => onSelect(latest.id)} />
      ) : (
        <p className="rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
          아직 끝난 여정이 없습니다. 이동한 뒤 한곳에서 7분 이상 머물면 최근 여정으로 남습니다.
        </p>
      )}
      {older.map((journey) => (
        <button
          key={journey.id}
          type="button"
          onClick={() => onSelect(journey.id)}
          className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left ${selectedId === journey.id ? 'bg-blue-50 ring-2 ring-[#0084FF]' : 'bg-slate-50'}`}
        >
          <span className="min-w-0 truncate text-xs font-bold text-slate-700">{rangeLabel(journey.startedAt, journey.endedAt)}</span>
          <span className="shrink-0 text-xs font-black text-slate-900">{spacedDistance(journey.distanceM)}</span>
        </button>
      ))}
    </div>
  );
}
