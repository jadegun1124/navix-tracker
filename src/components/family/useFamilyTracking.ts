import { useEffect, useRef, useState } from 'react';
import { hasLocation } from '../../lib/geo';
import { buildDayRecord } from '../../lib/tracking.mjs';
import type { AcceptedFix } from '../../lib/tracking.mjs';
import { readSharedPlaces, publishSharedPlace, subscribeSharedPlaces, type SharedPlace } from '../../services/familyShare';
import { familyEndpointAvailable, familySyncUrl, splitSyncToken, startManagedFamilySync, syncTokenFor } from '../../services/familySync';
import { startLocationWatch } from '../../services/locationWatch';
import { reverseGeocode } from '../../services/placeGeocode';
import { openAlwaysLocation, readNativeBattery, umapLocation, umapLocationNative, type KeepAliveTarget } from '../../services/umapLocation';
import { vworldApiKey } from '../../services/vworld';
import { useFamily } from './session';

const WAITING_KO: Record<string, string> = {
  stale: '저장된 위치는 두고, 방금 받은 위치를 기다리는 중입니다',
  accuracy: '오차가 큰 점은 버리고 더 정확한 위치를 기다립니다',
  coords: '위치 값을 다시 확인하는 중입니다',
  jump: '튀는 위치는 무시하고 있습니다',
  denied: '위치 권한을 확인해 주세요',
  retry: '위치를 다시 요청하는 중입니다',
};

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

export function useFamilyTracking(onFirstFix: (lat: number, lng: number) => void): { waiting: string | null; familyShareNote: string | null; native: boolean; openSettings: () => ReturnType<typeof openAlwaysLocation> } {
  const family = useFamily();
  const { state } = family;
  const familyRef = useRef(family);
  const onFirstFixRef = useRef(onFirstFix);
  const centered = useRef(false);
  const sharedTokens = useRef<Record<string, string>>({});
  const adminShared = useRef(false);
  const nativeAdminShared = useRef(false);
  const remoteRooms = useRef<Record<string, SharedPlace[] | undefined>>({});
  const triedGeocode = useRef(new Set<string>());
  const [waiting, setWaiting] = useState<string | null>(null);
  const [familyShareNote, setFamilyShareNote] = useState<string | null>(null);

  useEffect(() => {
    familyRef.current = family;
  });
  useEffect(() => {
    onFirstFixRef.current = onFirstFix;
  });

  const self = state.members.find((member) => member.id === 'self');
  const precise = state.permissions.accuracy === 'precise';
  const trackingOn = state.permissions.locationMode === 'while-using' || state.permissions.locationMode === 'always';
  const nativeKeeps = umapLocationNative() && state.backgroundKeepAlive && state.permissions.locationMode === 'always';
  const [appVisible, setAppVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const onVis = () => setAppVisible(document.visibilityState !== 'hidden');
    const onResume = () => setAppVisible(true);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('resume', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('resume', onResume);
    };
  }, []);
  const selfPublishKey = nativeKeeps
    ? 'native'
    : `${self?.lat ?? ''}:${self?.lng ?? ''}:${self?.updatedAt ?? ''}:${self?.battery ?? ''}:${self?.charging ?? ''}`;

  useEffect(() => {
    const tick = () => familyRef.current.rollDay(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) return;
    let dead = false;
    let battery: BatteryLike | null = null;
    const emit = () => {
      if (!battery || dead) return;
      const pct = Math.round(battery.level * 100);
      if (!Number.isFinite(pct)) return;
      familyRef.current.setBattery(Math.min(100, Math.max(0, pct)), battery.charging);
    };
    void nav.getBattery().then((next) => {
      if (dead) return;
      battery = next;
      next.addEventListener('levelchange', emit);
      next.addEventListener('chargingchange', emit);
      emit();
    }).catch(() => undefined);
    const timer = window.setInterval(emit, 60_000);
    return () => {
      dead = true;
      window.clearInterval(timer);
      battery?.removeEventListener('levelchange', emit);
      battery?.removeEventListener('chargingchange', emit);
    };
  }, []);

  useEffect(() => {
    if (!umapLocationNative()) return;
    let dead = false;
    const pull = () => {
      void readNativeBattery().then((battery) => {
        if (dead || battery.pct == null) return;
        familyRef.current.setBattery(battery.pct, battery.charging);
      });
    };
    pull();
    const timer = window.setInterval(pull, 60_000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!trackingOn) return;
    if (nativeKeeps && !appVisible) return;
    const apply = (fix: AcceptedFix) => {
      familyRef.current.updateSelf(fix.lat, fix.lng, fix.accuracy, fix.speedMps);
      if (!centered.current) {
        centered.current = true;
        onFirstFixRef.current(fix.lat, fix.lng);
      }
      setWaiting((current) => (current === null ? current : null));
    };
    return startLocationWatch({
      precise,
      onFix: apply,
      onWaiting: (reason) => setWaiting(reason ? WAITING_KO[reason] ?? null : null),
    });
  }, [appVisible, nativeKeeps, precise, trackingOn]);

  useEffect(() => {
    if (!trackingOn || !umapLocationNative()) return;
    let remove = () => {};
    void umapLocation.addListener('fix', (fix) => {
      const speed = typeof fix.speedMps === 'number' ? fix.speedMps : null;
      familyRef.current.updateSelf(fix.lat, fix.lng, fix.accuracyM || 1, speed);
      if (!centered.current) {
        centered.current = true;
        onFirstFixRef.current(fix.lat, fix.lng);
      }
    }).then((handle) => {
      remove = () => { void handle.remove(); };
    }).catch(() => undefined);
    return () => remove();
  }, [trackingOn]);

  useEffect(() => {
    if (state.mode !== 'managed') return;
    const name = (state.profile?.name || self?.name || '가족').trim().slice(0, 80) || '가족';
    const nextTokens: Record<string, string> = {};
    for (const link of state.guardians) {
      if (link.syncToken) nextTokens[link.code] = link.syncToken;
    }
    for (const [code, token] of Object.entries(sharedTokens.current)) {
      if (nextTokens[code]) continue;
      publishSharedPlace({ code, name, lat: null, lng: null, accuracyM: 0, at: Date.now(), sharing: false }, token);
    }
    sharedTokens.current = nextTokens;
    const located = self && hasLocation(self) ? self : null;
    for (const link of state.guardians) {
      const sharing = link.share === 'allowed';
      const remote = link.syncToken && (sharing || link.share === 'revoked') ? link.syncToken : null;
      // No fix yet: do not publish a newer empty point. That used to replace the native service's coordinates.
      if (sharing && !located) continue;
      const publishedName = (link.rosterName || name).trim().slice(0, 80) || name;
      publishSharedPlace({
        code: link.code,
        name: publishedName,
        lat: sharing && located ? located.lat : null,
        lng: sharing && located ? located.lng : null,
        accuracyM: located?.accuracyM ?? 0,
        at: Date.now(),
        sharing,
        batteryPct: sharing ? (self?.battery ?? null) : null,
        charging: sharing ? (self?.charging ?? null) : null,
      }, remote);
    }
  }, [selfPublishKey, state.guardians, state.mode, state.profile?.name]);

  useEffect(() => {
    if (state.mode !== 'admin') return;
    let cancel = false;
    const name = (state.profile?.name || self?.name || '가족').trim().slice(0, 80) || '가족';
    const share = state.shareSelfWithFamily;
    const located = self && hasLocation(self) ? self : null;
    if (!share) setFamilyShareNote(null);
    if (!share && !adminShared.current) return;
    if (share && !located) return;
    const sending = share && !!located;
    void syncTokenFor(state.syncWriteKey, state.syncReadKey).then(async (token) => {
      if (cancel || !splitSyncToken(token)) return;
      const ready = await familyEndpointAvailable(state.inviteCode, token);
      if (cancel) return;
      if (!ready) {
        setFamilyShareNote(share ? '가족 위치 서버를 갱신하기 전에는 피관리자 화면으로 내 위치를 보내지 않습니다. 이 폰 지도에는 내 위치가 그대로 보입니다.' : null);
        return;
      }
      setFamilyShareNote(null);
      publishSharedPlace({
        code: state.inviteCode,
        name,
        lat: sending && located ? located.lat : null,
        lng: sending && located ? located.lng : null,
        accuracyM: located?.accuracyM ?? 0,
        at: Date.now(),
        sharing: sending,
        audience: 'family',
        batteryPct: sending ? located?.battery ?? null : null,
        charging: sending ? located?.charging ?? null : null,
      }, token);
      adminShared.current = share;
    });
    return () => {
      cancel = true;
    };
  }, [selfPublishKey, state.inviteCode, state.mode, state.profile?.name, state.shareSelfWithFamily, state.syncReadKey, state.syncWriteKey]);

  const keepKey = [
    state.mode,
    state.permissions.locationMode,
    state.permissions.accuracy,
    state.backgroundKeepAlive,
    state.shareSelfWithFamily,
    state.profile?.name ?? '',
    state.inviteCode,
    state.syncWriteKey,
    state.syncReadKey,
    state.guardians.map((link) => `${link.code}:${link.share}:${link.syncToken ?? ''}`).join('|'),
  ].join('~');

  const syncKeepAlive = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    syncKeepAlive.current = async () => {
      const current = familyRef.current.state;
      const status = await umapLocation.status().catch(() => ({ running: false, userStopped: false, native: false as const }));
      if (status.userStopped) {
        if (familyRef.current.state.backgroundKeepAlive) familyRef.current.setKeepAlive(false);
        await umapLocation.ackStopped().catch(() => undefined);
        await umapLocation.stop().catch(() => undefined);
        return;
      }
      const wanted = current.permissions.locationMode === 'always' && current.backgroundKeepAlive;
      const base = familySyncUrl();
      if (!wanted || !base || !umapLocationNative()) {
        if (status.running) await umapLocation.stop().catch(() => undefined);
        return;
      }
      const targets: KeepAliveTarget[] = [];
      if (current.mode === 'managed') {
        for (const link of current.guardians) {
          if (!link.syncToken || !splitSyncToken(link.syncToken)) continue;
          if (link.share !== 'allowed' && link.share !== 'revoked') continue;
          targets.push({ token: link.syncToken, code: link.code, audience: 'admin', sharing: link.share === 'allowed' });
        }
      }
      if (current.mode === 'admin' && (current.shareSelfWithFamily || nativeAdminShared.current)) {
        const token = await syncTokenFor(current.syncWriteKey, current.syncReadKey);
        if (splitSyncToken(token) && await familyEndpointAvailable(current.inviteCode, token)) {
          targets.push({ token, code: current.inviteCode, audience: 'family', sharing: current.shareSelfWithFamily });
          nativeAdminShared.current = current.shareSelfWithFamily;
        }
      }
      if (targets.length === 0) {
        if (status.running) await umapLocation.stop().catch(() => undefined);
        return;
      }
      const config: Parameters<typeof JSON.stringify>[0] = {
        baseUrl: base,
        name: (current.profile?.name || '가족').trim().slice(0, 80) || '가족',
        precise: current.permissions.accuracy === 'precise',
        targets,
      };
      await umapLocation.start({ config: JSON.stringify(config) }).catch(() => undefined);
    };
  }, [keepKey]);

  useEffect(() => {
    void syncKeepAlive.current();
    const onVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void syncKeepAlive.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('resume', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('resume', onVisible);
    };
  }, [keepKey]);

  const familyLinkKey = state.mode === 'managed' ? state.guardians.map((link) => `${link.code}:${link.syncToken ?? ''}`).join('|') : '';
  useEffect(() => {
    if (state.mode !== 'managed') return;
    const links = familyRef.current.state.guardians
      .filter((link) => link.syncToken)
      .map((link) => ({ code: link.code, token: link.syncToken as string }));
    return startManagedFamilySync(links, (code, places) => {
      remoteRooms.current[code] = places;
      familyRef.current.setRoomFamilyPlaces(code, places);
    });
  }, [familyLinkKey, state.mode]);

  useEffect(() => {
    if (state.mode !== 'managed') return;
    const apply = () => {
      const grouped = new Map<string, SharedPlace[]>();
      for (const place of readSharedPlaces()) {
        if (place.audience !== 'family' || !place.sharing || place.lat == null || place.lng == null) continue;
        const list = grouped.get(place.code) ?? [];
        list.push(place);
        grouped.set(place.code, list);
      }
      for (const [code, places] of grouped) {
        if (remoteRooms.current[code]) continue;
        familyRef.current.setRoomFamilyPlaces(code, places);
      }
    };
    apply();
    return subscribeSharedPlaces(apply);
  }, [state.mode]);

  useEffect(() => {
    const now = Date.now();
    for (const [memberId, points] of Object.entries(state.tracks)) {
      familyRef.current.mergeVisits(memberId, buildDayRecord(points, now).stops);
    }
  }, [state.tracks, state.trailDay]);

  useEffect(() => {
    if (!vworldApiKey()) return;
    let pending: { memberId: string; id: string; lat: number; lng: number } | null = null;
    for (const [memberId, list] of Object.entries(state.visits)) {
      for (const visit of list) {
        if (!visit.label && !triedGeocode.current.has(visit.id)) {
          pending = { memberId, id: visit.id, lat: visit.lat, lng: visit.lng };
          break;
        }
      }
      if (pending) break;
    }
    if (!pending) return;
    const next = pending;
    triedGeocode.current.add(next.id);
    let cancel = false;
    void reverseGeocode(next.lat, next.lng).then((label) => {
      if (!cancel && label) familyRef.current.setVisitLabel(next.memberId, next.id, label);
    });
    return () => {
      cancel = true;
    };
  }, [state.visits]);

  useEffect(() => {
    if (!vworldApiKey()) return;
    let pending: { memberId: string; id: string; which: 'start' | 'end'; lat: number; lng: number } | null = null;
    for (const [memberId, list] of Object.entries(state.journeys ?? {})) {
      for (const journey of list) {
        for (const which of ['start', 'end'] as const) {
          const place = journey[which];
          const key = `${memberId}:${journey.id}:${which}`;
          if (!place?.label && !triedGeocode.current.has(key)) {
            pending = { memberId, id: journey.id, which, lat: place.lat, lng: place.lng };
            break;
          }
        }
        if (pending) break;
      }
      if (pending) break;
    }
    if (!pending) return;
    const next = pending;
    triedGeocode.current.add(`${next.memberId}:${next.id}:${next.which}`);
    let cancel = false;
    void reverseGeocode(next.lat, next.lng).then((label) => {
      if (!cancel && label) familyRef.current.setJourneyLabel(next.memberId, next.id, next.which, label);
    });
    return () => {
      cancel = true;
    };
  }, [state.journeys]);

  return { waiting, familyShareNote, native: umapLocationNative(), openSettings: openAlwaysLocation };
}
