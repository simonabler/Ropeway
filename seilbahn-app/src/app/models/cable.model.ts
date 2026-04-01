/**
 * Cable Configuration
 */
export interface CableConfiguration {
  cableType: 'carrying' | 'combined';    // Future: separate hauling
  cableWeightPerMeter: number;           // kg/m
  maxLoad: number;                       // kg (load per span or total)
  safetyFactor: number;                  // Default: 5
  minGroundClearance: number;            // meters
  allowedSag?: number;                   // DEPRECATED: derived from H, kept for backward compat
  horizontalTensionKN: number;           // kN - primary parameter (Seilzug)

  // Cable properties (INPUT - fixed cable selection)
  cableDiameterMm: number;               // mm - user selects actual cable
  minBreakingStrengthNPerMm2: number;    // N/mm^2 (default 1960, editable)
  cableMaterial: CableMaterial;          // steel or synthetic
  cableBreakingStrengthKN?: number;      // kN - optional override for breaking strength
}

/**
 * Cable Material Types
 */
export type CableMaterial = 'steel' | 'synthetic';

/**
 * Standard cable diameters (mm) for dropdown
 */
export const STANDARD_CABLE_DIAMETERS = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];

/**
 * Material breaking strength (N/mm²)
 * Used to calculate max allowed tension from diameter
 */
export const MATERIAL_STRENGTH: Record<CableMaterial, number> = {
  steel: 1960,      // Festigkeitsklasse 1960 N/mm^2
  synthetic: 1200   // Synthetic ropes vary, conservative estimate
};
