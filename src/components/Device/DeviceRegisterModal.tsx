import React, { useState } from 'react';
import { X, QrCode, Smartphone, Phone, Check, Sparkles, Route, ShieldCheck } from 'lucide-react';
import { Device, DeviceType } from '../../types';
import { createPhoneTrackingDevice } from '../../data/mockData';

interface DeviceRegisterModalProps {
  onRegister: (newDevice: Device) => void;
  onClose: () => void;
}

export const DeviceRegisterModal: React.FC<DeviceRegisterModalProps> = ({ onRegister, onClose }) => {
  const [tab, setTab] = useState<'phone' | 'qr' | 'manual'>('phone');
  
  // Phone form state
  const [phoneNumber, setPhoneNumber] = useState<string>('010-');
  const [phoneName, setPhoneName] = useState<string>('');
  const [carrier, setCarrier] = useState<string>('SKT');
  const [isLocating, setIsLocating] = useState<boolean>(false);

  // Traditional device form state
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<DeviceType>('child');
  const [serial, setSerial] = useState<string>('UM-X1L-9921-KR');

  // Handle auto-formatting Korean phone number
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length <= 3) {
      setPhoneNumber(val);
    } else if (val.length <= 7) {
      setPhoneNumber(`${val.slice(0, 3)}-${val.slice(3)}`);
    } else {
      setPhoneNumber(`${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7, 11)}`);
    }
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.length < 11) return;

    setIsLocating(true);
    setTimeout(() => {
      setIsLocating(false);
      const newDev = createPhoneTrackingDevice(phoneNumber, phoneName || `${phoneNumber} (휴대폰)`);
      onRegister(newDev);
      onClose();
    }, 1000);
  };

  const handleTraditionalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let modelName = 'umap X1L (어린이 안심형)';
    if (type === 'pet') modelName = 'umap C5L (반려동물 목줄형)';
    if (type === 'vehicle') modelName = 'umap C8L (차량용 실시간 관제)';
    if (type === 'valuable') modelName = 'umap A2L (초소형 자산/귀중품)';

    const newDev: Device = {
      id: `dev-${Date.now()}`,
      name: name.trim(),
      model: modelName,
      type,
      serialNumber: serial,
      battery: 100,
      isCharging: false,
      status: 'online',
      signalStrength: 4,
      lastSeen: '방금 등록됨',
      currentLocation: {
        lat: 37.4982 + (Math.random() - 0.5) * 0.01,
        lng: 127.0612 + (Math.random() - 0.5) * 0.01,
        timestamp: new Date().toTimeString().split(' ')[0],
        speed: 0,
        address: '서울 강남구 테헤란로',
      },
      todayTrail: [],
      historicalTrails: {},
      updateInterval: type === 'vehicle' ? 5 : type === 'child' ? 15 : 30,
      soundMuted: false,
      isMissingMode: false,
      voucher: {
        planName: 'umap 안심 서비스 1년권',
        activatedAt: '2026-10-24',
        expiresAt: '2027-10-23',
        daysLeft: 365,
      },
      assignedGeofences: [],
      stats: {
        todayDistanceKm: 0,
        todayDurationMinutes: 0,
        topSpeedKmH: 0,
        stopCount: 0,
      },
    };

    onRegister(newDev);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-50 text-sky-600">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">새 기기 및 번호 등록</h2>
              <p className="text-xs text-slate-500">한국 010 휴대폰 번호 또는 GPS 트래커 단말기</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons (Phone Number First) */}
        <div className="grid grid-cols-3 p-1.5 bg-slate-100 m-4 mb-2 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setTab('phone')}
            className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              tab === 'phone' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            📱 010 번호 추적
          </button>
          <button
            type="button"
            onClick={() => setTab('qr')}
            className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              tab === 'qr' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            QR 코드 스캔
          </button>
          <button
            type="button"
            onClick={() => setTab('manual')}
            className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              tab === 'manual' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            기기 시리얼(IMEI)
          </button>
        </div>

        {/* Body 1: Phone Number (010) Tracking Form */}
        {tab === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} className="p-4 sm:p-6 pt-2 space-y-4 overflow-y-auto">
            <div className="p-3.5 rounded-2xl bg-sky-50/80 border border-sky-200 text-xs text-slate-700 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sky-800">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                <span>010 스마트폰 실시간 위치 & 이동 궤적 동기화</span>
              </div>
              <p className="text-slate-600">
                추적할 휴대폰 번호를 입력하면 LTE 기지국과 GPS를 연동하여 지도상에 실시간 위치와 지나온 이동 궤적선을 생성합니다.
              </p>
            </div>

            {/* Phone Number Input */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                휴대폰 번호 입력 (한국 010)
              </label>
              <div className="relative">
                <input
                  type="tel"
                  required
                  maxLength={13}
                  placeholder="010-1234-5678"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-base font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="absolute right-3 top-3 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  LTE 연결 대기
                </span>
              </div>
            </div>

            {/* Carrier Selection */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">통신사 선택</label>
              <div className="grid grid-cols-4 gap-2">
                {['SKT', 'KT', 'LGU+', '알뜰폰'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCarrier(c)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      carrier === c
                        ? 'bg-sky-50 border-sky-500 text-sky-700 ring-1 ring-sky-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Nickname */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                기기 별칭 (선택 사항)
              </label>
              <input
                type="text"
                placeholder="예: 엄마 폰, 내 세컨폰, 지우 핸드폰"
                value={phoneName}
                onChange={(e) => setPhoneName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={phoneNumber.length < 12 || isLocating}
              className="w-full py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-sky-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLocating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>LTE 기지국 위치 동기화 중...</span>
                </>
              ) : (
                <>
                  <Route className="w-4 h-4" />
                  <span>실시간 위치 & 이동 궤적 추적 시작</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Body 2: Traditional GPS Tracker Registration */
          <form onSubmit={handleTraditionalSubmit} className="p-4 sm:p-6 pt-2 space-y-4 overflow-y-auto">
            {tab === 'qr' && (
              <div className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 relative overflow-hidden text-center">
                <div className="w-36 h-36 border-2 border-sky-500 rounded-2xl relative flex items-center justify-center bg-white shadow-inner">
                  <QrCode className="w-20 h-20 text-slate-400 opacity-60" />
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-sky-500 to-transparent animate-pulse"></div>
                </div>
                <p className="text-xs font-semibold text-slate-700 mt-3">
                  단말기 뒷면의 QR 코드를 비춰주세요
                </p>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                관리 대상 선택
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'child', label: '어린이', emoji: '🎒', model: 'X1L' },
                  { id: 'pet', label: '반려동물', emoji: '🐕', model: 'C5L' },
                  { id: 'vehicle', label: '차량', emoji: '🚗', model: 'C8L' },
                  { id: 'valuable', label: '귀중품', emoji: '🚲', model: 'A2L' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setType(item.id as DeviceType)}
                    className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                      type === item.id
                        ? 'border-sky-500 bg-sky-50 text-sky-800 ring-2 ring-sky-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-2xl block">{item.emoji}</span>
                    <span className="text-xs font-bold text-slate-900 block mt-1">
                      {item.label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{item.model}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                기기 별칭 (이름)
              </label>
              <input
                type="text"
                required
                placeholder="예: 둘째 민준이, 콩이 목줄, 카니발 리무진"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                기기 일련번호 (IMEI)
              </label>
              <input
                type="text"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono text-sm text-slate-700 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-sky-600/25 transition-all cursor-pointer"
            >
              단말기 등록 완료 및 실시간 관제 시작
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
