import { realtimeApi } from './api';

export interface RealGpsLocation {
  lat: number;
  lng: number;
  speed: number;
  accuracy: number;
  timestamp: string;
}

export class BrowserGeolocationTracker {
  private watchId: number | null = null;
  private isTracking: boolean = false;
  private deviceId: string = 'my-real-device';
  private listeners: ((loc: RealGpsLocation) => void)[] = [];

  start(deviceId: string, onUpdate: (loc: RealGpsLocation) => void): boolean {
    if (!('geolocation' in navigator)) {
      alert('이 브라우저는 실제 GPS 위치 서비스를 지원하지 않습니다.');
      return false;
    }

    this.deviceId = deviceId;
    this.listeners.push(onUpdate);

    if (this.isTracking) return true;

    this.isTracking = true;

    this.watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, speed, accuracy } = pos.coords;
        const kmh = speed ? Math.round(speed * 3.6) : 0;
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];

        const loc: RealGpsLocation = {
          lat: latitude,
          lng: longitude,
          speed: kmh,
          accuracy: Math.round(accuracy),
          timestamp: timeStr,
        };

        // Notify local listeners
        this.listeners.forEach((fn) => fn(loc));

        // Transmit live GPS coordinate to Backend API Server
        await realtimeApi.sendGpsPoint(this.deviceId, latitude, longitude, kmh);
      },
      (err) => {
        console.warn('[Real GPS] Geolocation permission or signal error:', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return true;
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
    this.listeners = [];
  }

  getStatus() {
    return this.isTracking;
  }
}

export const liveGeoTracker = new BrowserGeolocationTracker();
