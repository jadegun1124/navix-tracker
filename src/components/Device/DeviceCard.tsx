import React from 'react';
import {
  Battery,
  BatteryCharging,
  Wifi,
  Signal,
  MapPin,
  Volume2,
  Calendar,
  AlertCircle,
  Clock,
  Shield,
} from 'lucide-react';
import { Device } from '../../types';

interface DeviceCardProps {
  device: Device;
  isSelected: boolean;
  onSelect: () => void;
  onOpenPlayback: () => void;
  onTriggerBeep: () => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  isSelected,
  onSelect,
  onOpenPlayback,
  onTriggerBeep,
}) => {
  const getBadgeStyle = () => {
    switch (device.type) {
      case 'child':
        return { bg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800', emoji: '🎒', label: '어린이' };
      case 'pet':
        return { bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', emoji: '🐕', label: '반려동물' };
      case 'vehicle':
        return { bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', emoji: '🚗', label: '차량' };
      default:
        return { bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800', emoji: '🚲', label: '귀중품' };
    }
  };

  const badge = getBadgeStyle();

  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
        isSelected
          ? 'bg-white dark:bg-slate-800 border-sky-500 shadow-md ring-2 ring-sky-500/20'
          : 'bg-white/90 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border-slate-200/80 dark:border-slate-700/80 shadow-sm'
      }`}
    >
      {/* Missing mode banner highlight if active */}
      {device.isMissingMode && (
        <div className="absolute top-0 inset-x-0 bg-rose-500 text-white text-[10px] font-bold text-center py-0.5">
          🚨 긴급 실종 모드 가동 중 (1초 갱신)
        </div>
      )}

      {/* Header Info */}
      <div className={`flex items-start justify-between ${device.isMissingMode ? 'mt-2' : ''}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl bg-slate-100 dark:bg-slate-700 shadow-inner">
            {badge.emoji}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{device.name}</h3>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${badge.bg}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">{device.model}</p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          <span className="flex h-2 w-2 relative">
            {device.status === 'online' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                device.status === 'online'
                  ? 'bg-emerald-500'
                  : device.status === 'emergency'
                  ? 'bg-rose-500'
                  : 'bg-slate-400'
              }`}
            ></span>
          </span>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {device.status === 'online' ? '정상 수신' : '대기중'}
          </span>
        </div>
      </div>

      {/* Current Location snippet */}
      <div className="mt-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />
        <span className="truncate">{device.currentLocation.address || '서울시 강남구'}</span>
      </div>

      {/* Hardware Stats bar (Battery, Signal, Last seen) */}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-3">
          {/* Battery */}
          <div className="flex items-center gap-1">
            {device.isCharging ? (
              <BatteryCharging className="w-4 h-4 text-emerald-500" />
            ) : (
              <Battery
                className={`w-4 h-4 ${
                  device.battery <= 20
                    ? 'text-rose-500'
                    : device.battery <= 50
                    ? 'text-amber-500'
                    : 'text-emerald-500'
                }`}
              />
            )}
            <span className="font-mono font-medium">{device.battery}%</span>
          </div>

          {/* Signal */}
          <div className="flex items-center gap-1">
            <Signal className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-[11px]">LTE-M</span>
          </div>
        </div>

        {/* Last updated */}
        <div className="flex items-center gap-1 text-[11px]">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>{device.lastSeen}</span>
        </div>
      </div>

      {/* Action footer */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTriggerBeep();
          }}
          className="py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 transition-all"
        >
          <Volume2 className="w-3.5 h-3.5 text-amber-500" />
          <span>소리 찾기</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenPlayback();
          }}
          className="py-1.5 px-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/80 text-sky-700 dark:text-sky-300 text-xs font-semibold flex items-center justify-center gap-1 transition-all border border-sky-100 dark:border-sky-800"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>과거 경로</span>
        </button>
      </div>
    </div>
  );
};
