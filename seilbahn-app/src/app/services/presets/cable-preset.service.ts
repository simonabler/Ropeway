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
      const systemPresets: CableParameterSet[] = await response.json();

      // Save system presets to IndexedDB
      for (const preset of systemPresets) {
        const existing = await this.indexedDbService.loadCablePreset(preset.id);
        if (!existing) {
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
    const newPreset: CableParameterSet = {
      ...preset,
      id: this.generateUUID(),
      isSystemPreset: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

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

    const updatedPreset: CableParameterSet = {
      ...preset,
      ...updates,
      id: preset.id, // Ensure ID doesn't change
      isSystemPreset: false, // Ensure system flag doesn't change
      updatedAt: new Date().toISOString()
    };

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
    return {
      cableType: 'carrying',
      cableWeightPerMeter: preset.carrier.wNPerM / 9.81, // Convert N/m to kg/m
      maxLoad: preset.load.PN / 9.81, // Convert N to kg
      safetyFactor: preset.carrier.safetyFactor,
      minGroundClearance: preset.limits.minClearanceM,
      allowedSag: preset.carrier.sagFM,
      // New cable properties
      cableDiameterMm: preset.cable.diameterMm,
      cableMaterial: preset.cable.material,
      cableBreakingStrengthKN: preset.cable.breakingStrengthKN
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

    // Compare weight (convert to N/m for comparison)
    const cableWeightN = cable.cableWeightPerMeter * 9.81;
    if (Math.abs(cableWeightN - preset.carrier.wNPerM) > 0.1) {
      diffs.push({
        field: 'cableWeightPerMeter',
        configValue: cableWeightN,
        presetValue: preset.carrier.wNPerM
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
    return {
      name,
      description,
      cable: {
        diameterMm: cable.cableDiameterMm,
        breakingStrengthKN: cable.cableBreakingStrengthKN || this.calculateBreakingStrength(cable.cableDiameterMm, cable.cableMaterial),
        material: cable.cableMaterial
      },
      carrier: {
        wNPerM: cable.cableWeightPerMeter * 9.81, // Convert kg/m to N/m
        sagFM: cable.allowedSag || 3.0,
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
    const materialStrength = material === 'steel' ? 1770 : 1200; // N/mm²
    const areaMm2 = Math.PI * Math.pow(diameterMm / 2, 2);
    return (areaMm2 * materialStrength) / 1000; // Convert to kN
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
}
