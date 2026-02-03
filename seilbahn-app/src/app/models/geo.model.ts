/**
 * Geographic Point Model
 */
export interface GeoPoint {
  lat: number;
  lng: number;
  elevation?: number;      // Optional GPS elevation in meters
  accuracy?: number;       // GPS accuracy in meters
}
