import { X } from 'lucide-react';
import { alwaysAllowSteps, alwaysAllowWhy } from '../../lib/alwaysAllowGuide.mjs';

export function AlwaysAllowGuide({
  native,
  busy,
  note,
  onOpenSettings,
  onBattery,
  onClose,
}: {
  native: boolean;
  busy: boolean;
  note?: string | null;
  onOpenSettings: () => void;
  onBattery: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[70] flex items-end bg-slate-900/40">
      <div role="dialog" aria-labelledby="always-allow-title" className="max-h-[88%] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 id="always-allow-title" className="text-xl font-black leading-snug">항상 허용하는 방법</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-base font-semibold leading-7 text-slate-700">{alwaysAllowWhy()}</p>
        <ol className="mt-4 space-y-3">
          {alwaysAllowSteps().map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0084FF] text-sm font-black text-white">{index + 1}</span>
              <span className="pt-0.5 text-base font-semibold leading-7 text-slate-800">{step}</span>
            </li>
          ))}
        </ol>
        {!native && (
          <p className="mt-4 text-sm font-semibold leading-6 text-slate-500">
            이 화면은 브라우저입니다. 항상 허용은 안드로이드 앱의 위치 권한 화면에서 고릅니다. 아래 버튼은 위치 허용 창만 엽니다.
          </p>
        )}
        {note && <p className="mt-3 text-sm font-semibold leading-6 text-amber-800">{note}</p>}
        <button type="button" disabled={busy} onClick={onOpenSettings} className="mt-5 w-full rounded-full bg-[#0084FF] py-3.5 text-base font-black text-white disabled:opacity-40">
          {busy ? '여는 중…' : native ? '위치 액세스 권한 열기' : '위치 허용 창 열기'}
        </button>
        {native && (
          <button type="button" disabled={busy} onClick={onBattery} className="mt-2 w-full rounded-full bg-slate-100 py-3.5 text-base font-bold text-slate-800 disabled:opacity-40">
            배터리 제한 없음
          </button>
        )}
        <button type="button" onClick={onClose} className="mt-2 w-full py-3 text-sm font-bold text-slate-500">
          닫기
        </button>
      </div>
    </div>
  );
}

export function AlwaysAllowMapHint({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="absolute left-3 right-16 top-[4.25rem] z-30 rounded-2xl bg-white px-3 py-2.5 shadow-md">
      <p className="text-sm font-bold leading-5 text-slate-800">앱을 닫으면 가족 지도에 안 보일 수 있습니다.</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <button type="button" onClick={onOpen} className="text-sm font-black text-[#0084FF]">항상 허용 방법</button>
        <button type="button" onClick={onDismiss} className="text-sm font-bold text-slate-400">닫기</button>
      </div>
    </div>
  );
}
