import React, { useState, useEffect, useRef } from 'react';
import { Device, Geofence, AlertNotification } from './types';
import { INITIAL_DEVICES, INITIAL_GEOFENCES, INITIAL_NOTIFICATIONS, createPhoneTrackingDevice } from './data/mockData';
import { GpsSimulationEngine } from './services/simulation';
import { realtimeApi } from './services/api';
import { liveGeoTracker } from './services/liveGeolocation';
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
import { Bell, Navigation, Building2, LocateFixed, X, Route } from 'lucide-react';

export function App() {
  // Navigation View: 'landing' (회사 홈페이지) or 'tracker' (실시간 관제)
  const [currentView, setCurrentView] = useState<'landing' | 'tracker'>('tracker');

  // 1. Devices & Real-time State
  const [devices, setDevices] = useState<Device[]>(() => {
    const saved = localStorage.getItem('umap_devices');
    return saved ? JSON.parse(saved) : INITIAL_DEVICES;
  });

  const [geofences, setGeofences] = useState<Geofence[]>(() => {
    const saved = localStorage.getItem('umap_geofences');
    return saved ? JSON.parse(saved) : INITIAL_GEOFENCES;
  });

  const [notifications, setNotifications] = useState<AlertNotification[]>(() => {
    const saved = localStorage.getItem('umap_notifications');
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(devices[0]?.id || 'dev-1');
  const [showGeofences, setShowGeofences] = useState<boolean>(true);
  const [mapStyle, setMapStyle] = useState<'voyager' | 'osm' | 'satellite'>('voyager');

  // Map Notification Toggle
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);

  // Real Physical GPS Tracking Toggle (Native Geolocation)
  const [isRealGpsActive, setIsRealGpsActive] = useState<boolean>(false);

  // 2. Simulation State (For background devices without physical hardware)
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

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('umap_devices', JSON.stringify(devices));
  }, [devices]);

  useEffect(() => {
    localStorage.setItem('umap_geofences', JSON.stringify(geofences));
  }, [geofences]);

  useEffect(() => {
    localStorage.setItem('umap_notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Init Engine
  useEffect(() => {
    engineRef.current = new GpsSimulationEngine(geofences, devices);
  }, []);

  // Connect to Real-time Backend API & WebSocket Stream
  useEffect(() => {
    // 1. Initial fetch from Backend API
    realtimeApi.getDevices().then((apiDevices) => {
      if (apiDevices && apiDevices.length > 0) {
        setDevices((prev) => {
          const merged = [...apiDevices];
          prev.forEach((p) => {
            if (!merged.some((m) => m.id === p.id)) merged.push(p);
          });
          return merged;
        });
      }
    });

    realtimeApi.getGeofences().then((apiGeos) => {
      if (apiGeos && apiGeos.length > 0) {
        setGeofences(apiGeos);
      }
    });

    // 2. Listen to live WebSocket stream
    const unsubscribe = realtimeApi.onMessage((type, payload) => {
      if (type === 'INIT_STATE') {
        if (payload?.devices) {
          setDevices((prev) => {
            const map = new Map(prev.map((d) => [d.id, d]));
            payload.devices.forEach((d: Device) => map.set(d.id, d));
            return Array.from(map.values());
          });
        }
      } else if (type === 'LOCATION_UPDATE') {
        // Real-time position & trail stream update
        setDevices((prev) =>
          prev.map((d) => (d.id === payload.deviceId ? payload.device : d))
        );
      } else if (type === 'DEVICE_REGISTERED') {
        setDevices((prev) => [payload, ...prev.filter((d) => d.id !== payload.id)]);
      } else if (type === 'NOTIFICATION') {
        setNotifications((prev) => [payload, ...prev]);
        if (notificationsEnabled) {
          setToast(payload);
          sounds.playGeofenceAlert();
        }
      }
    });

    return () => unsubscribe();
  }, [notificationsEnabled]);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0] || null;

  // Real-time GPS stream loop
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

  // Real-time Phone Number Ingestion Handler via API
  const handleQuickTrackPhone = async (phoneNumber: string) => {
    // 1. Call Backend API
    const apiDevice = await realtimeApi.trackPhoneNumber(phoneNumber);
    const newDevice = apiDevice || createPhoneTrackingDevice(phoneNumber);

    setDevices((prev) => [newDevice, ...prev.filter((d) => d.id !== newDevice.id)]);
    setSelectedDeviceId(newDevice.id);

    const trackNotif: AlertNotification = {
      id: `phone-${Date.now()}`,
      deviceId: newDevice.id,
      deviceName: newDevice.name,
      deviceType: 'smartphone',
      type: 'geofence_enter',
      title: '📱 010 실시간 궤적 수신 시작',
      message: `${phoneNumber} 단말기 LTE 위치 및 궤적선이 API 서버에 동기화되었습니다.`,
      timestamp: '방금',
      read: false,
      lat: newDevice.currentLocation.lat,
      lng: newDevice.currentLocation.lng,
    };

    setNotifications((prev) => [trackNotif, ...prev]);
    if (notificationsEnabled) {
      setToast(trackNotif);
      sounds.playGeofenceAlert();
    }
  };

  // Toggle Physical Real-World Geolocation from this Device
  const handleToggleRealGps = () => {
    if (isRealGpsActive) {
      liveGeoTracker.stop();
      setIsRealGpsActive(false);
      setToast({
        id: `real-gps-${Date.now()}`,
        deviceId: 'my-real-device',
        deviceName: '실제 내 기기',
        deviceType: 'smartphone',
        type: 'low_battery',
        title: '실제 GPS 연동 해제',
        message: '실제 물리적 위치 추적이 중지되었습니다.',
        timestamp: '방금',
        read: true,
      });
    } else {
      const realDeviceId = 'my-real-device';
      const success = liveGeoTracker.start(realDeviceId, (loc) => {
        setDevices((prev) => {
          let target = prev.find((d) => d.id === realDeviceId);
          const newPt = {
            lat: loc.lat,
            lng: loc.lng,
            speed: loc.speed,
            timestamp: loc.timestamp,
            address: `정밀도 ${loc.accuracy}m (실제 위치)`,
          };

          if (!target) {
            target = {
              id: realDeviceId,
              name: '내 스마트폰 (실제 물리적 GPS)',
              model: 'HTML5 High-Accuracy Geolocation API',
              type: 'smartphone',
              phoneNumber: '010-실제-내폰',
              serialNumber: 'REAL-GPS-SENDER',
              battery: 98,
              isCharging: false,
              status: 'online',
              signalStrength: 4,
              lastSeen: '실시간 물리 수신 중',
              currentLocation: newPt,
              todayTrail: [newPt],
              historicalTrails: {},
              updateInterval: 3,
              soundMuted: false,
              isMissingMode: false,
              voucher: {
                planName: '실제 단말기 연동',
                activatedAt: '2026-10-24',
                expiresAt: '2027-10-23',
                daysLeft: 365,
              },
              assignedGeofences: [],
              stats: { todayDistanceKm: 0, todayDurationMinutes: 1, topSpeedKmH: loc.speed, stopCount: 0 },
            };
            return [target, ...prev];
          }

          return prev.map((d) =>
            d.id === realDeviceId
              ? {
                  ...d,
                  currentLocation: newPt,
                  todayTrail: [...d.todayTrail, newPt],
                  lastSeen: '실시간 물리 수신 중',
                }
              : d
          );
        });
      });

      if (success) {
        setIsRealGpsActive(true);
        setSelectedDeviceId(realDeviceId);
        setToast({
          id: `real-gps-${Date.now()}`,
          deviceId: realDeviceId,
          deviceName: '실제 내 기기',
          deviceType: 'smartphone',
          type: 'geofence_enter',
          title: '📍 실제 물리적 GPS 연동 성공!',
          message: '브라우저 실시간 GPS가 연결되었습니다. 이동하시면 실제 궤적이 지도 위에 실시간으로 그려집니다.',
          timestamp: '방금',
          read: false,
        });
      }
    }
  };

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
      {/* View Switcher Floating Top Bar (umap Brand) */}
      <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-[999] flex items-center p-1 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl text-xs font-bold text-slate-700">
        <button
          onClick={() => setCurrentView('landing')}
          className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
            currentView === 'landing'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>umap 회사 공식몰</span>
        </button>
        <button
          onClick={() => setCurrentView('tracker')}
          className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
            currentView === 'tracker'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>실시간 관제 & 궤적 (umap GO)</span>
        </button>
      </div>

      {/* VIEW 1: Company Landing Page */}
      {currentView === 'landing' ? (
        <div className="w-full h-full overflow-y-auto pt-10">
          <LandingPage onGoToTracker={() => setCurrentView('tracker')} />
        </div>
      ) : (
        /* VIEW 2: Real-time Tracker Web App with Real Geolocation & Backend API */
        <div className="flex flex-col w-full h-full overflow-hidden">
          {/* Header with Quick 010 Phone Search & Real Device GPS button */}
          <Header
            devices={devices}
            selectedDevice={selectedDevice}
            onSelectDevice={(d) => setSelectedDeviceId(d.id)}
            onOpenRegisterModal={() => setIsRegisterOpen(true)}
            onOpenGeofenceModal={() => setIsGeofenceOpen(true)}
            onOpenNotificationDrawer={() => setIsNotifDrawerOpen(true)}
            onGoToLanding={() => setCurrentView('landing')}
            onQuickTrackPhone={handleQuickTrackPhone}
            unreadCount={unreadCount}
          />

          {/* Main Map & Workspace */}
          <div className="flex-1 flex relative overflow-hidden bg-slate-50">
            {/* Left Sidebar */}
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

              {/* Real Physical GPS Button (Floating at Top Left of Map) */}
              <div className="absolute top-4 left-4 z-[500]">
                <button
                  onClick={handleToggleRealGps}
                  className={`px-3.5 py-2 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-xl border transition-all cursor-pointer ${
                    isRealGpsActive
                      ? 'bg-emerald-600 text-white border-emerald-500 animate-pulse'
                      : 'bg-white/95 text-slate-800 hover:bg-white border-slate-200'
                  }`}
                  title="내 실제 스마트폰/PC의 브라우저 GPS를 켜서 실제 이동 궤적을 실시간으로 추적합니다"
                >
                  <LocateFixed className={`w-4 h-4 ${isRealGpsActive ? 'text-white' : 'text-emerald-600'}`} />
                  <span>{isRealGpsActive ? '📍 내 실제 GPS 연동 중 (실시간)' : '📍 내 실제 GPS 연동 켜기'}</span>
                </button>
              </div>

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

              {/* Toast Notification */}
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
