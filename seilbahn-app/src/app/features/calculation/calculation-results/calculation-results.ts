import { Component, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CalculationResult, CalculationWarning, SpanResult, SolverType } from '../../../models';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { CableCalculatorService } from '../../../services/calculation/cable-calculator.service';

/**
 * Calculation Results Component
 * Shows calculation trigger and results display
 */
@Component({
  selector: 'app-calculation-results',
  imports: [CommonModule, FormsModule],
  templateUrl: './calculation-results.html',
  styleUrl: './calculation-results.scss',
  standalone: true
})
export class CalculationResults {
  // Expose Math for template
  Math = Math;

  // State
  private _project;
  private _terrain;
  private _supports;
  private _calculationResult;

  // UI State
  isCalculating = signal(false);
  lastCalculation = signal<Date | null>(null);

  private autoCalcTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAutoCalcKey = '';

  constructor(
    private projectStateService: ProjectStateService,
    private cableCalculatorService: CableCalculatorService
  ) {
    this._project = toSignal(this.projectStateService.project$, { initialValue: null });
    this._terrain = toSignal(this.projectStateService.terrain$, { initialValue: [] });
    this._supports = toSignal(this.projectStateService.supports$, { initialValue: [] });
    this._calculationResult = toSignal(this.projectStateService.calculation$, { initialValue: null });

    effect(() => {
      const project = this._project();
      const terrain = this._terrain();
      const supports = this._supports();

      if (!project || terrain.length === 0) return;

      const key = this.buildAutoCalcKey(project, terrain, supports);
      if (key === this.lastAutoCalcKey) return;
      this.lastAutoCalcKey = key;

      this.scheduleAutoCalculation();
    });
  }

  get project() {
    return this._project();
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

  onSolverChange(value: string): void {
    const solver = value as SolverType;
    this.projectStateService.updateSolverType(solver);
  }

  /**
   * Check if calculation is possible
   */
  canCalculate(): boolean {
    return this.terrain.length > 0;
  }

  /**
   * Get reason why calculation is not possible
   */
  getCannotCalculateReason(): string {
    if (this.terrain.length === 0) {
      return 'Bitte zuerst das Geländeprofil erfassen';
    }
    return '';
  }

  /**
   * Run calculation
   */
  calculate() {
    const project = this.project;
    if (!project) return;

    this.isCalculating.set(true);

    // Small delay for UI feedback
    setTimeout(() => {
      try {
        // Update end station based on terrain
        const totalLength = this.terrain.length > 0
          ? this.terrain[this.terrain.length - 1].stationLength
          : 0;
        const endHeight = this.terrain.length > 0
          ? this.terrain[this.terrain.length - 1].terrainHeight
          : 0;

        // Keep end station persisted in project state
        if (
          project.endStation.stationLength !== totalLength ||
          project.endStation.terrainHeight !== endHeight
        ) {
          this.projectStateService.updateEndStation({
            stationLength: totalLength,
            terrainHeight: endHeight
          });
        }

        const projectForCalculation = this.projectStateService.currentProject ?? project;
        const result = this.cableCalculatorService.calculateCable(projectForCalculation);
        this.projectStateService.setCalculationResult(result);
        this.lastCalculation.set(new Date());
      } catch (error) {
        console.error('Calculation error:', error);
        // Create error result
        const errorResult: CalculationResult = {
          timestamp: new Date(),
          method: project.solverType ?? 'parabolic',
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

  /**
   * Get errors from result
   */
  getErrors(): CalculationWarning[] {
    return this.result?.warnings.filter(w => w.severity === 'error') || [];
  }

  /**
   * Get warnings from result
   */
  getWarnings(): CalculationWarning[] {
    return this.result?.warnings.filter(w => w.severity === 'warning') || [];
  }

  /**
   * Get info messages from result
   */
  getInfos(): CalculationWarning[] {
    return this.result?.warnings.filter(w => w.severity === 'info') || [];
  }

  /**
   * Get span with minimum clearance
   */
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
      cable.safetyFactor,
      cable.minGroundClearance,
      cable.horizontalTensionKN,
      cable.cableDiameterMm,
      cable.minBreakingStrengthNPerMm2,
      cable.cableMaterial,
      project.solverType || 'parabolic'
    ].join('|');
    return `${terrainKey}__${supportsKey}__${cableKey}`;
  }

  /**
   * Format time
   */
  formatTime(date: Date): string {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  get requiredClearance(): number {
    return this.project?.cableConfig?.minGroundClearance ?? 2;
  }

  get designCheckLabel(): string | null {
    const designCheck = this.result?.designCheck;
    if (!designCheck) return null;

    return `Ungünstigste Punktlast bei ${designCheck.governingLoadPositionM.toFixed(1)} m in Spannfeld ${designCheck.governingSpanNumber}`;
  }
}
