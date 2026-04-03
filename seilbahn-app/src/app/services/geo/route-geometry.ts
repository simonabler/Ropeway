import { GeoPoint } from '../../models';

export function hasGeoPoint(point: GeoPoint | null | undefined): point is GeoPoint {
  return !!point && (point.lat !== 0 || point.lng !== 0);
}

export function normalizeAzimuth(azimuth: number): number {
  const normalized = azimuth % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function calculateBearing(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLng = toRadians(to.lng - from.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return Math.round(normalizeAzimuth(toDegrees(Math.atan2(y, x))) * 10) / 10;
}

export function calculateDestination(from: GeoPoint, bearingDeg: number, distanceM: number): GeoPoint {
  const earthRadiusM = 6371000;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(from.lat);
  const lng1 = toRadians(from.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / earthRadiusM) +
    Math.cos(lat1) * Math.sin(distanceM / earthRadiusM) * Math.cos(bearing)
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distanceM / earthRadiusM) * Math.cos(lat1),
    Math.cos(distanceM / earthRadiusM) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2)
  };
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}
