import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { MapContainer } from '../../map/map-container/map-container';
import { TerrainInput } from '../../terrain/terrain-input/terrain-input';
import { SupportPlacement } from '../../support/support-placement/support-placement';
import { CableConfig } from '../../cable/cable-config/cable-config';
import { CalculationResults } from '../../calculation/calculation-results/calculation-results';
import { ProfileChart } from '../../visualization/profile-chart/profile-chart';
import { ExportPanel } from '../../export/export-panel/export-panel';
import { StationEditor } from '../../station/station-editor/station-editor';
import { OperationalEnvelopeEditor } from '../../operations/operational-envelope-editor/operational-envelope-editor';
import { GeoPoint } from '../../../models';

/**
 * Project Detail Component
 * Container for project workflow
 */
@Component({
  selector: 'app-project-detail',
  imports: [CommonModule, MapContainer, TerrainInput, SupportPlacement, CableConfig, CalculationResults, ProfileChart, ExportPanel, StationEditor, OperationalEnvelopeEditor],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.scss',
  standalone: true
})
export class ProjectDetail implements OnInit {
  // Signals for reactive state
  loading = signal(true);
  error = signal('');

  // Convert Observable to Signal (automatically manages subscription)
  project;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectStateService: ProjectStateService
  ) {
    // Initialize signal in constructor after services are injected
    this.project = toSignal(this.projectStateService.project$, { initialValue: null });
  }

  async ngOnInit() {
    const projectId = this.route.snapshot.paramMap.get('id');

    if (!projectId) {
      this.error.set('Keine Projekt-ID angegeben');
      this.loading.set(false);
      return;
    }

    try {
      await this.projectStateService.loadProject(projectId);
      this.loading.set(false);
    } catch (err) {
      console.error('Failed to load project:', err);
      this.error.set('Projekt konnte nicht geladen werden');
      this.loading.set(false);
    }
  }

  goBack() {
    this.router.navigate(['/projects']);
  }

  /**
   * Handle map points changed
   */
  onMapPointsChanged(event: { start: GeoPoint | null; end: GeoPoint | null; azimuth: number }): void {
    const currentProject = this.project();
    if (!currentProject) return;

    const currentStart = this.mapStartPoint;
    const currentEnd = this.mapEndPoint;
    const sameStart = this.samePoint(currentStart, event.start);
    const sameEnd = this.samePoint(currentEnd, event.end);
    const sameAzimuth = currentProject.azimuth === event.azimuth;

    if (sameStart && sameEnd && sameAzimuth) {
      return;
    }

    this.projectStateService.updateRouteGeometry(event.start, event.end);
  }

  get mapStartPoint(): GeoPoint | null {
    const point = this.project()?.startPoint;
    if (!point) return null;
    if (point.lat === 0 && point.lng === 0) return null;
    return point;
  }

  get mapEndPoint(): GeoPoint | null {
    return this.project()?.endPoint ?? null;
  }

  private samePoint(a: GeoPoint | null, b: GeoPoint | null): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.lat === b.lat && a.lng === b.lng;
  }
}
