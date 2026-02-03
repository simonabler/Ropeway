import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Project, ProjectMetadata, CableParameterSet } from '../../models';

/**
 * IndexedDB Service using Dexie.js
 * Provides offline storage for projects and presets
 */
@Injectable({
  providedIn: 'root'
})
export class IndexedDbService extends Dexie {
  // Define tables
  projects!: Table<Project, string>;
  cablePresets!: Table<CableParameterSet, string>;

  constructor() {
    super('SeilbahnDatabase');

    // Define schema
    this.version(1).stores({
      projects: 'id, name, createdAt, modifiedAt, status',
      cablePresets: 'id, name, isSystemPreset, createdAt'
    });
  }

  /**
   * Save or update a project
   */
  async saveProject(project: Project): Promise<void> {
    await this.projects.put(project);
  }

  /**
   * Load a project by ID
   */
  async loadProject(id: string): Promise<Project | undefined> {
    return await this.projects.get(id);
  }

  /**
   * Get all projects (metadata only for list view)
   */
  async listProjects(): Promise<ProjectMetadata[]> {
    const projects = await this.projects.toArray();
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      modifiedAt: p.modifiedAt,
      status: p.status,
      totalLength: p.terrainProfile?.totalLength,
      maxTension: p.calculationResult?.maxTension
    }));
  }

  /**
   * Delete a project
   */
  async deleteProject(id: string): Promise<void> {
    await this.projects.delete(id);
  }

  /**
   * Save or update a cable preset
   */
  async saveCablePreset(preset: CableParameterSet): Promise<void> {
    await this.cablePresets.put(preset);
  }

  /**
   * Load a cable preset by ID
   */
  async loadCablePreset(id: string): Promise<CableParameterSet | undefined> {
    return await this.cablePresets.get(id);
  }

  /**
   * Get all cable presets
   */
  async listCablePresets(): Promise<CableParameterSet[]> {
    return await this.cablePresets.toArray();
  }

  /**
   * Get only user-defined presets
   */
  async listUserPresets(): Promise<CableParameterSet[]> {
    return await this.cablePresets
      .where('isSystemPreset')
      .equals(0)
      .toArray();
  }

  /**
   * Get only system presets
   */
  async listSystemPresets(): Promise<CableParameterSet[]> {
    return await this.cablePresets
      .where('isSystemPreset')
      .equals(1)
      .toArray();
  }

  /**
   * Delete a cable preset (only user-defined)
   */
  async deleteCablePreset(id: string): Promise<void> {
    const preset = await this.cablePresets.get(id);
    if (preset && !preset.isSystemPreset) {
      await this.cablePresets.delete(id);
    } else {
      throw new Error('Cannot delete system preset');
    }
  }

  /**
   * Check storage quota
   */
  async checkStorageQuota(): Promise<{ used: number; available: number; percentage: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const available = estimate.quota || 0;
      const percentage = available > 0 ? (used / available) * 100 : 0;
      return { used, available, percentage };
    }
    return { used: 0, available: 0, percentage: 0 };
  }

  /**
   * Request persistent storage
   */
  async requestPersistentStorage(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
    return false;
  }

  /**
   * Check if storage is persisted
   */
  async isPersisted(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persisted) {
      return await navigator.storage.persisted();
    }
    return false;
  }
}
