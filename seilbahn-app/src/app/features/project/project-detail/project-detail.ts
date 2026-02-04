import { Component, OnInit, signal, computed } from '@angular/core';
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
import { Project, GeoPoint } from '../../../models';

/**
 * Project Detail Component
 * Container for project workflow
 */
@Component({
  selector: 'app-project-detail',
  imports: [CommonModule, MapContainer, TerrainInput, SupportPlacement, CableConfig, CalculationResults, ProfileChart, ExportPanel],
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
  onMapPointsChanged(event: { start: GeoPoint | null; azimuth: number }): void {
    if (event.start) {
      this.projectStateService.updateStartPointAndAzimuth(event.start, event.azimuth);
    } else {
      this.projectStateService.updateStartPointAndAzimuth({ lat: 0, lng: 0 }, 0);
    }
  }
}
