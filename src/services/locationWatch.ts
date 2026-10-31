import { acceptFix, type AcceptedFix } from '../lib/tracking.mjs';

export function startLocationWatch(options: {
  precise: boolean;
  onFix: (fix: AcceptedFix) => void;
  onWaiting: (reason: 'coords' | 'stale' | 'accuracy' | 'jump' | 'denied' | 'retry' | null) => void;
}): () => void {
  if (!navigator.geolocation) {
    options.onWaiting('denied');
    return () => {};
  }
  let stopped = false;
  let watchId = 0;
  let timer = 0;
  let last: { lat: number; lng: number; at: number } | null = null;
  let receivedAt = 0;
  let coarseAt = 0;

  const accept = (position: GeolocationPosition, precise: boolean) => {
    const speed = position.coords.speed;
    const decision = acceptFix(last, {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      at: position.timestamp,
      speedMps: typeof speed === 'number' ? speed : null,
    }, { precise, now: Date.now() });
    if (!decision.ok) {
      // A precise watch above 80m used to request a network fix and then
      // reject it with the same 80m gate, so the morning pin never moved.
      if (precise && decision.reason === 'accuracy' && Date.now() - coarseAt > 15_000) {
        coarseAt = Date.now();
        navigator.geolocation.getCurrentPosition(
          (coarse) => accept(coarse, false),
          () => {},
          { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
        );
      }
      if (Date.now() - receivedAt > 20_000) options.onWaiting(decision.reason);
      return;
    }
    last = decision.fix;
    receivedAt = Date.now();
    options.onWaiting(null);
    options.onFix(decision.fix);
  };

  const handle = (position: GeolocationPosition) => accept(position, options.precise);

  const once = () => {
    if (stopped) return;
    navigator.geolocation.getCurrentPosition(handle, () => {
      if (Date.now() - receivedAt > 20_000) options.onWaiting('retry');
    }, {
      enableHighAccuracy: options.precise,
      maximumAge: 0,
      timeout: 20_000,
    });
  };

  const startWatch = () => {
    if (stopped) return;
    if (watchId) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(handle, () => {
      if (Date.now() - receivedAt > 20_000) options.onWaiting('denied');
    }, {
      enableHighAccuracy: options.precise,
      maximumAge: 0,
      timeout: 20_000,
    });
  };

  const wake = () => {
    if (stopped || document.visibilityState === 'hidden') return;
    if (Date.now() - receivedAt > 90_000) startWatch();
    once();
  };

  startWatch();
  once();
  timer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    once();
  }, 30_000);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);
  document.addEventListener('resume', wake);

  return () => {
    stopped = true;
    if (watchId) navigator.geolocation.clearWatch(watchId);
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('focus', wake);
    window.removeEventListener('pageshow', wake);
    document.removeEventListener('resume', wake);
  };
}
