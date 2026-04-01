import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerrainSegment } from '../../models';
import { ProjectStateService } from './project-state.service';

describe('ProjectStateService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const createService = () => {
    const indexedDbMock = {
      saveProject: vi.fn().mockResolvedValue(undefined),
      loadProject: vi.fn().mockResolvedValue(undefined)
    };
    return new ProjectStateService(indexedDbMock as any);
  };

  it('calculates elevation change from terrain start to terrain end', () => {
    const service = createService();
    service.createNewProject('test');

    const segments: TerrainSegment[] = [
      {
        id: '1',
        segmentNumber: 1,
        lengthMeters: 10,
        slopePercent: 10,
        stationLength: 10,
        terrainHeight: 1
      },
      {
        id: '2',
        segmentNumber: 2,
        lengthMeters: 10,
        slopePercent: 0,
        stationLength: 20,
        terrainHeight: 1
      }
    ];

    service.updateTerrainSegments(segments);

    expect(service.currentProject?.terrainProfile.elevationChange).toBeCloseTo(1, 6);
  });

  it('updates cable config immutably', () => {
    const service = createService();
    service.createNewProject('test');

    const before = service.currentProject!;
    const beforeConfig = before.cableConfig;

    service.updateCableConfig({
      ...beforeConfig,
      safetyFactor: 6
    });

    const after = service.currentProject!;
    expect(after).not.toBe(before);
    expect(after.cableConfig).not.toBe(beforeConfig);
    expect(before.cableConfig.safetyFactor).toBe(5);
    expect(after.cableConfig.safetyFactor).toBe(6);
  });

  it('persists end station updates in project state', () => {
    const service = createService();
    service.createNewProject('test');

    service.updateEndStation({
      stationLength: 123,
      terrainHeight: 45
    });

    expect(service.currentProject?.endStation.stationLength).toBe(123);
    expect(service.currentProject?.endStation.terrainHeight).toBe(45);
  });
});
