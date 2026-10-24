import React from 'react';
import {
  Battery,
  BatteryCharging,
  Signal,
  MapPin,
  Volume2,
  Calendar,
  Clock,
  Phone,
  Route,
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
        return { bg: 'bg-sky-50 text-sky-700 border-sky-200', emoji: '🎒', label: '어린이' };
      case 'pet':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', emoji: '🐕', label: '반려동물' };
      case 'vehicle':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', emoji: '🚗', label: '차량' };
      case 'smartphone':
        return { bg: 'bg-sky-50 text-sky-700 border-sky-200', emoji: '📱', label: '010 번호' };
      default:
        return { bg: 'bg-purple-50 text-purple-700 border-purple-200', emoji: '🚲', label: '귀중품' };
    }
  };

  const badge = getBadgeStyle();

  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
        isSelected
          ? 'bg-white border-sky-500 shadow-md ring-2 ring-sky-500/20'
          : 'bg-white hover:bg-slate-50 border-slate-200 shadow-xs'
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
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl bg-slate-100 shadow-inner">
            {badge.emoji}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-slate-900 text-sm">{device.name}</h3>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${badge.bg}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
              {device.phoneNumber && (
                <span className="font-bold text-sky-700 flex items-center gap-0.5">
                  <Phone className="w-3 h-3" /> {device.phoneNumber}
                </span>
              )}
              {!device.phoneNumber && device.model}
            </p>
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
          <span className="text-[11px] font-bold text-slate-500">
            {device.status === 'online' ? '정상 수신' : '대기중'}
          </span>
        </div>
      </div>

      {/* Current Location snippet */}
      <div className="mt-3 p-2 rounded-xl bg-slate-50 flex items-start gap-1.5 text-xs text-slate-700 border border-slate-100">
        <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
        <span className="truncate">{device.currentLocation.address || '서울시 테헤란로'}</span>
      </div>

      {/* Hardware Stats bar (Battery, Signal, Trail points count) */}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-3">
          {/* Battery */}
          <div className="flex items-center gap-1">
            {device.isCharging ? (
              <BatteryCharging className="w-4 h-4 text-emerald-600" />
            ) : (
              <Battery
                className={`w-4 h-4 ${
                  device.battery <= 20
                    ? 'text-rose-500'
                    : device.battery <= 50
                    ? 'text-amber-500'
                    : 'text-emerald-600'
                }`}
              />
            )}
            <span className="font-mono font-bold text-slate-700">{device.battery}%</span>
          </div>

          {/* Signal */}
          <div className="flex items-center gap-1">
            <Signal className="w-3.5 h-3.5 text-sky-600" />
            <span className="text-[11px] font-medium">LTE</span>
          </div>

          {/* Today Trail points count */}
          <div className="flex items-center gap-1 text-slate-600">
            <Route className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[11px] font-semibold">궤적 {device.todayTrail.length}개</span>
          </div>
        </div>

        {/* Last updated */}
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <Clock className="w-3 h-3" />
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
          className="py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
        >
          <Volume2 className="w-3.5 h-3.5 text-amber-500" />
          <span>소리 찾기</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenPlayback();
          }}
          className="py-1.5 px-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center gap-1 transition-all border border-sky-100 cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>전체 궤적 조회</span>
        </button>
      </div>
    </div>
  );
};
