import type { PermissionState } from '../../types/family';

export function AlwaysAllowNotice({
  locationMode,
  keepAlive,
  native,
  onOpenSettings,
  onStart,
  onStop,
  onReview,
}: {
  locationMode: PermissionState['locationMode'];
  keepAlive: boolean;
  native: boolean;
  onOpenSettings: () => void;
  onStart: () => void;
  onStop: () => void;
  onReview: () => void;
}) {
  if (locationMode === 'always' && keepAlive) {
    return (
      <div className="mb-3 rounded-2xl bg-blue-50 px-3 py-3 text-xs leading-5 text-slate-700">
        <p className="font-bold text-slate-900">위치 유지 알림이 켜져 있습니다.</p>
        <p className="mt-1">알림이 떠 있는 동안 앱을 닫아도 동의한 가족에게 위치를 보냅니다. 권한은 설정에서만 바뀝니다.</p>
        <button type="button" onClick={onStop} className="mt-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">
          위치 유지 끄기
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-2xl bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-950">
      <p className="font-bold">다음날에도 위치를 받으려면 항상 허용이 필요합니다.</p>
      <p className="mt-1">
        앱을 쓰는 동안에만 허용하면 화면이 꺼지거나 다음 날 앱이 뒤에 있을 때 갱신이 멈출 수 있습니다. Umap은 위치 권한을 대신 바꾸지 않습니다. 설정 &gt; 앱 &gt; Umap &gt; 권한 &gt; 위치에서 <b>항상 허용</b>을 직접 고르세요. 제조사 절전으로 꺼지면 배터리에서 제한 없음도 확인하세요.
      </p>
      {!native && <p className="mt-1">브라우저에서는 이 탭이 열려 있는 동안만 갱신됩니다. 앱 설정은 안드로이드 앱에서 열립니다.</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onOpenSettings} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">
          앱 설정 열기
        </button>
        <button type="button" onClick={onReview} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">
          권한 안내
        </button>
        {locationMode === 'always' && (
          <button type="button" onClick={onStart} className="rounded-full bg-[#0084FF] px-3 py-1.5 text-[11px] font-bold text-white">
            {native ? '위치 유지 알림 켜기' : '항상 허용 선호 저장'}
          </button>
        )}
      </div>
    </div>
  );
}
