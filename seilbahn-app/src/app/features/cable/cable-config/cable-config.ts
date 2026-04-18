import { Component, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  CableConfiguration,
  CableMaterial,
  CableParameterSet,
  STANDARD_CABLE_DIAMETERS
} from '../../../models';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { CablePresetService } from '../../../services/presets/cable-preset.service';
import { STANDARD_CABLES } from '../../../services/calculation/engine/physics/cable-capacity';

@Component({
  selector: 'app-cable-config',
  imports: [CommonModule, FormsModule],
  templateUrl: './cable-config.html',
  styleUrl: './cable-config.scss',
  standalone: true
})
export class CableConfig {
  Math = Math;

  presets;
  private _project;
  private _presetModified;

  selectedPresetId = signal<string | null>(null);
  isManualMode = signal(false);

  cableWeightNPerM = 20;
  horizontalTensionKN = 15;
  safetyFactor = 5;
  loadN = 5000;
  minClearanceM = 2;

  cableDiameterMm = 16;
  minBreakingStrengthNPerMm2 = 1960;
  cableMaterial: CableMaterial = 'steel';
  elasticModulusKNPerMm2 = 100;
  fillFactor = 0.7;

  readonly standardCables = STANDARD_CABLES;
  readonly standardDiameters = STANDARD_CABLE_DIAMETERS;

  showSavePresetDialog = signal(false);
  newPresetName = '';
  savePresetStatus = signal<'idle' | 'saving' | 'success' | 'error'>('idle');

  errors = signal<string[]>([]);
  isModified = signal(false);
  modifications = signal<Array<{ field: string; label: string; current: number; preset: number }>>([]);

  constructor(
    private projectStateService: ProjectStateService,
    private cablePresetService: CablePresetService
  ) {
    this.presets = toSignal(this.cablePresetService.presets$, { initialValue: [] as CableParameterSet[] });
    this._project = toSignal(this.projectStateService.project$, { initialValue: null });
    this._presetModified = toSignal(this.projectStateService.presetModified$, { initialValue: false });

    effect(() => {
      const project = this._project();
      if (!project) return;

      this.applyProjectConfig(project.cableConfig, project.cablePresetId || null);
      this.isManualMode.set(!project.cablePresetId);
      this.updatePresetDiffState();
    });
  }

  get project() {
    return this._project();
  }

  get selectedPreset(): CableParameterSet | undefined {
    const presetId = this.selectedPresetId();
    return presetId ? this.getPresetById(presetId) : undefined;
  }

  get hasMissingPresetReference(): boolean {
    return !!this.selectedPresetId() && !this.selectedPreset;
  }

  get presetOriginLabel(): string {
    if (this.hasMissingPresetReference) return 'Fehlende Preset-Referenz';
    if (!this.selectedPreset) return 'Manuelle Konfiguration';
    return this.selectedPreset.isSystemPreset ? 'System-Preset' : 'Benutzer-Preset';
  }

  get presetVersionLabel(): string {
    const version = this.cablePresetService.getPresetVersion(this.selectedPreset);
    return version ? `v${version}` : 'k. A.';
  }

  private applyProjectConfig(config: CableConfiguration, presetId: string | null): void {
    this.cableWeightNPerM = config.cableWeightPerMeter * 9.81;
    this.loadN = config.maxLoad * 9.81;
    this.safetyFactor = config.safetyFactor;
    this.minClearanceM = config.minGroundClearance;
    this.horizontalTensionKN = config.horizontalTensionKN || 15;
    this.cableDiameterMm = config.cableDiameterMm || 16;
    this.minBreakingStrengthNPerMm2 = config.minBreakingStrengthNPerMm2 || 1960;
    this.cableMaterial = config.cableMaterial || 'steel';
    this.elasticModulusKNPerMm2 = config.elasticModulusKNPerMm2 || 100;
    this.fillFactor = config.fillFactor || 0.7;
    this.selectedPresetId.set(presetId);
  }

  async applyPreset(presetId: string): Promise<void> {
    const preset = await this.cablePresetService.getPreset(presetId);
    if (!preset) return;

    this.selectedPresetId.set(presetId);
    this.isManualMode.set(false);

    this.cableWeightNPerM = preset.carrier.wNPerM;
    this.safetyFactor = preset.carrier.safetyFactor;
    this.loadN = preset.load.PN;
    this.minClearanceM = preset.limits.minClearanceM;

    const refSpan = 100;
    this.horizontalTensionKN = (preset.carrier.wNPerM * refSpan * refSpan) / (8 * preset.carrier.sagFM) / 1000;
    this.cableDiameterMm = preset.cable.diameterMm;
    this.minBreakingStrengthNPerMm2 = preset.cable.breakingStrengthNPerMm2 || 1960;
    this.cableMaterial = preset.cable.material;
    this.elasticModulusKNPerMm2 = this.project?.cableConfig.elasticModulusKNPerMm2 ?? 100;
    this.fillFactor = this.project?.cableConfig.fillFactor ?? 0.7;

    this.saveConfig();
    this.updatePresetDiffState();
  }

  enableManualMode(): void {
    this.isManualMode.set(true);
  }

  checkModifications(): void {
    const preset = this.selectedPreset;
    if (!preset) {
      this.isModified.set(false);
      this.modifications.set([]);
      return;
    }

    const mods: Array<{ field: string; label: string; current: number; preset: number }> = [];
    const refSpan = 100;
    const presetH = (preset.carrier.wNPerM * refSpan * refSpan) / (8 * preset.carrier.sagFM) / 1000;

    if (Math.abs(this.cableWeightNPerM - preset.carrier.wNPerM) > 0.1) {
      mods.push({ field: 'weight', label: 'Seilgewicht', current: this.cableWeightNPerM, preset: preset.carrier.wNPerM });
    }
    if (Math.abs(this.horizontalTensionKN - presetH) > 0.5) {
      mods.push({ field: 'tension', label: 'Horizontale Vorspannung', current: this.horizontalTensionKN, preset: presetH });
    }
    if (Math.abs(this.safetyFactor - preset.carrier.safetyFactor) > 0.01) {
      mods.push({ field: 'safety', label: 'Sicherheitsfaktor', current: this.safetyFactor, preset: preset.carrier.safetyFactor });
    }
    if (Math.abs(this.loadN - preset.load.PN) > 1) {
      mods.push({ field: 'load', label: 'Nutzlast', current: this.loadN, preset: preset.load.PN });
    }
    if (Math.abs(this.minClearanceM - preset.limits.minClearanceM) > 0.01) {
      mods.push({ field: 'clearance', label: 'Mindestfreiraum', current: this.minClearanceM, preset: preset.limits.minClearanceM });
    }
    if (this.cableDiameterMm !== preset.cable.diameterMm) {
      mods.push({ field: 'diameter', label: 'Seildurchmesser', current: this.cableDiameterMm, preset: preset.cable.diameterMm });
    }

    const presetStrength = preset.cable.breakingStrengthNPerMm2 || 1960;
    if (this.minBreakingStrengthNPerMm2 !== presetStrength) {
      mods.push({ field: 'breaking', label: 'Festigkeitsklasse', current: this.minBreakingStrengthNPerMm2, preset: presetStrength });
    }

    this.isModified.set(this._presetModified() || mods.length > 0);
    this.modifications.set(mods);
  }

  async resetToPreset(): Promise<void> {
    const presetId = this.selectedPresetId();
    if (presetId) {
      await this.applyPreset(presetId);
    }
  }

  validate(): boolean {
    const errs: string[] = [];

    if (this.cableWeightNPerM < 5 || this.cableWeightNPerM > 200) errs.push('Seilgewicht: 5-200 N/m');
    if (this.horizontalTensionKN < 2 || this.horizontalTensionKN > 100) errs.push('Horizontale Vorspannung: 2-100 kN');
    if (this.safetyFactor < 2 || this.safetyFactor > 10) errs.push('Sicherheitsfaktor: 2-10');
    if (this.loadN < 500 || this.loadN > 50000) errs.push('Nutzlast: 500-50000 N');
    if (this.minClearanceM < 1 || this.minClearanceM > 10) errs.push('Mindestfreiraum: 1-10 m');
    if (this.cableDiameterMm < 8 || this.cableDiameterMm > 40) errs.push('Seildurchmesser: 8-40 mm');
    if (this.minBreakingStrengthNPerMm2 < 1000 || this.minBreakingStrengthNPerMm2 > 2200) errs.push('Festigkeitsklasse: 1000-2200 N/mm^2');
    if (this.elasticModulusKNPerMm2 < 10 || this.elasticModulusKNPerMm2 > 400) errs.push('E-Modul: 10-400 kN/mm^2');
    if (this.fillFactor < 0.2 || this.fillFactor > 1) errs.push('Fuellfaktor: 0.2-1.0');

    this.errors.set(errs);
    return errs.length === 0;
  }

  saveConfig(): void {
    if (!this.validate()) return;

    const config: CableConfiguration = {
      cableType: 'carrying',
      cableWeightPerMeter: this.cableWeightNPerM / 9.81,
      maxLoad: this.loadN / 9.81,
      loadPositionRatio: this.project?.cableConfig.loadPositionRatio ?? 0.5,
      safetyFactor: this.safetyFactor,
      minGroundClearance: this.minClearanceM,
      horizontalTensionKN: this.horizontalTensionKN,
      cableDiameterMm: this.cableDiameterMm,
      minBreakingStrengthNPerMm2: this.minBreakingStrengthNPerMm2,
      cableMaterial: this.cableMaterial,
      elasticModulusKNPerMm2: this.elasticModulusKNPerMm2,
      fillFactor: this.fillFactor
    };

    this.projectStateService.updateCableConfig(config);

    if (this.selectedPresetId()) {
      this.projectStateService.setSelectedPresetId(this.selectedPresetId());
    }
  }

  onValueChange(): void {
    this.validate();
    this.updatePresetDiffState();

    if (this.errors().length === 0) {
      this.saveConfig();
    }
  }

  incrementWeight(amount: number): void {
    this.cableWeightNPerM = Math.max(5, Math.min(200, this.cableWeightNPerM + amount));
    this.onValueChange();
  }

  incrementTension(amount: number): void {
    this.horizontalTensionKN = Math.max(2, Math.min(100, +(this.horizontalTensionKN + amount).toFixed(1)));
    this.onValueChange();
  }

  incrementSafety(amount: number): void {
    this.safetyFactor = Math.max(2, Math.min(10, +(this.safetyFactor + amount).toFixed(1)));
    this.onValueChange();
  }

  incrementLoad(amount: number): void {
    this.loadN = Math.max(500, Math.min(50000, this.loadN + amount));
    this.onValueChange();
  }

  incrementClearance(amount: number): void {
    this.minClearanceM = Math.max(1, Math.min(10, +(this.minClearanceM + amount).toFixed(1)));
    this.onValueChange();
  }

  getPresetById(id: string): CableParameterSet | undefined {
    return this.presets().find((preset) => preset.id === id);
  }

  getSelectedPresetName(): string {
    return this.selectedPreset?.name || (this.hasMissingPresetReference ? 'Fehlendes Preset' : 'Kein Preset');
  }

  incrementDiameter(amount: number): void {
    this.cableDiameterMm = Math.max(8, Math.min(40, this.cableDiameterMm + amount));
    this.onValueChange();
  }

  selectDiameter(diameterMm: number): void {
    this.cableDiameterMm = diameterMm;
    this.onValueChange();
  }

  selectMaterial(material: CableMaterial): void {
    this.cableMaterial = material;
    this.onValueChange();
  }

  getSelectedCableInfo(): { description: string; breakingStrength: number } | null {
    const cable = this.standardCables.find((item) => item.diameterMm === this.cableDiameterMm);
    return cable
      ? {
          description: cable.description,
          breakingStrength: cable.typicalBreakingStrengthKN
        }
      : null;
  }

  openSavePresetDialog(): void {
    this.newPresetName = '';
    this.showSavePresetDialog.set(true);
    this.savePresetStatus.set('idle');
  }

  closeSavePresetDialog(): void {
    this.showSavePresetDialog.set(false);
  }

  async saveAsPreset(): Promise<void> {
    if (!this.newPresetName.trim()) return;

    this.savePresetStatus.set('saving');

    try {
      const presetData = this.cablePresetService.createPresetFromConfig(
        this.newPresetName,
        'Benutzerdefiniert',
        this.buildCurrentConfig()
      );

      const savedPreset = await this.cablePresetService.saveUserPreset(presetData);
      this.selectedPresetId.set(savedPreset.id);
      this.projectStateService.setSelectedPresetId(savedPreset.id);
      this.savePresetStatus.set('success');

      setTimeout(() => {
        this.showSavePresetDialog.set(false);
        this.savePresetStatus.set('idle');
      }, 1500);
    } catch (error) {
      console.error('Preset konnte nicht gespeichert werden:', error);
      this.savePresetStatus.set('error');
    }
  }

  clearMissingPresetReference(): void {
    this.selectedPresetId.set(null);
    this.projectStateService.clearSelectedPresetReference();
    this.isManualMode.set(true);
    this.updatePresetDiffState();
  }

  async deletePreset(presetId: string): Promise<void> {
    const preset = this.getPresetById(presetId);
    if (!preset || preset.isSystemPreset) return;

    if (confirm(`Preset "${preset.name}" loeschen?`)) {
      await this.cablePresetService.deleteUserPreset(presetId);
      this.projectStateService.clearSelectedPresetReference(presetId);
      if (this.selectedPresetId() === presetId) {
        this.selectedPresetId.set(null);
        this.isManualMode.set(true);
      }
      this.updatePresetDiffState();
    }
  }

  private buildCurrentConfig(): CableConfiguration {
    return {
      cableType: 'carrying',
      cableWeightPerMeter: this.cableWeightNPerM / 9.81,
      maxLoad: this.loadN / 9.81,
      loadPositionRatio: this.project?.cableConfig.loadPositionRatio ?? 0.5,
      safetyFactor: this.safetyFactor,
      minGroundClearance: this.minClearanceM,
      horizontalTensionKN: this.horizontalTensionKN,
      cableDiameterMm: this.cableDiameterMm,
      minBreakingStrengthNPerMm2: this.minBreakingStrengthNPerMm2,
      cableMaterial: this.cableMaterial,
      elasticModulusKNPerMm2: this.elasticModulusKNPerMm2,
      fillFactor: this.fillFactor
    };
  }

  private updatePresetDiffState(): void {
    this.checkModifications();
  }
}
