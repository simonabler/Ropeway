import { SpanGeometry } from '../geometry/span-geometry';
import { CablePoint } from '../../../../models';

/**
 * Parabolic Cable Calculation Result
 */
export interface ParabolicResult {
  spanNumber: number;
  fromSupportId: string;
  toSupportId: string;

  // Cable line points
  cableLine: CablePoint[];

  // Forces
  horizontalForce: number;        // H in kN
  verticalForceStart: number;     // V at start in kN
  verticalForceEnd: number;       // V at end in kN
  maxTension: number;             // Tmax in kN

  // Sag
  sagAtLowest: number;            // Sag at lowest point in m
  lowestPointStation: number;     // Station of lowest point

  // Clearance (will be calculated later)
  minClearance: number;
  minClearanceAt: number;
}

/**
 * Calculate cable line using parabolic approximation
 *
 * Theory:
 * - Assumes constant horizontal force H across span
 * - Cable forms parabola under uniform load w (N/m)
 * - Equation: y = a*x² + b*x + c
 *
 * Formulas:
 * - H = (w * L²) / (8 * f)  where f = sag
 * - Parabola coefficients for inclined span:
 *   a = 4*f / L²
 *   b = (h2 - h1) / L
 *   c = h1
 *
 * @param span Span geometry
 * @param cableWeightN Cable weight in N/m
 * @param sagM Desired sag in meters
 * @param numPoints Number of points to calculate (default 20)
 */
export function calculateParabolicCable(
  span: SpanGeometry,
  cableWeightN: number,
  sagM: number,
  numPoints: number = 20
): ParabolicResult {
  const { length, heightDiff, fromHeight, toHeight, fromSupportId, toSupportId, spanNumber } = span;

  // Ensure minimum number of points
  numPoints = Math.max(numPoints, Math.floor(length / 5), 10);

  // Calculate horizontal force
  // H = (w * L²) / (8 * f)
  const H = (cableWeightN * length * length) / (8 * sagM);

  // Calculate parabola coefficients for inclined span
  // Reference: https://www.sciencedirect.com/topics/engineering/catenary-cable
  const a = (4 * sagM) / (length * length);
  const b = heightDiff / length;
  const c = 0; // Will be adjusted relative to start height

  // Calculate cable line points
  const cableLine: CablePoint[] = [];
  let minY = Infinity;
  let minYX = 0;

  for (let i = 0; i <= numPoints; i++) {
    const x = (i / numPoints) * length;

    // Parabola equation (relative to chord connecting supports)
    const yRelative = -a * x * (length - x);

    // Absolute height (chord height + parabola sag)
    const chordHeight = fromHeight + (heightDiff / length) * x;
    const y = chordHeight + yRelative;

    cableLine.push({
      stationLength: x,
      height: y,
      groundClearance: 0 // Will be calculated by clearance checker
    });

    // Track lowest point
    if (yRelative < minY) {
      minY = yRelative;
      minYX = x;
    }
  }

  // Calculate vertical forces at supports
  // First derivative of y = -a*x*(L-x) + b*x is dy/dx = a*(2x - L) + b
  const slopeStart = a * (2 * 0 - length) + b;
  const slopeEnd = a * (2 * length - length) + b;

  const V_start = H * slopeStart / 1000; // Convert to kN
  const V_end = H * slopeEnd / 1000;     // Convert to kN

  // Calculate maximum tension (at steeper support)
  const T_start = Math.sqrt(H * H + (V_start * 1000) * (V_start * 1000)) / 1000;
  const T_end = Math.sqrt(H * H + (V_end * 1000) * (V_end * 1000)) / 1000;
  const maxTension = Math.max(T_start, T_end);

  return {
    spanNumber,
    fromSupportId,
    toSupportId,
    cableLine,
    horizontalForce: H / 1000, // Convert to kN
    verticalForceStart: V_start,
    verticalForceEnd: V_end,
    maxTension,
    sagAtLowest: Math.abs(minY),
    lowestPointStation: minYX,
    minClearance: 0, // Placeholder
    minClearanceAt: 0
  };
}

/**
 * Calculate a loaded cable line using a piecewise parabolic approximation.
 *
 * Assumptions:
 * - Horizontal force H is fixed
 * - Self-weight is uniform across the whole span
 * - Point load introduces a slope discontinuity at the load position
 */
export function calculateLoadedParabolicCable(
  span: SpanGeometry,
  cableWeightN: number,
  horizontalForceN: number,
  pointLoadN: number,
  loadRatio: number = 0.5,
  numPoints: number = 20
): ParabolicResult {
  const { length, heightDiff, fromHeight, toHeight, fromSupportId, toSupportId, spanNumber } = span;

  numPoints = Math.max(numPoints, Math.floor(length / 5), 10);

  const H = Math.max(horizontalForceN, 1);
  const clampedLoadRatio = Math.min(Math.max(loadRatio, 0.01), 0.99);
  const xP = clampedLoadRatio * length;
  const quadratic = cableWeightN / (2 * H);

  // Piecewise quadratic under uniform load w and a concentrated load P at xP.
  const c2 = fromHeight;
  const c1 = (
    heightDiff -
    quadratic * length * length -
    (pointLoadN / H) * (length - xP)
  ) / length;
  const c3 = c1 + pointLoadN / H;
  const c4 = fromHeight - (pointLoadN / H) * xP;

  const cableLine: CablePoint[] = [];
  let minY = Infinity;
  let minYX = 0;

  for (let i = 0; i <= numPoints; i++) {
    const x = (i / numPoints) * length;
    const isLeft = x <= xP;
    const y = isLeft
      ? quadratic * x * x + c1 * x + c2
      : quadratic * x * x + c3 * x + c4;

    cableLine.push({
      stationLength: x,
      height: y,
      groundClearance: 0
    });

    if (y < minY) {
      minY = y;
      minYX = x;
    }
  }

  const slopeStart = c1;
  const slopeEnd = (2 * quadratic * length) + c3;
  const slopeLoadLeft = (2 * quadratic * xP) + c1;
  const slopeLoadRight = (2 * quadratic * xP) + c3;

  const V_start = (H * slopeStart) / 1000;
  const V_end = (H * slopeEnd) / 1000;
  const V_loadLeft = (H * slopeLoadLeft) / 1000;
  const V_loadRight = (H * slopeLoadRight) / 1000;

  const T_start = Math.sqrt(H * H + (V_start * 1000) * (V_start * 1000)) / 1000;
  const T_end = Math.sqrt(H * H + (V_end * 1000) * (V_end * 1000)) / 1000;
  const T_loadLeft = Math.sqrt(H * H + (V_loadLeft * 1000) * (V_loadLeft * 1000)) / 1000;
  const T_loadRight = Math.sqrt(H * H + (V_loadRight * 1000) * (V_loadRight * 1000)) / 1000;
  const maxTension = Math.max(T_start, T_end, T_loadLeft, T_loadRight);

  return {
    spanNumber,
    fromSupportId,
    toSupportId,
    cableLine,
    horizontalForce: H / 1000,
    verticalForceStart: V_start,
    verticalForceEnd: V_end,
    maxTension,
    sagAtLowest: Math.max(fromHeight, toHeight) - minY,
    lowestPointStation: minYX,
    minClearance: 0,
    minClearanceAt: 0
  };
}

/**
 * Calculate required sag for given horizontal force
 */
export function calculateRequiredSag(
  spanLength: number,
  cableWeightN: number,
  horizontalForceN: number
): number {
  // f = (w * L²) / (8 * H)
  return (cableWeightN * spanLength * spanLength) / (8 * horizontalForceN);
}

/**
 * Calculate horizontal force for given sag
 */
export function calculateHorizontalForce(
  spanLength: number,
  cableWeightN: number,
  sagM: number
): number {
  // H = (w * L²) / (8 * f)
  return (cableWeightN * spanLength * spanLength) / (8 * sagM);
}

/**
 * Estimate cable diameter based on maximum tension and material strength
 *
 * This is a simplified estimation for pre-planning purposes.
 * Real cable selection requires proper engineering standards.
 *
 * @param maxTensionKN Maximum cable tension in kN
 * @param safetyFactor Safety factor (typical: 5)
 * @param materialStrengthMPa Material strength in N/mm² (typical: 1600-1770 for steel wire rope)
 * @returns Estimated cable diameter in mm
 */
export function estimateCableDiameter(
  maxTensionKN: number,
  safetyFactor: number,
  materialStrengthMPa: number = 1600
): number {
  // Design tension = Max tension * Safety factor
  const designTensionN = maxTensionKN * 1000 * safetyFactor;

  // Required cross-section area: A = T / σ
  const requiredAreaMm2 = designTensionN / materialStrengthMPa;

  // Diameter from area (assuming circular): d = sqrt(4*A/π)
  const diameterMm = Math.sqrt((4 * requiredAreaMm2) / Math.PI);

  // Round up to next common size (typically in 2mm increments)
  return Math.ceil(diameterMm / 2) * 2;
}
