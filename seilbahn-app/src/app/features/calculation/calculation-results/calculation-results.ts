import { Component, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  CalculationMode,
  CalculationResult,
  CalculationWarning,
  EngineeringDesignMode,
  EngineeringSpanExtension,
  SpanResult,
  SolverType
} from '../../../models';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { CableCalculatorService } from '../../../services/calculation/cable-calculator.service';

@Component({
  selector: 'app-calculation-results',
  imports: [CommonModule, FormsModule],
  templateUrl: './calculation-results.html',
  styleUrl: './calculation-results.scss',
  standalone: true
})
export class CalculationResults {
  Math = Math;

  private _project;
  private _effectiveProject;
  private _terrain;
  private _supports;
  private _calculationResult;

  isCalculating = signal(false);
  lastCalculation = signal<Date | null>(null);

  private autoCalcTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAutoCalcKey = '';

  constructor(
    private projectStateService: ProjectStateService,
    private cableCalculatorService: CableCalculatorService
  ) {
    this._project = toSignal(this.projectStateService.project$, { initialValue: null });
    this._effectiveProject = toSignal(this.projectStateService.effectiveProject$, { initialValue: null });
    this._terrain = toSignal(this.projectStateService.terrain$, { initialValue: [] });
    this._supports = toSignal(this.projectStateService.supports$, { initialValue: [] });
    this._calculationResult = toSignal(this.projectStateService.calculation$, { initialValue: null });

    effect(() => {
      const project = this._effectiveProject();
      const terrain = this._terrain();
      const supports = this._supports();

      if (!project || terrain.length === 0 || supports.length === 0) return;

      const key = this.buildAutoCalcKey(project, terrain, supports);
      if (key === this.lastAutoCalcKey) return;
      this.lastAutoCalcKey = key;

      this.scheduleAutoCalculation();
    });
  }

  get project() {
    return this._project();
  }

  get effectiveProject() {
    return this._effectiveProject();
  }

  get terrain() {
    return this._terrain();
  }

  get supports() {
    return this._supports();
  }

  get result(): CalculationResult | null {
    return this._calculationResult();
  }

  get solverType(): SolverType {
    return this.project?.solverType ?? 'parabolic';
  }

  get calculationMode(): CalculationMode {
    return this.project?.calculationMode ?? 'planning';
  }

  get availableSolvers(): Array<{ value: SolverType; label: string }> {
    if (this.calculationMode === 'engineering') {
      return [
        { value: 'global-elastic-catenary', label: 'Global elastische Kettenlinie' }
      ];
    }

    return [
      { value: 'parabolic', label: 'Parabel (schnell)' },
      { value: 'catenary', label: 'Kettenlinie (genauer)' },
      { value: 'catenary-piecewise', label: 'Kettenlinie stückweise (mit Punktlast)' }
    ];
  }

  onCalculationModeChange(value: string): void {
    this.projectStateService.updateCalculationMode(value as CalculationMode);
  }

  onSolverChange(value: string): void {
    this.projectStateService.updateSolverType(value as SolverType);
  }

  onEngineeringDesignModeChange(value: string): void {
    this.projectStateService.updateEngineeringDesignMode(value as EngineeringDesignMode);
  }

  canCalculate(): boolean {
    return this.terrain.length > 0 && this.supports.length > 0;
  }

  getCannotCalculateReason(): string {
    if (this.terrain.length === 0) {
      return 'Bitte zuerst das Geländeprofil erfassen';
    }
    if (this.supports.length === 0) {
      return 'Bitte mindestens eine Stütze setzen';
    }
    return '';
  }

  calculate() {
    const project = this.effectiveProject ?? this.project;
    if (!project) return;

    this.isCalculating.set(true);

    setTimeout(() => {
      try {
        const totalLength = this.terrain.length > 0
          ? this.terrain[this.terrain.length - 1].stationLength
          : 0;
        const endHeight = this.terrain.length > 0
          ? this.terrain[this.terrain.length - 1].terrainHeight
          : 0;

        if (
          project.endStation.stationLength !== totalLength ||
          project.endStation.terrainHeight !== endHeight
        ) {
          this.projectStateService.updateEndStation({
            stationLength: totalLength,
            terrainHeight: endHeight
          });
        }

        const projectForCalculation = this.projectStateService.currentEffectiveProject ?? project;
        const result = this.cableCalculatorService.calculateCable(projectForCalculation);
        this.projectStateService.setCalculationResult(result);
        this.lastCalculation.set(new Date());
      } catch (error) {
        console.error('Calculation error:', error);
        const errorResult: CalculationResult = {
          timestamp: new Date(),
          calculationMode: project.calculationMode ?? 'planning',
          solverFamily: project.calculationMode ?? 'planning',
          method: project.solverType ?? 'parabolic',
          modelAssumptions: [],
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
          warnings: [{
            severity: 'error',
            message: `Berechnungsfehler: ${error}`
          }],
          isValid: false
        };
        this.projectStateService.setCalculationResult(errorResult);
      } finally {
        this.isCalculating.set(false);
      }
    }, 300);
  }

  getErrors(): CalculationWarning[] {
    return this.result?.warnings.filter(w => w.severity === 'error') || [];
  }

  getWarnings(): CalculationWarning[] {
    return this.result?.warnings.filter(w => w.severity === 'warning') || [];
  }

  getInfos(): CalculationWarning[] {
    return this.result?.warnings.filter(w => w.severity === 'info') || [];
  }

  getCriticalSpan(): SpanResult | null {
    if (!this.result || this.result.spans.length === 0) return null;
    return this.result.spans.reduce((min, span) =>
      span.minClearance < min.minClearance ? span : min
    );
  }

  formatSignedForce(forceKN: number): string {
    return `${forceKN >= 0 ? '+' : ''}${forceKN.toFixed(1)} kN`;
  }

  getHorizontalDirection(forceKN: number): string {
    if (forceKN > 0) return 'rechts';
    if (forceKN < 0) return 'links';
    return 'keine';
  }

  getVerticalDirection(forceKN: number): string {
    if (forceKN > 0) return 'oben';
    if (forceKN < 0) return 'unten';
    return 'keine';
  }

  private scheduleAutoCalculation(): void {
    if (this.isCalculating()) return;
    if (this.autoCalcTimer) clearTimeout(this.autoCalcTimer);
    this.autoCalcTimer = setTimeout(() => this.calculate(), 400);
  }

  private buildAutoCalcKey(project: any, terrain: any[], supports: any[]): string {
    const cable = project.cableConfig || {};
    const terrainKey = terrain.map(t => `${t.stationLength}:${t.terrainHeight}`).join('|');
    const supportsKey = supports.map(s => `${s.stationLength}:${s.topElevation}:${s.supportHeight}`).join('|');
    const cableKey = [
      cable.cableWeightPerMeter,
      cable.maxLoad,
      cable.loadPositionRatio,
      cable.safetyFactor,
      cable.minGroundClearance,
      cable.horizontalTensionKN,
      cable.elasticModulusKNPerMm2,
      cable.fillFactor,
      cable.cableDiameterMm,
      cable.minBreakingStrengthNPerMm2,
      cable.cableMaterial,
      project.calculationMode || 'planning',
      project.engineeringDesignMode || 'selected',
      project.solverType || 'parabolic'
    ].join('|');
    return `${terrainKey}__${supportsKey}__${cableKey}`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  get requiredClearance(): number {
    return this.effectiveProject?.cableConfig?.minGroundClearance ?? this.project?.cableConfig?.minGroundClearance ?? 2;
  }

  get designCheckLabel(): string | null {
    const designCheck = this.result?.designCheck;
    if (!designCheck) return null;

    if (designCheck.source === 'selected-payload') {
      return `Aktive Punktlast bei ${designCheck.governingLoadPositionM.toFixed(1)} m in Spannfeld ${designCheck.governingSpanNumber}`;
    }

    return `Unguenstigste Punktlast bei ${designCheck.governingLoadPositionM.toFixed(1)} m in Spannfeld ${designCheck.governingSpanNumber}`;
  }

  get engineeringDesignMode(): EngineeringDesignMode {
    return this.project?.engineeringDesignMode ?? 'selected';
  }

  get engineeringSpanExtensions(): EngineeringSpanExtension[] {
    return this.result?.engineeringMetrics?.spanExtensions ?? [];
  }

  get engineeringHasEnvelope(): boolean {
    return !!this.result?.engineeringMetrics?.envelope;
  }

  get engineeringDesignLabel(): string {
    return this.engineeringDesignMode === 'worst-case' ? 'Worst-Case-Huellkurve' : 'Aktiver Lastfall';
  }

  get modeDescription(): string {
    if (this.calculationMode === 'engineering') {
      return 'Engineering result: global elastic multi-span analysis with shared H solution';
    }

    return 'Planning result: simplified pretension-based approximation';
  }
}
