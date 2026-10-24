import { Device, Geofence, AlertNotification, RouteTimelineEvent, GPSPoint } from '../types';

// Nowon-gu (노원구) Core Geofences
export const INITIAL_GEOFENCES: Geofence[] = [
  {
    id: 'geo-1',
    name: '우리집 (노원구 상계동)',
    type: 'home',
    lat: 37.6550,
    lng: 127.0610,
    radius: 180,
    alertOnEntry: true,
    alertOnExit: true,
    color: '#3b82f6', // blue
  },
  {
    id: 'geo-2',
    name: '노원역 안심 환승존',
    type: 'school',
    lat: 37.6552,
    lng: 127.0620,
    radius: 250,
    alertOnEntry: true,
    alertOnExit: true,
    color: '#10b981', // green
  },
  {
    id: 'geo-3',
    name: '중계동 은행사거리 학원가',
    type: 'academy',
    lat: 37.6490,
    lng: 127.0750,
    radius: 200,
    alertOnEntry: true,
    alertOnExit: true,
    color: '#8b5cf6', // purple
  },
  {
    id: 'geo-4',
    name: '당현천 힐링 산책로',
    type: 'park',
    lat: 37.6510,
    lng: 127.0650,
    radius: 350,
    alertOnEntry: true,
    alertOnExit: true,
    color: '#f59e0b', // amber
  },
];

// Nowon-gu (노원구) Child commute route: Sanggye-dong Home -> Nowon Station -> Junggye Academy
export const NOWON_CHILD_ROUTE: GPSPoint[] = [
  { lat: 37.6550, lng: 127.0610, timestamp: '08:15:00', speed: 0, address: '서울 노원구 상계동 래미안 (집)' },
  { lat: 37.6552, lng: 127.0620, timestamp: '08:20:10', speed: 3.8, address: '노원역 4번 출구 앞 보행로' },
  { lat: 37.6535, lng: 127.0655, timestamp: '08:25:40', speed: 4.1, address: '상계백병원 사거리' },
  { lat: 37.6508, lng: 127.0690, timestamp: '08:32:00', speed: 3.5, address: '중계근린공원 보행로' },
  { lat: 37.6490, lng: 127.0750, timestamp: '08:38:00', speed: 0, address: '중계동 은행사거리 학원 (도착)', isStopPoint: true, stopDurationMinutes: 180 },
  { lat: 37.6510, lng: 127.0650, timestamp: '12:30:00', speed: 4.0, address: '당현천 징검다리 산책길' },
  { lat: 37.6550, lng: 127.0610, timestamp: '13:05:00', speed: 0, address: '서울 노원구 상계동 자택 (귀가 완료)' },
];

// Nowon-gu 010 Phone Route (Nowon Station -> Dongil-ro -> Suraksan)
export const NOWON_PHONE_ROUTE: GPSPoint[] = [
  { lat: 37.6550, lng: 127.0610, timestamp: '10:10:00', speed: 0, address: '서울 노원구 노원로 번화가 (현재 위치)' },
  { lat: 37.6565, lng: 127.0625, timestamp: '10:15:20', speed: 4.2, address: '노원 롯데백화점 정문 앞' },
  { lat: 37.6590, lng: 127.0640, timestamp: '10:22:10', speed: 4.8, address: '상계주공 7단지 보행자 도로' },
  { lat: 37.6620, lng: 127.0660, timestamp: '10:30:00', speed: 5.1, address: '상계역 1번 출구 사거리' },
  { lat: 37.6655, lng: 127.0685, timestamp: '10:38:40', speed: 4.5, address: '당고개역 방향 동일로 통과 중' },
  { lat: 37.6680, lng: 127.0700, timestamp: '10:45:00', speed: 0, address: '수락산 공원 쉼터 (도착)', isStopPoint: true, stopDurationMinutes: 30 },
];

// Pet walk route in Nowon Danghyeon stream
export const NOWON_PET_ROUTE: GPSPoint[] = [
  { lat: 37.6550, lng: 127.0610, timestamp: '07:20:00', speed: 0, address: '서울 노원구 상계동 자택' },
  { lat: 37.6530, lng: 127.0630, timestamp: '07:26:00', speed: 4.5, address: '당현천 진입로' },
  { lat: 37.6510, lng: 127.0650, timestamp: '07:35:00', speed: 5.5, address: '당현천 힐링 산책로 (잔디마당)', isStopPoint: true, stopDurationMinutes: 20 },
  { lat: 37.6490, lng: 127.0670, timestamp: '08:05:00', speed: 4.0, address: '등나무근린공원 산책 데크' },
  { lat: 37.6550, lng: 127.0610, timestamp: '08:25:00', speed: 0, address: '서울 노원구 상계동 귀가' },
];

// Vehicle route in Nowon: Nowon Station -> Dongbu Expressway
export const NOWON_VEHICLE_ROUTE: GPSPoint[] = [
  { lat: 37.6550, lng: 127.0610, timestamp: '08:30:00', speed: 0, address: '노원구 상계동 지하주차장 (출발)' },
  { lat: 37.6520, lng: 127.0580, timestamp: '08:35:00', speed: 42, address: '동일로 노원소방서 앞 통과' },
  { lat: 37.6420, lng: 127.0560, timestamp: '08:42:00', speed: 65, address: '동부간선도로 월계1교 진입' },
  { lat: 37.6250, lng: 127.0550, timestamp: '08:50:00', speed: 78, address: '동부간선도로 중랑천 구간 주행' },
  { lat: 37.6550, lng: 127.0610, timestamp: '09:20:00', speed: 0, address: '노원구 상계동 안전주차 완료', isStopPoint: true, stopDurationMinutes: 360 },
];

export const INITIAL_DEVICES: Device[] = [
  {
    id: 'dev-phone-sample',
    name: '010 내 스마트폰 (노원구)',
    model: 'umap 010 실시간 궤적 연동',
    type: 'smartphone',
    serialNumber: 'SP-NOWON-010',
    phoneNumber: '010-0000-0000',
    battery: 92,
    isCharging: false,
    status: 'online',
    signalStrength: 4,
    lastSeen: '실시간 (방금)',
    currentLocation: { ...NOWON_PHONE_ROUTE[0] },
    todayTrail: NOWON_PHONE_ROUTE.slice(0, 3),
    historicalTrails: {
      '2026-10-24': NOWON_PHONE_ROUTE.slice(0, 3),
      '2026-10-23': NOWON_PHONE_ROUTE,
    },
    updateInterval: 5,
    soundMuted: false,
    isMissingMode: false,
    voucher: {
      planName: '010 안심 실시간 위치공유',
      activatedAt: '2026-10-24',
      expiresAt: '2027-10-23',
      daysLeft: 365,
    },
    assignedGeofences: ['geo-1', 'geo-2'],
    stats: {
      todayDistanceKm: 1.8,
      todayDurationMinutes: 15,
      topSpeedKmH: 4.8,
      stopCount: 1,
    },
  },
  {
    id: 'dev-1',
    name: '민준이 가방',
    model: 'umap X1L (어린이 안심)',
    type: 'child',
    serialNumber: 'UM-X1L-8839-KR',
    phoneNumber: '010-8839-4412',
    battery: 88,
    isCharging: false,
    status: 'online',
    signalStrength: 4,
    lastSeen: '10초 전',
    currentLocation: { ...NOWON_CHILD_ROUTE[4] },
    todayTrail: NOWON_CHILD_ROUTE.slice(0, 5),
    historicalTrails: {
      '2026-10-24': NOWON_CHILD_ROUTE.slice(0, 5),
      '2026-10-23': NOWON_CHILD_ROUTE,
    },
    updateInterval: 15,
    soundMuted: false,
    isMissingMode: false,
    voucher: {
      planName: '어린이 안심 1년 무제한권',
      activatedAt: '2026-03-01',
      expiresAt: '2027-02-28',
      daysLeft: 126,
    },
    assignedGeofences: ['geo-1', 'geo-2', 'geo-3'],
    stats: {
      todayDistanceKm: 1.9,
      todayDurationMinutes: 23,
      topSpeedKmH: 4.1,
      stopCount: 2,
    },
  },
  {
    id: 'dev-2',
    name: '코코 (골든리트리버)',
    model: 'umap C5L (반려동물 목줄형)',
    type: 'pet',
    serialNumber: 'UM-C5L-1902-KR',
    phoneNumber: '010-1902-7741',
    battery: 74,
    isCharging: false,
    status: 'online',
    signalStrength: 4,
    lastSeen: '1분 전',
    currentLocation: { ...NOWON_PET_ROUTE[2] },
    todayTrail: NOWON_PET_ROUTE.slice(0, 3),
    historicalTrails: {
      '2026-10-24': NOWON_PET_ROUTE.slice(0, 3),
      '2026-10-23': NOWON_PET_ROUTE,
    },
    updateInterval: 30,
    soundMuted: false,
    isMissingMode: false,
    voucher: {
      planName: '반려견 스마트 케어 2년권',
      activatedAt: '2025-08-10',
      expiresAt: '2027-08-09',
      daysLeft: 288,
    },
    assignedGeofences: ['geo-4'],
    stats: {
      todayDistanceKm: 1.5,
      todayDurationMinutes: 20,
      topSpeedKmH: 5.5,
      stopCount: 1,
    },
  },
  {
    id: 'dev-3',
    name: '카니발 하이리무진',
    model: 'umap C8L (차량용 실시간 관제)',
    type: 'vehicle',
    serialNumber: 'UM-C8L-5510-KR',
    phoneNumber: '010-5510-9923',
    battery: 98,
    isCharging: true,
    status: 'online',
    signalStrength: 4,
    lastSeen: '실시간 (5초 전)',
    currentLocation: { ...NOWON_VEHICLE_ROUTE[4] },
    todayTrail: NOWON_VEHICLE_ROUTE,
    historicalTrails: {
      '2026-10-24': NOWON_VEHICLE_ROUTE,
      '2026-10-23': NOWON_VEHICLE_ROUTE,
    },
    updateInterval: 5,
    soundMuted: true,
    isMissingMode: false,
    voucher: {
      planName: '차량 관제 LTE 프리미엄 1년권',
      activatedAt: '2026-01-15',
      expiresAt: '2027-01-14',
      daysLeft: 82,
    },
    assignedGeofences: ['geo-1'],
    stats: {
      todayDistanceKm: 12.4,
      todayDurationMinutes: 25,
      topSpeedKmH: 78.0,
      stopCount: 1,
    },
  },
];

// Helper to create a new live phone tracking device centered at the user's actual location
export function createPhoneTrackingDevice(
  phoneNumber: string,
  customName?: string,
  baseLat: number = 37.6550,
  baseLng: number = 127.0610,
  actualAddress?: string
): Device {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.length === 11
    ? `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 7)}-${cleanPhone.slice(7)}`
    : phoneNumber;

  const id = `dev-phone-${Date.now()}`;
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  const firstPoint: GPSPoint = {
    lat: baseLat,
    lng: baseLng,
    timestamp: timeStr,
    speed: 0,
    address: actualAddress || '서울 노원구 상계동 일대 (실시간 수신)',
  };

  const trail = [firstPoint];

  return {
    id,
    name: customName?.trim() || `${formattedPhone} (휴대폰)`,
    model: '010 스마트폰 실시간 위치 & 궤적 추적',
    type: 'smartphone',
    serialNumber: `SP-${formattedPhone}`,
    phoneNumber: formattedPhone,
    battery: 90,
    isCharging: false,
    status: 'online',
    signalStrength: 4,
    lastSeen: '실시간 (방금 전)',
    currentLocation: firstPoint,
    todayTrail: trail,
    historicalTrails: {
      '2026-10-24': trail,
    },
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
}

export const INITIAL_NOTIFICATIONS: AlertNotification[] = [
  {
    id: 'notif-1',
    deviceId: 'dev-phone-sample',
    deviceName: '010 내 스마트폰 (노원구)',
    deviceType: 'smartphone',
    type: 'geofence_enter',
    title: '노원구 실시간 위치 연결 완료',
    message: '서울 노원구 상계동 기지국 및 GPS 신호가 정상 수신되었습니다.',
    timestamp: '오늘 실시간',
    read: false,
    lat: 37.6550,
    lng: 127.0610,
  },
  {
    id: 'notif-2',
    deviceId: 'dev-1',
    deviceName: '민준이 가방',
    deviceType: 'child',
    type: 'geofence_enter',
    title: '안전구역 도착',
    message: '민준이가 [중계동 은행사거리 학원가] 에 도착했습니다.',
    timestamp: '오늘 08:38',
    read: true,
    lat: 37.6490,
    lng: 127.0750,
  },
];

export const CHILD_TIMELINE_EVENTS: RouteTimelineEvent[] = [
  { time: '08:15', title: '등교 출발', description: '상계동 집에서 출발하였습니다.', type: 'depart', locationName: '상계동 자택' },
  { time: '08:20', title: '노원역 통과', description: '노원역 4번 출구 보행로 통과', type: 'arrive', locationName: '노원역 사거리' },
  { time: '08:38', title: '은행사거리 학원 도착', description: '중계동 은행사거리 학원가 도착', type: 'arrive', locationName: '중계동 학원가' },
  { time: '13:05', title: '귀가 완료', description: '우리집 안전구역 진입 확인', type: 'arrive', locationName: '우리집 (노원구 상계동)' },
];
