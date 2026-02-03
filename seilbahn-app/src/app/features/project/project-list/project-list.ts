import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProjectMetadata } from '../../../models';
import { IndexedDbService } from '../../../services/storage/indexed-db.service';

/**
 * Project List Component
 * Displays all saved projects with metadata
 */
@Component({
  selector: 'app-project-list',
  imports: [CommonModule],
  templateUrl: './project-list.html',
  styleUrl: './project-list.scss',
  standalone: true
})
export class ProjectList implements OnInit {
  projects: ProjectMetadata[] = [];
  loading = signal(true);

  constructor(
    private indexedDbService: IndexedDbService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.loadProjects();
  }

  async loadProjects() {
    this.loading.set(true);
    try {
      this.projects = await this.indexedDbService.listProjects();
      // Sort by modified date (newest first)
      this.projects.sort((a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
      );
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      this.loading.set(false);
    }
  }

  createNewProject() {
    this.router.navigate(['/project/create']);
  }

  openProject(projectId: string) {
    this.router.navigate(['/project', projectId]);
  }

  async deleteProject(projectId: string, event: Event) {
    event.stopPropagation();

    if (confirm('Projekt wirklich löschen?')) {
      try {
        await this.indexedDbService.deleteProject(projectId);
        await this.loadProjects();
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'draft': 'Entwurf',
      'calculated': 'Berechnet',
      'exported': 'Exportiert'
    };
    return labels[status] || status;
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }
}
