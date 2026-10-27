import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { cameraDenialAction, cameraScanPlan } from '../../lib/cameraScan.mjs';
import { requestCameraPermission, umapLocationNative } from '../../services/umapLocation';

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

type ScanPhase = 'idle' | 'ask' | 'live' | 'denied' | 'unsupported';

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function deniedError(error: unknown): boolean {
  if (!(error instanceof DOMException) && !(error instanceof Error)) return false;
  return error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || error.name === 'SecurityError';
}

async function browserCameraState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const permissions = navigator.permissions;
    if (!permissions?.query) return 'unknown';
    const status = await permissions.query({ name: 'camera' as PermissionName });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') return status.state;
  } catch {
    /* Safari does not expose the camera permission name. */
  }
  return 'unknown';
}

async function openCameraStream(): Promise<MediaStream> {
  const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (!getUserMedia) throw new Error('camera');
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true, audio: false },
  ];
  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await withTimeout(getUserMedia(constraints), 12000);
    } catch (error) {
      last = error;
      if (deniedError(error) || (error instanceof Error && error.message === 'timeout')) throw error;
    }
  }
  throw last instanceof Error ? last : new Error('camera');
}

function denialCopy(action: 'settings' | 'browser-blocked' | 'retry'): string {
  if (action === 'settings') return '카메라 권한을 다시 물을 수 없어 설정 화면을 열었습니다. 카메라를 허용한 뒤 다시 눌러 주세요.';
  if (action === 'browser-blocked') return '브라우저에서 카메라가 차단되어 있습니다. 주소창의 사이트 설정에서 카메라를 허용해 주세요. 초대 코드나 링크를 붙여 넣어도 됩니다.';
  return '카메라를 허용하지 않으면 초대 QR을 읽지 못합니다. 다시 허용하거나 코드와 링크를 붙여 넣으세요. 전화번호는 읽지 않습니다.';
}

function readJsQr(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const maxWidth = 480;
  const scale = width > maxWidth ? maxWidth / width : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, targetWidth, targetHeight);
  const image = context.getImageData(0, 0, targetWidth, targetHeight);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

export function InviteQrScan({ onText }: { onText: (value: string) => void }) {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<'barcode-detector' | 'jsqr' | 'none'>('none');

  const stop = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setBusy(false);
    setPhase('idle');
  };

  useEffect(() => () => {
    stopStream(streamRef.current);
  }, []);

  useEffect(() => {
    if (phase !== 'live') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'live' || !videoRef.current) return;
    const Detector = (window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
    }).BarcodeDetector;
    const detector = decoderRef.current === 'barcode-detector' && Detector ? new Detector({ formats: ['qr_code'] }) : null;
    let cancel = false;
    let timer = 0;
    const scan = async () => {
      if (cancel || !videoRef.current || videoRef.current.readyState < 2) {
        timer = window.setTimeout(() => void scan(), 300);
        return;
      }
      try {
        let value = '';
        if (detector) {
          try {
            const codes = await detector.detect(videoRef.current);
            value = codes[0]?.rawValue ?? '';
          } catch {
            value = '';
          }
        }
        if (!value && canvasRef.current) value = readJsQr(videoRef.current, canvasRef.current) ?? '';
        if (value) {
          stopStream(streamRef.current);
          streamRef.current = null;
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
    setError('');
    setBusy(true);
    const native = umapLocationNative();
    const hasUserMedia = typeof navigator.mediaDevices?.getUserMedia === 'function';
    const hasBarcodeDetector = typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector === 'function';
    const plan = cameraScanPlan({ native, hasUserMedia, hasBarcodeDetector });
    decoderRef.current = plan.decoder;
    if (plan.open === 'unsupported') {
      setBusy(false);
      setPhase('unsupported');
      return;
    }
    if (plan.permission === 'android-runtime') {
      const result = await requestCameraPermission();
      if (result.state === 'denied') {
        const action = cameraDenialAction({ native: true, openedSettings: result.openedSettings, browserPermission: 'unknown' });
        setError(denialCopy(action));
        setBusy(false);
        setPhase('denied');
        return;
      }
    }
    try {
      const stream = await openCameraStream();
      streamRef.current = stream;
      setBusy(false);
      setPhase('live');
    } catch (error) {
      const browserPermission = native ? 'unknown' : await browserCameraState();
      const blocked = deniedError(error) || (error instanceof Error && error.message === 'timeout');
      const action = blocked
        ? cameraDenialAction({ native, openedSettings: false, browserPermission })
        : 'retry';
      setError(action === 'retry' && !deniedError(error)
        ? '카메라를 열지 못했습니다. 초대 링크를 붙여 넣어도 됩니다.'
        : denialCopy(action));
      setBusy(false);
      setPhase('denied');
    }
  };

  return (
    <div className="mt-3">
      <canvas ref={canvasRef} className="hidden" />
      {phase === 'idle' && (
        <button type="button" onClick={() => { setError(''); setPhase('ask'); }} className="w-full rounded-full bg-slate-100 py-2 text-xs font-bold">
          QR 스캔
        </button>
      )}
      {(phase === 'ask' || phase === 'denied') && (
        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
          <p>초대 QR을 읽으려면 카메라가 필요합니다. 위치와는 따로이며, 스캔이 끝나면 카메라를 끕니다. 전화번호는 읽지 않습니다.</p>
          {error && <p className="mt-2 font-semibold text-amber-800">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void startCamera()} className="flex-1 rounded-full bg-[#0084FF] py-2 font-bold text-white disabled:opacity-40">
              {busy ? '카메라 여는 중…' : '카메라 사용'}
            </button>
            <button type="button" disabled={busy} onClick={() => { setError(''); setPhase('idle'); }} className="rounded-full bg-white px-3 py-2 font-bold text-slate-500">
              취소
            </button>
          </div>
        </div>
      )}
      {phase === 'live' && (
        <div>
          <p className="text-xs font-semibold text-slate-500">초대 QR을 화면에 맞춰 주세요. 스캔이 끝나면 카메라를 끕니다.</p>
          <video ref={videoRef} className="mt-2 h-48 w-full rounded-2xl bg-slate-900 object-cover" muted autoPlay playsInline />
          <button type="button" onClick={stop} className="mt-2 w-full rounded-full bg-slate-100 py-2 text-xs font-bold">
            스캔 멈추기
          </button>
        </div>
      )}
      {phase === 'unsupported' && <p className="mt-2 text-xs leading-5 text-slate-500">이 기기에서는 카메라를 열 수 없습니다. 초대 링크를 붙여 넣거나 코드를 입력하세요.</p>}
    </div>
  );
}
