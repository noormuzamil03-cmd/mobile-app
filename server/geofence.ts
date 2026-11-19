import type { GeofenceZone } from './types.ts';

const EARTH_RADIUS_METERS = 6371000;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

export interface GeofenceCheckResult {
  allowed: boolean;
  nearestZone: GeofenceZone | null;
  distanceMeters: number | null;
}

export function checkGeofence(
  lat: number,
  lng: number,
  zones: GeofenceZone[],
): GeofenceCheckResult {
  if (!zones.length) {
    return { allowed: true, nearestZone: null, distanceMeters: 0 };
  }

  let nearestZone: GeofenceZone | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    const dist = haversineMeters(lat, lng, zone.lat, zone.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestZone = zone;
    }
    if (dist <= zone.radiusMeters) {
      return {
        allowed: true,
        nearestZone: zone,
        distanceMeters: dist,
      };
    }
  }

  return {
    allowed: false,
    nearestZone,
    distanceMeters: Number.isFinite(minDistance) ? minDistance : null,
  };
}
