import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Copy, Home, LocateFixed, MapPin, Minus, Plus, Route, UserPlus, X } from 'lucide-react';
import { buildInviteLink, formatAgo, formatClock, hasLocation, haversineMeters, shouldAlertLeave } from '../../lib/geo';
import { buildDayRecord, collapseStayTrail, displayCoordinate, formatDurationMs, historyDayKeys, historyDayLabel, modeLabel, seoulDayEndMs, seoulDayKey, visibleTrail } from '../../lib/tracking.mjs';
import { ackFamilyAlert, isFamilyAlertAcked, publishFamilyAlert, readFamilyAlert, subscribeFamilyAlerts, type FamilyAlert } from '../../services/familyAlert';
import { readSharedPlaces, subscribeSharedPlaces } from '../../services/familyShare';
import { currentSyncPhase, familySyncConfigured, splitSyncToken, startAdminRemoteSync, startSyncMonitor, subscribeSyncPhase, syncTokenFor, type SyncPhase } from '../../services/familySync';
import { sounds } from '../../utils/audio';
import { DEFAULT_CENTER, type GuardianLink, type HomeZone, type Member } from '../../types/family';
import { AlwaysAllowNotice } from './AlwaysAllowNotice';
import { InviteQrImage, InviteQrScan } from './InviteQr';
import { StreetMap, type StreetMapHandle } from './StreetMap';
import { TodayRecord } from './TodayRecord';
import { askAlwaysLocation, askBattery, askNotifications } from '../../services/systemPermissions';
import { useFamilyTracking } from './useFamilyTracking';
import { useFamily } from './session';

export function FamilyMapScreen() {
  const family = useFamily();
  const { state } = family;
  const self = state.members.find((member) => member.id === 'self');
  const center = DEFAULT_CENTER;
  const [showZone, setShowZone] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [homeCenter, setHomeCenter] = useState(DEFAULT_CENTER);
  const [draftHome, setDraftHome] = useState<HomeZone | null>(null);
  const mapRef = useRef<StreetMapHandle>(null);
  const [sheet, setSheet] = useState<'home' | 'invite' | 'accept' | 'today' | null>(state.mode === 'managed' && state.pendingInvite ? 'accept' : null);
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'leave'; id: string; name: string } | null>(null);
  const [incoming, setIncoming] = useState<FamilyAlert | null>(null);
  const [sirenOn, setSirenOn] = useState(false);
  const [selectedId, setSelectedId] = useState('self');
  const insideRef = useRef<Record<string, boolean>>({});
  const familyRef = useRef(family);
  useEffect(() => {
    familyRef.current = family;
  });
  const notifyOk = state.permissions.notifications === 'granted';
  const fittedShare = useRef(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>(() => currentSyncPhase());
  const [now, setNow] = useState(() => Date.now());
  const tracking = useFamilyTracking((lat, lng) => mapRef.current?.panTo(lat, lng));
  const [settingsNote, setSettingsNote] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [historyDay, setHistoryDay] = useState(() => seoulDayKey(Date.now()));

  useEffect(() => subscribeSyncPhase(setSyncPhase), []);
  useEffect(() => startSyncMonitor(), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (state.mode !== 'admin') return;
    const apply = (place: Parameters<typeof familyRef.current.applySharedPlace>[0]) => {
      familyRef.current.applySharedPlace(place);
    };
    for (const place of readSharedPlaces()) apply(place);
    return subscribeSharedPlaces(apply);
  }, [state.mode]);

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
      if (!hasLocation(member)) continue;
      if (member.id !== 'self' && member.share !== 'allowed') continue;
      const inside = haversineMeters(member, state.home) <= state.home.radiusM;
      const previous = insideRef.current[member.id];
      if (previous !== undefined && previous !== inside) {
        if (member.id === 'self') {
          insideRef.current[member.id] = inside;
          continue;
        }
        const title = inside ? `${member.name} 님이 집에 도착했습니다` : `${member.name} 님이 집 반경 ${state.home.radiusM}m 밖으로 나갔습니다`;
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

  useEffect(() => {
    if (state.mode !== 'managed' || !self || !hasLocation(self)) return;
    const profileName = state.profile?.name || '가족';
    for (const link of state.guardians) {
      const zone = link.leaveAlert;
      if (!zone) continue;
      const inside = haversineMeters(self, zone) <= zone.radiusM;
      const previous = insideRef.current[`leave-${link.id}`];
      if (shouldAlertLeave(previous, inside, link.share === 'allowed')) {
        publishFamilyAlert({
          kind: 'leave',
          code: link.code,
          from: profileName,
          body: `${profileName} 님이 ${zone.label} 반경 ${zone.radiusM}m 밖으로 나갔습니다.`,
        }, link.syncToken);
      }
      insideRef.current[`leave-${link.id}`] = inside;
    }
  }, [self, state.guardians, state.mode, state.profile?.name]);

  useEffect(() => {
    if (state.mode !== 'admin') return;
    const seen = new Set<string>();
    const handle = (alert: FamilyAlert) => {
      if (alert.code !== state.inviteCode || seen.has(alert.id) || isFamilyAlertAcked(alert.id)) return;
      if (Date.now() - alert.at > 3 * 60 * 1000) return;
      seen.add(alert.id);
      setIncoming(alert);
      sounds.startSiren();
      const title = alert.kind === 'sos' ? 'SOS' : '집 반경을 나갔습니다';
      familyRef.current.pushNotice(title, alert.body);
      if (notifyOk && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, { body: alert.body });
        } catch {
          /* 알림 표시만 거절된 경우 */
        }
      }
    };
    const latest = readFamilyAlert();
    if (latest) handle(latest);
    const stopLocal = subscribeFamilyAlerts(handle);
    const stopRemote = startAdminRemoteSync(
      { code: state.inviteCode, writeKey: state.syncWriteKey, readKey: state.syncReadKey },
      {
        onPlace: (place) => familyRef.current.applySharedPlace(place),
        onAlert: handle,
      },
    );
    return () => {
      stopLocal();
      stopRemote();
    };
  }, [notifyOk, state.inviteCode, state.mode, state.syncReadKey, state.syncWriteKey]);

  const stopIncoming = () => {
    if (incoming) ackFamilyAlert(incoming.id);
    sounds.stopSiren();
    setIncoming(null);
    setSirenOn(false);
  };

  const triggerSos = () => {
    const name = state.profile?.name || '가족';
    const links = state.guardians.filter((link) => link.share !== 'revoked');
    sounds.startSiren();
    setSirenOn(true);
    if (links.length === 0) {
      family.pushNotice('SOS', '연결된 관리자가 없습니다. 이 폰에서만 사이렌이 울립니다.');
      return;
    }
    for (const link of links) {
      publishFamilyAlert({ kind: 'sos', code: link.code, from: name, body: `${name} 님이 SOS를 눌렀습니다.` }, link.syncToken);
    }
  };

  const selected = state.members.find((member) => member.id === selectedId) ?? state.members.find((member) => member.id === 'self');
  const liveDay = seoulDayKey(now);
  const visibleMembers = state.members.filter((member) => {
    if (member.id === 'self') return true;
    if (member.role === 'admin-share') return state.mode === 'managed' && hasLocation(member);
    if (member.role === 'guardian') return false;
    return state.mode === 'admin' && member.share === 'allowed' && hasLocation(member);
  }).map((member) => {
    if (!hasLocation(member)) return member;
    const todayPoints = (state.tracks[member.id] ?? []).filter((point) => seoulDayKey(point.at) === liveDay);
    const stable = displayCoordinate(todayPoints, {
      lat: member.lat,
      lng: member.lng,
      at: member.updatedAt || now,
      accuracyM: member.accuracyM,
      staying: member.moving === false,
    });
    if (stable.lat === member.lat && stable.lng === member.lng) return member;
    return { ...member, lat: stable.lat, lng: stable.lng };
  });
  const shareKey = visibleMembers
    .filter(hasLocation)
    .map((member) => `${member.id}:${member.lat.toFixed(5)},${member.lng.toFixed(5)}`)
    .join('|');
  useEffect(() => {
    if (state.mode !== 'admin' || fittedShare.current) return;
    const points = state.members.filter((member) => member.role !== 'guardian' && hasLocation(member) && (member.id === 'self' || member.share === 'allowed'));
    if (points.length < 2) return;
    const timer = window.setInterval(() => {
      if (!mapRef.current) return;
      fittedShare.current = true;
      mapRef.current.fit(points.flatMap((member) => (hasLocation(member) ? [{ lat: member.lat, lng: member.lng }] : [])));
      window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, [shareKey, state.members, state.mode]);
  const pathDay = state.tab === 'history' ? historyDay : liveDay;
  const memberPoints = selected ? state.tracks[selected.id] ?? [] : [];
  const dayPoints = useMemo(
    () => memberPoints.filter((point) => seoulDayKey(point.at) === pathDay),
    [memberPoints, pathDay],
  );
  const showPath = !!selected && (state.tab === 'history' || showTrail) && (selected.id === 'self' || selected.share === 'allowed' || selected.role === 'admin-share');
  const trail = useMemo(() => (showPath ? visibleTrail(dayPoints) : []), [dayPoints, showPath]);
  const dayRecord = buildDayRecord(collapseStayTrail(dayPoints), pathDay === liveDay ? now : seoulDayEndMs(pathDay));
  const dayVisits = useMemo(() => {
    const list = selected ? state.visits[selected.id] ?? [] : [];
    return list.filter((visit) => seoulDayKey(visit.arrivedAt) === pathDay);
  }, [pathDay, selected, state.visits]);
  const unreadAlerts = state.notices.some((item) => !item.read);
  useEffect(() => {
    if (state.tab !== 'history' || trail.length === 0) return;
    const points = trail;
    const timer = window.setTimeout(() => mapRef.current?.fit(points), 80);
    return () => window.clearTimeout(timer);
  }, [historyDay, selected?.id, state.tab, trail]);
  const missingSyncKey = state.mode === 'managed' && state.guardians.some((link) => (link.share === 'allowed' || link.share === 'revoked') && !link.syncToken);
  const syncBanner = syncBannerText(syncPhase, missingSyncKey);
  const remoteLive = syncPhase === 'live';

  const focusMember = (member: Member, fitTrail: boolean) => {
    setSelectedId(member.id);
    const points = state.tracks[member.id] ?? [];
    if (fitTrail && showTrail && points.length >= 2) mapRef.current?.fit(points);
    else if (hasLocation(member)) mapRef.current?.panTo(member.lat, member.lng);
  };

  return (
    <div className="flex h-full justify-center bg-[#d7e3ee]">
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-white">
        <div className="relative min-h-0 flex-1">
          <StreetMap
            ref={mapRef}
            center={center}
            zoom={16}
            members={visibleMembers}
            home={draftHome ?? (showZone ? state.home : null)}
            trail={trail}
            trailColor="#0084FF"
            selectedId={selected?.id}
            onSelect={(id) => {
              const member = state.members.find((item) => item.id === id);
              if (member) focusMember(member, true);
            }}
          />

          <button
            type="button"
            aria-label="알림"
            onClick={() => setAlertsOpen(true)}
            className="absolute left-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
          >
            <Bell className={`h-5 w-5 ${unreadAlerts ? 'text-[#0084FF]' : 'text-slate-700'}`} />
            {unreadAlerts && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#ff8a34]" />}
          </button>

          <div className="absolute right-3 top-3 z-30 flex flex-col gap-2">
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
                if (self && hasLocation(self)) focusMember(self, false);
              }}
            >
              <LocateFixed className="h-5 w-5 text-[#0084FF]" />
            </RoundButton>
          </div>

          {(syncBanner || tracking.waiting) && (
            <p className="absolute inset-x-3 bottom-16 z-30 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-950 shadow">
              {tracking.waiting}
              {tracking.waiting && syncBanner ? ' ' : ''}
              {syncBanner}
            </p>
          )}
          {state.mode === 'managed' && (
            <button
              type="button"
              onClick={sirenOn ? stopIncoming : triggerSos}
              className={`absolute bottom-3 left-3 z-30 rounded-full px-5 py-4 text-base font-black text-white shadow-lg ${sirenOn ? 'bg-slate-900' : 'bg-red-600'}`}
            >
              {sirenOn ? '사이렌 끄기' : 'SOS'}
            </button>
          )}
          {incoming && state.mode === 'admin' && (
            <div className="absolute inset-x-4 top-24 z-40 rounded-3xl bg-red-600 px-4 py-4 text-white shadow-xl">
              <p className="text-lg font-black">{incoming.kind === 'sos' ? 'SOS' : '집 반경 이탈'}</p>
              <p className="mt-1 text-sm leading-5">{incoming.body}</p>
              <p className="mt-1 text-xs leading-5 text-red-100">
                {remoteLive
                  ? '다른 폰의 관리자 화면에도 사이렌이 전달됩니다. 피관리자 폰에서는 집 이탈 사이렌이 울리지 않습니다.'
                  : '위치 서버에 연결되지 않아 이 브라우저의 관리자 화면만 사이렌이 들립니다.'}
              </p>
              <button type="button" onClick={stopIncoming} className="mt-3 w-full rounded-full bg-white py-3 text-sm font-black text-red-600">
                사이렌 끄기
              </button>
            </div>
          )}
          {state.mode === 'admin' ? (
            <button
              type="button"
              onClick={() => setSheet('invite')}
              className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-[#0084FF] px-3 py-2 text-xs font-bold text-white shadow-lg"
            >
              <UserPlus className="h-4 w-4" />
              가족 초대
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSheet('accept')}
              className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-[#0084FF] px-3 py-2 text-xs font-bold text-white shadow-lg"
            >
              <UserPlus className="h-4 w-4" />
              초대 수락
            </button>
          )}
        </div>

        {state.tab === 'map' && (
          <section className="rounded-t-3xl bg-white px-4 pb-2 pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">우리 가족</h2>
                <p className="text-[11px] font-semibold text-slate-400">{syncPhaseLine(syncPhase)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setHistoryDay(liveDay);
                    family.setTab('history');
                  }}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  오늘 이동{dayRecord.segments.length > 0 ? ` ${dayRecord.segments.length}` : ''}
                </button>
                {state.mode === 'admin' && (
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
                )}
              </div>
            </div>
            <AlwaysAllowNotice
              locationMode={state.permissions.locationMode}
              keepAlive={state.backgroundKeepAlive}
              native={tracking.native}
              note={settingsNote}
              onOpenSettings={() => {
                void askAlwaysLocation(state.permissions.accuracy === 'precise').then((result) => {
                  setSettingsNote(result.note);
                  if (result.location === 'always' || result.location === 'while-using' || result.location === 'denied') {
                    family.finishPermissions({ ...state.permissions, locationMode: result.location, completed: true });
                  }
                });
              }}
              onBattery={() => {
                void askBattery().then((result) => setSettingsNote(result.note));
              }}
              onStart={() => {
                void (async () => {
                  const notifications = await askNotifications();
                  if (notifications.note) setSettingsNote(notifications.note);
                  if (tracking.native) {
                    const battery = await askBattery();
                    if (battery.note) setSettingsNote(battery.note);
                  }
                  family.setKeepAlive(true);
                })();
              }}
              onStop={() => family.setKeepAlive(false)}
            />
            <div className="max-h-48 space-y-2 overflow-y-auto pb-2">
              {(state.mode === 'managed'
                ? state.members.filter((member) => member.id === 'self' || member.role === 'admin-share')
                : state.members.filter((member) => member.role !== 'guardian' && member.role !== 'admin-share')).map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  now={now}
                  trip={member.id === selected?.id && pathDay === liveDay && dayRecord.segments.length > 0 ? `${modeLabel(dayRecord.segments[dayRecord.segments.length - 1].mode)} · ${formatDurationMs(dayRecord.segments[dayRecord.segments.length - 1].durationMs)}` : undefined}
                  home={state.mode === 'admin' ? state.home : null}
                  selected={member.id === selected?.id}
                  onSelect={() => focusMember(member, true)}
                  onRemove={state.mode === 'admin' && member.id !== 'self' ? () => setConfirm({ kind: 'remove', id: member.id, name: member.name }) : undefined}
                />
              ))}
              {state.mode === 'admin' && (
                <button
                  type="button"
                  onClick={() => family.setShareSelf(!state.shareSelfWithFamily)}
                  className={`w-full rounded-2xl px-3 py-2 text-left text-xs font-bold ${state.shareSelfWithFamily ? 'bg-blue-50 text-[#0084FF]' : 'bg-slate-50 text-slate-600'}`}
                >
                  {state.shareSelfWithFamily ? '내 위치를 가족에게 보여주는 중 · 끄기' : '내 위치를 피관리자에게 공유'}
                  <span className="mt-1 block font-semibold text-slate-500">피관리자는 이 스위치를 켠 뒤에만 관리자 핀을 봅니다. 읽기 키는 보내지 않습니다.</span>
                  {tracking.familyShareNote && <span className="mt-1 block font-semibold text-amber-700">{tracking.familyShareNote}</span>}
                </button>
              )}
              {state.mode === 'managed' && state.guardians.length > 0 && (
                <p className="px-1 pt-1 text-[11px] font-bold text-slate-400">관리자에게 내 위치 보내기 · 관리자 핀은 상대가 공유할 때만</p>
              )}
              {state.mode === 'managed' && state.guardians.map((link) => (
                <GuardianCard
                  key={link.id}
                  link={link}
                  remote={familySyncConfigured() && !!link.syncToken}
                  onAllow={() => family.setGuardianShare(link.code, 'allowed')}
                  onRevoke={() => family.setGuardianShare(link.code, 'revoked')}
                  onLeave={() => setConfirm({ kind: 'leave', id: link.id, name: link.label })}
                />
              ))}
              {state.mode === 'managed' && state.guardians.length === 0 && (
                <p className="rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">아직 수락한 초대가 없습니다. 관리자에게 받은 코드로 참여한 뒤, 위치를 따로 허용하세요.</p>
              )}
            </div>
          </section>
        )}

        {state.tab === 'history' && (
          <section className="max-h-[58%] overflow-y-auto rounded-t-3xl bg-white px-4 pb-3 pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
            <h2 className="text-lg font-black">이동 기록</h2>
            <p className="text-[11px] font-semibold text-slate-400">오늘부터 30일 전 · 서울 날짜</p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {historyDayKeys(now).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setHistoryDay(day)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${day === historyDay ? 'bg-[#0084FF] text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {historyDayLabel(day, now)}
                </button>
              ))}
            </div>
            {visibleMembers.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {visibleMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => focusMember(member, false)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${member.id === selected?.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {member.name}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3">
              <TodayRecord segments={dayRecord.segments} stops={dayRecord.stops} visits={dayVisits} />
            </div>
          </section>
        )}

        {state.tab === 'menu' && (
          <section className="min-h-[52%] overflow-y-auto bg-white px-4 py-4 text-sm">
            <h2 className="text-lg font-black">메뉴</h2>
            <p className="mt-3 text-xs font-bold text-[#0084FF]">{state.mode === 'admin' ? '관리자 모드' : '피관리자 모드'}</p>
            <p className="mt-1 font-bold">{state.profile?.name}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">이 기기에만 저장된 이름입니다. 전화번호나 Google 계정으로 본인을 확인하지 않습니다.</p>
            <dl className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 text-slate-600">
              <Line k="알림" v={labelOf(state.permissions.notifications)} />
              <Line k="위치 정확도" v={state.permissions.accuracy === 'precise' ? '정확한 위치' : '대략적인 위치'} />
              <Line k="위치 허용" v={locationLabel(state.permissions.locationMode)} />
              <Line k="움직임" v={labelOf(state.permissions.motion)} />
              <Line k="배터리 안내" v={state.permissions.battery === 'acknowledged' ? '확인함' : state.permissions.battery === 'skipped' ? '나중에' : '해당 없음'} />
            </dl>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              항상 허용을 누르면 이 앱의 위치 권한 화면이 바로 열립니다. 배터리 제한 없음을 누르면 시스템 팝업이 바로 열립니다. Umap은 그 스위치를 대신 바꾸지 않습니다. 위치 유지 알림은 우리 가족 아래에서 켜고, 알림이 떠 있는 동안 위치를 보냅니다.
            </p>
            <div className="mt-4 space-y-2">
              <button type="button" onClick={family.reopenMode} className="w-full rounded-full bg-slate-100 py-3 font-bold">
                모드 다시 고르기
              </button>
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
          <NavButton active={state.tab === 'history'} label="기록" onClick={() => family.setTab('history')} icon={<Route className="h-5 w-5" />} />
          <NavButton active={state.tab === 'menu'} label="메뉴" onClick={() => family.setTab('menu')} icon={<span className="text-lg leading-none">☰</span>} />
        </nav>

        {sheet === 'home' && (
          <HomeSheet
            initial={state.home}
            center={homeCenter}
            onPreview={setDraftHome}
            onClose={() => {
              setDraftHome(null);
              setSheet(null);
            }}
            onSave={(home) => {
              family.saveHome(home);
              mapRef.current?.panTo(home.lat, home.lng);
              setDraftHome(null);
              setSheet(null);
            }}
            onClear={() => {
              family.clearHome();
              setDraftHome(null);
              setSheet(null);
            }}
          />
        )}
        {alertsOpen && (
          <Sheet
            title="알림"
            onClose={() => {
              family.markAlertsRead();
              setAlertsOpen(false);
            }}
          >
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
          </Sheet>
        )}
        {sheet === 'invite' && state.mode === 'admin' && (
          <AdminInviteSheet
            code={state.inviteCode}
            writeKey={state.syncWriteKey}
            readKey={state.syncReadKey}
            home={state.home}
            onClose={() => setSheet(null)}
            onCreate={(name) => family.addMember(name, state.inviteCode)}
          />
        )}
        {sheet === 'accept' && state.mode === 'managed' && (
          <ManagedInviteSheet
            pending={state.pendingInvite}
            pendingSyncToken={state.pendingSyncToken}
            guardians={state.guardians}
            onClose={() => {
              family.dismissInvite();
              setSheet(null);
            }}
            onAccept={(label, code, syncToken) => family.acceptInvite(label, code, syncToken)}
            onShare={(code, share) => family.setGuardianShare(code, share)}
          />
        )}
        {confirm && (
          <ConfirmSheet
            title={confirm.kind === 'remove' ? '가족에서 지울까요?' : '연결을 끊을까요?'}
            body={confirm.kind === 'remove'
              ? `${confirm.name} 님을 이 기기의 목록과 지도에서 지웁니다. 상대 폰의 공유 허용은 그 폰에서 꺼야 합니다.`
              : `${confirm.name} 님과의 초대와 위치 공유를 이 폰에서 지웁니다.`}
            confirmLabel={confirm.kind === 'remove' ? '지우기' : '연결 끊기'}
            onClose={() => setConfirm(null)}
            onConfirm={() => {
              if (confirm.kind === 'remove') family.removeMember(confirm.id);
              else family.leaveGuardian(confirm.id);
              setConfirm(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function memberStatus(member: Member, home: HomeZone | null): string {
  if (member.role === 'admin-share') {
    return hasLocation(member) ? `관리자 위치 · ±${Math.round(member.accuracyM)}m` : '관리자 위치 없음';
  }
  if (member.id !== 'self') {
    if (member.share === 'allowed' && hasLocation(member)) {
      const place = home && haversineMeters(member, home) <= home.radiusM ? '우리 집 안' : home ? '집 밖' : '위치 공유 중';
      return `${place} · ±${Math.round(member.accuracyM)}m`;
    }
    if (member.share === 'allowed') return '공유 허용 · 이 화면으로 위치 오는 중';
    if (member.share === 'revoked') return '위치 공유 꺼짐';
    if (member.share === 'accepted') return '수락함 · 위치 공유 전';
    return '초대 보냄 · 위치 공유 전';
  }
  if (!hasLocation(member)) return '위치 기다리는 중';
  const place = home && haversineMeters(member, home) <= home.radiusM ? '우리 집 안' : home ? '집 밖' : '내 위치';
  return `${place} · ±${Math.round(member.accuracyM)}m`;
}

function MemberCard({
  member,
  home,
  selected,
  now,
  trip,
  onSelect,
  onRemove,
}: {
  member: Member;
  home: HomeZone | null;
  selected: boolean;
  now: number;
  trip?: string;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const when = member.updatedAt
    ? seoulDayKey(member.updatedAt) === seoulDayKey(now)
      ? formatAgo(member.updatedAt, now)
      : `${formatClock(member.updatedAt)} 이전 날짜`
    : '';
  return (
    <div className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${selected ? 'bg-blue-50' : 'bg-slate-50'}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0084FF] font-black text-white">
        {member.name.slice(0, 1)}
      </span>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{member.name}</span>
          <span className="block text-xs text-slate-500">
            {memberStatus(member, home)}
            {member.battery != null ? ` · 배터리 ${member.battery}%${member.charging ? ' 충전 중' : ''}` : ''}
            {when ? ` · ${when}` : ''}
            {member.moving === true ? ' · 이동 중' : member.moving === false ? ' · 머무름' : ''}
          </span>
          {trip && <span className="block text-xs font-semibold text-[#0084FF]">{trip}</span>}
        </span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
          지우기
        </button>
      )}
    </div>
  );
}

function GuardianCard({
  link,
  remote,
  onAllow,
  onRevoke,
  onLeave,
}: {
  link: GuardianLink;
  remote: boolean;
  onAllow: () => void;
  onRevoke: () => void;
  onLeave: () => void;
}) {
  const status = link.share === 'allowed'
    ? remote
      ? '이 폰의 내 위치를 다른 폰으로 보내는 중'
      : link.syncToken
        ? '이 폰의 내 위치를 보내는 중'
        : '동기화 키 없음 · 이 브라우저에서만'
    : link.share === 'revoked'
      ? '위치 공유 꺼짐'
      : '참여함 · 내 위치는 아직 안 보냄';
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-black text-slate-600">공유</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{link.label}</span>
          <span className="block text-xs text-slate-500">{status} · 코드 {link.code}</span>
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        {link.share === 'allowed' ? (
          <button type="button" onClick={onRevoke} className="flex-1 rounded-full bg-white py-2 text-[11px] font-bold text-slate-600">
            공유 끄기
          </button>
        ) : (
          <button type="button" onClick={onAllow} className="flex-1 rounded-full bg-[#0084FF] py-2 text-[11px] font-bold text-white">
            위치 공유 허용
          </button>
        )}
        <button type="button" onClick={onLeave} className="rounded-full bg-white px-3 py-2 text-[11px] font-bold text-slate-500">
          연결 끊기
        </button>
      </div>
    </div>
  );
}

function HomeSheet({
  initial,
  center,
  onPreview,
  onClose,
  onSave,
  onClear,
}: {
  initial: HomeZone | null;
  center: { lat: number; lng: number };
  onPreview: (home: HomeZone) => void;
  onClose: () => void;
  onSave: (home: HomeZone) => void;
  onClear: () => void;
}) {
  const [address, setAddress] = useState(initial?.address ?? '');
  const [radius, setRadius] = useState(initial?.radiusM ?? 200);
  const draft = (nextRadius: number, nextAddress: string): HomeZone => ({
    label: nextAddress.trim() || '우리 집',
    address: nextAddress.trim(),
    lat: center.lat,
    lng: center.lng,
    radiusM: nextRadius,
    alertPhone: '',
  });
  const publish = (nextRadius: number, nextAddress = address) => {
    const clamped = Math.min(2000, Math.max(50, Math.round(nextRadius) || 50));
    setRadius(clamped);
    onPreview(draft(clamped, nextAddress));
  };
  useEffect(() => {
    onPreview(draft(radius, address));
  }, [address, center.lat, center.lng, onPreview, radius]);
  return (
    <Sheet title="우리 집 반경" onClose={onClose}>
      <p className="text-sm leading-6 text-slate-500">지도 가운데가 집입니다. 숫자를 바꾸면 파란 원이 바로 커지거나 작아집니다. 피관리자가 위치 공유를 허용한 뒤 이 원을 나가면 관리자 화면에 사이렌이 울립니다.</p>
      <label className="mt-4 block text-xs font-bold text-slate-400" htmlFor="home-address">
        주소 또는 이름
      </label>
      <input
        id="home-address"
        value={address}
        onChange={(event) => {
          setAddress(event.target.value);
          onPreview(draft(radius, event.target.value));
        }}
        placeholder="주소 또는 이름"
        className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-[#0084FF]"
      />
      <label className="mt-4 block text-xs font-bold text-slate-400" htmlFor="home-radius">
        반경 {radius}m
      </label>
      <div className="mt-2 flex items-center gap-3">
        <input
          id="home-radius"
          type="number"
          min={50}
          max={2000}
          value={radius}
          onChange={(event) => publish(Number(event.target.value))}
          className="w-24 rounded-2xl border border-slate-200 px-3 py-2 outline-none focus:border-[#0084FF]"
        />
        <span className="text-sm font-bold text-slate-500">미터</span>
      </div>
      <input type="range" min={50} max={2000} step={10} value={radius} onChange={(event) => publish(Number(event.target.value))} className="mt-3 w-full" />
      <button
        type="button"
        onClick={() => onSave(draft(radius, address))}
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

function AdminInviteSheet({
  code,
  writeKey,
  readKey,
  home,
  onClose,
  onCreate,
}: {
  code: string;
  writeKey: string;
  readKey: string;
  home: HomeZone | null;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [sentName, setSentName] = useState('');
  const [copied, setCopied] = useState('');
  const [token, setToken] = useState('');
  const syncReady = familySyncConfigured();

  useEffect(() => {
    let cancel = false;
    syncTokenFor(writeKey, readKey).then((value) => {
      if (!cancel) setToken(value);
    });
    return () => {
      cancel = true;
    };
  }, [readKey, writeKey]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied('복사하지 못했습니다');
    }
  };

  if (!sentName) {
    return (
      <Sheet title="1. 누구를 초대할까요?" onClose={onClose}>
        <p className="text-sm leading-6 text-slate-500">이름만 정합니다. 위치는 상대 폰에서 초대를 수락하고, 위치 공유를 따로 허용해야 보입니다. 전화번호로는 위치를 찾지 않습니다.</p>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="표시 이름" className="mt-4 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-[#0084FF]" />
        <button
          type="button"
          disabled={name.trim().length < 1}
          onClick={() => {
            const next = name.trim();
            onCreate(next);
            setSentName(next);
          }}
          className="mt-3 w-full rounded-full bg-[#ff8a34] py-3.5 font-bold text-white disabled:opacity-40"
        >
          초대 코드 만들기
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="2. 코드를 보내세요" onClose={onClose}>
      <p className="text-sm leading-6 text-slate-500">{sentName} 님 폰에서 피관리자 모드로 링크를 엽니다. 수락 다음에 위치 공유를 따로 묻습니다. 전화번호로는 위치를 찾지 않습니다.</p>
      <p className="mt-4 text-center text-4xl font-black tracking-[0.25em] text-[#0084FF]">{code}</p>
      {token && <InviteQrImage text={buildInviteLink(code, home, token)} />}
      {token && <p className="mt-2 text-center text-[11px] leading-5 text-slate-400">QR은 초대 링크와 같습니다. 위치를 읽는 키는 들어 있지 않고, 전화번호도 없습니다.</p>}
      <label className="mt-4 block text-xs font-bold text-slate-400" htmlFor="sync-token">
        동기화 키
      </label>
      <input id="sync-token" readOnly value={token} aria-label="동기화 키" className="mt-1 w-full break-all rounded-2xl border border-slate-200 px-3 py-2 text-[11px] text-slate-600" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => copy(code, '코드를 복사했습니다')} className="rounded-full bg-slate-100 py-2 text-xs font-bold">
          <Copy className="mr-1 inline h-3.5 w-3.5" />
          코드 복사
        </button>
        <button type="button" disabled={!token} onClick={() => copy(buildInviteLink(code, home, token), '링크를 복사했습니다')} className="rounded-full bg-slate-100 py-2 text-xs font-bold disabled:opacity-40">
          링크 복사
        </button>
      </div>
      {token && (
        <button type="button" onClick={() => copy(token, '동기화 키를 복사했습니다')} className="mt-2 w-full rounded-full bg-slate-100 py-2 text-xs font-bold">
          동기화 키 복사
        </button>
      )}
      {copied && <p className="mt-2 text-center text-xs font-semibold text-[#0084FF]">{copied}</p>}
      <p className="mt-4 text-xs leading-5 text-slate-400">
        {syncReady
          ? '링크를 연 폰에서 위치 공유를 허용하면 이 지도에 핀이 나타나고, 공유를 끄면 핀이 곧 사라집니다. 코드만 입력하면 같은 브라우저에서만 공유됩니다.'
          : '이 빌드에는 위치 서버 주소가 없습니다. 코드는 같은 브라우저 안에서만 공유됩니다.'}
        {' '}
        {home ? `링크에는 집 반경 ${home.radiusM}m가 들어 있습니다. 상대가 위치 공유를 허용한 뒤 그 원을 나가면 관리자 화면에 사이렌이 울립니다.` : '우리 집을 저장한 뒤 링크를 다시 복사하면 집 반경 이탈 사이렌이 연결됩니다.'}
        {' '}피관리자 폰에서는 이탈 사이렌이 울리지 않습니다. SOS는 양쪽에서 울립니다. 위치를 읽는 키는 관리자 폰에만 있습니다.
      </p>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white">
        완료
      </button>
    </Sheet>
  );
}

function parseInviteDraft(value: string): { code: string; syncToken: string | null } {
  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const code = (url.searchParams.get('invite') || '').replace(/\D/g, '').slice(0, 6);
      const syncToken = splitSyncToken(url.searchParams.get('sync')) ? url.searchParams.get('sync') : null;
      return { code, syncToken };
    } catch {
      /* 링크가 아니면 코드로 봅니다. */
    }
  }
  return { code: trimmed.replace(/\D/g, '').slice(0, 6), syncToken: null };
}

function ManagedInviteSheet({
  pending,
  pendingSyncToken,
  guardians,
  onClose,
  onAccept,
  onShare,
}: {
  pending: string | null;
  pendingSyncToken: string | null;
  guardians: GuardianLink[];
  onClose: () => void;
  onAccept: (label: string, code: string, syncToken: string | null) => void;
  onShare: (code: string, share: 'allowed' | 'revoked') => void;
}) {
  const [code, setCode] = useState(pending ?? '');
  const [syncToken, setSyncToken] = useState(pendingSyncToken ?? '');
  const [label, setLabel] = useState('');
  const [step, setStep] = useState<'join' | 'share'>('join');
  const [joinedCode, setJoinedCode] = useState('');
  const joined = guardians.find((link) => link.code === joinedCode);

  return (
    <Sheet title={step === 'join' ? '1. 초대를 수락할까요?' : '2. 위치를 공유할까요?'} onClose={onClose}>
      {step === 'join' ? (
        <>
          <p className="text-sm leading-6 text-slate-500">관리자에게 받은 코드를 입력하거나 초대 링크를 붙여 넣습니다. 수락만으로는 위치가 나가지 않습니다. 전화번호는 쓰지 않습니다.</p>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="관리자 이름 (예: 엄마)" className="mt-4 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-[#0084FF]" />
          <input
            value={code}
            onChange={(event) => {
              const next = event.target.value;
              if (next.trim().startsWith('http://') || next.trim().startsWith('https://')) {
                const parsed = parseInviteDraft(next);
                setCode(parsed.code);
                if (parsed.syncToken) setSyncToken(parsed.syncToken);
                return;
              }
              setCode(next.replace(/\D/g, '').slice(0, 6));
            }}
            placeholder="초대 코드 또는 링크"
            inputMode="text"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-[#0084FF]"
          />
          <InviteQrScan
            onText={(value) => {
              const parsed = parseInviteDraft(value);
              if (parsed.code) setCode(parsed.code);
              if (parsed.syncToken) setSyncToken(parsed.syncToken);
            }}
          />
          <label className="mt-3 block text-xs font-bold text-slate-400" htmlFor="managed-sync-token">
            동기화 키 (다른 폰과 나눌 때)
          </label>
          <input
            id="managed-sync-token"
            value={syncToken}
            onChange={(event) => setSyncToken(event.target.value.trim())}
            placeholder="링크를 열면 채워집니다"
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#0084FF]"
          />
          <button
            type="button"
            disabled={code.length < 4}
            onClick={() => {
              const token = splitSyncToken(syncToken) ? syncToken : null;
              onAccept(label, code, token);
              setJoinedCode(code);
              setStep('share');
            }}
            className="mt-3 w-full rounded-full bg-[#ff8a34] py-3.5 font-bold text-white disabled:opacity-40"
          >
            초대 수락
          </button>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-slate-500">
            {label.trim() || '관리자'} 님에게 내 위치를 보낼까요? 허용하기 전에는 상대 지도에 표시되지 않습니다. 가족 목록에서 언제든 끌 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              if (!joined) return;
              onShare(joined.code, 'allowed');
              onClose();
            }}
            disabled={!joined}
            className="mt-4 w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white disabled:opacity-40"
          >
            위치 공유 허용
          </button>
          <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-sm font-bold text-slate-400">
            나중에
          </button>
        </>
      )}
    </Sheet>
  );
}

function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-slate-500">{body}</p>
      <button type="button" onClick={onConfirm} className="mt-4 w-full rounded-full bg-[#ff8a34] py-3.5 font-bold text-white">
        {confirmLabel}
      </button>
      <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-sm font-bold text-slate-400">
        취소
      </button>
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

function syncBannerText(phase: SyncPhase, missingSyncKey: boolean): string | null {
  if (missingSyncKey) return '이 초대에 동기화 키가 없어 다른 폰으로 위치가 가지 않습니다. 관리자가 보낸 링크를 다시 열어 주세요. 이 브라우저 안에서는 그대로 공유됩니다.';
  if (phase === 'off') return '위치 서버가 설정되지 않았습니다. 이 브라우저 안에서만 공유됩니다.';
  if (phase === 'down') return '위치 서버에 연결하지 못했습니다. 이 브라우저 안에서만 공유됩니다.';
  if (phase === 'rejected') return '동기화 키가 맞지 않습니다. 초대 링크를 다시 확인해 주세요. 이 브라우저 안에서만 공유됩니다.';
  return null;
}

function syncPhaseLine(phase: SyncPhase): string {
  if (phase === 'live') return '다른 폰과 위치를 나누는 중';
  if (phase === 'connecting') return '위치 서버에 연결하는 중';
  return '이 브라우저 안에서만 공유';
}
