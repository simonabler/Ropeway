import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Project, TerrainSegment } from '../../models';
import { ProjectStateService } from './project-state.service';

describe('ProjectStateService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const createIndexedDbMock = () => ({
    saveProject: vi.fn().mockResolvedValue(undefined),
    loadProject: vi.fn().mockResolvedValue(undefined)
  });

  const createService = (indexedDbMock = createIndexedDbMock()) => ({
    service: new ProjectStateService(indexedDbMock as any),
    indexedDbMock
  });

  const flushAsync = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('calculates elevation change from terrain start to terrain end', () => {
    const { service } = createService();
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
    const { service } = createService();
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
    const { service } = createService();
    service.createNewProject('test');

    service.updateEndStation({
      stationLength: 123,
      terrainHeight: 45
    });

    expect(service.currentProject?.endStation.stationLength).toBe(123);
    expect(service.currentProject?.endStation.terrainHeight).toBe(45);
  });

  it('writes start point, end point and synchronized azimuth for route geometry', async () => {
    const { service, indexedDbMock } = createService();
    service.createNewProject('test');

    service.updateRouteGeometry(
      { lat: 47, lng: 11 },
      { lat: 47, lng: 11.01 }
    );
    await flushAsync();

    expect(service.currentProject?.startPoint).toEqual({ lat: 47, lng: 11 });
    expect(service.currentProject?.endPoint).toEqual({ lat: 47, lng: 11.01 });
    expect(service.currentProject?.azimuth).toBeGreaterThan(80);
    expect(service.currentProject?.azimuth).toBeLessThan(100);
    expect(indexedDbMock.saveProject).toHaveBeenCalled();
  });

  it('backfills legacy projects without end point from start point, azimuth and terrain length', async () => {
    const indexedDbMock = createIndexedDbMock();
    const { service } = createService(indexedDbMock);

    const legacyProject: Project = {
      id: 'legacy',
      name: 'legacy',
      createdAt: new Date(),
      modifiedAt: new Date(),
      status: 'draft',
      startPoint: { lat: 47, lng: 11 },
      azimuth: 90,
      calculationMode: 'planning',
      terrainProfile: {
        segments: [],
        recordingMethod: 'manual',
        totalLength: 500,
        elevationChange: 0
      },
      supports: [],
      startStation: {
        type: 'start',
        stationLength: 0,
        terrainHeight: 0,
        anchorPoint: { heightAboveTerrain: 0 },
        groundClearance: 2
      },
      endStation: {
        type: 'end',
        stationLength: 0,
        terrainHeight: 0,
        anchorPoint: { heightAboveTerrain: 0 },
        groundClearance: 2
      },
      cableConfig: {
        cableType: 'carrying',
        cableWeightPerMeter: 5,
        maxLoad: 500,
        loadPositionRatio: 0.5,
        safetyFactor: 5,
        minGroundClearance: 2,
        horizontalTensionKN: 15,
        cableDiameterMm: 16,
        minBreakingStrengthNPerMm2: 1960,
        cableMaterial: 'steel',
        elasticModulusKNPerMm2: 100,
        fillFactor: 0.7
      },
      endPoint: null
    };

    delete (legacyProject as Partial<Project>).endPoint;
    indexedDbMock.loadProject.mockResolvedValue(legacyProject);

    await service.loadProject('legacy');

    expect(service.currentProject?.endPoint).not.toBeNull();
    expect(service.currentProject?.azimuth).toBeGreaterThan(80);
    expect(service.currentProject?.azimuth).toBeLessThan(100);
    expect(indexedDbMock.saveProject).toHaveBeenCalled();
  });

  it('keeps the saved geographic end point when terrain length changes', async () => {
    const { service } = createService();
    service.createNewProject('test');

    service.updateRouteGeometry(
      { lat: 47, lng: 11 },
      { lat: 47, lng: 11.01 }
    );
    await flushAsync();

    const endPointBefore = service.currentProject?.endPoint;

    service.updateTerrainSegments([
      {
        id: '1',
        segmentNumber: 1,
        lengthMeters: 50,
        slopePercent: 0,
        stationLength: 50,
        terrainHeight: 0
      },
      {
        id: '2',
        segmentNumber: 2,
        lengthMeters: 75,
        slopePercent: 0,
        stationLength: 125,
        terrainHeight: 0
      }
    ]);

    expect(service.currentProject?.endPoint).toEqual(endPointBefore);
  });

  it('clears route geometry completely', async () => {
    const { service } = createService();
    service.createNewProject('test');

    service.updateRouteGeometry(
      { lat: 47, lng: 11 },
      { lat: 47, lng: 11.01 }
    );
    await flushAsync();

    service.updateRouteGeometry(null, null);
    await flushAsync();

    expect(service.currentProject?.startPoint).toEqual({ lat: 0, lng: 0 });
    expect(service.currentProject?.endPoint).toBeNull();
    expect(service.currentProject?.azimuth).toBe(0);
  });

  it('loads legacy projects without loadPositionRatio with a default of 0.5', async () => {
    const indexedDbMock = createIndexedDbMock();
    const { service } = createService(indexedDbMock);

    const legacyProject = service.createNewProject('legacy');
    const legacyCableConfig = { ...legacyProject.cableConfig } as Partial<Project['cableConfig']>;
    delete legacyCableConfig.loadPositionRatio;
    indexedDbMock.loadProject.mockResolvedValue({
      ...legacyProject,
      cableConfig: legacyCableConfig
    });

    await service.loadProject('legacy');

    expect(service.currentProject?.cableConfig.loadPositionRatio).toBe(0.5);
  });

  it('loads legacy projects without engineering rope parameters with defaults', async () => {
    const indexedDbMock = createIndexedDbMock();
    const { service } = createService(indexedDbMock);

    const legacyProject = service.createNewProject('legacy');
    const legacyCableConfig = { ...legacyProject.cableConfig } as Partial<Project['cableConfig']>;
    delete legacyCableConfig.elasticModulusKNPerMm2;
    delete legacyCableConfig.fillFactor;
    indexedDbMock.loadProject.mockResolvedValue({
      ...legacyProject,
      cableConfig: legacyCableConfig
    });

    await service.loadProject('legacy');

    expect(service.currentProject?.cableConfig.elasticModulusKNPerMm2).toBe(100);
    expect(service.currentProject?.cableConfig.fillFactor).toBe(0.7);
  });

  it('defaults legacy projects without calculationMode to planning', async () => {
    const indexedDbMock = createIndexedDbMock();
    const { service } = createService(indexedDbMock);

    const legacyProject = service.createNewProject('legacy');
    delete (legacyProject as Partial<Project>).calculationMode;
    indexedDbMock.loadProject.mockResolvedValue(legacyProject);

    await service.loadProject('legacy');

    expect(service.currentProject?.calculationMode).toBe('planning');
    expect(service.currentProject?.solverType).toBe('parabolic');
  });

  it('defaults legacy projects without engineeringDesignMode to selected', async () => {
    const indexedDbMock = createIndexedDbMock();
    const { service } = createService(indexedDbMock);

    const legacyProject = service.createNewProject('legacy');
    delete (legacyProject as Partial<Project>).engineeringDesignMode;
    indexedDbMock.loadProject.mockResolvedValue(legacyProject);

    await service.loadProject('legacy');

    expect(service.currentProject?.engineeringDesignMode).toBe('selected');
  });

  it('builds an effective project from calculation overrides and can reset them', () => {
    const { service } = createService();
    service.createNewProject('test');

    service.setCalculationOverride({
      horizontalTensionKN: 22,
      maxLoad: 900,
      loadPositionRatio: 0.25
    });

    expect(service.currentEffectiveProject?.cableConfig.horizontalTensionKN).toBe(22);
    expect(service.currentEffectiveProject?.cableConfig.maxLoad).toBe(900);
    expect(service.currentEffectiveProject?.cableConfig.loadPositionRatio).toBe(0.25);
    expect(service.hasCalculationOverrides).toBe(true);

    service.clearCalculationOverrides();

    expect(service.currentEffectiveProject?.cableConfig.horizontalTensionKN).toBe(15);
    expect(service.currentEffectiveProject?.cableConfig.maxLoad).toBe(500);
    expect(service.currentEffectiveProject?.cableConfig.loadPositionRatio).toBe(0.5);
    expect(service.hasCalculationOverrides).toBe(false);
  });

  it('switches to a compatible solver when changing calculation mode', () => {
    const { service } = createService();
    service.createNewProject('test');

    service.updateCalculationMode('engineering');
    expect(service.currentProject?.calculationMode).toBe('engineering');
    expect(service.currentProject?.solverType).toBe('global-elastic-catenary');

    service.updateCalculationMode('planning');
    expect(service.currentProject?.calculationMode).toBe('planning');
    expect(service.currentProject?.solverType).toBe('parabolic');
  });

  it('updates engineering design mode independently from calculation mode', () => {
    const { service } = createService();
    service.createNewProject('test');

    service.updateCalculationMode('engineering');
    service.updateEngineeringDesignMode('worst-case');

    expect(service.currentProject?.calculationMode).toBe('engineering');
    expect(service.currentProject?.engineeringDesignMode).toBe('worst-case');
  });
});
