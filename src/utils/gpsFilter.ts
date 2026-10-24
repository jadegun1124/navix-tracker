// Production-Grade GPS Filtering & Kalman Smoothing Engine

export interface GpsRawReading {
  lat: number;
  lng: number;
  accuracy: number; // in meters
  timestamp: number; // epoch ms
  speed?: number | null; // m/s
  altitude?: number | null;
}

export type GpsRejectReason =
  | 'ACCURACY_TOO_LOW' // ① 오차 반경 > 50m
  | 'STALE_CACHE' // ① 10초 이상 지난 과거 캐시 데이터
  | 'DISTANCE_BELOW_THRESHOLD' // ② 정지 시 미세 센서 노이즈 (거리 < 5m)
  | 'VELOCITY_SANITY_FAILED'; // ④ 비정상적인 순간 점프 속도 초과

export const REJECT_REASON_KO: Record<GpsRejectReason, string> = {
  ACCURACY_TOO_LOW: '① 오차 반경 초과 (>50m 폐기)',
  STALE_CACHE: '① 과거 캐시 데이터 (>10초 폐기)',
  DISTANCE_BELOW_THRESHOLD: '② 정지 센서 노이즈 (<5m 무시)',
  VELOCITY_SANITY_FAILED: '④ 비정상 속도 점프 (>145km/h 폐기)',
};

export interface GpsFilterMetrics {
  totalReceived: number;
  acceptedCount: number;
  accuracyRejectedCount: number;
  staleRejectedCount: number;
  stationaryJitterCount: number;
  speedOutlierCount: number;
  lastKalmanGain: number;
}

export interface GpsFilteredResult {
  lat: number;
  lng: number;
  rawLat: number;
  rawLng: number;
  accuracy: number;
  speedKmH: number;
  distanceDeltaMeters: number;
  timestamp: number;
  isAccepted: boolean;
  rejectReason?: GpsRejectReason;
  rejectReasonKorean?: string;
  filterMetrics: GpsFilterMetrics;
}

// 1D Kalman Filter for a single coordinate component
class CoordinateKalmanFilter {
  private Q_metres_per_second: number;
  private Variance: number;
  private InitialValue: number | null = null;
  private TimeStamp_milliseconds: number = 0;

  constructor(processNoiseVariance: number = 3.0) {
    this.Q_metres_per_second = processNoiseVariance;
    this.Variance = -1;
  }

  reset() {
    this.InitialValue = null;
    this.Variance = -1;
    this.TimeStamp_milliseconds = 0;
  }

  filter(value: number, accuracyMeters: number, timestampMs: number): { value: number; kalmanGain: number } {
    const accuracy = Math.max(1, accuracyMeters);

    if (this.Variance < 0 || this.InitialValue === null) {
      this.InitialValue = value;
      this.Variance = accuracy * accuracy;
      this.TimeStamp_milliseconds = timestampMs;
      return { value, kalmanGain: 1.0 };
    }

    const timeDelta = (timestampMs - this.TimeStamp_milliseconds) / 1000;
    if (timeDelta > 0) {
      this.Variance += (timeDelta * this.Q_metres_per_second * this.Q_metres_per_second);
      this.TimeStamp_milliseconds = timestampMs;
    }

    // Measurement update
    const measurementVariance = accuracy * accuracy;
    const K = this.Variance / (this.Variance + measurementVariance); // Kalman Gain
    this.InitialValue = this.InitialValue + K * (value - this.InitialValue);
    this.Variance = (1 - K) * this.Variance;

    return { value: this.InitialValue, kalmanGain: K };
  }
}

// Haversine formula for exact distance in meters
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export class HighAccuracyGpsPipeline {
  // Configurable thresholds matching user specification
  public maxAllowedAccuracyMeters: number = 50; // ① 오차 반경 > 50m 폐기
  public maxStaleCacheMs: number = 10000; // ① 10초 이상 지난 캐시 폐기
  public minDistanceFilterMeters: number = 5.0; // ② 정지 노이즈 필터링 (최소 5m 이동 시 갱신)
  public maxRealisticSpeedKmH: number = 145.0; // ④ 비정상 속도 (시속 145km 초과 점프 폐기)

  private kalmanLat = new CoordinateKalmanFilter(2.5);
  private kalmanLng = new CoordinateKalmanFilter(2.5);

  private lastAcceptedLocation: { lat: number; lng: number; timestamp: number } | null = null;

  public metrics: GpsFilterMetrics = {
    totalReceived: 0,
    acceptedCount: 0,
    accuracyRejectedCount: 0,
    staleRejectedCount: 0,
    stationaryJitterCount: 0,
    speedOutlierCount: 0,
    lastKalmanGain: 1.0,
  };

  reset() {
    this.kalmanLat.reset();
    this.kalmanLng.reset();
    this.lastAcceptedLocation = null;
    this.metrics = {
      totalReceived: 0,
      acceptedCount: 0,
      accuracyRejectedCount: 0,
      staleRejectedCount: 0,
      stationaryJitterCount: 0,
      speedOutlierCount: 0,
      lastKalmanGain: 1.0,
    };
  }

  // Main processing pipeline executing ①, ②, ③, ④
  processReading(raw: GpsRawReading): GpsFilteredResult {
    this.metrics.totalReceived++;
    const now = Date.now();

    // -------------------------------------------------------------
    // ① 1. 캐시 데이터 제외 (location.timestamp > 10초)
    // -------------------------------------------------------------
    const ageMs = now - raw.timestamp;
    if (ageMs > this.maxStaleCacheMs) {
      this.metrics.staleRejectedCount++;
      return {
        lat: raw.lat,
        lng: raw.lng,
        rawLat: raw.lat,
        rawLng: raw.lng,
        accuracy: raw.accuracy,
        speedKmH: 0,
        distanceDeltaMeters: 0,
        timestamp: raw.timestamp,
        isAccepted: false,
        rejectReason: 'STALE_CACHE',
        rejectReasonKorean: REJECT_REASON_KO.STALE_CACHE,
        filterMetrics: { ...this.metrics },
      };
    }

    // -------------------------------------------------------------
    // ① 2. 오차 반경(Accuracy) 필터링 (location.accuracy > 50m)
    // -------------------------------------------------------------
    if (raw.accuracy > this.maxAllowedAccuracyMeters) {
      this.metrics.accuracyRejectedCount++;
      return {
        lat: raw.lat,
        lng: raw.lng,
        rawLat: raw.lat,
        rawLng: raw.lng,
        accuracy: raw.accuracy,
        speedKmH: 0,
        distanceDeltaMeters: 0,
        timestamp: raw.timestamp,
        isAccepted: false,
        rejectReason: 'ACCURACY_TOO_LOW',
        rejectReasonKorean: REJECT_REASON_KO.ACCURACY_TOO_LOW,
        filterMetrics: { ...this.metrics },
      };
    }

    // Check against previous accepted point
    let distanceDelta = 0;
    let calculatedSpeedKmH = raw.speed ? raw.speed * 3.6 : 0;

    if (this.lastAcceptedLocation !== null) {
      distanceDelta = calculateDistanceMeters(
        this.lastAcceptedLocation.lat,
        this.lastAcceptedLocation.lng,
        raw.lat,
        raw.lng
      );

      const timeDeltaSeconds = Math.max(0.1, (raw.timestamp - this.lastAcceptedLocation.timestamp) / 1000);
      const computedSpeedKmh = (distanceDelta / timeDeltaSeconds) * 3.6;

      // -------------------------------------------------------------
      // ④ 속도 기반 이상치 제거 (Sanity Check: 비정상 점프 폐기)
      // -------------------------------------------------------------
      if (computedSpeedKmh > this.maxRealisticSpeedKmH) {
        this.metrics.speedOutlierCount++;
        return {
          lat: raw.lat,
          lng: raw.lng,
          rawLat: raw.lat,
          rawLng: raw.lng,
          accuracy: raw.accuracy,
          speedKmH: Math.round(computedSpeedKmh),
          distanceDeltaMeters: distanceDelta,
          timestamp: raw.timestamp,
          isAccepted: false,
          rejectReason: 'VELOCITY_SANITY_FAILED',
          rejectReasonKorean: REJECT_REASON_KO.VELOCITY_SANITY_FAILED,
          filterMetrics: { ...this.metrics },
        };
      }

      // -------------------------------------------------------------
      // ② 최소 이동 거리(Distance Filter: 미세 센서 노이즈 5m 미만 무시)
      // -------------------------------------------------------------
      if (distanceDelta < this.minDistanceFilterMeters) {
        this.metrics.stationaryJitterCount++;
        return {
          lat: this.lastAcceptedLocation.lat,
          lng: this.lastAcceptedLocation.lng,
          rawLat: raw.lat,
          rawLng: raw.lng,
          accuracy: raw.accuracy,
          speedKmH: 0,
          distanceDeltaMeters: distanceDelta,
          timestamp: raw.timestamp,
          isAccepted: false,
          rejectReason: 'DISTANCE_BELOW_THRESHOLD',
          rejectReasonKorean: REJECT_REASON_KO.DISTANCE_BELOW_THRESHOLD,
          filterMetrics: { ...this.metrics },
        };
      }

      calculatedSpeedKmH = Math.round(computedSpeedKmh);
    }

    // -------------------------------------------------------------
    // ③ 칼만 필터(Kalman Filter) 적용: 튀는 이상치 부드럽게 보정
    // -------------------------------------------------------------
    const filteredLatResult = this.kalmanLat.filter(raw.lat, raw.accuracy, raw.timestamp);
    const filteredLngResult = this.kalmanLng.filter(raw.lng, raw.accuracy, raw.timestamp);

    this.metrics.lastKalmanGain = Number(filteredLatResult.kalmanGain.toFixed(3));
    this.metrics.acceptedCount++;

    const smoothedLat = filteredLatResult.value;
    const smoothedLng = filteredLngResult.value;

    this.lastAcceptedLocation = {
      lat: smoothedLat,
      lng: smoothedLng,
      timestamp: raw.timestamp,
    };

    return {
      lat: smoothedLat,
      lng: smoothedLng,
      rawLat: raw.lat,
      rawLng: raw.lng,
      accuracy: raw.accuracy,
      speedKmH: calculatedSpeedKmH,
      distanceDeltaMeters: distanceDelta,
      timestamp: raw.timestamp,
      isAccepted: true,
      filterMetrics: { ...this.metrics },
    };
  }
}

export const gpsPipeline = new HighAccuracyGpsPipeline();
