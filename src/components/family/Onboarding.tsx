import React, { useEffect, useRef, useState } from 'react';
import { Bell, BatteryCharging, ChevronLeft, Footprints, MapPin, Shield, UserRound, Users } from 'lucide-react';
import { decodeGoogleCredential, googleClientId, loadGoogleIdentity, previewProfile } from '../../services/googleAuth';
import { REQUIRED_TERMS, type AppMode, type PermissionState, type Profile } from '../../types/family';
import { useFamily } from './session';

const iconSrc = `${import.meta.env.BASE_URL}umap-icon.png`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full justify-center bg-[#d7e3ee]">
      <div className="flex h-full w-full max-w-[430px] flex-col bg-[#f7f9fc] text-slate-900">{children}</div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.6 7.1l6.3 5.3C37.4 38.4 44 33 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export function Onboarding() {
  const family = useFamily();
  const { stage } = family.state;

  return (
    <Shell>
      {stage === 'splash' && <Splash onDone={family.splashDone} />}
      {stage === 'login' && <Login onGoogle={family.login} />}
      {stage === 'mode' && (
        <ModeChoice
          chosen={family.state.mode}
          onChoose={family.chooseMode}
          onBack={family.state.mode ? family.closeMode : family.back}
        />
      )}
      {stage === 'survey' && (
        <Survey onSkip={family.skipSurvey} onNext={family.pickSurvey} onBack={family.back} />
      )}
      {stage === 'terms' && (
        <Terms
          terms={family.state.terms}
          onToggle={family.toggleTerm}
          onToggleAll={family.toggleAllTerms}
          onNext={family.continueTerms}
          onBack={family.back}
        />
      )}
      {stage === 'phone' && <Phone onSave={family.savePhone} onSkip={family.skipPhone} onBack={family.back} />}
      {stage === 'permissions' && (
        <Permissions
          initial={family.state.permissions}
          canClose={family.state.permissions.completed}
          onClose={() => family.finishPermissions(family.state.permissions)}
          onBack={family.back}
          onDone={family.finishPermissions}
        />
      )}
    </Shell>
  );
}

function Splash({ onDone }: { onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <button type="button" onClick={onDone} className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <img src={iconSrc} alt="" className="h-28 w-28 rounded-[28px] shadow-lg" />
      <div>
        <p className="text-3xl font-black tracking-tight">Umap</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">동의한 가족의 위치를 함께 봅니다.</p>
      </div>
      <p className="text-xs text-slate-400">화면을 누르면 바로 시작합니다.</p>
    </button>
  );
}

function ModeChoice({
  chosen,
  onChoose,
  onBack,
}: {
  chosen: AppMode | null;
  onChoose: (mode: AppMode) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-6">
      <button type="button" onClick={onBack} className="mb-6 flex items-center gap-1 text-sm font-bold text-slate-500">
        <ChevronLeft className="h-4 w-4" />
        {chosen ? '지도로' : '뒤로'}
      </button>
      <h1 className="text-2xl font-black">어떻게 쓸까요?</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">이 폰의 역할입니다. 나중에 메뉴에서 바꿀 수 있습니다.</p>
      <div className="mt-6 space-y-3">
        <button type="button" onClick={() => onChoose('admin')} className="w-full rounded-3xl bg-white p-4 text-left shadow-sm">
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0084FF] text-white">
              <Users className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-black">관리자 모드</span>
              <span className="mt-1 block text-sm leading-5 text-slate-500">가족을 초대하고 지우며, 상대가 허용한 위치만 봅니다.</span>
            </span>
          </span>
        </button>
        <button type="button" onClick={() => onChoose('managed')} className="w-full rounded-3xl bg-white p-4 text-left shadow-sm">
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff8a34] text-white">
              <UserRound className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-black">피관리자 모드</span>
              <span className="mt-1 block text-sm leading-5 text-slate-500">초대를 수락하고, 원할 때만 내 위치를 공유합니다. 가족을 추가할 수 없습니다.</span>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function Login({ onGoogle }: { onGoogle: (profile: Profile) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onGoogleRef = useRef(onGoogle);
  useEffect(() => {
    onGoogleRef.current = onGoogle;
  });
  const clientId = googleClientId();
  const [help, setHelp] = useState(false);
  const [gisError, setGisError] = useState(false);

  useEffect(() => {
    if (!clientId || !hostRef.current) return;
    let dead = false;
    loadGoogleIdentity()
      .then(() => {
        if (dead || !hostRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            const profile = decodeGoogleCredential(response.credential);
            if (profile) onGoogleRef.current(profile);
          },
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        hostRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(hostRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.min(340, hostRef.current.clientWidth || 320),
          locale: 'ko',
        });
      })
      .catch(() => {
        if (!dead) setGisError(true);
      });
    return () => {
      dead = true;
    };
  }, [clientId]);

  return (
    <div className="flex h-full flex-col px-6 pb-10 pt-16">
      <img src={iconSrc} alt="" className="h-16 w-16 rounded-2xl shadow-md" />
      <h1 className="mt-6 text-[28px] font-black leading-tight">Google로 Umap에 들어오기</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        가족 위치는 초대한 사람과 초대를 받은 사람만 나눕니다. 다른 사람의 번호만으로 위치를 찾지 않습니다.
      </p>
      <div className="mt-10">
        {clientId && !gisError ? (
          <div ref={hostRef} className="flex min-h-12 justify-center" />
        ) : (
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white text-sm font-bold shadow-sm"
          >
            <GoogleMark />
            Google로 로그인
          </button>
        )}
        {(help || gisError) && (
          <div className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
            <p>
              {gisError
                ? 'Google 로그인 스크립트를 불러오지 못했습니다.'
                : 'VITE_GOOGLE_CLIENT_ID 에 Google Cloud OAuth 웹 클라이언트 ID를 넣으면 이 버튼이 계정 선택으로 연결됩니다.'}
              {' '}키는 저장소에 넣지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => onGoogle(previewProfile())}
              className="mt-3 w-full rounded-full bg-[#0084FF] py-3 text-sm font-bold text-white"
            >
              미리보기로 계속
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const INTERESTS = [
  { id: 'live', title: '가족의 실시간 위치' },
  { id: 'home', title: '집에 들어오고 나갈 때 알림' },
  { id: 'commute', title: '등원·하원처럼 도착을 확인하고 싶어요' },
];

function Survey({ onSkip, onNext, onBack }: { onSkip: () => void; onNext: (id: string) => void; onBack: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between px-4 pt-4">
        <button type="button" onClick={onBack} className="p-2 text-slate-500" aria-label="이전">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={onSkip} className="px-2 text-sm font-semibold text-slate-500">
          건너뛰기
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <h1 className="mt-6 text-[26px] font-black leading-snug">어떤 안심이 가장 필요하세요?</h1>
        <p className="mt-2 text-sm text-slate-500">위치 공유에 쓰는 선택입니다. 건너뛰어도 됩니다.</p>
        <div className="mt-8 space-y-3">
          {INTERESTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPicked(item.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left ${
                picked === item.id ? 'border-[#0084FF] bg-blue-50' : 'border-slate-200'
              }`}
            >
              <span className={`h-5 w-5 rounded-full border-2 ${picked === item.id ? 'border-[#0084FF] bg-[#0084FF]' : 'border-slate-300'}`} />
              <span className="font-semibold">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="px-6 pb-8">
        <button
          type="button"
          disabled={!picked}
          onClick={() => picked && onNext(picked)}
          className="w-full rounded-full bg-[#ff8a34] py-3.5 text-base font-bold text-white disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  );
}

const TERM_COPY: { id: string; title: string; required: boolean; body: string }[] = [
  {
    id: 'terms',
    title: '이용약관 동의',
    required: true,
    body: 'Umap은 초대한 가족의 위치를 나누는 앱입니다. 동의하지 않은 사람을 찾거나, 주변 소리와 메시지를 읽지 않습니다.',
  },
  {
    id: 'location',
    title: '위치기반서비스 이용약관 동의',
    required: true,
    body: '가족 지도, 우리 집 안심존, 들어오고 나간 알림, 이 기기에 남기는 이동 경로에 위치를 사용합니다. 경로는 서버로 보내지 않습니다.',
  },
  {
    id: 'privacy',
    title: '개인정보 수집·이용 동의',
    required: true,
    body: 'Google 계정 이름과 이메일, 선택한 위치 권한, 직접 입력한 연락처, 가족 이름, 이동 경로를 이 기기에 저장합니다.',
  },
  {
    id: 'guardian',
    title: '만 14세 미만 법정대리인 정보 수집 동의',
    required: true,
    body: '아이의 위치를 보려면 보호자가 초대하고, 아이 기기도 Umap에서 위치 공유에 동의해야 합니다.',
  },
  {
    id: 'marketing',
    title: '마케팅 목적 개인정보 수집·이용 동의',
    required: false,
    body: '제품 소식을 보내는 선택입니다. 거절해도 위치 공유는 사용할 수 있습니다.',
  },
  {
    id: 'overseas',
    title: '개인정보 국외 이전 동의',
    required: false,
    body: 'Google 로그인을 쓰면 계정 식별자가 Google로 전달됩니다. 지도 타일은 국토교통부 VWorld에서 불러옵니다.',
  },
];

function Terms({
  terms,
  onToggle,
  onToggleAll,
  onNext,
  onBack,
}: {
  terms: Record<string, boolean>;
  onToggle: (id: string, value: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const allOn = Object.values(terms).every(Boolean);
  const ready = REQUIRED_TERMS.every((id) => terms[id]);
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center px-2 pt-3">
        <button type="button" onClick={onBack} className="p-2 text-slate-500" aria-label="이전">
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <h1 className="px-1 text-2xl font-black">이용 약관</h1>
        <button
          type="button"
          onClick={() => onToggleAll(!allOn)}
          className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-4 text-left font-bold"
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${allOn ? 'bg-[#0084FF]' : 'bg-slate-200'}`}>✓</span>
          약관 전체 동의
        </button>
        <ul className="mt-2">
          {TERM_COPY.map((term) => (
            <li key={term.id} className="border-b border-slate-100">
              <div className="flex items-center gap-3 py-3">
                <button type="button" onClick={() => onToggle(term.id, !terms[term.id])} className="flex flex-1 items-center gap-3 text-left">
                  <span className={`text-lg ${terms[term.id] ? 'text-[#0084FF]' : 'text-slate-300'}`}>✓</span>
                  <span className="text-sm font-semibold">
                    {term.title} ({term.required ? '필수' : '선택'})
                  </span>
                </button>
                <button type="button" onClick={() => setOpen(open === term.id ? null : term.id)} className="px-2 text-xs text-slate-400">
                  {open === term.id ? '닫기' : '보기'}
                </button>
              </div>
              {open === term.id && <p className="px-9 pb-3 text-sm leading-6 text-slate-500">{term.body}</p>}
            </li>
          ))}
        </ul>
      </div>
      <div className="px-5 pb-8">
        <button type="button" disabled={!ready} onClick={onNext} className="w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white disabled:opacity-40">
          다음
        </button>
      </div>
    </div>
  );
}

function Phone({ onSave, onSkip, onBack }: { onSave: (phone: string) => void; onSkip: () => void; onBack: () => void }) {
  const [phone, setPhone] = useState('');
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between px-2 pt-3">
        <button type="button" onClick={onBack} className="p-2 text-slate-500" aria-label="이전">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={onSkip} className="px-3 text-sm font-semibold text-slate-500">
          건너뛰기
        </button>
      </div>
      <div className="flex-1 px-6">
        <h1 className="mt-6 text-2xl font-black">전화번호</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          관리자 모드에서 우리 집 반경을 나갈 때 문자 초안을 받을 번호입니다. 다른 사람의 번호로 위치를 조회하지 않고, 문자도 자동으로 보내지 않습니다.
        </p>
        <label className="mt-8 block text-xs font-semibold text-slate-400" htmlFor="umap-phone">
          전화번호
        </label>
        <input
          id="umap-phone"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="010-0000-0000"
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-lg outline-none focus:border-[#0084FF]"
        />
      </div>
      <div className="px-6 pb-8">
        <button
          type="button"
          disabled={phone.replace(/\D/g, '').length < 8}
          onClick={() => onSave(phone)}
          className="w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </div>
  );
}

function requestNotifications(): Promise<PermissionState['notifications']> {
  if (!('Notification' in window)) return Promise.resolve('skipped');
  return Notification.requestPermission()
    .then((result) => (result === 'granted' ? 'granted' : 'denied'))
    .catch(() => 'denied');
}

function requestLocation(precise: boolean): Promise<'granted' | 'denied' | 'unavailable'> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (error) => resolve(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: precise, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

async function requestMotion(): Promise<'granted' | 'denied'> {
  const ctor = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
  if (typeof ctor.requestPermission !== 'function') return 'granted';
  try {
    const result = await ctor.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

function Permissions({
  initial,
  canClose,
  onClose,
  onBack,
  onDone,
}: {
  initial: PermissionState;
  canClose: boolean;
  onClose: () => void;
  onBack: () => void;
  onDone: (permissions: PermissionState) => void;
}) {
  const [step, setStep] = useState<'intro' | 'notifications' | 'location' | 'motion' | 'battery'>('intro');
  const [draft, setDraft] = useState<PermissionState>({ ...initial, completed: false });
  const [busy, setBusy] = useState(false);
  const [confirmAlways, setConfirmAlways] = useState(false);

  const finish = (next: PermissionState) => {
    if (next.locationMode === 'always' && step !== 'battery') {
      setDraft(next);
      setStep('battery');
      return;
    }
    onDone(next);
  };

  return (
    <div className="flex h-full flex-col bg-[#eef3f8]">
      <div className="flex items-center justify-between px-3 pt-3">
        <button type="button" onClick={onBack} className="p-2 text-slate-500" aria-label="이전">
          <ChevronLeft className="h-5 w-5" />
        </button>
        {canClose && (
          <button type="button" onClick={onClose} className="px-2 text-sm font-semibold text-slate-500">
            닫기
          </button>
        )}
      </div>
      {step === 'intro' && (
        <div className="flex flex-1 flex-col px-5 pb-8">
          <h1 className="mt-4 text-[26px] font-black leading-snug">가족 위치 공유를 시작할까요?</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">쓰는 권한만 차례로 묻습니다. 마이크, 문자, 주변 소리는 요청하지 않습니다.</p>
          <div className="mt-5 space-y-3 rounded-3xl bg-white p-4 shadow-sm">
            <Row icon={<Bell className="h-5 w-5" />} title="알림" body="집에 도착하거나 나갔을 때 알려 드립니다." />
            <Row icon={<MapPin className="h-5 w-5" />} title="위치" body="정확한 위치 또는 대략적인 위치, 앱 사용 중 또는 항상 허용을 직접 고릅니다." />
            <Row icon={<Footprints className="h-5 w-5" />} title="움직임" body="이동 중인지 머무르는지 구분해 위치 점을 안정시킵니다. 선택입니다." />
            <Row icon={<BatteryCharging className="h-5 w-5" />} title="배터리" body="항상 허용을 고른 뒤에만, 절전 때문에 공유가 끊길 수 있다고 안내합니다." />
          </div>
          <div className="mt-auto pt-6">
            <button type="button" onClick={() => setStep('notifications')} className="w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white">
              다음
            </button>
          </div>
        </div>
      )}

      {step === 'notifications' && (
        <Dialog
          icon={<Bell className="h-7 w-7 text-[#0084FF]" />}
          title="Umap에서 알림을 보내도록 허용하시겠습니까?"
          body="집 도착과 출발 알림에만 사용합니다."
          busy={busy}
          primary="허용"
          onPrimary={async () => {
            setBusy(true);
            const notifications = await requestNotifications();
            setBusy(false);
            const next = { ...draft, notifications };
            setDraft(next);
            setStep('location');
          }}
          onSecondary={() => {
            const next = { ...draft, notifications: 'denied' as const };
            setDraft(next);
            setStep('location');
          }}
        />
      )}

      {step === 'location' && (
        <div className="flex flex-1 flex-col px-5 pb-6">
          <div className="mt-2 flex justify-center text-[#0084FF]">
            <MapPin className="h-8 w-8" />
          </div>
          <h1 className="mt-3 text-center text-xl font-black leading-snug">Umap이 이 기기의 위치에 접근하도록 허용하시겠습니까?</h1>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <AccuracyCard
              selected={draft.accuracy === 'precise'}
              title="정확한 위치"
              body="지도에 점을 가깝게 찍습니다."
              onClick={() => setDraft({ ...draft, accuracy: 'precise' })}
            />
            <AccuracyCard
              selected={draft.accuracy === 'approximate'}
              title="대략적인 위치"
              body="동네 단위로만 표시합니다."
              onClick={() => setDraft({ ...draft, accuracy: 'approximate' })}
            />
          </div>
          {confirmAlways && (
            <div className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
              앱을 닫아 둔 동안에도 가족에게 위치를 보여 주겠다는 선택입니다. Umap은 이 화면에서 고르기 전에 백그라운드 권한으로 바꾸지 않습니다. 이 버전은 앱이 열려 있는 동안 위치를 갱신하고, 항상 허용은 그 선호로 저장합니다.
            </div>
          )}
          <div className="mt-auto space-y-2 pt-4 text-center">
            <TextButton
              disabled={busy}
              label="앱 사용 중에만 허용"
              onClick={async () => {
                setBusy(true);
                const result = await requestLocation(draft.accuracy === 'precise');
                setBusy(false);
                const next = { ...draft, locationMode: result === 'denied' ? 'denied' as const : 'while-using' as const };
                setDraft(next);
                setStep('motion');
              }}
            />
            <TextButton
              disabled={busy}
              label={confirmAlways ? '항상 허용으로 저장' : '항상 허용'}
              onClick={async () => {
                if (!confirmAlways) {
                  setConfirmAlways(true);
                  return;
                }
                setBusy(true);
                const result = await requestLocation(draft.accuracy === 'precise');
                setBusy(false);
                const next = { ...draft, locationMode: result === 'denied' ? 'denied' as const : 'always' as const };
                setDraft(next);
                setStep('motion');
              }}
            />
            <TextButton
              disabled={busy}
              label="허용 안 함"
              onClick={() => {
                const next = { ...draft, locationMode: 'denied' as const };
                setDraft(next);
                setStep('motion');
              }}
            />
          </div>
        </div>
      )}

      {step === 'motion' && (
        <Dialog
          icon={<Footprints className="h-7 w-7 text-[#0084FF]" />}
          title="움직임 정보로 위치 정확도를 높일까요?"
          body="이동 중인지 머무르는지 구분합니다. 건강 기록이나 마이크는 보지 않습니다. 거절해도 지도는 사용할 수 있습니다."
          busy={busy}
          primary="허용"
          onPrimary={async () => {
            setBusy(true);
            const motion = await requestMotion();
            setBusy(false);
            const next = { ...draft, motion };
            setDraft(next);
            finish(next);
          }}
          onSecondary={() => {
            const next = { ...draft, motion: 'denied' as const };
            setDraft(next);
            finish(next);
          }}
        />
      )}

      {step === 'battery' && (
        <div className="flex flex-1 flex-col px-6 pb-8">
          <BatteryCharging className="mt-6 h-8 w-8 text-[#0084FF]" />
          <h1 className="mt-4 text-2xl font-black leading-snug">배터리 최적화 안내</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            항상 허용을 저장했습니다. 안드로이드에서 앱을 닫아도 위치를 나누려면 설정 &gt; 앱 &gt; Umap &gt; 배터리에서 제한 없음을 고를 수 있습니다. Umap은 그 설정으로 다른 앱을 보지 않으며, 이 화면에서 최적화 예외를 자동으로 요청하지 않습니다.
          </p>
          <div className="mt-auto space-y-3">
            <button
              type="button"
              onClick={() => onDone({ ...draft, battery: 'acknowledged' })}
              className="w-full rounded-full bg-[#0084FF] py-3.5 font-bold text-white"
            >
              확인했습니다
            </button>
            <button type="button" onClick={() => onDone({ ...draft, battery: 'skipped' })} className="w-full py-3 text-sm font-bold text-slate-500">
              나중에
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-[#0084FF]">{icon}</div>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm leading-5 text-slate-500">{body}</p>
      </div>
    </div>
  );
}

function Dialog({
  icon,
  title,
  body,
  primary,
  busy,
  onPrimary,
  onSecondary,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  primary: string;
  busy: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-8 pt-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">{icon}</div>
      <h1 className="mt-5 text-xl font-black leading-snug">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
      <div className="mt-auto w-full">
        <button type="button" disabled={busy} onClick={onPrimary} className="w-full py-3 text-lg font-bold text-[#0084FF] disabled:opacity-40">
          {busy ? '확인 중…' : primary}
        </button>
        <button type="button" disabled={busy} onClick={onSecondary} className="w-full py-3 text-lg font-bold text-slate-700">
          허용 안 함
        </button>
      </div>
    </div>
  );
}

function AccuracyCard({ selected, title, body, onClick }: { selected: boolean; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border bg-white p-3 text-left ${selected ? 'border-[#0084FF] ring-2 ring-[#0084FF]/30' : 'border-slate-200'}`}>
      <Shield className={`h-4 w-4 ${selected ? 'text-[#0084FF]' : 'text-slate-300'}`} />
      <p className="mt-2 text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
    </button>
  );
}

function TextButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="w-full py-3 text-base font-bold text-slate-800 disabled:opacity-40">
      {label}
    </button>
  );
}
