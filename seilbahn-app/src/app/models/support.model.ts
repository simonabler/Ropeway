/**
 * Support (Stütze) Model
 */
export interface Support {
  id: string;
  supportNumber: number;
  stationLength: number;         // Position along route in meters
  terrainHeight: number;         // From terrain profile
  supportHeight: number;         // Support height above terrain in meters
  topElevation: number;          // Calculated: terrainHeight + supportHeight
  clearance?: number;            // Ground clearance below cable
  headGeometry?: SupportHead;    // Future: roller assembly
}

/**
 * Support Head Geometry (Future Extension)
 */
export interface SupportHead {
  type: 'roller' | 'fixed';
  rollerDiameter?: number;
  numberOfRollers?: number;
}
