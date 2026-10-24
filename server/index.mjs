import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Default base coordinates set to Nowon-gu (노원구)
const NOWON_LAT = 37.6550;
const NOWON_LNG = 127.0610;

// In-Memory Real-time State
const state = {
  devices: [
    {
      id: 'phone-010-live',
      name: '010 내 스마트폰 (노원구)',
      model: '스마트폰 LTE Geolocation',
      type: 'smartphone',
      phoneNumber: '010-2345-6789',
      serialNumber: 'SP-010-NOWON',
      battery: 95,
      isCharging: false,
      status: 'online',
      signalStrength: 4,
      lastSeen: '실시간 연결됨',
      currentLocation: {
        lat: NOWON_LAT,
        lng: NOWON_LNG,
        timestamp: new Date().toTimeString().split(' ')[0],
        speed: 0,
        address: '서울 노원구 상계동 노원로',
      },
      todayTrail: [
        { lat: NOWON_LAT, lng: NOWON_LNG, timestamp: '10:00:00', speed: 0, address: '서울 노원구 상계동' },
      ],
      historicalTrails: {},
      updateInterval: 5,
      soundMuted: false,
      isMissingMode: false,
      voucher: {
        planName: '010 실시간 궤적 연동',
        activatedAt: '2026-10-24',
        expiresAt: '2027-10-23',
        daysLeft: 365,
      },
      assignedGeofences: ['geo-1'],
      stats: {
        todayDistanceKm: 1.2,
        todayDurationMinutes: 15,
        topSpeedKmH: 4.8,
        stopCount: 1,
      },
    },
  ],
  geofences: [
    {
      id: 'geo-1',
      name: '우리집 (노원구 상계동)',
      type: 'home',
      lat: NOWON_LAT,
      lng: NOWON_LNG,
      radius: 200,
      alertOnEntry: true,
      alertOnExit: true,
      color: '#0284c7',
    },
    {
      id: 'geo-2',
      name: '노원역 환승센터',
      type: 'school',
      lat: 37.6552,
      lng: 127.0620,
      radius: 250,
      alertOnEntry: true,
      alertOnExit: true,
      color: '#10b981',
    },
  ],
  notifications: [],
};

// Broadcast to all connected WebSocket clients
function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Haversine distance in meters
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Reverse Geocoding Cache
const addressCache = new Map();
async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (addressCache.has(key)) return addressCache.get(key);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'umap-gps-tracker-app/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.display_name?.split(',').slice(0, 3).join(' ') || `서울 노원구 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      addressCache.set(key, addr);
      return addr;
    }
  } catch (err) {
    // ignore
  }
  return `서울 노원구 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

// ---------------- REST API Endpoints ----------------

app.get('/api/devices', (req, res) => {
  res.json({ success: true, data: state.devices });
});

// 2. Register or Connect a Korean 010 Phone Number
app.post('/api/track-phone', async (req, res) => {
  const { phoneNumber, name, lat, lng } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: '전화번호가 필요합니다.' });
  }

  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const formatted = cleanPhone.length === 11
    ? `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 7)}-${cleanPhone.slice(7)}`
    : phoneNumber;

  // Use real coordinates passed from browser, or default to Nowon-gu
  const targetLat = lat !== undefined ? Number(lat) : NOWON_LAT + (Math.random() - 0.5) * 0.005;
  const targetLng = lng !== undefined ? Number(lng) : NOWON_LNG + (Math.random() - 0.5) * 0.005;
  const address = await reverseGeocode(targetLat, targetLng);

  let existing = state.devices.find((d) => d.phoneNumber === formatted);
  if (!existing) {
    existing = {
      id: `phone-${Date.now()}`,
      name: name?.trim() || `${formatted} (휴대폰)`,
      model: '010 LTE 기지국 & GPS 실시간 연동',
      type: 'smartphone',
      phoneNumber: formatted,
      serialNumber: `SP-${formatted}`,
      battery: 92,
      isCharging: false,
      status: 'online',
      signalStrength: 4,
      lastSeen: '실시간 연결됨',
      currentLocation: {
        lat: targetLat,
        lng: targetLng,
        timestamp: new Date().toTimeString().split(' ')[0],
        speed: 0,
        address,
      },
      todayTrail: [
        { lat: targetLat, lng: targetLng, timestamp: new Date().toTimeString().split(' ')[0], speed: 0, address },
      ],
      historicalTrails: {},
      updateInterval: 5,
      soundMuted: false,
      isMissingMode: false,
      voucher: {
        planName: '010 안심 위치공유 1년권',
        activatedAt: '2026-10-24',
        expiresAt: '2027-10-23',
        daysLeft: 365,
      },
      assignedGeofences: ['geo-1'],
      stats: {
        todayDistanceKm: 0.1,
        todayDurationMinutes: 1,
        topSpeedKmH: 4.2,
        stopCount: 0,
      },
    };
    state.devices.unshift(existing);
    broadcast('DEVICE_REGISTERED', existing);
  } else {
    // Update existing to latest coordinates
    existing.currentLocation = {
      lat: targetLat,
      lng: targetLng,
      timestamp: new Date().toTimeString().split(' ')[0],
      speed: 0,
      address,
    };
    existing.todayTrail.push(existing.currentLocation);
    broadcast('LOCATION_UPDATE', { deviceId: existing.id, point: existing.currentLocation, device: existing });
  }

  res.json({ success: true, data: existing });
});

// 3. Receive Live GPS Ingestion
app.post('/api/gps', async (req, res) => {
  const { deviceId, lat, lng, speed = 0, battery } = req.body;
  if (!deviceId || lat === undefined || lng === undefined) {
    return res.status(400).json({ success: false, message: 'deviceId, lat, lng가 필요합니다.' });
  }

  let device = state.devices.find((d) => d.id === deviceId);
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const address = await reverseGeocode(lat, lng);

  const newPoint = {
    lat: Number(lat),
    lng: Number(lng),
    speed: Number(speed),
    timestamp: timeStr,
    address,
  };

  if (!device) {
    device = {
      id: deviceId,
      name: `내 기기 (${deviceId.slice(-6)})`,
      model: '실시간 GPS 트래커',
      type: 'smartphone',
      serialNumber: deviceId,
      battery: battery ?? 90,
      isCharging: false,
      status: 'online',
      signalStrength: 4,
      lastSeen: '실시간 (방금 전)',
      currentLocation: newPoint,
      todayTrail: [newPoint],
      historicalTrails: {},
      updateInterval: 5,
      soundMuted: false,
      isMissingMode: false,
      voucher: { planName: '실시간 API 연동', activatedAt: '2026-10-24', expiresAt: '2027-10-23', daysLeft: 365 },
      assignedGeofences: [],
      stats: { todayDistanceKm: 0, todayDurationMinutes: 1, topSpeedKmH: speed, stopCount: 0 },
    };
    state.devices.unshift(device);
  } else {
    const distDelta = getDistanceMeters(
      device.currentLocation.lat,
      device.currentLocation.lng,
      lat,
      lng
    ) / 1000;

    device.currentLocation = newPoint;
    device.todayTrail.push(newPoint);
    device.lastSeen = '실시간 (수신 중)';
    if (battery !== undefined) device.battery = battery;
    device.stats.todayDistanceKm = Number((device.stats.todayDistanceKm + distDelta).toFixed(2));
    device.stats.topSpeedKmH = Math.max(device.stats.topSpeedKmH, speed);
  }

  // Broadcast
  broadcast('LOCATION_UPDATE', { deviceId: device.id, point: newPoint, device });
  res.json({ success: true, point: newPoint });
});

app.get('/api/geofences', (req, res) => {
  res.json({ success: true, data: state.geofences });
});

app.get('/api/notifications', (req, res) => {
  res.json({ success: true, data: state.notifications });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`[umap Backend API] Server running on http://localhost:${PORT}`);
  console.log(`[umap WebSocket] Real-time stream running on ws://localhost:${PORT}`);
});
