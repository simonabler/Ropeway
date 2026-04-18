import { Injectable } from '@angular/core';
import {
  AnchorForceResult,
  CalculationResult,
  CalculationWarning,
  CablePoint,
  EngineeringDesignMode,
  EngineeringEnvelopeSummary,
  EngineeringSpanExtension,
  Project,
  SpanResult,
  SupportForceResult,
  WorstCaseDesignCheck
} from '../../../models';
import { calculateSpanGeometries, SpanGeometry } from '../engine/geometry/span-geometry';
import { applyClearanceToSpan, checkCableClearance } from '../engine/geometry/clearance-checker';
import { checkCableCapacity, getCapacityStatusText } from '../engine/physics/cable-capacity';
import { ParabolicResult } from '../engine/physics/parabolic-approximation';

interface DesignLoadCandidate {
  globalPositionM: number;
  spanBaseStationM: number;
  spanIndex: number;
  spanNumber: number;
  loadRatio: number;
}

interface SpanState extends ParabolicResult {
  arcLength: number;
  averageTensionKN: number;
  unstretchedLength: number;
  extensionM: number;
}

interface GlobalEngineeringState {
  spans: SpanState[];
  cableLine: CablePoint[];
  maxTension: number;
  maxHorizontalForce: number;
  totalUnstretchedLength: number;
  totalLoadedLength: number;
  horizontalForceN: number;
  designCheck?: WorstCaseDesignCheck;
}

interface CandidateEvaluation {
  candidate: DesignLoadCandidate;
  state: GlobalEngineeringState;
}

@Injectable({
  providedIn: 'root'
})
export class GlobalEngineeringCalculatorService {
  calculate(project: Project): CalculationResult {
    const warnings: CalculationWarning[] = [];
    const spanGeometries = calculateSpanGeometries(
      project.supports,
      project.startStation,
      project.endStation
    );

    if (spanGeometries.length === 0) {
      return this.createInvalidResult([
        {
          severity: 'error',
          message: 'Keine Spannfelder vorhanden. Fügen Sie mindestens eine Stütze hinzu.'
        }
      ]);
    }

    const pointLoadN = project.cableConfig.maxLoad * 9.81;
    const baseHorizontalForceN = Math.max((project.cableConfig.horizontalTensionKN || 15) * 1000, 1000);
    const totalCableAreaMm2 = this.calculateCableArea(project.cableConfig.cableDiameterMm);
    const metallicAreaMm2 = totalCableAreaMm2 * project.cableConfig.fillFactor;
    const axialStiffnessN = Math.max(
      project.cableConfig.elasticModulusKNPerMm2 * 1000 * metallicAreaMm2,
      1
    );
    const designMode: EngineeringDesignMode = project.engineeringDesignMode ?? 'selected';

    const referenceState = this.computeGlobalState(
      spanGeometries,
      project,
      baseHorizontalForceN,
      0,
      null,
      axialStiffnessN,
      designMode
    );

    const evaluations =
      pointLoadN > 0
        ? this.evaluateCandidates(
            spanGeometries,
            project,
            this.buildLoadCandidates(
              spanGeometries,
              project.startStation.stationLength,
              project.cableConfig.loadPositionRatio,
              designMode
            ),
            pointLoadN,
            axialStiffnessN,
            baseHorizontalForceN,
            referenceState.totalUnstretchedLength,
            designMode
          )
        : [];

    const activeState =
      evaluations.length > 0
        ? this.selectActiveEvaluation(evaluations, designMode).state
        : referenceState;
    const envelope =
      designMode === 'worst-case' && evaluations.length > 0
        ? this.buildEnvelopeSummary(
            evaluations.map((evaluation) => evaluation.state),
            project.startStation.stationLength,
            project
          )
        : undefined;

    if (activeState.designCheck) {
      warnings.push({
        severity: 'info',
        message:
          activeState.designCheck.source === 'worst-case-payload'
            ? `Engineering-Modus: Worst-Case-Punktlast bei ${activeState.designCheck.governingLoadPositionM.toFixed(1)}m in Spannfeld ${activeState.designCheck.governingSpanNumber}.`
            : `Engineering-Modus: global elastischer Lastfall bei ${activeState.designCheck.governingLoadPositionM.toFixed(1)}m in Spannfeld ${activeState.designCheck.governingSpanNumber}.`
      });
    }

    warnings.push({
      severity: 'info',
      message: `Engineering-Modus V1 ohne Sattelreibung sowie ohne Mast- und Ankernachgiebigkeit. Horizontalkraft gelöst zu ${(
        activeState.horizontalForceN / 1000
      ).toFixed(1)}kN.`
    });

    if (envelope) {
      warnings.push({
        severity: 'info',
        message: `Worst-Case-Hüllkurve aus ${envelope.sampledLoadCases} Lastpositionen aufgebaut. Kritische Hüllkurven-Bodenfreiheit: ${envelope.minClearanceM.toFixed(2)}m bei Station ${envelope.minClearanceAtM.toFixed(1)}m.`
      });
    }

    for (const result of activeState.spans) {
      if (result.minClearance < project.cableConfig.minGroundClearance) {
        warnings.push({
          severity: 'warning',
          message: `Spannfeld ${result.spanNumber}: Bodenfreiheit unterschritten (min: ${result.minClearance.toFixed(2)}m bei Station ${result.minClearanceAt.toFixed(1)}m)`,
          relatedElement: `span-${result.spanNumber}`
        });
      }
    }

    const spans: SpanResult[] = activeState.spans.map((result) => ({
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

    const capacityCheck = checkCableCapacity(
      project.cableConfig.cableDiameterMm,
      activeState.maxTension,
      project.cableConfig.safetyFactor,
      project.cableConfig.cableMaterial,
      project.cableConfig.minBreakingStrengthNPerMm2
    );

    const statusText = getCapacityStatusText(capacityCheck.status);
    warnings.push({
      severity:
        capacityCheck.status === 'fail'
          ? 'error'
          : capacityCheck.status === 'warning'
            ? 'warning'
            : 'info',
      message: `${statusText} (Auslastung: ${capacityCheck.utilizationPercent.toFixed(0)}%, T_max=${activeState.maxTension.toFixed(1)}kN, zulässig=${capacityCheck.maxAllowedTensionKN.toFixed(1)}kN)`
    });

    return {
      timestamp: new Date(),
      calculationMode: 'engineering',
      solverFamily: 'engineering',
      method: 'global-elastic-catenary',
      modelAssumptions: [
        'Global elastic multi-span analysis',
        'Fixed end points with shared horizontal equilibrium',
        'No saddle friction in V1',
        'No mast or anchor compliance in V1'
      ],
      designCheck: activeState.designCheck,
      engineeringMetrics: {
        designMode,
        solvedHorizontalForceKN: activeState.horizontalForceN / 1000,
        referenceUnstretchedLengthM: referenceState.totalUnstretchedLength,
        loadedUnstretchedLengthM: activeState.totalUnstretchedLength,
        loadedStretchedLengthM: activeState.totalLoadedLength,
        spanExtensions: activeState.spans.map((span): EngineeringSpanExtension => ({
          spanNumber: span.spanNumber,
          stretchedLengthM: span.arcLength,
          unstretchedLengthM: span.unstretchedLength,
          extensionM: span.extensionM,
          averageTensionKN: span.averageTensionKN
        })),
        envelope
      },
      cableLine: activeState.cableLine,
      spans,
      maxTension: activeState.maxTension,
      maxHorizontalForce: activeState.maxHorizontalForce,
      cableCapacityCheck: capacityCheck,
      anchorForces: this.calculateAnchorForces(spans),
      supportForces: this.calculateSupportForces(spans, project.supports),
      warnings,
      isValid: capacityCheck.status !== 'fail'
    };
  }

  private evaluateCandidates(
    spanGeometries: SpanGeometry[],
    project: Project,
    candidates: DesignLoadCandidate[],
    pointLoadN: number,
    axialStiffnessN: number,
    baseHorizontalForceN: number,
    referenceUnstretchedLength: number,
    designMode: EngineeringDesignMode
  ): CandidateEvaluation[] {
    return candidates.map((candidate) => {
      const solvedHorizontalForceN = this.solveGlobalHorizontalForce(
        spanGeometries,
        project,
        candidate,
        pointLoadN,
        axialStiffnessN,
        baseHorizontalForceN,
        referenceUnstretchedLength,
        designMode
      );

      return {
        candidate,
        state: this.computeGlobalState(
          spanGeometries,
          project,
          solvedHorizontalForceN,
          pointLoadN,
          candidate,
          axialStiffnessN,
          designMode
        )
      };
    });
  }

  private selectActiveEvaluation(
    evaluations: CandidateEvaluation[],
    designMode: EngineeringDesignMode
  ): CandidateEvaluation {
    if (designMode === 'selected' || evaluations.length === 1) {
      return evaluations[0];
    }

    return evaluations.reduce((currentWorst, evaluation) => {
      if (evaluation.state.maxTension > currentWorst.state.maxTension + 1e-6) {
        return evaluation;
      }

      if (
        Math.abs(evaluation.state.maxTension - currentWorst.state.maxTension) <= 1e-6 &&
        this.getGlobalMinimumClearance(evaluation.state) < this.getGlobalMinimumClearance(currentWorst.state)
      ) {
        return evaluation;
      }

      return currentWorst;
    });
  }

  private buildEnvelopeSummary(
    states: GlobalEngineeringState[],
    startStationLength: number,
    project: Project
  ): EngineeringEnvelopeSummary {
    const envelopeLine = this.buildEnvelopeCableLine(states);
    const clearance = checkCableClearance(
      envelopeLine.map((point) => ({
        stationLength: point.stationLength - startStationLength,
        height: point.height,
        groundClearance: point.groundClearance
      })),
      project.terrainProfile,
      startStationLength,
      project.cableConfig.minGroundClearance
    );

    return {
      cableLine: envelopeLine,
      minClearanceM: clearance.minClearance,
      minClearanceAtM: clearance.minClearanceAt,
      sampledLoadCases: states.length
    };
  }

  private buildEnvelopeCableLine(states: GlobalEngineeringState[]): CablePoint[] {
    const reference = states[0]?.cableLine ?? [];
    if (reference.length === 0) {
      return [];
    }

    return reference.map((point, index) => {
      let lowestHeight = point.height;
      for (const state of states) {
        const candidatePoint = state.cableLine[index];
        if (candidatePoint && candidatePoint.height < lowestHeight) {
          lowestHeight = candidatePoint.height;
        }
      }

      return {
        stationLength: point.stationLength,
        height: lowestHeight,
        groundClearance: 0
      };
    });
  }

  private computeGlobalState(
    spanGeometries: SpanGeometry[],
    project: Project,
    horizontalForceN: number,
    pointLoadN: number,
    candidate: DesignLoadCandidate | null,
    axialStiffnessN: number,
    designMode: EngineeringDesignMode
  ): GlobalEngineeringState {
    const cableWeightN = project.cableConfig.cableWeightPerMeter * 9.81;
    const spans: SpanState[] = [];
    let totalUnstretchedLength = 0;
    let totalLoadedLength = 0;
    let baseStation = project.startStation.stationLength;

    for (let index = 0; index < spanGeometries.length; index++) {
      const spanGeometry = spanGeometries[index];
      const spanResult =
        candidate && pointLoadN > 0 && index === candidate.spanIndex
          ? this.calculateLoadedEngineeringSpan(
              spanGeometry,
              cableWeightN,
              horizontalForceN,
              pointLoadN,
              candidate.loadRatio,
              axialStiffnessN
            )
          : this.calculateUnloadedEngineeringSpan(
              spanGeometry,
              cableWeightN,
              horizontalForceN,
              axialStiffnessN
            );

      const spanWithClearance = this.applySpanClearance(
        spanResult,
        spanGeometry,
        spanGeometries.length,
        project,
        baseStation
      );

      spans.push(spanWithClearance);
      totalUnstretchedLength += spanWithClearance.unstretchedLength;
      totalLoadedLength += spanWithClearance.arcLength;
      baseStation += spanGeometry.length;
    }

    return {
      spans,
      cableLine: this.combineCableLines(spans, project.startStation.stationLength),
      maxTension: Math.max(...spans.map((span) => span.maxTension)),
      maxHorizontalForce: Math.max(...spans.map((span) => span.horizontalForce)),
      totalUnstretchedLength,
      totalLoadedLength,
      horizontalForceN,
      designCheck: candidate
        ? {
            source: designMode === 'worst-case' ? 'worst-case-payload' : 'selected-payload',
            governingLoadPositionM: candidate.globalPositionM,
            governingSpanNumber: candidate.spanNumber,
            governingSpanLoadRatio: candidate.loadRatio
          }
        : undefined
    };
  }

  private solveGlobalHorizontalForce(
    spanGeometries: SpanGeometry[],
    project: Project,
    candidate: DesignLoadCandidate,
    pointLoadN: number,
    axialStiffnessN: number,
    baseHorizontalForceN: number,
    referenceUnstretchedLength: number,
    designMode: EngineeringDesignMode
  ): number {
    let h1 = Math.max(baseHorizontalForceN * 0.75, 1000);
    let h2 = Math.max(baseHorizontalForceN * 1.15, h1 + 500);
    let f1 =
      this.computeGlobalState(
        spanGeometries,
        project,
        h1,
        pointLoadN,
        candidate,
        axialStiffnessN,
        designMode
      ).totalUnstretchedLength - referenceUnstretchedLength;
    let f2 =
      this.computeGlobalState(
        spanGeometries,
        project,
        h2,
        pointLoadN,
        candidate,
        axialStiffnessN,
        designMode
      ).totalUnstretchedLength - referenceUnstretchedLength;

    let bestH = Math.abs(f1) < Math.abs(f2) ? h1 : h2;
    let bestResidual = Math.min(Math.abs(f1), Math.abs(f2));

    for (let iteration = 0; iteration < 18; iteration++) {
      if (Math.abs(f2 - f1) < 1e-9) {
        break;
      }

      const nextH = Math.max(1000, h2 - (f2 * (h2 - h1)) / (f2 - f1));
      const nextResidual =
        this.computeGlobalState(
          spanGeometries,
          project,
          nextH,
          pointLoadN,
          candidate,
          axialStiffnessN,
          designMode
        ).totalUnstretchedLength - referenceUnstretchedLength;

      if (Math.abs(nextResidual) < bestResidual) {
        bestResidual = Math.abs(nextResidual);
        bestH = nextH;
      }

      h1 = h2;
      f1 = f2;
      h2 = nextH;
      f2 = nextResidual;

      if (bestResidual < 1e-4) {
        break;
      }
    }

    return bestH;
  }

  private calculateUnloadedEngineeringSpan(
    span: SpanGeometry,
    cableWeightN: number,
    horizontalForceN: number,
    axialStiffnessN: number,
    numPoints: number = 30
  ): SpanState {
    const { length, fromHeight, toHeight, heightDiff, fromSupportId, toSupportId, spanNumber } = span;
    const a = Math.max(horizontalForceN / cableWeightN, 0.01);
    const x0 = length / 2 - a * Math.asinh(heightDiff / (2 * a * Math.sinh(length / (2 * a))));
    const c = fromHeight - a * Math.cosh((0 - x0) / a);

    numPoints = Math.max(numPoints, Math.floor(length / 5), 10);

    const cableLine: CablePoint[] = [];
    let minHeight = Infinity;
    let minStation = 0;

    for (let index = 0; index <= numPoints; index++) {
      const x = (index / numPoints) * length;
      const y = a * Math.cosh((x - x0) / a) + c;
      cableLine.push({
        stationLength: x,
        height: y,
        groundClearance: 0
      });

      if (y < minHeight) {
        minHeight = y;
        minStation = x;
      }
    }

    const slopeStart = Math.sinh((0 - x0) / a);
    const slopeEnd = Math.sinh((length - x0) / a);
    const verticalForceStart = (horizontalForceN * slopeStart) / 1000;
    const verticalForceEnd = (horizontalForceN * slopeEnd) / 1000;
    const startTension =
      Math.sqrt(horizontalForceN * horizontalForceN + Math.pow(verticalForceStart * 1000, 2)) / 1000;
    const endTension =
      Math.sqrt(horizontalForceN * horizontalForceN + Math.pow(verticalForceEnd * 1000, 2)) / 1000;
    const arcLength =
      a * (Math.sinh((length - x0) / a) - Math.sinh((0 - x0) / a));
    const averageTensionKN = (startTension + endTension) / 2;
    const unstretchedLength = this.calculateUnstretchedLength(arcLength, averageTensionKN, axialStiffnessN);

    return {
      spanNumber,
      fromSupportId,
      toSupportId,
      cableLine,
      horizontalForce: horizontalForceN / 1000,
      verticalForceStart,
      verticalForceEnd,
      maxTension: Math.max(startTension, endTension),
      sagAtLowest: Math.max(fromHeight, toHeight) - minHeight,
      lowestPointStation: minStation,
      minClearance: 0,
      minClearanceAt: 0,
      arcLength,
      averageTensionKN,
      unstretchedLength,
      extensionM: arcLength - unstretchedLength
    };
  }

  private calculateLoadedEngineeringSpan(
    span: SpanGeometry,
    cableWeightN: number,
    horizontalForceN: number,
    pointLoadN: number,
    loadRatio: number,
    axialStiffnessN: number,
    numPoints: number = 30
  ): SpanState {
    const { length, fromHeight, toHeight, fromSupportId, toSupportId, spanNumber } = span;
    const a = Math.max(horizontalForceN / cableWeightN, 0.01);
    const xP = Math.min(Math.max(loadRatio, 0.05), 0.95) * length;
    const { x0L, x0R, cL, cR } = this.solvePiecewiseOffsets(
      a,
      horizontalForceN,
      pointLoadN,
      length,
      xP,
      fromHeight,
      toHeight
    );

    numPoints = Math.max(numPoints, Math.floor(length / 5), 10);

    const cableLine: CablePoint[] = [];
    let minHeight = Infinity;
    let minStation = 0;

    for (let index = 0; index <= numPoints; index++) {
      const x = (index / numPoints) * length;
      const isLeft = x <= xP;
      const x0 = isLeft ? x0L : x0R;
      const c = isLeft ? cL : cR;
      const y = a * Math.cosh((x - x0) / a) + c;

      cableLine.push({
        stationLength: x,
        height: y,
        groundClearance: 0
      });

      if (y < minHeight) {
        minHeight = y;
        minStation = x;
      }
    }

    const slopeStart = Math.sinh((0 - x0L) / a);
    const slopeEnd = Math.sinh((length - x0R) / a);
    const slopeLoadLeft = Math.sinh((xP - x0L) / a);
    const slopeLoadRight = Math.sinh((xP - x0R) / a);

    const verticalForceStart = (horizontalForceN * slopeStart) / 1000;
    const verticalForceEnd = (horizontalForceN * slopeEnd) / 1000;
    const verticalForceLoadLeft = (horizontalForceN * slopeLoadLeft) / 1000;
    const verticalForceLoadRight = (horizontalForceN * slopeLoadRight) / 1000;

    const tensions = [
      verticalForceStart,
      verticalForceEnd,
      verticalForceLoadLeft,
      verticalForceLoadRight
    ].map((verticalForce) =>
      Math.sqrt(horizontalForceN * horizontalForceN + Math.pow(verticalForce * 1000, 2)) / 1000
    );

    const arcLengthLeft =
      a * (Math.sinh((xP - x0L) / a) - Math.sinh((0 - x0L) / a));
    const arcLengthRight =
      a * (Math.sinh((length - x0R) / a) - Math.sinh((xP - x0R) / a));
    const arcLength = arcLengthLeft + arcLengthRight;
    const averageTensionKN = tensions.reduce((sum, value) => sum + value, 0) / tensions.length;
    const unstretchedLength = this.calculateUnstretchedLength(arcLength, averageTensionKN, axialStiffnessN);

    return {
      spanNumber,
      fromSupportId,
      toSupportId,
      cableLine,
      horizontalForce: horizontalForceN / 1000,
      verticalForceStart,
      verticalForceEnd,
      maxTension: Math.max(...tensions),
      sagAtLowest: Math.max(fromHeight, toHeight) - minHeight,
      lowestPointStation: minStation,
      minClearance: 0,
      minClearanceAt: 0,
      arcLength,
      averageTensionKN,
      unstretchedLength,
      extensionM: arcLength - unstretchedLength
    };
  }

  private solvePiecewiseOffsets(
    a: number,
    horizontalForceN: number,
    pointLoadN: number,
    length: number,
    xP: number,
    fromHeight: number,
    toHeight: number
  ): { x0L: number; x0R: number; cL: number; cR: number } {
    let x0L = length / 2;
    let x0R = length / 2;
    const epsilon = 1e-3;

    const cFromLeft = (x0: number) => fromHeight - a * Math.cosh((0 - x0) / a);
    const cFromRight = (x0: number) => toHeight - a * Math.cosh((length - x0) / a);

    const continuity = (xl: number, xr: number) => {
      const cL = cFromLeft(xl);
      const cR = cFromRight(xr);
      const yL = a * Math.cosh((xP - xl) / a) + cL;
      const yR = a * Math.cosh((xP - xr) / a) + cR;
      return yL - yR;
    };

    const verticalJump = (xl: number, xr: number) => {
      const left = horizontalForceN * Math.sinh((xP - xl) / a);
      const right = horizontalForceN * Math.sinh((xP - xr) / a);
      return (right - left) - pointLoadN;
    };

    for (let iteration = 0; iteration < 40; iteration++) {
      const f1 = continuity(x0L, x0R);
      const f2 = verticalJump(x0L, x0R);
      if (Math.abs(f1) < 1e-4 && Math.abs(f2) < 1e-2) {
        break;
      }

      const dF1dxL = (continuity(x0L + epsilon, x0R) - f1) / epsilon;
      const dF1dxR = (continuity(x0L, x0R + epsilon) - f1) / epsilon;
      const dF2dxL = (verticalJump(x0L + epsilon, x0R) - f2) / epsilon;
      const dF2dxR = (verticalJump(x0L, x0R + epsilon) - f2) / epsilon;

      const determinant = dF1dxL * dF2dxR - dF1dxR * dF2dxL;
      if (Math.abs(determinant) < 1e-9) {
        break;
      }

      const deltaLeft = (-f1 * dF2dxR + f2 * dF1dxR) / determinant;
      const deltaRight = (dF1dxL * (-f2) + dF2dxL * f1) / determinant;

      x0L += deltaLeft;
      x0R += deltaRight;
    }

    return {
      x0L,
      x0R,
      cL: cFromLeft(x0L),
      cR: cFromRight(x0R)
    };
  }

  private buildLoadCandidates(
    spanGeometries: SpanGeometry[],
    startStationLength: number,
    globalLoadPositionRatio: number,
    designMode: EngineeringDesignMode
  ): DesignLoadCandidate[] {
    const totalLength = spanGeometries.reduce((sum, span) => sum + span.length, 0);
    if (totalLength <= 0) {
      return [];
    }

    if (designMode === 'selected') {
      const candidate = this.buildSelectedLoadCandidate(
        spanGeometries,
        startStationLength,
        globalLoadPositionRatio
      );
      return candidate ? [candidate] : [];
    }

    const offsets = new Set<number>();
    const scanStep = Math.max(totalLength / 60, 5);
    const globalMargin = Math.min(Math.max(totalLength * 0.01, 1), 5);

    for (let offset = globalMargin; offset < totalLength - globalMargin; offset += scanStep) {
      offsets.add(offset);
    }

    let accumulated = 0;
    for (const spanGeometry of spanGeometries) {
      const nearSupportOffset = Math.min(Math.max(spanGeometry.length * 0.03, 1), Math.min(spanGeometry.length * 0.2, 5));
      for (const ratio of [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]) {
        offsets.add(accumulated + spanGeometry.length * ratio);
      }
      offsets.add(accumulated + nearSupportOffset);
      offsets.add(accumulated + Math.max(spanGeometry.length - nearSupportOffset, nearSupportOffset));
      accumulated += spanGeometry.length;
    }

    return Array.from(offsets)
      .sort((left, right) => left - right)
      .map((offset) => this.buildCandidateFromOffset(spanGeometries, startStationLength, offset))
      .filter((candidate): candidate is DesignLoadCandidate => candidate !== null);
  }

  private buildSelectedLoadCandidate(
    spanGeometries: SpanGeometry[],
    startStationLength: number,
    globalLoadPositionRatio: number
  ): DesignLoadCandidate | null {
    const totalLength = spanGeometries.reduce((sum, span) => sum + span.length, 0);
    if (totalLength <= 0) {
      return null;
    }

    const clampedGlobalRatio = Math.min(Math.max(globalLoadPositionRatio, 0.05), 0.95);
    return this.buildCandidateFromOffset(
      spanGeometries,
      startStationLength,
      totalLength * clampedGlobalRatio
    );
  }

  private buildCandidateFromOffset(
    spanGeometries: SpanGeometry[],
    startStationLength: number,
    targetOffset: number
  ): DesignLoadCandidate | null {
    const totalLength = spanGeometries.reduce((sum, span) => sum + span.length, 0);
    if (totalLength <= 0) {
      return null;
    }

    const clampedOffset = Math.min(Math.max(targetOffset, 0), totalLength);
    let accumulatedLength = 0;
    let baseStation = startStationLength;

    for (let spanIndex = 0; spanIndex < spanGeometries.length; spanIndex++) {
      const spanGeometry = spanGeometries[spanIndex];
      const nextAccumulatedLength = accumulatedLength + spanGeometry.length;
      const isLastSpan = spanIndex === spanGeometries.length - 1;

      if (clampedOffset <= nextAccumulatedLength || isLastSpan) {
        const localOffset = Math.min(
          Math.max(clampedOffset - accumulatedLength, 0),
          spanGeometry.length
        );
        const loadRatio = Math.min(Math.max(localOffset / spanGeometry.length, 0.05), 0.95);

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

  private combineCableLines(
    spanResults: SpanState[],
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

  private applySpanClearance(
    spanResult: SpanState,
    spanGeometry: SpanGeometry,
    spanCount: number,
    project: Project,
    baseStation: number
  ): SpanState {
    const isFirstSpan = spanGeometry.spanNumber === 1;
    const isLastSpan = spanGeometry.spanNumber === spanCount;
    const startAnchorAtGround =
      isFirstSpan && (project.startStation.anchorPoint.heightAboveTerrain || 0) < 0.5;
    const endAnchorAtGround =
      isLastSpan && (project.endStation.anchorPoint.heightAboveTerrain || 0) < 0.5;

    let pointsToCheck = spanResult.cableLine;
    if (startAnchorAtGround || endAnchorAtGround) {
      const skipDistance = Math.min(spanGeometry.length * 0.15, 10);
      pointsToCheck = spanResult.cableLine.filter((point) => {
        if (startAnchorAtGround && point.stationLength < skipDistance) return false;
        if (endAnchorAtGround && point.stationLength > spanGeometry.length - skipDistance) return false;
        return true;
      });
    }

    const clearanceResult =
      pointsToCheck.length > 0
        ? checkCableClearance(
            pointsToCheck,
            project.terrainProfile,
            baseStation,
            project.cableConfig.minGroundClearance
          )
        : { minClearance: Infinity, minClearanceAt: 0, isViolated: false, violations: [] };

    return {
      ...applyClearanceToSpan(spanResult, clearanceResult),
      arcLength: spanResult.arcLength,
      averageTensionKN: spanResult.averageTensionKN,
      unstretchedLength: spanResult.unstretchedLength,
      extensionM: spanResult.extensionM
    };
  }

  private calculateAnchorForces(spans: SpanResult[]): AnchorForceResult[] {
    if (spans.length === 0) return [];

    const startSpan = spans[0];
    const endSpan = spans[spans.length - 1];

    return [
      this.buildForceVector('start', startSpan.horizontalForce, startSpan.verticalForceStart),
      this.buildForceVector('end', -endSpan.horizontalForce, -endSpan.verticalForceEnd)
    ];
  }

  private calculateSupportForces(
    spans: SpanResult[],
    supports: Array<{ id: string; supportNumber: number; stationLength: number }>
  ): SupportForceResult[] {
    if (supports.length === 0 || spans.length === 0) return [];

    return supports.map((support) => {
      const leftSpan = spans.find((span) => span.toSupport === support.id);
      const rightSpan = spans.find((span) => span.fromSupport === support.id);

      const hLeft = leftSpan ? leftSpan.horizontalForce : 0;
      const hRight = rightSpan ? rightSpan.horizontalForce : 0;
      const vLeft = leftSpan ? leftSpan.verticalForceEnd : 0;
      const vRight = rightSpan ? rightSpan.verticalForceStart : 0;
      const horizontalSigned = hLeft - hRight;
      const verticalSigned = -(vLeft + vRight);
      const horizontal = Math.abs(horizontalSigned);
      const vertical = Math.abs(verticalSigned);
      const resultant = Math.sqrt(horizontal * horizontal + vertical * vertical);
      const angle = (Math.atan2(vertical, horizontal) * 180) / Math.PI;

      return {
        supportId: support.id,
        supportNumber: support.supportNumber,
        stationLength: support.stationLength,
        horizontal,
        vertical,
        resultant,
        angle,
        horizontalSigned,
        verticalSigned
      };
    });
  }

  private buildForceVector(
    type: 'start' | 'end',
    horizontalSigned: number,
    verticalSigned: number
  ): AnchorForceResult {
    const horizontal = Math.abs(horizontalSigned);
    const vertical = Math.abs(verticalSigned);
    return {
      type,
      horizontal,
      vertical,
      resultant: Math.sqrt(horizontal * horizontal + vertical * vertical),
      angle: (Math.atan2(vertical, horizontal) * 180) / Math.PI,
      horizontalSigned,
      verticalSigned
    };
  }

  private calculateCableArea(diameterMm: number): number {
    const radiusMm = diameterMm / 2;
    return Math.PI * radiusMm * radiusMm;
  }

  private calculateUnstretchedLength(
    stretchedLength: number,
    averageTensionKN: number,
    axialStiffnessN: number
  ): number {
    return stretchedLength / (1 + (averageTensionKN * 1000) / axialStiffnessN);
  }

  private getGlobalMinimumClearance(state: GlobalEngineeringState): number {
    return state.spans.reduce((minimum, span) => Math.min(minimum, span.minClearance), Infinity);
  }

  private createInvalidResult(warnings: CalculationWarning[]): CalculationResult {
    return {
      timestamp: new Date(),
      calculationMode: 'engineering',
      solverFamily: 'engineering',
      method: 'global-elastic-catenary',
      modelAssumptions: [
        'Global elastic multi-span analysis',
        'No saddle friction in V1',
        'No mast or anchor compliance in V1'
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
}
