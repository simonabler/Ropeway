import { GeoPoint } from './geo.model';

/**
 * Terrain Profile containing all segments
 */
export interface TerrainProfile {
  segments: TerrainSegment[];
  recordingMethod: 'manual' | 'gps';
  totalLength: number;           // Calculated total length in meters
  elevationChange: number;       // Calculated total elevation change
}

/**
 * Individual Terrain Segment
 */
export interface TerrainSegment {
  id: string;
  segmentNumber: number;
  lengthMeters: number;          // Horizontal length (laser measurement)
  slopePercent: number;          // Slope in % (positive = uphill, negative = downhill)
  stationLength: number;         // Cumulative station length (calculated)
  terrainHeight: number;         // Cumulative terrain height (calculated)
  geoPoint?: GeoPoint;           // Optional GPS point if GPS-assisted
  notes?: string;
}
