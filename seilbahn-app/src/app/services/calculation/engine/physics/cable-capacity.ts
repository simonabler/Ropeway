/**
 * Cable Capacity Calculations
 *
 * Determines if a selected cable can handle the calculated tension loads.
 * Uses the formula: T_allowed = (A × σ) / SF
 *
 * Where:
 * - A = cross-sectional area (π × r²)
 * - σ = material breaking strength (N/mm²)
 * - SF = safety factor
 */

import { CableCapacityCheck, CableCapacityStatus } from '../../../../models/calculation.model';
import { CableMaterial, MATERIAL_STRENGTH } from '../../../../models/cable.model';

/**
 * Calculate the cross-sectional area of a cable
 * @param diameterMm Cable diameter in mm
 * @returns Area in mm²
 */
export function calculateCableArea(diameterMm: number): number {
  const radiusMm = diameterMm / 2;
  return Math.PI * radiusMm * radiusMm;
}

/**
 * Calculate the breaking load of a cable based on diameter and material
 * @param diameterMm Cable diameter in mm
 * @param material Cable material type
 * @param customBreakingStrengthMPa Optional custom breaking strength in N/mm²
 * @returns Breaking load in kN
 */
export function calculateBreakingLoad(
  diameterMm: number,
  material: CableMaterial,
  customBreakingStrengthMPa?: number
): number {
  const areaMm2 = calculateCableArea(diameterMm);
  const strengthMPa = customBreakingStrengthMPa ?? MATERIAL_STRENGTH[material];
  const breakingLoadN = areaMm2 * strengthMPa;
  return breakingLoadN / 1000; // Convert to kN
}

/**
 * Calculate the maximum allowed tension for a cable
 *
 * T_allowed = Breaking Load / Safety Factor
 *
 * @param diameterMm Cable diameter in mm
 * @param safetyFactor Safety factor (typically 5 for forestry cables)
 * @param material Cable material type
 * @param customBreakingStrengthMPa Optional custom breaking strength in N/mm²
 * @returns Maximum allowed tension in kN
 */
export function calculateMaxAllowedTension(
  diameterMm: number,
  safetyFactor: number,
  material: CableMaterial = 'steel',
  customBreakingStrengthMPa?: number
): number {
  const breakingLoadKN = calculateBreakingLoad(diameterMm, material, customBreakingStrengthMPa);
  return breakingLoadKN / safetyFactor;
}

/**
 * Determine the capacity status based on utilization percentage
 * @param utilizationPercent Utilization as percentage
 * @returns Status: ok (<80%), warning (80-100%), fail (>100%)
 */
export function determineCapacityStatus(utilizationPercent: number): CableCapacityStatus {
  if (utilizationPercent > 100) {
    return 'fail';
  } else if (utilizationPercent > 80) {
    return 'warning';
  }
  return 'ok';
}

/**
 * Check if a cable can handle the calculated tension load
 *
 * @param diameterMm Cable diameter in mm (user input)
 * @param actualTensionKN Actual calculated max tension in kN
 * @param safetyFactor Safety factor
 * @param material Cable material type
 * @param customBreakingStrengthMPa Optional custom breaking strength
 * @returns Complete capacity check result
 */
export function checkCableCapacity(
  diameterMm: number,
  actualTensionKN: number,
  safetyFactor: number,
  material: CableMaterial = 'steel',
  customBreakingStrengthMPa?: number
): CableCapacityCheck {
  const strengthUsed = customBreakingStrengthMPa ?? MATERIAL_STRENGTH[material];

  const maxAllowedKN = calculateMaxAllowedTension(
    diameterMm,
    safetyFactor,
    material,
    customBreakingStrengthMPa
  );

  const utilizationPercent = (actualTensionKN / maxAllowedKN) * 100;

  // Safety margin: how much reserve we have
  // Positive = safe, negative = overloaded
  const safetyMarginPercent = ((maxAllowedKN - actualTensionKN) / actualTensionKN) * 100;

  const status = determineCapacityStatus(utilizationPercent);

  return {
    cableDiameterMm: diameterMm,
    breakingStrengthNPerMm2: Math.round(strengthUsed * 10) / 10,
    safetyFactor: Math.round(safetyFactor * 10) / 10,
    maxAllowedTensionKN: Math.round(maxAllowedKN * 10) / 10,
    actualMaxTensionKN: Math.round(actualTensionKN * 10) / 10,
    utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    status,
    safetyMarginPercent: Math.round(safetyMarginPercent * 10) / 10
  };
}

/**
 * Get a human-readable description of the capacity status
 * @param status The capacity status
 * @returns German description
 */
export function getCapacityStatusText(status: CableCapacityStatus): string {
  switch (status) {
    case 'ok':
      return 'Seil ausreichend dimensioniert';
    case 'warning':
      return 'Hohe Auslastung - Sicherheitsreserve prüfen';
    case 'fail':
      return 'Seil überlastet - größeren Durchmesser wählen';
  }
}

/**
 * Standard cable data for common forestry cables
 * Breaking strengths based on typical steel wire ropes
 */
export const STANDARD_CABLES: Array<{
  diameterMm: number;
  typicalBreakingStrengthKN: number;
  description: string;
}> = [
  { diameterMm: 10, typicalBreakingStrengthKN: 55, description: '10mm Leichtseil' },
  { diameterMm: 12, typicalBreakingStrengthKN: 79, description: '12mm Forstseil' },
  { diameterMm: 14, typicalBreakingStrengthKN: 108, description: '14mm Forstseil' },
  { diameterMm: 16, typicalBreakingStrengthKN: 141, description: '16mm Standard' },
  { diameterMm: 18, typicalBreakingStrengthKN: 178, description: '18mm Standard' },
  { diameterMm: 20, typicalBreakingStrengthKN: 220, description: '20mm Schwerlast' },
  { diameterMm: 22, typicalBreakingStrengthKN: 266, description: '22mm Schwerlast' },
  { diameterMm: 24, typicalBreakingStrengthKN: 317, description: '24mm Bauseil' },
  { diameterMm: 26, typicalBreakingStrengthKN: 372, description: '26mm Bauseil' },
  { diameterMm: 28, typicalBreakingStrengthKN: 431, description: '28mm Bauseil' },
  { diameterMm: 30, typicalBreakingStrengthKN: 495, description: '30mm Schwerbau' }
];
