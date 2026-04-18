import { describe, expect, it } from 'vitest';
import { Project } from '../../models';
import { CableCalculatorService } from './cable-calculator.service';
import { calculatePiecewiseCatenaryCable } from './engine/physics/piecewise-catenary';
import { calculateSpanGeometries } from './engine/geometry/span-geometry';
import { checkCableClearance } from './engine/geometry/clearance-checker';

describe('CableCalculatorService', () => {
  const service = new CableCalculatorService();

  const interpolateHeight = (
    cableLine: Array<{ stationLength: number; height: number }>,
    stationLength: number
  ): number => {
    if (cableLine.length === 0) return 0;
    if (stationLength <= cableLine[0].stationLength) return cableLine[0].height;
    if (stationLength >= cableLine[cableLine.length - 1].stationLength) {
      return cableLine[cableLine.length - 1].height;
    }

    for (let index = 0; index < cableLine.length - 1; index++) {
      const current = cableLine[index];
      const next = cableLine[index + 1];
      if (stationLength >= current.stationLength && stationLength <= next.stationLength) {
        const ratio = (stationLength - current.stationLength) / (next.stationLength - current.stationLength);
        return current.height + (next.height - current.height) * ratio;
      }
    }

    return cableLine[cableLine.length - 1].height;
  };

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
    endPoint: null,
    azimuth: 0,
    calculationMode: 'planning',
    engineeringDesignMode: 'selected',
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
    operationalEnvelope: {
      activeMonitoredRangeStartStation: 0,
      activeMonitoredRangeEndStation: 100
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
      fillFactor: 0.7,
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

  it.each(['parabolic', 'catenary', 'catenary-piecewise'] as const)(
    'uses loaded governing geometry in the final cable line for %s',
    (solverType) => {
      const unloadedProject = createProject(solverType, { maxLoad: 0 });
      const loadedProject = createProject(solverType, { maxLoad: 2500 });

      const unloadedResult = service.calculateCable(unloadedProject);
      const loadedResult = service.calculateCable(loadedProject);
      const governingStation = loadedResult.designCheck!.governingLoadPositionM;
      const loadedHeight = interpolateHeight(loadedResult.cableLine, governingStation);
      const unloadedHeight = interpolateHeight(unloadedResult.cableLine, governingStation);
      const maxHeightDifference = Math.abs(loadedHeight - unloadedHeight);

      expect(maxHeightDifference).toBeGreaterThan(0.01);
    }
  );

  it('uses the configured load position for the active piecewise load case', () => {
    const project = createProject('catenary-piecewise', { maxLoad: 1000, loadPositionRatio: 0.5 });
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

    expect(result.maxTension).toBeCloseTo(midSpanResult.maxTension, 1);
    expect(result.designCheck?.source).toBe('selected-payload');
    expect(result.designCheck?.governingLoadPositionM).toBeDefined();
  });

  it('returns piecewise loaded geometry and clearance as the final result for catenary-piecewise', () => {
    const project = createProject('catenary-piecewise', { maxLoad: 1200 });
    const unloadedResult = service.calculateCable(createProject('catenary-piecewise', { maxLoad: 0 }));
    const result = service.calculateCable(project);

    const spanGeometry = calculateSpanGeometries(
      project.supports,
      project.startStation,
      project.endStation
    )[0];
    const cableWeightN = project.cableConfig.cableWeightPerMeter * 9.81;
    const horizontalForceN = unloadedResult.spans[0].horizontalForce * 1000;
    const spanSag = (cableWeightN * spanGeometry.length * spanGeometry.length) / (8 * horizontalForceN);
    const governingRatio = result.designCheck!.governingSpanLoadRatio;
    const expectedLoadedSpan = calculatePiecewiseCatenaryCable(
      spanGeometry,
      cableWeightN,
      spanSag,
      project.cableConfig.maxLoad * 9.81,
      governingRatio
    );
    const expectedClearance = checkCableClearance(
      expectedLoadedSpan.cableLine,
      project.terrainProfile,
      project.startStation.stationLength,
      project.cableConfig.minGroundClearance
    );

    expect(result.cableLine).toHaveLength(expectedLoadedSpan.cableLine.length);

    result.cableLine.forEach((point, index) => {
      expect(point.stationLength).toBeCloseTo(expectedLoadedSpan.cableLine[index].stationLength, 6);
      expect(point.height).toBeCloseTo(expectedLoadedSpan.cableLine[index].height, 2);
    });

    expect(result.spans[0].minClearance).toBeCloseTo(expectedClearance.minClearance, 6);
    expect(result.spans[0].minClearanceAt).toBeCloseTo(expectedClearance.minClearanceAt, 6);
  });

  it('maps a selected global load position near a support into the active span result', () => {
    const project = createProject('parabolic', { maxLoad: 2000, loadPositionRatio: 0.05 });
    const result = service.calculateCable(project);
    const distanceToNearestSupport = Math.min(
      result.designCheck!.governingSpanLoadRatio,
      1 - result.designCheck!.governingSpanLoadRatio
    );

    expect(result.designCheck).toBeDefined();
    expect(result.designCheck!.source).toBe('selected-payload');
    expect(distanceToNearestSupport).toBeLessThan(0.1);
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

  it('returns signed anchor loads with consistent global directions', () => {
    const result = service.calculateCable(createProject('parabolic', { maxLoad: 0 }));

    expect(result.anchorForces).toHaveLength(2);
    expect(result.anchorForces[0].horizontalSigned).toBeGreaterThan(0);
    expect(result.anchorForces[0].verticalSigned).toBeLessThan(0);
    expect(result.anchorForces[1].horizontalSigned).toBeLessThan(0);
    expect(result.anchorForces[1].verticalSigned).toBeLessThan(0);
  });

  it('returns support reactions as signed vector sums of adjacent span forces', () => {
    const project = createProject('parabolic', { maxLoad: 0 });
    project.supports = [
      {
        id: 'support-1',
        supportNumber: 1,
        stationLength: 50,
        terrainHeight: 0,
        supportHeight: 12,
        topElevation: 12
      }
    ];

    const result = service.calculateCable(project);

    expect(result.supportForces).toHaveLength(1);
    const support = result.supportForces[0];
    const leftSpan = result.spans.find(span => span.toSupport === 'support-1')!;
    const rightSpan = result.spans.find(span => span.fromSupport === 'support-1')!;
    expect(support.horizontalSigned).toBeCloseTo(
      leftSpan.horizontalForce - rightSpan.horizontalForce,
      6
    );
    expect(support.verticalSigned).toBeCloseTo(
      -(leftSpan.verticalForceEnd + rightSpan.verticalForceStart),
      6
    );
  });

  it('returns engineering-mode metadata and solver family', () => {
    const project = createProject('parabolic', { maxLoad: 1200 });
    project.calculationMode = 'engineering';
    project.solverType = 'global-elastic-catenary';

    const result = service.calculateCable(project);

    expect(result.calculationMode).toBe('engineering');
    expect(result.solverFamily).toBe('engineering');
    expect(result.method).toBe('global-elastic-catenary');
    expect(result.modelAssumptions.length).toBeGreaterThan(0);
  });

  it('exposes solved H, lengths and span extensions in engineering mode', () => {
    const project = createProject('parabolic', { maxLoad: 1200 });
    project.calculationMode = 'engineering';
    project.solverType = 'global-elastic-catenary';

    const result = service.calculateCable(project);

    expect(result.engineeringMetrics).toBeDefined();
    expect(result.engineeringMetrics?.solvedHorizontalForceKN).toBeGreaterThan(0);
    expect(result.engineeringMetrics?.referenceUnstretchedLengthM).toBeGreaterThan(0);
    expect(result.engineeringMetrics?.loadedStretchedLengthM).toBeGreaterThan(0);
    expect(result.engineeringMetrics?.spanExtensions).toHaveLength(result.spans.length);
    expect(result.engineeringMetrics?.spanExtensions[0].extensionM).toBeGreaterThanOrEqual(0);
  });

  it('changes engineering results when elastic modulus changes', () => {
    const softProject = createProject('parabolic', {
      maxLoad: 1200,
      elasticModulusKNPerMm2: 60
    });
    softProject.calculationMode = 'engineering';
    softProject.solverType = 'global-elastic-catenary';

    const stiffProject = createProject('parabolic', {
      maxLoad: 1200,
      elasticModulusKNPerMm2: 180
    });
    stiffProject.calculationMode = 'engineering';
    stiffProject.solverType = 'global-elastic-catenary';

    const softResult = service.calculateCable(softProject);
    const stiffResult = service.calculateCable(stiffProject);

    expect(Math.abs(softResult.maxHorizontalForce - stiffResult.maxHorizontalForce)).toBeGreaterThan(0.01);
  });

  it('changes engineering results when fill factor changes', () => {
    const lowFillProject = createProject('parabolic', {
      maxLoad: 1200,
      fillFactor: 0.45
    });
    lowFillProject.calculationMode = 'engineering';
    lowFillProject.solverType = 'global-elastic-catenary';

    const highFillProject = createProject('parabolic', {
      maxLoad: 1200,
      fillFactor: 0.85
    });
    highFillProject.calculationMode = 'engineering';
    highFillProject.solverType = 'global-elastic-catenary';

    const lowFillResult = service.calculateCable(lowFillProject);
    const highFillResult = service.calculateCable(highFillProject);

    expect(Math.abs(lowFillResult.maxHorizontalForce - highFillResult.maxHorizontalForce)).toBeGreaterThan(0.01);
  });

  it('changes engineering T_max when the selected load position changes globally', () => {
    const nearStartProject = createProject('parabolic', {
      maxLoad: 1200,
      loadPositionRatio: 0.15
    });
    nearStartProject.calculationMode = 'engineering';
    nearStartProject.solverType = 'global-elastic-catenary';
    nearStartProject.supports = [
      {
        id: 'support-1',
        supportNumber: 1,
        stationLength: 30,
        terrainHeight: 0,
        supportHeight: 10,
        topElevation: 10
      },
      {
        id: 'support-2',
        supportNumber: 2,
        stationLength: 75,
        terrainHeight: 0,
        supportHeight: 18,
        topElevation: 18
      }
    ];
    nearStartProject.endStation.stationLength = 120;
    nearStartProject.terrainProfile = {
      ...nearStartProject.terrainProfile,
      segments: [
        {
          id: 'seg-1',
          segmentNumber: 1,
          lengthMeters: 120,
          slopePercent: 0,
          stationLength: 120,
          terrainHeight: 0
        }
      ],
      totalLength: 120
    };

    const nearEndProject: Project = {
      ...nearStartProject,
      cableConfig: {
        ...nearStartProject.cableConfig,
        loadPositionRatio: 0.85
      }
    };

    const nearStartResult = service.calculateCable(nearStartProject);
    const nearEndResult = service.calculateCable(nearEndProject);

    expect(nearStartResult.maxTension).not.toBeCloseTo(nearEndResult.maxTension, 4);
  });

  it('evaluates a worst-case engineering design mode across the full line', () => {
    const project = createProject('parabolic', { maxLoad: 1200, loadPositionRatio: 0.5 });
    project.calculationMode = 'engineering';
    project.engineeringDesignMode = 'worst-case';
    project.solverType = 'global-elastic-catenary';
    project.supports = [
      {
        id: 'support-1',
        supportNumber: 1,
        stationLength: 30,
        terrainHeight: 0,
        supportHeight: 10,
        topElevation: 10
      },
      {
        id: 'support-2',
        supportNumber: 2,
        stationLength: 75,
        terrainHeight: 0,
        supportHeight: 18,
        topElevation: 18
      }
    ];
    project.endStation.stationLength = 120;
    project.terrainProfile = {
      ...project.terrainProfile,
      segments: [
        {
          id: 'seg-1',
          segmentNumber: 1,
          lengthMeters: 120,
          slopePercent: 0,
          stationLength: 120,
          terrainHeight: 0
        }
      ],
      totalLength: 120
    };

    const selectedResult = service.calculateCable({
      ...project,
      engineeringDesignMode: 'selected',
      cableConfig: {
        ...project.cableConfig,
        loadPositionRatio: 0.5
      }
    });
    const worstCaseResult = service.calculateCable(project);

    expect(worstCaseResult.designCheck?.source).toBe('worst-case-payload');
    expect(worstCaseResult.engineeringMetrics?.designMode).toBe('worst-case');
    expect(worstCaseResult.engineeringMetrics?.envelope?.sampledLoadCases).toBeGreaterThan(1);
    expect(worstCaseResult.maxTension).toBeGreaterThanOrEqual(selectedResult.maxTension);
  });

  it('classifies clearance warnings outside the active monitored range as info', () => {
    const project = createProject('parabolic', {
      maxLoad: 3000,
      minGroundClearance: 9
    });
    project.operationalEnvelope = {
      activeMonitoredRangeStartStation: 99,
      activeMonitoredRangeEndStation: 100
    };

    const result = service.calculateCable(project);
    const clearanceMessages = result.warnings.filter((warning) =>
      warning.message.includes('Bodenfreiheit')
    );

    expect(clearanceMessages.length).toBeGreaterThan(0);
    expect(clearanceMessages.some((warning) => warning.operationalRangeContext === 'outside-active-range')).toBe(true);
    expect(clearanceMessages.some((warning) => warning.severity === 'info')).toBe(true);
    expect(clearanceMessages.some((warning) => warning.operationalRangeContext === 'inside-active-range')).toBe(false);
  });
});
