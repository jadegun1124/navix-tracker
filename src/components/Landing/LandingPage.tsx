import React, { useState } from 'react';
import {
  Navigation,
  Shield,
  Smartphone,
  Radio,
  BatteryCharging,
  MapPin,
  Clock,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  Award,
  Users,
  Building2,
  PhoneCall,
  HelpCircle,
  ExternalLink,
  Zap,
  Lock,
  Compass,
  Footprints,
  Car,
  Package,
  Bell,
  BellOff,
} from 'lucide-react';

interface LandingPageProps {
  onGoToTracker: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGoToTracker }) => {
  const [selectedProductTab, setSelectedProductTab] = useState<'all' | 'child' | 'pet' | 'vehicle' | 'valuable'>('all');
  const [contactSuccess, setContactSuccess] = useState(false);
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryPhone, setInquiryPhone] = useState('');

  const products = [
    {
      id: 'x1l',
      tag: '초등학생·시니어 안심',
      name: 'NAVIX X1L 휴대용 안심 트래커',
      category: 'child',
      desc: '가방이나 주머니에 쏙 들어가는 29g 초소형 크기. 위급 시 즉시 SOS 비상 호출과 등하교 안심존 자동 알림을 제공합니다.',
      price: '89,000원',
      period: '1년 무제한 통신권 포함',
      battery: '최대 7일 (스마트 절전)',
      weight: '29g 초경량',
      icon: '🎒',
      features: [
        '별도 통신사 개통 절차 없이 전원 켜면 즉시 작동',
        '원터치 긴급 SOS 비상 호출 버튼 탑재',
        '학교, 학원, 집 안심존 진입/이탈 자동 알림',
        '단말기 소리 제어 (원격 삐-삐- 찾기 비프음)',
      ],
      badge: 'BEST HIT',
      color: 'blue',
    },
    {
      id: 'c5l',
      tag: '반려동물 전용',
      name: 'NAVIX C5L 반려견 스마트 목줄 트래커',
      category: 'pet',
      desc: '목줄에 가볍게 체결하는 곡면형 방수 디자인. 산책 거리 기록과 탈출 시 1초 초고속 실종 모드로 안전하게 보호합니다.',
      price: '94,000원',
      period: '1년 무제한 통신권 포함',
      battery: '최대 5일 (산책 감지)',
      weight: '28g IP67 완전방수',
      icon: '🐕',
      features: [
        'IP67 등급 비와 눈에도 안전한 완전 방수·방진',
        '집 반경 이탈 즉시 스마트폰 경보 발송',
        '산책 경로 궤적 자동 기록 (거리, 칼로리)',
        '실종 시 1초 단위 위치 전송 [실종 모드]',
      ],
      badge: '인기 상품',
      color: 'amber',
    },
    {
      id: 'c8l',
      tag: '차량 관제 & 운행일지',
      name: 'NAVIX C8L 무설치 차량용 실시간 관제기',
      category: 'vehicle',
      desc: '시거잭 또는 OBD 간편 연결. 국세청 제출용 운행기록부 자동 생성 및 법인/개인 차량 무단 이동을 실시간 추적합니다.',
      price: '129,000원',
      period: '1년 LTE 프리미엄권 포함',
      battery: '상시 전원 + 보조 배터리 내장',
      weight: '고성능 외장 GPS 안테나',
      icon: '🚗',
      features: [
        '배선 작업 없이 시거잭에 꽂으면 1초 만에 설치 끝',
        '시동 ON/OFF 자동 감지 및 실시간 운행 궤적',
        '국세청 표준 양식 운행기록부 엑셀 다운로드',
        '무단 견인 및 야간 이상 이동 즉시 경보',
      ],
      badge: '법인 1위',
      color: 'emerald',
    },
    {
      id: 'a2l',
      tag: '귀중품·바이크 도난방지',
      name: 'NAVIX A2L 초저전력 자산 보호 트래커',
      category: 'valuable',
      desc: '자전거 프레임, 오토바이, 고가 장비 내부에 숨겨서 보관. 3축 진동 감지 센서로 움직임 발생 시 즉각 경보를 보냅니다.',
      price: '79,000원',
      period: '1년 안심 통신권 포함',
      battery: '대기 최대 90일 (초저전력)',
      weight: '34g 슬림형 마그네틱',
      icon: '🚲',
      features: [
        '초강력 네오디뮴 자석 내장으로 금속 부착 가능',
        '정차 중 슬립 모드 전환으로 최대 3개월 배터리',
        '미세 충격 및 진동 감지 시 스마트폰 즉시 푸시',
        '도난 이동 시 실시간 추적 모드 자동 활성화',
      ],
      badge: '추천',
      color: 'purple',
    },
  ];

  const filteredProducts =
    selectedProductTab === 'all'
      ? products
      : products.filter((p) => p.category === selectedProductTab);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName.trim() || !inquiryPhone.trim()) return;
    setContactSuccess(true);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* 1. Global Navigation Bar (Clean White) */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-600 flex items-center justify-center text-white shadow-md shadow-sky-600/20">
              <Navigation className="w-5 h-5 fill-current" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-slate-900">
                NAVIX <span className="text-sky-600 font-bold text-xs uppercase px-1.5 py-0.5 rounded-md bg-sky-50 border border-sky-200 ml-1">나빅스</span>
              </span>
              <p className="text-[10px] text-slate-500 tracking-wider">SMART GPS TRACKING PLATFORM</p>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-600">
            <a href="#products" className="hover:text-sky-600 transition-colors">제품 라인업</a>
            <a href="#technology" className="hover:text-sky-600 transition-colors">핵심 기술</a>
            <a href="#service-plan" className="hover:text-sky-600 transition-colors">이용권 안내</a>
            <a href="#b2b" className="hover:text-sky-600 transition-colors">기업/대량 관제</a>
            <a href="#faq" className="hover:text-sky-600 transition-colors">자주 묻는 질문</a>
          </div>

          {/* CTA: Go to Live Tracker */}
          <div className="flex items-center gap-3">
            <button
              onClick={onGoToTracker}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-sky-600/20 active:scale-95 transition-all"
            >
              <span>실시간 관제 시스템 열기</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* 2. Hero Section (Bright White & Soft Sky Gradient) */}
      <section className="relative overflow-hidden pt-12 pb-20 md:py-24 border-b border-slate-200 bg-gradient-to-b from-sky-50/60 via-white to-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Texts */}
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-sky-200 text-sky-700 text-xs font-bold shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                <span>전국 LTE-M 이동통신망 100% 자체 지원</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                내가 지키고 싶은 모든 것,<br />
                <span className="text-sky-600">
                  지금 어디 있고 어디를 거쳐왔는지
                </span><br />
                한눈에 확인하세요.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                복잡한 통신사 가입이나 약정 없이, 기기를 켜자마자 바로 작동합니다.
                초등학생 등하교 안전, 반려동물 탈출 방지, 법인 차량 운행 일지까지
                하나의 <strong className="text-slate-900 font-bold">NAVIX GO</strong> 플랫폼에서 실시간으로 관제하세요.
              </p>

              {/* Fast Feature Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs text-slate-700 font-semibold">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>별도 통신사 개통 불필요</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>지도 API 키 필요 없음</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>스마트폰 & PC 어디서나</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <button
                  onClick={onGoToTracker}
                  className="px-6 py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm sm:text-base flex items-center gap-2.5 shadow-lg shadow-sky-600/25 transition-transform active:scale-95"
                >
                  <Navigation className="w-5 h-5 fill-current" />
                  <span>실시간 관제 시스템(NAVIX GO) 체험하기</span>
                </button>
                <a
                  href="#products"
                  className="px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-sm sm:text-base transition-colors shadow-xs"
                >
                  제품 라인업 보기
                </a>
              </div>
            </div>

            {/* Right Interactive Preview Card (White Theme) */}
            <div className="relative">
              <div className="relative rounded-3xl bg-white border border-slate-200 p-5 shadow-xl overflow-hidden group">
                {/* Header of preview window */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-400 inline-block"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block"></span>
                    <span className="font-mono font-bold text-slate-500 ml-2">NAVIX GO 실시간 관제 센터</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    전국 LTE 정상 연결
                  </span>
                </div>

                {/* Simulated live visual cards */}
                <div className="mt-4 space-y-3">
                  {/* Target 1 */}
                  <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl p-2 rounded-xl bg-white shadow-xs">🎒</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">민준이 가방 (NAVIX X1L)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-sky-100 text-sky-700">학교 안심존 내</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">서울대치초등학교 교실 • 배터리 88%</p>
                      </div>
                    </div>
                    <span className="text-xs text-sky-700 font-mono font-semibold">10초 전</span>
                  </div>

                  {/* Target 2 */}
                  <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl p-2 rounded-xl bg-white shadow-xs">🐕</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">코코 (NAVIX C5L)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-700">산책 2.3km</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">잠원 한강공원 잔디마당 • 배터리 74%</p>
                      </div>
                    </div>
                    <span className="text-xs text-amber-700 font-mono font-semibold">실시간</span>
                  </div>

                  {/* Target 3 */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl p-2 rounded-xl bg-white shadow-xs">🚗</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">카니발 하이리무진 (NAVIX C8L)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-100 text-emerald-700">주차 완료</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">판교 R&D 센터 지하 2층 • 금일 19.8km</p>
                      </div>
                    </div>
                    <span className="text-xs text-emerald-700 font-mono font-semibold">실시간</span>
                  </div>

                  {/* Button inside preview */}
                  <button
                    onClick={onGoToTracker}
                    className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer mt-2"
                  >
                    <span>실제 지도 화면으로 전환하여 체험하기</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Product Lineup Section (Clean White) */}
      <section id="products" className="py-20 border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-sky-600 uppercase tracking-widest">PRODUCT LINEUP</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 mt-2">
              지키고 싶은 대상에 맞는 최적의 라인업
            </h2>
            <p className="text-sm sm:text-base text-slate-500 mt-3">
              배터리와 갱신 주기를 대상 특성에 맞춰 정교하게 설계했습니다.
            </p>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              {[
                { id: 'all', label: '전체 보기' },
                { id: 'child', label: '어린이·시니어 (X1L)' },
                { id: 'pet', label: '반려동물 (C5L)' },
                { id: 'vehicle', label: '차량 관제 (C8L)' },
                { id: 'valuable', label: '자산·귀중품 (A2L)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedProductTab(tab.id as typeof selectedProductTab)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedProductTab === tab.id
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className="rounded-3xl bg-white border border-slate-200 hover:border-sky-400 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl shadow-xs"
              >
                <div>
                  {/* Top Badge & Icon */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      {p.icon}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-sky-50 text-sky-700 border border-sky-200">
                      {p.badge}
                    </span>
                  </div>

                  <span className="text-xs font-bold text-sky-600 block mb-1">{p.tag}</span>
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed min-h-[48px]">{p.desc}</p>

                  {/* Spec pills */}
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-xs text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">배터리 수명</span>
                      <span className="font-bold text-slate-900">{p.battery}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">무게/규격</span>
                      <span className="font-bold text-slate-900">{p.weight}</span>
                    </div>
                  </div>

                  {/* Key Features List */}
                  <ul className="mt-4 space-y-2 text-xs text-slate-600">
                    {p.features.map((f, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Bottom Price & Button */}
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <div className="mb-3">
                    <span className="text-xs text-slate-400 block">{p.period}</span>
                    <span className="text-xl font-extrabold text-slate-900">{p.price}</span>
                  </div>
                  <button
                    onClick={onGoToTracker}
                    className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-sky-600 hover:text-white text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>관제 화면에서 확인하기</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Core Technology Section (Soft Slate Background) */}
      <section id="technology" className="py-20 border-b border-slate-200 bg-slate-50/70">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold text-sky-600 uppercase tracking-widest">TECHNOLOGY & TRUST</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 mt-2">
              나빅스(NAVIX)만의 기술력과 안전성
            </h2>
            <p className="text-sm sm:text-base text-slate-500 mt-3">
              오차 없는 측위와 끊김 없는 통신을 위해 국내 최고 수준의 IoT 인프라를 적용했습니다.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-7 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <Radio className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">GPS + Wi-Fi + 기지국 3중 측위</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                GPS 신호가 닿지 않는 지하 주차장, 실내 건물, 터널 안에서도 주변 Wi-Fi AP 및 LTE 기지국 신호를 복합 연산하여 사각지대 없이 위치를 찾아냅니다.
              </p>
            </div>

            <div className="p-7 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">지도 API 키 0원, 무제한 관제</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                외부 유료 지도 API 키 등록이나 과금 걱정 없이 전 세계 OpenStreetMap & Carto 정밀 벡터 타일 기반으로 즉시 무제한 무료 연동됩니다.
              </p>
            </div>

            <div className="p-7 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">위치정보 암호화 및 법적 준수</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                위치정보보호법에 준수하여 모든 위치 좌표는 TLS 1.3 암호화 구간 전송되며, 지정 보관 기간 경과 시 안전하게 자동 파기됩니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Service Plan / Voucher Section */}
      <section id="service-plan" className="py-20 border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold text-sky-600 uppercase tracking-widest">PLANS & PRICING</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 mt-2">
              월 청구 요금 없는 깔끔한 선불 이용권
            </h2>
            <p className="text-sm sm:text-base text-slate-500 mt-3">
              매달 청구되는 통신비 부담 없이, 1년 또는 2년 이용권으로 무제한 관제를 이용하세요.
            </p>
          </div>

          <div className="grid md:grid-cols-2 max-w-4xl mx-auto gap-8">
            {/* 1 Year Plan */}
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-sky-600 block mb-1">표준 안심 플랜</span>
                <h3 className="text-2xl font-bold text-slate-900">1년 무제한 서비스 이용권</h3>
                <p className="text-xs text-slate-500 mt-2">일반 사용자 및 학생, 반려동물 추천</p>

                <div className="mt-6 mb-6">
                  <span className="text-3xl font-extrabold text-slate-900">월 3,900원</span>
                  <span className="text-xs text-slate-500 ml-1">(연 46,800원 일시납)</span>
                </div>

                <ul className="space-y-3 text-xs sm:text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    <span>전국 LTE-M 무제한 위치 데이터 송수신</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    <span>최근 30일 과거 이동 궤적 무제한 조회</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    <span>안전구역(지오펜스) 최대 10개 설정</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    <span>스마트폰 푸시 & 카카오 알림톡 지원</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={onGoToTracker}
                className="mt-8 w-full py-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-sm transition-colors shadow-xs"
              >
                플랫폼 체험하기
              </button>
            </div>

            {/* 2 Year Plan */}
            <div className="p-8 rounded-3xl bg-gradient-to-b from-sky-50 to-white border-2 border-sky-500 flex flex-col justify-between relative shadow-xl shadow-sky-500/10">
              <span className="absolute -top-3.5 right-6 px-3 py-1 rounded-full text-xs font-black bg-sky-600 text-white uppercase tracking-wide shadow-xs">
                가장 인기 (BEST)
              </span>

              <div>
                <span className="text-xs font-bold text-sky-600 block mb-1">장기 할인 프리미엄</span>
                <h3 className="text-2xl font-bold text-slate-900">2년 안심 케어 이용권</h3>
                <p className="text-xs text-slate-500 mt-2">차량 관제 및 장기 자산 관리 추천</p>

                <div className="mt-6 mb-6">
                  <span className="text-3xl font-extrabold text-slate-900">월 2,900원</span>
                  <span className="text-xs text-slate-500 ml-1">(연 34,800원 상당)</span>
                </div>

                <ul className="space-y-3 text-xs sm:text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>1년 대비 25% 추가 할인 적용</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>최근 1년(365일) 과거 이동 경로 영구 보관</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>국세청 양식 차량 운행기록부 자동 생성</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>가족 공유 계정 최대 5명 무료 초대</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={onGoToTracker}
                className="mt-8 w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm transition-colors shadow-md shadow-sky-600/25"
              >
                실시간 관제 시스템 시작하기
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 6. B2B & Bulk Inquiry Section */}
      <section id="b2b" className="py-20 border-b border-slate-200 bg-slate-50/70">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-bold text-sky-600 uppercase tracking-widest">B2B SOLUTION</span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 mt-2 leading-tight">
                기업 법인차량, 렌터카, 물류 관제<br />
                맞춤형 대량 도입 상담
              </h2>
              <p className="text-sm sm:text-base text-slate-600 mt-4 leading-relaxed">
                수십~수백 대의 차량과 이동 장비를 한 화면에서 통합 관제하세요.
                오픈소스 Traccar 프로토콜 호환 API 및 전용 관제 대시보드를 구축해 드립니다.
              </p>

              <div className="mt-6 space-y-3 text-xs sm:text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>법인 세무 절세를 위한 국세청 표준 운행일지 자동 발행</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>관리자/운전자 권한 분리 및 지사별 그룹 관제</span>
                </div>
                <div className="flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>기업 전담 기술지원 및 단체 할인 요율 제공</span>
                </div>
              </div>
            </div>

            {/* Inquiry Form */}
            <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-lg">
              <h3 className="text-lg font-bold text-slate-900 mb-1">기업 및 대량 구매 견적 문의</h3>
              <p className="text-xs text-slate-500 mb-6">담당자 확인 후 1영업일 이내 유선 및 메일로 회신드립니다.</p>

              {contactSuccess ? (
                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="text-base font-bold text-slate-900">견적 문의가 정상 접수되었습니다!</h4>
                  <p className="text-xs text-slate-600">
                    입력하신 연락처({inquiryPhone})로 전담 매니저가 곧 연락드리겠습니다.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">담당자 성함 / 회사명</label>
                    <input
                      type="text"
                      required
                      placeholder="예: 홍길동 팀장 (주식회사 나빅스)"
                      value={inquiryName}
                      onChange={(e) => setInquiryName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">연락처 (휴대전화)</label>
                    <input
                      type="tel"
                      required
                      placeholder="예: 010-1234-5678"
                      value={inquiryPhone}
                      onChange={(e) => setInquiryPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">도입 희망 대수</label>
                    <select className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500">
                      <option>10대 미만 (소규모)</option>
                      <option>10대 ~ 50대 (중소기업)</option>
                      <option>50대 ~ 200대 (중견기업)</option>
                      <option>200대 이상 (대규모 법인/렌터카)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm transition-colors shadow-md shadow-sky-600/25"
                  >
                    기업 맞춤 견적 신청하기
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 7. FAQ Section */}
      <section id="faq" className="py-20 border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-sky-600 uppercase tracking-widest">FAQ</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">자주 묻는 질문</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: '별도의 통신사 대리점 방문이나 유심 개통이 필요한가요?',
                a: '아닙니다! 나빅스 단말기는 내부에 전국 LTE-M 전용 IoT 회선이 사전 개통되어 출고됩니다. 제품 수령 후 전원 버튼만 켜면 1초 만에 스마트폰 앱과 자동 연동됩니다.',
              },
              {
                q: '지도 서비스를 이용할 때 카카오나 네이버 지도처럼 API 키가 필요한가요?',
                a: '전혀 필요 없습니다! 본 서비스는 전 세계 오픈 벡터 맵(OpenStreetMap)과 고화질 Carto 타일을 탑재하여, 별도의 API 키 발급이나 유료 과금 없이 100% 무료 무제한 작동합니다.',
              },
              {
                q: '지하나 실내에서도 위치 추적이 가능한가요?',
                a: '네, 가능합니다. GPS 위성 신호가 차단되는 실내나 지하 공간에서는 주변 Wi-Fi 신호(WPS)와 통신사 기지국(LBS) 신호를 복합 계산하여 현재 위치를 안정적으로 표시합니다.',
              },
              {
                q: '가족 여러 명이 동시에 같은 기기 위치를 볼 수 있나요?',
                a: '네! 가족 공유 계정 기능을 통해 부모님, 배우자 등 최대 5명의 가족 스마트폰에 동시에 같은 아이나 반려동물의 실시간 위치를 공유할 수 있습니다.',
              },
            ].map((faq, idx) => (
              <div key={idx} className="p-5 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs">
                <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>{faq.q}</span>
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 pl-6 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Footer (Light Theme) */}
      <footer className="py-12 bg-slate-100 border-t border-slate-200 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-sky-600 flex items-center justify-center text-white">
                <Navigation className="w-4 h-4 fill-current" />
              </div>
              <span className="text-base font-black text-slate-900">NAVIX (나빅스)</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600 font-medium">스마트 위치관제 솔루션</span>
            </div>
            <button
              onClick={onGoToTracker}
              className="text-sky-600 hover:text-sky-700 font-bold flex items-center gap-1"
            >
              <span>실시간 관제 시스템 (NAVIX GO) 접속</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="border-t border-slate-200 pt-6 space-y-2 text-[11px] leading-relaxed text-slate-500">
            <p>상호명: (주)나빅스 IoT 솔루션 | 대표이사: 홍길동 | 사업자등록번호: 120-88-00000</p>
            <p>위치기반서비스사업 신고번호: 제 2026-서울강남-0000호 | 통신판매업신고: 2026-서울강남-0000호</p>
            <p>주소: 서울특별시 강남구 테헤란로 152 강남파이낸스센터 18층 | 고객센터: 1588-0000 (평일 09:00~18:00)</p>
            <p className="text-slate-400 pt-2">© 2026 NAVIX Co., Ltd. All rights reserved. API-Key-Free Open Map Architecture.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
