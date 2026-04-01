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
import { calculateCatenaryCable } from './engine/physics/catenary-approximation';
import { calculatePiecewiseCatenaryCable } from './engine/physics/piecewise-catenary';
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
    const solverType = project.solverType ?? 'parabolic';

    // Validate input
    const validationWarnings = this.validateProject(project);
    warnings.push(...validationWarnings);

    // If critical errors, return invalid result
    const hasCriticalErrors = warnings.some(w => w.severity === 'error');
    if (hasCriticalErrors) {
      return this.createInvalidResult(warnings, solverType);
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
      return this.createInvalidResult(warnings, solverType);
    }

    // Cable weight in N/m (convert from kg/m)
    const cableWeightN = project.cableConfig.cableWeightPerMeter * 9.81;
    const pointLoadN = project.cableConfig.maxLoad * 9.81;

    // Horizontal tension from config (kN → N)
    // H is the primary parameter; sag is derived per span as f = w*L²/(8*H)
    const globalH = (project.cableConfig.horizontalTensionKN || 15) * 1000;

    if (solverType === 'catenary-piecewise') {
      warnings.push({
        severity: 'info',
        message: 'Stückweise Kettenlinie: Punktlast wird in Feldmitte angenommen.'
      });
    }

    // Calculate each span
    const spanResults: ParabolicResult[] = [];
    let baseStation = project.startStation.stationLength;

    for (let spanIndex = 0; spanIndex < spanGeometries.length; spanIndex++) {
      const spanGeometry = spanGeometries[spanIndex];

      // Per-span sag from global H: f_i = w * L_i² / (8 * H)
      const spanSag = (cableWeightN * spanGeometry.length * spanGeometry.length) / (8 * globalH);

      const spanResult = solverType === 'catenary'
        ? calculateCatenaryCable(spanGeometry, cableWeightN, spanSag)
        : solverType === 'catenary-piecewise'
          ? calculatePiecewiseCatenaryCable(
            spanGeometry,
            cableWeightN,
            spanSag,
            pointLoadN,
            0.5
          )
          : calculateParabolicCable(spanGeometry, cableWeightN, spanSag);

      // Determine if this span is adjacent to a ground-level anchor
      const isFirstSpan = spanIndex === 0;
      const isLastSpan = spanIndex === spanGeometries.length - 1;
      const startAnchorAtGround = isFirstSpan && (project.startStation.anchorPoint.heightAboveTerrain || 0) < 0.5;
      const endAnchorAtGround = isLastSpan && (project.endStation.anchorPoint.heightAboveTerrain || 0) < 0.5;

      // For anchor spans, skip clearance check near the ground-level anchor
      // (cable naturally starts/ends at ground level there)
      let pointsToCheck = spanResult.cableLine;
      if (startAnchorAtGround || endAnchorAtGround) {
        const skipDistance = Math.min(spanGeometry.length * 0.15, 10);
        pointsToCheck = spanResult.cableLine.filter(p => {
          if (startAnchorAtGround && p.stationLength < skipDistance) return false;
          if (endAnchorAtGround && p.stationLength > spanGeometry.length - skipDistance) return false;
          return true;
        });
      }

      // Check clearance
      const clearanceResult = pointsToCheck.length > 0
        ? checkCableClearance(
            pointsToCheck,
            project.terrainProfile,
            baseStation,
            project.cableConfig.minGroundClearance
          )
        : { minClearance: Infinity, minClearanceAt: 0, isViolated: false, violations: [] };

      // Apply clearance to result
      const resultWithClearance = applyClearanceToSpan(spanResult, clearanceResult);

      spanResults.push(resultWithClearance);

      // Add warnings for clearance violations
      if (clearanceResult.isViolated) {
        warnings.push({
          severity: 'warning',
          message: `Spannfeld ${spanResult.spanNumber}: Bodenfreiheit unterschritten (min: ${clearanceResult.minClearance.toFixed(2)}m bei Station ${clearanceResult.minClearanceAt.toFixed(1)}m)`,
          relatedElement: `span-${spanResult.spanNumber}`
        });
      }

      baseStation += spanGeometry.length;
    }

    // Combine cable lines
    const combinedCableLine: CablePoint[] = [];
    baseStation = project.startStation.stationLength;

    for (const result of spanResults) {
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
    const spans: SpanResult[] = spanResults.map(pr => ({
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
      method: solverType,
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
  private createInvalidResult(warnings: CalculationWarning[], method: Project['solverType'] = 'parabolic'): CalculationResult {
    return {
      timestamp: new Date(),
      method: method ?? 'parabolic',
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

      const hLeft = leftSpan ? leftSpan.horizontalForce : 0;
      const hRight = rightSpan ? rightSpan.horizontalForce : 0;
      const vLeft = leftSpan ? Math.abs(leftSpan.verticalForceEnd) : 0;
      const vRight = rightSpan ? Math.abs(rightSpan.verticalForceStart) : 0;

      // Horizontal components oppose each other at the support.
      const horizontal = Math.abs(hRight - hLeft);
      // Vertical support reaction acts in one direction and accumulates.
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
