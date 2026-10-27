import type { PermissionState } from '../../types/family';

export function AlwaysAllowNotice({
  locationMode,
  keepAlive,
  native,
  onOpenSettings,
  onBattery,
  onStart,
  onStop,
  note,
}: {
  locationMode: PermissionState['locationMode'];
  keepAlive: boolean;
  native: boolean;
  onOpenSettings: () => void;
  onBattery: () => void;
  onStart: () => void;
  onStop: () => void;
  note?: string | null;
}) {
  const live = locationMode === 'always' && keepAlive;
  return (
    <div className="mb-2 rounded-2xl bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-700">{live ? '위치 유지 켜짐' : '위치 유지'}</p>
        <div className="flex flex-wrap justify-end gap-2">
          {live ? (
            <button type="button" onClick={onStop} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">
              끄기
            </button>
          ) : (
            <button type="button" onClick={onOpenSettings} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">
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
              위치 유지 알림 켜기
            </button>
          )}
        </div>
      </div>
      {note && <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{note}</p>}
    </div>
  );
}
