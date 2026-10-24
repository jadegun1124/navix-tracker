import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Calendar,
  Clock,
  MapPin,
  TrendingUp,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { Device, GPSPoint } from '../../types';

interface RoutePlaybackModalProps {
  device: Device;
  onClose: () => void;
}

export const RoutePlaybackModal: React.FC<RoutePlaybackModalProps> = ({ device, onClose }) => {
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-24');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const trail = device.historicalTrails[selectedDate] || device.todayTrail;
  const timerRef = useRef<number | null>(null);

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const intervalMs = Math.max(150, 1000 / playbackSpeed);
    timerRef.current = window.setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= trail.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, trail.length]);

  const currentPoint: GPSPoint = trail[currentIndex] || trail[0];
  const progressPercent = trail.length > 1 ? (currentIndex / (trail.length - 1)) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                과거 이동 경로 조회 & 타임라인 재생
              </h2>
              <p className="text-xs text-slate-400">
                {device.name} ({device.model})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Date Selector Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {['2026-10-24', '2026-10-23', '2026-10-22'].map((dateStr) => {
              const label =
                dateStr === '2026-10-24'
                  ? '오늘 (10/24)'
                  : dateStr === '2026-10-23'
                  ? '어제 (10/23)'
                  : '그저께 (10/22)';
              const isActive = selectedDate === dateStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    setSelectedDate(dateStr);
                    setCurrentIndex(0);
                    setIsPlaying(false);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Trip Summary Statistics */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-semibold text-slate-400 block">총 이동 거리</span>
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-mono">
                {device.stats.todayDistanceKm} km
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-semibold text-slate-400 block">운행/이동 시간</span>
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-mono">
                {device.stats.todayDurationMinutes}분
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-semibold text-slate-400 block">최고 속도</span>
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-mono">
                {device.stats.topSpeedKmH} km/h
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-semibold text-slate-400 block">정차 횟수</span>
              <span className="text-sm font-extrabold text-sky-600 dark:text-sky-400 font-mono">
                {device.stats.stopCount} 회
              </span>
            </div>
          </div>

          {/* Current Frame Info Card */}
          <div className="p-4 rounded-2xl bg-sky-50/70 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 flex items-start justify-between">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-xl bg-sky-500 text-white mt-0.5">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {currentPoint.address || '현재 구간 통과 중'}
                  </span>
                  {currentPoint.isStopPoint && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white font-bold text-[10px]">
                      정차 {currentPoint.stopDurationMinutes}분
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  <span>시각: {currentPoint.timestamp}</span>
                  <span>속도: {currentPoint.speed || 0} km/h</span>
                  <span>좌표: {currentPoint.lat.toFixed(4)}, {currentPoint.lng.toFixed(4)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Playback Controls & Slider */}
          <div className="space-y-3 pt-2">
            {/* Time slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>{trail[0]?.timestamp || '00:00:00'}</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">{currentPoint.timestamp}</span>
                <span>{trail[trail.length - 1]?.timestamp || '23:59:59'}</span>
              </div>
              <input
                type="range"
                min={0}
                max={trail.length - 1}
                value={currentIndex}
                onChange={(e) => {
                  setCurrentIndex(Number(e.target.value));
                  setIsPlaying(false);
                }}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>

            {/* Controller buttons */}
            <div className="flex items-center justify-between pt-1">
              {/* Reset */}
              <button
                onClick={() => {
                  setCurrentIndex(0);
                  setIsPlaying(false);
                }}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1"
                title="처음으로 되감기"
              >
                <RotateCcw className="w-4 h-4" />
                <span>처음으로</span>
              </button>

              {/* Play / Pause Main button */}
              <button
                onClick={() => {
                  if (currentIndex >= trail.length - 1) {
                    setCurrentIndex(0);
                  }
                  setIsPlaying(!isPlaying);
                }}
                className="px-6 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm shadow-lg shadow-sky-500/25 flex items-center gap-2 transition-all active:scale-95"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? '일시 정지' : '경로 재생'}</span>
              </button>

              {/* Speed toggle */}
              <button
                onClick={() => {
                  const nextSpeed = playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 5 : 1;
                  setPlaybackSpeed(nextSpeed);
                }}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1"
              >
                <FastForward className="w-4 h-4 text-sky-500" />
                <span>{playbackSpeed}x 배속</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
