import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, Copy, Home, LocateFixed, MapPin, Menu, Minus, Plus, Route, Settings, UserPlus, X } from 'lucide-react';
import { buildInviteLink, formatClock, hasLocation, haversineMeters, shouldAlertLeave } from '../../lib/geo';
import { KEEP_PERMISSION_ASKED_KEY, KEEP_START_ASKED_KEY, keepEntryPrompt, markSessionFlag, readSessionFlag } from '../../lib/systemSettings.mjs';
import { collapseDuplicateJourneys, displayCoordinate, historyDayKeys, historyDayLabel, liveTrailPoints, previewOpenJourney, seoulDayEndMs, seoulDayKey, visibleTrail } from '../../lib/tracking.mjs';
import { ackFamilyAlert, isFamilyAlertAcked, publishFamilyAlert, readFamilyAlert, subscribeFamilyAlerts, type FamilyAlert } from '../../services/familyAlert';
import { readSharedPlaces, subscribeSharedPlaces } from '../../services/familyShare';
import { currentSyncPhase, familySyncConfigured, familySyncUrl, fetchMyDirectThreads, registerAdminPush, splitSyncToken, startAdminRemoteSync, startSyncMonitor, subscribeSyncPhase, syncTokenFor, type SyncPhase } from '../../services/familySync';
import { umapLocation, umapLocationNative } from '../../services/umapLocation';
import { sounds } from '../../utils/audio';
import { DEFAULT_CENTER, type GuardianLink, type HomeZone, type Member } from '../../types/family';
import { AlwaysAllowNotice } from './AlwaysAllowNotice';
import { InviteQrImage, InviteQrScan } from './InviteQr';
import { StreetMap, type StreetMapHandle } from './StreetMap';
import { JourneyCards, JourneyScrubber, playbackMark } from './JourneyCards';
import { FamilyChatSheet, type DirectChatTarget } from './FamilyChatSheet';
import { MemberAvatar } from './MemberAvatar';
import { PhotoPicker } from './ProfilePhoto';
import { chatName, mergeDirectChat, subscribeChat, unreadCount } from '../../services/familyChat';
import { TodayRecord } from './TodayRecord';
import { askAlwaysLocation, askBattery, askNotifications } from '../../services/systemPermissions';
import { useFamilyTracking } from './useFamilyTracking';
import { useFamily } from './session';
import { consumeAndroidBack } from '../../platform/androidBack';

export function FamilyMapScreen() {
  const family = useFamily();
  const { state } = family;
  const self = state.members.find((member) => member.id === 'self');
  const center = DEFAULT_CENTER;
  const [showZone, setShowZone] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [draftHome, setDraftHome] = useState<HomeZone | null>(null);
  const [placingHome, setPlacingHome] = useState(false);
  const mapRef = useRef<StreetMapHandle>(null);
  const [sheet, setSheet] = useState<'invite' | 'accept' | 'today' | null>(state.mode === 'managed' && state.pendingInvite ? 'accept' : null);
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
  const [keepPrompt, setKeepPrompt] = useState<'permission' | 'start' | 'none'>(() => keepEntryPrompt({
    notifications: state.permissions.notifications,
    locationMode: state.permissions.locationMode,
    keepAlive: state.backgroundKeepAlive,
    permissionAsked: readSessionFlag(KEEP_PERMISSION_ASKED_KEY),
    startAsked: readSessionFlag(KEEP_START_ASKED_KEY),
  }));
  const [keepBusy, setKeepBusy] = useState(false);
  const [keepNote, setKeepNote] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [historyDay, setHistoryDay] = useState(() => seoulDayKey(Date.now()));
  const [dayPicker, setDayPicker] = useState(false);
  const [scrub, setScrub] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dm, setDm] = useState<DirectChatTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [managedSettings, setManagedSettings] = useState(false);
  const [chatTick, setChatTick] = useState(0);
  const placingRef = useRef(false);
  const scrubRef = useRef(0);
  useEffect(() => {
    scrubRef.current = scrub;
  }, [scrub]);

  useEffect(() => subscribeSyncPhase(setSyncPhase), []);
  useEffect(() => subscribeChat(() => setChatTick((value) => value + 1)), []);
  useEffect(() => {
    placingRef.current = placingHome;
  }, [placingHome]);
  useEffect(() => startSyncMonitor(), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    familyRef.current.closeJourneys(now);
  }, [now]);

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
    const onPush = (event: MessageEvent) => {
      const data = event.data as { type?: string; alert?: FamilyAlert } | null;
      if (data?.type === 'umap-alert' && data.alert) handle(data.alert);
    };
    navigator.serviceWorker?.addEventListener('message', onPush);
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
      navigator.serviceWorker?.removeEventListener('message', onPush);
    };
  }, [notifyOk, state.inviteCode, state.mode, state.syncReadKey, state.syncWriteKey]);

  const dmRoomKey = state.mode === 'admin'
    ? `admin:${state.inviteCode}:${state.syncWriteKey}`
    : state.guardians.map((link) => `${link.code}:${link.syncToken ?? ''}:${link.rosterName ?? ''}`).join('|');
  useEffect(() => {
    if (state.tab !== 'map') return;
    let cancel = false;
    const tick = async () => {
      const current = familyRef.current.state;
      const rooms = current.mode === 'admin'
        ? [{ code: current.inviteCode, me: myChatName(current, current.inviteCode), writeKey: current.syncWriteKey, readKey: current.syncReadKey, token: null as string | null }]
        : current.guardians
          .filter((link) => link.share !== 'revoked' && link.syncToken)
          .map((link) => ({ code: link.code, me: myChatName(current, link.code), token: link.syncToken ?? null, writeKey: '', readKey: '' }));
      for (const room of rooms) {
        if (cancel) return;
        const token = room.token && room.token.includes('.')
          ? room.token
          : room.writeKey && room.readKey
            ? await syncTokenFor(room.writeKey, room.readKey)
            : null;
        if (!token || cancel) continue;
        const threads = await fetchMyDirectThreads(room.code, token, room.me);
        if (!threads) continue;
        for (const thread of threads) mergeDirectChat(room.code, room.me, thread.peer, thread.messages);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 12000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [dmRoomKey, state.tab]);

  useEffect(() => {
    if (state.mode !== 'admin' || state.permissions.notifications !== 'granted' || !familySyncConfigured()) return;
    let cancel = false;
    const link = { code: state.inviteCode, writeKey: state.syncWriteKey, readKey: state.syncReadKey };
    void (async () => {
      const pushed = await registerAdminPush(link);
      if (cancel || pushed || !umapLocationNative()) return;
      const status = await umapLocation.alertWatchStatus().catch(() => ({ running: false, userStopped: false }));
      if (cancel || status.userStopped) return;
      const token = await syncTokenFor(link.writeKey, link.readKey);
      const base = familySyncUrl();
      if (!base) return;
      await umapLocation.startAlertWatch({
        config: JSON.stringify({ baseUrl: base, code: link.code, token, readKey: link.readKey }),
      }).catch(() => undefined);
    })();
    return () => {
      cancel = true;
    };
  }, [state.inviteCode, state.mode, state.permissions.notifications, state.syncReadKey, state.syncWriteKey]);

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

  const managed = state.mode === 'managed';
  const selected = (managed && recordId ? state.members.find((member) => member.id === recordId) : null)
    ?? state.members.find((member) => member.id === selectedId)
    ?? state.members.find((member) => member.id === 'self');
  const liveDay = seoulDayKey(now);
  const visibleMembers = state.members.filter((member) => {
    if (member.id === 'self') return true;
    if (member.role === 'admin-share') return state.mode === 'managed' && hasLocation(member);
    if (member.role === 'guardian') return false;
    return state.mode === 'admin' && member.share === 'allowed' && hasLocation(member);
  }).map((member) => {
    if (!hasLocation(member)) return member;
    const todayPoints = liveTrailPoints(
      (state.tracks[member.id] ?? []).filter((point) => seoulDayKey(point.at) === liveDay),
      now,
    );
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
  const historyDays = historyDayKeys(now);
  const activeHistoryDay = historyDays.includes(historyDay) ? historyDay : historyDays[0];
  const viewingRecords = managed ? recordId != null && !placingHome : state.tab === 'history';
  const pathDay = viewingRecords ? activeHistoryDay : liveDay;
  const memberPoints = selected ? state.tracks[selected.id] ?? [] : [];
  const dayPoints = useMemo(
    () => memberPoints.filter((point) => seoulDayKey(point.at) === pathDay),
    [memberPoints, pathDay],
  );
  const dayNow = pathDay === liveDay ? now : seoulDayEndMs(pathDay);
  const liveLine = useMemo(() => liveTrailPoints(dayPoints, dayNow), [dayNow, dayPoints]);
  const memberJourneys = selected ? state.journeys[selected.id] ?? [] : [];
  const dayJourneys = useMemo(
    () => collapseDuplicateJourneys(memberJourneys.filter((journey) => seoulDayKey(journey.endedAt) === pathDay))
      .slice()
      .sort((a, b) => b.startedAt - a.startedAt),
    [memberJourneys, pathDay],
  );
  const openJourney = useMemo(
    () => (pathDay === liveDay ? previewOpenJourney(dayPoints, now) : null),
    [dayPoints, liveDay, now, pathDay],
  );
  useEffect(() => {
    setScrub(0);
    setDetailId(null);
    setPlaying(false);
  }, [pathDay, selected?.id]);
  useEffect(() => {
    if (state.mode === 'managed' && state.tab !== 'map') familyRef.current.setTab('map');
  }, [state.mode, state.tab]);
  useEffect(() => {
    if (!viewingRecords) {
      setDetailId(null);
      setPlaying(false);
      setDayPicker(false);
    }
    if (!managed && state.tab !== 'map') setDm(null);
  }, [managed, state.tab, viewingRecords]);
  const detailJourney = detailId && detailId !== 'open'
    ? dayJourneys.find((journey) => journey.id === detailId) ?? null
    : null;
  const detailOpen = viewingRecords && !!detailId && (detailId === 'open' ? !!openJourney : !!detailJourney);
  const detailPoints = detailId === 'open' ? liveLine : detailJourney?.points ?? [];
  const mapPoints = detailOpen ? detailPoints : liveLine;
  const showPath = detailOpen || (!!selected && (managed || state.tab === 'map') && showTrail && (selected.id === 'self' || selected.share === 'allowed' || selected.role === 'admin-share'));
  const dayVisits = useMemo(() => {
    const list = selected ? state.visits[selected.id] ?? [] : [];
    return list.filter((visit) => seoulDayKey(visit.arrivedAt) === pathDay);
  }, [pathDay, selected, state.visits]);
  const playback = useMemo(() => {
    if (!detailOpen || detailPoints.length < 2) return null;
    return playbackMark(detailPoints, scrub / 1000);
  }, [detailOpen, detailPoints, scrub]);
  const unreadAlerts = state.notices.some((item) => !item.read);
  useEffect(() => {
    if (!detailOpen) return;
    const points = detailId === 'open' ? liveLine : detailJourney?.points ?? [];
    if (points.length === 0) return;
    const timer = window.setTimeout(() => mapRef.current?.fit(points), 120);
    return () => window.clearTimeout(timer);
  }, [detailId, detailJourney, detailOpen, liveLine]);
  useEffect(() => {
    if (!playing || !detailOpen) return;
    const from = scrubRef.current >= 1000 ? 0 : scrubRef.current;
    if (scrubRef.current >= 1000) setScrub(0);
    const started = performance.now();
    let frame = 0;
    const step = (mark: number) => {
      const ratio = Math.min(1, (mark - started) / 9000);
      setScrub(Math.round(from + (1000 - from) * ratio));
      if (ratio < 1) frame = requestAnimationFrame(step);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [detailId, detailOpen, playing]);
  const missingSyncKey = state.mode === 'managed' && state.guardians.some((link) => (link.share === 'allowed' || link.share === 'revoked') && !link.syncToken);
  const syncBanner = syncBannerText(syncPhase, missingSyncKey);
  const remoteLive = syncPhase === 'live';

  const focusMember = (member: Member, fitTrail: boolean) => {
    setSelectedId(member.id);
    const points = visibleTrail(liveTrailPoints(
      (state.tracks[member.id] ?? []).filter((point) => seoulDayKey(point.at) === liveDay),
      now,
    ));
    if (fitTrail && showTrail && points.length >= 2) mapRef.current?.fit(points);
    else if (hasLocation(member)) mapRef.current?.panTo(member.lat, member.lng);
  };

  const closeDetail = () => {
    setDetailId(null);
    setPlaying(false);
  };
  const openDetail = (id: string, play: boolean) => {
    setDetailId(id);
    setScrub(0);
    setPlaying(play);
  };
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (scrub >= 1000) setScrub(0);
    setPlaying(true);
  };
  const startHomePick = () => {
    const existing = state.home;
    const located = self && hasLocation(self) ? { lat: self.lat, lng: self.lng } : null;
    const start = existing
      ? { lat: existing.lat, lng: existing.lng }
      : located ?? mapRef.current?.getCenter() ?? center;
    setShowZone(true);
    setDraftHome(existing
      ? { ...existing, lat: start.lat, lng: start.lng, alertPhone: '' }
      : { label: '우리 집', address: '', lat: start.lat, lng: start.lng, radiusM: 200, alertPhone: '' });
    setMenuOpen(false);
    setManagedSettings(false);
    setRecordId(null);
    setPlacingHome(true);
    family.setTab('map');
    window.setTimeout(() => mapRef.current?.panTo(start.lat, start.lng), 60);
  };
  const openPerson = (member: Member) => {
    if (managed) {
      setSelectedId(member.id);
      setRecordId(member.id);
      setHistoryDay(seoulDayKey(Date.now()));
      setDetailId(null);
      setPlaying(false);
      if (hasLocation(member)) mapRef.current?.panTo(member.lat, member.lng);
      return;
    }
    const thread = directThreadFor(state, member);
    if (hasLocation(member)) focusMember(member, true);
    if (thread) setDm(thread);
  };
  useEffect(() => consumeAndroidBack(() => {
    if (confirm) {
      setConfirm(null);
      return true;
    }
    if (keepPrompt !== 'none') {
      setKeepPrompt('none');
      return true;
    }
    if (dayPicker) {
      setDayPicker(false);
      return true;
    }
    if (dm) {
      setDm(null);
      return true;
    }
    if (alertsOpen) {
      setAlertsOpen(false);
      return true;
    }
    if (sheet) {
      setSheet(null);
      return true;
    }
    if (managedSettings) {
      setManagedSettings(false);
      return true;
    }
    if (menuOpen) {
      setMenuOpen(false);
      return true;
    }
    if (placingHome) {
      setDraftHome(null);
      setPlacingHome(false);
      return true;
    }
    if (detailId) {
      setDetailId(null);
      setPlaying(false);
      return true;
    }
    if (recordId) {
      setRecordId(null);
      return true;
    }
    return false;
  }), [alertsOpen, confirm, dayPicker, detailId, dm, keepPrompt, managedSettings, menuOpen, placingHome, recordId, sheet]);
  const people = state.mode === 'managed'
    ? state.members.filter((member) => member.id === 'self' || member.role === 'admin-share')
    : state.members.filter((member) => member.role !== 'guardian' && member.role !== 'admin-share');
  const extraChats = guardianThreads(state).filter((thread) => chatTick >= 0 || thread.peer);

  return (
    <div className="flex h-full justify-center bg-[#d7e3ee]">
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-white">
        {(managed || state.tab !== 'history' || detailOpen) && (
        <div className="relative min-h-0 flex-1">
          <StreetMap
            ref={mapRef}
            center={center}
            zoom={16}
            members={detailOpen ? [] : visibleMembers}
            home={detailOpen ? null : (draftHome ?? (showZone ? state.home : null))}
            trail={showPath ? mapPoints : []}
            trailColor="#0084FF"
            playback={playback}
            selectedId={selected?.id}
            onSelect={(id) => {
              const member = state.members.find((item) => item.id === id);
              if (!member) return;
              if (managed) openPerson(member);
              else focusMember(member, true);
            }}
            onMove={(next) => {
              if (!placingRef.current) return;
              setDraftHome((prev) => {
                if (!prev) return prev;
                if (Math.abs(prev.lat - next.lat) < 0.000001 && Math.abs(prev.lng - next.lng) < 0.000001) return prev;
                return { ...prev, lat: next.lat, lng: next.lng };
              });
            }}
          />

          {(managed || state.tab === 'map') && !detailOpen && (
          <>
          {managed && (
            <button
              type="button"
              aria-label="메뉴"
              onClick={() => setMenuOpen(true)}
              className="absolute left-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
            >
              <Menu className="h-5 w-5 text-slate-800" />
            </button>
          )}
          <button
            type="button"
            aria-label="알림"
            onClick={() => setAlertsOpen(true)}
            className={`absolute top-3 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md ${managed ? 'left-16' : 'left-3'}`}
          >
            <Bell className={`h-5 w-5 ${unreadAlerts ? 'text-[#0084FF]' : 'text-slate-700'}`} />
            {unreadAlerts && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#ff8a34]" />}
          </button>
          {placingHome && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-full">
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-800 shadow">집</span>
            </div>
          )}

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
                    const points = visibleTrail(liveLine);
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
          ) : null}
          </>
          )}
          {detailOpen && (
            <>
              <button
                type="button"
                onClick={closeDetail}
                className="absolute left-3 top-3 z-30 flex items-center gap-1 rounded-full bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-md"
              >
                <ChevronLeft className="h-5 w-5" />
                기록
              </button>
              <div className="absolute right-3 top-3 z-30 flex flex-col gap-2">
                <RoundButton label="확대" onClick={() => mapRef.current?.zoomBy(1)}>
                  <Plus className="h-5 w-5" />
                </RoundButton>
                <RoundButton label="축소" onClick={() => mapRef.current?.zoomBy(-1)}>
                  <Minus className="h-5 w-5" />
                </RoundButton>
              </div>
            </>
          )}
        </div>
        )}

        {state.tab === 'map' && placingHome && draftHome && (
          <HomePlaceBar
            draft={draftHome}
            saved={!!state.home}
            canUseSelf={!!self && hasLocation(self)}
            onDraft={setDraftHome}
            onUseSelf={() => {
              if (self && hasLocation(self)) mapRef.current?.panTo(self.lat, self.lng);
            }}
            onCancel={() => {
              setDraftHome(null);
              setPlacingHome(false);
              if (!managed) family.setTab('menu');
            }}
            onSave={() => {
              family.saveHome(draftHome);
              setDraftHome(null);
              setPlacingHome(false);
              setShowZone(true);
            }}
            onClear={() => {
              family.clearHome();
              setDraftHome(null);
              setPlacingHome(false);
              if (!managed) family.setTab('menu');
            }}
          />
        )}

        {managed && recordId && !placingHome && !detailOpen && (
          <section className="max-h-[48%] overflow-y-auto rounded-t-3xl bg-white px-4 pb-3 pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="truncate text-lg font-black">{selected?.id === 'self' ? '내 기록' : `${selected?.name ?? ''} 기록`}</h2>
              <button type="button" onClick={() => setRecordId(null)} className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">
                닫기
              </button>
            </div>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`날짜 ${historyDayLabel(activeHistoryDay, now)}`}
              onClick={() => setDayPicker(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 text-left"
            >
              <span>
                <span className="block text-[11px] font-semibold text-slate-400">날짜</span>
                <span className="block text-sm font-black text-slate-900">{historyDayLabel(activeHistoryDay, now)}</span>
              </span>
              <span className="text-xs font-bold text-[#0084FF]">변경</span>
            </button>
            {selected && selected.id !== 'self' && directThreadFor(state, selected) && (
              <button
                type="button"
                onClick={() => {
                  const thread = directThreadFor(state, selected);
                  if (thread) setDm(thread);
                }}
                className="mt-2 w-full rounded-full bg-[#0084FF] py-2.5 text-sm font-black text-white"
              >
                개인 대화
              </button>
            )}
            <div className="mt-3 space-y-3">
              <JourneyCards
                journeys={dayJourneys}
                open={openJourney}
                selectedId={detailId}
                onSelect={(id) => openDetail(id, false)}
                onPlay={(id) => openDetail(id, true)}
              />
              <TodayRecord visits={dayVisits} />
            </div>
          </section>
        )}

        {(managed || state.tab === 'map') && !placingHome && !(managed && recordId) && (
          <section className="rounded-t-3xl bg-white px-4 pb-2 pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
            <div className="mb-1">
              <h2 className="text-lg font-black">우리 가족</h2>
              <p className="text-[11px] font-semibold text-slate-400">{managed ? '사람을 누르면 그 사람의 기록을 봅니다' : '사람을 누르면 그 사람과만 대화합니다'}</p>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {people.map((member) => {
                const thread = directThreadFor(state, member);
                const unread = thread ? unreadCount(thread.code, thread.me, thread.peer) : 0;
                return (
                  <MemberCard
                    key={member.id}
                    member={member}
                    home={state.mode === 'admin' ? state.home : null}
                    selected={member.id === selected?.id}
                    unread={chatTick >= 0 ? unread : 0}
                    chatHint={!managed && member.id !== 'self'}
                    onSelect={() => openPerson(member)}
                    onPhoto={member.id === 'self' ? (photo) => family.setPhoto(photo) : undefined}
                    onRemove={state.mode === 'admin' && member.id !== 'self' ? () => setConfirm({ kind: 'remove', id: member.id, name: member.name }) : undefined}
                  />
                );
              })}
              {extraChats.map((thread) => (
                <button
                  key={`${thread.code}:${thread.peer}`}
                  type="button"
                  onClick={() => setDm(thread)}
                  className="flex w-full items-center justify-between rounded-2xl px-1 py-2 text-left"
                >
                  <span>
                    <span className="block font-bold">{thread.label}</span>
                    <span className="block text-xs text-slate-500">개인 대화</span>
                  </span>
                  {unreadCount(thread.code, thread.me, thread.peer) > 0 && (
                    <span className="rounded-full bg-[#ff8a34] px-2 py-0.5 text-[10px] font-black text-white">{unreadCount(thread.code, thread.me, thread.peer)}</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {!managed && state.tab === 'history' && !detailOpen && (
          <section className="min-h-0 flex-1 overflow-y-auto bg-white px-4 pb-4 pt-4">
            <h2 className="text-lg font-black">이동 기록</h2>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`날짜 ${historyDayLabel(activeHistoryDay, now)}`}
              onClick={() => setDayPicker(true)}
              className="mt-3 flex w-full items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 text-left"
            >
              <span>
                <span className="block text-[11px] font-semibold text-slate-400">날짜</span>
                <span className="block text-sm font-black text-slate-900">{historyDayLabel(activeHistoryDay, now)}</span>
              </span>
              <span className="text-xs font-bold text-[#0084FF]">변경</span>
            </button>
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
            <div className="mt-3 space-y-3">
              <JourneyCards
                journeys={dayJourneys}
                open={openJourney}
                selectedId={detailId}
                onSelect={(id) => openDetail(id, false)}
                onPlay={(id) => openDetail(id, true)}
              />
              <TodayRecord visits={dayVisits} />
            </div>
          </section>
        )}

        {detailOpen && (detailJourney || openJourney) && (
          <section className="bg-white px-4 pb-3 pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
            <JourneyScrubber
              journey={(detailJourney ?? openJourney)!}
              scrub={scrub}
              label={playback?.label ?? '재생'}
              playing={playing}
              onScrub={(value) => {
                setPlaying(false);
                setScrub(value);
              }}
              onTogglePlay={togglePlay}
            />
          </section>
        )}

        {!managed && state.tab === 'menu' && (
          <section className="min-h-[52%] overflow-y-auto bg-white px-4 py-4 text-sm">
            <h2 className="text-lg font-black">메뉴</h2>
            <p className="mt-3 text-xs font-bold text-[#0084FF]">{state.mode === 'admin' ? '관리자 모드' : '피관리자 모드'}</p>
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <PhotoPicker name={state.profile?.name || '나'} photo={state.profile?.photo} onPhoto={(photo) => family.setPhoto(photo)} />
              <div>
                <p className="font-bold">{state.profile?.name}</p>
                <p className="text-xs font-bold text-[#0084FF]">프로필 사진</p>
                <p className="text-xs text-slate-400">사진을 누르면 이 기기에만 저장됩니다.</p>
              </div>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">이 기기에만 저장된 이름입니다. 전화번호나 Google 계정으로 본인을 확인하지 않습니다.</p>
            {state.mode === 'admin' && (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-400">우리 집</p>
                {state.home ? (
                  <>
                    <p className="mt-1 font-black">{state.home.label || '우리 집'}</p>
                    <p className="text-xs leading-5 text-slate-500">
                      반경 {state.home.radiusM}m{state.home.address ? ` · ${state.home.address}` : ''}. 이 원을 나가면 알림이 남습니다.
                    </p>
                    <button type="button" onClick={startHomePick} className="mt-3 w-full rounded-full bg-[#0084FF] py-3 text-sm font-black text-white">
                      지도에서 다시 고르기
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm leading-6 text-slate-600">아직 집이 없습니다. 지도에서 위치를 고르면, 가족이 그 반경을 나갈 때 알림이 남습니다.</p>
                    <button type="button" onClick={startHomePick} className="mt-3 w-full rounded-full bg-[#0084FF] py-3 text-sm font-black text-white">
                      지도에서 집 정하기
                    </button>
                  </>
                )}
              </div>
            )}
            {state.mode === 'admin' && (
              <button
                type="button"
                onClick={() => family.setShareSelf(!state.shareSelfWithFamily)}
                className={`mt-2 w-full rounded-2xl px-3 py-3 text-left text-xs font-bold ${state.shareSelfWithFamily ? 'bg-blue-50 text-[#0084FF]' : 'bg-slate-50 text-slate-600'}`}
              >
                {state.shareSelfWithFamily ? '내 위치를 가족에게 보여주는 중 · 끄기' : '내 위치를 피관리자에게 공유'}
                {tracking.familyShareNote && <span className="mt-1 block font-semibold text-amber-700">{tracking.familyShareNote}</span>}
              </button>
            )}
            <div className="mt-3">
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
              />
            </div>
            {state.mode === 'managed' && state.guardians.map((link) => (
              <div key={link.id} className="mt-2">
                <GuardianCard
                  link={link}
                  remote={familySyncConfigured() && !!link.syncToken}
                  onAllow={() => family.setGuardianShare(link.code, 'allowed')}
                  onRevoke={() => family.setGuardianShare(link.code, 'revoked')}
                  onLeave={() => setConfirm({ kind: 'leave', id: link.id, name: link.label })}
                />
              </div>
            ))}
            {state.mode === 'managed' && state.guardians.length === 0 && (
              <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">아직 수락한 초대가 없습니다. 관리자에게 받은 코드로 참여한 뒤, 위치를 따로 허용하세요.</p>
            )}
            <dl className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 text-slate-600">
              <Line k="알림" v={labelOf(state.permissions.notifications)} />
              <Line k="위치 정확도" v={state.permissions.accuracy === 'precise' ? '정확한 위치' : '대략적인 위치'} />
              <Line k="위치 허용" v={locationLabel(state.permissions.locationMode)} />
              <Line k="움직임" v={labelOf(state.permissions.motion)} />
              <Line k="배터리 안내" v={state.permissions.battery === 'acknowledged' ? '확인함' : state.permissions.battery === 'skipped' ? '나중에' : '해당 없음'} />
            </dl>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              가족 위치와 배터리는 초대 동기화 키로 위치 서버에 올라가고, 관리자 폰이 그 서버에서 받아 지도에 표시합니다. 예시 좌표나 하드코딩된 팝업이 아닙니다. 알림을 허용하면 앱을 닫아도 SOS가 푸시로 옵니다. 전화번호로는 위치를 찾지 않습니다.
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              항상 허용을 누르면 이 앱의 위치 권한 화면이 바로 열립니다. 배터리 제한 없음을 누르면 시스템 팝업이 바로 열립니다. Umap은 그 스위치를 대신 바꾸지 않습니다. 위치 유지는 사용자가 켠 뒤에만 백그라운드에서 보냅니다. 걷는 동안만 촘촘히 받고, 머물면 2분·5분으로 줄입니다. 알림 목록에 Umap 카드는 나오지 않습니다.
            </p>
            <div className="mt-4 space-y-2">
              <button type="button" onClick={family.reopenMode} className="w-full rounded-full bg-slate-100 py-3 font-bold">
                모드 다시 고르기
              </button>
              <button type="button" onClick={family.revisitPermissions} className="w-full rounded-full bg-slate-100 py-3 font-bold">
                권한 안내 다시 보기
              </button>
              <button
                type="button"
                onClick={() => {
                  void umapLocation.stopAlertWatch();
                  family.logout();
                }}
                className="w-full rounded-full py-3 font-bold text-slate-500"
              >
                로그아웃
              </button>
            </div>
          </section>
        )}

        {!managed && (
        <nav className="grid grid-cols-3 border-t border-slate-100 bg-white pb-[env(safe-area-inset-bottom)] text-[11px] font-bold text-slate-400">
          <NavButton active={state.tab === 'map'} label="지도" onClick={() => family.setTab('map')} icon={<MapPin className="h-5 w-5" />} />
          <NavButton active={state.tab === 'history'} label="기록" onClick={() => family.setTab('history')} icon={<Route className="h-5 w-5" />} />
          <NavButton active={state.tab === 'menu'} label="메뉴" onClick={() => family.setTab('menu')} icon={<span className="text-lg leading-none">☰</span>} />
        </nav>
        )}

        {dm && (managed || state.tab === 'map') && (
          <FamilyChatSheet
            target={dm}
            onClose={() => setDm(null)}
          />
        )}
        {dayPicker && !detailOpen && (managed ? !!recordId : state.tab === 'history') && (
          <Sheet title="날짜" onClose={() => setDayPicker(false)}>
            <p className="mb-3 text-sm leading-6 text-slate-500">오늘부터 30일 전입니다. 서울 날짜로 고릅니다.</p>
            <div className="space-y-1">
              {historyDays.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    setHistoryDay(day);
                    setDayPicker(false);
                  }}
                  className={`flex w-full rounded-2xl px-3 py-3 text-left text-sm font-bold ${day === activeHistoryDay ? 'bg-[#0084FF] text-white' : 'bg-slate-50 text-slate-800'}`}
                >
                  {historyDayLabel(day, now)}
                </button>
              ))}
            </div>
          </Sheet>
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
            senderName={state.profile?.name || ''}
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
            onAccept={(label, code, syncToken, rosterName, adminName) => family.acceptInvite(label, code, syncToken, rosterName, adminName)}
            onShare={(code, share) => family.setGuardianShare(code, share)}
          />
        )}
        {keepPrompt !== 'none' && !state.backgroundKeepAlive && (
          <KeepNoticeSheet
            mode={keepPrompt}
            busy={keepBusy}
            note={keepNote}
            onLater={() => {
              markSessionFlag(keepPrompt === 'start' ? KEEP_START_ASKED_KEY : KEEP_PERMISSION_ASKED_KEY);
              setKeepPrompt('none');
            }}
            onPrimary={() => {
              if (keepPrompt === 'start') {
                markSessionFlag(KEEP_START_ASKED_KEY);
                family.setKeepAlive(true);
                setKeepPrompt('none');
                return;
              }
              setKeepBusy(true);
              void askNotifications().then((result) => {
                setKeepBusy(false);
                markSessionFlag(KEEP_PERMISSION_ASKED_KEY);
                const notifications = result.state === 'granted' || result.state === 'denied' || result.state === 'skipped' ? result.state : 'denied';
                family.finishPermissions({ ...state.permissions, notifications, completed: true });
                if (state.permissions.locationMode === 'always') {
                  markSessionFlag(KEEP_START_ASKED_KEY);
                  family.setKeepAlive(true);
                  setKeepPrompt('none');
                  if (result.state !== 'granted') {
                    setSettingsNote('위치 유지를 켰습니다. 알림 목록에 Umap 카드는 나오지 않습니다. SOS 알림은 알림 권한이 필요합니다.');
                  }
                  return;
                }
                if (result.state === 'granted') {
                  setSettingsNote('알림을 허용했습니다. 위치를 항상 허용으로 고르면 위치 유지를 켤 수 있습니다. 알림 목록에 Umap 카드는 나오지 않습니다.');
                  setKeepPrompt('none');
                  return;
                }
                setKeepNote(result.note ?? '알림을 허용하지 않았습니다. 위치를 항상 허용으로 고르면 위치 유지를 켤 수 있습니다. SOS 알림만 알림 권한이 필요합니다.');
              });
            }}
          />
        )}
        {managed && menuOpen && (
          <ManagedMenu
            name={state.profile?.name || '나'}
            photo={state.profile?.photo}
            home={state.home}
            alertHint={unreadAlerts ? '새 알림이 있습니다' : '들어오고 나간 기록'}
            guardians={state.guardians}
            onPhoto={(photo) => family.setPhoto(photo)}
            onClose={() => setMenuOpen(false)}
            onHome={startHomePick}
            onAlerts={() => {
              setMenuOpen(false);
              setAlertsOpen(true);
            }}
            onInvite={() => {
              setMenuOpen(false);
              setSheet('accept');
            }}
            onSettings={() => setManagedSettings(true)}
            onToggleShare={(link) => family.setGuardianShare(link.code, link.share === 'allowed' ? 'revoked' : 'allowed')}
          />
        )}
        {managed && managedSettings && (
          <Sheet title="설정" onClose={() => setManagedSettings(false)}>
            <p className="text-sm leading-6 text-slate-500">위치는 초대를 수락하고 공유를 허용한 뒤에만 나갑니다. 위치 유지를 켠 뒤에는 이 화면에서 끄지 않습니다.</p>
            <button
              type="button"
              onClick={() => {
                void askAlwaysLocation(state.permissions.accuracy === 'precise').then((result) => {
                  setSettingsNote(result.note);
                  if (result.location === 'always' || result.location === 'while-using' || result.location === 'denied') {
                    family.finishPermissions({ ...state.permissions, locationMode: result.location, completed: true });
                  }
                });
              }}
              className="mt-4 w-full rounded-full bg-slate-100 py-3 text-sm font-bold"
            >
              {tracking.native ? '항상 허용' : '위치 허용'}
            </button>
            {tracking.native && (
              <button type="button" onClick={() => { void askBattery().then((result) => setSettingsNote(result.note)); }} className="mt-2 w-full rounded-full bg-slate-100 py-3 text-sm font-bold">
                배터리 제한 없음
              </button>
            )}
            {!(state.permissions.locationMode === 'always' && state.backgroundKeepAlive) && (
              <button
                type="button"
                onClick={() => {
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
                className="mt-2 w-full rounded-full bg-[#0084FF] py-3 text-sm font-black text-white"
              >
                위치 유지 켜기
              </button>
            )}
            {state.backgroundKeepAlive && state.permissions.locationMode === 'always' && (
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">위치 유지가 켜져 있습니다. 끄는 버튼은 없습니다.</p>
            )}
            {settingsNote && <p className="mt-3 text-xs leading-5 text-amber-800">{settingsNote}</p>}
            {state.guardians.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => {
                  setManagedSettings(false);
                  setMenuOpen(false);
                  setConfirm({ kind: 'leave', id: link.id, name: link.label });
                }}
                className="mt-3 w-full py-2 text-sm font-bold text-slate-400"
              >
                {link.label} 연결 끊기
              </button>
            ))}
          </Sheet>
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

function MenuRow({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3.5 text-left first:border-t-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-400">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </button>
  );
}

function ManagedMenu({
  name,
  photo,
  home,
  alertHint,
  guardians,
  onPhoto,
  onClose,
  onHome,
  onAlerts,
  onInvite,
  onSettings,
  onToggleShare,
}: {
  name: string;
  photo?: string;
  home: HomeZone | null;
  alertHint: string;
  guardians: GuardianLink[];
  onPhoto: (photo: string) => void;
  onClose: () => void;
  onHome: () => void;
  onAlerts: () => void;
  onInvite: () => void;
  onSettings: () => void;
  onToggleShare: (link: GuardianLink) => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#f2f4f7]">
      <header className="flex items-center bg-white px-1 py-2">
        <button type="button" aria-label="닫기" onClick={onClose} className="flex h-11 w-11 items-center justify-center text-slate-800">
          <X className="h-6 w-6" />
        </button>
        <h2 className="flex-1 text-center text-base font-bold">메뉴</h2>
        <span className="h-11 w-11" />
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm">
          <PhotoPicker name={name} photo={photo} onPhoto={onPhoto} />
          <div className="min-w-0">
            <p className="truncate text-base font-black">{name}</p>
            <p className="text-xs text-slate-400">이 기기에만 저장된 이름</p>
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
          <MenuRow icon={<Home className="h-4 w-4" />} label="우리 집 설정" hint={home ? `${home.label || '우리 집'} · 반경 ${home.radiusM}m` : '지도에서 집 위치를 정합니다'} onClick={onHome} />
          <MenuRow icon={<Bell className="h-4 w-4" />} label="알림" hint={alertHint} onClick={onAlerts} />
          <MenuRow icon={<UserPlus className="h-4 w-4" />} label="초대 수락" hint="관리자에게 받은 코드" onClick={onInvite} />
        </div>
        {guardians.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
            {guardians.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => onToggleShare(link)}
                className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3.5 text-left first:border-t-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{link.label}</span>
                  <span className="block text-xs text-slate-400">위치 공유</span>
                </span>
                <span className={`text-xs font-bold ${link.share === 'allowed' ? 'text-[#0084FF]' : 'text-slate-400'}`}>
                  {link.share === 'allowed' ? '공유 중' : '공유 안 함'}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
          <MenuRow icon={<Settings className="h-4 w-4" />} label="설정" hint="위치 권한" onClick={onSettings} />
        </div>
      </div>
    </div>
  );
}

function myChatName(state: { mode: string | null; profile: { name?: string } | null; guardians: GuardianLink[] }, code: string): string {
  if (state.mode === 'managed') {
    const link = state.guardians.find((item) => item.code === code && item.share !== 'revoked');
    return chatName(link?.rosterName || state.profile?.name) || '나';
  }
  return chatName(state.profile?.name) || '나';
}

function directThreadFor(state: {
  mode: string | null;
  profile: { name?: string } | null;
  guardians: GuardianLink[];
  inviteCode: string;
  syncWriteKey: string;
  syncReadKey: string;
}, member: Member): DirectChatTarget | null {
  if (member.id === 'self') return null;
  if (state.mode === 'admin') {
    const peer = chatName(member.name);
    const me = myChatName(state, state.inviteCode);
    if (!peer || peer === me) return null;
    return {
      code: member.inviteCode || state.inviteCode,
      me,
      peer,
      label: member.name,
      writeKey: state.syncWriteKey,
      readKey: state.syncReadKey,
    };
  }
  const codeFromId = member.id.startsWith('family:') ? member.id.split(':')[1] || '' : '';
  const link = state.guardians.find((item) => item.share !== 'revoked' && item.code === codeFromId)
    ?? state.guardians.find((item) => item.share !== 'revoked' && chatName(item.adminName || item.label) === chatName(member.name));
  const code = link?.code || codeFromId;
  if (!code) return null;
  const peer = chatName(member.name);
  const me = myChatName(state, code);
  if (!peer || peer === me) return null;
  return { code, me, peer, label: member.name, token: link?.syncToken ?? null };
}

function guardianThreads(state: {
  mode: string | null;
  profile: { name?: string } | null;
  guardians: GuardianLink[];
  members: Member[];
}): DirectChatTarget[] {
  if (state.mode !== 'managed') return [];
  const shown = new Set(state.members.filter((member) => member.role === 'admin-share').map((member) => chatName(member.name)));
  const threads: DirectChatTarget[] = [];
  for (const link of state.guardians) {
    if (link.share === 'revoked') continue;
    const peer = chatName(link.adminName || link.label);
    const me = myChatName(state, link.code);
    if (!peer || peer === me || shown.has(peer)) continue;
    threads.push({
      code: link.code,
      me,
      peer,
      label: link.adminName || link.label,
      token: link.syncToken ?? null,
    });
  }
  return threads;
}

function personArea(member: Member, home: HomeZone | null) {
  if (member.place) return member.place;
  if (home && hasLocation(member) && haversineMeters(member, home) <= home.radiusM) return home.label || '우리 집';
  if (!hasLocation(member)) return '위치 기다리는 중';
  return '근처';
}

function personLive(member: Member) {
  if (!hasLocation(member)) return '';
  return member.moving === false ? '머무름' : '지금';
}

function MemberCard({
  member,
  home,
  selected,
  unread = 0,
  chatHint = false,
  onSelect,
  onPhoto,
  onRemove,
}: {
  member: Member;
  home: HomeZone | null;
  selected: boolean;
  unread?: number;
  chatHint?: boolean;
  onSelect: () => void;
  onPhoto?: (photo: string) => void;
  onRemove?: () => void;
}) {
  const live = personLive(member);
  return (
    <div className={`flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left ${selected ? 'bg-blue-50' : ''}`}>
      {onPhoto ? (
        <PhotoPicker name={member.name} photo={member.photo} onPhoto={onPhoto} />
      ) : (
        <MemberAvatar name={member.name} photo={member.photo} />
      )}
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold">{member.name}</span>
        <span className="block truncate text-xs text-slate-500">
          {personArea(member, home)}{live ? ` · ${live}` : ''}{chatHint ? ' · 개인 대화' : ''}
        </span>
      </button>
      {unread > 0 && <span className="shrink-0 rounded-full bg-[#ff8a34] px-2 py-0.5 text-[10px] font-black text-white">{unread}</span>}
      {member.battery != null && <span className="shrink-0 text-xs font-bold text-slate-500">{member.battery}%</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`${member.name} 지우기`} className="shrink-0 rounded-full p-2 text-slate-400">
          <X className="h-4 w-4" />
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

const HOME_RADIUS_CHOICES = [100, 200, 300, 500];

function HomePlaceBar({
  draft,
  saved,
  canUseSelf,
  onDraft,
  onUseSelf,
  onCancel,
  onSave,
  onClear,
}: {
  draft: HomeZone;
  saved: boolean;
  canUseSelf: boolean;
  onDraft: (home: HomeZone) => void;
  onUseSelf: () => void;
  onCancel: () => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const setRadius = (radiusM: number) => {
    const clamped = Math.min(2000, Math.max(50, Math.round(radiusM) || 50));
    onDraft({ ...draft, radiusM: clamped });
  };
  return (
    <section className="rounded-t-3xl bg-white px-4 pb-3 pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
      <h2 className="text-lg font-black">{saved ? '우리 집 위치' : '우리 집 정하기'}</h2>
      <p className="text-xs leading-5 text-slate-500">지도를 움직여 파란 원 가운데를 집에 맞추세요. 가족이 이 원을 나가면 알림이 남습니다.</p>
      <label className="mt-3 block text-xs font-bold text-slate-400" htmlFor="home-address">
        집 이름
      </label>
      <input
        id="home-address"
        value={draft.address}
        onChange={(event) => {
          const address = event.target.value;
          onDraft({ ...draft, address, label: address.trim() || '우리 집' });
        }}
        placeholder="우리 집"
        className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-[#0084FF]"
      />
      <p className="mt-3 text-xs font-bold text-slate-400">반경 {draft.radiusM}m</p>
      <div className="mt-2 flex gap-2">
        {HOME_RADIUS_CHOICES.map((radius) => (
          <button
            key={radius}
            type="button"
            onClick={() => setRadius(radius)}
            className={`flex-1 rounded-full py-2 text-xs font-bold ${draft.radiusM === radius ? 'bg-[#0084FF] text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {radius}m
          </button>
        ))}
      </div>
      <input
        aria-label="집 반경"
        type="range"
        min={50}
        max={2000}
        step={10}
        value={draft.radiusM}
        onChange={(event) => setRadius(Number(event.target.value))}
        className="mt-3 w-full"
      />
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-full bg-slate-100 py-3 text-sm font-bold">
          취소
        </button>
        <button type="button" onClick={onSave} className="flex-[2] rounded-full bg-[#ff8a34] py-3 text-sm font-black text-white">
          이 위치로 저장
        </button>
      </div>
      {canUseSelf && (
        <button type="button" onClick={onUseSelf} className="mt-2 w-full rounded-full bg-slate-100 py-2 text-xs font-bold text-slate-600">
          내 현재 위치로 맞추기
        </button>
      )}
      {saved && (
        <button type="button" onClick={onClear} className="mt-1 w-full py-2 text-sm font-bold text-slate-400">
          우리 집 지우기
        </button>
      )}
    </section>
  );
}

function AdminInviteSheet({
  code,
  writeKey,
  readKey,
  home,
  senderName,
  onClose,
  onCreate,
}: {
  code: string;
  writeKey: string;
  readKey: string;
  home: HomeZone | null;
  senderName: string;
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
      {token && <InviteQrImage text={buildInviteLink(code, home, token, sentName, senderName)} />}
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
        <button type="button" disabled={!token} onClick={() => copy(buildInviteLink(code, home, token, sentName, senderName), '링크를 복사했습니다')} className="rounded-full bg-slate-100 py-2 text-xs font-bold disabled:opacity-40">
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
          ? '링크를 연 폰에서 위치 공유를 허용하면 그 폰의 최신 위치와 배터리가 위치 서버를 통해 이 지도에 나타납니다. 미리 넣어 둔 좌표는 없습니다. 공유를 끄면 핀이 곧 사라집니다. 코드만 입력하면 같은 브라우저에서만 공유됩니다.'
          : '이 빌드에는 위치 서버 주소가 없습니다. 코드는 같은 브라우저 안에서만 공유됩니다.'}
        {' '}
        {home ? `링크에는 집 반경 ${home.radiusM}m가 들어 있습니다. 상대가 위치 공유를 허용한 뒤 그 원을 나가면 관리자 화면에 사이렌이 울립니다.` : '우리 집을 저장한 뒤 링크를 다시 복사하면 집 반경 이탈 사이렌이 연결됩니다.'}
        {' '}피관리자 폰에서는 이탈 사이렌이 울리지 않습니다. SOS는 양쪽에서 울리고, 관리자가 알림을 허용하면 앱을 닫아도 알림이 옵니다. 위치를 읽는 키는 관리자 폰에만 있습니다.
      </p>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white">
        완료
      </button>
    </Sheet>
  );
}

function parseInviteDraft(value: string): { code: string; syncToken: string | null; rosterName: string | null; adminName: string | null } {
  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const code = (url.searchParams.get('invite') || '').replace(/\D/g, '').slice(0, 6);
      const syncToken = splitSyncToken(url.searchParams.get('sync')) ? url.searchParams.get('sync') : null;
      const rosterName = (url.searchParams.get('who') || '').trim().slice(0, 80) || null;
      const adminName = (url.searchParams.get('from') || '').trim().slice(0, 20) || null;
      return { code, syncToken, rosterName, adminName };
    } catch {
      /* 링크가 아니면 코드로 봅니다. */
    }
  }
  return { code: trimmed.replace(/\D/g, '').slice(0, 6), syncToken: null, rosterName: null, adminName: null };
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
  onAccept: (label: string, code: string, syncToken: string | null, rosterName: string | null, adminName: string | null) => void;
  onShare: (code: string, share: 'allowed' | 'revoked') => void;
}) {
  const [code, setCode] = useState(pending ?? '');
  const [syncToken, setSyncToken] = useState(pendingSyncToken ?? '');
  const [rosterName, setRosterName] = useState(() => new URLSearchParams(window.location.search).get('who')?.trim().slice(0, 80) ?? '');
  const [adminName, setAdminName] = useState(() => new URLSearchParams(window.location.search).get('from')?.trim().slice(0, 20) ?? '');
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
                if (parsed.rosterName) setRosterName(parsed.rosterName);
                if (parsed.adminName) setAdminName(parsed.adminName);
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
              if (parsed.rosterName) setRosterName(parsed.rosterName);
              if (parsed.adminName) setAdminName(parsed.adminName);
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
              onAccept(label, code, token, rosterName.trim() || null, adminName.trim() || null);
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

function KeepNoticeSheet({
  mode,
  busy,
  note,
  onPrimary,
  onLater,
}: {
  mode: 'permission' | 'start';
  busy: boolean;
  note: string | null;
  onPrimary: () => void;
  onLater: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[60] flex items-end bg-slate-900/40">
      <div className="w-full rounded-t-3xl bg-white px-5 pb-8 pt-5">
        <h2 className="text-lg font-black">{mode === 'permission' ? '알림을 허용할까요?' : '위치 유지를 켤까요?'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {mode === 'permission'
            ? '알림 권한은 SOS와 집 반경 알림에 씁니다. 허용을 누르면 알림 창이 열립니다. 위치 공유 중에는 알림 목록에 Umap 카드가 나오지 않습니다. 앱이 혼자 켜지 않습니다. 전화번호는 쓰지 않습니다.'
            : '켜면 앱을 닫아도 위치를 보냅니다. 걷는 동안만 촘촘히 받고, 한곳에 머물면 2분에서 5분으로 줄입니다. 알림 목록에 Umap 카드는 나오지 않습니다. 배터리 제한이 없으면 그 간격을 더 잘 지킵니다. 앱이 혼자 켜지 않습니다.'}
        </p>
        {note && <p className="mt-3 text-sm leading-6 text-amber-800">{note}</p>}
        <button type="button" disabled={busy} onClick={onPrimary} className="mt-4 w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white disabled:opacity-40">
          {busy ? '확인 중…' : mode === 'permission' ? '알림 허용' : '위치 유지 켜기'}
        </button>
        <button type="button" disabled={busy} onClick={onLater} className="mt-2 w-full py-2 text-sm font-bold text-slate-400">
          나중에
        </button>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex items-end bg-slate-900/40">
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
