import { Project, Support } from '../../../models';

export type BenchmarkFixtureId =
  | 'planning-parabolic-single-span'
  | 'planning-catenary-single-span'
  | 'planning-piecewise-offset-load'
  | 'engineering-selected-multi-span'
  | 'engineering-worst-case-envelope';

export interface BenchmarkFixture {
  id: BenchmarkFixtureId;
  title: string;
  project: Project;
  expected: {
    method: Project['solverType'];
    calculationMode: Project['calculationMode'];
    minClearanceRange: [number, number];
    maxTensionRange: [number, number];
    designSource: 'selected-payload' | 'worst-case-payload';
    assumptionIncludes: string;
    spanCount: number;
  };
}

const createSupports = (): Support[] => [
  {
    id: 'support-1',
    supportNumber: 1,
    stationLength: 35,
    terrainHeight: 4,
    supportHeight: 10,
    topElevation: 14
  },
  {
    id: 'support-2',
    supportNumber: 2,
    stationLength: 78,
    terrainHeight: 7,
    supportHeight: 14,
    topElevation: 21
  }
];

const createBaseProject = (): Project => ({
  id: 'benchmark-project',
  name: 'Benchmark Project',
  createdAt: new Date('2026-04-18T00:00:00.000Z'),
  modifiedAt: new Date('2026-04-18T00:00:00.000Z'),
  status: 'draft',
  startPoint: { lat: 47, lng: 11 },
  endPoint: { lat: 47.001, lng: 11.01 },
  azimuth: 92,
  calculationMode: 'planning',
  engineeringDesignMode: 'selected',
  solverType: 'parabolic',
  terrainProfile: {
    segments: [
      {
        id: 'seg-1',
        segmentNumber: 1,
        lengthMeters: 40,
        slopePercent: 10,
        stationLength: 40,
        terrainHeight: 4
      },
      {
        id: 'seg-2',
        segmentNumber: 2,
        lengthMeters: 40,
        slopePercent: 7.5,
        stationLength: 80,
        terrainHeight: 7
      },
      {
        id: 'seg-3',
        segmentNumber: 3,
        lengthMeters: 40,
        slopePercent: 5,
        stationLength: 120,
        terrainHeight: 9
      }
    ],
    recordingMethod: 'manual',
    totalLength: 120,
    elevationChange: 9
  },
  supports: [],
  startStation: {
    type: 'start',
    stationLength: 0,
    terrainHeight: 0,
    anchorPoint: { heightAboveTerrain: 8 },
    groundClearance: 2,
    identifier: 'Startstation',
    derivationMode: 'manual'
  },
  endStation: {
    type: 'end',
    stationLength: 120,
    terrainHeight: 9,
    anchorPoint: { heightAboveTerrain: 8 },
    groundClearance: 2,
    identifier: 'Endstation',
    derivationMode: 'manual'
  },
  operationalEnvelope: {
    activeMonitoredRangeStartStation: 0,
    activeMonitoredRangeEndStation: 120
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
  }
});

export const buildBenchmarkFixtures = (): BenchmarkFixture[] => {
  const singleSpan = createBaseProject();
  singleSpan.terrainProfile = {
    segments: [
      {
        id: 'seg-flat',
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
  };
  singleSpan.endStation = {
    ...singleSpan.endStation,
    stationLength: 100,
    terrainHeight: 0
  };

  const parabolic: BenchmarkFixture = {
    id: 'planning-parabolic-single-span',
    title: 'Planung Parabel Einfeld-Lastfall',
    project: {
      ...singleSpan,
      solverType: 'parabolic',
      cableConfig: {
        ...singleSpan.cableConfig,
        maxLoad: 500,
        loadPositionRatio: 0.5
      }
    },
    expected: {
      method: 'parabolic',
      calculationMode: 'planning',
      minClearanceRange: [-5.5, -3.0],
      maxTensionRange: [15, 20],
      designSource: 'selected-payload',
      assumptionIncludes: 'pretension',
      spanCount: 1
    }
  };

  const catenary: BenchmarkFixture = {
    id: 'planning-catenary-single-span',
    title: 'Planung Kettenlinie Einfeld-Lastfall',
    project: {
      ...singleSpan,
      solverType: 'catenary',
      cableConfig: {
        ...singleSpan.cableConfig,
        maxLoad: 700,
        loadPositionRatio: 0.4
      }
    },
    expected: {
      method: 'catenary',
      calculationMode: 'planning',
      minClearanceRange: [-8.5, -5.0],
      maxTensionRange: [15, 21],
      designSource: 'selected-payload',
      assumptionIncludes: 'pretension',
      spanCount: 1
    }
  };

  const piecewise: BenchmarkFixture = {
    id: 'planning-piecewise-offset-load',
    title: 'Planung stueckweise Kettenlinie mit versetzter Punktlast',
    project: {
      ...singleSpan,
      solverType: 'catenary-piecewise',
      cableConfig: {
        ...singleSpan.cableConfig,
        maxLoad: 1200,
        loadPositionRatio: 0.25
      }
    },
    expected: {
      method: 'catenary-piecewise',
      calculationMode: 'planning',
      minClearanceRange: [-11.0, -8.0],
      maxTensionRange: [15, 24],
      designSource: 'selected-payload',
      assumptionIncludes: 'planning',
      spanCount: 1
    }
  };

  const engineeringBase = createBaseProject();
  engineeringBase.supports = createSupports();
  engineeringBase.calculationMode = 'engineering';
  engineeringBase.solverType = 'global-elastic-catenary';
  engineeringBase.cableConfig = {
    ...engineeringBase.cableConfig,
    maxLoad: 1200,
    loadPositionRatio: 0.35
  };

  const engineeringSelected: BenchmarkFixture = {
    id: 'engineering-selected-multi-span',
    title: 'Engineering Mehrfeld-Lastfall aktiv',
    project: {
      ...engineeringBase,
      engineeringDesignMode: 'selected'
    },
    expected: {
      method: 'global-elastic-catenary',
      calculationMode: 'engineering',
      minClearanceRange: [1.0, 8.0],
      maxTensionRange: [35, 45],
      designSource: 'selected-payload',
      assumptionIncludes: 'global',
      spanCount: 3
    }
  };

  const engineeringWorstCase: BenchmarkFixture = {
    id: 'engineering-worst-case-envelope',
    title: 'Engineering Worst-Case-Huellkurve',
    project: {
      ...engineeringBase,
      engineeringDesignMode: 'worst-case'
    },
    expected: {
      method: 'global-elastic-catenary',
      calculationMode: 'engineering',
      minClearanceRange: [1.0, 8.0],
      maxTensionRange: [45, 55],
      designSource: 'worst-case-payload',
      assumptionIncludes: 'global',
      spanCount: 3
    }
  };

  return [parabolic, catenary, piecewise, engineeringSelected, engineeringWorstCase];
};
