import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  Project,
  TerrainSegment,
  Support,
  EndStation,
  CableConfiguration,
  CalculationOverrides,
  CalculationResult,
  GeoPoint,
  CalculationMode,
  EngineeringDesignMode,
  EngineeringSolverType,
  PlanningSolverType,
  SolverType
} from '../../models';
import { IndexedDbService } from '../storage/indexed-db.service';
import { calculateBearing, calculateDestination, hasGeoPoint } from '../geo/route-geometry';

/**
 * Project State Service
 * Central state management for the application using RxJS
 */
@Injectable({
  providedIn: 'root'
})
export class ProjectStateService {
  private readonly defaultPlanningSolver: PlanningSolverType = 'parabolic';
  private readonly defaultEngineeringSolver: EngineeringSolverType = 'global-elastic-catenary';

  // Private state (BehaviorSubjects)
  private currentProjectSubject = new BehaviorSubject<Project | null>(null);
  private terrainSegmentsSubject = new BehaviorSubject<TerrainSegment[]>([]);
  private supportsSubject = new BehaviorSubject<Support[]>([]);
  private calculationResultSubject = new BehaviorSubject<CalculationResult | null>(null);
  private calculationOverridesSubject = new BehaviorSubject<CalculationOverrides>({});
  private selectedPresetIdSubject = new BehaviorSubject<string | null>(null);
  private isDirtySubject = new BehaviorSubject<boolean>(false);

  // Public observables
  readonly project$ = this.currentProjectSubject.asObservable();
  readonly terrain$ = this.terrainSegmentsSubject.asObservable();
  readonly supports$ = this.supportsSubject.asObservable();
  readonly calculation$ = this.calculationResultSubject.asObservable();
  readonly calculationOverrides$ = this.calculationOverridesSubject.asObservable();
  readonly selectedPresetId$ = this.selectedPresetIdSubject.asObservable();
  readonly isDirty$ = this.isDirtySubject.asObservable();
  readonly effectiveProject$ = combineLatest([
    this.currentProjectSubject,
    this.calculationOverridesSubject
  ]).pipe(
    map(([project, overrides]) => this.buildEffectiveProject(project, overrides))
  );

  // Computed observables
  readonly isCalculated$ = this.calculationResultSubject.pipe(
    map(result => result?.isValid ?? false)
  );

  readonly hasWarnings$ = this.calculationResultSubject.pipe(
    map(result => (result?.warnings?.length ?? 0) > 0)
  );

  readonly presetModified$ = combineLatest([
    this.currentProjectSubject,
    this.selectedPresetIdSubject
  ]).pipe(
    map(([project, presetId]) => {
      if (!project || !presetId) return false;
      // TODO: Implement comparison logic
      return false;
    })
  );

  // Getters for current values
  get currentProject(): Project | null {
    return this.currentProjectSubject.value;
  }

  get currentEffectiveProject(): Project | null {
    return this.buildEffectiveProject(
      this.currentProjectSubject.value,
      this.calculationOverridesSubject.value
    );
  }

  get calculationOverrides(): CalculationOverrides {
    return this.calculationOverridesSubject.value;
  }

  get hasCalculationOverrides(): boolean {
    return Object.keys(this.calculationOverridesSubject.value).length > 0;
  }

  get currentTerrain(): TerrainSegment[] {
    return this.terrainSegmentsSubject.value;
  }

  constructor(private indexedDbService: IndexedDbService) {
    // Auto-save on changes (debounced 2 seconds)
    combineLatest([
      this.currentProjectSubject,
      this.terrainSegmentsSubject,
      this.supportsSubject,
      this.calculationResultSubject
    ])
      .pipe(
        debounceTime(2000),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.autoSave();
      });
  }

  /**
   * Create a new project
   */
  createNewProject(name: string): Project {
    const newProject: Project = {
      id: this.generateUUID(),
      name,
      createdAt: new Date(),
      modifiedAt: new Date(),
      status: 'draft',
      startPoint: { lat: 0, lng: 0 },
      endPoint: null,
      azimuth: 0,
      calculationMode: 'planning',
      engineeringDesignMode: 'selected',
      solverType: this.defaultPlanningSolver,
      terrainProfile: {
        segments: [],
        recordingMethod: 'manual',
        totalLength: 0,
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
      }
    };

    this.currentProjectSubject.next(newProject);
    this.terrainSegmentsSubject.next([]);
    this.supportsSubject.next([]);
    this.calculationResultSubject.next(null);
    this.calculationOverridesSubject.next({});
    this.isDirtySubject.next(true);

    return newProject;
  }

  /**
   * Load a project from IndexedDB
   */
  async loadProject(id: string): Promise<void> {
    const project = await this.indexedDbService.loadProject(id);
    if (project) {
      const normalizedProject = this.normalizeLoadedProject(project);
      this.currentProjectSubject.next(normalizedProject);
      this.terrainSegmentsSubject.next(normalizedProject.terrainProfile.segments);
      this.supportsSubject.next(normalizedProject.supports);
      this.calculationResultSubject.next(normalizedProject.calculationResult || null);
      this.calculationOverridesSubject.next({});
      this.selectedPresetIdSubject.next(normalizedProject.cablePresetId || null);
      this.isDirtySubject.next(false);

      if (normalizedProject !== project) {
        await this.indexedDbService.saveProject(normalizedProject);
      }
    }
  }

  /**
   * Save current project to IndexedDB
   */
  async saveProject(): Promise<void> {
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        modifiedAt: new Date()
      };
      this.currentProjectSubject.next(updatedProject);
      await this.indexedDbService.saveProject(updatedProject);
      this.isDirtySubject.next(false);
    }
  }

  /**
   * Auto-save (debounced)
   */
  private async autoSave(): Promise<void> {
    if (this.isDirtySubject.value) {
      await this.saveProject();
    }
  }

  /**
   * Update terrain segments
   */
  updateTerrainSegments(segments: TerrainSegment[]): void {
    const updatedSegments = [...segments];
    this.terrainSegmentsSubject.next(updatedSegments);
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        terrainProfile: {
          ...project.terrainProfile,
          segments: updatedSegments,
          totalLength: this.calculateTotalLength(updatedSegments),
          elevationChange: this.calculateElevationChange(updatedSegments)
        }
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Add a support
   */
  addSupport(support: Support): void {
    const supports = [...this.supportsSubject.value, support];
    this.updateSupports(supports);
  }

  /**
   * Update supports
   */
  updateSupports(supports: Support[]): void {
    const updatedSupports = [...supports];
    this.supportsSubject.next(updatedSupports);
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        supports: updatedSupports
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Remove a support
   */
  removeSupport(supportId: string): void {
    const supports = this.supportsSubject.value.filter(s => s.id !== supportId);
    this.updateSupports(supports);
  }

  /**
   * Update cable configuration
   */
  updateCableConfig(config: CableConfiguration): void {
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        cableConfig: {
          ...config,
          loadPositionRatio: this.normalizeLoadPositionRatio(config.loadPositionRatio),
          elasticModulusKNPerMm2: this.normalizeElasticModulus(config.elasticModulusKNPerMm2),
          fillFactor: this.normalizeFillFactor(config.fillFactor)
        }
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  updateCalculationMode(calculationMode: CalculationMode): void {
    const project = this.currentProjectSubject.value;
    if (!project) return;

    const normalizedSolverType = this.normalizeSolverForMode(project.solverType, calculationMode);
    const updatedProject: Project = {
      ...project,
      calculationMode,
      engineeringDesignMode: project.engineeringDesignMode ?? 'selected',
      solverType: normalizedSolverType
    };
    this.currentProjectSubject.next(updatedProject);
    this.isDirtySubject.next(true);
  }

  updateEngineeringDesignMode(engineeringDesignMode: EngineeringDesignMode): void {
    const project = this.currentProjectSubject.value;
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      engineeringDesignMode
    };
    this.currentProjectSubject.next(updatedProject);
    this.isDirtySubject.next(true);
  }

  /**
   * Update solver type
   */
  updateSolverType(solverType: Project['solverType']): void {
    const project = this.currentProjectSubject.value;
    if (project) {
      const calculationMode = project.calculationMode ?? 'planning';
      const updatedProject: Project = {
        ...project,
        solverType: this.normalizeSolverForMode(solverType, calculationMode)
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Set calculation result
   */
  setCalculationResult(result: CalculationResult): void {
    const effectiveProject = this.currentEffectiveProject;
    const decoratedResult: CalculationResult = effectiveProject
      ? {
          ...result,
          calculationMode: effectiveProject.calculationMode ?? 'planning',
          solverFamily: effectiveProject.calculationMode ?? 'planning',
          activeLoadCase: {
            horizontalTensionKN: effectiveProject.cableConfig.horizontalTensionKN,
            maxLoadKg: effectiveProject.cableConfig.maxLoad,
            loadPositionRatio: this.normalizeLoadPositionRatio(effectiveProject.cableConfig.loadPositionRatio),
            hasOverrides: this.hasCalculationOverrides
          }
        }
      : result;

    this.calculationResultSubject.next(decoratedResult);
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        calculationResult: decoratedResult,
        status: decoratedResult.isValid ? 'calculated' : 'draft'
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  setCalculationOverride(overrides: Partial<CalculationOverrides>): void {
    const nextOverrides: CalculationOverrides = {
      ...this.calculationOverridesSubject.value
    };

    if (overrides.horizontalTensionKN === undefined) {
      delete nextOverrides.horizontalTensionKN;
    } else {
      nextOverrides.horizontalTensionKN = overrides.horizontalTensionKN;
    }

    if (overrides.maxLoad === undefined) {
      delete nextOverrides.maxLoad;
    } else {
      nextOverrides.maxLoad = overrides.maxLoad;
    }

    if (overrides.loadPositionRatio === undefined) {
      delete nextOverrides.loadPositionRatio;
    } else {
      nextOverrides.loadPositionRatio = this.normalizeLoadPositionRatio(overrides.loadPositionRatio);
    }

    this.calculationOverridesSubject.next(nextOverrides);
  }

  clearCalculationOverrides(): void {
    this.calculationOverridesSubject.next({});
  }

  /**
   * Apply a cable preset
   */
  applyCablePreset(presetId: string): void {
    this.selectedPresetIdSubject.next(presetId);
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        cablePresetId: presetId
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Set selected preset ID (without applying)
   */
  setSelectedPresetId(presetId: string | null): void {
    this.selectedPresetIdSubject.next(presetId);
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        cablePresetId: presetId || undefined
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Update project metadata
   */
  updateProjectMetadata(updates: Partial<Pick<Project, 'name' | 'notes'>>): void {
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        ...updates
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  updateRouteGeometry(startPoint: GeoPoint | null, endPoint: GeoPoint | null): void {
    const project = this.currentProjectSubject.value;
    if (!project) return;

    const normalizedStartPoint = startPoint ?? { lat: 0, lng: 0 };
    const normalizedEndPoint =
      hasGeoPoint(normalizedStartPoint) && hasGeoPoint(endPoint)
        ? endPoint
        : null;
    const azimuth =
      hasGeoPoint(normalizedStartPoint) && normalizedEndPoint
        ? calculateBearing(normalizedStartPoint, normalizedEndPoint)
        : 0;

    const updatedProject: Project = {
      ...project,
      startPoint: normalizedStartPoint,
      endPoint: normalizedEndPoint,
      azimuth
    };

    this.currentProjectSubject.next(updatedProject);
    this.isDirtySubject.next(true);
    void this.saveProject();
  }

  /**
   * Update start point and azimuth (legacy compatibility shim)
   */
  updateStartPointAndAzimuth(startPoint: GeoPoint, azimuth: number): void {
    const project = this.currentProjectSubject.value;
    if (!project) return;

    const totalLength = project.terrainProfile.totalLength;
    const endPoint =
      hasGeoPoint(startPoint) && totalLength > 0
        ? calculateDestination(startPoint, azimuth, totalLength)
        : null;

    this.updateRouteGeometry(hasGeoPoint(startPoint) ? startPoint : null, endPoint);
  }

  /**
   * Update start point only
   */
  updateStartPoint(startPoint: GeoPoint): void {
    const project = this.currentProjectSubject.value;
    if (!project) return;

    this.updateRouteGeometry(startPoint, project.endPoint);
  }

  /**
   * Update azimuth only
   */
  updateAzimuth(azimuth: number): void {
    const project = this.currentProjectSubject.value;
    if (!project || !hasGeoPoint(project.startPoint)) return;

    const endPoint =
      project.terrainProfile.totalLength > 0
        ? calculateDestination(project.startPoint, azimuth, project.terrainProfile.totalLength)
        : null;

    this.updateRouteGeometry(project.startPoint, endPoint);
  }

  /**
   * Update end station data
   */
  updateEndStation(updates: Partial<EndStation>): void {
    const project = this.currentProjectSubject.value;
    if (project) {
      const updatedProject: Project = {
        ...project,
        endStation: {
          ...project.endStation,
          ...updates
        }
      };
      this.currentProjectSubject.next(updatedProject);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Calculate total length from segments
   */
  private calculateTotalLength(segments: TerrainSegment[]): number {
    return segments.reduce((sum, seg) => sum + seg.lengthMeters, 0);
  }

  /**
   * Calculate elevation change from segments
   */
  private calculateElevationChange(segments: TerrainSegment[]): number {
    if (segments.length === 0) return 0;
    const firstHeight = segments[0].terrainHeight - (segments[0].slopePercent / 100) * segments[0].lengthMeters;
    const lastHeight = segments[segments.length - 1].terrainHeight;
    return lastHeight - firstHeight;
  }

  private normalizeLoadedProject(project: Project): Project {
    const routeBackfilled = !('endPoint' in project) || project.endPoint === undefined;
    const normalizedStartPoint = hasGeoPoint(project.startPoint) ? project.startPoint : { lat: 0, lng: 0 };
    const derivedEndPoint =
      routeBackfilled &&
      hasGeoPoint(normalizedStartPoint) &&
      project.terrainProfile.totalLength > 0
        ? calculateDestination(normalizedStartPoint, project.azimuth, project.terrainProfile.totalLength)
        : null;

    const normalizedEndPoint = project.endPoint ?? derivedEndPoint ?? null;
    const normalizedAzimuth =
      hasGeoPoint(normalizedStartPoint) && normalizedEndPoint
        ? calculateBearing(normalizedStartPoint, normalizedEndPoint)
        : 0;

    const normalizedProject: Project = {
      ...project,
      calculationMode: project.calculationMode ?? 'planning',
      engineeringDesignMode: project.engineeringDesignMode ?? 'selected',
      startPoint: normalizedStartPoint,
      endPoint: normalizedEndPoint,
      azimuth: normalizedAzimuth,
      cableConfig: {
        ...project.cableConfig,
        loadPositionRatio: this.normalizeLoadPositionRatio(project.cableConfig.loadPositionRatio),
        elasticModulusKNPerMm2: this.normalizeElasticModulus(project.cableConfig.elasticModulusKNPerMm2),
        fillFactor: this.normalizeFillFactor(project.cableConfig.fillFactor)
      }
    };

    normalizedProject.solverType = this.normalizeSolverForMode(
      project.solverType,
      normalizedProject.calculationMode ?? 'planning'
    );

    const endPointChanged =
      (project.endPoint ?? null) !== normalizedEndPoint;
    const cableConfigNormalized =
      project.cableConfig.loadPositionRatio !== normalizedProject.cableConfig.loadPositionRatio ||
      project.cableConfig.elasticModulusKNPerMm2 !== normalizedProject.cableConfig.elasticModulusKNPerMm2 ||
      project.cableConfig.fillFactor !== normalizedProject.cableConfig.fillFactor;
    const calculationModeChanged =
      project.calculationMode !== normalizedProject.calculationMode;
    const engineeringDesignModeChanged =
      project.engineeringDesignMode !== normalizedProject.engineeringDesignMode;
    const solverChanged = project.solverType !== normalizedProject.solverType;

    if (
      !routeBackfilled &&
      !endPointChanged &&
      project.azimuth === normalizedAzimuth &&
      !cableConfigNormalized &&
      !calculationModeChanged &&
      !engineeringDesignModeChanged &&
      !solverChanged
    ) {
      return project;
    }

    return normalizedProject;
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

  /**
   * Clear current project
   */
  clearProject(): void {
    this.currentProjectSubject.next(null);
    this.terrainSegmentsSubject.next([]);
    this.supportsSubject.next([]);
    this.calculationResultSubject.next(null);
    this.calculationOverridesSubject.next({});
    this.selectedPresetIdSubject.next(null);
    this.isDirtySubject.next(false);
  }

  private buildEffectiveProject(
    project: Project | null,
    overrides: CalculationOverrides
  ): Project | null {
    if (!project) return null;

    return {
      ...project,
      cableConfig: {
        ...project.cableConfig,
        horizontalTensionKN: overrides.horizontalTensionKN ?? project.cableConfig.horizontalTensionKN,
        maxLoad: overrides.maxLoad ?? project.cableConfig.maxLoad,
        loadPositionRatio: this.normalizeLoadPositionRatio(
          overrides.loadPositionRatio ?? project.cableConfig.loadPositionRatio
        ),
        elasticModulusKNPerMm2: this.normalizeElasticModulus(project.cableConfig.elasticModulusKNPerMm2),
        fillFactor: this.normalizeFillFactor(project.cableConfig.fillFactor)
      }
    };
  }

  private normalizeLoadPositionRatio(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0.5;
    }

    return Math.min(Math.max(value, 0.05), 0.95);
  }

  private normalizeElasticModulus(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 100;
    }

    return Math.min(Math.max(value, 10), 400);
  }

  private normalizeFillFactor(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0.7;
    }

    return Math.min(Math.max(value, 0.2), 1);
  }

  private normalizeSolverForMode(
    solverType: SolverType | undefined,
    mode: CalculationMode
  ): SolverType {
    if (mode === 'engineering') {
      return solverType === 'global-elastic-catenary'
        ? solverType
        : this.defaultEngineeringSolver;
    }

    if (
      solverType === 'parabolic' ||
      solverType === 'catenary' ||
      solverType === 'catenary-piecewise'
    ) {
      return solverType;
    }

    return this.defaultPlanningSolver;
  }
}
