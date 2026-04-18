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
import {
  calculateParabolicCable,
  calculateLoadedParabolicCable,
  ParabolicResult
} from './engine/physics/parabolic-approximation';
import { calculateCatenaryCable } from './engine/physics/catenary-approximation';
import { calculatePiecewiseCatenaryCable } from './engine/physics/piecewise-catenary';
import { checkCableClearance, applyClearanceToSpan } from './engine/geometry/clearance-checker';
import { checkCableCapacity, getCapacityStatusText } from './engine/physics/cable-capacity';
import { GlobalEngineeringCalculatorService } from './engineering/global-engineering-calculator.service';
import { isStationInsideActiveMonitoredRange } from '../operations/operational-envelope';

type DesignSpanResult = ParabolicResult;

interface DesignLoadCandidate {
  globalPositionM: number;
  spanBaseStationM: number;
  spanIndex: number;
  spanNumber: number;
  loadRatio: number;
}

interface WorstCaseDesignResult {
  spans: DesignSpanResult[];
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
  constructor(
    private globalEngineeringCalculatorService: GlobalEngineeringCalculatorService = new GlobalEngineeringCalculatorService()
  ) {}

  /**
   * Calculate complete cable system for project
   */
  calculateCable(project: Project): CalculationResult {
    if ((project.calculationMode ?? 'planning') === 'engineering') {
      return this.globalEngineeringCalculatorService.calculate(project);
    }

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

    const baselineSpanResults: ParabolicResult[] = [];
    let baseStation = project.startStation.stationLength;

    for (const spanGeometry of spanGeometries) {
      const spanSag = this.calculateSpanSag(cableWeightN, spanGeometry.length, globalH);
      const spanResult = this.calculateBaselineSpan(spanGeometry, solverType, cableWeightN, spanSag);

      baselineSpanResults.push(
        this.applySpanClearance(
          spanResult,
          spanGeometry,
          spanGeometries.length,
          project,
          baseStation
        )
      );

      baseStation += spanGeometry.length;
    }

    const activeDesignCase = this.calculateActiveDesignCase(
      spanGeometries,
      baselineSpanResults,
      solverType,
      cableWeightN,
      pointLoadN,
      project.startStation.stationLength,
      project
    );

    const combinedCableLine = this.combineCableLines(
      activeDesignCase.spans,
      project.startStation.stationLength
    );

    if (activeDesignCase.designCheck) {
      warnings.push({
        severity: 'info',
        message: `Aktiver Lastfall mit Punktlastposition bei ${activeDesignCase.designCheck.governingLoadPositionM.toFixed(1)}m in Spannfeld ${activeDesignCase.designCheck.governingSpanNumber}.`
      });
    }

    for (const result of activeDesignCase.spans) {
      if (result.minClearance < project.cableConfig.minGroundClearance) {
        const insideActiveRange = isStationInsideActiveMonitoredRange(
          project.operationalEnvelope,
          result.minClearanceAt
        );
        warnings.push({
          severity: insideActiveRange ? 'warning' : 'info',
          message: insideActiveRange
            ? `Spannfeld ${result.spanNumber}: Bodenfreiheit im aktiv ueberwachten Bereich unterschritten (min: ${result.minClearance.toFixed(2)}m bei Station ${result.minClearanceAt.toFixed(1)}m)`
            : `Spannfeld ${result.spanNumber}: Bodenfreiheit ausserhalb des aktiv ueberwachten Bereichs unterschritten (min: ${result.minClearance.toFixed(2)}m bei Station ${result.minClearanceAt.toFixed(1)}m)`,
          relatedElement: `span-${result.spanNumber}`,
          operationalRangeContext: insideActiveRange ? 'inside-active-range' : 'outside-active-range'
        });
      }
    }

    const spans: SpanResult[] = activeDesignCase.spans.map((result) => ({
      spanNumber: result.spanNumber,
      fromSupport: result.fromSupportId,
      toSupport: result.toSupportId,
      spanLength: result.cableLine[result.cableLine.length - 1].stationLength,
      heightDifference:
        result.cableLine[result.cableLine.length - 1].height - result.cableLine[0].height,
      maxTension: result.maxTension,
      horizontalForce: result.horizontalForce,
      verticalForceStart: result.verticalForceStart,
      verticalForceEnd: result.verticalForceEnd,
      minClearance: result.minClearance,
      minClearanceAt: result.minClearanceAt
    }));

    const maxTension = activeDesignCase.maxTension;
    const maxHorizontalForce = activeDesignCase.maxHorizontalForce;

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
      calculationMode: 'planning',
      solverFamily: 'planning',
      method: solverType,
      modelAssumptions: [
        'Simplified pretension-driven planning calculation',
        'Horizontal pretension is treated as primary input',
        'Not a full global elastic engineering solver'
      ],
      designCheck: activeDesignCase.designCheck,
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

  private calculateActiveDesignCase(
    spanGeometries: SpanGeometry[],
    baselineSpanResults: ParabolicResult[],
    solverType: Project['solverType'],
    cableWeightN: number,
    pointLoadN: number,
    startStationLength: number,
    project: Project
  ): WorstCaseDesignResult {
    const unloadedResult: WorstCaseDesignResult = {
      spans: baselineSpanResults,
      maxTension: Math.max(...baselineSpanResults.map(span => span.maxTension)),
      maxHorizontalForce: Math.max(...baselineSpanResults.map(span => span.horizontalForce))
    };

    if (pointLoadN <= 0) {
      return unloadedResult;
    }

    const candidate = this.buildSelectedLoadCandidate(
      spanGeometries,
      startStationLength,
      project.cableConfig.loadPositionRatio
    );
    if (!candidate) {
      return unloadedResult;
    }

    const spans = spanGeometries.map((spanGeometry, index) => {
      if (index !== candidate.spanIndex) {
        return baselineSpanResults[index];
      }

      const loadedSpan = this.calculateLoadedDesignSpan(
        spanGeometry,
        baselineSpanResults[index],
        solverType,
        cableWeightN,
        pointLoadN,
        candidate.loadRatio
      );

      return this.applySpanClearance(
        loadedSpan,
        spanGeometry,
        spanGeometries.length,
        project,
        candidate.spanBaseStationM
      );
    });

    return {
      spans,
      maxTension: Math.max(...spans.map(span => span.maxTension)),
      maxHorizontalForce: Math.max(...spans.map(span => span.horizontalForce)),
      designCheck: {
        source: 'selected-payload',
        governingLoadPositionM: candidate.globalPositionM,
        governingSpanNumber: candidate.spanNumber,
        governingSpanLoadRatio: candidate.loadRatio
      }
    };
  }

  private buildSelectedLoadCandidate(
    spanGeometries: SpanGeometry[],
    startStationLength: number,
    globalLoadPositionRatio: number
  ): DesignLoadCandidate | null {
    if (spanGeometries.length === 0) {
      return null;
    }

    const totalLength = spanGeometries.reduce((sum, span) => sum + span.length, 0);
    if (totalLength <= 0) {
      return null;
    }

    const clampedGlobalRatio = Math.min(Math.max(globalLoadPositionRatio, 0.05), 0.95);
    const targetOffset = totalLength * clampedGlobalRatio;

    let accumulatedLength = 0;
    let baseStation = startStationLength;

    for (let spanIndex = 0; spanIndex < spanGeometries.length; spanIndex++) {
      const spanGeometry = spanGeometries[spanIndex];
      const nextAccumulatedLength = accumulatedLength + spanGeometry.length;
      const isLastSpan = spanIndex === spanGeometries.length - 1;

      if (targetOffset <= nextAccumulatedLength || isLastSpan) {
        const localOffset = Math.min(
          Math.max(targetOffset - accumulatedLength, 0),
          spanGeometry.length
        );
        const loadRatio = Math.min(
          Math.max(localOffset / spanGeometry.length, 0.01),
          0.99
        );

        return {
          globalPositionM: baseStation + spanGeometry.length * loadRatio,
          spanBaseStationM: baseStation,
          spanIndex,
          spanNumber: spanGeometry.spanNumber,
          loadRatio
        };
      }

      accumulatedLength = nextAccumulatedLength;
      baseStation += spanGeometry.length;
    }

    return null;
  }

  private calculateLoadedDesignSpan(
    spanGeometry: SpanGeometry,
    unloadedResult: ParabolicResult,
    solverType: Project['solverType'],
    cableWeightN: number,
    pointLoadN: number,
    loadRatio: number
  ): DesignSpanResult {
    const clampedLoadRatio = Math.min(Math.max(loadRatio, 0.01), 0.99);
    const horizontalForceN = unloadedResult.horizontalForce * 1000;

    if (solverType === 'parabolic') {
      return calculateLoadedParabolicCable(
        spanGeometry,
        cableWeightN,
        horizontalForceN,
        pointLoadN,
        clampedLoadRatio
      );
    }

    if (solverType === 'catenary' || solverType === 'catenary-piecewise') {
      const spanSag = this.calculateSpanSag(cableWeightN, spanGeometry.length, horizontalForceN);
      return calculatePiecewiseCatenaryCable(
        spanGeometry,
        cableWeightN,
        spanSag,
        pointLoadN,
        clampedLoadRatio
      );
    }

    return unloadedResult;
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

  private applySpanClearance(
    spanResult: ParabolicResult,
    spanGeometry: SpanGeometry,
    spanCount: number,
    project: Project,
    baseStation: number
  ): ParabolicResult {
    const isFirstSpan = spanGeometry.spanNumber === 1;
    const isLastSpan = spanGeometry.spanNumber === spanCount;
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

    return applyClearanceToSpan(spanResult, clearanceResult);
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
      calculationMode: 'planning',
      solverFamily: 'planning',
      method: method ?? 'parabolic',
      modelAssumptions: [
        'Simplified pretension-driven planning calculation'
      ],
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
      horizontalSigned: number,
      verticalSigned: number
    ): AnchorForceResult => {
      const h = Math.abs(horizontalSigned);
      const v = Math.abs(verticalSigned);
      const resultant = Math.sqrt(h * h + v * v);
      const angle = Math.atan2(v, h) * 180 / Math.PI;
      return {
        type,
        horizontal: h,
        vertical: v,
        resultant,
        angle,
        horizontalSigned,
        verticalSigned
      };
    };

    return [
      build('start', startSpan.horizontalForce, startSpan.verticalForceStart),
      build('end', -endSpan.horizontalForce, -endSpan.verticalForceEnd)
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
      const vLeft = leftSpan ? leftSpan.verticalForceEnd : 0;
      const vRight = rightSpan ? rightSpan.verticalForceStart : 0;

      // Support reaction = negative sum of cable forces acting on the support node
      const horizontalSigned = hLeft - hRight;
      const verticalSigned = -(vLeft + vRight);
      const horizontal = Math.abs(horizontalSigned);
      const vertical = Math.abs(verticalSigned);
      const resultant = Math.sqrt(horizontal * horizontal + vertical * vertical);
      const angle = Math.atan2(vertical, horizontal) * 180 / Math.PI;

      supportForces.push({
        supportId: support.id,
        supportNumber: support.supportNumber,
        stationLength: support.stationLength,
        horizontal,
        vertical,
        resultant,
        angle,
        horizontalSigned,
        verticalSigned
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

    if ((project.calculationMode ?? 'planning') === 'engineering') {
      if (
        !project.cableConfig.elasticModulusKNPerMm2 ||
        project.cableConfig.elasticModulusKNPerMm2 <= 0
      ) {
        warnings.push({
          severity: 'error',
          message: 'E-Modul muss im Ingenieurmodus groesser als 0 sein.'
        });
      }

      if (
        !project.cableConfig.fillFactor ||
        project.cableConfig.fillFactor <= 0 ||
        project.cableConfig.fillFactor > 1
      ) {
        warnings.push({
          severity: 'error',
          message: 'Fuellfaktor muss im Ingenieurmodus zwischen 0 und 1 liegen.'
        });
      }
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
