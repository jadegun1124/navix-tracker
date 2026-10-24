import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// In-Memory Real-time State (Database substitute)
const state = {
  devices: [
    {
      id: 'phone-010-live',
      name: '내 010 스마트폰 (실시간 GPS)',
      model: '스마트폰 LTE Geolocation',
      type: 'smartphone',
      phoneNumber: '010-2345-6789',
      serialNumber: 'SP-010-LIVE',
      battery: 95,
      isCharging: false,
      status: 'online',
      signalStrength: 4,
      lastSeen: '실시간 연결됨',
      currentLocation: {
        lat: 37.4979,
        lng: 127.0276,
        timestamp: new Date().toTimeString().split(' ')[0],
        speed: 0,
        address: '서울 강남역 11번 출구',
      },
      todayTrail: [
        { lat: 37.4979, lng: 127.0276, timestamp: '10:00:00', speed: 0, address: '서울 강남역' },
      ],
      historicalTrails: {},
      updateInterval: 5,
      soundMuted: false,
      isMissingMode: false,
      voucher: {
        planName: '실시간 API 무제한 연동',
        activatedAt: '2026-10-24',
        expiresAt: '2027-10-23',
        daysLeft: 365,
      },
      assignedGeofences: ['geo-1'],
      stats: {
        todayDistanceKm: 0.8,
        todayDurationMinutes: 15,
        topSpeedKmH: 4.5,
        stopCount: 1,
      },
    },
    {
      id: 'dev-x1l-01',
      name: '어린이 안심 트래커 X1L',
      model: 'umap X1L (어린이 안심)',
      type: 'child',
      serialNumber: 'UM-X1L-8839-KR',
      phoneNumber: '010-8839-4412',
      battery: 88,
      isCharging: false,
      status: 'online',
      signalStrength: 4,
      lastSeen: '10초 전',
      currentLocation: {
        lat: 37.4938,
        lng: 127.0631,
        timestamp: '08:26:00',
        speed: 0,
        address: '서울대치초등학교 교실',
      },
      todayTrail: [
        { lat: 37.4982, lng: 127.0612, timestamp: '08:15:00', speed: 0, address: '대치 래미안카운티 (출발)' },
        { lat: 37.4962, lng: 127.0620, timestamp: '08:21:40', speed: 4.1, address: '도곡로 보행로' },
        { lat: 37.4938, lng: 127.0631, timestamp: '08:26:00', speed: 0, address: '서울대치초등학교 교실' },
      ],
      historicalTrails: {},
      updateInterval: 15,
      soundMuted: false,
      isMissingMode: false,
      voucher: {
        planName: '어린이 안심 1년 무제한권',
        activatedAt: '2026-03-01',
        expiresAt: '2027-02-28',
        daysLeft: 126,
      },
      assignedGeofences: ['geo-1', 'geo-2'],
      stats: {
        todayDistanceKm: 1.4,
        todayDurationMinutes: 18,
        topSpeedKmH: 5.2,
        stopCount: 2,
      },
    },
  ],
  geofences: [
    {
      id: 'geo-1',
      name: '우리집 안심존',
      type: 'home',
      lat: 37.4982,
      lng: 127.0612,
      radius: 180,
      alertOnEntry: true,
      alertOnExit: true,
      color: '#0284c7',
    },
    {
      id: 'geo-2',
      name: '서울대치초등학교',
      type: 'school',
      lat: 37.4938,
      lng: 127.0631,
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

// Reverse Geocoding Cache (to avoid spamming OpenStreetMap)
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
      const addr = data.display_name?.split(',').slice(0, 3).join(' ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      addressCache.set(key, addr);
      return addr;
    }
  } catch (err) {
    // ignore
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ---------------- REST API Endpoints ----------------

// 1. Get all devices
app.get('/api/devices', (req, res) => {
  res.json({ success: true, data: state.devices });
});

// 2. Register or Connect a Korean 010 Phone Number
app.post('/api/track-phone', async (req, res) => {
  const { phoneNumber, name } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: '전화번호가 필요합니다.' });
  }

  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const formatted = cleanPhone.length === 11
    ? `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 7)}-${cleanPhone.slice(7)}`
    : phoneNumber;

  let existing = state.devices.find((d) => d.phoneNumber === formatted);
  if (!existing) {
    // Generate initial real-world Seoul point
    const baseLat = 37.4979 + (Math.random() - 0.5) * 0.008;
    const baseLng = 127.0276 + (Math.random() - 0.5) * 0.008;
    const address = await reverseGeocode(baseLat, baseLng);

    existing = {
      id: `phone-${Date.now()}`,
      name: name?.trim() || `${formatted} (휴대폰)`,
      model: '010 LTE 기지국 & GPS 실시간 연동',
      type: 'smartphone',
      phoneNumber: formatted,
      serialNumber: `SP-${formatted}`,
      battery: 88,
      isCharging: false,
      status: 'online',
      signalStrength: 4,
      lastSeen: '실시간 연결됨',
      currentLocation: {
        lat: baseLat,
        lng: baseLng,
        timestamp: new Date().toTimeString().split(' ')[0],
        speed: 4.2,
        address,
      },
      todayTrail: [
        { lat: baseLat, lng: baseLng, timestamp: new Date().toTimeString().split(' ')[0], speed: 4.2, address },
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
        todayDurationMinutes: 2,
        topSpeedKmH: 4.2,
        stopCount: 0,
      },
    };
    state.devices.unshift(existing);
    broadcast('DEVICE_REGISTERED', existing);
  }

  res.json({ success: true, data: existing });
});

// 3. Receive Live GPS Ingestion (From real smartphone or hardware GPS tracker)
app.post('/api/gps', async (req, res) => {
  const { deviceId, lat, lng, speed = 0, battery } = req.body;
  if (!deviceId || lat === undefined || lng === undefined) {
    return res.status(400).json({ success: false, message: 'deviceId, lat, lng가 필요합니다.' });
  }

  let device = state.devices.find((d) => d.id === deviceId);
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  // Resolve address via real OpenStreetMap reverse geocoding
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
      name: `GPS 단말기 (${deviceId.slice(-6)})`,
      model: '실시간 하드웨어/모바일 트래커',
      type: 'smartphone',
      serialNumber: deviceId,
      battery: battery ?? 90,
      isCharging: false,
      status: 'online',
      signalStrength: 4,
      lastSeen: '방금 전 (실시간 API)',
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
    // Calculate distance
    const distDelta = getDistanceMeters(
      device.currentLocation.lat,
      device.currentLocation.lng,
      lat,
      lng
    ) / 1000;

    device.currentLocation = newPoint;
    device.todayTrail.push(newPoint);
    device.lastSeen = '방금 전 (실시간 수신)';
    if (battery !== undefined) device.battery = battery;
    device.stats.todayDistanceKm = Number((device.stats.todayDistanceKm + distDelta).toFixed(2));
    device.stats.topSpeedKmH = Math.max(device.stats.topSpeedKmH, speed);
  }

  // Check Geofences
  state.geofences.forEach((geo) => {
    const dist = getDistanceMeters(lat, lng, geo.lat, geo.lng);
    const isInside = dist <= geo.radius;
    // Broadcast trigger if needed
    if (isInside && geo.alertOnEntry) {
      const notif = {
        id: `notif-${Date.now()}`,
        deviceId: device.id,
        deviceName: device.name,
        deviceType: device.type,
        type: 'geofence_enter',
        title: '안전구역 진입 (실시간 API)',
        message: `${device.name}이(가) [${geo.name}]에 진입했습니다.`,
        timestamp: timeStr.substring(0, 5),
        read: false,
        lat,
        lng,
      };
      state.notifications.unshift(notif);
      broadcast('NOTIFICATION', notif);
    }
  });

  // Broadcast live location to all map viewers via WebSocket
  broadcast('LOCATION_UPDATE', { deviceId: device.id, point: newPoint, device });

  res.json({ success: true, point: newPoint });
});

// 4. Geofences API
app.get('/api/geofences', (req, res) => {
  res.json({ success: true, data: state.geofences });
});

app.post('/api/geofences', (req, res) => {
  const newGeo = { ...req.body, id: req.body.id || `geo-${Date.now()}` };
  state.geofences.push(newGeo);
  broadcast('GEOFENCE_UPDATED', state.geofences);
  res.json({ success: true, data: newGeo });
});

// 5. Notifications API
app.get('/api/notifications', (req, res) => {
  res.json({ success: true, data: state.notifications });
});

// WebSocket Connection Management
wss.on('connection', (ws) => {
  // Send current state on connection
  ws.send(JSON.stringify({ type: 'INIT_STATE', payload: { devices: state.devices, geofences: state.geofences } }));

  ws.on('message', (msg) => {
    try {
      const { type, payload } = JSON.parse(msg.toString());
      if (type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {
      // ignore
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`[umap Backend API] Server running on http://localhost:${PORT}`);
  console.log(`[umap WebSocket] Real-time stream running on ws://localhost:${PORT}`);
});
