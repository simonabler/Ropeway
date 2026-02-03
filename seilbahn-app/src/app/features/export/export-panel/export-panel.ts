import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { PdfExportService } from '../../../services/export/pdf-export.service';
import { DxfExportService } from '../../../services/export/dxf-export.service';

/**
 * Export Panel Component
 * Provides export options for PDF, DXF, and JSON
 */
@Component({
  selector: 'app-export-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './export-panel.html',
  styleUrl: './export-panel.scss'
})
export class ExportPanel {
  // State
  readonly project;
  readonly isExporting = signal(false);
  readonly exportStatus = signal<string | null>(null);
  readonly lastExportType = signal<string | null>(null);

  constructor(
    private projectStateService: ProjectStateService,
    private pdfExportService: PdfExportService,
    private dxfExportService: DxfExportService
  ) {
    this.project = toSignal(this.projectStateService.project$, { initialValue: null });
  }

  /**
   * Export as PDF
   */
  async exportPdf(): Promise<void> {
    const project = this.project();
    if (!project) return;

    this.isExporting.set(true);
    this.exportStatus.set('PDF wird erstellt...');

    try {
      await this.pdfExportService.downloadReport(project);
      this.exportStatus.set('PDF erfolgreich exportiert!');
      this.lastExportType.set('pdf');
    } catch (error) {
      console.error('PDF export failed:', error);
      this.exportStatus.set('PDF-Export fehlgeschlagen');
    } finally {
      this.isExporting.set(false);
      setTimeout(() => this.exportStatus.set(null), 3000);
    }
  }

  /**
   * Export as DXF
   */
  exportDxf(): void {
    const project = this.project();
    if (!project) return;

    this.isExporting.set(true);
    this.exportStatus.set('DXF wird erstellt...');

    try {
      this.dxfExportService.downloadDxf(project);
      this.exportStatus.set('DXF erfolgreich exportiert!');
      this.lastExportType.set('dxf');
    } catch (error) {
      console.error('DXF export failed:', error);
      this.exportStatus.set('DXF-Export fehlgeschlagen');
    } finally {
      this.isExporting.set(false);
      setTimeout(() => this.exportStatus.set(null), 3000);
    }
  }

  /**
   * Export as JSON
   */
  exportJson(): void {
    const project = this.project();
    if (!project) return;

    this.isExporting.set(true);
    this.exportStatus.set('JSON wird erstellt...');

    try {
      const jsonData = JSON.stringify(project, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.sanitizeFilename(project.name)}_Daten.json`;
      link.click();
      URL.revokeObjectURL(url);

      this.exportStatus.set('JSON erfolgreich exportiert!');
      this.lastExportType.set('json');
    } catch (error) {
      console.error('JSON export failed:', error);
      this.exportStatus.set('JSON-Export fehlgeschlagen');
    } finally {
      this.isExporting.set(false);
      setTimeout(() => this.exportStatus.set(null), 3000);
    }
  }

  /**
   * Check if project has data for export
   */
  hasTerrainData(): boolean {
    const project = this.project();
    return (project?.terrainProfile?.segments?.length ?? 0) > 0;
  }

  /**
   * Check if calculation exists
   */
  hasCalculation(): boolean {
    return this.project()?.calculationResult !== null && this.project()?.calculationResult !== undefined;
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_');
  }
}
