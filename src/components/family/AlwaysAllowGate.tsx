import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import {
  GATE_BODY,
  GATE_BUTTON,
  GATE_OPEN_FAILED,
  GATE_OPENING,
  GATE_TITLE,
  needsAlwaysAllowGate,
} from '../../lib/alwaysAllowGate.mjs';
import { listenAppResume, openAlwaysAllowGate, readLocationSnapshot } from '../../services/umapLocation';
import type { PermissionState } from '../../types/family';
import { useFamily } from './session';

type GateStatus = 'checking' | 'blocked' | 'clear';

function applySnapshot(
  snapshot: Awaited<ReturnType<typeof readLocationSnapshot>>,
  noteLocation: (locationMode: PermissionState['locationMode'], accuracy: PermissionState['accuracy']) => void,
): boolean {
  const blocked = needsAlwaysAllowGate({ native: true, location: snapshot.location, precise: snapshot.precise });
  if (snapshot.location === 'always' || snapshot.location === 'while-using' || snapshot.location === 'denied') {
    noteLocation(snapshot.location, snapshot.precise === false ? 'approximate' : 'precise');
  }
  return blocked;
}

export function AlwaysAllowGate() {
  const family = useFamily();
  const noteRef = useRef(family.noteLocation);
  useEffect(() => {
    noteRef.current = family.noteLocation;
  }, [family.noteLocation]);
  const [status, setStatus] = useState<GateStatus>('checking');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (status === 'clear') {
      delete window.__umapAlwaysAllowGate;
      return;
    }
    window.__umapAlwaysAllowGate = true;
    return () => {
      delete window.__umapAlwaysAllowGate;
    };
  }, [status]);

  useEffect(() => {
    let stop = false;
    const refresh = () => {
      void readLocationSnapshot().then((snapshot) => {
        if (stop) return;
        setStatus(applySnapshot(snapshot, noteRef.current) ? 'blocked' : 'clear');
      });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    let removeResume = () => {};
    void listenAppResume(refresh).then((remove) => {
      if (stop) remove();
      else removeResume = remove;
    });
    const timeout = window.setTimeout(() => {
      setStatus((current) => (current === 'checking' ? 'blocked' : current));
    }, 4000);
    return () => {
      stop = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      removeResume();
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (status !== 'blocked') return;
    const blockEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', blockEscape, true);
    buttonRef.current?.focus();
    return () => window.removeEventListener('keydown', blockEscape, true);
  }, [status]);

  const openSettings = () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    void openAlwaysAllowGate().then((result) => readLocationSnapshot().then((snapshot) => ({ result, snapshot }))).then(({ result, snapshot }) => {
      const blocked = applySnapshot(snapshot, noteRef.current);
      setStatus(blocked ? 'blocked' : 'clear');
      if (blocked && !result.opened) setFailure(GATE_OPEN_FAILED);
      setBusy(false);
    }).catch(() => {
      setFailure(GATE_OPEN_FAILED);
      setBusy(false);
    });
  };

  if (status === 'clear') return null;
  if (status === 'checking') return <div className="fixed inset-0 z-[100]" aria-hidden />;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-white px-6 pt-16 text-slate-900"
      role="dialog"
      aria-modal="true"
      aria-labelledby="always-allow-gate-title"
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#0084FF] text-white">
          <MapPin className="h-8 w-8" />
        </div>
        <h2 id="always-allow-gate-title" className="mt-6 text-2xl font-black leading-snug">{GATE_TITLE}</h2>
        <p className="mt-3 max-w-sm text-sm font-semibold leading-6 text-slate-600">{GATE_BODY}</p>
      </div>
      <div className="pb-[max(2rem,env(safe-area-inset-bottom))]">
        {failure && <p className="mb-3 text-center text-xs font-semibold leading-5 text-slate-500">{failure}</p>}
        <button
          ref={buttonRef}
          type="button"
          disabled={busy}
          onClick={openSettings}
          className="w-full rounded-full bg-[#0084FF] py-3.5 text-base font-black text-white disabled:opacity-40"
        >
          {busy ? GATE_OPENING : GATE_BUTTON}
        </button>
      </div>
    </div>
  );
}
