import React, { useState, useEffect, useRef } from 'react';
import { Device, Geofence, AlertNotification } from './types';
import { INITIAL_DEVICES, INITIAL_GEOFENCES, INITIAL_NOTIFICATIONS } from './data/mockData';
import { GpsSimulationEngine } from './services/simulation';
import { sounds } from './utils/audio';

import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { BottomSheet } from './components/Layout/BottomSheet';
import { MapView } from './components/Map/MapView';
import { MapControls } from './components/Map/MapControls';
import { RoutePlaybackModal } from './components/Playback/RoutePlaybackModal';
import { GeofenceModal } from './components/Geofence/GeofenceModal';
import { DeviceRegisterModal } from './components/Device/DeviceRegisterModal';
import { NotificationDrawer } from './components/Notification/NotificationDrawer';
import { Bell, ShieldAlert, X } from 'lucide-react';

export function App() {
  // 1. Persistent State
  const [devices, setDevices] = useState<Device[]>(() => {
    const saved = localStorage.getItem('navix_devices');
    return saved ? JSON.parse(saved) : INITIAL_DEVICES;
  });

  const [geofences, setGeofences] = useState<Geofence[]>(() => {
    const saved = localStorage.getItem('navix_geofences');
    return saved ? JSON.parse(saved) : INITIAL_GEOFENCES;
  });

  const [notifications, setNotifications] = useState<AlertNotification[]>(() => {
    const saved = localStorage.getItem('navix_notifications');
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(devices[0]?.id || 'dev-1');
  const [showGeofences, setShowGeofences] = useState<boolean>(true);
  const [mapStyle, setMapStyle] = useState<'voyager' | 'light' | 'dark'>('voyager');

  // 2. Simulation State
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const engineRef = useRef<GpsSimulationEngine | null>(null);

  // 3. Modals & Drawers
  const [playbackDevice, setPlaybackDevice] = useState<Device | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [isGeofenceOpen, setIsGeofenceOpen] = useState<boolean>(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState<boolean>(false);

  // 4. Toast Notification
  const [toast, setToast] = useState<AlertNotification | null>(null);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('navix_devices', JSON.stringify(devices));
  }, [devices]);

  useEffect(() => {
    localStorage.setItem('navix_geofences', JSON.stringify(geofences));
  }, [geofences]);

  useEffect(() => {
    localStorage.setItem('navix_notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Init Engine
  useEffect(() => {
    engineRef.current = new GpsSimulationEngine(geofences, devices);
  }, []);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0] || null;

  // Real-time Simulation Clock
  useEffect(() => {
    if (!isSimulating || !engineRef.current) return;

    // missing mode speeds up tick
    const isMissing = selectedDevice?.isMissingMode;
    const baseInterval = isMissing ? 1000 : 3000;
    const intervalMs = Math.max(500, baseInterval / simSpeed);

    const timer = setInterval(() => {
      setDevices((prevDevices) => {
        return prevDevices.map((dev) => {
          // If in missing mode, prioritize this device, or tick all active devices
          if (dev.id === selectedDeviceId || isSimulating) {
            const { updatedDevice, newNotifications } = engineRef.current!.tickDevice(dev, geofences);

            if (newNotifications.length > 0) {
              setNotifications((prevN) => [...newNotifications, ...prevN]);
              const latest = newNotifications[0];
              setToast(latest);
              sounds.playGeofenceAlert();

              // Auto dismiss toast after 4s
              setTimeout(() => {
                setToast((curr) => (curr?.id === latest.id ? null : curr));
              }, 4000);
            }

            return updatedDevice;
          }
          return dev;
        });
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isSimulating, simSpeed, selectedDeviceId, selectedDevice?.isMissingMode, geofences]);

  // Handlers
  const handleTriggerBeep = (dev?: Device) => {
    const target = dev || selectedDevice;
    if (!target) return;
    sounds.playTrackerBeep();
    setToast({
      id: `toast-${Date.now()}`,
      deviceId: target.id,
      deviceName: target.name,
      deviceType: target.type,
      type: 'low_battery',
      title: '트래커 비프음 호출 성공',
      message: `${target.name} 단말기에서 '삐-삐-' 찾기 소리가 울리고 있습니다.`,
      timestamp: '방금',
      read: true,
    });
    setTimeout(() => setToast(null), 3500);
  };

  const handleTriggerSos = (dev: Device) => {
    sounds.playEmergencySiren();
    const sosNotif: AlertNotification = {
      id: `sos-${Date.now()}`,
      deviceId: dev.id,
      deviceName: dev.name,
      deviceType: dev.type,
      type: 'sos',
      title: '🚨 긴급 SOS 비상 호출 발생!',
      message: `${dev.name}의 SOS 버튼이 3초간 길게 눌렸습니다. 보호자 긴급 통화 및 경찰 안심망 공유가 활성화되었습니다.`,
      timestamp: '방금 전',
      read: false,
      lat: dev.currentLocation.lat,
      lng: dev.currentLocation.lng,
    };
    setNotifications((prev) => [sosNotif, ...prev]);
    setToast(sosNotif);
  };

  const handleToggleMissingMode = (dev: Device) => {
    const nextState = !dev.isMissingMode;
    setDevices((prev) =>
      prev.map((d) => (d.id === dev.id ? { ...d, isMissingMode: nextState } : d))
    );

    if (nextState) {
      sounds.playEmergencySiren();
      const notif: AlertNotification = {
        id: `missing-${Date.now()}`,
        deviceId: dev.id,
        deviceName: dev.name,
        deviceType: dev.type,
        type: 'missing_mode',
        title: '🚨 긴급 실종 모드 활성화',
        message: `${dev.name}의 위치 갱신 주기가 1초로 단축되었습니다. 주변 가족 및 보호자에게 실종 알림이 전파되었습니다.`,
        timestamp: '방금 전',
        read: false,
      };
      setNotifications((prev) => [notif, ...prev]);
      setToast(notif);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-900 text-slate-800 dark:text-slate-100 font-sans">
      {/* Top Header */}
      <Header
        devices={devices}
        selectedDevice={selectedDevice}
        onSelectDevice={(d) => setSelectedDeviceId(d.id)}
        onOpenRegisterModal={() => setIsRegisterOpen(true)}
        onOpenGeofenceModal={() => setIsGeofenceOpen(true)}
        onOpenNotificationDrawer={() => setIsNotifDrawerOpen(true)}
        unreadCount={unreadCount}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Left Sidebar (Desktop) */}
        <Sidebar
          devices={devices}
          selectedDevice={selectedDevice}
          onSelectDevice={(d) => setSelectedDeviceId(d.id)}
          onOpenPlayback={(d) => setPlaybackDevice(d)}
          onTriggerBeep={handleTriggerBeep}
          onTriggerSos={handleTriggerSos}
          onToggleMissingMode={handleToggleMissingMode}
          onOpenRegisterModal={() => setIsRegisterOpen(true)}
          onOpenGeofenceModal={() => setIsGeofenceOpen(true)}
        />

        {/* Map Center Area */}
        <main className="flex-1 relative h-full w-full">
          {/* Leaflet Map */}
          <MapView
            devices={devices}
            selectedDevice={selectedDevice}
            geofences={geofences}
            showGeofences={showGeofences}
            onSelectDevice={(d) => setSelectedDeviceId(d.id)}
            onOpenPlayback={(d) => setPlaybackDevice(d)}
            onTriggerBeep={handleTriggerBeep}
            mapStyle={mapStyle}
          />

          {/* Floating Map Controls */}
          <MapControls
            selectedDevice={selectedDevice}
            showGeofences={showGeofences}
            onToggleGeofences={() => setShowGeofences(!showGeofences)}
            onCenterDevice={() => {
              if (selectedDevice) {
                // re-triggers pan by toggling id or state
                setSelectedDeviceId(selectedDevice.id);
              }
            }}
            mapStyle={mapStyle}
            onChangeMapStyle={setMapStyle}
            isSimulating={isSimulating}
            simSpeed={simSpeed}
            onToggleSimulation={() => setIsSimulating(!isSimulating)}
            onChangeSimSpeed={setSimSpeed}
            onTriggerBeep={() => handleTriggerBeep()}
          />

          {/* Toast Notification Banner */}
          {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[700] w-[90%] max-w-md bg-slate-900/95 text-white p-3.5 rounded-2xl shadow-2xl border border-sky-500/50 backdrop-blur-md flex items-center justify-between gap-3 animate-slide-down">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-sky-500 text-white shrink-0">
                  <Bell className="w-4 h-4 animate-bounce" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-sky-400">{toast.title}</h5>
                  <p className="text-xs text-slate-200 line-clamp-1">{toast.message}</p>
                </div>
              </div>
              <button
                onClick={() => setToast(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Bottom Sheet (Mobile) */}
          <BottomSheet
            devices={devices}
            selectedDevice={selectedDevice}
            onSelectDevice={(d) => setSelectedDeviceId(d.id)}
            onOpenPlayback={(d) => setPlaybackDevice(d)}
            onTriggerBeep={handleTriggerBeep}
            onTriggerSos={handleTriggerSos}
            onToggleMissingMode={handleToggleMissingMode}
          />
        </main>
      </div>

      {/* Modals */}
      {playbackDevice && (
        <RoutePlaybackModal
          device={playbackDevice}
          onClose={() => setPlaybackDevice(null)}
        />
      )}

      {isRegisterOpen && (
        <DeviceRegisterModal
          onRegister={(newDev) => {
            setDevices((prev) => [newDev, ...prev]);
            setSelectedDeviceId(newDev.id);
          }}
          onClose={() => setIsRegisterOpen(false)}
        />
      )}

      {isGeofenceOpen && (
        <GeofenceModal
          geofences={geofences}
          selectedDevice={selectedDevice}
          onSaveGeofences={(updated) => setGeofences(updated)}
          onClose={() => setIsGeofenceOpen(false)}
        />
      )}

      <NotificationDrawer
        notifications={notifications}
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
        onMarkAllAsRead={() => {
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
        onClearAll={() => setNotifications([])}
        onSelectNotificationLocation={(lat, lng) => {
          // If needed, focus on coordinate
        }}
      />
    </div>
  );
}

export default App;
