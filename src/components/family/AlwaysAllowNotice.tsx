import type { PermissionState } from '../../types/family';

export function AlwaysAllowNotice({
  locationMode,
  keepAlive,
  native,
  onShowGuide,
  onBattery,
  onStart,
  note,
}: {
  locationMode: PermissionState['locationMode'];
  keepAlive: boolean;
  native: boolean;
  onShowGuide: () => void;
  onBattery: () => void;
  onStart: () => void;
  note?: string | null;
}) {
  const live = locationMode === 'always' && keepAlive;
  return (
    <div className="mb-2 rounded-2xl bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-700">{live ? '위치 유지 켜짐' : '위치 유지'}</p>
        <div className="flex flex-wrap justify-end gap-2">
          {!live && (
            <button type="button" onClick={onShowGuide} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">
              {native ? '항상 허용' : '위치 허용'}
            </button>
          )}
          {native && (
            <button type="button" onClick={onBattery} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">
              배터리 제한 없음
            </button>
          )}
          {!live && locationMode === 'always' && (
            <button type="button" onClick={onStart} className="rounded-full bg-[#0084FF] px-3 py-1.5 text-[11px] font-bold text-white">
              위치 유지 켜기
            </button>
          )}
        </div>
      </div>
      {live && (
        <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
          걷는 동안만 2–3초로 촘촘히 잇습니다. 머물면 2분, 7분이 넘으면 5분으로 줄입니다.
        </p>
      )}
      {!live && locationMode !== 'always' && (
        <p className="mt-2 text-sm font-semibold leading-5 text-slate-700">
          앱을 닫으면 가족 지도에 안 보일 수 있습니다.
          <button type="button" onClick={onShowGuide} className="ml-1 font-black text-[#0084FF]">방법 보기</button>
        </p>
      )}
      {note && <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{note}</p>}
    </div>
  );
}
