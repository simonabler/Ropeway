import { SpanGeometry } from '../geometry/span-geometry';
import { CablePoint } from '../../../../models';
import { ParabolicResult } from './parabolic-approximation';
import { solveCatenaryA } from './catenary-utils';

/**
 * Piecewise catenary result (reuses ParabolicResult shape)
 */
export type PiecewiseCatenaryResult = ParabolicResult;

/**
 * Calculate piecewise catenary with a point load at a given position.
 *
 * Assumptions:
 * - Horizontal force H is constant along the span
 * - Self-weight is uniform (w)
 * - Point load introduces a slope discontinuity at load position
 *
 * @param span Span geometry
 * @param cableWeightN Cable weight in N/m
 * @param sagM Desired sag in meters (used to compute H from empty cable)
 * @param pointLoadN Point load in N
 * @param loadRatio Load position along span [0..1]
 * @param numPoints Number of points to calculate (default 30)
 */
export function calculatePiecewiseCatenaryCable(
  span: SpanGeometry,
  cableWeightN: number,
  sagM: number,
  pointLoadN: number,
  loadRatio: number = 0.5,
  numPoints: number = 30
): PiecewiseCatenaryResult {
  const { length, heightDiff, fromHeight, toHeight, fromSupportId, toSupportId, spanNumber } = span;

  numPoints = Math.max(numPoints, Math.floor(length / 5), 10);

  const a = solveCatenaryA(length, Math.max(sagM, 0.01));
  const H = cableWeightN * a;

  const xP = Math.min(Math.max(loadRatio, 0.05), 0.95) * length;
  const y0 = fromHeight;
  const y1 = toHeight;

  const { x0L, x0R, cL, cR } = solvePiecewiseOffsets(a, H, pointLoadN, length, xP, y0, y1);

  const cableLine: CablePoint[] = [];
  let minYRel = Infinity;
  let minYX = 0;

  for (let i = 0; i <= numPoints; i++) {
    const x = (i / numPoints) * length;
    const isLeft = x <= xP;
    const x0 = isLeft ? x0L : x0R;
    const c = isLeft ? cL : cR;
    const yRel = a * Math.cosh((x - x0) / a) + c;

    cableLine.push({
      stationLength: x,
      height: yRel,
      groundClearance: 0
    });

    if (yRel < minYRel) {
      minYRel = yRel;
      minYX = x;
    }
  }

  // Slopes at supports
  const slopeStart = Math.sinh((0 - x0L) / a);
  const slopeEnd = Math.sinh((length - x0R) / a);

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

function solvePiecewiseOffsets(
  a: number,
  H: number,
  P: number,
  L: number,
  xP: number,
  y0: number,
  y1: number
): { x0L: number; x0R: number; cL: number; cR: number } {
  const maxIter = 40;
  let x0L = L / 2;
  let x0R = L / 2;

  const cFromLeft = (x0: number) => y0 - a * Math.cosh((0 - x0) / a);
  const cFromRight = (x0: number) => y1 - a * Math.cosh((L - x0) / a);

  const f1 = (xl: number, xr: number) => {
    const cL = cFromLeft(xl);
    const cR = cFromRight(xr);
    const yL = a * Math.cosh((xP - xl) / a) + cL;
    const yR = a * Math.cosh((xP - xr) / a) + cR;
    return yL - yR;
  };

  const f2 = (xl: number, xr: number) => {
    const vL = H * Math.sinh((xP - xl) / a);
    const vR = H * Math.sinh((xP - xr) / a);
    return (vR - vL) - P;
  };

  const eps = 1e-3;

  for (let i = 0; i < maxIter; i++) {
    const F1 = f1(x0L, x0R);
    const F2 = f2(x0L, x0R);
    if (Math.abs(F1) < 1e-4 && Math.abs(F2) < 1e-2) break;

    const dF1dxL = (f1(x0L + eps, x0R) - F1) / eps;
    const dF1dxR = (f1(x0L, x0R + eps) - F1) / eps;
    const dF2dxL = (f2(x0L + eps, x0R) - F2) / eps;
    const dF2dxR = (f2(x0L, x0R + eps) - F2) / eps;

    const det = dF1dxL * dF2dxR - dF1dxR * dF2dxL;
    if (Math.abs(det) < 1e-9) break;

    const dxL = (-F1 * dF2dxR + F2 * dF1dxR) / det;
    const dxR = (dF1dxL * (-F2) + dF2dxL * F1) / det;

    x0L += dxL;
    x0R += dxR;
  }

  const cL = cFromLeft(x0L);
  const cR = cFromRight(x0R);

  return { x0L, x0R, cL, cR };
}
