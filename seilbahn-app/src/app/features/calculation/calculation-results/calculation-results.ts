import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { CalculationResult, CalculationWarning, SpanResult } from '../../../models';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { CableCalculatorService } from '../../../services/calculation/cable-calculator.service';

/**
 * Calculation Results Component
 * Shows calculation trigger and results display
 */
@Component({
  selector: 'app-calculation-results',
  imports: [CommonModule],
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

  constructor(
    private projectStateService: ProjectStateService,
    private cableCalculatorService: CableCalculatorService
  ) {
    this._project = toSignal(this.projectStateService.project$, { initialValue: null });
    this._terrain = toSignal(this.projectStateService.terrain$, { initialValue: [] });
    this._supports = toSignal(this.projectStateService.supports$, { initialValue: [] });
    this._calculationResult = toSignal(this.projectStateService.calculation$, { initialValue: null });
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

        // Update project with end station position
        const updatedProject = {
          ...project,
          endStation: {
            ...project.endStation,
            stationLength: totalLength,
            terrainHeight: endHeight
          }
        };

        const result = this.cableCalculatorService.calculateCable(updatedProject);
        this.projectStateService.setCalculationResult(result);
        this.lastCalculation.set(new Date());
      } catch (error) {
        console.error('Calculation error:', error);
        // Create error result
        const errorResult: CalculationResult = {
          timestamp: new Date(),
          method: 'parabolic',
          cableLine: [],
          spans: [],
          maxTension: 0,
          maxHorizontalForce: 0,
          cableCapacityCheck: {
            cableDiameterMm: 0,
            maxAllowedTensionKN: 0,
            actualMaxTensionKN: 0,
            utilizationPercent: 0,
            status: 'fail',
            safetyMarginPercent: 0
          },
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

  /**
   * Format time
   */
  formatTime(date: Date): string {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
}
