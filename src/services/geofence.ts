import type { GeofenceZone } from '../types';

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

export interface ClientGeofenceEvaluation {
  allowed: boolean;
  nearestZone: GeofenceZone | null;
  distanceMeters: number | null;
}

export function evaluateClientGeofence(
  lat: number,
  lng: number,
  zones: GeofenceZone[],
): ClientGeofenceEvaluation {
  if (!zones.length) {
    return { allowed: true, nearestZone: null, distanceMeters: 0 };
  }

  let nearestZone: GeofenceZone | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    const dist = haversineDistanceMeters(lat, lng, zone.lat, zone.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestZone = zone;
    }
    if (dist <= zone.radiusMeters) {
      return { allowed: true, nearestZone: zone, distanceMeters: dist };
    }
  }

  return {
    allowed: false,
    nearestZone,
    distanceMeters: Number.isFinite(minDistance) ? minDistance : null,
  };
}

export function getCurrentPositionAsync(timeoutMs = 10000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS Geolocation is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new Error('Location permission denied. Enable GPS to check in.'));
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        reject(new Error('GPS signal unavailable. Move near a window or outdoors.'));
      } else {
        reject(new Error('GPS request timed out. Tap Refresh GPS and retry.'));
      }
    }, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 30000,
    });
  });
}
