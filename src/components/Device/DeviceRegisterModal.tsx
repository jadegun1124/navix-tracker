import React, { useState } from 'react';
import { X, QrCode, Smartphone, Check, Sparkles, AlertCircle } from 'lucide-react';
import { Device, DeviceType } from '../../types';

interface DeviceRegisterModalProps {
  onRegister: (newDevice: Device) => void;
  onClose: () => void;
}

export const DeviceRegisterModal: React.FC<DeviceRegisterModalProps> = ({ onRegister, onClose }) => {
  const [tab, setTab] = useState<'qr' | 'manual'>('qr');
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<DeviceType>('child');
  const [serial, setSerial] = useState<string>('NX1L-9921-3401-KR');
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [scanSuccess, setScanSuccess] = useState<boolean>(false);

  const handleSimulateScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setScanSuccess(true);
      setSerial(`NX1L-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-KR`);
    }, 1200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let modelName = 'NAVIX X1L (어린이 안심형)';
    if (type === 'pet') modelName = 'NAVIX C5L (반려동물 목줄형)';
    if (type === 'vehicle') modelName = 'NAVIX C8L (차량용 실시간 관제)';
    if (type === 'valuable') modelName = 'NAVIX A2L (초소형 자산/귀중품)';

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
        address: '서울 강남구 등록 위치',
      },
      todayTrail: [],
      historicalTrails: {},
      updateInterval: type === 'vehicle' ? 5 : type === 'child' ? 15 : 30,
      soundMuted: false,
      isMissingMode: false,
      voucher: {
        planName: '신규 개통 프로모션 1년권',
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
    <div className="fixed inset-0 z-[1000] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">새 GPS 트래커 단말기 등록</h2>
              <p className="text-xs text-slate-400">QR 코드 스캔 또는 일련번호 입력</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-2 p-2 bg-slate-100 dark:bg-slate-800/80 m-4 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setTab('qr')}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              tab === 'qr' ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-500'
            }`}
          >
            QR 코드 스캔
          </button>
          <button
            type="button"
            onClick={() => setTab('manual')}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              tab === 'manual' ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-500'
            }`}
          >
            기기 일련번호 입력
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 pt-0 space-y-4 overflow-y-auto">
          {tab === 'qr' && (
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 relative overflow-hidden text-center">
              {/* Scan laser line animation */}
              <div className="w-40 h-40 border-2 border-sky-500 rounded-2xl relative flex items-center justify-center bg-white dark:bg-slate-900 shadow-inner">
                <QrCode className="w-24 h-24 text-slate-400 opacity-60" />
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-sky-500 to-transparent animate-pulse"></div>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  단말기 뒷면 또는 패키지의 QR 코드를 비춰주세요
                </p>
                <button
                  type="button"
                  onClick={handleSimulateScan}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-sm"
                >
                  QR 자동 인식 시뮬레이션
                </button>
              </div>
            </div>
          )}

          {/* Device Type Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">
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
                  className={`p-2.5 rounded-2xl border text-center transition-all ${
                    type === item.id
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 ring-2 ring-sky-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-2xl block">{item.emoji}</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mt-1">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{item.model}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Device Nickname */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
              기기 별칭 (이름)
            </label>
            <input
              type="text"
              required
              placeholder="예: 우리 둘째 민준이, 콩이 목줄, 카니발 리무진"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Serial Number */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
              기기 일련번호 (IMEI)
            </label>
            <input
              type="text"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-sky-500/25 transition-all"
          >
            기기 등록 완료 및 실시간 관제 시작
          </button>
        </form>
      </div>
    </div>
  );
};
