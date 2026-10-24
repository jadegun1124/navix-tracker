import { Device, Geofence, AlertNotification, GPSPoint } from '../types';
import { NOWON_CHILD_ROUTE, NOWON_PET_ROUTE, NOWON_VEHICLE_ROUTE, NOWON_PHONE_ROUTE } from '../data/mockData';

// Haversine distance in meters
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Map each device to Nowon-gu paths
export const DEVICE_FULL_PATHS: Record<string, GPSPoint[]> = {
  'dev-1': NOWON_CHILD_ROUTE,
  'dev-2': NOWON_PET_ROUTE,
  'dev-3': NOWON_VEHICLE_ROUTE,
  'dev-phone-sample': NOWON_PHONE_ROUTE,
};

export class GpsSimulationEngine {
  private deviceIndices: Record<string, number> = {
    'dev-1': 3,
    'dev-2': 2,
    'dev-3': 2,
    'dev-phone-sample': 1,
  };

  private geofenceInsideStates: Record<string, Record<string, boolean>> = {};

  constructor(geofences: Geofence[], devices: Device[]) {
    devices.forEach((dev) => {
      this.geofenceInsideStates[dev.id] = {};
      geofences.forEach((geo) => {
        const dist = getDistanceMeters(dev.currentLocation.lat, dev.currentLocation.lng, geo.lat, geo.lng);
        this.geofenceInsideStates[dev.id][geo.id] = dist <= geo.radius;
      });
    });
  }

  tickDevice(
    device: Device,
    geofences: Geofence[]
  ): { updatedDevice: Device; newNotifications: AlertNotification[] } {
    let fullPath = DEVICE_FULL_PATHS[device.id];
    
    if (!fullPath) {
      if (device.type === 'smartphone' || device.phoneNumber) {
        fullPath = NOWON_PHONE_ROUTE;
        DEVICE_FULL_PATHS[device.id] = NOWON_PHONE_ROUTE;
      } else {
        fullPath = NOWON_CHILD_ROUTE;
      }
    }

    if (!fullPath || fullPath.length <= 1) {
      return { updatedDevice: device, newNotifications: [] };
    }

    let currentIndex = this.deviceIndices[device.id] ?? 0;
    const nextIndex = (currentIndex + 1) % fullPath.length;
    this.deviceIndices[device.id] = nextIndex;

    const nextPoint = fullPath[nextIndex];
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const newLocation: GPSPoint = {
      ...nextPoint,
      timestamp: timeStr,
    };

    const distDelta = getDistanceMeters(
      device.currentLocation.lat,
      device.currentLocation.lng,
      newLocation.lat,
      newLocation.lng
    ) / 1000;

    const updatedTodayTrail = [...device.todayTrail, newLocation];

    const updatedDevice: Device = {
      ...device,
      currentLocation: newLocation,
      todayTrail: updatedTodayTrail,
      lastSeen: '실시간 (수신 중)',
      battery: Math.max(10, device.battery - (Math.random() < 0.05 ? 1 : 0)),
      stats: {
        ...device.stats,
        todayDistanceKm: Number((device.stats.todayDistanceKm + distDelta).toFixed(2)),
        todayDurationMinutes: device.stats.todayDurationMinutes + 1,
      },
    };

    const newNotifications: AlertNotification[] = [];
    if (!this.geofenceInsideStates[device.id]) {
      this.geofenceInsideStates[device.id] = {};
    }

    geofences.forEach((geo) => {
      const dist = getDistanceMeters(newLocation.lat, newLocation.lng, geo.lat, geo.lng);
      const isInsideNow = dist <= geo.radius;
      const wasInside = this.geofenceInsideStates[device.id][geo.id];

      if (wasInside === undefined) {
        this.geofenceInsideStates[device.id][geo.id] = isInsideNow;
        return;
      }

      if (!wasInside && isInsideNow && geo.alertOnEntry) {
        newNotifications.push({
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          deviceId: device.id,
          deviceName: device.name,
          deviceType: device.type,
          type: 'geofence_enter',
          title: '안전구역 진입 (노원구)',
          message: `${device.name}이(가) [${geo.name}]에 진입했습니다. (${timeStr.substring(0, 5)})`,
          timestamp: `방금 전`,
          read: false,
          lat: newLocation.lat,
          lng: newLocation.lng,
        });
      }

      if (wasInside && !isInsideNow && geo.alertOnExit) {
        newNotifications.push({
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          deviceId: device.id,
          deviceName: device.name,
          deviceType: device.type,
          type: 'geofence_exit',
          title: '안전구역 이탈 (노원구)',
          message: `${device.name}이(가) [${geo.name}]을 벗어났습니다. (${timeStr.substring(0, 5)})`,
          timestamp: `방금 전`,
          read: false,
          lat: newLocation.lat,
          lng: newLocation.lng,
        });
      }

      this.geofenceInsideStates[device.id][geo.id] = isInsideNow;
    });

    return { updatedDevice, newNotifications };
  }
}
