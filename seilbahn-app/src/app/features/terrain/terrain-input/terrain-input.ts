import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TerrainSegment } from '../../../models';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { TerrainCalculatorService } from '../../../services/calculation/terrain-calculator.service';

/**
 * Terrain Input Component
 * Mobile-first component for rapid terrain segment entry (laser + slope %)
 */
@Component({
  selector: 'app-terrain-input',
  imports: [CommonModule, FormsModule],
  templateUrl: './terrain-input.html',
  styleUrl: './terrain-input.scss',
  standalone: true
})
export class TerrainInput {
  // Current input values
  lengthMeters = 0;
  slopePercent = 0;
  notes = '';

  // Existing segments (as Signal - automatically managed, no subscription needed!)
  private _segments;

  // Expose as getter for compatibility with template
  get segments(): TerrainSegment[] {
    return this._segments();
  }

  // Validation
  lengthError = '';
  slopeError = '';

  // UI State
  lastAddedIndex = -1;
  editingSegment: TerrainSegment | null = null;

  constructor(
    private projectStateService: ProjectStateService,
    private terrainCalculatorService: TerrainCalculatorService
  ) {
    // Initialize signal in constructor after services are injected
    this._segments = toSignal(this.projectStateService.terrain$, { initialValue: [] as TerrainSegment[] });
  }

  /**
   * Validate length input
   */
  validateLength(): boolean {
    if (this.lengthMeters <= 0) {
      this.lengthError = 'Länge muss größer als 0 sein';
      return false;
    }
    if (this.lengthMeters > 1000) {
      this.lengthError = 'Länge sollte nicht größer als 1000m sein';
      return false;
    }
    this.lengthError = '';
    return true;
  }

  /**
   * Validate slope input
   */
  validateSlope(): boolean {
    if (Math.abs(this.slopePercent) > 100) {
      this.slopeError = 'Steigung sollte zwischen -100% und +100% liegen';
      return false;
    }
    if (Math.abs(this.slopePercent) > 50) {
      this.slopeError = 'Warnung: Sehr steile Steigung (>50%)';
      // Don't return false - this is just a warning
    } else {
      this.slopeError = '';
    }
    return true;
  }

  /**
   * Add new segment
   */
  addSegment() {
    if (!this.validateLength() || !this.validateSlope()) {
      return;
    }

    // Get current project
    const project = this.projectStateService.currentProject;
    if (!project) return;

    // Calculate starting height
    const startHeight = this.segments.length > 0
      ? this.segments[this.segments.length - 1].terrainHeight
      : 0;

    // Create new segment
    const newSegment: TerrainSegment = {
      id: this.generateUUID(),
      segmentNumber: this.segments.length + 1,
      lengthMeters: this.lengthMeters,
      slopePercent: this.slopePercent,
      stationLength: 0, // Will be calculated
      terrainHeight: 0, // Will be calculated
      notes: this.notes.trim() || undefined
    };

    // Add to existing segments
    const updatedSegments = [...this.segments, newSegment];

    // Recalculate cumulative values
    const recalculated = this.terrainCalculatorService.calculateCumulativeValues(
      updatedSegments,
      0 // Start at height 0
    );

    // Update state
    this.projectStateService.updateTerrainSegments(recalculated);

    // Track last added for animation
    this.lastAddedIndex = recalculated.length - 1;
    setTimeout(() => {
      this.lastAddedIndex = -1;
    }, 2000);

    // Clear inputs for next segment
    this.lengthMeters = 0;
    this.slopePercent = 0;
    this.notes = '';
    this.lengthError = '';
    this.slopeError = '';

    // Focus back on length input
    setTimeout(() => {
      const input = document.getElementById('lengthInput');
      if (input) input.focus();
    }, 100);
  }

  /**
   * Edit existing segment
   */
  editSegment(segment: TerrainSegment) {
    this.editingSegment = segment;
    this.lengthMeters = segment.lengthMeters;
    this.slopePercent = segment.slopePercent;
    this.notes = segment.notes || '';
    this.lengthError = '';
    this.slopeError = '';

    // Scroll to input
    setTimeout(() => {
      const input = document.getElementById('lengthInput');
      if (input) input.focus();
    }, 100);
  }

  /**
   * Update segment being edited
   */
  updateSegment() {
    if (!this.editingSegment) return;
    if (!this.validateLength() || !this.validateSlope()) return;

    const updatedSegments = this.segments.map(seg =>
      seg.id === this.editingSegment!.id
        ? {
            ...seg,
            lengthMeters: this.lengthMeters,
            slopePercent: this.slopePercent,
            notes: this.notes.trim() || undefined
          }
        : seg
    );

    // Recalculate cumulative values
    const recalculated = this.terrainCalculatorService.calculateCumulativeValues(updatedSegments, 0);

    this.projectStateService.updateTerrainSegments(recalculated);

    // Clear edit state
    this.cancelEdit();
  }

  /**
   * Cancel editing
   */
  cancelEdit() {
    this.editingSegment = null;
    this.lengthMeters = 0;
    this.slopePercent = 0;
    this.notes = '';
    this.lengthError = '';
    this.slopeError = '';
  }

  /**
   * Remove segment
   */
  removeSegment(segmentId: string) {
    const project = this.projectStateService.currentProject;
    if (!project) return;

    // If editing this segment, cancel edit
    if (this.editingSegment?.id === segmentId) {
      this.cancelEdit();
    }

    const filtered = this.segments.filter(s => s.id !== segmentId);

    // Recalculate
    const recalculated = this.terrainCalculatorService.calculateCumulativeValues(filtered, 0);

    this.projectStateService.updateTerrainSegments(recalculated);
  }

  /**
   * Undo last segment
   */
  undoLast() {
    if (this.segments.length === 0) return;

    const filtered = this.segments.slice(0, -1);
    const recalculated = this.terrainCalculatorService.calculateCumulativeValues(filtered, 0);

    this.projectStateService.updateTerrainSegments(recalculated);
  }

  /**
   * Quick increment/decrement helpers
   */
  incrementLength(amount: number) {
    this.lengthMeters = Math.max(0, this.lengthMeters + amount);
    this.validateLength();
  }

  incrementSlope(amount: number) {
    this.slopePercent = Math.max(-100, Math.min(100, this.slopePercent + amount));
    this.validateSlope();
  }

  /**
   * Get total statistics
   */
  getTotalLength(): number {
    return this.segments.reduce((sum, seg) => sum + seg.lengthMeters, 0);
  }

  getElevationChange(): number {
    if (this.segments.length === 0) return 0;
    const first = this.segments[0];
    const last = this.segments[this.segments.length - 1];
    const firstHeight = first.terrainHeight - (first.slopePercent / 100) * first.lengthMeters;
    return last.terrainHeight - firstHeight;
  }

  /**
   * Check if ready to continue
   */
  canContinue(): boolean {
    return this.segments.length > 0;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
