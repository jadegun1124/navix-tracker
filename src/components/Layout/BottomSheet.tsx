import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Calendar, Volume2, ShieldAlert, Sparkles } from 'lucide-react';
import { Device } from '../../types';
import { TargetThemeView } from '../Device/TargetThemeView';
import { DeviceCard } from '../Device/DeviceCard';

interface BottomSheetProps {
  devices: Device[];
  selectedDevice: Device | null;
  onSelectDevice: (device: Device) => void;
  onOpenPlayback: (device: Device) => void;
  onTriggerBeep: (device: Device) => void;
  onTriggerSos: (device: Device) => void;
  onToggleMissingMode: (device: Device) => void;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  devices,
  selectedDevice,
  onSelectDevice,
  onOpenPlayback,
  onTriggerBeep,
  onTriggerSos,
  onToggleMissingMode,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  if (!selectedDevice) return null;

  return (
    <div
      className={`lg:hidden fixed inset-x-0 bottom-0 z-[600] bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl border-t border-slate-200/80 dark:border-slate-800 transition-all duration-300 flex flex-col ${
        isExpanded ? 'h-[75vh]' : 'h-36'
      }`}
    >
      {/* Grab Handle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full pt-3 pb-2 flex flex-col items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 rounded-t-3xl transition-colors cursor-pointer"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mb-1"></div>
        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
          <span>{isExpanded ? '접기' : '자세히 보기 (위로 당기기)'}</span>
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Peek summary row */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950 flex items-center justify-center text-xl shadow-xs">
            {selectedDevice.type === 'child'
              ? '🎒'
              : selectedDevice.type === 'pet'
              ? '🐕'
              : selectedDevice.type === 'vehicle'
              ? '🚗'
              : '🚲'}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{selectedDevice.name}</h3>
              <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-sky-100 text-sky-700">
                {selectedDevice.battery}%
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate max-w-[200px]">
              {selectedDevice.currentLocation.address || '실시간 위치 수신 중'}
            </p>
          </div>
        </div>

        {/* Quick buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onTriggerBeep(selectedDevice)}
            className="p-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-sm active:scale-95"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onOpenPlayback(selectedDevice)}
            className="p-2.5 rounded-xl bg-sky-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm active:scale-95"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Content View */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          {/* Target Theme Detailed View */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <TargetThemeView
              device={selectedDevice}
              onOpenPlayback={() => onOpenPlayback(selectedDevice)}
              onTriggerBeep={() => onTriggerBeep(selectedDevice)}
              onTriggerSos={() => onTriggerSos(selectedDevice)}
              onToggleMissingMode={() => onToggleMissingMode(selectedDevice)}
            />
          </div>

          {/* Device Switcher list */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 mb-2">다른 기기 전환</h4>
            <div className="space-y-2">
              {devices.map((dev) => (
                <div
                  key={dev.id}
                  onClick={() => onSelectDevice(dev)}
                  className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer ${
                    selectedDevice.id === dev.id
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20'
                      : 'border-slate-100 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {dev.type === 'child' ? '🎒' : dev.type === 'pet' ? '🐕' : dev.type === 'vehicle' ? '🚗' : '🚲'}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">{dev.name}</span>
                      <span className="text-[10px] text-slate-400">{dev.model}</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-500">{dev.battery}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
