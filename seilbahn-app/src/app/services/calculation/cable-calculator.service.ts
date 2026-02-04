import { Injectable } from '@angular/core';
import {
  Project,
  CalculationResult,
  SpanResult,
  CalculationWarning,
  CablePoint,
  AnchorForceResult,
  SupportForceResult
} from '../../models';
import { calculateSpanGeometries } from './engine/geometry/span-geometry';
import { calculateParabolicCable, ParabolicResult } from './engine/physics/parabolic-approximation';
import { checkCableClearance, applyClearanceToSpan } from './engine/geometry/clearance-checker';
import { checkCableCapacity, getCapacityStatusText } from './engine/physics/cable-capacity';

/**
 * Cable Calculator Service
 * Orchestrates all cable calculations for a project
 */
@Injectable({
  providedIn: 'root'
})
export class CableCalculatorService {
  /**
   * Calculate complete cable system for project
   */
  calculateCable(project: Project): CalculationResult {
    const warnings: CalculationWarning[] = [];

    // Validate input
    const validationWarnings = this.validateProject(project);
    warnings.push(...validationWarnings);

    // If critical errors, return invalid result
    const hasCriticalErrors = warnings.some(w => w.severity === 'error');
    if (hasCriticalErrors) {
      return this.createInvalidResult(warnings);
    }

    // Calculate span geometries
    const spanGeometries = calculateSpanGeometries(
      project.supports,
      project.startStation,
      project.endStation
    );

    if (spanGeometries.length === 0) {
      warnings.push({
        severity: 'error',
        message: 'Keine Spannfelder vorhanden. Fügen Sie mindestens eine Stütze hinzu.'
      });
      return this.createInvalidResult(warnings);
    }

    // Cable weight in N/m (convert from kg/m)
    const cableWeightN = project.cableConfig.cableWeightPerMeter * 9.81;

    // Default sag if not specified
    const sagM = project.cableConfig.allowedSag || 3.0;

    // Calculate each span
    const parabolicResults: ParabolicResult[] = [];
    let baseStation = project.startStation.stationLength;

    for (const spanGeometry of spanGeometries) {
      // Calculate parabolic cable
      const parabolic = calculateParabolicCable(
        spanGeometry,
        cableWeightN,
        sagM
      );

      // Check clearance
      const clearanceResult = checkCableClearance(
        parabolic.cableLine,
        project.terrainProfile,
        baseStation,
        project.cableConfig.minGroundClearance
      );

      // Apply clearance to result
      const resultWithClearance = applyClearanceToSpan(parabolic, clearanceResult);

      parabolicResults.push(resultWithClearance);

      // Add warnings for clearance violations
      if (clearanceResult.isViolated) {
        warnings.push({
          severity: 'warning',
          message: `Spannfeld ${parabolic.spanNumber}: Bodenfreiheit unterschritten (min: ${clearanceResult.minClearance.toFixed(2)}m bei Station ${clearanceResult.minClearanceAt.toFixed(1)}m)`,
          relatedElement: `span-${parabolic.spanNumber}`
        });
      }

      baseStation += spanGeometry.length;
    }

    // Combine cable lines
    const combinedCableLine: CablePoint[] = [];
    baseStation = project.startStation.stationLength;

    for (const result of parabolicResults) {
      for (const point of result.cableLine) {
        combinedCableLine.push({
          stationLength: baseStation + point.stationLength,
          height: point.height,
          groundClearance: point.groundClearance
        });
      }
      baseStation += result.cableLine[result.cableLine.length - 1].stationLength;
    }

    // Convert parabolic results to span results
    const spans: SpanResult[] = parabolicResults.map(pr => ({
      spanNumber: pr.spanNumber,
      fromSupport: pr.fromSupportId,
      toSupport: pr.toSupportId,
      spanLength: pr.cableLine[pr.cableLine.length - 1].stationLength,
      heightDifference: pr.cableLine[pr.cableLine.length - 1].height - pr.cableLine[0].height,
      maxTension: pr.maxTension,
      horizontalForce: pr.horizontalForce,
      verticalForceStart: pr.verticalForceStart,
      verticalForceEnd: pr.verticalForceEnd,
      minClearance: pr.minClearance,
      minClearanceAt: pr.minClearanceAt
    }));

    // Find maximum values
    const maxTension = Math.max(...spans.map(s => s.maxTension));
    const maxHorizontalForce = Math.max(...spans.map(s => s.horizontalForce));

    // Check cable capacity (replaces estimated diameter)
    const customStrength = project.cableConfig.minBreakingStrengthNPerMm2
      ? project.cableConfig.minBreakingStrengthNPerMm2
      : project.cableConfig.cableBreakingStrengthKN
        ? project.cableConfig.cableBreakingStrengthKN * 1000 / this.calculateCableArea(project.cableConfig.cableDiameterMm)
        : undefined;

    const capacityCheck = checkCableCapacity(
      project.cableConfig.cableDiameterMm,
      maxTension,
      project.cableConfig.safetyFactor,
      project.cableConfig.cableMaterial,
      customStrength
    );

    // Add capacity check result as warning/info
    const statusText = getCapacityStatusText(capacityCheck.status);
    warnings.push({
      severity: capacityCheck.status === 'fail' ? 'error' : capacityCheck.status === 'warning' ? 'warning' : 'info',
      message: `${statusText} (Auslastung: ${capacityCheck.utilizationPercent.toFixed(0)}%, T_max=${maxTension.toFixed(1)}kN, zulässig=${capacityCheck.maxAllowedTensionKN.toFixed(1)}kN)`
    });

    const anchorForces = this.calculateAnchorForces(spans);
    const supportForces = this.calculateSupportForces(spans, project.supports);

    return {
      timestamp: new Date(),
      method: 'parabolic',
      cableLine: combinedCableLine,
      spans,
      maxTension,
      maxHorizontalForce,
      cableCapacityCheck: capacityCheck,
      anchorForces,
      supportForces,
      warnings,
      isValid: capacityCheck.status !== 'fail'
    };
  }

  /**
   * Calculate cable cross-sectional area
   */
  private calculateCableArea(diameterMm: number): number {
    const radiusMm = diameterMm / 2;
    return Math.PI * radiusMm * radiusMm;
  }

  /**
   * Create an invalid result for error cases
   */
  private createInvalidResult(warnings: CalculationWarning[]): CalculationResult {
    return {
      timestamp: new Date(),
      method: 'parabolic',
      cableLine: [],
      spans: [],
      maxTension: 0,
      maxHorizontalForce: 0,
      cableCapacityCheck: {
        cableDiameterMm: 0,
        breakingStrengthNPerMm2: 0,
        safetyFactor: 0,
        maxAllowedTensionKN: 0,
        actualMaxTensionKN: 0,
        utilizationPercent: 0,
        status: 'fail',
        safetyMarginPercent: 0
      },
      anchorForces: [],
      supportForces: [],
      warnings,
      isValid: false
    };
  }



  private calculateAnchorForces(spans: SpanResult[]): AnchorForceResult[] {
    if (spans.length === 0) return [];

    const startSpan = spans[0];
    const endSpan = spans[spans.length - 1];

    const build = (type: 'start' | 'end', horizontal: number, vertical: number): AnchorForceResult => {
      const h = Math.abs(horizontal);
      const v = Math.abs(vertical);
      const resultant = Math.sqrt(h * h + v * v);
      const angle = Math.atan2(v, h) * 180 / Math.PI;
      return {
        type,
        horizontal: h,
        vertical: v,
        resultant,
        angle
      };
    };

    return [
      build('start', startSpan.horizontalForce, startSpan.verticalForceStart),
      build('end', endSpan.horizontalForce, endSpan.verticalForceEnd)
    ];
  }

  private calculateSupportForces(spans: SpanResult[], supports: Array<{ id: string; supportNumber: number; stationLength: number }>): SupportForceResult[] {
    if (supports.length === 0 || spans.length === 0) return [];

    const supportForces: SupportForceResult[] = [];

    for (const support of supports) {
      const leftSpan = spans.find(s => s.toSupport === support.id);
      const rightSpan = spans.find(s => s.fromSupport === support.id);

      const hLeft = leftSpan ? Math.abs(leftSpan.horizontalForce) : 0;
      const hRight = rightSpan ? Math.abs(rightSpan.horizontalForce) : 0;
      const vLeft = leftSpan ? Math.abs(leftSpan.verticalForceEnd) : 0;
      const vRight = rightSpan ? Math.abs(rightSpan.verticalForceStart) : 0;

      const horizontal = hLeft + hRight;
      const vertical = vLeft + vRight;
      const resultant = Math.sqrt(horizontal * horizontal + vertical * vertical);
      const angle = Math.atan2(vertical, horizontal) * 180 / Math.PI;

      supportForces.push({
        supportId: support.id,
        supportNumber: support.supportNumber,
        stationLength: support.stationLength,
        horizontal,
        vertical,
        resultant,
        angle
      });
    }

    return supportForces;
  }

  /**
   * Validate project before calculation
   */
  private validateProject(project: Project): CalculationWarning[] {
    const warnings: CalculationWarning[] = [];

    // Check terrain profile
    if (!project.terrainProfile || project.terrainProfile.segments.length === 0) {
      warnings.push({
        severity: 'error',
        message: 'Kein Geländeprofil vorhanden. Erfassen Sie zuerst das Bodenprofil.'
      });
    }

    // Check if end station is properly positioned
    if (project.endStation.stationLength <= project.startStation.stationLength) {
      warnings.push({
        severity: 'error',
        message: 'Endstation muss nach der Startstation liegen.'
      });
    }

    // Check cable configuration
    if (project.cableConfig.cableWeightPerMeter <= 0) {
      warnings.push({
        severity: 'error',
        message: 'Seilgewicht muss größer als 0 sein.'
      });
    }

    if (!project.cableConfig.cableDiameterMm || project.cableConfig.cableDiameterMm <= 0) {
      warnings.push({
        severity: 'error',
        message: 'Seildurchmesser muss angegeben werden.'
      });
    }

    if (!project.cableConfig.minBreakingStrengthNPerMm2 || project.cableConfig.minBreakingStrengthNPerMm2 <= 0) {
      warnings.push({
        severity: 'error',
        message: 'Festigkeitsklasse muss angegeben werden.'
      });
    }

    if (project.cableConfig.safetyFactor < 3) {
      warnings.push({
        severity: 'warning',
        message: 'Sicherheitsfaktor ist sehr niedrig (< 3). Empfohlen: 5 oder höher.'
      });
    }

    // Check span lengths
    for (const support of project.supports) {
      if (support.supportHeight <= 0) {
        warnings.push({
          severity: 'warning',
          message: `Stütze ${support.supportNumber}: Stützenhöhe ist 0 oder negativ.`,
          relatedElement: support.id
        });
      }

      if (support.supportHeight > 50) {
        warnings.push({
          severity: 'warning',
          message: `Stütze ${support.supportNumber}: Sehr hohe Stütze (${support.supportHeight}m). Prüfen Sie die Eingabe.`,
          relatedElement: support.id
        });
      }
    }

    return warnings;
  }
}
