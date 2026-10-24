import React from 'react';
import {
  X,
  Bell,
  CheckCheck,
  ShieldAlert,
  ArrowRightCircle,
  ArrowLeftCircle,
  Zap,
  BatteryWarning,
  MapPin,
  Trash2,
} from 'lucide-react';
import { AlertNotification } from '../../types';

interface NotificationDrawerProps {
  notifications: AlertNotification[];
  isOpen: boolean;
  onClose: () => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onSelectNotificationLocation: (lat: number, lng: number) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  notifications,
  isOpen,
  onClose,
  onMarkAllAsRead,
  onClearAll,
  onSelectNotificationLocation,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getAlertIcon = (type: AlertNotification['type']) => {
    switch (type) {
      case 'geofence_enter':
        return <ArrowRightCircle className="w-5 h-5 text-emerald-500" />;
      case 'geofence_exit':
        return <ArrowLeftCircle className="w-5 h-5 text-amber-500" />;
      case 'sos':
      case 'missing_mode':
        return <ShieldAlert className="w-5 h-5 text-rose-500" />;
      case 'movement_detected':
        return <Zap className="w-5 h-5 text-purple-500" />;
      default:
        return <BatteryWarning className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/60 backdrop-blur-xs flex justify-end animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">실시간 알림 센터</h2>
              <p className="text-xs text-slate-400">안전구역, 이상 감지, 비상 호출 내역</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action bar */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <button
            onClick={onMarkAllAsRead}
            className="text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1 hover:underline"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>모두 읽음 처리</span>
          </button>
          <button
            onClick={onClearAll}
            className="text-slate-400 hover:text-rose-500 font-medium flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>전체 삭제</span>
          </button>
        </div>

        {/* Notifications list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
              <Bell className="w-12 h-12 stroke-1 mb-2 opacity-50" />
              <p className="text-sm font-semibold">새로운 알림이 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">이상 상황 발생 시 실시간으로 도착합니다.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (n.lat && n.lng) {
                    onSelectNotificationLocation(n.lat, n.lng);
                    onClose();
                  }
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  !n.read
                    ? 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800 shadow-sm'
                    : 'bg-white dark:bg-slate-800/80 border-slate-100 dark:border-slate-800 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getAlertIcon(n.type)}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{n.title}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{n.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {n.message}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">
                        기기: {n.deviceName}
                      </span>
                      {n.lat && n.lng && (
                        <span className="text-sky-500 font-medium flex items-center gap-0.5 hover:underline">
                          <MapPin className="w-3 h-3" /> 위치 보기
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
