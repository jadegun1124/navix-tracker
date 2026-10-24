import React from 'react';
import { Crosshair, Shield, Layers, Play, Pause, FastForward, Volume2 } from 'lucide-react';
import { Device } from '../../types';

interface MapControlsProps {
  selectedDevice: Device | null;
  showGeofences: boolean;
  onToggleGeofences: () => void;
  onCenterDevice: () => void;
  mapStyle: 'voyager' | 'light' | 'dark';
  onChangeMapStyle: (style: 'voyager' | 'light' | 'dark') => void;
  isSimulating: boolean;
  simSpeed: number;
  onToggleSimulation: () => void;
  onChangeSimSpeed: (speed: number) => void;
  onTriggerBeep: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  selectedDevice,
  showGeofences,
  onToggleGeofences,
  onCenterDevice,
  mapStyle,
  onChangeMapStyle,
  isSimulating,
  simSpeed,
  onToggleSimulation,
  onChangeSimSpeed,
  onTriggerBeep,
}) => {
  return (
    <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2 pointer-events-auto">
      {/* Simulation Master Controller Card */}
      <div className="bg-slate-900/90 backdrop-blur-md p-2 rounded-2xl shadow-xl border border-slate-700/60 text-white flex items-center gap-2">
        <button
          onClick={onToggleSimulation}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
            isSimulating
              ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
              : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'
          }`}
          title={isSimulating ? '시뮬레이션 일시정지' : '실시간 시뮬레이션 시작'}
        >
          {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isSimulating ? '실시간 갱신중' : 'GPS 시작'}</span>
        </button>

        {/* Speed button */}
        <button
          onClick={() => {
            const nextSpeed = simSpeed === 1 ? 2 : simSpeed === 2 ? 5 : 1;
            onChangeSimSpeed(nextSpeed);
          }}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 border border-slate-700"
          title="시뮬레이션 속도 배율"
        >
          <FastForward className="w-3 h-3 text-cyan-400" />
          <span>{simSpeed}x</span>
        </button>
      </div>

      {/* Floating Action Buttons */}
      <div className="flex flex-col gap-2 items-end">
        {/* Tracker Locator Beep Button */}
        {selectedDevice && (
          <button
            onClick={onTriggerBeep}
            className="p-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl shadow-lg border border-white/20 transition-transform active:scale-95 flex items-center gap-1.5 font-bold text-xs"
            title="기기에서 삐-삐- 비프음 소리 울리기"
          >
            <Volume2 className="w-4 h-4 animate-bounce" />
            <span className="hidden sm:inline">소리 울리기</span>
          </button>
        )}

        {/* Center device */}
        <button
          onClick={onCenterDevice}
          disabled={!selectedDevice}
          className="p-3 bg-white/95 hover:bg-white text-slate-700 hover:text-sky-600 rounded-2xl shadow-lg border border-slate-200 backdrop-blur-md transition-all active:scale-95 disabled:opacity-50"
          title="현재 선택된 기기 위치로 이동"
        >
          <Crosshair className="w-5 h-5" />
        </button>

        {/* Toggle Geofence Safe Zones */}
        <button
          onClick={onToggleGeofences}
          className={`p-3 rounded-2xl shadow-lg border transition-all active:scale-95 backdrop-blur-md ${
            showGeofences
              ? 'bg-sky-500 text-white border-sky-400'
              : 'bg-white/95 text-slate-600 hover:text-sky-600 border-slate-200'
          }`}
          title="안전구역(지오펜스) 표시 On/Off"
        >
          <Shield className="w-5 h-5" />
        </button>

        {/* Toggle Map Tiles */}
        <button
          onClick={() => {
            const next = mapStyle === 'voyager' ? 'light' : mapStyle === 'light' ? 'dark' : 'voyager';
            onChangeMapStyle(next);
          }}
          className="p-3 bg-white/95 hover:bg-white text-slate-700 hover:text-sky-600 rounded-2xl shadow-lg border border-slate-200 backdrop-blur-md transition-all active:scale-95"
          title={`지도 스타일 변경 (현재: ${mapStyle})`}
        >
          <Layers className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
