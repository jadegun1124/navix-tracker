import { isFreshFix, judgeTrackFix, type FixSample } from '../lib/activity';

export interface LiveFix {
  lat: number;
  lng: number;
  accuracyM: number;
  at: number;
  speedMps: number | null;
  heartbeat: boolean;
}

export function startFamilyWatch(options: {
  precise: boolean;
  pullHistory?: () => Promise<FixSample[]>;
  onFix: (fix: LiveFix) => void;
}): () => void {
  if (!navigator.geolocation) return () => {};
  let stopped = false;
  let watchId: number | null = null;
  let last: { lat: number; lng: number; at: number } | null = null;
  let lastEmitAt = 0;
  let retryTimer = 0;

  const emit = (fix: FixSample, fresh: boolean) => {
    if (fresh && !isFreshFix(fix.at, Date.now())) return;
    const judged = judgeTrackFix(last, fix);
    if (!judged.ok) return;
    if (judged.heartbeat && lastEmitAt > 0 && fix.at - lastEmitAt < 45_000) {
      last = { lat: judged.lat, lng: judged.lng, at: fix.at };
      return;
    }
    last = { lat: judged.lat, lng: judged.lng, at: fix.at };
    lastEmitAt = fix.at;
    options.onFix({
      lat: judged.lat,
      lng: judged.lng,
      accuracyM: Math.max(1, Math.round(fix.accuracyM || 1)),
      at: fix.at,
      speedMps: judged.speedMps,
      heartbeat: judged.heartbeat,
    });
  };

  const onPosition = (position: GeolocationPosition) => {
    emit(
      {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        at: position.timestamp || Date.now(),
        accuracyM: position.coords.accuracy || 50,
        speedMps: typeof position.coords.speed === 'number' && position.coords.speed >= 0 ? position.coords.speed : null,
      },
      true,
    );
  };

  const arm = () => {
    if (stopped || !navigator.geolocation) return;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(onPosition, () => {
      if (stopped) return;
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(arm, 4000);
    }, {
      enableHighAccuracy: options.precise,
      maximumAge: 0,
      timeout: 20_000,
    });
  };

  void (async () => {
    if (!options.pullHistory) return;
    try {
      const backlog = await options.pullHistory();
      backlog.sort((left, right) => left.at - right.at);
      for (const point of backlog) {
        if (!stopped) emit(point, false);
      }
    } catch {
      /* 네이티브 버퍼가 없으면 라이브 위치만 씁니다. */
    }
  })();

  arm();
  navigator.geolocation.getCurrentPosition(onPosition, () => undefined, {
    enableHighAccuracy: options.precise,
    maximumAge: 0,
    timeout: 20_000,
  });
  const poll = window.setInterval(() => {
    if (stopped || document.visibilityState === 'hidden') return;
    navigator.geolocation.getCurrentPosition(onPosition, () => undefined, {
      enableHighAccuracy: options.precise,
      maximumAge: 0,
      timeout: 15_000,
    });
  }, 45_000);
  const onVisible = () => {
    if (document.visibilityState === 'visible') arm();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', arm);
  window.addEventListener('focus', arm);
  return () => {
    stopped = true;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    window.clearInterval(poll);
    window.clearTimeout(retryTimer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', arm);
    window.removeEventListener('focus', arm);
  };
}
