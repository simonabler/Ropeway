import { GeoPoint } from './geo.model';
import { TerrainProfile } from './terrain.model';
import { Support } from './support.model';
import { EndStation } from './end-station.model';
import { CableConfiguration } from './cable.model';
import { CalculationMode, CalculationResult, EngineeringDesignMode, SolverType } from './calculation.model';

/**
 * Main Project Model
 * Central data structure for the entire cable car planning project
 */
export interface Project {
  id: string;                            // UUID
  name: string;
  projectNumber?: string;                // Optional report identifier
  companyName?: string;                  // Optional branding for reports
  author?: string;                       // Optional report author
  revision?: string;                     // Optional report revision
  approvalStatus?: 'draft' | 'for-review' | 'approved';
  createdAt: Date;
  modifiedAt: Date;
  notes?: string;
  status: 'draft' | 'calculated' | 'exported';

  // Geographic base
  startPoint: GeoPoint;
  endPoint: GeoPoint | null;
  azimuth: number;                       // Direction in degrees

  // Components
  terrainProfile: TerrainProfile;
  supports: Support[];
  startStation: EndStation;
  endStation: EndStation;
  cableConfig: CableConfiguration;
  cablePresetId?: string;                // M4.5: Reference to preset
  calculationMode?: CalculationMode;     // planning vs engineering
  engineeringDesignMode?: EngineeringDesignMode;
  solverType?: SolverType;               // Calculation solver

  // Calculation result
  calculationResult?: CalculationResult;
}

/**
 * Project Metadata (for list view)
 */
export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: Date;
  modifiedAt: Date;
  status: 'draft' | 'calculated' | 'exported';
  totalLength?: number;
  maxTension?: number;
}
