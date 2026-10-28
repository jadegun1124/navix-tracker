import { useState } from 'react';
import {
  COACH_NEXT,
  OVERLAY_ALLOW,
  OVERLAY_ASK_BODY,
  OVERLAY_ASK_TITLE,
  OVERLAY_SKIP,
  PRECISE_HINT,
  WHILE_USING_DENY,
  WHILE_USING_LEAD,
  WHILE_USING_MOCK_TITLE,
  WHILE_USING_ONCE,
  WHILE_USING_OPTION,
  WHILE_USING_TITLE,
  nextAlwaysAllowAction,
  type ForegroundPhase,
} from '../../lib/alwaysAllowFlow.mjs';
import { askAlwaysLocation } from '../../services/systemPermissions';
import {
  openOverlaySettings,
  overlayPermissionGranted,
  readLocationAccess,
  requestForegroundLocation,
} from '../../services/umapLocation';

const iconSrc = `${import.meta.env.BASE_URL}umap-icon.png`;

export type AlwaysSetupResult = {
  location: 'always' | 'while-using' | 'denied' | 'unavailable';
  note: string | null;
  fallback: boolean;
};

export function AlwaysAllowSetup({
  native,
  precise,
  onClose,
  onDone,
}: {
  native: boolean;
  precise: boolean;
  onClose: () => void;
  onDone: (result: AlwaysSetupResult) => void;
}) {
  const [phase, setPhase] = useState<'coach' | 'overlay' | 'busy'>('coach');

  const openSettings = async (overlay: boolean, fallback: boolean) => {
    setPhase('busy');
    const result = await askAlwaysLocation(precise, { overlay });
    onDone({
      location: result.location,
      note: result.note,
      fallback: fallback || (overlay && !result.overlay),
    });
  };

  const continueAfter = async (foreground: ForegroundPhase) => {
    const granted = native && foreground === 'while-using' ? await overlayPermissionGranted() : false;
    const action = nextAlwaysAllowAction({
      native,
      foreground,
      overlay: granted ? 'granted' : 'unknown',
    });
    if (action === 'done') {
      onDone({ location: 'always', note: '위치 권한이 항상 허용입니다.', fallback: false });
      return;
    }
    if (action === 'stop') {
      onDone({ location: 'denied', note: '위치 허용을 거절했습니다.', fallback: false });
      return;
    }
    if (action === 'browser') {
      const result = await askAlwaysLocation(precise);
      onDone({ location: result.location, note: result.note, fallback: false });
      return;
    }
    if (action === 'settings-with-overlay') {
      await openSettings(true, false);
      return;
    }
    setPhase('overlay');
  };

  const onNext = async () => {
    setPhase('busy');
    if (!native) {
      await continueAfter('need');
      return;
    }
    let access = await readLocationAccess();
    if (access !== 'always' && access !== 'while-using') {
      const requested = await requestForegroundLocation();
      if (requested !== 'while-using') {
        await continueAfter('denied');
        return;
      }
      access = await readLocationAccess();
    }
    await continueAfter(access === 'always' ? 'always' : 'while-using');
  };

  return (
    <div className="absolute inset-0 z-[80] flex flex-col bg-white px-5 pb-8 pt-4">
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="px-2 py-1 text-sm font-bold text-slate-400" aria-label="닫기">
          닫기
        </button>
      </div>
      {phase !== 'overlay' ? (
        <div className="flex flex-1 flex-col">
          <h2 className="mt-2 text-center text-xl font-black leading-snug">{WHILE_USING_TITLE}</h2>
          <p className="mt-2 text-center text-sm font-semibold text-slate-500">{WHILE_USING_LEAD}</p>
          <div className="mx-auto mt-6 w-full max-w-sm rounded-3xl bg-slate-50 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <img src={iconSrc} alt="" className="h-8 w-8 rounded-lg" />
              <p className="text-sm font-bold leading-5 text-slate-800">{WHILE_USING_MOCK_TITLE}</p>
            </div>
            <div className="relative">
              <span className="absolute -left-1 top-1/2 -translate-y-1/2 animate-pulse text-lg font-black text-[#0084FF]" aria-hidden>»</span>
              <p className="rounded-xl bg-white px-8 py-3 text-center text-sm font-black text-[#0084FF] ring-2 ring-[#0084FF]">{WHILE_USING_OPTION}</p>
              <span className="absolute -right-1 top-1/2 -translate-y-1/2 animate-pulse text-lg font-black text-[#0084FF]" aria-hidden>«</span>
            </div>
            <p className="mt-2 py-2 text-center text-sm font-semibold text-slate-400">{WHILE_USING_ONCE}</p>
            <p className="py-2 text-center text-sm font-semibold text-slate-400">{WHILE_USING_DENY}</p>
          </div>
          <p className="mt-4 text-center text-sm font-bold text-slate-700">{PRECISE_HINT}</p>
          {!native && <p className="mt-2 text-center text-xs font-semibold text-slate-400">브라우저에서는 위치 허용 창만 열립니다.</p>}
          <button
            type="button"
            disabled={phase === 'busy'}
            onClick={() => void onNext()}
            className="mt-auto w-full rounded-full bg-[#0084FF] py-3.5 text-base font-black text-white disabled:opacity-40"
          >
            {phase === 'busy' ? '여는 중…' : COACH_NEXT}
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <h2 className="mt-6 text-center text-xl font-black">{OVERLAY_ASK_TITLE}</h2>
          <p className="mt-3 text-center text-sm font-semibold leading-6 text-slate-600">{OVERLAY_ASK_BODY}</p>
          <p className="mt-2 text-center text-sm font-bold text-slate-700">{PRECISE_HINT}</p>
          <div className="mt-auto space-y-2">
            <button
              type="button"
              onClick={() => {
                setPhase('busy');
                void (async () => {
                  await openOverlaySettings();
                  const granted = await overlayPermissionGranted();
                  await openSettings(granted, !granted);
                })();
              }}
              className="w-full rounded-full bg-[#0084FF] py-3.5 text-base font-black text-white"
            >
              {OVERLAY_ALLOW}
            </button>
            <button
              type="button"
              onClick={() => void openSettings(false, true)}
              className="w-full py-3 text-sm font-bold text-slate-500"
            >
              {OVERLAY_SKIP}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
