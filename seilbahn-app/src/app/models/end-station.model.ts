/**
 * End Station (Start/End) Model
 */
export interface EndStation {
  type: 'start' | 'end';
  stationLength: number;
  terrainHeight: number;
  anchorPoint: AnchorPoint;
  platformHeight?: number;       // Future: custom station heights
  groundClearance: number;
  identifier?: string;
  notes?: string;
  derivationMode?: 'auto' | 'manual';
  anchorMetadata?: string;
}

/**
 * Anchor Point Configuration
 */
export interface AnchorPoint {
  heightAboveTerrain: number;    // Height of anchor point above terrain
  horizontalOffset?: number;     // Future: horizontal offset from route line
}

/**
 * Calculated forces at anchor point
 */
export interface AnchorForces {
  horizontal: number;            // Horizontal force (H) in kN
  verticalEmpty: number;         // Vertical force empty cable in kN
  verticalLoaded: number;        // Vertical force with load in kN
  resultantEmpty: number;        // Resultant force empty (sqrt(H² + V²)) in kN
  resultantLoaded: number;       // Resultant force loaded in kN
  angleEmpty: number;            // Angle from horizontal (degrees) empty
  angleLoaded: number;           // Angle from horizontal (degrees) loaded
}
