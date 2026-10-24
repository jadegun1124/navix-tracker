import { Device, Geofence, AlertNotification, GPSPoint } from '../types';
import { createPhoneTrackingDevice } from '../data/mockData';

const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const API_BASE = isLocalhost ? 'http://localhost:3001/api' : '/api';
const WS_BASE = isLocalhost ? 'ws://localhost:3001' : null;

export class RealtimeApiService {
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: ((type: string, payload: any) => void)[] = [];

  constructor() {
    // 1. Initialize BroadcastChannel for instant local & multi-tab/PWA sync
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('umap_live_tracking_channel');
        this.broadcastChannel.onmessage = (event) => {
          const { type, payload } = event.data || {};
          if (type) {
            this.notifyListeners(type, payload);
          }
        };
      } catch (e) {
        console.warn('[umap Sync] BroadcastChannel not supported:', e);
      }
    }

    // 2. Initialize WebSocket if on localhost
    if (WS_BASE && !isHttps) {
      this.connectWs();
    }
  }

  private notifyListeners(type: string, payload: any) {
    this.listeners.forEach((fn) => {
      try {
        fn(type, payload);
      } catch (e) {
        console.error('[umap API Listener Error]', e);
      }
    });
  }

  private connectWs() {
    if (!WS_BASE) return;
    try {
      this.ws = new WebSocket(WS_BASE);

      this.ws.onopen = () => {
        console.log('[umap Realtime API] Local WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          this.notifyListeners(type, payload);
        } catch (e) {
          // ignore
        }
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connectWs(), 4000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (err) {
      // ignore
    }
  }

  public emitLocal(type: string, payload: any) {
    this.notifyListeners(type, payload);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type, payload });
      } catch (e) {
        // ignore
      }
    }
  }

  onMessage(callback: (type: string, payload: any) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== callback);
    };
  }

  // 1. Fetch live devices from API with localStorage fallback for GitHub Pages
  async getDevices(): Promise<Device[]> {
    if (isLocalhost) {
      try {
        const res = await fetch(`${API_BASE}/devices`);
        if (res.ok) {
          const json = await res.json();
          return json.data || [];
        }
      } catch (e) {
        // Fall through to localStorage
      }
    }

    // Standalone / GitHub Pages fallback
    try {
      const saved = localStorage.getItem('umap_devices');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // ignore
    }
    return [];
  }

  // 2. Track / Register a Korean 010 Phone Number
  async trackPhoneNumber(
    phoneNumber: string,
    name?: string,
    lat: number = 37.6550,
    lng: number = 127.0610
  ): Promise<Device | null> {
    if (isLocalhost) {
      try {
        const res = await fetch(`${API_BASE}/track-phone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber, name, lat, lng }),
        });
        if (res.ok) {
          const json = await res.json();
          return json.data;
        }
      } catch (e) {
        // Fall through to standalone
      }
    }

    // Standalone / GitHub Pages Mode
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const formatted = cleanPhone.length === 11
      ? `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 7)}-${cleanPhone.slice(7)}`
      : phoneNumber;

    const device = createPhoneTrackingDevice(
      formatted,
      name,
      lat,
      lng,
      '서울 노원구 상계동 (모바일 트래커 연동)'
    );

    this.emitLocal('DEVICE_REGISTERED', device);
    return device;
  }

  // 3. Send real GPS location ping
  async sendGpsPoint(
    deviceId: string,
    lat: number,
    lng: number,
    speed: number = 0,
    battery?: number
  ): Promise<GPSPoint | null> {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const newPoint: GPSPoint = {
      lat,
      lng,
      speed,
      timestamp: timeStr,
      address: `서울 노원구 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    };

    if (isLocalhost) {
      try {
        const res = await fetch(`${API_BASE}/gps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, lat, lng, speed, battery }),
        });
        if (res.ok) {
          const json = await res.json();
          return json.point;
        }
      } catch (e) {
        // Fall through to broadcast
      }
    }

    // Standalone / GitHub Pages broadcast
    this.emitLocal('LOCATION_UPDATE', {
      deviceId,
      point: newPoint,
    });

    return newPoint;
  }

  // 4. Geofences
  async getGeofences(): Promise<Geofence[]> {
    if (isLocalhost) {
      try {
        const res = await fetch(`${API_BASE}/geofences`);
        if (res.ok) {
          const json = await res.json();
          return json.data || [];
        }
      } catch (e) {
        // ignore
      }
    }
    return [];
  }

  async saveGeofence(geofence: Geofence): Promise<Geofence | null> {
    if (isLocalhost) {
      try {
        const res = await fetch(`${API_BASE}/geofences`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geofence),
        });
        if (res.ok) {
          const json = await res.json();
          return json.data;
        }
      } catch (e) {
        // ignore
      }
    }
    return geofence;
  }
}

export const realtimeApi = new RealtimeApiService();
