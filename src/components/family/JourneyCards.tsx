import { useMemo } from 'react';
import { formatJourneyDistance, formatJourneyWhen } from '../../lib/tracking.mjs';
import type { Journey } from '../../types/family';

type OpenJourney = {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  points: { lat: number; lng: number }[];
  start: { lat: number; lng: number; label: string | null };
  end: { lat: number; lng: number; label: string | null };
};

function placeText(place: { lat: number; lng: number; label: string | null }) {
  if (place.label && place.label.trim()) return place.label.trim();
  return `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
}

function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
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
    <svg viewBox="0 0 280 96" className="mt-2 h-24 w-full rounded-xl bg-[#e8f3ff]" aria-hidden="true">
      <polyline points={line} fill="none" stroke="#0084FF" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {first.length === 2 && <circle cx={first[0]} cy={first[1]} r="4" fill="#22c55e" />}
      {last.length === 2 && <circle cx={last[0]} cy={last[1]} r="4" fill="#0084FF" />}
    </svg>
  );
}

function Card({
  selected,
  when,
  duration,
  distance,
  start,
  end,
  moving,
  points,
  onSelect,
}: {
  selected: boolean;
  when: string;
  duration: string;
  distance: string;
  start: string;
  end: string;
  moving: boolean;
  points: { lat: number; lng: number }[];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-3xl px-3 py-3 text-left ${selected ? 'bg-blue-50 ring-2 ring-[#0084FF]' : 'bg-slate-50'}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-black text-slate-900">{when} · {duration}</span>
          {moving && <span className="mt-0.5 block text-[11px] font-bold text-[#0084FF]">이동 중</span>}
        </span>
        <span className="text-lg font-black text-slate-900">{distance}</span>
      </span>
      <span className="mt-2 block text-xs leading-5 text-slate-500">{start} → {end}</span>
      <MiniTrail points={points} />
    </button>
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
  if (journeys.length === 0 && !open) {
    return (
      <p className="rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
        아직 끝난 여정이 없습니다. 이동한 뒤 한곳에서 7분 이상 머물면 여기에 시간, 거리, 경로가 남습니다.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {open && (
        <Card
          selected={selectedId === 'open'}
          when={formatJourneyWhen(open.startedAt, open.endedAt)}
          duration={formatDuration(open.endedAt - open.startedAt)}
          distance={formatJourneyDistance(open.distanceM)}
          start={placeText(open.start)}
          end={placeText(open.end)}
          moving
          points={open.points}
          onSelect={() => onSelect('open')}
        />
      )}
      {journeys.map((journey) => (
        <Card
          key={journey.id}
          selected={selectedId === journey.id}
          when={formatJourneyWhen(journey.startedAt, journey.endedAt)}
          duration={formatDuration(journey.endedAt - journey.startedAt)}
          distance={formatJourneyDistance(journey.distanceM)}
          start={placeText(journey.start)}
          end={placeText(journey.end)}
          moving={false}
          points={journey.points}
          onSelect={() => onSelect(journey.id)}
        />
      ))}
    </div>
  );
}
