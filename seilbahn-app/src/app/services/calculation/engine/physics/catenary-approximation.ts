import { SpanGeometry } from '../geometry/span-geometry';
import { CablePoint } from '../../../../models';
import { ParabolicResult } from './parabolic-approximation';
import { solveCatenaryA } from './catenary-utils';

/**
 * Catenary Cable Calculation Result
 * Reuses ParabolicResult shape for compatibility
 */
export type CatenaryResult = ParabolicResult;

/**
 * Calculate cable line using catenary approximation (exact for self-weight)
 *
 * Uses the catenary sag definition:
 *   f = a * (cosh(L / (2a)) - 1)
 * where a = H / w
 *
 * For inclined spans, the catenary is added to the chord line between supports.
 *
 * @param span Span geometry
 * @param cableWeightN Cable weight in N/m
 * @param sagM Desired sag in meters
 * @param numPoints Number of points to calculate (default 20)
 */
export function calculateCatenaryCable(
  span: SpanGeometry,
  cableWeightN: number,
  sagM: number,
  numPoints: number = 20
): CatenaryResult {
  const { length, heightDiff, fromHeight, toHeight, fromSupportId, toSupportId, spanNumber } = span;

  // Ensure minimum number of points
  numPoints = Math.max(numPoints, Math.floor(length / 5), 10);

  // Solve for a using sag definition
  const a = solveCatenaryA(length, Math.max(sagM, 0.01));
  const H = cableWeightN * a; // H = w * a

  const cableLine: CablePoint[] = [];
  let minYRel = Infinity;
  let minYX = 0;

  for (let i = 0; i <= numPoints; i++) {
    const x = (i / numPoints) * length;

    // Catenary sag relative to chord line (0 at supports)
    const yRel = a * Math.cosh((x - length / 2) / a) - a * Math.cosh(length / (2 * a));

    // Chord height between supports
    const chordHeight = fromHeight + (heightDiff / length) * x;
    const y = chordHeight + yRel;

    cableLine.push({
      stationLength: x,
      height: y,
      groundClearance: 0
    });

    if (yRel < minYRel) {
      minYRel = yRel;
      minYX = x;
    }
  }

  // Slopes at supports (derivative of catenary + chord slope)
  const chordSlope = heightDiff / length;
  const slopeStart = Math.sinh((-length / 2) / a) + chordSlope;
  const slopeEnd = Math.sinh((length / 2) / a) + chordSlope;

  const V_start = (H * slopeStart) / 1000;
  const V_end = (H * slopeEnd) / 1000;

  const T_start = Math.sqrt(H * H + (V_start * 1000) * (V_start * 1000)) / 1000;
  const T_end = Math.sqrt(H * H + (V_end * 1000) * (V_end * 1000)) / 1000;
  const maxTension = Math.max(T_start, T_end);

  return {
    spanNumber,
    fromSupportId,
    toSupportId,
    cableLine,
    horizontalForce: H / 1000,
    verticalForceStart: V_start,
    verticalForceEnd: V_end,
    maxTension,
    sagAtLowest: Math.abs(minYRel),
    lowestPointStation: minYX,
    minClearance: 0,
    minClearanceAt: 0
  };
}
