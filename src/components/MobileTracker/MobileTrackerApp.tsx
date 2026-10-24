import React, { useState, useEffect, useRef } from 'react';
import { liveGeoTracker } from '../../services/liveGeolocation';
import { GpsFilteredResult, gpsPipeline, REJECT_REASON_KO } from '../../utils/gpsFilter';
import { realtimeApi } from '../../services/api';
import {
  ShieldCheck,
  Navigation,
  Smartphone,
  Activity,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Play,
  Square,
  ArrowLeft,
  ChevronRight,
  Eye,
  Radio,
  Sliders
} from 'lucide-react';

interface MobileTrackerAppProps {
  onBackToMap?: () => void;
  defaultPhoneNumber?: string;
}

interface TelemetryLogItem {
  id: string;
  time: string;
  rawLat: number;
  rawLng: number;
  smoothedLat: number;
  smoothedLng: number;
  accuracy: number;
  speed: number;
  distance: number;
  isAccepted: boolean;
  rejectReason?: string;
  kalmanGain: number;
}

export const MobileTrackerApp: React.FC<MobileTrackerAppProps> = ({
  onBackToMap,
  defaultPhoneNumber = '010-1234-5678',
}) => {
  const [phoneNumber, setPhoneNumber] = useState<string>(defaultPhoneNumber);
  const [deviceName, setDeviceName] = useState<string>('내 스마트폰 (umap 실시간)');
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  
  // Real-time telemetry state
  const [currentResult, setCurrentResult] = useState<GpsFilteredResult | null>(null);
  const [metrics, setMetrics] = useState(gpsPipeline.metrics);
  const [logs, setLogs] = useState<TelemetryLogItem[]>([]);
  
  // Custom algorithm threshold controls (optional fine-tuning)
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [accuracyLimit, setAccuracyLimit] = useState<number>(50); // ① 50m
  const [minDistance, setMinDistance] = useState<number>(5.0); // ② 5m
  const [maxSpeed, setMaxSpeed] = useState<number>(145.0); // ④ 145km/h

  // Trajectory points for mini canvas preview
  const [trail, setTrail] = useState<{ lat: number; lng: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Apply threshold adjustments to pipeline
  useEffect(() => {
    gpsPipeline.maxAllowedAccuracyMeters = accuracyLimit;
    gpsPipeline.minDistanceFilterMeters = minDistance;
    gpsPipeline.maxRealisticSpeedKmH = maxSpeed;
  }, [accuracyLimit, minDistance, maxSpeed]);

  // Check initial permission status if available
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((res) => {
        setPermissionState(res.state as any);
        res.onchange = () => setPermissionState(res.state as any);
      }).catch(() => {});
    }
  }, []);

  // Draw trail on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trail.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Find bounds
    const lats = trail.map((p) => p.lat);
    const lngs = trail.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latSpan = Math.max(0.0005, maxLat - minLat);
    const lngSpan = Math.max(0.0005, maxLng - minLng);

    const padding = 20;
    const toX = (lng: number) => padding + ((lng - minLng) / lngSpan) * (canvas.width - padding * 2);
    const toY = (lat: number) => canvas.height - (padding + ((lat - minLat) / latSpan) * (canvas.height - padding * 2));

    // Draw grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw path
    ctx.beginPath();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    trail.forEach((pt, idx) => {
      const x = toX(pt.lng);
      const y = toY(pt.lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw waypoints
    trail.forEach((pt, idx) => {
      const x = toX(pt.lng);
      const y = toY(pt.lat);
      ctx.beginPath();
      ctx.arc(x, y, idx === trail.length - 1 ? 7 : 3, 0, Math.PI * 2);
      ctx.fillStyle = idx === trail.length - 1 ? '#0284c7' : '#94a3b8';
      ctx.fill();

      if (idx === trail.length - 1) {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(2, 132, 199, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }, [trail]);

  // Start Real GPS Tracking with 4 Algorithm Pipeline
  const handleStartTracking = () => {
    const cleanPhone = phoneNumber.trim() || '010-0000-0000';
    const targetDeviceId = `phone-${cleanPhone.replace(/[^0-9]/g, '') || 'mobile-tracker'}`;

    // Register with backend / standalone sync
    realtimeApi.trackPhoneNumber(cleanPhone, deviceName);

    const success = liveGeoTracker.start(targetDeviceId, (result) => {
      setCurrentResult(result);
      setMetrics(result.filterMetrics);

      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];

      const logItem: TelemetryLogItem = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: timeStr,
        rawLat: result.rawLat,
        rawLng: result.rawLng,
        smoothedLat: result.lat,
        smoothedLng: result.lng,
        accuracy: result.accuracy,
        speed: result.speedKmH,
        distance: Number(result.distanceDeltaMeters.toFixed(1)),
        isAccepted: result.isAccepted,
        rejectReason: result.rejectReasonKorean || result.rejectReason,
        kalmanGain: result.filterMetrics.lastKalmanGain,
      };

      setLogs((prev) => [logItem, ...prev.slice(0, 49)]);

      if (result.isAccepted) {
        setTrail((prev) => [...prev, { lat: result.lat, lng: result.lng }]);
      }
    });

    if (success) {
      setIsTracking(true);
      setPermissionState('granted');
    }
  };

  const handleStopTracking = () => {
    liveGeoTracker.stop();
    setIsTracking(false);
  };

  const handleResetMetrics = () => {
    gpsPipeline.reset();
    setMetrics(gpsPipeline.metrics);
    setCurrentResult(null);
    setLogs([]);
    setTrail([]);
  };

  // Test Simulation buttons to visibly demonstrate algorithm filtering to user
  const handleSimulateOutlier = (type: 'ACCURACY' | 'SPEED' | 'JITTER') => {
    const baseLat = currentResult?.lat || 37.6550;
    const baseLng = currentResult?.lng || 127.0610;

    let testReading;
    if (type === 'ACCURACY') {
      // Simulate accuracy = 85m (> 50m)
      testReading = {
        lat: baseLat + 0.0001,
        lng: baseLng + 0.0001,
        accuracy: 85, // Discarded by ①
        timestamp: Date.now(),
        speed: 10,
      };
    } else if (type === 'SPEED') {
      // Simulate 500m jump in 1 second (> 145km/h)
      testReading = {
        lat: baseLat + 0.005, // ~550m jump
        lng: baseLng + 0.005,
        accuracy: 15,
        timestamp: Date.now(),
        speed: 500, // Discarded by ④
      };
    } else {
      // Simulate 1.5m stationary jitter (< 5m)
      testReading = {
        lat: baseLat + 0.00001, // ~1.1m
        lng: baseLng + 0.00001,
        accuracy: 10,
        timestamp: Date.now(),
        speed: 0,
      };
    }

    const res = gpsPipeline.processReading(testReading);
    setCurrentResult(res);
    setMetrics(res.filterMetrics);

    const now = new Date();
    setLogs((prev) => [
      {
        id: `sim-${Date.now()}`,
        time: now.toTimeString().split(' ')[0],
        rawLat: res.rawLat,
        rawLng: res.rawLng,
        smoothedLat: res.lat,
        smoothedLng: res.lng,
        accuracy: res.accuracy,
        speed: res.speedKmH,
        distance: Number(res.distanceDeltaMeters.toFixed(1)),
        isAccepted: res.isAccepted,
        rejectReason: res.rejectReasonKorean || res.rejectReason,
        kalmanGain: res.filterMetrics.lastKalmanGain,
      },
      ...prev.slice(0, 49),
    ]);
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans select-none pb-12">
      {/* Top Mobile Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          {onBackToMap && (
            <button
              onClick={onBackToMap}
              className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              title="전체 지도 관제로 돌아가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-xs">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 leading-tight flex items-center gap-1.5">
              <span>umap 위치추적 앱</span>
              <span className="px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700 text-[10px] font-bold">
                고정밀 GPS
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">4단계 필터링 & 칼만 보정 엔진</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer transition-colors"
            title="필터 알고리즘 임계값 상세 설정"
          >
            <Sliders className="w-4 h-4" />
          </button>
          {onBackToMap && (
            <button
              onClick={onBackToMap}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>지도 관제</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-md mx-auto w-full px-4 pt-4 flex flex-col gap-4">
        {/* Registration & Status Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">단말기 실시간 연동</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isTracking ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'
                }`}
              />
              <span
                className={`text-xs font-bold ${
                  isTracking ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                {isTracking ? '실시간 궤적 송신 중' : '추적 대기 중'}
              </span>
            </div>
          </div>

          {/* Phone Number Input */}
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                추적 대상 핸드폰 번호 (010)
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isTracking}
                  placeholder="010-XXXX-XXXX"
                  className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:border-sky-500 text-sm font-semibold text-slate-800 disabled:bg-slate-50"
                />
                <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">기기 닉네임</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                disabled={isTracking}
                placeholder="예: 내 갤럭시 S24, 자녀 스마트폰"
                className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:border-sky-500 text-sm font-semibold text-slate-800 disabled:bg-slate-50"
              />
            </div>
          </div>

          {/* Action Trigger Button */}
          {!isTracking ? (
            <button
              onClick={handleStartTracking}
              className="w-full py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow-lg shadow-sky-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>정확한 위치사용 권한 허용 및 추적 시작</span>
            </button>
          ) : (
            <button
              onClick={handleStopTracking}
              className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>위치 추적 중지</span>
            </button>
          )}

          <p className="text-[11px] text-slate-400 text-center mt-2.5">
            💡 화면 꺼짐 방지(WakeLock)가 자동 적용되어 폰이 잠들지 않고 정밀 궤적을 송신합니다.
          </p>
        </div>

        {/* Algorithm Settings Panel (Accordion) */}
        {showSettings && (
          <div className="bg-white rounded-3xl p-5 border border-sky-200 shadow-lg space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-sky-600" />
                <span>4단계 알고리즘 임계값 설정</span>
              </h3>
              <span className="text-[11px] font-medium text-sky-600">실시간 즉시 적용</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between font-bold text-slate-700 mb-1">
                  <span>① 오차 반경(Accuracy) 기준치</span>
                  <span className="text-sky-600">{accuracyLimit}m 초과 시 폐기</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="5"
                  value={accuracyLimit}
                  onChange={(e) => setAccuracyLimit(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between font-bold text-slate-700 mb-1">
                  <span>② 최소 이동 거리 (Distance Filter)</span>
                  <span className="text-sky-600">{minDistance}m 미만 무시</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="20"
                  step="1"
                  value={minDistance}
                  onChange={(e) => setMinDistance(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between font-bold text-slate-700 mb-1">
                  <span>④ 최고 정상 이동 속도 (Sanity Check)</span>
                  <span className="text-sky-600">{maxSpeed} km/h 초과 점프 폐기</span>
                </div>
                <input
                  type="range"
                  min="80"
                  max="250"
                  step="10"
                  value={maxSpeed}
                  onChange={(e) => setMaxSpeed(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4 Essential Algorithm HUD Status */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-md">
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-600" />
              <span>4단계 정밀 필터링 실시간 현황</span>
            </h3>
            <button
              onClick={handleResetMetrics}
              className="text-[11px] font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>초기화</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* ① Accuracy Filter */}
            <div className={`p-3.5 rounded-2xl border transition-all ${
              currentResult?.rejectReason === 'ACCURACY_TOO_LOW'
                ? 'bg-rose-50 border-rose-300'
                : currentResult?.isAccepted
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                <span className="text-slate-600">① 오차 반경</span>
                <span className={currentResult?.accuracy && currentResult.accuracy <= accuracyLimit ? 'text-emerald-700' : 'text-slate-500'}>
                  {currentResult ? `±${Math.round(currentResult.accuracy)}m` : '대기 중'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium line-clamp-1">
                {currentResult?.rejectReason === 'ACCURACY_TOO_LOW' ? (
                  <span className="text-rose-600 font-bold">❌ 50m 초과 폐기</span>
                ) : currentResult?.isAccepted ? (
                  <span className="text-emerald-700 font-bold">✅ 정상 통과</span>
                ) : (
                  '기준치 50m'
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                차단 누적: {metrics.accuracyRejectedCount}건
              </div>
            </div>

            {/* ② Distance Filter */}
            <div className={`p-3.5 rounded-2xl border transition-all ${
              currentResult?.rejectReason === 'DISTANCE_BELOW_THRESHOLD'
                ? 'bg-amber-50 border-amber-300'
                : currentResult?.isAccepted
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                <span className="text-slate-600">② 이동 거리</span>
                <span className="text-slate-800">
                  {currentResult ? `${currentResult.distanceDeltaMeters.toFixed(1)}m` : '0m'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium line-clamp-1">
                {currentResult?.rejectReason === 'DISTANCE_BELOW_THRESHOLD' ? (
                  <span className="text-amber-600 font-bold">⚠️ 정지 노이즈 무시</span>
                ) : currentResult?.isAccepted ? (
                  <span className="text-emerald-700 font-bold">✅ 이동 갱신</span>
                ) : (
                  '최소 5m 필터'
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                노이즈 제거: {metrics.stationaryJitterCount}건
              </div>
            </div>

            {/* ③ Kalman Filter */}
            <div className="p-3.5 rounded-2xl border bg-slate-50 border-slate-200">
              <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                <span className="text-slate-600">③ 칼만 게인(K)</span>
                <span className="text-sky-700 font-mono">
                  {metrics.lastKalmanGain.toFixed(3)}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                궤적 떨림 자동 보정
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                보정 좌표 생성 중
              </div>
            </div>

            {/* ④ Velocity Sanity Check */}
            <div className={`p-3.5 rounded-2xl border transition-all ${
              currentResult?.rejectReason === 'VELOCITY_SANITY_FAILED'
                ? 'bg-rose-50 border-rose-300'
                : currentResult?.isAccepted
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                <span className="text-slate-600">④ 속도 검증</span>
                <span className="text-slate-800 font-mono">
                  {currentResult ? `${currentResult.speedKmH}km/h` : '0km/h'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium line-clamp-1">
                {currentResult?.rejectReason === 'VELOCITY_SANITY_FAILED' ? (
                  <span className="text-rose-600 font-bold">❌ 점프 이상치 폐기</span>
                ) : (
                  <span className="text-emerald-700 font-bold">✅ 정상 속도</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                점프 차단: {metrics.speedOutlierCount}건
              </div>
            </div>
          </div>

          {/* Aggregate Metrics Bar */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-medium">
            <span>수신: <strong className="text-slate-900">{metrics.totalReceived}</strong>건</span>
            <span>정상 승인: <strong className="text-emerald-600">{metrics.acceptedCount}</strong>건</span>
            <span>필터 폐기: <strong className="text-rose-600">
              {metrics.accuracyRejectedCount + metrics.staleRejectedCount + metrics.stationaryJitterCount + metrics.speedOutlierCount}
            </strong>건</span>
          </div>
        </div>

        {/* Live Filter Demonstration Simulation Bar */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm">
          <span className="block text-xs font-bold text-slate-700 mb-2">
            🧪 필터링 알고리즘 즉시 테스트 (이상치 가상 주입)
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleSimulateOutlier('ACCURACY')}
              className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold text-center cursor-pointer transition-colors"
            >
              ① 오차 85m 주입
            </button>
            <button
              onClick={() => handleSimulateOutlier('JITTER')}
              className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold text-center cursor-pointer transition-colors"
            >
              ② 정지 1.5m 주입
            </button>
            <button
              onClick={() => handleSimulateOutlier('SPEED')}
              className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold text-center cursor-pointer transition-colors"
            >
              ④ 시속 500km 주입
            </button>
          </div>
        </div>

        {/* Real-time Trajectory Canvas Preview */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-sky-600" />
              <span>실시간 이동 궤적 시각화 (칼만 보정 완료)</span>
            </span>
            <span className="text-[11px] font-bold text-sky-600">{trail.length}개 포인트</span>
          </div>

          <div className="w-full h-44 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden relative flex items-center justify-center">
            {trail.length === 0 ? (
              <div className="text-center text-slate-400 text-xs px-4">
                <Navigation className="w-6 h-6 mx-auto mb-1.5 opacity-40 text-sky-500 animate-pulse" />
                <span>추적을 시작하거나 걸어 이동하시면 보정된 실시간 궤적이 여기에 그려집니다.</span>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                width={380}
                height={176}
                className="w-full h-full block"
              />
            )}
          </div>
        </div>

        {/* Telemetry Event Stream Log */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-sky-600" />
              <span>패킷 수신 & 필터링 판정 실시간 로그</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">최근 50건</span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
            {logs.length === 0 ? (
              <p className="text-slate-400 text-center py-4">수신된 패킷 로그가 없습니다.</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all ${
                    log.isAccepted
                      ? 'bg-slate-50/70 border-slate-200 text-slate-800'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-bold">{log.time}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        log.isAccepted
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {log.isAccepted ? '승인 (통과)' : `폐기: ${log.rejectReason}`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>오차: ±{Math.round(log.accuracy)}m</span>
                    <span>이동: {log.distance}m</span>
                    <span>속도: {log.speed}km/h</span>
                    <span>Kalman K: {log.kalmanGain}</span>
                  </div>

                  <div className="text-[10px] font-mono text-slate-400 truncate">
                    좌표: {log.smoothedLat.toFixed(6)}, {log.smoothedLng.toFixed(6)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
