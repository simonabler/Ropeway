import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectStateService } from '../../../services/state/project-state.service';

/**
 * Project Create Component
 * Form to create a new cable car project
 */
@Component({
  selector: 'app-project-create',
  imports: [CommonModule, FormsModule],
  templateUrl: './project-create.html',
  styleUrl: './project-create.scss',
  standalone: true
})
export class ProjectCreate {
  projectName = '';
  projectNotes = '';
  nameError = '';

  constructor(
    private projectStateService: ProjectStateService,
    private router: Router
  ) {}

  validateName(): boolean {
    if (!this.projectName.trim()) {
      this.nameError = 'Projektname ist erforderlich';
      return false;
    }
    if (this.projectName.length < 3) {
      this.nameError = 'Projektname muss mindestens 3 Zeichen lang sein';
      return false;
    }
    if (this.projectName.length > 50) {
      this.nameError = 'Projektname darf maximal 50 Zeichen lang sein';
      return false;
    }
    this.nameError = '';
    return true;
  }

  async createProject() {
    if (!this.validateName()) {
      return;
    }

    try {
      // Create new project via state service
      const newProject = this.projectStateService.createNewProject(this.projectName);

      // Update notes if provided
      if (this.projectNotes.trim()) {
        this.projectStateService.updateProjectMetadata({ notes: this.projectNotes });
      }

      // Save to IndexedDB
      await this.projectStateService.saveProject();

      // Navigate to project detail/workflow
      this.router.navigate(['/project', newProject.id]);
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Fehler beim Erstellen des Projekts');
    }
  }

  cancel() {
    this.router.navigate(['/projects']);
  }
}
