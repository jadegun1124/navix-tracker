import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Smartphone, Copy, Check, ExternalLink, ShieldCheck, QrCode as QrIcon } from 'lucide-react';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPhone?: string;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  onClose,
  targetPhone = '010-1234-5678',
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Generate current URL with mobile view param
  const currentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?view=mobile-app&phone=${encodeURIComponent(targetPhone)}`
    : 'https://umap.io?view=mobile-app';

  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(currentUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('[QR Code Generation Error]', err));
  }, [isOpen, currentUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 flex flex-col items-center relative animate-in zoom-in-95">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
          <QrIcon className="w-6 h-6" />
        </div>

        <h3 className="text-base font-black text-slate-900 text-center mb-1">
          스마트폰으로 위치추적 앱 열기
        </h3>
        <p className="text-xs text-slate-500 text-center mb-5 px-4">
          스마트폰 기본 카메라로 아래 QR 코드를 스캔하면 고정밀 GPS 트래커가 즉시 실행됩니다.
        </p>

        {/* QR Code Display Container */}
        <div className="p-4 bg-white rounded-2xl border-2 border-slate-100 shadow-inner flex items-center justify-center mb-5">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="모바일 위치추적 앱 QR코드"
              className="w-48 h-48 block rounded-lg"
            />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
              QR 생성 중...
            </div>
          )}
        </div>

        {/* Feature Highlights */}
        <div className="w-full bg-slate-50 rounded-2xl p-3 mb-5 border border-slate-100 text-[11px] text-slate-600 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>오차 반경 50m 초과 좌표 자동 폐기</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>정지 중 5m 미만 센서 노이즈 필터링</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>칼만 필터 2D 좌표 스무딩 적용</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex gap-2">
          <button
            onClick={handleCopyLink}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? '링크 복사됨' : 'URL 복사'}</span>
          </button>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <ExternalLink className="w-4 h-4" />
            <span>새 탭에서 열기</span>
          </a>
        </div>
      </div>
    </div>
  );
};
