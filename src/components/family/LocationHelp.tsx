import React from 'react';
import { X } from 'lucide-react';

export function LocationHelp({
  native,
  onClose,
  onOpenSettings,
  onSaveAlways,
}: {
  native: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onSaveAlways: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-slate-900/40">
      <div className="max-h-[86%] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">위치를 항상 허용으로</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          앱 사용 중에만 허용이면 화면이 꺼지거나 다음 날 앱이 종료되면 가족 지도가 어제로 남습니다. 항상 허용은 이 안내를 확인한 뒤에만 저장합니다.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>아래 버튼으로 Umap 설정을 엽니다.</li>
          <li>권한, 그다음 위치를 누릅니다.</li>
          <li>앱 사용 중에만 허용 대신 항상 허용을 고릅니다.</li>
          <li>배터리에서 제한 없음을 고르면 아침에 공유가 덜 끊깁니다.</li>
        </ol>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          {native
            ? '항상 허용이 되면 가족에게 위치를 공유하는 중이라는 알림이 켜지고, 앱을 내려 둔 동안에도 보냅니다. 앱을 강제 종료하면 안드로이드가 그 알림을 멈춥니다.'
            : '브라우저에서는 이 탭이 열려 있을 때만 갱신됩니다. 휴대폰 앱에서 항상 허용을 고르면 화면을 내려도 보냅니다.'}
        </p>
        {native && (
          <button type="button" onClick={onOpenSettings} className="mt-4 w-full rounded-full bg-slate-100 py-3 font-bold">
            설정 열기
          </button>
        )}
        <button type="button" onClick={onSaveAlways} className="mt-2 w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white">
          항상 허용으로 저장
        </button>
      </div>
    </div>
  );
}
