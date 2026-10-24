export type DeviceType = 'child' | 'pet' | 'vehicle' | 'valuable';

export type DeviceStatus = 'online' | 'idle' | 'offline' | 'emergency';

export interface GPSPoint {
  lat: number;
  lng: number;
  timestamp: string;
  speed?: number; // km/h
  battery?: number;
  address?: string;
  isStopPoint?: boolean;
  stopDurationMinutes?: number;
}

export interface Geofence {
  id: string;
  name: string;
  type: 'home' | 'school' | 'academy' | 'park' | 'company' | 'custom';
  lat: number;
  lng: number;
  radius: number; // in meters
  alertOnEntry: boolean;
  alertOnExit: boolean;
  color: string;
}

export interface DeviceVoucher {
  planName: string;
  activatedAt: string;
  expiresAt: string;
  daysLeft: number;
}

export interface Device {
  id: string;
  name: string;
  model: string;
  type: DeviceType;
  serialNumber: string;
  battery: number;
  isCharging: boolean;
  status: DeviceStatus;
  signalStrength: number; // 1 to 4
  lastSeen: string;
  currentLocation: GPSPoint;
  todayTrail: GPSPoint[];
  historicalTrails: Record<string, GPSPoint[]>;
  updateInterval: number; // in seconds
  soundMuted: boolean;
  isMissingMode: boolean;
  voucher: DeviceVoucher;
  assignedGeofences: string[];
  stats: {
    todayDistanceKm: number;
    todayDurationMinutes: number;
    topSpeedKmH: number;
    stopCount: number;
  };
}

export interface AlertNotification {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  type: 'geofence_enter' | 'geofence_exit' | 'sos' | 'movement_detected' | 'low_battery' | 'missing_mode';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  lat?: number;
  lng?: number;
}

export interface RouteTimelineEvent {
  time: string;
  title: string;
  description: string;
  type: 'depart' | 'arrive' | 'stop' | 'alert';
  locationName: string;
}
