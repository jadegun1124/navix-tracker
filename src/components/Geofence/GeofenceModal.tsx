import React, { useState } from 'react';
import {
  X,
  Shield,
  Plus,
  Trash2,
  MapPin,
  Home,
  GraduationCap,
  BookOpen,
  Trees,
  Building,
  Check,
} from 'lucide-react';
import { Geofence, Device } from '../../types';

interface GeofenceModalProps {
  geofences: Geofence[];
  selectedDevice: Device | null;
  onSaveGeofences: (geofences: Geofence[]) => void;
  onClose: () => void;
}

export const GeofenceModal: React.FC<GeofenceModalProps> = ({
  geofences,
  selectedDevice,
  onSaveGeofences,
  onClose,
}) => {
  const [list, setList] = useState<Geofence[]>(geofences);
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // New safe zone form state
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<Geofence['type']>('home');
  const [radius, setRadius] = useState<number>(200);
  const [color, setColor] = useState<string>('#3b82f6');
  const [alertOnEntry, setAlertOnEntry] = useState<boolean>(true);
  const [alertOnExit, setAlertOnExit] = useState<boolean>(true);

  const handleAdd = () => {
    if (!name.trim()) return;

    const baseLat = selectedDevice ? selectedDevice.currentLocation.lat : 37.4982;
    const baseLng = selectedDevice ? selectedDevice.currentLocation.lng : 127.0612;

    const newGeo: Geofence = {
      id: `geo-${Date.now()}`,
      name: name.trim(),
      type,
      lat: baseLat,
      lng: baseLng,
      radius,
      alertOnEntry,
      alertOnExit,
      color,
    };

    const updated = [...list, newGeo];
    setList(updated);
    onSaveGeofences(updated);
    setIsAdding(false);
    setName('');
  };

  const handleDelete = (id: string) => {
    const updated = list.filter((g) => g.id !== id);
    setList(updated);
    onSaveGeofences(updated);
  };

  const getIcon = (t: Geofence['type']) => {
    switch (t) {
      case 'home':
        return <Home className="w-4 h-4 text-sky-500" />;
      case 'school':
        return <GraduationCap className="w-4 h-4 text-emerald-500" />;
      case 'academy':
        return <BookOpen className="w-4 h-4 text-purple-500" />;
      case 'park':
        return <Trees className="w-4 h-4 text-amber-500" />;
      default:
        return <Building className="w-4 h-4 text-cyan-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">안전구역(지오펜스) 설정</h2>
              <p className="text-xs text-slate-400">진입/이탈 시 스마트폰 및 카카오 알림톡 자동 발송</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {!isAdding ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  등록된 안전구역 ({list.length}개)
                </span>
                <button
                  onClick={() => setIsAdding(true)}
                  className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-sky-500/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>새 구역 추가</span>
                </button>
              </div>

              {list.map((geo) => (
                <div
                  key={geo.id}
                  className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 shadow-sm border"
                      style={{ borderColor: geo.color }}
                    >
                      {getIcon(geo.type)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{geo.name}</h4>
                      <p className="text-xs text-slate-400">
                        반경 {geo.radius}m • {geo.alertOnEntry ? '진입알림' : ''}{' '}
                        {geo.alertOnExit ? '이탈알림' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(geo.id)}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            /* Add Safe Zone Form */
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">새 안전구역 등록</h3>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  안전구역 이름
                </label>
                <input
                  type="text"
                  placeholder="예: 우리집, 대치초등학교, 태권도학원"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  분류 아이콘
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { id: 'home', label: '집', color: '#3b82f6' },
                    { id: 'school', label: '학교', color: '#10b981' },
                    { id: 'academy', label: '학원', color: '#8b5cf6' },
                    { id: 'park', label: '공원', color: '#f59e0b' },
                    { id: 'company', label: '회사', color: '#06b6d4' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setType(cat.id as Geofence['type']);
                        setColor(cat.color);
                      }}
                      className={`p-2 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        type === cat.id
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-950 text-sky-700 font-bold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {getIcon(cat.id as Geofence['type'])}
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  <span>안심 반경 거리</span>
                  <span className="font-bold text-sky-500">{radius} m</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={1500}
                  step={50}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">알림 발송 옵션</span>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertOnEntry}
                    onChange={(e) => setAlertOnEntry(e.target.checked)}
                    className="rounded text-sky-500 focus:ring-sky-500"
                  />
                  <span>구역 진입 시 알림 받기</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertOnExit}
                    onChange={(e) => setAlertOnExit(e.target.checked)}
                    className="rounded text-sky-500 focus:ring-sky-500"
                  />
                  <span>구역 이탈 시 즉시 경보 받기</span>
                </label>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!name.trim()}
                  className="w-1/2 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-sky-500/20"
                >
                  안전구역 저장
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
