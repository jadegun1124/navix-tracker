import { Device, Geofence, AlertNotification, GPSPoint } from '../types';
import { CHILD_ROUTE_POINTS, PET_ROUTE_POINTS, VEHICLE_ROUTE_POINTS } from '../data/mockData';

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

// Map each device type to its predefined full path
export const DEVICE_FULL_PATHS: Record<string, GPSPoint[]> = {
  'dev-1': CHILD_ROUTE_POINTS,
  'dev-2': PET_ROUTE_POINTS,
  'dev-3': VEHICLE_ROUTE_POINTS,
};

export class GpsSimulationEngine {
  private deviceIndices: Record<string, number> = {
    'dev-1': 4,
    'dev-2': 4,
    'dev-3': 3,
    'dev-4': 0,
  };

  private geofenceInsideStates: Record<string, Record<string, boolean>> = {}; // deviceId -> geofenceId -> isInside

  constructor(geofences: Geofence[], devices: Device[]) {
    // Initial check
    devices.forEach((dev) => {
      this.geofenceInsideStates[dev.id] = {};
      geofences.forEach((geo) => {
        const dist = getDistanceMeters(dev.currentLocation.lat, dev.currentLocation.lng, geo.lat, geo.lng);
        this.geofenceInsideStates[dev.id][geo.id] = dist <= geo.radius;
      });
    });
  }

  // Progress simulation one step for a device or all devices
  tickDevice(
    device: Device,
    geofences: Geofence[]
  ): { updatedDevice: Device; newNotifications: AlertNotification[] } {
    const fullPath = DEVICE_FULL_PATHS[device.id];
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

    // Calculate updated stats
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
      lastSeen: '방금 전 (실시간)',
      battery: Math.max(10, device.battery - (Math.random() < 0.1 ? 1 : 0)),
      stats: {
        ...device.stats,
        todayDistanceKm: Number((device.stats.todayDistanceKm + distDelta).toFixed(2)),
        todayDurationMinutes: device.stats.todayDurationMinutes + 1,
      },
    };

    // Geofence checks
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

      // Entry trigger
      if (!wasInside && isInsideNow && geo.alertOnEntry) {
        newNotifications.push({
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          deviceId: device.id,
          deviceName: device.name,
          deviceType: device.type,
          type: 'geofence_enter',
          title: '안전구역 진입',
          message: `${device.name}이(가) [${geo.name}] 안전구역에 진입하였습니다. (${timeStr.substring(0, 5)})`,
          timestamp: `방금 전`,
          read: false,
          lat: newLocation.lat,
          lng: newLocation.lng,
        });
      }

      // Exit trigger
      if (wasInside && !isInsideNow && geo.alertOnExit) {
        newNotifications.push({
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          deviceId: device.id,
          deviceName: device.name,
          deviceType: device.type,
          type: 'geofence_exit',
          title: '안전구역 이탈 감지',
          message: `${device.name}이(가) [${geo.name}] 안전구역을 벗어났습니다. (${timeStr.substring(0, 5)})`,
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
