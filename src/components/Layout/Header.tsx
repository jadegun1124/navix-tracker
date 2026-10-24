import React, { useState } from 'react';
import {
  Navigation,
  Shield,
  Bell,
  Plus,
  Building,
  Phone,
  Search,
  Route,
  Smartphone,
  QrCode,
} from 'lucide-react';
import { Device } from '../../types';

interface HeaderProps {
  devices: Device[];
  selectedDevice: Device | null;
  onSelectDevice: (device: Device) => void;
  onOpenRegisterModal: () => void;
  onOpenGeofenceModal: () => void;
  onOpenNotificationDrawer: () => void;
  onGoToLanding: () => void;
  onQuickTrackPhone: (phoneNumber: string) => void;
  unreadCount: number;
  onOpenMobileTracker?: () => void;
  onOpenQrModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  devices,
  selectedDevice,
  onSelectDevice,
  onOpenRegisterModal,
  onOpenGeofenceModal,
  onOpenNotificationDrawer,
  onGoToLanding,
  onQuickTrackPhone,
  unreadCount,
  onOpenMobileTracker,
  onOpenQrModal,
}) => {
  const [quickPhone, setQuickPhone] = useState('010-');

  const handlePhoneSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickPhone.length >= 11) {
      onQuickTrackPhone(quickPhone);
      setQuickPhone('010-');
    }
  };

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length <= 3) {
      setQuickPhone(val);
    } else if (val.length <= 7) {
      setQuickPhone(`${val.slice(0, 3)}-${val.slice(3)}`);
    } else {
      setQuickPhone(`${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7, 11)}`);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-[500] shrink-0 shadow-xs">
      {/* Brand & Logo (umap) */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onGoToLanding} title="umap 공식 홈페이지로 이동">
          <div className="w-9 h-9 rounded-2xl bg-sky-600 flex items-center justify-center text-white shadow-md shadow-sky-600/20">
            <Navigation className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-slate-900 tracking-tight text-lg">
                u<span className="text-sky-600">map</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-sky-50 text-sky-700 border border-sky-200">
                실시간 궤적
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                API키 불필요 • 010 핸드폰/단말기 통합관제
              </span>
            </div>
          </div>
        </div>

        {/* 010 Phone Fast Search & Tracking Bar (User Feature Request) */}
        <form onSubmit={handlePhoneSearch} className="hidden xl:flex items-center ml-4">
          <div className="flex items-center bg-slate-100 hover:bg-slate-200/80 rounded-xl px-3 py-1.5 border border-slate-200 transition-all focus-within:ring-2 focus-within:ring-sky-500 focus-within:bg-white">
            <Phone className="w-3.5 h-3.5 text-sky-600 mr-2" />
            <input
              type="tel"
              maxLength={13}
              placeholder="010-XXXX-XXXX 번호 추적"
              value={quickPhone}
              onChange={handlePhoneInputChange}
              className="bg-transparent text-xs font-mono font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none w-36"
            />
            <button
              type="submit"
              disabled={quickPhone.length < 11}
              className="ml-1 px-2 py-0.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
            >
              <Route className="w-3 h-3" />
              <span>궤적 조회</span>
            </button>
          </div>
        </form>

        {/* Quick Device Switcher on larger screens */}
        <div className="hidden md:flex items-center gap-1 ml-3 bg-slate-100 p-1 rounded-2xl max-w-md overflow-x-auto">
          {devices.map((dev) => {
            const isSelected = selectedDevice?.id === dev.id;
            return (
              <button
                key={dev.id}
                onClick={() => onSelectDevice(dev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>
                  {dev.type === 'child' ? '🎒' : dev.type === 'pet' ? '🐕' : dev.type === 'vehicle' ? '🚗' : dev.type === 'smartphone' ? '📱' : '🚲'}
                </span>
                <span className="truncate max-w-[100px]">{dev.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Action Icons */}
      <div className="flex items-center gap-2">
        {/* Open Dedicated Mobile Tracker Mode */}
        {onOpenMobileTracker && (
          <button
            onClick={onOpenMobileTracker}
            className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center gap-1.5 border border-emerald-200 transition-all active:scale-95 cursor-pointer shadow-2xs"
            title="고정밀 GPS 4단계 필터링 모바일 트래커 화면으로 전환"
          >
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">위치추적 앱</span>
          </button>
        )}

        {/* QR Code for Smartphone Scanning */}
        {onOpenQrModal && (
          <button
            onClick={onOpenQrModal}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 transition-all active:scale-95 cursor-pointer"
            title="스마트폰 카메라로 스캔하여 핸드폰에서 바로 위치추적 실행"
          >
            <QrCode className="w-4 h-4 text-sky-600" />
            <span className="hidden lg:inline">폰으로 열기</span>
          </button>
        )}

        {/* Switch to Company Homepage */}
        <button
          onClick={onGoToLanding}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 transition-all active:scale-95 cursor-pointer"
          title="umap 공식 브랜드몰 및 회사 홈페이지로 이동"
        >
          <Building className="w-4 h-4 text-sky-600" />
          <span className="hidden sm:inline">umap 회사소개</span>
        </button>

        {/* Add Device Button */}
        <button
          onClick={onOpenRegisterModal}
          className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-sky-600/20 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">기기/번호 등록</span>
        </button>

        {/* Geofence Button */}
        <button
          onClick={onOpenGeofenceModal}
          className="p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 border border-slate-200 transition-all active:scale-95 cursor-pointer"
          title="안전구역 (지오펜스) 관리"
        >
          <Shield className="w-4 h-4 text-sky-600" />
        </button>

        {/* Notification Bell Button */}
        <button
          onClick={onOpenNotificationDrawer}
          className="p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 border border-slate-200 relative transition-all active:scale-95 cursor-pointer"
          title="알림 센터"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
