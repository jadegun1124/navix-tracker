import React from 'react';
import {
  GraduationCap,
  Footprints,
  Car,
  ShieldAlert,
  Volume2,
  CheckCircle2,
  MapPin,
  Calendar,
  Zap,
  Smartphone,
  Route,
  Navigation,
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
  // Smartphone 010 Tracking View
  if (device.type === 'smartphone') {
    return (
      <div className="flex flex-col gap-3">
        {/* Header Badge */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-sky-50 border border-sky-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-sky-600 text-white shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-bold text-slate-900">010 휴대폰 실시간 궤적</h4>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">LTE 동기화</span>
              </div>
              <p className="text-xs text-sky-700 font-semibold">{device.phoneNumber || '010 번호 연동 완료'}</p>
            </div>
          </div>
          <button
            onClick={onOpenPlayback}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-sky-100 text-sky-700 text-xs font-bold shadow-xs border border-sky-100 flex items-center gap-1 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>궤적 재생</span>
          </button>
        </div>

        {/* Live Trajectory Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">오늘 누적 궤적</span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">
              {device.stats.todayDistanceKm} km
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">실시간 속도</span>
            <span className="text-sm font-extrabold text-sky-600 font-mono">
              {device.currentLocation.speed || 4.2} km/h
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">수신 궤적 포인트</span>
            <span className="text-sm font-extrabold text-indigo-600 font-mono">
              {device.todayTrail.length} 개소
            </span>
          </div>
        </div>

        {/* Current Location Note */}
        <div className="p-2.5 rounded-xl bg-slate-100 text-xs flex items-center gap-2 text-slate-700">
          <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="truncate font-medium">{device.currentLocation.address || '서울시 강남구 테헤란로'}</span>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
          <button
            onClick={onTriggerBeep}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-amber-500" />
            <span>핸드폰 소리 울리기</span>
          </button>
          <button
            onClick={onOpenPlayback}
            className="p-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Route className="w-4 h-4 text-sky-600" />
            <span>이동 경로 타임라인</span>
          </button>
        </div>
      </div>
    );
  }

  // Child Theme View: School timeline & safety
  if (device.type === 'child') {
    return (
      <div className="flex flex-col gap-3">
        {/* Header Badge */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-sky-50 border border-sky-200">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-600 text-white">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">등하교 안심 타임라인</h4>
              <p className="text-xs text-sky-700 font-medium">안전구역 자동 감지 기록</p>
            </div>
          </div>
          <button
            onClick={onOpenPlayback}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-sky-100 text-sky-700 text-xs font-bold shadow-xs border border-sky-100 flex items-center gap-1 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>경로 재생</span>
          </button>
        </div>

        {/* Timeline Events List */}
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {CHILD_TIMELINE_EVENTS.map((evt: RouteTimelineEvent, idx: number) => (
            <div key={idx} className="relative group">
              <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-sky-500 ring-4 ring-sky-100"></span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{evt.title}</span>
                <span className="text-[11px] font-mono text-slate-400">{evt.time}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{evt.description}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onTriggerBeep}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-sky-600" />
            <span>트래커 찾기 (소리)</span>
          </button>
          <button
            onClick={onTriggerSos}
            className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600" />
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
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Footprints className={`w-5 h-5 ${device.isMissingMode ? 'text-white' : 'text-amber-600'}`} />
              <div>
                <h4 className={`text-sm font-bold ${device.isMissingMode ? 'text-white' : 'text-slate-900'}`}>
                  {device.isMissingMode ? '🚨 긴급 실종 모드 가동 중' : '반려동물 산책 & 실종 방지'}
                </h4>
                <p className={`text-xs ${device.isMissingMode ? 'text-rose-100' : 'text-amber-800'}`}>
                  {device.isMissingMode ? '1초 주기로 초고속 위치 수신 중!' : '안심존 반경 200m 이탈 시 즉시 경보'}
                </p>
              </div>
            </div>
            <button
              onClick={onToggleMissingMode}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer ${
                device.isMissingMode
                  ? 'bg-white text-rose-600 hover:bg-rose-50'
                  : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {device.isMissingMode ? '실종모드 해제' : '실종모드 가동'}
            </button>
          </div>
        </div>

        {/* Walk Stats Cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">오늘 산책 거리</span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">
              {device.stats.todayDistanceKm} km
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">산책 시간</span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">
              {device.stats.todayDurationMinutes}분
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">소모 칼로리</span>
            <span className="text-sm font-extrabold text-amber-600 font-mono">
              {Math.round(device.stats.todayDistanceKm * 65)} kcal
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onTriggerBeep}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-amber-500" />
            <span>목줄 비프음 울리기</span>
          </button>
          <button
            onClick={onOpenPlayback}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-sky-600" />
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
        <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-600 text-white">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">스마트 차량 운행 일지</h4>
              <p className="text-xs text-emerald-800 font-medium">국세청 제출 양식 호환 기록</p>
            </div>
          </div>
          <button
            onClick={onOpenPlayback}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-emerald-100 text-emerald-800 text-xs font-bold shadow-xs border border-emerald-100 flex items-center gap-1 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>운행 경로 재생</span>
          </button>
        </div>

        {/* Driving Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">금일 주행</span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">
              {device.stats.todayDistanceKm} km
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">최고 속도</span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">
              {device.stats.topSpeedKmH} km/h
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-semibold text-slate-500 block">주차 상태</span>
            <span className="text-sm font-bold text-emerald-600 flex items-center justify-center gap-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> 안전주차
            </span>
          </div>
        </div>

        {/* Current Location Note */}
        <div className="p-2.5 rounded-xl bg-slate-100 text-xs flex items-center gap-2 text-slate-700">
          <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="truncate font-medium">{device.currentLocation.address || '판교 R&D 센터 지하 2층'}</span>
        </div>
      </div>
    );
  }

  // Valuables View: Anti-theft & Sleep mode
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between p-3 rounded-2xl bg-purple-50 border border-purple-200">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-600 text-white">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">초저전력 도난 방지 모드</h4>
            <p className="text-xs text-purple-700 font-medium">충격/진동 감지 센서 ON</p>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 text-slate-700">
        <div className="flex justify-between">
          <span>대기 상태:</span>
          <span className="font-bold text-purple-600">절전 슬립 (정차 감지)</span>
        </div>
        <div className="flex justify-between">
          <span>예상 배터리 수명:</span>
          <span className="font-bold text-slate-900">약 45일 지속</span>
        </div>
        <div className="flex justify-between">
          <span>움직임 시 즉시 알림:</span>
          <span className="font-bold text-emerald-600">활성화됨</span>
        </div>
      </div>
    </div>
  );
};
