import React, { useState } from 'react';

const iconSrc = `${import.meta.env.BASE_URL}umap-icon.png`;

export const COMPANY_HOME_URL = 'https://jadegun1124.github.io/umap/';
export const ANDROID_RELEASES_URL = 'https://github.com/jadegun1124/umap/releases/tag/v1.5.0';
export const ANDROID_APK_URL = 'https://github.com/jadegun1124/umap/releases/download/v1.5.0/umap-v1.5.0-tracker.apk';

export function CompanyHome() {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  return (
    <div className="h-full overflow-y-auto bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <a href="#top" className="flex items-center gap-2 font-black">
            <img src={iconSrc} alt="" className="h-9 w-9 rounded-xl" />
            Umap
          </a>
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-600">
            <a href="#product">서비스</a>
            <a href="#consent">동의</a>
            <a href="#download">앱 받기</a>
            <a href="#contact">문의</a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-16 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-bold text-[#0084FF]">가족 위치 공유</p>
            <h1 className="mt-3 text-4xl font-black leading-tight md:text-5xl">허락한 가족과만 위치를 나눕니다.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Umap은 회사에 남긴 소개 페이지와, 휴대폰에서 쓰는 가족 지도로 이루어져 있습니다. 실시간 위치, 우리 집 안심존, 초대 코드가 전부입니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={ANDROID_APK_URL} className="inline-flex rounded-full bg-[#0084FF] px-5 py-3 text-sm font-bold text-white">
                안드로이드 앱 받기
              </a>
              <a href="#contact" className="inline-flex rounded-full bg-slate-100 px-5 py-3 text-sm font-bold text-slate-800">
                문의하기
              </a>
            </div>
          </div>
          <div className="mx-auto w-full max-w-sm rounded-[36px] border border-slate-200 bg-[#f4f7fb] p-6 shadow-sm">
            <img src={iconSrc} alt="Umap 앱 아이콘" className="h-20 w-20 rounded-[22px]" />
            <p className="mt-4 text-2xl font-black">Umap</p>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600">
              <li>이 기기의 이름을 정한 뒤 권한을 설명하고 묻습니다.</li>
              <li>가족 핀과 우리 집 원을 지도에서 봅니다.</li>
              <li>코드나 링크로 가족을 초대합니다.</li>
            </ul>
          </div>
        </section>

        <section id="product" className="bg-slate-50">
          <div className="mx-auto grid max-w-5xl gap-4 px-5 py-14 md:grid-cols-3">
            <Card title="실시간 지도" body="동의한 가족의 현재 위치를 한 화면에서 봅니다." />
            <Card title="우리 집" body="집 반경을 저장하면 들어오고 나갈 때 알림이 남습니다." />
            <Card title="초대" body="가족은 앱을 설치하고 코드를 입력해야 목록에 나타납니다." />
          </div>
        </section>

        <section id="consent" className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-black">권한은 설명 다음에만 묻습니다.</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-bold">요청하는 것</h3>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                <li>알림 — 집 도착, 출발, 위치 유지. 처음 권한 화면에서 위치와 함께 묻습니다</li>
                <li>카메라 — 초대 QR을 읽을 때만. 스캔이 끝나면 끄고, 전화번호는 읽지 않습니다</li>
                <li>위치 — 정확한 위치 또는 대략적인 위치, 앱 사용 중 또는 항상 허용을 직접 선택</li>
                <li>움직임 — 위치 점을 안정시키고 싶을 때만</li>
                <li>배터리 안내 — 항상 허용을 고른 경우에만 설정 방법을 알려 줍니다</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold">만들지 않는 것</h3>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                <li>주변 소리 듣기</li>
                <li>문자와 메시지 읽기</li>
                <li>동의 없이 전화번호만으로 위치 조회</li>
                <li>원격으로 큰 소리를 울리는 기능</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="download" className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-black">어디서 보나요</h2>
          <dl className="mt-6 space-y-4 text-sm leading-6">
            <div>
              <dt className="font-bold">회사 홈</dt>
              <dd className="text-slate-600">
                GitHub Pages.{' '}
                <a className="font-semibold text-[#0084FF]" href={COMPANY_HOME_URL}>
                  {COMPANY_HOME_URL}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-bold">안드로이드 앱</dt>
              <dd className="text-slate-600">
                GitHub Releases의 APK입니다. Google Play에는 올리지 않았습니다.{' '}
                <a className="font-semibold text-[#0084FF]" href={ANDROID_RELEASES_URL}>
                  릴리스 목록
                </a>
                {' · '}
                <a className="font-semibold text-[#0084FF]" href={ANDROID_APK_URL}>
                  APK 다운로드
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-bold">iOS 앱</dt>
              <dd className="text-slate-600">App Store와 TestFlight에는 아직 없습니다. 아이콘 파일만 저장소에 있습니다.</dd>
            </div>
          </dl>
        </section>

        <section id="contact" className="bg-[#f7fafc]">
          <form
            className="mx-auto max-w-xl px-5 py-14"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim() || !message.trim()) return;
              setSent(true);
            }}
          >
            <h2 className="text-2xl font-black">문의</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">이 페이지는 회사 소개입니다. 입력한 내용은 서버로 보내지 않고 이 화면에만 남습니다.</p>
            <label className="mt-6 block text-sm font-bold" htmlFor="inquiry-name">
              이름
            </label>
            <input id="inquiry-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3" />
            <label className="mt-4 block text-sm font-bold" htmlFor="inquiry-message">
              내용
            </label>
            <textarea id="inquiry-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3" />
            <button type="submit" className="mt-4 rounded-full bg-[#0084FF] px-5 py-3 text-sm font-bold text-white">
              화면에 남기기
            </button>
            {sent && <p className="mt-3 text-sm font-semibold text-[#0084FF]">이 화면에만 남겼습니다. 서버로는 보내지 않습니다.</p>}
          </form>
        </section>
      </main>

      <footer className="border-t border-slate-200 px-5 py-8 text-sm text-slate-500">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>© 2026 Umap. 회사 홈은 GitHub Pages, 안드로이드 앱은 GitHub Releases입니다.</p>
          <a href="?app=1" className="font-semibold text-[#0084FF]">
            모바일 앱 화면 미리보기
          </a>
        </div>
      </footer>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-3xl bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </article>
  );
}
