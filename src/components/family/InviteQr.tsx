import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

export function InviteQrImage({ text }: { text: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancel = false;
    QRCode.toDataURL(text, { width: 280, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then((value) => {
        if (!cancel) setUrl(value);
      })
      .catch(() => {
        if (!cancel) setUrl('');
      });
    return () => {
      cancel = true;
    };
  }, [text]);
  if (!url) return <p className="mt-3 text-center text-xs text-slate-400">QR을 만드는 중</p>;
  return <img src={url} alt="가족 초대 QR" className="mx-auto mt-3 h-44 w-44 rounded-xl border border-slate-100" />;
}

interface DetectedBarcode {
  rawValue?: string;
}

export function InviteQrScan({ onText }: { onText: (value: string) => void }) {
  const [phase, setPhase] = useState<'idle' | 'ask' | 'live' | 'unsupported'>('idle');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (phase !== 'live' || !videoRef.current) return;
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> } }).BarcodeDetector;
    if (!Detector) return;
    let cancel = false;
    const detector = new Detector({ formats: ['qr_code'] });
    let timer = 0;
    const scan = async () => {
      if (cancel || !videoRef.current || videoRef.current.readyState < 2) {
        timer = window.setTimeout(() => void scan(), 300);
        return;
      }
      try {
        const codes = await detector.detect(videoRef.current);
        const value = codes[0]?.rawValue;
        if (value) {
          onText(value);
          setPhase('idle');
          return;
        }
      } catch {
        /* 다음 프레임에서 다시 읽습니다 */
      }
      timer = window.setTimeout(() => void scan(), 300);
    };
    void scan();
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [onText, phase]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('unsupported');
      return;
    }
    if (typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector !== 'function') {
      setPhase('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setPhase('live');
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch {
      setError('카메라를 열지 못했습니다. 초대 링크를 붙여 넣어도 됩니다.');
      setPhase('idle');
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setPhase('idle');
  };

  return (
    <div className="mt-3">
      {phase === 'idle' && (
        <button type="button" onClick={() => setPhase('ask')} className="w-full rounded-full bg-slate-100 py-2 text-xs font-bold">
          QR 스캔
        </button>
      )}
      {phase === 'ask' && (
        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
          <p>초대 QR을 읽으려면 카메라가 필요합니다. 위치와는 따로이며, 스캔이 끝나면 카메라를 끕니다. 전화번호는 읽지 않습니다.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => void startCamera()} className="flex-1 rounded-full bg-[#0084FF] py-2 font-bold text-white">
              카메라 사용
            </button>
            <button type="button" onClick={() => setPhase('idle')} className="rounded-full bg-white px-3 py-2 font-bold text-slate-500">
              취소
            </button>
          </div>
        </div>
      )}
      {phase === 'live' && (
        <div>
          <video ref={videoRef} className="mt-2 h-48 w-full rounded-2xl bg-slate-900 object-cover" muted playsInline />
          <button type="button" onClick={stop} className="mt-2 w-full rounded-full bg-slate-100 py-2 text-xs font-bold">
            스캔 멈추기
          </button>
        </div>
      )}
      {phase === 'unsupported' && <p className="mt-2 text-xs leading-5 text-slate-500">이 기기는 QR 카메라 스캔을 지원하지 않습니다. 초대 링크를 붙여 넣거나 코드를 입력하세요.</p>}
      {error && <p className="mt-2 text-xs font-semibold text-amber-700">{error}</p>}
    </div>
  );
}
