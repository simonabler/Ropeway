import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { CableParameterSet, CableConfiguration } from '../../models';
import { IndexedDbService } from '../storage/indexed-db.service';

/**
 * Cable Preset Service (M4.5)
 * Manages cable parameter presets (system + user-defined)
 */
@Injectable({
  providedIn: 'root'
})
export class CablePresetService {
  private presetsSubject = new BehaviorSubject<CableParameterSet[]>([]);
  readonly presets$ = this.presetsSubject.asObservable();

  private systemPresetsLoaded = false;
  private readonly systemPresetSchemaVersion = 1;

  constructor(private indexedDbService: IndexedDbService) {
    this.loadAllPresets();
  }

  /**
   * Load all presets (system + user)
   */
  async loadAllPresets(): Promise<void> {
    // Load system presets if not already loaded
    if (!this.systemPresetsLoaded) {
      await this.loadSystemPresets();
      this.systemPresetsLoaded = true;
    }

    // Load all presets from IndexedDB
    const presets = await this.indexedDbService.listCablePresets();
    this.presetsSubject.next(presets);
  }

  /**
   * Load system presets from JSON file
   */
  private async loadSystemPresets(): Promise<void> {
    try {
      const response = await fetch('/assets/presets/system-cable-presets.json');
      const rawSystemPresets: CableParameterSet[] = await response.json();
      const systemPresets = rawSystemPresets.map((preset) => this.normalizePreset(preset, true));

      for (const preset of systemPresets) {
        const existing = await this.indexedDbService.loadCablePreset(preset.id);
        if (
          !existing ||
          existing.isSystemPreset !== true ||
          (existing.version ?? 0) < (preset.version ?? 0) ||
          existing.configHash !== preset.configHash
        ) {
          await this.indexedDbService.saveCablePreset(preset);
        }
      }
    } catch (error) {
      console.error('Failed to load system presets:', error);
    }
  }

  /**
   * Get a preset by ID
   */
  async getPreset(id: string): Promise<CableParameterSet | undefined> {
    return await this.indexedDbService.loadCablePreset(id);
  }

  /**
   * Save a user-defined preset
   */
  async saveUserPreset(preset: Omit<CableParameterSet, 'id' | 'isSystemPreset' | 'createdAt' | 'updatedAt'>): Promise<CableParameterSet> {
    const newPreset = this.normalizePreset({
      ...preset,
      id: this.generateUUID(),
      isSystemPreset: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, false);

    await this.indexedDbService.saveCablePreset(newPreset);
    await this.loadAllPresets();

    return newPreset;
  }

  /**
   * Update an existing user preset
   */
  async updateUserPreset(id: string, updates: Partial<CableParameterSet>): Promise<void> {
    const preset = await this.indexedDbService.loadCablePreset(id);
    if (!preset) {
      throw new Error('Preset not found');
    }

    if (preset.isSystemPreset) {
      throw new Error('Cannot update system preset');
    }

    const updatedPreset = this.normalizePreset({
      ...preset,
      ...updates,
      id: preset.id, // Ensure ID doesn't change
      isSystemPreset: false, // Ensure system flag doesn't change
      updatedAt: new Date().toISOString()
    }, false);

    await this.indexedDbService.saveCablePreset(updatedPreset);
    await this.loadAllPresets();
  }

  /**
   * Delete a user preset
   */
  async deleteUserPreset(id: string): Promise<void> {
    await this.indexedDbService.deleteCablePreset(id);
    await this.loadAllPresets();
  }

  /**
   * Apply preset to cable configuration
   */
  applyCablePreset(preset: CableParameterSet): CableConfiguration {
    // Derive H from preset sag (reference span 100m): H = w*L²/(8*f)
    const refSpan = 100;
    const horizontalTensionKN = (preset.carrier.wNPerM * refSpan * refSpan) / (8 * preset.carrier.sagFM) / 1000;

    return {
      cableType: 'carrying',
      cableWeightPerMeter: preset.carrier.wNPerM / 9.81, // Convert N/m to kg/m
      maxLoad: preset.load.PN / 9.81, // Convert N to kg
      loadPositionRatio: 0.5,
      safetyFactor: preset.carrier.safetyFactor,
      minGroundClearance: preset.limits.minClearanceM,
      horizontalTensionKN,
      // New cable properties
      cableDiameterMm: preset.cable.diameterMm,
      minBreakingStrengthNPerMm2: preset.cable.breakingStrengthNPerMm2 || this.deriveStrengthFromBreakingLoad(preset.cable.diameterMm, preset.cable.breakingStrengthKN),
      cableMaterial: preset.cable.material,
      cableBreakingStrengthKN: preset.cable.breakingStrengthKN,
      elasticModulusKNPerMm2: 100,
      fillFactor: 0.7
    };
  }

  /**
   * Compare cable configuration with preset
   */
  compareCableWithPreset(
    cable: CableConfiguration,
    preset: CableParameterSet
  ): {
    isModified: boolean;
    diffs: Array<{ field: string; configValue: number; presetValue: number }>;
  } {
    const diffs: Array<{ field: string; configValue: number; presetValue: number }> = [];
    const refSpan = 100;
    const presetHorizontalTensionKN = (preset.carrier.wNPerM * refSpan * refSpan) / (8 * preset.carrier.sagFM) / 1000;

    // Compare weight (convert to N/m for comparison)
    const cableWeightN = cable.cableWeightPerMeter * 9.81;
    if (Math.abs(cableWeightN - preset.carrier.wNPerM) > 0.1) {
      diffs.push({
        field: 'cableWeightPerMeter',
        configValue: cableWeightN,
        presetValue: preset.carrier.wNPerM
      });
    }

    if (Math.abs(cable.horizontalTensionKN - presetHorizontalTensionKN) > 0.1) {
      diffs.push({
        field: 'horizontalTensionKN',
        configValue: cable.horizontalTensionKN,
        presetValue: presetHorizontalTensionKN
      });
    }

    // Compare load (convert to N for comparison)
    const loadN = cable.maxLoad * 9.81;
    if (Math.abs(loadN - preset.load.PN) > 1) {
      diffs.push({
        field: 'maxLoad',
        configValue: loadN,
        presetValue: preset.load.PN
      });
    }

    // Compare safety factor
    if (Math.abs(cable.safetyFactor - preset.carrier.safetyFactor) > 0.01) {
      diffs.push({
        field: 'safetyFactor',
        configValue: cable.safetyFactor,
        presetValue: preset.carrier.safetyFactor
      });
    }

    // Compare clearance
    if (Math.abs(cable.minGroundClearance - preset.limits.minClearanceM) > 0.01) {
      diffs.push({
        field: 'minGroundClearance',
        configValue: cable.minGroundClearance,
        presetValue: preset.limits.minClearanceM
      });
    }

    // Compare sag
    if (cable.allowedSag && Math.abs(cable.allowedSag - preset.carrier.sagFM) > 0.01) {
      diffs.push({
        field: 'allowedSag',
        configValue: cable.allowedSag,
        presetValue: preset.carrier.sagFM
      });
    }

    // Compare cable diameter
    if (cable.cableDiameterMm !== preset.cable.diameterMm) {
      diffs.push({
        field: 'cableDiameterMm',
        configValue: cable.cableDiameterMm,
        presetValue: preset.cable.diameterMm
      });
    }

    const presetStrength = preset.cable.breakingStrengthNPerMm2 || this.deriveStrengthFromBreakingLoad(preset.cable.diameterMm, preset.cable.breakingStrengthKN);
    if (cable.minBreakingStrengthNPerMm2 && Math.abs(cable.minBreakingStrengthNPerMm2 - presetStrength) > 0.1) {
      diffs.push({
        field: 'breakingStrengthNPerMm2',
        configValue: cable.minBreakingStrengthNPerMm2,
        presetValue: presetStrength
      });
    }

    return {
      isModified: diffs.length > 0,
      diffs
    };
  }

  /**
   * Create a preset from current cable configuration
   */
  createPresetFromConfig(
    name: string,
    description: string,
    cable: CableConfiguration
  ): Omit<CableParameterSet, 'id' | 'isSystemPreset' | 'createdAt' | 'updatedAt'> {
    // Derive sag from H for preset storage (reference span 100m): f = w*L²/(8*H)
    const refSpan = 100;
    const wNPerM = cable.cableWeightPerMeter * 9.81;
    const H_N = (cable.horizontalTensionKN || 15) * 1000;
    const sagFM = (wNPerM * refSpan * refSpan) / (8 * H_N);

    return {
      name,
      description,
      version: 1,
      cable: {
        diameterMm: cable.cableDiameterMm,
        breakingStrengthKN: cable.cableBreakingStrengthKN || this.calculateBreakingStrength(cable.cableDiameterMm, cable.cableMaterial),
        breakingStrengthNPerMm2: cable.minBreakingStrengthNPerMm2 || 1960,
        material: cable.cableMaterial
      },
      carrier: {
        wNPerM,
        sagFM,
        safetyFactor: cable.safetyFactor,
        kCoeff: 1600 // Legacy field
      },
      load: {
        PN: cable.maxLoad * 9.81 // Convert kg to N
      },
      limits: {
        minClearanceM: cable.minGroundClearance,
        maxTmaxKN: undefined // Optional warning threshold
      }
    };
  }

  /**
   * Calculate breaking strength from diameter and material
   */
  private calculateBreakingStrength(diameterMm: number, material: 'steel' | 'synthetic'): number {
    const materialStrength = material === 'steel' ? 1960 : 1200; // N/mm^2
    const areaMm2 = Math.PI * Math.pow(diameterMm / 2, 2);
    return (areaMm2 * materialStrength) / 1000; // Convert to kN
  }

  /**
   * Derive breaking strength (N/mm^2) from breaking load (kN) and diameter
   */
  private deriveStrengthFromBreakingLoad(diameterMm: number, breakingStrengthKN?: number): number {
    if (!breakingStrengthKN || diameterMm <= 0) return 0;
    const areaMm2 = Math.PI * Math.pow(diameterMm / 2, 2);
    if (areaMm2 <= 0) return 0;
    return (breakingStrengthKN * 1000) / areaMm2;
  }

  /**
   * Generate UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  getPresetVersion(preset: CableParameterSet | undefined): number | null {
    return preset?.version ?? null;
  }

  private normalizePreset(preset: CableParameterSet, isSystemPreset: boolean): CableParameterSet {
    const version = preset.version ?? (isSystemPreset ? this.systemPresetSchemaVersion : 1);
    const normalizedPreset: CableParameterSet = {
      ...preset,
      version,
      isSystemPreset,
      configHash: preset.configHash ?? this.createConfigHashFromPreset(preset)
    };

    return {
      ...normalizedPreset,
      configHash: this.createConfigHashFromPreset(normalizedPreset)
    };
  }

  private createConfigHashFromPreset(preset: CableParameterSet): string {
    const signature = {
      diameterMm: preset.cable.diameterMm,
      breakingStrengthKN: preset.cable.breakingStrengthKN,
      breakingStrengthNPerMm2: preset.cable.breakingStrengthNPerMm2 || 1960,
      material: preset.cable.material,
      wNPerM: preset.carrier.wNPerM,
      sagFM: preset.carrier.sagFM,
      safetyFactor: preset.carrier.safetyFactor,
      loadPN: preset.load.PN,
      minClearanceM: preset.limits.minClearanceM
    };

    return JSON.stringify(signature);
  }

  private createConfigHashFromCable(cable: CableConfiguration): string {
    const presetLike = this.createPresetFromConfig('hash', 'hash', cable);
    return this.createConfigHashFromPreset({
      ...presetLike,
      id: 'hash',
      isSystemPreset: false,
      createdAt: '',
      updatedAt: '',
      version: 1
    });
  }
}
