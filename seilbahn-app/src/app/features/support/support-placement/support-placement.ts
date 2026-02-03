import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Support, TerrainSegment } from '../../../models';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { TerrainCalculatorService } from '../../../services/calculation/terrain-calculator.service';

/**
 * Support Placement Component
 * Mobile-first component for placing supports along the cable route
 */
@Component({
  selector: 'app-support-placement',
  imports: [CommonModule, FormsModule],
  templateUrl: './support-placement.html',
  styleUrl: './support-placement.scss',
  standalone: true
})
export class SupportPlacement {
  // Input values
  stationLength = 0;      // Position along route
  supportHeight = 6;      // Default 6m height

  // Signals from state
  private _supports;
  private _terrain;

  get supports(): Support[] {
    return this._supports();
  }

  get terrain(): TerrainSegment[] {
    return this._terrain();
  }

  // Computed values
  get totalLength(): number {
    const segments = this.terrain;
    if (segments.length === 0) return 0;
    return segments[segments.length - 1].stationLength;
  }

  get interpolatedTerrainHeight(): number {
    return this.terrainCalculatorService.interpolateHeight(this.terrain, this.stationLength);
  }

  get topElevation(): number {
    return this.interpolatedTerrainHeight + this.supportHeight;
  }

  // Validation
  positionError = '';
  heightError = '';

  // UI State
  editingSupport: Support | null = null;
  lastAddedIndex = -1;

  constructor(
    private projectStateService: ProjectStateService,
    private terrainCalculatorService: TerrainCalculatorService
  ) {
    this._supports = toSignal(this.projectStateService.supports$, { initialValue: [] as Support[] });
    this._terrain = toSignal(this.projectStateService.terrain$, { initialValue: [] as TerrainSegment[] });
  }

  /**
   * Validate position input
   */
  validatePosition(): boolean {
    if (this.stationLength <= 0) {
      this.positionError = 'Position muss größer als 0 sein';
      return false;
    }
    if (this.stationLength >= this.totalLength) {
      this.positionError = `Position muss kleiner als ${this.totalLength.toFixed(0)}m sein`;
      return false;
    }
    // Check for existing support too close (min 5m apart)
    const tooClose = this.supports.some(s =>
      Math.abs(s.stationLength - this.stationLength) < 5 &&
      s.id !== this.editingSupport?.id
    );
    if (tooClose) {
      this.positionError = 'Mindestabstand zu anderen Stützen: 5m';
      return false;
    }
    this.positionError = '';
    return true;
  }

  /**
   * Validate height input
   */
  validateHeight(): boolean {
    if (this.supportHeight < 2) {
      this.heightError = 'Mindesthöhe: 2m';
      return false;
    }
    if (this.supportHeight > 30) {
      this.heightError = 'Maximalhöhe: 30m';
      return false;
    }
    this.heightError = '';
    return true;
  }

  /**
   * Add new support
   */
  addSupport() {
    if (!this.validatePosition() || !this.validateHeight()) {
      return;
    }

    if (this.terrain.length === 0) {
      this.positionError = 'Bitte zuerst Geländeprofil erfassen';
      return;
    }

    const terrainHeight = this.interpolatedTerrainHeight;

    const newSupport: Support = {
      id: this.generateUUID(),
      supportNumber: this.supports.length + 1,
      stationLength: this.stationLength,
      terrainHeight: terrainHeight,
      supportHeight: this.supportHeight,
      topElevation: terrainHeight + this.supportHeight
    };

    // Add and sort by position
    const updatedSupports = [...this.supports, newSupport]
      .sort((a, b) => a.stationLength - b.stationLength)
      .map((s, i) => ({ ...s, supportNumber: i + 1 }));

    this.projectStateService.updateSupports(updatedSupports);

    // Track for animation
    this.lastAddedIndex = updatedSupports.findIndex(s => s.id === newSupport.id);
    setTimeout(() => this.lastAddedIndex = -1, 2000);

    // Clear inputs
    this.stationLength = 0;
    this.supportHeight = 6;
    this.positionError = '';
    this.heightError = '';
  }

  /**
   * Edit existing support
   */
  editSupport(support: Support) {
    this.editingSupport = support;
    this.stationLength = support.stationLength;
    this.supportHeight = support.supportHeight;
  }

  /**
   * Update support being edited
   */
  updateSupport() {
    if (!this.editingSupport) return;
    if (!this.validatePosition() || !this.validateHeight()) return;

    const terrainHeight = this.interpolatedTerrainHeight;

    const updatedSupports = this.supports
      .map(s => s.id === this.editingSupport!.id ? {
        ...s,
        stationLength: this.stationLength,
        terrainHeight: terrainHeight,
        supportHeight: this.supportHeight,
        topElevation: terrainHeight + this.supportHeight
      } : s)
      .sort((a, b) => a.stationLength - b.stationLength)
      .map((s, i) => ({ ...s, supportNumber: i + 1 }));

    this.projectStateService.updateSupports(updatedSupports);

    this.cancelEdit();
  }

  /**
   * Cancel editing
   */
  cancelEdit() {
    this.editingSupport = null;
    this.stationLength = 0;
    this.supportHeight = 6;
    this.positionError = '';
    this.heightError = '';
  }

  /**
   * Remove support
   */
  removeSupport(supportId: string) {
    const filtered = this.supports
      .filter(s => s.id !== supportId)
      .map((s, i) => ({ ...s, supportNumber: i + 1 }));

    this.projectStateService.updateSupports(filtered);
  }

  /**
   * Quick position presets based on terrain
   */
  setQuickPosition(fraction: number) {
    this.stationLength = Math.round(this.totalLength * fraction);
    this.validatePosition();
  }

  /**
   * Increment helpers
   */
  incrementPosition(amount: number) {
    this.stationLength = Math.max(0, Math.min(this.totalLength, this.stationLength + amount));
    this.validatePosition();
  }

  incrementHeight(amount: number) {
    this.supportHeight = Math.max(2, Math.min(30, this.supportHeight + amount));
    this.validateHeight();
  }

  /**
   * Check if terrain is available
   */
  hasTerrainData(): boolean {
    return this.terrain.length > 0;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
