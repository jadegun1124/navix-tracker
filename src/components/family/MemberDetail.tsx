import React, { useState } from 'react';
import { Bike, Car, Clock, Footprints, MapPin, Plane, Route } from 'lucide-react';
import {
  formatDistance,
  formatDuration,
  formatRange,
  freshnessLabel,
  latestTodaySegment,
  modeLabel,
  openTripPreview,
  stepsCaption,
  summarizeTrips,
  type ActivitySnapshot,
  type PlaceVisit,
  type TripSegment,
} from '../../lib/activity';
import { haversineMeters, hasLocation } from '../../lib/geo';
import type { HomeZone, Member, TrackPoint } from '../../types/family';
import { MiniRoute } from './MiniRoute';

function ModeIcon({ mode }: { mode: TripSegment['mode'] | null }) {
  if (mode === 'bike') return <Bike className="h-5 w-5" />;
  if (mode === 'car') return <Car className="h-5 w-5" />;
  if (mode === 'plane') return <Plane className="h-5 w-5" />;
  return <Footprints className="h-5 w-5" />;
}

export function MemberDetail({
  member,
  picture,
  home,
  trail,
  segments,
  visits,
  activity,
  now,
  onBack,
  onFocusPath,
  onShowVisits,
}: {
  member: Member;
  picture: string | null;
  home: HomeZone | null;
  trail: TrackPoint[];
  segments: TripSegment[];
  visits: PlaceVisit[];
  activity: ActivitySnapshot | null;
  now: number;
  onBack: () => void;
  onFocusPath: (points: { lat: number; lng: number }[]) => void;
  onShowVisits: () => void;
}) {
  const [pane, setPane] = useState<'main' | 'summary' | 'places'>('main');
  const mine = segments.filter((segment) => segment.memberId === member.id && !segment.provisional);
  const recentClosed = latestTodaySegment(mine, member.id, now);
  const live = member.id === 'self' ? openTripPreview(activity, member.id, now) : null;
  const recent = live ?? recentClosed;
  const todaySegments = mine.filter((segment) => seoulOverlap(segment, now));
  const stats = summarizeTrips(todaySegments);
  const place = home && hasLocation(member) && haversineMeters(member, home) <= home.radiusM ? home.label : hasLocation(member) ? '현재 위치' : '위치 기다리는 중';
  const weekVisits = visits.filter((visit) => visit.memberId === member.id);

  return (
    <div className="max-h-[58vh] overflow-y-auto pb-3">
      <button type="button" onClick={onBack} className="text-xs font-bold text-[#0084FF]">
        가족 목록
      </button>
      <div className="mt-2 flex items-start gap-3">
        {picture ? (
          <img src={picture} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0084FF] text-lg font-black text-white">{member.name.slice(0, 1)}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-2xl font-black">{member.name}</h2>
            {member.battery != null && (
              <span className={`rounded-full px-2 py-1 text-xs font-black ${member.battery <= 20 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                {member.battery}%
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {place}
            {hasLocation(member) && <span className="font-bold text-emerald-600">{freshnessLabel(member.updatedAt, now)}</span>}
          </p>
          <p className="text-xs text-slate-400">
            {member.moveMode ? modeLabel(member.moveMode) : '이동 정보 없음'}
            {hasLocation(member) ? ` · ±${Math.round(member.accuracyM)}m` : ''}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px] font-bold text-slate-600">
        <Action label="위치기록" onClick={() => onFocusPath(trail)} icon={<Route className="mx-auto h-5 w-5 text-[#0084FF]" />} />
        <Action label="이동 요약" onClick={() => setPane('summary')} icon={<Clock className="mx-auto h-5 w-5 text-[#0084FF]" />} />
        <Action label="장소" onClick={() => { setPane('places'); onShowVisits(); }} icon={<MapPin className="mx-auto h-5 w-5 text-[#0084FF]" />} />
        <Action label="거리" onClick={() => setPane('summary')} icon={<span className="mx-auto block text-sm font-black text-[#0084FF]">km</span>} />
      </div>

      {pane === 'summary' && (
        <section className="mt-4 rounded-3xl bg-slate-50 p-4">
          <h3 className="font-black">오늘 이동 요약</h3>
          {todaySegments.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-slate-500">오늘 서울 시간 기준으로 끝난 이동이 없습니다. 휴대폰 사용이나 급정거는 센서가 없어 만들지 않습니다.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat k="거리" v={formatDistance(stats.distanceM)} />
              <Stat k="시간" v={formatDuration(stats.durationMs)} />
              <Stat k="최고 속도" v={`${Math.round(stats.topSpeedMps * 3.6)} km/h`} />
            </dl>
          )}
        </section>
      )}

      {pane === 'places' && (
        <section className="mt-4">
          <h3 className="font-black">이번 주 장소</h3>
          {weekVisits.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-slate-500">3분 이상 머문 곳이 없습니다. 지도의 원은 오래 머문 곳입니다.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {weekVisits.slice().reverse().map((visit) => (
                <li key={visit.id} className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="font-bold">{visit.label}</p>
                  <p className="text-xs text-slate-500">
                    {formatRange(visit.startedAt, visit.endedAt ?? now)}
                    {visit.endedAt == null ? ' · 머무는 중' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-4 rounded-3xl border border-slate-100 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black">최근 여정</h3>
          {recent && <span className="text-xs font-bold text-slate-400">{live ? '이동 중' : '오늘'}</span>}
        </div>
        {!recent ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">한곳에 머물다 50m 넘게 이동하면 출발과 도착, 시간, 거리가 여기에 쌓입니다. 선은 서울 날짜가 바뀌면 지도에서 지우고, 장소 기록은 일주일 둡니다.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-500">{formatRange(recent.startAt, recent.endAt)}</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-black">
              <ModeIcon mode={recent.mode} />
              {formatDistance(recent.distanceM)}
              <span className="text-sm font-bold text-slate-500">{modeLabel(recent.mode)}</span>
            </p>
            {stepsCaption(recent) && <p className="mt-1 text-xs font-semibold text-slate-500">{stepsCaption(recent)}</p>}
            <div className="mt-3 space-y-2 text-sm">
              <p><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#0084FF]" />출발</p>
              <p><span className="mr-2 inline-block h-2 w-2 rounded-full bg-slate-900" />도착</p>
            </div>
            <MiniRoute points={recent.path.length > 1 ? recent.path : [{ lat: recent.startLat, lng: recent.startLng }, { lat: recent.endLat, lng: recent.endLng }]} />
            <button type="button" onClick={() => onFocusPath(recent.path)} className="mt-3 w-full rounded-full bg-slate-100 py-2 text-xs font-bold">
              지도에서 경로 보기
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function seoulOverlap(segment: TripSegment, now: number): boolean {
  return latestTodaySegment([segment], segment.memberId, now) != null;
}

function Action({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl bg-slate-50 px-1 py-3">
      {icon}
      <span className="mt-1 block">{label}</span>
    </button>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3">
      <dt className="text-[11px] text-slate-400">{k}</dt>
      <dd className="mt-1 text-sm font-black">{v}</dd>
    </div>
  );
}
