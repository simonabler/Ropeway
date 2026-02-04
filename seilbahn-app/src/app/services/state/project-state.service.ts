import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  Project,
  TerrainSegment,
  Support,
  EndStation,
  CableConfiguration,
  CalculationResult,
  GeoPoint
} from '../../models';
import { IndexedDbService } from '../storage/indexed-db.service';

/**
 * Project State Service
 * Central state management for the application using RxJS
 */
@Injectable({
  providedIn: 'root'
})
export class ProjectStateService {
  // Private state (BehaviorSubjects)
  private currentProjectSubject = new BehaviorSubject<Project | null>(null);
  private terrainSegmentsSubject = new BehaviorSubject<TerrainSegment[]>([]);
  private supportsSubject = new BehaviorSubject<Support[]>([]);
  private calculationResultSubject = new BehaviorSubject<CalculationResult | null>(null);
  private selectedPresetIdSubject = new BehaviorSubject<string | null>(null);
  private isDirtySubject = new BehaviorSubject<boolean>(false);

  // Public observables
  readonly project$ = this.currentProjectSubject.asObservable();
  readonly terrain$ = this.terrainSegmentsSubject.asObservable();
  readonly supports$ = this.supportsSubject.asObservable();
  readonly calculation$ = this.calculationResultSubject.asObservable();
  readonly selectedPresetId$ = this.selectedPresetIdSubject.asObservable();
  readonly isDirty$ = this.isDirtySubject.asObservable();

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
      azimuth: 0,
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
        safetyFactor: 5,
        minGroundClearance: 2,
        cableDiameterMm: 16,
        minBreakingStrengthNPerMm2: 1960,
        cableMaterial: 'steel'
      }
    };

    this.currentProjectSubject.next(newProject);
    this.terrainSegmentsSubject.next([]);
    this.supportsSubject.next([]);
    this.calculationResultSubject.next(null);
    this.isDirtySubject.next(true);

    return newProject;
  }

  /**
   * Load a project from IndexedDB
   */
  async loadProject(id: string): Promise<void> {
    const project = await this.indexedDbService.loadProject(id);
    if (project) {
      this.currentProjectSubject.next(project);
      this.terrainSegmentsSubject.next(project.terrainProfile.segments);
      this.supportsSubject.next(project.supports);
      this.calculationResultSubject.next(project.calculationResult || null);
      this.selectedPresetIdSubject.next(project.cablePresetId || null);
      this.isDirtySubject.next(false);
    }
  }

  /**
   * Save current project to IndexedDB
   */
  async saveProject(): Promise<void> {
    const project = this.currentProjectSubject.value;
    if (project) {
      project.modifiedAt = new Date();
      await this.indexedDbService.saveProject(project);
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
    this.terrainSegmentsSubject.next(segments);
    const project = this.currentProjectSubject.value;
    if (project) {
      project.terrainProfile.segments = segments;
      project.terrainProfile.totalLength = this.calculateTotalLength(segments);
      project.terrainProfile.elevationChange = this.calculateElevationChange(segments);
      this.currentProjectSubject.next(project);
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
    this.supportsSubject.next(supports);
    const project = this.currentProjectSubject.value;
    if (project) {
      project.supports = supports;
      this.currentProjectSubject.next(project);
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
      project.cableConfig = config;
      this.currentProjectSubject.next(project);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Set calculation result
   */
  setCalculationResult(result: CalculationResult): void {
    this.calculationResultSubject.next(result);
    const project = this.currentProjectSubject.value;
    if (project) {
      project.calculationResult = result;
      project.status = result.isValid ? 'calculated' : 'draft';
      this.currentProjectSubject.next(project);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Apply a cable preset
   */
  applyCablePreset(presetId: string): void {
    this.selectedPresetIdSubject.next(presetId);
    const project = this.currentProjectSubject.value;
    if (project) {
      project.cablePresetId = presetId;
      this.currentProjectSubject.next(project);
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
      project.cablePresetId = presetId || undefined;
      this.currentProjectSubject.next(project);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Update project metadata
   */
  updateProjectMetadata(updates: Partial<Pick<Project, 'name' | 'notes'>>): void {
    const project = this.currentProjectSubject.value;
    if (project) {
      Object.assign(project, updates);
      this.currentProjectSubject.next(project);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Update start point and azimuth (from map)
   */
  updateStartPointAndAzimuth(startPoint: GeoPoint, azimuth: number): void {
    const project = this.currentProjectSubject.value;
    if (project) {
      project.startPoint = startPoint;
      project.azimuth = azimuth;
      this.currentProjectSubject.next(project);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Update start point only
   */
  updateStartPoint(startPoint: GeoPoint): void {
    const project = this.currentProjectSubject.value;
    if (project) {
      project.startPoint = startPoint;
      this.currentProjectSubject.next(project);
      this.isDirtySubject.next(true);
    }
  }

  /**
   * Update azimuth only
   */
  updateAzimuth(azimuth: number): void {
    const project = this.currentProjectSubject.value;
    if (project) {
      project.azimuth = azimuth;
      this.currentProjectSubject.next(project);
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
    const firstHeight = segments[0].terrainHeight;
    const lastHeight = segments[segments.length - 1].terrainHeight;
    return lastHeight - firstHeight;
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
    this.selectedPresetIdSubject.next(null);
    this.isDirtySubject.next(false);
  }
}
