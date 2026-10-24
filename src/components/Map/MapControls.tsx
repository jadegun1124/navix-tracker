import React from 'react';
import {
  Crosshair,
  Shield,
  Layers,
  Play,
  Pause,
  FastForward,
  Volume2,
  Bell,
  BellOff,
} from 'lucide-react';
import { Device } from '../../types';

interface MapControlsProps {
  selectedDevice: Device | null;
  showGeofences: boolean;
  onToggleGeofences: () => void;
  onCenterDevice: () => void;
  mapStyle: 'voyager' | 'osm' | 'satellite';
  onChangeMapStyle: (style: 'voyager' | 'osm' | 'satellite') => void;
  isSimulating: boolean;
  simSpeed: number;
  onToggleSimulation: () => void;
  onChangeSimSpeed: (speed: number) => void;
  onTriggerBeep: () => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
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
  notificationsEnabled,
  onToggleNotifications,
}) => {
  return (
    <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2 pointer-events-auto">
      {/* Simulation & Notification Controller Card (Bright White Theme) */}
      <div className="bg-white/95 backdrop-blur-md p-2 rounded-2xl shadow-xl border border-slate-200 text-slate-800 flex items-center gap-2">
        {/* Play/Pause Simulation */}
        <button
          onClick={onToggleSimulation}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs ${
            isSimulating
              ? 'bg-amber-500 hover:bg-amber-600 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
          title={isSimulating ? '시뮬레이션 일시정지' : '실시간 시뮬레이션 시작'}
        >
          {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isSimulating ? '실시간 갱신중' : 'GPS 시작'}</span>
        </button>

        {/* Speed multiplier button */}
        <button
          onClick={() => {
            const nextSpeed = simSpeed === 1 ? 2 : simSpeed === 2 ? 5 : 1;
            onChangeSimSpeed(nextSpeed);
          }}
          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 border border-slate-200"
          title="시뮬레이션 속도 배율"
        >
          <FastForward className="w-3 h-3 text-sky-600" />
          <span>{simSpeed}x</span>
        </button>

        {/* Map Notification Mute/Unmute Toggle (User Request) */}
        <button
          onClick={onToggleNotifications}
          className={`px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border ${
            notificationsEnabled
              ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
              : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
          }`}
          title={notificationsEnabled ? '실시간 맵 알림 끄기(무음)' : '실시간 맵 알림 켜기'}
        >
          {notificationsEnabled ? (
            <>
              <Bell className="w-3.5 h-3.5 text-sky-600" />
              <span>알림 ON</span>
            </>
          ) : (
            <>
              <BellOff className="w-3.5 h-3.5 text-slate-400" />
              <span>알림 OFF</span>
            </>
          )}
        </button>
      </div>

      {/* Floating Action Buttons (Bright White Theme) */}
      <div className="flex flex-col gap-2 items-end">
        {/* Tracker Locator Beep Button */}
        {selectedDevice && (
          <button
            onClick={onTriggerBeep}
            className="p-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl shadow-lg border border-amber-400 transition-transform active:scale-95 flex items-center gap-1.5 font-bold text-xs cursor-pointer"
            title="기기에서 삐-삐- 비프음 소리 울리기"
          >
            <Volume2 className="w-4 h-4" />
            <span className="hidden sm:inline">소리 찾기</span>
          </button>
        )}

        {/* Center device */}
        <button
          onClick={onCenterDevice}
          disabled={!selectedDevice}
          className="p-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-sky-600 rounded-2xl shadow-lg border border-slate-200 backdrop-blur-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          title="현재 선택된 기기 위치로 이동"
        >
          <Crosshair className="w-5 h-5" />
        </button>

        {/* Toggle Geofence Safe Zones */}
        <button
          onClick={onToggleGeofences}
          className={`p-3 rounded-2xl shadow-lg border transition-all active:scale-95 backdrop-blur-md cursor-pointer ${
            showGeofences
              ? 'bg-sky-600 text-white border-sky-500'
              : 'bg-white text-slate-700 hover:text-sky-600 border-slate-200'
          }`}
          title="안전구역(지오펜스) 표시 On/Off"
        >
          <Shield className="w-5 h-5" />
        </button>

        {/* Toggle Map Tiles: Voyager -> OSM -> Satellite */}
        <button
          onClick={() => {
            const next = mapStyle === 'voyager' ? 'satellite' : mapStyle === 'satellite' ? 'osm' : 'voyager';
            onChangeMapStyle(next);
          }}
          className="p-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-sky-600 rounded-2xl shadow-lg border border-slate-200 backdrop-blur-md transition-all active:scale-95 cursor-pointer flex flex-col items-center"
          title={`지도 레이어 전환 (현재: ${mapStyle === 'satellite' ? '위성 지도' : mapStyle === 'osm' ? '오픈스트리트맵' : '일반 로드맵'})`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5 text-slate-500">
            {mapStyle === 'satellite' ? '위성' : mapStyle === 'osm' ? 'OSM' : '일반'}
          </span>
        </button>
      </div>
    </div>
  );
};
