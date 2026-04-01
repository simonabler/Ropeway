import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  CableConfiguration,
  CableParameterSet,
  CableMaterial,
  STANDARD_CABLE_DIAMETERS
} from '../../../models';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { CablePresetService } from '../../../services/presets/cable-preset.service';
import { STANDARD_CABLES } from '../../../services/calculation/engine/physics/cable-capacity';

/**
 * Cable Configuration Component
 * M4.5: Configure cable parameters with preset support
 */
@Component({
  selector: 'app-cable-config',
  imports: [CommonModule, FormsModule],
  templateUrl: './cable-config.html',
  styleUrl: './cable-config.scss',
  standalone: true
})
export class CableConfig {
  // Presets from service
  presets;

  // Current project cable config
  private _project;

  // Selected preset
  selectedPresetId = signal<string | null>(null);

  // Manual input mode
  isManualMode = signal(false);

  // Form values (N/m, N, etc. - SI units)
  cableWeightNPerM = 20;      // Seilgewicht N/m
  horizontalTensionKN = 15;   // Seilzug kN
  safetyFactor = 5;           // Sicherheitsfaktor
  loadN = 5000;               // Nutzlast N
  minClearanceM = 2;          // Min. Bodenfreiheit m

  // NEW: Cable physical properties
  cableDiameterMm = 16;       // Seildurchmesser mm
  minBreakingStrengthNPerMm2 = 1960; // Festigkeitsklasse (N/mm^2)
  cableMaterial: CableMaterial = 'steel';  // Material

  // Standard cables for dropdown
  readonly standardCables = STANDARD_CABLES;
  readonly standardDiameters = STANDARD_CABLE_DIAMETERS;

  // Save preset dialog
  showSavePresetDialog = signal(false);
  newPresetName = '';
  savePresetStatus = signal<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Validation errors
  errors = signal<string[]>([]);

  // Comparison with preset
  isModified = signal(false);
  modifications = signal<Array<{field: string; label: string; current: number; preset: number}>>([]);

  constructor(
    private projectStateService: ProjectStateService,
    private cablePresetService: CablePresetService
  ) {
    this.presets = toSignal(this.cablePresetService.presets$, { initialValue: [] as CableParameterSet[] });
    this._project = toSignal(this.projectStateService.project$, { initialValue: null });

    // Load current config if exists
    this.loadCurrentConfig();
  }

  get project() {
    return this._project();
  }

  /**
   * Load current cable config from project
   */
  private loadCurrentConfig() {
    const proj = this._project();
    if (proj?.cableConfig) {
      const config = proj.cableConfig;
      this.cableWeightNPerM = config.cableWeightPerMeter * 9.81; // kg/m to N/m
      this.loadN = config.maxLoad * 9.81; // kg to N
      this.safetyFactor = config.safetyFactor;
      this.minClearanceM = config.minGroundClearance;
      this.horizontalTensionKN = config.horizontalTensionKN || 15;
      // NEW: Load cable diameter and material
      this.cableDiameterMm = config.cableDiameterMm || 16;
      this.minBreakingStrengthNPerMm2 = config.minBreakingStrengthNPerMm2 || 1960;
      this.cableMaterial = config.cableMaterial || 'steel';
    }

    // Check if preset was selected
    if (proj?.cablePresetId) {
      this.selectedPresetId.set(proj.cablePresetId);
    }
  }

  /**
   * Apply a preset
   */
  async applyPreset(presetId: string) {
    const preset = await this.cablePresetService.getPreset(presetId);
    if (!preset) return;

    this.selectedPresetId.set(presetId);
    this.isManualMode.set(false);

    // Apply preset values
    this.cableWeightNPerM = preset.carrier.wNPerM;
    this.safetyFactor = preset.carrier.safetyFactor;
    this.loadN = preset.load.PN;
    this.minClearanceM = preset.limits.minClearanceM;
    // Derive H from preset sag (reference span 100m): H = w*L²/(8*f)
    const refSpan = 100;
    this.horizontalTensionKN = (preset.carrier.wNPerM * refSpan * refSpan) / (8 * preset.carrier.sagFM) / 1000;
    // NEW: Apply cable diameter and material
    this.cableDiameterMm = preset.cable.diameterMm;
    this.minBreakingStrengthNPerMm2 = preset.cable.breakingStrengthNPerMm2 || 1960;
    this.cableMaterial = preset.cable.material;

    // Save to project
    this.saveConfig();

    // Reset modification state
    this.isModified.set(false);
    this.modifications.set([]);
  }

  /**
   * Switch to manual mode
   */
  enableManualMode() {
    this.isManualMode.set(true);
  }

  /**
   * Check if current values differ from selected preset
   */
  async checkModifications() {
    const presetId = this.selectedPresetId();
    if (!presetId) {
      this.isModified.set(false);
      this.modifications.set([]);
      return;
    }

    const preset = await this.cablePresetService.getPreset(presetId);
    if (!preset) return;

    const mods: Array<{field: string; label: string; current: number; preset: number}> = [];

    if (Math.abs(this.cableWeightNPerM - preset.carrier.wNPerM) > 0.1) {
      mods.push({ field: 'weight', label: 'Seilgewicht', current: this.cableWeightNPerM, preset: preset.carrier.wNPerM });
    }
    // Compare H (derive preset H from sag for reference span 100m)
    const refSpan = 100;
    const presetH = (preset.carrier.wNPerM * refSpan * refSpan) / (8 * preset.carrier.sagFM) / 1000;
    if (Math.abs(this.horizontalTensionKN - presetH) > 0.5) {
      mods.push({ field: 'tension', label: 'Seilzug H', current: this.horizontalTensionKN, preset: presetH });
    }
    if (Math.abs(this.safetyFactor - preset.carrier.safetyFactor) > 0.01) {
      mods.push({ field: 'safety', label: 'Sicherheitsfaktor', current: this.safetyFactor, preset: preset.carrier.safetyFactor });
    }
    if (Math.abs(this.loadN - preset.load.PN) > 1) {
      mods.push({ field: 'load', label: 'Nutzlast', current: this.loadN, preset: preset.load.PN });
    }
    if (Math.abs(this.minClearanceM - preset.limits.minClearanceM) > 0.01) {
      mods.push({ field: 'clearance', label: 'Min. Bodenfreiheit', current: this.minClearanceM, preset: preset.limits.minClearanceM });
    }
    // NEW: Check diameter
    if (this.cableDiameterMm !== preset.cable.diameterMm) {
      mods.push({ field: 'diameter', label: 'Seildurchmesser', current: this.cableDiameterMm, preset: preset.cable.diameterMm });
    }
    if ((preset.cable.breakingStrengthNPerMm2 || 1960) != this.minBreakingStrengthNPerMm2) {
      mods.push({ field: 'breaking', label: 'Festigkeitsklasse', current: this.minBreakingStrengthNPerMm2, preset: preset.cable.breakingStrengthNPerMm2 || 1960 });
    }

    this.isModified.set(mods.length > 0);
    this.modifications.set(mods);
  }

  /**
   * Reset to preset values
   */
  async resetToPreset() {
    const presetId = this.selectedPresetId();
    if (presetId) {
      await this.applyPreset(presetId);
    }
  }

  /**
   * Validate inputs
   */
  validate(): boolean {
    const errs: string[] = [];

    if (this.cableWeightNPerM < 5 || this.cableWeightNPerM > 200) {
      errs.push('Seilgewicht: 5-200 N/m');
    }
    if (this.horizontalTensionKN < 2 || this.horizontalTensionKN > 100) {
      errs.push('Seilzug: 2-100 kN');
    }
    if (this.safetyFactor < 2 || this.safetyFactor > 10) {
      errs.push('Sicherheitsfaktor: 2-10');
    }
    if (this.loadN < 500 || this.loadN > 50000) {
      errs.push('Nutzlast: 500-50000 N');
    }
    if (this.minClearanceM < 1 || this.minClearanceM > 10) {
      errs.push('Min. Bodenfreiheit: 1-10 m');
    }
    // NEW: Validate diameter
    if (this.cableDiameterMm < 8 || this.cableDiameterMm > 40) {
      errs.push('Seildurchmesser: 8-40 mm');
    }
    if (this.minBreakingStrengthNPerMm2 < 1000 || this.minBreakingStrengthNPerMm2 > 2200) {
      errs.push('Festigkeitsklasse: 1000-2200 N/mm^2');
    }

    this.errors.set(errs);
    return errs.length === 0;
  }

  /**
   * Save configuration to project
   */
  saveConfig() {
    if (!this.validate()) return;

    const config: CableConfiguration = {
      cableType: 'carrying',
      cableWeightPerMeter: this.cableWeightNPerM / 9.81, // N/m to kg/m
      maxLoad: this.loadN / 9.81, // N to kg
      safetyFactor: this.safetyFactor,
      minGroundClearance: this.minClearanceM,
      horizontalTensionKN: this.horizontalTensionKN,
      cableDiameterMm: this.cableDiameterMm,
      minBreakingStrengthNPerMm2: this.minBreakingStrengthNPerMm2,
      cableMaterial: this.cableMaterial
    };

    this.projectStateService.updateCableConfig(config);

    // Save preset ID if selected
    if (this.selectedPresetId()) {
      this.projectStateService.setSelectedPresetId(this.selectedPresetId());
    }
  }

  /**
   * On value change - validate and check modifications
   */
  onValueChange() {
    this.validate();
    this.checkModifications();

    // Auto-save on valid changes
    if (this.errors().length === 0) {
      this.saveConfig();
    }
  }

  /**
   * Increment helpers
   */
  incrementWeight(amount: number) {
    this.cableWeightNPerM = Math.max(5, Math.min(200, this.cableWeightNPerM + amount));
    this.onValueChange();
  }

  incrementTension(amount: number) {
    this.horizontalTensionKN = Math.max(2, Math.min(100, +(this.horizontalTensionKN + amount).toFixed(1)));
    this.onValueChange();
  }

  incrementSafety(amount: number) {
    this.safetyFactor = Math.max(2, Math.min(10, +(this.safetyFactor + amount).toFixed(1)));
    this.onValueChange();
  }

  incrementLoad(amount: number) {
    this.loadN = Math.max(500, Math.min(50000, this.loadN + amount));
    this.onValueChange();
  }

  incrementClearance(amount: number) {
    this.minClearanceM = Math.max(1, Math.min(10, +(this.minClearanceM + amount).toFixed(1)));
    this.onValueChange();
  }

  /**
   * Get preset by ID
   */
  getPresetById(id: string): CableParameterSet | undefined {
    return this.presets().find(p => p.id === id);
  }

  /**
   * Get selected preset name
   */
  getSelectedPresetName(): string {
    const id = this.selectedPresetId();
    if (!id) return 'Kein Preset';
    const preset = this.getPresetById(id);
    return preset?.name || 'Unbekannt';
  }

  /**
   * Increment/select diameter
   */
  incrementDiameter(amount: number) {
    this.cableDiameterMm = Math.max(8, Math.min(40, this.cableDiameterMm + amount));
    this.onValueChange();
  }

  /**
   * Select diameter from dropdown
   */
  selectDiameter(diameterMm: number) {
    this.cableDiameterMm = diameterMm;
    this.onValueChange();
  }

  /**
   * Change material type
   */
  selectMaterial(material: CableMaterial) {
    this.cableMaterial = material;
    this.onValueChange();
  }

  /**
   * Get cable info for selected diameter
   */
  getSelectedCableInfo(): { description: string; breakingStrength: number } | null {
    const cable = this.standardCables.find(c => c.diameterMm === this.cableDiameterMm);
    return cable ? {
      description: cable.description,
      breakingStrength: cable.typicalBreakingStrengthKN
    } : null;
  }

  /**
   * Open save preset dialog
   */
  openSavePresetDialog() {
    this.newPresetName = '';
    this.showSavePresetDialog.set(true);
    this.savePresetStatus.set('idle');
  }

  /**
   * Close save preset dialog
   */
  closeSavePresetDialog() {
    this.showSavePresetDialog.set(false);
  }

  /**
   * Save current config as a new preset
   */
  async saveAsPreset() {
    if (!this.newPresetName.trim()) return;

    this.savePresetStatus.set('saving');

    try {
      const config = this.buildCurrentConfig();
      const presetData = this.cablePresetService.createPresetFromConfig(
        this.newPresetName,
        'Benutzerdefiniert',
        config
      );

      await this.cablePresetService.saveUserPreset(presetData);
      this.savePresetStatus.set('success');

      // Close dialog after short delay
      setTimeout(() => {
        this.showSavePresetDialog.set(false);
        this.savePresetStatus.set('idle');
      }, 1500);
    } catch (err) {
      console.error('Failed to save preset:', err);
      this.savePresetStatus.set('error');
    }
  }

  /**
   * Build current config object
   */
  private buildCurrentConfig(): CableConfiguration {
    return {
      cableType: 'carrying',
      cableWeightPerMeter: this.cableWeightNPerM / 9.81,
      maxLoad: this.loadN / 9.81,
      safetyFactor: this.safetyFactor,
      minGroundClearance: this.minClearanceM,
      horizontalTensionKN: this.horizontalTensionKN,
      cableDiameterMm: this.cableDiameterMm,
      minBreakingStrengthNPerMm2: this.minBreakingStrengthNPerMm2,
      cableMaterial: this.cableMaterial
    };
  }

  /**
   * Delete a user preset
   */
  async deletePreset(presetId: string) {
    const preset = this.getPresetById(presetId);
    if (!preset || preset.isSystemPreset) return;

    if (confirm(`Preset "${preset.name}" wirklich löschen?`)) {
      await this.cablePresetService.deleteUserPreset(presetId);

      // Clear selection if deleted preset was selected
      if (this.selectedPresetId() === presetId) {
        this.selectedPresetId.set(null);
      }
    }
  }
}
