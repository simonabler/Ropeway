/**
 * Calculation Result
 */
export interface CalculationResult {
  timestamp: Date;
  method: 'parabolic' | 'catenary';

  cableLine: CablePoint[];               // Cable geometry points
  spans: SpanResult[];

  maxTension: number;                    // Tmax global in kN
  maxHorizontalForce: number;            // Hmax in kN

  // Cable capacity check (replaces estimatedCableDiameter)
  cableCapacityCheck: CableCapacityCheck;

  warnings: CalculationWarning[];
  isValid: boolean;
}

/**
 * Cable Capacity Check Result
 * Checks if the selected cable can handle the calculated tension
 */
export interface CableCapacityCheck {
  cableDiameterMm: number;               // Input: user-selected cable diameter
  maxAllowedTensionKN: number;           // Calculated from diameter + safety factor
  actualMaxTensionKN: number;            // From cable calculation
  utilizationPercent: number;            // (actual / allowed) * 100
  status: CableCapacityStatus;           // ok, warning, or fail
  safetyMarginPercent: number;           // Reserve: ((allowed - actual) / actual) * 100
}

/**
 * Cable Capacity Status
 */
export type CableCapacityStatus = 'ok' | 'warning' | 'fail';

/**
 * Cable Point (for visualization)
 */
export interface CablePoint {
  stationLength: number;                 // meters
  height: number;                        // height of cable
  groundClearance: number;               // clearance to terrain
}

/**
 * Span Result (per span field)
 */
export interface SpanResult {
  spanNumber: number;
  fromSupport: string;                   // Support ID
  toSupport: string;
  spanLength: number;
  heightDifference: number;

  maxTension: number;                    // kN
  horizontalForce: number;               // kN
  verticalForceStart: number;            // kN
  verticalForceEnd: number;              // kN

  minClearance: number;
  minClearanceAt: number;                // Station length of minimum clearance
}

/**
 * Calculation Warning/Error
 */
export interface CalculationWarning {
  severity: 'error' | 'warning' | 'info';
  message: string;
  relatedElement?: string;               // Support ID, span number, etc.
}
