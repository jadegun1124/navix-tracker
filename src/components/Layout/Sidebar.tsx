import React, { useState } from 'react';
import {
  List,
  Layers,
  Shield,
  CreditCard,
  Share2,
  Calendar,
  Volume2,
  Plus,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Device } from '../../types';
import { DeviceCard } from '../Device/DeviceCard';
import { TargetThemeView } from '../Device/TargetThemeView';

interface SidebarProps {
  devices: Device[];
  selectedDevice: Device | null;
  onSelectDevice: (device: Device) => void;
  onOpenPlayback: (device: Device) => void;
  onTriggerBeep: (device: Device) => void;
  onTriggerSos: (device: Device) => void;
  onToggleMissingMode: (device: Device) => void;
  onOpenRegisterModal: () => void;
  onOpenGeofenceModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  devices,
  selectedDevice,
  onSelectDevice,
  onOpenPlayback,
  onTriggerBeep,
  onTriggerSos,
  onToggleMissingMode,
  onOpenRegisterModal,
  onOpenGeofenceModal,
}) => {
  const [activeTab, setActiveTab] = useState<'detail' | 'list'>('detail');

  return (
    <aside className="hidden lg:flex w-96 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md border-r border-slate-200/80 dark:border-slate-800 flex-col h-full shrink-0 z-[400] overflow-hidden">
      {/* Top Tab Bar */}
      <div className="p-3 border-b border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-2 gap-1.5 shrink-0">
        <button
          onClick={() => setActiveTab('detail')}
          className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'detail'
              ? 'bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>관제 상세 뷰</span>
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'list'
              ? 'bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <List className="w-4 h-4" />
          <span>기기 목록 ({devices.length})</span>
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'detail' && selectedDevice && (
          <div className="space-y-4">
            {/* Device Info Card */}
            <DeviceCard
              device={selectedDevice}
              isSelected={true}
              onSelect={() => {}}
              onOpenPlayback={() => onOpenPlayback(selectedDevice)}
              onTriggerBeep={() => onTriggerBeep(selectedDevice)}
            />

            {/* Target Dedicated Theme View */}
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
              <TargetThemeView
                device={selectedDevice}
                onOpenPlayback={() => onOpenPlayback(selectedDevice)}
                onTriggerBeep={() => onTriggerBeep(selectedDevice)}
                onTriggerSos={() => onTriggerSos(selectedDevice)}
                onToggleMissingMode={() => onToggleMissingMode(selectedDevice)}
              />
            </div>

            {/* Voucher & Subscription info badge */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs text-sky-400 font-bold">
                  <CreditCard className="w-4 h-4" />
                  <span>서비스 이용권 정보</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/30 text-sky-300 border border-sky-400/40">
                  D-{selectedDevice.voucher.daysLeft}
                </span>
              </div>
              <h4 className="font-bold text-sm">{selectedDevice.voucher.planName}</h4>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                유효기간: {selectedDevice.voucher.expiresAt} 까지
              </p>
            </div>
          </div>
        )}

        {/* Device List View */}
        {(activeTab === 'list' || !selectedDevice) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">전체 등록 기기</span>
              <button
                onClick={onOpenRegisterModal}
                className="text-xs font-bold text-sky-500 hover:text-sky-600 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>새 기기</span>
              </button>
            </div>

            {devices.map((dev) => (
              <DeviceCard
                key={dev.id}
                device={dev}
                isSelected={selectedDevice?.id === dev.id}
                onSelect={() => {
                  onSelectDevice(dev);
                  setActiveTab('detail');
                }}
                onOpenPlayback={() => onOpenPlayback(dev)}
                onTriggerBeep={() => onTriggerBeep(dev)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
