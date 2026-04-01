import { Injectable } from '@angular/core';
import {
  Project,
  CalculationResult,
  SpanResult,
  CalculationWarning,
  CablePoint,
  AnchorForceResult,
  SupportForceResult,
  WorstCaseDesignCheck
} from '../../models';
import { calculateSpanGeometries, SpanGeometry } from './engine/geometry/span-geometry';
import { calculateParabolicCable, ParabolicResult } from './engine/physics/parabolic-approximation';
import { calculateCatenaryCable } from './engine/physics/catenary-approximation';
import { calculatePiecewiseCatenaryCable } from './engine/physics/piecewise-catenary';
import { checkCableClearance, applyClearanceToSpan } from './engine/geometry/clearance-checker';
import { checkCableCapacity, getCapacityStatusText } from './engine/physics/cable-capacity';

interface DesignSpanForces {
  horizontalForce: number;
  verticalForceStart: number;
  verticalForceEnd: number;
  maxTension: number;
}

interface DesignLoadCandidate {
  globalPositionM: number;
  spanIndex: number;
  spanNumber: number;
  loadRatio: number;
}

interface WorstCaseDesignResult {
  spans: DesignSpanForces[];
  maxTension: number;
  maxHorizontalForce: number;
  designCheck?: WorstCaseDesignCheck;
}

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

    const validationWarnings = this.validateProject(project);
    warnings.push(...validationWarnings);

    const hasCriticalErrors = warnings.some(w => w.severity === 'error');
    if (hasCriticalErrors) {
      return this.createInvalidResult(warnings, solverType);
    }

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

    const cableWeightN = project.cableConfig.cableWeightPerMeter * 9.81;
    const pointLoadN = project.cableConfig.maxLoad * 9.81;
    const globalH = (project.cableConfig.horizontalTensionKN || 15) * 1000;

    const spanResults: ParabolicResult[] = [];
    let baseStation = project.startStation.stationLength;

    for (const spanGeometry of spanGeometries) {
      const spanSag = this.calculateSpanSag(cableWeightN, spanGeometry.length, globalH);
      const spanResult = this.calculateBaselineSpan(spanGeometry, solverType, cableWeightN, spanSag);

      const isFirstSpan = spanGeometry.spanNumber === 1;
      const isLastSpan = spanGeometry.spanNumber === spanGeometries.length;
      const startAnchorAtGround =
        isFirstSpan && (project.startStation.anchorPoint.heightAboveTerrain || 0) < 0.5;
      const endAnchorAtGround =
        isLastSpan && (project.endStation.anchorPoint.heightAboveTerrain || 0) < 0.5;

      let pointsToCheck = spanResult.cableLine;
      if (startAnchorAtGround || endAnchorAtGround) {
        const skipDistance = Math.min(spanGeometry.length * 0.15, 10);
        pointsToCheck = spanResult.cableLine.filter(point => {
          if (startAnchorAtGround && point.stationLength < skipDistance) return false;
          if (endAnchorAtGround && point.stationLength > spanGeometry.length - skipDistance) return false;
          return true;
        });
      }

      const clearanceResult = pointsToCheck.length > 0
        ? checkCableClearance(
            pointsToCheck,
            project.terrainProfile,
            baseStation,
            project.cableConfig.minGroundClearance
          )
        : { minClearance: Infinity, minClearanceAt: 0, isViolated: false, violations: [] };

      const resultWithClearance = applyClearanceToSpan(spanResult, clearanceResult);
      spanResults.push(resultWithClearance);

      if (clearanceResult.isViolated) {
        warnings.push({
          severity: 'warning',
          message: `Spannfeld ${spanResult.spanNumber}: Bodenfreiheit unterschritten (min: ${clearanceResult.minClearance.toFixed(2)}m bei Station ${clearanceResult.minClearanceAt.toFixed(1)}m)`,
          relatedElement: `span-${spanResult.spanNumber}`
        });
      }

      baseStation += spanGeometry.length;
    }

    const combinedCableLine = this.combineCableLines(
      spanResults,
      project.startStation.stationLength
    );

    const worstCaseDesign = this.calculateWorstCaseDesign(
      spanGeometries,
      spanResults,
      solverType,
      cableWeightN,
      pointLoadN,
      project.startStation.stationLength
    );

    if (worstCaseDesign.designCheck) {
      warnings.push({
        severity: 'info',
        message: `Bemessungsfall mit ungünstigster Punktlastposition bei ${worstCaseDesign.designCheck.governingLoadPositionM.toFixed(1)}m in Spannfeld ${worstCaseDesign.designCheck.governingSpanNumber}.`
      });
    }

    const spans: SpanResult[] = spanResults.map((result, index) => ({
      spanNumber: result.spanNumber,
      fromSupport: result.fromSupportId,
      toSupport: result.toSupportId,
      spanLength: result.cableLine[result.cableLine.length - 1].stationLength,
      heightDifference:
        result.cableLine[result.cableLine.length - 1].height - result.cableLine[0].height,
      maxTension: worstCaseDesign.spans[index].maxTension,
      horizontalForce: worstCaseDesign.spans[index].horizontalForce,
      verticalForceStart: worstCaseDesign.spans[index].verticalForceStart,
      verticalForceEnd: worstCaseDesign.spans[index].verticalForceEnd,
      minClearance: result.minClearance,
      minClearanceAt: result.minClearanceAt
    }));

    const maxTension = worstCaseDesign.maxTension;
    const maxHorizontalForce = worstCaseDesign.maxHorizontalForce;

    const customStrength = project.cableConfig.minBreakingStrengthNPerMm2
      ? project.cableConfig.minBreakingStrengthNPerMm2
      : project.cableConfig.cableBreakingStrengthKN
        ? project.cableConfig.cableBreakingStrengthKN * 1000 /
          this.calculateCableArea(project.cableConfig.cableDiameterMm)
        : undefined;

    const capacityCheck = checkCableCapacity(
      project.cableConfig.cableDiameterMm,
      maxTension,
      project.cableConfig.safetyFactor,
      project.cableConfig.cableMaterial,
      customStrength
    );

    const statusText = getCapacityStatusText(capacityCheck.status);
    warnings.push({
      severity:
        capacityCheck.status === 'fail'
          ? 'error'
          : capacityCheck.status === 'warning'
            ? 'warning'
            : 'info',
      message: `${statusText} (Auslastung: ${capacityCheck.utilizationPercent.toFixed(0)}%, T_max=${maxTension.toFixed(1)}kN, zulässig=${capacityCheck.maxAllowedTensionKN.toFixed(1)}kN)`
    });

    const anchorForces = this.calculateAnchorForces(spans);
    const supportForces = this.calculateSupportForces(spans, project.supports);

    return {
      timestamp: new Date(),
      method: solverType,
      designCheck: worstCaseDesign.designCheck,
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

  private calculateBaselineSpan(
    spanGeometry: SpanGeometry,
    solverType: Project['solverType'],
    cableWeightN: number,
    spanSag: number
  ): ParabolicResult {
    if (solverType === 'parabolic') {
      return calculateParabolicCable(spanGeometry, cableWeightN, spanSag);
    }

    return calculateCatenaryCable(spanGeometry, cableWeightN, spanSag);
  }

  private calculateWorstCaseDesign(
    spanGeometries: SpanGeometry[],
    baselineSpanResults: ParabolicResult[],
    solverType: Project['solverType'],
    cableWeightN: number,
    pointLoadN: number,
    startStationLength: number
  ): WorstCaseDesignResult {
    const unloadedSpans = baselineSpanResults.map(result => ({
      horizontalForce: result.horizontalForce,
      verticalForceStart: result.verticalForceStart,
      verticalForceEnd: result.verticalForceEnd,
      maxTension: result.maxTension
    }));

    const unloadedResult: WorstCaseDesignResult = {
      spans: unloadedSpans,
      maxTension: Math.max(...unloadedSpans.map(span => span.maxTension)),
      maxHorizontalForce: Math.max(...unloadedSpans.map(span => span.horizontalForce))
    };

    if (pointLoadN <= 0) {
      return unloadedResult;
    }

    const candidates = this.buildDesignLoadCandidates(spanGeometries, startStationLength);
    if (candidates.length === 0) {
      return unloadedResult;
    }

    let bestResult = unloadedResult;

    for (const candidate of candidates) {
      const spans = spanGeometries.map((spanGeometry, index) => {
        const unloadedSpan = baselineSpanResults[index];
        if (index !== candidate.spanIndex) {
          return {
            horizontalForce: unloadedSpan.horizontalForce,
            verticalForceStart: unloadedSpan.verticalForceStart,
            verticalForceEnd: unloadedSpan.verticalForceEnd,
            maxTension: unloadedSpan.maxTension
          };
        }

        return this.calculateLoadedDesignSpan(
          spanGeometry,
          unloadedSpan,
          solverType,
          cableWeightN,
          pointLoadN,
          candidate.loadRatio
        );
      });

      const maxTension = Math.max(...spans.map(span => span.maxTension));
      if (maxTension <= bestResult.maxTension) {
        continue;
      }

      bestResult = {
        spans,
        maxTension,
        maxHorizontalForce: Math.max(...spans.map(span => span.horizontalForce)),
        designCheck: {
          source: 'worst-case-payload',
          governingLoadPositionM: candidate.globalPositionM,
          governingSpanNumber: candidate.spanNumber,
          governingSpanLoadRatio: candidate.loadRatio
        }
      };
    }

    return bestResult;
  }

  private buildDesignLoadCandidates(
    spanGeometries: SpanGeometry[],
    startStationLength: number
  ): DesignLoadCandidate[] {
    const sampleRatios = [0.01, 0.05, 0.1, 0.2, 0.33, 0.5, 0.67, 0.8, 0.9, 0.95, 0.99];
    const candidates: DesignLoadCandidate[] = [];
    let baseStation = startStationLength;

    for (let spanIndex = 0; spanIndex < spanGeometries.length; spanIndex++) {
      const spanGeometry = spanGeometries[spanIndex];
      for (const loadRatio of sampleRatios) {
        candidates.push({
          globalPositionM: baseStation + spanGeometry.length * loadRatio,
          spanIndex,
          spanNumber: spanGeometry.spanNumber,
          loadRatio
        });
      }
      baseStation += spanGeometry.length;
    }

    return candidates;
  }

  private calculateLoadedDesignSpan(
    spanGeometry: SpanGeometry,
    unloadedResult: ParabolicResult,
    solverType: Project['solverType'],
    cableWeightN: number,
    pointLoadN: number,
    loadRatio: number
  ): DesignSpanForces {
    const clampedLoadRatio = Math.min(Math.max(loadRatio, 0.01), 0.99);

    if (solverType === 'catenary-piecewise') {
      const horizontalForceN = unloadedResult.horizontalForce * 1000;
      const spanSag = this.calculateSpanSag(cableWeightN, spanGeometry.length, horizontalForceN);
      const loadedResult = calculatePiecewiseCatenaryCable(
        spanGeometry,
        cableWeightN,
        spanSag,
        pointLoadN,
        clampedLoadRatio
      );

      return {
        horizontalForce: loadedResult.horizontalForce,
        verticalForceStart: loadedResult.verticalForceStart,
        verticalForceEnd: loadedResult.verticalForceEnd,
        maxTension: loadedResult.maxTension
      };
    }

    const horizontalForceN = unloadedResult.horizontalForce * 1000;
    const startReactionN =
      unloadedResult.verticalForceStart * 1000 + pointLoadN * (1 - clampedLoadRatio);
    const endReactionN =
      unloadedResult.verticalForceEnd * 1000 + pointLoadN * clampedLoadRatio;
    const loadStationM = spanGeometry.length * clampedLoadRatio;
    const leftOfLoadN = startReactionN - cableWeightN * loadStationM;
    const rightOfLoadN = leftOfLoadN - pointLoadN;

    return {
      horizontalForce: unloadedResult.horizontalForce,
      verticalForceStart: startReactionN / 1000,
      verticalForceEnd: endReactionN / 1000,
      maxTension: Math.max(
        this.calculateTensionKN(horizontalForceN, startReactionN),
        this.calculateTensionKN(horizontalForceN, endReactionN),
        this.calculateTensionKN(horizontalForceN, leftOfLoadN),
        this.calculateTensionKN(horizontalForceN, rightOfLoadN)
      )
    };
  }

  private combineCableLines(
    spanResults: ParabolicResult[],
    startStationLength: number
  ): CablePoint[] {
    const combinedCableLine: CablePoint[] = [];
    let baseStation = startStationLength;

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

    return combinedCableLine;
  }

  /**
   * Calculate cable cross-sectional area
   */
  private calculateCableArea(diameterMm: number): number {
    const radiusMm = diameterMm / 2;
    return Math.PI * radiusMm * radiusMm;
  }

  private calculateSpanSag(
    cableWeightN: number,
    spanLength: number,
    horizontalForceN: number
  ): number {
    return (cableWeightN * spanLength * spanLength) / (8 * horizontalForceN);
  }

  private calculateTensionKN(horizontalForceN: number, verticalForceN: number): number {
    return Math.sqrt(
      horizontalForceN * horizontalForceN + verticalForceN * verticalForceN
    ) / 1000;
  }

  /**
   * Create an invalid result for error cases
   */
  private createInvalidResult(
    warnings: CalculationWarning[],
    method: Project['solverType'] = 'parabolic'
  ): CalculationResult {
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

    const build = (
      type: 'start' | 'end',
      horizontal: number,
      vertical: number
    ): AnchorForceResult => {
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

  private calculateSupportForces(
    spans: SpanResult[],
    supports: Array<{ id: string; supportNumber: number; stationLength: number }>
  ): SupportForceResult[] {
    if (supports.length === 0 || spans.length === 0) return [];

    const supportForces: SupportForceResult[] = [];

    for (const support of supports) {
      const leftSpan = spans.find(span => span.toSupport === support.id);
      const rightSpan = spans.find(span => span.fromSupport === support.id);

      const hLeft = leftSpan ? leftSpan.horizontalForce : 0;
      const hRight = rightSpan ? rightSpan.horizontalForce : 0;
      const vLeft = leftSpan ? Math.abs(leftSpan.verticalForceEnd) : 0;
      const vRight = rightSpan ? Math.abs(rightSpan.verticalForceStart) : 0;

      const horizontal = Math.abs(hRight - hLeft);
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

    if (!project.terrainProfile || project.terrainProfile.segments.length === 0) {
      warnings.push({
        severity: 'error',
        message: 'Kein Geländeprofil vorhanden. Erfassen Sie zuerst das Bodenprofil.'
      });
    }

    if (project.endStation.stationLength <= project.startStation.stationLength) {
      warnings.push({
        severity: 'error',
        message: 'Endstation muss nach der Startstation liegen.'
      });
    }

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

    if (
      !project.cableConfig.minBreakingStrengthNPerMm2 ||
      project.cableConfig.minBreakingStrengthNPerMm2 <= 0
    ) {
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
