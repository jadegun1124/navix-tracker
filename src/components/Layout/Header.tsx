import React from 'react';
import {
  Navigation,
  Shield,
  Bell,
  Plus,
  Share2,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react';
import { Device } from '../../types';

interface HeaderProps {
  devices: Device[];
  selectedDevice: Device | null;
  onSelectDevice: (device: Device) => void;
  onOpenRegisterModal: () => void;
  onOpenGeofenceModal: () => void;
  onOpenNotificationDrawer: () => void;
  unreadCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  devices,
  selectedDevice,
  onSelectDevice,
  onOpenRegisterModal,
  onOpenGeofenceModal,
  onOpenNotificationDrawer,
  unreadCount,
}) => {
  return (
    <header className="h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 flex items-center justify-between z-[500] shrink-0">
      {/* Brand & Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <Navigation className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-slate-900 dark:text-white tracking-tight text-base sm:text-lg">
                NAVIX <span className="text-sky-500">GO</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border border-sky-200">
                LTE-M
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                전국 LTE 위치 관제 정상
              </span>
            </div>
          </div>
        </div>

        {/* Quick Device Switcher on larger screens */}
        <div className="hidden md:flex items-center gap-1.5 ml-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
          {devices.map((dev) => {
            const isSelected = selectedDevice?.id === dev.id;
            return (
              <button
                key={dev.id}
                onClick={() => onSelectDevice(dev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>
                  {dev.type === 'child' ? '🎒' : dev.type === 'pet' ? '🐕' : dev.type === 'vehicle' ? '🚗' : '🚲'}
                </span>
                <span>{dev.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Action Icons */}
      <div className="flex items-center gap-2">
        {/* Add Device Button */}
        <button
          onClick={onOpenRegisterModal}
          className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-sky-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">기기 등록</span>
        </button>

        {/* Geofence Button */}
        <button
          onClick={onOpenGeofenceModal}
          className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all active:scale-95"
          title="안전구역 (지오펜스) 관리"
        >
          <Shield className="w-4 h-4 text-sky-500" />
        </button>

        {/* Notification Bell Button */}
        <button
          onClick={onOpenNotificationDrawer}
          className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 relative transition-all active:scale-95"
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
