/**
 * Calculation Result
 */
export interface CalculationResult {
  timestamp: Date;
  method: SolverType;
  designCheck?: WorstCaseDesignCheck;

  cableLine: CablePoint[];               // Cable geometry points
  spans: SpanResult[];

  maxTension: number;                    // Tmax global in kN
  maxHorizontalForce: number;            // Hmax in kN

  // Cable capacity check (replaces estimatedCableDiameter)
  cableCapacityCheck: CableCapacityCheck;

  // Force results
  anchorForces: AnchorForceResult[];
  supportForces: SupportForceResult[];

  warnings: CalculationWarning[];
  isValid: boolean;
}

/**
 * Worst-case design metadata
 */
export interface WorstCaseDesignCheck {
  source: 'worst-case-payload';
  governingLoadPositionM: number;
  governingSpanNumber: number;
  governingSpanLoadRatio: number;
}

/**
 * Cable Capacity Check Result
 * Checks if the selected cable can handle the calculated tension
 */
export interface CableCapacityCheck {
  cableDiameterMm: number;               // Input: user-selected cable diameter
  breakingStrengthNPerMm2: number;       // Used breaking strength
  safetyFactor: number;                  // Used safety factor
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
 * Solver Type
 */
export type SolverType = 'parabolic' | 'catenary' | 'catenary-piecewise';

/**
 * Force Result Vector (kN)
 */
export interface ForceVectorResult {
  horizontal: number;                    // horizontal magnitude in kN
  vertical: number;                      // vertical magnitude in kN
  resultant: number;                     // kN
  angle: number;                         // inclination to horizontal in degrees
}

/**
 * Anchor Force Result
 */
export interface AnchorForceResult extends ForceVectorResult {
  type: 'start' | 'end';
  horizontalSigned: number;              // Fx global, +right / -left in kN
  verticalSigned: number;                // Fy global, +up / -down in kN
}

/**
 * Support Force Result
 */
export interface SupportForceResult extends ForceVectorResult {
  supportId: string;
  supportNumber: number;
  stationLength: number;
  horizontalSigned: number;              // Fx global, +right / -left in kN
  verticalSigned: number;                // Fy global, +up / -down in kN
}

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
