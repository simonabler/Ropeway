import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { Project, TerrainSegment, Support, CalculationResult, SpanResult } from '../../models';

/**
 * PDF Export Service
 * Generates multi-page PDF reports for cable car projects
 */
@Injectable({
  providedIn: 'root'
})
export class PdfExportService {
  private readonly pageWidth = 210; // A4 width in mm
  private readonly pageHeight = 297; // A4 height in mm
  private readonly margin = 20;
  private readonly contentWidth = 170;

  /**
   * Generate complete project PDF report
   */
  async generateReport(project: Project, plotImage?: string | null): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let pageNum = 1;

    // Page 1: Cover & Summary
    this.addCoverPage(doc, project, pageNum);

    // Page 2: Terrain Profile Data
    doc.addPage();
    pageNum += 1;
    this.addTerrainPage(doc, project, pageNum);

    // Optional: Plot image page
    if (plotImage) {
      doc.addPage();
      pageNum += 1;
      this.addPlotPage(doc, plotImage, pageNum);
    }

    // Support Data
    if (project.supports.length > 0) {
      doc.addPage();
      pageNum += 1;
      this.addSupportPage(doc, project, pageNum);
    }

    // Calculation Results
    if (project.calculationResult) {
      doc.addPage();
      pageNum += 1;
      this.addCalculationPage(doc, project, pageNum);
    }

    // Cable Parameters
    doc.addPage();
    pageNum += 1;
    this.addCableParametersPage(doc, project, pageNum);

    return doc.output('blob');
  }

  /**
   * Download PDF directly
   */
  async downloadReport(project: Project, plotImage?: string | null): Promise<void> {
    const blob = await this.generateReport(project, plotImage);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.sanitizeFilename(project.name)}_Bericht.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Page 1: Cover Page with Summary
   */
  private addCoverPage(doc: jsPDF, project: Project, pageNum: number): void {
    let y = this.margin;

    // Title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Materialseilbahn', this.margin, y + 10);
    doc.text('Vorplanungsbericht', this.margin, y + 22);

    y += 45;

    // Project name
    doc.setFontSize(18);
    doc.setFont('helvetica', 'normal');
    doc.text(project.name, this.margin, y);

    y += 15;

    // Horizontal line
    doc.setDrawColor(100, 100, 100);
    doc.line(this.margin, y, this.pageWidth - this.margin, y);

    y += 15;

    // Project info
    doc.setFontSize(11);
    const infoLines = [
      ['Erstellt:', this.formatDate(project.createdAt)],
      ['Geändert:', this.formatDate(project.modifiedAt)],
      ['Status:', this.getStatusText(project.status)],
    ];

    if (project.startPoint.lat !== 0 || project.startPoint.lng !== 0) {
      infoLines.push(['Startpunkt:', `${project.startPoint.lat.toFixed(5)}, ${project.startPoint.lng.toFixed(5)}`]);
      infoLines.push(['Azimut:', `${project.azimuth}°`]);
    }

    for (const [label, value] of infoLines) {
      doc.setFont('helvetica', 'bold');
      doc.text(label, this.margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, this.margin + 35, y);
      y += 7;
    }

    y += 10;

    // Summary KPIs
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Zusammenfassung', this.margin, y);
    y += 10;

    doc.setFontSize(11);
    const terrain = project.terrainProfile;
    const calc = project.calculationResult;

    const kpis = [
      ['Gesamtlänge:', `${terrain.totalLength.toFixed(1)} m`],
      ['Höhendifferenz:', `${terrain.elevationChange.toFixed(1)} m`],
      ['Anzahl Stützen:', `${project.supports.length}`],
      ['Terrain-Segmente:', `${terrain.segments.length}`],
    ];

    if (calc) {
      kpis.push(['Max. Seilzug (Tmax):', `${calc.maxTension.toFixed(2)} kN`]);
      kpis.push(['Max. Horizontalkraft:', `${calc.maxHorizontalForce.toFixed(2)} kN`]);
      kpis.push(['Seildurchmesser:', `${calc.cableCapacityCheck.cableDiameterMm} mm`]);
      kpis.push(['Seilauslastung:', `${calc.cableCapacityCheck.utilizationPercent.toFixed(0)}%`]);

      // Find minimum clearance
      const minClearance = Math.min(...calc.spans.map(s => s.minClearance));
      kpis.push(['Min. Bodenfreiheit:', `${minClearance.toFixed(2)} m`]);
    }

    for (const [label, value] of kpis) {
      doc.setFont('helvetica', 'bold');
      doc.text(label, this.margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, this.margin + 50, y);
      y += 7;
    }

    // Notes
    if (project.notes) {
      y += 10;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Notizen:', this.margin, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(project.notes, this.contentWidth);
      doc.text(noteLines, this.margin, y);
    }

    // Footer
    this.addFooter(doc, pageNum);
  }

  /**
   * Page 2: Terrain Profile Data
   */
  private addTerrainPage(doc: jsPDF, project: Project, pageNum: number): void {
    let y = this.margin;

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Geländeprofil', this.margin, y);
    y += 12;

    const segments = project.terrainProfile.segments;

    if (segments.length === 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Keine Terrain-Daten vorhanden.', this.margin, y);
      this.addFooter(doc, pageNum);
      return;
    }

    // Table header
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const headers = ['Nr.', 'Länge (m)', 'Steigung (%)', 'Station (m)', 'Höhe (m)'];
    const colWidths = [15, 30, 35, 35, 35];
    let x = this.margin;

    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x, y);
      x += colWidths[i];
    }

    y += 5;
    doc.setDrawColor(150, 150, 150);
    doc.line(this.margin, y, this.pageWidth - this.margin, y);
    y += 5;

    // Table rows
    doc.setFont('helvetica', 'normal');
    for (const seg of segments) {
      if (y > this.pageHeight - 30) {
        doc.addPage();
        y = this.margin;
        // Repeat header
        doc.setFont('helvetica', 'bold');
        x = this.margin;
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], x, y);
          x += colWidths[i];
        }
        y += 5;
        doc.line(this.margin, y, this.pageWidth - this.margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
      }

      x = this.margin;
      doc.text(String(seg.segmentNumber), x, y);
      x += colWidths[0];
      doc.text(seg.lengthMeters.toFixed(1), x, y);
      x += colWidths[1];
      doc.text(seg.slopePercent.toFixed(1), x, y);
      x += colWidths[2];
      doc.text(seg.stationLength.toFixed(1), x, y);
      x += colWidths[3];
      doc.text(seg.terrainHeight.toFixed(2), x, y);
      y += 6;
    }

    this.addFooter(doc, pageNum);
  }

  /**
   * Page 3: Support Data
   */
  private addSupportPage(doc: jsPDF, project: Project, pageNum: number): void {
    let y = this.margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Stützen', this.margin, y);
    y += 12;

    const supports = project.supports.sort((a, b) => a.stationLength - b.stationLength);

    // Table header
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const headers = ['Nr.', 'Station (m)', 'Gelände (m)', 'Höhe (m)', 'Oberkante (m)'];
    const colWidths = [15, 30, 35, 30, 35];
    let x = this.margin;

    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x, y);
      x += colWidths[i];
    }

    y += 5;
    doc.line(this.margin, y, this.pageWidth - this.margin, y);
    y += 5;

    // Table rows
    doc.setFont('helvetica', 'normal');
    for (const sup of supports) {
      x = this.margin;
      doc.text(String(sup.supportNumber), x, y);
      x += colWidths[0];
      doc.text(sup.stationLength.toFixed(1), x, y);
      x += colWidths[1];
      doc.text(sup.terrainHeight.toFixed(2), x, y);
      x += colWidths[2];
      doc.text(sup.supportHeight.toFixed(1), x, y);
      x += colWidths[3];
      doc.text(sup.topElevation.toFixed(2), x, y);
      y += 6;
    }

    this.addFooter(doc, pageNum);
  }

  /**
   * Page 4: Calculation Results
   */
  private addCalculationPage(doc: jsPDF, project: Project, pageNum: number): void {
    const calc = project.calculationResult;
    if (!calc) return;

    let y = this.margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Berechnungsergebnisse', this.margin, y);
    y += 12;

    // Global results
    doc.setFontSize(12);
    doc.text('Globale Ergebnisse', this.margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const globalResults = [
      ['Berechnungsmethode:', calc.method === 'parabolic' ? 'Parabel-Näherung' : calc.method === 'catenary-piecewise' ? 'Kettenlinie (stückweise)' : 'Kettenlinie'],
      ['Max. Seilzugkraft (Tmax):', `${calc.maxTension.toFixed(2)} kN`],
      ['Max. Horizontalkraft (H):', `${calc.maxHorizontalForce.toFixed(2)} kN`],
      ['Seildurchmesser:', `${calc.cableCapacityCheck.cableDiameterMm} mm`],
      ['Seilauslastung:', `${calc.cableCapacityCheck.utilizationPercent.toFixed(0)}% (${calc.cableCapacityCheck.status === 'ok' ? 'OK' : calc.cableCapacityCheck.status === 'warning' ? 'Warnung' : 'Überlastet'})`],
      ['Berechnung gültig:', calc.isValid ? 'Ja' : 'Nein'],
    ];

    for (const [label, value] of globalResults) {
      doc.setFont('helvetica', 'bold');
      doc.text(label, this.margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, this.margin + 60, y);
      y += 6;
    }

    y += 10;

    // Span results table
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Spannfeld-Ergebnisse', this.margin, y);
    y += 8;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const headers = ['Feld', 'Länge', 'Δh', 'H (kN)', 'Tmax (kN)', 'Clearance'];
    const colWidths = [20, 25, 25, 28, 28, 30];
    let x = this.margin;

    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x, y);
      x += colWidths[i];
    }

    y += 4;
    doc.line(this.margin, y, this.pageWidth - this.margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    for (const span of calc.spans) {
      x = this.margin;
      doc.text(String(span.spanNumber), x, y);
      x += colWidths[0];
      doc.text(`${span.spanLength.toFixed(1)} m`, x, y);
      x += colWidths[1];
      doc.text(`${span.heightDifference.toFixed(1)} m`, x, y);
      x += colWidths[2];
      doc.text(span.horizontalForce.toFixed(2), x, y);
      x += colWidths[3];
      doc.text(span.maxTension.toFixed(2), x, y);
      x += colWidths[4];
      doc.text(`${span.minClearance.toFixed(2)} m`, x, y);
      y += 5;
    }

    // Warnings
    if (calc.warnings.length > 0) {
      y += 10;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(200, 100, 0);
      doc.text('Warnungen:', this.margin, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      for (const warning of calc.warnings) {
        doc.text(`• ${warning.message}`, this.margin, y);
        y += 5;
      }
      doc.setTextColor(0, 0, 0);
    }

    this.addFooter(doc, pageNum);
  }

  /**
   * Page 5: Cable Parameters
   */
  private addCableParametersPage(doc: jsPDF, project: Project, pageNum: number): void {
    let y = this.margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Seilparameter', this.margin, y);
    y += 12;

    const cable = project.cableConfig;

    doc.setFontSize(10);
    const params = [
      ['Seiltyp:', cable.cableType === 'carrying' ? 'Tragseil' : 'Kombiseil'],
      ['Seilgewicht:', `${cable.cableWeightPerMeter} kg/m`],
      ['Max. Nutzlast:', `${cable.maxLoad} kg`],
      ['Sicherheitsfaktor:', `${cable.safetyFactor}`],
      ['Min. Bodenfreiheit:', `${cable.minGroundClearance} m`],
    ];

    if (cable.allowedSag) {
      params.push(['Erlaubter Durchhang:', `${cable.allowedSag} m`]);
    }

    if (cable.cableDiameterMm) {
      params.push(['Seildurchmesser:', `${cable.cableDiameterMm} mm`]);
    }

    if (cable.cableMaterial) {
      params.push(['Seilmaterial:', cable.cableMaterial === 'steel' ? 'Stahl' : 'Synthetik']);
    }

    if (project.cablePresetId) {
      params.unshift(['Preset-ID:', project.cablePresetId]);
    }

    for (const [label, value] of params) {
      doc.setFont('helvetica', 'bold');
      doc.text(label, this.margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, this.margin + 50, y);
      y += 7;
    }

    // End stations
    y += 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Endstationen', this.margin, y);
    y += 10;

    doc.setFontSize(10);
    const stations = [
      { label: 'Talstation', station: project.startStation },
      { label: 'Bergstation', station: project.endStation }
    ];

    for (const { label, station } of stations) {
      doc.setFont('helvetica', 'bold');
      doc.text(label, this.margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.text(`Ankerhöhe: ${station.anchorPoint.heightAboveTerrain} m`, this.margin + 10, y);
      y += 5;
      doc.text(`Bodenfreiheit: ${station.groundClearance} m`, this.margin + 10, y);
      y += 10;
    }

    this.addFooter(doc, pageNum);
  }

  /**
   * Page: Profile Plot Image
   */
  private addPlotPage(doc: jsPDF, plotImage: string, pageNum: number): void {
    let y = this.margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Profil-Plot', this.margin, y);
    y += 12;

    const availableWidth = this.contentWidth;
    const availableHeight = this.pageHeight - y - this.margin - 10;

    const props = doc.getImageProperties(plotImage);
    const widthScale = availableWidth / props.width;
    const heightScale = availableHeight / props.height;
    const scale = Math.min(widthScale, heightScale);

    const imgWidth = props.width * scale;
    const imgHeight = props.height * scale;
    const x = this.margin + (availableWidth - imgWidth) / 2;

    doc.addImage(plotImage, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');

    this.addFooter(doc, pageNum);
  }

  /**
   * Add page footer
   */
  private addFooter(doc: jsPDF, pageNum: number): void {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128, 128, 128);

    const footerY = this.pageHeight - 10;
    doc.text(`Seite ${pageNum}`, this.margin, footerY);
    doc.text('Seilbahn PWA - Vorplanungstool', this.pageWidth / 2, footerY, { align: 'center' });
    doc.text(this.formatDate(new Date()), this.pageWidth - this.margin, footerY, { align: 'right' });

    doc.setTextColor(0, 0, 0);
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('de-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Get status text
   */
  private getStatusText(status: string): string {
    switch (status) {
      case 'draft': return 'Entwurf';
      case 'calculated': return 'Berechnet';
      case 'exported': return 'Exportiert';
      default: return status;
    }
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_');
  }
}
