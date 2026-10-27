import { formatClock } from '../../lib/geo';
import { formatDistanceM, formatDurationMs, modeLabel, STRIDE_M } from '../../lib/tracking.mjs';
import type { DaySegment, DayStop } from '../../lib/tracking.mjs';
import type { Visit } from '../../types/family';

export function TodayRecord({
  segments,
  stops,
  visits,
}: {
  segments: DaySegment[];
  stops: DayStop[];
  visits: Visit[];
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-6 text-slate-500">
        반경 50m 안에 3분 이상 머물면 정지로 기록하고, 정지와 정지 사이를 한 구간으로 봅니다. 이동 시간은 출발부터 다음 정지까지입니다. 이 폰에는 서울 날짜로 오늘부터 30일 전까지 남고, 그보다 오래된 기록은 지웁니다. 서버에는 마지막 위치만 남습니다.
      </p>
      <section>
        <h3 className="text-xs font-bold text-slate-400">이동 구간</h3>
        {segments.length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-500">아직 구간이 없습니다. 한 곳에 머물렀다가 다음 장소로 이동하면 여기에 이동 시간과 수단이 나옵니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {segments.map((segment) => (
              <li key={`${segment.departAt}-${segment.arriveAt}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                <p className="font-bold">
                  {modeLabel(segment.mode)} · {formatDurationMs(segment.durationMs)} · {formatDistanceM(segment.distanceM)}
                  {segment.open ? ' · 이동 중' : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {formatClock(segment.departAt)} 출발
                  {segment.open ? '' : ` → ${formatClock(segment.arriveAt)} 도착`}
                </p>
                {segment.stepsEstimated && segment.steps != null && segment.steps > 0 && (
                  <p className="text-xs font-semibold text-[#0084FF]">추정 {segment.steps.toLocaleString('ko-KR')}걸음</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-xs font-bold text-slate-400">방문한 곳</h3>
        {visits.length === 0 && stops.length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-500">아직 방문이 없습니다. 좌표만 남을 때는 주소 대신 위도·경도를 보여 줍니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {(visits.length > 0 ? visits.map((visit) => ({
              key: visit.id,
              label: visit.label || `${visit.lat.toFixed(5)}, ${visit.lng.toFixed(5)}`,
              arrivedAt: visit.arrivedAt,
              leftAt: visit.leftAt,
              estimated: !visit.label,
            })) : stops.map((stop) => ({
              key: `${stop.arrivedAt}`,
              label: `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`,
              arrivedAt: stop.arrivedAt,
              leftAt: stop.leftAt,
              estimated: true,
            }))).map((visit) => (
              <li key={visit.key} className="rounded-2xl bg-slate-50 px-3 py-2">
                <p className="font-bold">{visit.label}</p>
                <p className="text-xs text-slate-500">
                  {formatClock(visit.arrivedAt)} 도착
                  {visit.leftAt == null ? ' · 머무는 중' : ` · ${formatClock(visit.leftAt)} 출발`}
                  {visit.estimated ? ' · 좌표' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-[11px] leading-5 text-slate-400">
        수단은 구간 평균 속도입니다. 도보 7km/h 미만, 자전거 23km/h 미만, 차량 200km/h 미만입니다. 200km/h 이상이고 20km·3분이 넘으면 비행기입니다. 도보 걸음은 거리 ÷ {STRIDE_M}m 추정이며 만보계는 쓰지 않습니다.
      </p>
    </div>
  );
}
