import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CableConfiguration, CableParameterSet } from '../../models';
import { CablePresetService } from './cable-preset.service';

describe('CablePresetService', () => {
  const createIndexedDbMock = () => ({
    listCablePresets: vi.fn().mockResolvedValue([]),
    loadCablePreset: vi.fn().mockResolvedValue(undefined),
    saveCablePreset: vi.fn().mockResolvedValue(undefined),
    deleteCablePreset: vi.fn().mockResolvedValue(undefined)
  });

  const createSystemPreset = (overrides?: Partial<CableParameterSet>): CableParameterSet => ({
    id: 'preset-system-1',
    name: 'System preset',
    description: 'System preset',
    version: 1,
    configHash: 'outdated-hash',
    isSystemPreset: true,
    createdAt: '2026-04-18T00:00:00.000Z',
    updatedAt: '2026-04-18T00:00:00.000Z',
    cable: {
      diameterMm: 16,
      breakingStrengthKN: 320,
      breakingStrengthNPerMm2: 1960,
      material: 'steel'
    },
    carrier: {
      wNPerM: 49.05,
      sagFM: 4.0875,
      safetyFactor: 5,
      kCoeff: 1600
    },
    load: {
      PN: 4905
    },
    limits: {
      minClearanceM: 2
    },
    ...overrides
  });

  const flushAsync = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => [createSystemPreset()]
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks the preset as modified when the cable pretension changes', async () => {
    const service = new CablePresetService(createIndexedDbMock() as any);
    await flushAsync();

    const preset = createSystemPreset();
    const cable: CableConfiguration = {
      cableType: 'carrying',
      cableWeightPerMeter: 5,
      maxLoad: 500,
      loadPositionRatio: 0.5,
      safetyFactor: 5,
      minGroundClearance: 2,
      horizontalTensionKN: 18,
      cableDiameterMm: 16,
      minBreakingStrengthNPerMm2: 1960,
      cableMaterial: 'steel',
      elasticModulusKNPerMm2: 100,
      fillFactor: 0.7
    };

    const comparison = service.compareCableWithPreset(cable, preset);

    expect(comparison.isModified).toBe(true);
    expect(comparison.diffs.some((diff) => diff.field === 'horizontalTensionKN')).toBe(true);
  });

  it('migrates outdated system presets when version or hash changed', async () => {
    const indexedDbMock = createIndexedDbMock();
    indexedDbMock.loadCablePreset.mockResolvedValue(
      createSystemPreset({
        version: 0,
        configHash: 'old'
      })
    );

    const service = new CablePresetService(indexedDbMock as any);
    await service.loadAllPresets();

    expect(indexedDbMock.saveCablePreset).toHaveBeenCalled();
    expect(indexedDbMock.listCablePresets).toHaveBeenCalled();
  });
});
