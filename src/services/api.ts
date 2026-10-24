import { Device, Geofence, AlertNotification, GPSPoint } from '../types';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';
const WS_BASE = `ws://${window.location.hostname}:3001`;

export class RealtimeApiService {
  private ws: WebSocket | null = null;
  private listeners: ((type: string, payload: any) => void)[] = [];

  constructor() {
    this.connectWs();
  }

  private connectWs() {
    try {
      this.ws = new WebSocket(WS_BASE);

      this.ws.onopen = () => {
        console.log('[umap Realtime API] WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          this.listeners.forEach((fn) => fn(type, payload));
        } catch (e) {
          // ignore
        }
      };

      this.ws.onclose = () => {
        // Reconnect after 3s
        setTimeout(() => this.connectWs(), 3000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (err) {
      // ignore
    }
  }

  onMessage(callback: (type: string, payload: any) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== callback);
    };
  }

  // 1. Fetch live devices from API
  async getDevices(): Promise<Device[]> {
    try {
      const res = await fetch(`${API_BASE}/devices`);
      if (res.ok) {
        const json = await res.json();
        return json.data || [];
      }
    } catch (e) {
      console.warn('[umap API] Backend fetch fallback:', e);
    }
    return [];
  }

  // 2. Track / Register a Korean 010 Phone Number
  async trackPhoneNumber(phoneNumber: string, name?: string): Promise<Device | null> {
    try {
      const res = await fetch(`${API_BASE}/track-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, name }),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch (e) {
      console.warn('[umap API] Phone track API error:', e);
    }
    return null;
  }

  // 3. Send real GPS location ping
  async sendGpsPoint(
    deviceId: string,
    lat: number,
    lng: number,
    speed: number = 0,
    battery?: number
  ): Promise<GPSPoint | null> {
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
      // ignore
    }
    return null;
  }

  // 4. Geofences
  async getGeofences(): Promise<Geofence[]> {
    try {
      const res = await fetch(`${API_BASE}/geofences`);
      if (res.ok) {
        const json = await res.json();
        return json.data || [];
      }
    } catch (e) {
      // ignore
    }
    return [];
  }

  async saveGeofence(geofence: Geofence): Promise<Geofence | null> {
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
    return null;
  }
}

export const realtimeApi = new RealtimeApiService();
