import { CableMaterial } from './cable.model';

/**
 * Cable Parameter Set (M4.5: Reusable Presets)
 */
export interface CableParameterSet {
  id: string;
  name: string;                          // e.g. "Tragseil 16mm Stahl"
  description?: string;

  // Cable physical properties (NEW)
  cable: {
    diameterMm: number;                  // mm - fixed cable diameter
    breakingStrengthKN: number;          // kN - breaking load of the cable
    material: CableMaterial;             // steel or synthetic
  };

  // Carrying cable parameters
  carrier: {
    wNPerM: number;                      // Cable weight in N/m
    sagFM: number;                       // Standard sag in meters
    safetyFactor: number;
    kCoeff: number;                      // Demo MBL coefficient (legacy, kept for compatibility)
  };

  // Load parameters
  load: {
    PN: number;                          // Single load in N
  };

  // Clearance limits
  limits: {
    minClearanceM: number;
    maxTmaxKN?: number;                  // Warning threshold
  };

  // Metadata
  isSystemPreset: boolean;               // System vs. user-defined
  createdAt: string;
  updatedAt: string;
}
