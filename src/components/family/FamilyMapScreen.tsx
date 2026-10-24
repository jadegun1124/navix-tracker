import React, { useEffect, useRef, useState } from 'react';
import { Bell, Copy, Home, LocateFixed, MapPin, Minus, Plus, Route, Satellite, UserPlus, X } from 'lucide-react';
import { buildInviteLink, formatClock, haversineMeters } from '../../lib/geo';
import { DEFAULT_CENTER, type HomeZone, type Member } from '../../types/family';
import { BASEMAPS, StreetMap, type BasemapStyle, type StreetMapHandle } from './StreetMap';
import { useFamily } from './session';

export function FamilyMapScreen() {
  const family = useFamily();
  const { state } = family;
  const self = state.members.find((member) => member.id === 'self');
  const [center] = useState(self ?? DEFAULT_CENTER);
  const [showZone, setShowZone] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [basemap, setBasemap] = useState<BasemapStyle>('satellite');
  const [mapNote, setMapNote] = useState('');
  const tileFallback = useRef(false);
  const [homeCenter, setHomeCenter] = useState(self ?? DEFAULT_CENTER);
  const mapRef = useRef<StreetMapHandle>(null);
  const [sheet, setSheet] = useState<'home' | 'invite' | null>(state.pendingInvite && state.pendingInvite !== state.inviteCode ? 'invite' : null);
  const [selectedId, setSelectedId] = useState(state.members.find((member) => member.isSample)?.id ?? 'self');
  const insideRef = useRef<Record<string, boolean>>({});
  const lastFix = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const centeredFix = useRef(false);
  const familyRef = useRef(family);
  useEffect(() => {
    familyRef.current = family;
  });
  const notifyOk = state.permissions.notifications === 'granted';

  useEffect(() => {
    if (state.permissions.locationMode === 'denied' || state.permissions.locationMode === 'unknown') return;
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude, at: Date.now() };
        if (lastFix.current) {
          const moved = haversineMeters(lastFix.current, next);
          if (moved < 8 && next.at - lastFix.current.at < 8000) return;
        }
        lastFix.current = next;
        familyRef.current.updateSelf(next.lat, next.lng, position.coords.accuracy);
        if (!centeredFix.current) {
          centeredFix.current = true;
          mapRef.current?.panTo(next.lat, next.lng);
        }
      },
      () => undefined,
      { enableHighAccuracy: state.permissions.accuracy === 'precise', maximumAge: 4000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [state.permissions.accuracy, state.permissions.locationMode]);

  useEffect(() => {
    if (state.permissions.motion !== 'granted') return;
    let still = 0;
    let lastMoving: boolean | null = null;
    const onMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      const active = Math.abs(magnitude - 9.8) > 3;
      still = active ? 0 : still + 1;
      const moving = active || still < 6;
      if (lastMoving === moving) return;
      lastMoving = moving;
      familyRef.current.setMotion(moving);
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [state.permissions.motion]);

  useEffect(() => {
    if (!state.home) return;
    for (const member of state.members) {
      const inside = haversineMeters(member, state.home) <= state.home.radiusM;
      const previous = insideRef.current[member.id];
      if (previous !== undefined && previous !== inside) {
        const title = inside ? `${member.name} 님이 집에 도착했습니다` : `${member.name} 님이 집을 나갔습니다`;
        const body = state.home.label || '우리 집 안심존';
        familyRef.current.pushNotice(title, body);
        if (notifyOk && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(title, { body });
          } catch {
            /* 알림 표시만 거절된 경우 */
          }
        }
      }
      insideRef.current[member.id] = inside;
    }
  }, [notifyOk, state.home, state.members]);

  const selected = state.members.find((member) => member.id === selectedId) ?? state.members[0];
  const trail = selected && showTrail ? state.tracks[selected.id] ?? [] : [];
  const trailColor = selected?.isSample ? '#ff8a34' : '#0084FF';

  const focusMember = (member: Member, fitTrail: boolean) => {
    setSelectedId(member.id);
    const points = state.tracks[member.id] ?? [];
    if (fitTrail && showTrail && points.length >= 2) mapRef.current?.fit(points);
    else mapRef.current?.panTo(member.lat, member.lng);
  };

  return (
    <div className="flex h-full justify-center bg-[#d7e3ee]">
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-white">
        <div className="relative min-h-0 flex-1">
          <StreetMap
            ref={mapRef}
            center={center}
            zoom={16}
            members={state.members}
            home={showZone ? state.home : null}
            trail={trail}
            trailColor={trailColor}
            selectedId={selected?.id}
            basemap={basemap}
            onTileProblem={() => {
              if (!tileFallback.current && basemap === 'satellite') {
                tileFallback.current = true;
                setBasemap('street');
                setMapNote('위성 사진을 불러오지 못해 일반 지도로 바꿨습니다.');
                return;
              }
              setMapNote('지도 타일을 불러오지 못했습니다. 핀과 경로는 이 화면에 남아 있습니다.');
            }}
            onSelect={(id) => {
              const member = state.members.find((item) => item.id === id);
              if (member) focusMember(member, true);
            }}
          />

          <div className="pointer-events-none absolute left-3 top-3 z-30 max-w-[230px] rounded-2xl bg-white/95 px-3 py-1.5 text-[11px] font-semibold leading-4 text-slate-600 shadow">
            {BASEMAPS[basemap].label}
            {mapNote && <span className="mt-0.5 block text-amber-700">{mapNote}</span>}
            {showTrail && selected && (
              <span className="mt-0.5 block text-slate-500">
                {selected.name} 경로 {trail.length}점 · 이 기기에만 저장
              </span>
            )}
          </div>

          <div className="absolute right-3 top-14 z-30 flex flex-col gap-2">
            <RoundButton
              label={basemap === 'satellite' ? '일반 지도로 전환' : '위성 지도로 전환'}
              onClick={() => {
                tileFallback.current = true;
                setMapNote('');
                setBasemap((value) => (value === 'satellite' ? 'street' : 'satellite'));
              }}
            >
              <Satellite className={`h-5 w-5 ${basemap === 'satellite' ? 'text-[#0084FF]' : 'text-slate-400'}`} />
            </RoundButton>
            <RoundButton label="안심존 표시" onClick={() => setShowZone((value) => !value)}>
              <Home className={`h-5 w-5 ${showZone ? 'text-[#0084FF]' : 'text-slate-400'}`} />
            </RoundButton>
            <RoundButton
              label="이동 경로"
              onClick={() => {
                setShowTrail((value) => {
                  const next = !value;
                  if (next && selected) {
                    const points = state.tracks[selected.id] ?? [];
                    if (points.length >= 2) mapRef.current?.fit(points);
                  }
                  return next;
                });
              }}
            >
              <Route className={`h-5 w-5 ${showTrail ? 'text-[#0084FF]' : 'text-slate-400'}`} />
            </RoundButton>
            <RoundButton label="확대" onClick={() => mapRef.current?.zoomBy(1)}>
              <Plus className="h-5 w-5" />
            </RoundButton>
            <RoundButton label="축소" onClick={() => mapRef.current?.zoomBy(-1)}>
              <Minus className="h-5 w-5" />
            </RoundButton>
            <RoundButton
              label="내 위치"
              onClick={() => {
                if (self) focusMember(self, false);
              }}
            >
              <LocateFixed className="h-5 w-5 text-[#0084FF]" />
            </RoundButton>
          </div>

          <button
            type="button"
            onClick={() => setSheet('invite')}
            className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-[#0084FF] px-3 py-2 text-xs font-bold text-white shadow-lg"
          >
            <UserPlus className="h-4 w-4" />
            가족 추가
          </button>
        </div>

        {state.tab === 'map' && (
          <section className="rounded-t-3xl bg-white px-4 pb-2 pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-black">우리 가족</h2>
              <button
                type="button"
                onClick={() => {
                  setHomeCenter(mapRef.current?.getCenter() ?? center);
                  setSheet('home');
                }}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
              >
                {state.home ? '우리 집 수정' : '우리 집 추가'}
              </button>
            </div>
            {state.profile?.preview && <p className="mb-2 text-xs font-semibold text-amber-600">미리보기 세션 · Google 계정으로 연결되지 않았습니다.</p>}
            <div className="max-h-36 space-y-2 overflow-y-auto pb-2">
              {state.members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  home={state.home}
                  selected={member.id === selected?.id}
                  onSelect={() => focusMember(member, true)}
                  onRemove={member.isSample ? () => family.removeMember(member.id) : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {state.tab === 'alerts' && (
          <section className="min-h-[46%] overflow-y-auto bg-white px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black">알림</h2>
              <button type="button" onClick={family.markAlertsRead} className="text-xs font-bold text-[#0084FF]">
                모두 읽음
              </button>
            </div>
            {state.notices.length === 0 ? (
              <p className="text-sm leading-6 text-slate-500">아직 알림이 없습니다. 우리 집을 저장하면 들어오고 나갈 때 여기에 기록됩니다.</p>
            ) : (
              <ul className="space-y-2">
                {state.notices.map((item) => (
                  <li key={item.id} className={`rounded-2xl px-3 py-3 ${item.read ? 'bg-slate-50' : 'bg-blue-50'}`}>
                    <p className="text-sm font-bold">{item.title}</p>
                    <p className="text-xs leading-5 text-slate-500">{item.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{formatClock(item.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {state.tab === 'menu' && (
          <section className="min-h-[52%] overflow-y-auto bg-white px-4 py-4 text-sm">
            <h2 className="text-lg font-black">메뉴</h2>
            <p className="mt-3 font-bold">{state.profile?.name}</p>
            <p className="text-slate-500">{state.profile?.email || (state.profile?.preview ? '미리보기 계정' : 'Google 계정')}</p>
            {state.phone && <p className="mt-1 text-slate-500">연락처 {state.phone}</p>}
            <dl className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 text-slate-600">
              <Line k="알림" v={labelOf(state.permissions.notifications)} />
              <Line k="위치 정확도" v={state.permissions.accuracy === 'precise' ? '정확한 위치' : '대략적인 위치'} />
              <Line k="위치 허용" v={locationLabel(state.permissions.locationMode)} />
              <Line k="움직임" v={labelOf(state.permissions.motion)} />
              <Line k="배터리 안내" v={state.permissions.battery === 'acknowledged' ? '확인함' : state.permissions.battery === 'skipped' ? '나중에' : '해당 없음'} />
            </dl>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              항상 허용은 선호로 저장됩니다. 이 버전은 앱이 열려 있는 동안 위치를 갱신하고, 권한을 몰래 올리지 않습니다.
            </p>
            <div className="mt-4 space-y-2">
              <button type="button" onClick={family.revisitPermissions} className="w-full rounded-full bg-slate-100 py-3 font-bold">
                권한 안내 다시 보기
              </button>
              <button type="button" onClick={family.logout} className="w-full rounded-full py-3 font-bold text-slate-500">
                로그아웃
              </button>
            </div>
          </section>
        )}

        <nav className="grid grid-cols-3 border-t border-slate-100 bg-white pb-[env(safe-area-inset-bottom)] text-[11px] font-bold text-slate-400">
          <NavButton active={state.tab === 'map'} label="지도" onClick={() => family.setTab('map')} icon={<MapPin className="h-5 w-5" />} />
          <NavButton active={state.tab === 'alerts'} label="알림" badge={state.notices.some((item) => !item.read)} onClick={() => family.setTab('alerts')} icon={<Bell className="h-5 w-5" />} />
          <NavButton active={state.tab === 'menu'} label="메뉴" onClick={() => family.setTab('menu')} icon={<span className="text-lg leading-none">☰</span>} />
        </nav>

        {sheet === 'home' && (
          <HomeSheet
            initial={state.home}
            center={homeCenter}
            onClose={() => setSheet(null)}
            onSave={(home) => {
              family.saveHome(home);
              mapRef.current?.panTo(home.lat, home.lng);
              setSheet(null);
            }}
            onClear={() => {
              family.clearHome();
              setSheet(null);
            }}
          />
        )}
        {sheet === 'invite' && (
          <InviteSheet
            code={state.inviteCode}
            pending={state.pendingInvite}
            onClose={() => {
              family.dismissInvite();
              setSheet(null);
            }}
            onAdd={(name, code) => {
              family.addMember(name, code);
              setSheet(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function MemberCard({
  member,
  home,
  selected,
  onSelect,
  onRemove,
}: {
  member: Member;
  home: HomeZone | null;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const place = home && haversineMeters(member, home) <= home.radiusM ? '우리 집 안' : '집 밖';
  return (
    <div className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${selected ? 'bg-blue-50' : 'bg-slate-50'}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full font-black text-white ${member.isSample ? 'bg-[#ff8a34]' : 'bg-[#0084FF]'}`}>
        {member.name.slice(0, 1)}
      </span>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-bold">{member.name}</span>
          {member.isSample && <span className="rounded-full bg-orange-100 px-1.5 text-[10px] font-bold text-orange-600">샘플</span>}
        </span>
        <span className="block text-xs text-slate-500">
          {home ? place : '위치 공유 중'} · ±{Math.round(member.accuracyM)}m
          {member.battery != null ? ` · 배터리 ${member.battery}%` : ''}
          {member.moving === true ? ' · 이동 중' : member.moving === false ? ' · 머무름' : ''}
        </span>
      </span>
    </button>
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-[11px] font-bold text-slate-400">
          지우기
        </button>
      )}
    </div>
  );
}

function HomeSheet({
  initial,
  center,
  onClose,
  onSave,
  onClear,
}: {
  initial: HomeZone | null;
  center: { lat: number; lng: number };
  onClose: () => void;
  onSave: (home: HomeZone) => void;
  onClear: () => void;
}) {
  const [address, setAddress] = useState(initial?.address ?? '');
  const [radius, setRadius] = useState(initial?.radiusM ?? 200);
  return (
    <Sheet title="우리 집 추가" onClose={onClose}>
      <p className="text-sm leading-6 text-slate-500">지도 가운데를 집으로 저장합니다. 주소는 가족에게 보여 줄 이름입니다.</p>
      <label className="mt-4 block text-xs font-bold text-slate-400" htmlFor="home-address">
        주소
      </label>
      <input
        id="home-address"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="예: 서울 노원구 하계동"
        className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-[#0084FF]"
      />
      <p className="mt-4 text-xs font-bold text-slate-400">반경 {radius}m</p>
      <input type="range" min={100} max={500} step={50} value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="mt-2 w-full" />
      <button
        type="button"
        onClick={() =>
          onSave({
            label: address.trim() || '우리 집',
            address: address.trim(),
            lat: center.lat,
            lng: center.lng,
            radiusM: radius,
          })
        }
        className="mt-4 w-full rounded-full bg-[#ff8a34] py-3.5 font-bold text-white"
      >
        저장
      </button>
      {initial && (
        <button type="button" onClick={onClear} className="mt-2 w-full py-2 text-sm font-bold text-slate-400">
          우리 집 지우기
        </button>
      )}
    </Sheet>
  );
}

function InviteSheet({
  code,
  pending,
  onClose,
  onAdd,
}: {
  code: string;
  pending: string | null;
  onClose: () => void;
  onAdd: (name: string, code: string) => void;
}) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState(pending && pending !== code ? pending : '');
  const [copied, setCopied] = useState('');

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied('복사하지 못했습니다');
    }
  };

  return (
    <Sheet title="가족 추가" onClose={onClose}>
      <p className="text-sm leading-6 text-slate-500">가족의 휴대폰에 Umap을 설치한 뒤 이 코드를 입력합니다. 코드를 아는 사람만 목록에 추가됩니다.</p>
      <p className="mt-4 text-center text-4xl font-black tracking-[0.25em] text-[#0084FF]">{code}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => copy(code, '코드를 복사했습니다')} className="rounded-full bg-slate-100 py-2 text-xs font-bold">
          <Copy className="mr-1 inline h-3.5 w-3.5" />
          코드 복사
        </button>
        <button type="button" onClick={() => copy(buildInviteLink(code), '링크를 복사했습니다')} className="rounded-full bg-slate-100 py-2 text-xs font-bold">
          링크 복사
        </button>
      </div>
      {copied && <p className="mt-2 text-center text-xs font-semibold text-[#0084FF]">{copied}</p>}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-sm font-bold">코드로 합류</p>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="표시 이름" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-[#0084FF]" />
        <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="초대 코드" inputMode="numeric" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-[#0084FF]" />
        <button
          type="button"
          disabled={name.trim().length < 1 || joinCode.length < 4}
          onClick={() => onAdd(name, joinCode)}
          className="mt-3 w-full rounded-full bg-[#ff8a34] py-3.5 font-bold text-white disabled:opacity-40"
        >
          가족 목록에 추가
        </button>
      </div>
    </Sheet>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end bg-slate-900/40">
      <div className="max-h-[86%] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RoundButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md">
      {children}
    </button>
  );
}

function NavButton({ active, label, icon, onClick, badge }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void; badge?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`relative flex flex-col items-center gap-1 py-2 ${active ? 'text-[#0084FF]' : ''}`}>
      {icon}
      {label}
      {badge && <span className="absolute right-[34%] top-1 h-2 w-2 rounded-full bg-[#ff8a34]" />}
    </button>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{k}</dt>
      <dd className="font-semibold text-slate-800">{v}</dd>
    </div>
  );
}

function labelOf(value: string): string {
  if (value === 'granted') return '허용';
  if (value === 'denied') return '허용 안 함';
  if (value === 'skipped') return '건너뜀';
  if (value === 'acknowledged') return '확인함';
  return '아직 없음';
}

function locationLabel(value: string): string {
  if (value === 'while-using') return '앱 사용 중에만';
  if (value === 'always') return '항상 허용(선호 저장)';
  if (value === 'denied') return '허용 안 함';
  return '아직 없음';
}
