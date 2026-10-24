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
import { LandingPage } from './components/Landing/LandingPage';
import { Bell, Navigation, Building2, BellOff, X } from 'lucide-react';

export function App() {
  // Navigation View: 'landing' (회사 홈페이지) or 'tracker' (실시간 관제)
  const [currentView, setCurrentView] = useState<'landing' | 'tracker'>('landing');

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
  const [mapStyle, setMapStyle] = useState<'voyager' | 'osm' | 'satellite'>('voyager');

  // Map Notification Toggle (User requirement: 알림 끄는 토글)
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);

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

    const isMissing = selectedDevice?.isMissingMode;
    const baseInterval = isMissing ? 1000 : 3000;
    const intervalMs = Math.max(500, baseInterval / simSpeed);

    const timer = setInterval(() => {
      setDevices((prevDevices) => {
        return prevDevices.map((dev) => {
          if (dev.id === selectedDeviceId || isSimulating) {
            const { updatedDevice, newNotifications } = engineRef.current!.tickDevice(dev, geofences);

            if (newNotifications.length > 0) {
              setNotifications((prevN) => [...newNotifications, ...prevN]);

              // Trigger Audio & Toast only if notifications are enabled
              if (notificationsEnabled) {
                const latest = newNotifications[0];
                setToast(latest);
                sounds.playGeofenceAlert();

                setTimeout(() => {
                  setToast((curr) => (curr?.id === latest.id ? null : curr));
                }, 4000);
              }
            }

            return updatedDevice;
          }
          return dev;
        });
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isSimulating, simSpeed, selectedDeviceId, selectedDevice?.isMissingMode, geofences, notificationsEnabled]);

  // Handlers
  const handleTriggerBeep = (dev?: Device) => {
    const target = dev || selectedDevice;
    if (!target) return;
    sounds.playTrackerBeep();
    if (notificationsEnabled) {
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
    }
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
    <div className="w-screen h-screen overflow-hidden bg-white text-slate-900 font-sans relative">
      {/* View Switcher Floating Top Bar (Clean White Pill Theme) */}
      <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-[999] flex items-center p-1 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl text-xs font-bold text-slate-700">
        <button
          onClick={() => setCurrentView('landing')}
          className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
            currentView === 'landing'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>나빅스 회사 공식몰</span>
        </button>
        <button
          onClick={() => setCurrentView('tracker')}
          className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
            currentView === 'tracker'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>실시간 관제 (NAVIX GO)</span>
        </button>
      </div>

      {/* VIEW 1: Company Landing Page (Bright White Theme) */}
      {currentView === 'landing' ? (
        <div className="w-full h-full overflow-y-auto pt-10">
          <LandingPage onGoToTracker={() => setCurrentView('tracker')} />
        </div>
      ) : (
        /* VIEW 2: Real-time Tracker Web App (Bright White Theme) */
        <div className="flex flex-col w-full h-full overflow-hidden">
          {/* Header */}
          <Header
            devices={devices}
            selectedDevice={selectedDevice}
            onSelectDevice={(d) => setSelectedDeviceId(d.id)}
            onOpenRegisterModal={() => setIsRegisterOpen(true)}
            onOpenGeofenceModal={() => setIsGeofenceOpen(true)}
            onOpenNotificationDrawer={() => setIsNotifDrawerOpen(true)}
            onGoToLanding={() => setCurrentView('landing')}
            unreadCount={unreadCount}
          />

          {/* Main Map & Workspace */}
          <div className="flex-1 flex relative overflow-hidden bg-slate-50">
            {/* Left Sidebar (Desktop, Bright White Theme) */}
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

            {/* Map Area */}
            <main className="flex-1 relative h-full w-full">
              <MapView
                devices={devices}
                selectedDevice={selectedDevice}
                geofences={geofences}
                showGeofences={showGeofences}
                onSelectDevice={(d) => setSelectedDeviceId(d.id)}
                mapStyle={mapStyle}
              />

              {/* Floating Map Controls with Alert Toggle */}
              <MapControls
                selectedDevice={selectedDevice}
                showGeofences={showGeofences}
                onToggleGeofences={() => setShowGeofences(!showGeofences)}
                onCenterDevice={() => {
                  if (selectedDevice) {
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
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={() => setNotificationsEnabled(!notificationsEnabled)}
              />

              {/* Toast Notification (Bright White Theme) */}
              {toast && notificationsEnabled && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[700] w-[90%] max-w-md bg-white text-slate-900 p-3.5 rounded-2xl shadow-2xl border border-sky-300 backdrop-blur-md flex items-center justify-between gap-3 animate-slide-down">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-sky-500 text-white shrink-0 shadow-xs">
                      <Bell className="w-4 h-4 animate-bounce" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-sky-700">{toast.title}</h5>
                      <p className="text-xs text-slate-600 line-clamp-1">{toast.message}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setToast(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
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
            onSelectNotificationLocation={() => {}}
          />
        </div>
      )}
    </div>
  );
}

export default App;
