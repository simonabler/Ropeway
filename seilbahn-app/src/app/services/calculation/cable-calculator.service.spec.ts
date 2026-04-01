import { describe, expect, it } from 'vitest';
import { Project } from '../../models';
import { CableCalculatorService } from './cable-calculator.service';
import { calculatePiecewiseCatenaryCable } from './engine/physics/piecewise-catenary';
import { calculateSpanGeometries } from './engine/geometry/span-geometry';

describe('CableCalculatorService', () => {
  const service = new CableCalculatorService();

  const createProject = (
    solverType: Project['solverType'],
    overrides?: Partial<Project['cableConfig']>
  ): Project => ({
    id: 'project-1',
    name: 'Test Project',
    createdAt: new Date(),
    modifiedAt: new Date(),
    status: 'draft',
    startPoint: { lat: 0, lng: 0 },
    azimuth: 0,
    solverType,
    terrainProfile: {
      segments: [
        {
          id: 'seg-1',
          segmentNumber: 1,
          lengthMeters: 100,
          slopePercent: 0,
          stationLength: 100,
          terrainHeight: 0
        }
      ],
      recordingMethod: 'manual',
      totalLength: 100,
      elevationChange: 0
    },
    supports: [],
    startStation: {
      type: 'start',
      stationLength: 0,
      terrainHeight: 0,
      anchorPoint: { heightAboveTerrain: 8 },
      groundClearance: 2
    },
    endStation: {
      type: 'end',
      stationLength: 100,
      terrainHeight: 0,
      anchorPoint: { heightAboveTerrain: 8 },
      groundClearance: 2
    },
    cableConfig: {
      cableType: 'carrying',
      cableWeightPerMeter: 5,
      maxLoad: 500,
      safetyFactor: 5,
      minGroundClearance: 2,
      horizontalTensionKN: 15,
      cableDiameterMm: 16,
      minBreakingStrengthNPerMm2: 1960,
      cableMaterial: 'steel',
      ...overrides
    }
  });

  it.each(['parabolic', 'catenary', 'catenary-piecewise'] as const)(
    'changes design T_max when payload changes for %s',
    (solverType) => {
      const lowLoadProject = createProject(solverType, { maxLoad: 200 });
      const highLoadProject = createProject(solverType, { maxLoad: 1200 });

      const lowLoadResult = service.calculateCable(lowLoadProject);
      const highLoadResult = service.calculateCable(highLoadProject);

      expect(highLoadResult.maxTension).toBeGreaterThan(lowLoadResult.maxTension);
    }
  );

  it('returns a worst-case T_max that is at least as high as the mid-span piecewise load case', () => {
    const project = createProject('catenary-piecewise', { maxLoad: 1000 });
    const result = service.calculateCable(project);

    const spanGeometry = calculateSpanGeometries(
      project.supports,
      project.startStation,
      project.endStation
    )[0];
    const cableWeightN = project.cableConfig.cableWeightPerMeter * 9.81;
    const horizontalForceN = project.cableConfig.horizontalTensionKN * 1000;
    const spanSag = (cableWeightN * spanGeometry.length * spanGeometry.length) / (8 * horizontalForceN);
    const midSpanResult = calculatePiecewiseCatenaryCable(
      spanGeometry,
      cableWeightN,
      spanSag,
      project.cableConfig.maxLoad * 9.81,
      0.5
    );

    expect(result.maxTension).toBeGreaterThanOrEqual(midSpanResult.maxTension);
    expect(result.designCheck?.governingLoadPositionM).toBeDefined();
  });

  it('can select a governing load position near a support instead of mid-span', () => {
    const project = createProject('parabolic', { maxLoad: 2000 });
    const result = service.calculateCable(project);

    expect(result.designCheck).toBeDefined();
    expect(result.designCheck!.governingSpanLoadRatio).not.toBe(0.5);
    expect(result.designCheck!.governingSpanLoadRatio).toBeLessThan(0.1);
  });

  it('uses load-adjacent piecewise tensions instead of support-only tensions', () => {
    const project = createProject('catenary-piecewise', { maxLoad: 1500 });
    const spanGeometry = calculateSpanGeometries(
      project.supports,
      project.startStation,
      project.endStation
    )[0];
    const cableWeightN = project.cableConfig.cableWeightPerMeter * 9.81;
    const horizontalForceN = project.cableConfig.horizontalTensionKN * 1000;
    const spanSag = (cableWeightN * spanGeometry.length * spanGeometry.length) / (8 * horizontalForceN);
    const piecewiseResult = calculatePiecewiseCatenaryCable(
      spanGeometry,
      cableWeightN,
      spanSag,
      project.cableConfig.maxLoad * 9.81,
      0.2
    );

    const supportOnlyMax = Math.max(
      Math.sqrt(
        horizontalForceN * horizontalForceN +
        Math.pow(piecewiseResult.verticalForceStart * 1000, 2)
      ) / 1000,
      Math.sqrt(
        horizontalForceN * horizontalForceN +
        Math.pow(piecewiseResult.verticalForceEnd * 1000, 2)
      ) / 1000
    );

    expect(piecewiseResult.maxTension).toBeGreaterThanOrEqual(supportOnlyMax);
  });
});
