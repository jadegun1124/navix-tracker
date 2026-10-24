import React from 'react';
import {
  GraduationCap,
  Footprints,
  Car,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Compass,
  Volume2,
  CheckCircle2,
  MapPin,
  Calendar,
  Zap,
} from 'lucide-react';
import { Device, RouteTimelineEvent } from '../../types';
import { CHILD_TIMELINE_EVENTS } from '../../data/mockData';

interface TargetThemeViewProps {
  device: Device;
  onOpenPlayback: () => void;
  onTriggerBeep: () => void;
  onTriggerSos: () => void;
  onToggleMissingMode: () => void;
}

export const TargetThemeView: React.FC<TargetThemeViewProps> = ({
  device,
  onOpenPlayback,
  onTriggerBeep,
  onTriggerSos,
  onToggleMissingMode,
}) => {
  // Child Theme View: School timeline & safety
  if (device.type === 'child') {
    return (
      <div className="flex flex-col gap-3">
        {/* Header Badge */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-500 text-white">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">등하교 안심 타임라인</h4>
              <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">안전구역 자동 감지 기록</p>
            </div>
          </div>
          <button
            onClick={onOpenPlayback}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-100 text-sky-700 dark:text-sky-300 text-xs font-semibold shadow-sm border border-sky-100 flex items-center gap-1"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>경로 재생</span>
          </button>
        </div>

        {/* Timeline Events List */}
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
          {CHILD_TIMELINE_EVENTS.map((evt: RouteTimelineEvent, idx: number) => (
            <div key={idx} className="relative group">
              <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-sky-500 ring-4 ring-sky-100 dark:ring-sky-900"></span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{evt.title}</span>
                <span className="text-[11px] font-mono text-slate-400">{evt.time}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{evt.description}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onTriggerBeep}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <Volume2 className="w-4 h-4 text-sky-500" />
            <span>트래커 찾기 (소리)</span>
          </button>
          <button
            onClick={onTriggerSos}
            className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <span>SOS 비상 시뮬레이션</span>
          </button>
        </div>
      </div>
    );
  }

  // Pet Theme View: Walk Stats & Missing Mode
  if (device.type === 'pet') {
    return (
      <div className="flex flex-col gap-3">
        {/* Missing Mode Banner */}
        <div
          className={`p-3.5 rounded-2xl border transition-all ${
            device.isMissingMode
              ? 'bg-rose-500 text-white border-rose-600 shadow-lg animate-pulse'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Footprints className={`w-5 h-5 ${device.isMissingMode ? 'text-white' : 'text-amber-600'}`} />
              <div>
                <h4 className={`text-sm font-bold ${device.isMissingMode ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                  {device.isMissingMode ? '🚨 긴급 실종 모드 가동 중' : '반려동물 산책 & 실종 방지'}
                </h4>
                <p className={`text-xs ${device.isMissingMode ? 'text-rose-100' : 'text-amber-700 dark:text-amber-400'}`}>
                  {device.isMissingMode ? '1초 주기로 초고속 위치 수신 중!' : '안심존 반경 200m 이탈 시 즉시 경보'}
                </p>
              </div>
            </div>
            <button
              onClick={onToggleMissingMode}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow-md transition-all ${
                device.isMissingMode
                  ? 'bg-white text-rose-600 hover:bg-rose-50'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-600'
              }`}
            >
              {device.isMissingMode ? '실종모드 해제' : '실종모드 가동'}
            </button>
          </div>
        </div>

        {/* Walk Stats Cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 block">오늘 산책 거리</span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-mono">
              {device.stats.todayDistanceKm} km
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 block">산책 시간</span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-mono">
              {device.stats.todayDurationMinutes}분
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 block">소모 칼로리</span>
            <span className="text-sm font-extrabold text-amber-500 font-mono">
              {Math.round(device.stats.todayDistanceKm * 65)} kcal
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onTriggerBeep}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5"
          >
            <Volume2 className="w-4 h-4 text-amber-500" />
            <span>목줄 비프음 울리기</span>
          </button>
          <button
            onClick={onOpenPlayback}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5"
          >
            <Calendar className="w-4 h-4 text-sky-500" />
            <span>산책 궤적 재생</span>
          </button>
        </div>
      </div>
    );
  }

  // Vehicle Theme View: Driving log & parking position
  if (device.type === 'vehicle') {
    return (
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-600 text-white">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">스마트 차량 운행 일지</h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">국세청 제출 양식 호환 기록</p>
            </div>
          </div>
          <button
            onClick={onOpenPlayback}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-semibold shadow-sm border border-emerald-100 flex items-center gap-1"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>운행 경로 재생</span>
          </button>
        </div>

        {/* Driving Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 block">금일 주행</span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-mono">
              {device.stats.todayDistanceKm} km
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 block">최고 속도</span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-mono">
              {device.stats.topSpeedKmH} km/h
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 block">주차 상태</span>
            <span className="text-sm font-bold text-emerald-600 flex items-center justify-center gap-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> 안전주차
            </span>
          </div>
        </div>

        {/* Current Location Note */}
        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <MapPin className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="truncate">{device.currentLocation.address || '판교 R&D 센터 지하 2층'}</span>
        </div>
      </div>
    );
  }

  // Valuables View: Anti-theft & Sleep mode
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-600 text-white">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">초저전력 도난 방지 모드</h4>
            <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">충격/진동 감지 센서 ON</p>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
        <div className="flex justify-between">
          <span>대기 상태:</span>
          <span className="font-semibold text-purple-600">절전 슬립 (정차 감지)</span>
        </div>
        <div className="flex justify-between">
          <span>예상 배터리 수명:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">약 45일 지속</span>
        </div>
        <div className="flex justify-between">
          <span>움직임 시 즉시 알림:</span>
          <span className="font-bold text-emerald-600">활성화됨</span>
        </div>
      </div>
    </div>
  );
};
