import { CablePoint, TerrainProfile, TerrainSegment } from '../../../../models';
import { ParabolicResult } from '../physics/parabolic-approximation';

/**
 * Clearance Check Result
 */
export interface ClearanceResult {
  minClearance: number;          // Minimum clearance in meters
  minClearanceAt: number;        // Station length where minimum occurs
  isViolated: boolean;           // True if clearance < required
  violations: ClearanceViolation[];
}

export interface ClearanceViolation {
  stationLength: number;
  actualClearance: number;
  requiredClearance: number;
  deficit: number;               // How much below requirement
}

/**
 * Check cable clearance against terrain profile
 */
export function checkCableClearance(
  cablePoints: CablePoint[],
  terrainProfile: TerrainProfile,
  baseStationLength: number,     // Starting station of this span
  minRequiredClearance: number
): ClearanceResult {
  let minClearance = Infinity;
  let minClearanceAt = 0;
  const violations: ClearanceViolation[] = [];

  // Check each cable point
  for (const point of cablePoints) {
    const absoluteStation = baseStationLength + point.stationLength;
    const terrainHeight = getTerrainHeightAt(terrainProfile, absoluteStation);
    const clearance = point.height - terrainHeight;

    // Update cable point with clearance
    point.groundClearance = clearance;

    // Track minimum
    if (clearance < minClearance) {
      minClearance = clearance;
      minClearanceAt = absoluteStation;
    }

    // Check for violations
    if (clearance < minRequiredClearance) {
      violations.push({
        stationLength: absoluteStation,
        actualClearance: clearance,
        requiredClearance: minRequiredClearance,
        deficit: minRequiredClearance - clearance
      });
    }
  }

  return {
    minClearance,
    minClearanceAt,
    isViolated: violations.length > 0,
    violations
  };
}

/**
 * Get terrain height at specific station length (interpolated)
 */
export function getTerrainHeightAt(
  terrainProfile: TerrainProfile,
  stationLength: number
): number {
  const segments = terrainProfile.segments;

  if (segments.length === 0) return 0;

  // Before first segment
  if (stationLength <= 0) {
    return segments[0].terrainHeight - calculateSegmentHeightChange(segments[0]);
  }

  // Find segment containing this station
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentStart = i === 0 ? 0 : segments[i - 1].stationLength;
    const segmentEnd = segment.stationLength;

    if (stationLength >= segmentStart && stationLength <= segmentEnd) {
      // Interpolate within segment
      const progress = (stationLength - segmentStart) / (segmentEnd - segmentStart);
      const startHeight = i === 0
        ? segment.terrainHeight - calculateSegmentHeightChange(segment)
        : segments[i - 1].terrainHeight;
      const endHeight = segment.terrainHeight;

      return startHeight + (endHeight - startHeight) * progress;
    }
  }

  // After last segment
  return segments[segments.length - 1].terrainHeight;
}

/**
 * Calculate height change for a terrain segment
 */
function calculateSegmentHeightChange(segment: TerrainSegment): number {
  return (segment.slopePercent / 100) * segment.lengthMeters;
}

/**
 * Apply clearance results to parabolic results
 */
export function applyClearanceToSpan(
  spanResult: ParabolicResult,
  clearanceResult: ClearanceResult
): ParabolicResult {
  return {
    ...spanResult,
    minClearance: clearanceResult.minClearance,
    minClearanceAt: clearanceResult.minClearanceAt
  };
}
