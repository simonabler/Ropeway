import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import {
  AnchorForceResult,
  CalculationResult,
  CalculationWarning,
  Project,
  SpanResult,
} from '../../models';

type Rgb = [number, number, number];
type Tone = 'neutral' | 'success' | 'warning' | 'danger';

interface MetricItem {
  label: string;
  value: string;
  detail?: string;
  tone?: Tone;
}

interface TableConfig {
  project: Project;
  sectionTitle: string;
  title: string;
  headers: string[];
  rows: string[][];
  columnWidths: number[];
  startY: number;
  fontSize?: number;
}

/**
 * PDF Export Service
 * Generates a structured technical planning report for cable car projects.
 */
@Injectable({
  providedIn: 'root',
})
export class PdfExportService {
  private readonly pageWidth = 210;
  private readonly pageHeight = 297;
  private readonly margin = 18;
  private readonly bottomMargin = 24;
  private readonly contentWidth = this.pageWidth - this.margin * 2;

  private readonly colors = {
    primary: [17, 57, 84] as Rgb,
    primaryLight: [232, 241, 247] as Rgb,
    text: [31, 41, 55] as Rgb,
    muted: [99, 115, 129] as Rgb,
    border: [210, 218, 226] as Rgb,
    panel: [247, 249, 251] as Rgb,
    success: [42, 125, 98] as Rgb,
    successLight: [232, 246, 240] as Rgb,
    warning: [194, 124, 14] as Rgb,
    warningLight: [252, 244, 229] as Rgb,
    danger: [176, 47, 47] as Rgb,
    dangerLight: [252, 235, 235] as Rgb,
  };

  async generateReport(project: Project, plotImage?: string | null): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    this.addCoverPage(doc, project);

    doc.addPage();
    this.addExecutiveSummaryPage(doc, project);

    doc.addPage();
    this.addProfileVisualizationPage(doc, project, plotImage ?? null);

    if (project.calculationResult) {
      doc.addPage();
      this.addCalculationOverviewPage(doc, project);

      doc.addPage();
      this.addForcesPage(doc, project);
    }

    doc.addPage();
    this.addTerrainAppendixPage(doc, project);

    if (project.supports.length > 0) {
      doc.addPage();
      this.addSupportAppendixPage(doc, project);
    }

    doc.addPage();
    this.addCableAppendixPage(doc, project);

    this.addFooters(doc, project);

    return doc.output('blob');
  }

  async downloadReport(project: Project, plotImage?: string | null): Promise<void> {
    const blob = await this.generateReport(project, plotImage);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.sanitizeFilename(project.name)}_Bericht.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private addCoverPage(doc: jsPDF, project: Project): void {
    const terrain = project.terrainProfile;
    const calc = project.calculationResult;

    this.applyFillColor(doc, this.colors.primary);
    doc.rect(0, 0, this.pageWidth, 74, 'F');

    this.applyTextColor(doc, [255, 255, 255]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(project.companyName || 'Seilbahn PWA', this.margin, 16);

    doc.setFontSize(26);
    doc.text('Materialseilbahn', this.margin, 34);
    doc.text('Vorplanungsbericht', this.margin, 47);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Technischer Projektbericht fuer Vorplanung, Plausibilisierung und Export.', this.margin, 58);

    let y = 92;
    this.applyTextColor(doc, this.colors.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(project.name, this.margin, y);
    y += 10;

    let badgeX = this.margin;
    badgeX += this.drawBadge(doc, badgeX, y, this.getApprovalText(project.approvalStatus), 'neutral') + 4;
    this.drawBadge(
      doc,
      badgeX,
      y,
      calc?.isValid ? 'Berechnung gueltig' : 'Berechnung offen',
      calc ? (calc.isValid ? 'success' : 'warning') : 'warning'
    );

    y += 12;
    this.drawPanel(doc, this.margin, y, this.contentWidth, 48, 'neutral');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Dokumentdaten');

    this.drawKeyValueRows(
      doc,
      [
        ['Projekt-Nr.', project.projectNumber || '-'],
        ['Erstellt', this.formatDate(project.createdAt)],
        ['Geändert', this.formatDate(project.modifiedAt)],
        ['Autor', project.author || '-'],
      ],
      this.margin + 6,
      y + 15,
      26
    );
    this.drawKeyValueRows(
      doc,
      [
        ['Status', this.getStatusText(project.status)],
        ['Revision', project.revision || '-'],
        ['Azimut', this.hasEndPoint(project) ? `${project.azimuth.toFixed(1)} deg` : '-'],
        ['Startpunkt', this.getStartPointText(project)],
        ['Endpunkt', this.getEndPointText(project)],
      ],
      this.margin + 92,
      y + 15,
      24
    );

    y += 60;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    this.applyTextColor(doc, this.colors.primary);
    doc.text('Projekt im Ueberblick', this.margin, y);
    y += 5;

    y = this.drawMetricGrid(
      doc,
      [
        {
          label: 'Gesamtlaenge',
          value: `${terrain.totalLength.toFixed(0)} m`,
          detail: `${terrain.segments.length} Segmente`,
        },
        {
          label: 'Hoehendifferenz',
          value: `${terrain.elevationChange.toFixed(0)} m`,
          detail: terrain.elevationChange >= 0 ? 'ansteigend' : 'abfallend',
        },
        {
          label: 'Stuetzen',
          value: `${project.supports.length}`,
          detail: `${project.supports.length + 1} Spannfelder inkl. Stationen`,
        },
        {
          label: 'Seilkonfiguration',
          value: `${project.cableConfig.cableDiameterMm} mm`,
          detail: this.getCableTypeText(project),
        },
      ],
      y,
      4
    );

    y += 6;
    this.drawPanel(doc, this.margin, y, this.contentWidth, 60, 'neutral');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Kurzbewertung');

    this.applyTextColor(doc, this.colors.text);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(this.buildSummaryNarrative(project), this.contentWidth - 12), this.margin + 6, y + 17);

    if (project.notes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Notizen', this.margin + 6, y + 39);
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(project.notes, this.contentWidth - 12).slice(0, 3), this.margin + 6, y + 46);
    }
  }

  private addExecutiveSummaryPage(doc: jsPDF, project: Project): void {
    const calc = project.calculationResult;
    let y = this.addSectionHeader(
      doc,
      project,
      'Kurzfassung',
      'Die wichtigsten Kennzahlen, Pruefhinweise und Projektparameter auf einer Seite.'
    );

    y = this.drawMetricGrid(doc, this.buildSummaryMetrics(project), y, 3);
    y += 6;

    this.drawPanel(doc, this.margin, y, 84, 44, 'neutral');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Projekt und Trasse');
    this.drawKeyValueRows(
      doc,
      [
        ['Status', this.getStatusText(project.status)],
        ['Trassenlänge', `${project.terrainProfile.totalLength.toFixed(1)} m`],
        ['Höhendifferenz', `${project.terrainProfile.elevationChange.toFixed(1)} m`],
        ['Segmente', `${project.terrainProfile.segments.length}`],
        ['Stützen', `${project.supports.length}`],
      ],
      this.margin + 6,
      y + 15,
      30
    );

    this.drawPanel(doc, this.margin + 90, y, 84, 44, calc ? 'success' : 'warning');
    this.drawPanelTitle(doc, this.margin + 96, y + 8, 'Berechnungsstand');
    this.drawKeyValueRows(
      doc,
      [
        ['Solver', calc ? this.getMethodText(calc.method) : project.solverType || '-'],
        ['Gültigkeit', calc ? (calc.isValid ? 'Ja' : 'Nein') : 'Keine Berechnung'],
        ['Letzter Lauf', calc ? this.formatDate(calc.timestamp) : '-'],
        ['Freigabestatus', this.getApprovalText(project.approvalStatus)],
      ],
      this.margin + 96,
      y + 15,
      28
    );

    y += 56;
    const warnings = calc?.warnings ?? [];

    if (warnings.length === 0) {
      this.drawPanel(doc, this.margin, y, this.contentWidth, 28, 'success');
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Hinweise');
      this.applyTextColor(doc, this.colors.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Es liegen aktuell keine Berechnungswarnungen vor.', this.margin + 6, y + 17);
      return;
    }

    this.drawPanel(doc, this.margin, y, this.contentWidth, 68, 'neutral');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Wesentliche Hinweise');

    let warningY = y + 16;
    for (const warning of warnings.slice(0, 4)) {
      this.drawInlineAlert(
        doc,
        this.margin + 6,
        warningY,
        this.contentWidth - 12,
        warning.message,
        this.getWarningTone(warning)
      );
      warningY += 12;
    }
  }

  private addProfileVisualizationPage(doc: jsPDF, project: Project, plotImage?: string | null): void {
    const calc = project.calculationResult;
    const criticalSpan = calc ? this.getCriticalSpan(calc) : null;

    let y = this.addSectionHeader(
      doc,
      project,
      'Trasse und Profil',
      'Grafische Einordnung der Trasse mit Fokus auf Hoehenentwicklung und kritische Bodenfreiheit.'
    );

    y = this.drawMetricGrid(
      doc,
      [
        {
          label: 'Trassenlänge',
          value: `${project.terrainProfile.totalLength.toFixed(1)} m`,
          detail: this.hasEndPoint(project) ? `Azimut ${project.azimuth.toFixed(1)} deg` : 'Endpunkt offen',
        },
        {
          label: 'Min. Bodenfreiheit',
          value: calc ? `${this.getMinimumClearance(calc).toFixed(2)} m` : '-',
          detail: `Soll ${project.cableConfig.minGroundClearance.toFixed(2)} m`,
          tone: calc ? this.getClearanceTone(project, this.getMinimumClearance(calc)) : 'warning',
        },
        {
          label: 'Kritisches Feld',
          value: criticalSpan ? `Feld ${criticalSpan.spanNumber}` : '-',
          detail: criticalSpan ? `bei Station ${criticalSpan.minClearanceAt.toFixed(1)} m` : 'Keine Berechnung',
        },
      ],
      y,
      3
    );

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    this.applyTextColor(doc, this.colors.primary);
    doc.text('Profilplot', this.margin, y);
    y += 6;

    this.drawPanel(doc, this.margin, y, this.contentWidth, 112, 'neutral');

    if (plotImage) {
      const props = doc.getImageProperties(plotImage);
      const availableWidth = this.contentWidth - 10;
      const availableHeight = 98;
      const scale = Math.min(availableWidth / props.width, availableHeight / props.height);
      const width = props.width * scale;
      const height = props.height * scale;
      const x = this.margin + (this.contentWidth - width) / 2;
      const imageY = y + 7 + (availableHeight - height) / 2;
      doc.addImage(plotImage, 'PNG', x, imageY, width, height, undefined, 'FAST');
    } else {
      this.applyTextColor(doc, this.colors.muted);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text('Kein Profilbild verfuegbar. Der Export konnte keine Diagrammaufnahme erstellen.', this.margin + 10, y + 56);
    }

    y += 122;
    this.drawPanel(doc, this.margin, y, 84, 40, 'neutral');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Lagebezug');
    this.drawKeyValueRows(
      doc,
      [
        ['Startpunkt', this.getStartPointText(project)],
        ['Endpunkt', this.getEndPointText(project)],
        ['Azimut', this.hasEndPoint(project) ? `${project.azimuth.toFixed(1)} deg` : '-'],
        ['Talstation', `${project.startStation.anchorPoint.heightAboveTerrain.toFixed(1)} m Ankerhoehe`],
      ],
      this.margin + 6,
      y + 15,
      24
    );

    this.drawPanel(doc, this.margin + 90, y, 84, 34, calc ? 'success' : 'warning');
    this.drawPanelTitle(doc, this.margin + 96, y + 8, 'Auswertung');
    this.drawKeyValueRows(
      doc,
      [
        ['Bergstation', `${project.endStation.anchorPoint.heightAboveTerrain.toFixed(1)} m Ankerhoehe`],
        ['Mindestabstand', calc ? `${this.getMinimumClearance(calc).toFixed(2)} m` : 'Keine Berechnung'],
        ['Kommentar', criticalSpan ? `Feld ${criticalSpan.spanNumber} ist massgebend.` : 'Grafische Einordnung'],
      ],
      this.margin + 96,
      y + 15,
      26
    );
  }

  private addCalculationOverviewPage(doc: jsPDF, project: Project): void {
    const calc = project.calculationResult;
    let y = this.addSectionHeader(
      doc,
      project,
      'Berechnung',
      'Globale Ergebnisse, massgebende Kennwerte und Spannfeldauswertung.'
    );

    if (!calc) {
      this.drawPanel(doc, this.margin, y, this.contentWidth, 26, 'warning');
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Hinweis');
      this.applyTextColor(doc, this.colors.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Fuer dieses Projekt liegt keine Berechnung vor.', this.margin + 6, y + 17);
      return;
    }

    y = this.drawMetricGrid(
      doc,
      [
        {
          label: 'Solver',
          value: this.getMethodText(calc.method),
          detail: `Berechnet am ${this.formatDate(calc.timestamp)}`,
        },
        {
          label: 'Max. Seilzug',
          value: `${calc.maxTension.toFixed(2)} kN`,
          detail: 'globales Maximum',
        },
        {
          label: 'Horizontale Vorspannung',
          value: `${calc.maxHorizontalForce.toFixed(2)} kN`,
          detail: 'maximaler Wert',
        },
        {
          label: 'Seilauslastung',
          value: `${calc.cableCapacityCheck.utilizationPercent.toFixed(0)} %`,
          detail: this.getCapacityStatusText(calc),
          tone: this.getCapacityTone(calc),
        },
      ],
      y,
      2
    );

    y += 6;

    if (calc.designCheck) {
      this.drawPanel(doc, this.margin, y, this.contentWidth, 28, 'neutral');
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Massgebender Lastfall');
      this.applyTextColor(doc, this.colors.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        calc.designCheck.source === 'selected-payload'
          ? `Aktiver Payload in Feld ${calc.designCheck.governingSpanNumber}, Position ${calc.designCheck.governingLoadPositionM.toFixed(1)} m (${(calc.designCheck.governingSpanLoadRatio * 100).toFixed(0)} % der Spannfeldlaenge).`
          : `Worst-case-Payload in Feld ${calc.designCheck.governingSpanNumber}, Position ${calc.designCheck.governingLoadPositionM.toFixed(1)} m (${(calc.designCheck.governingSpanLoadRatio * 100).toFixed(0)} % der Spannfeldlaenge).`,
        this.margin + 6,
        y + 18
      );
      y += 36;
    }

    if (calc.engineeringMetrics) {
      this.drawPanel(doc, this.margin, y, this.contentWidth, 36, 'neutral');
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Globale Engineering-Kennwerte');
      this.drawKeyValueRows(
        doc,
        [
          ['Designfall', calc.engineeringMetrics.designMode === 'worst-case' ? 'Worst-Case-Huelle' : 'Aktiver Lastfall'],
          ['Geloestes H', `${calc.engineeringMetrics.solvedHorizontalForceKN.toFixed(2)} kN`],
          ['Referenzlaenge', `${calc.engineeringMetrics.referenceUnstretchedLengthM.toFixed(2)} m`],
          ['Belastete Seillaenge', `${calc.engineeringMetrics.loadedStretchedLengthM.toFixed(2)} m`],
          ['Belastete Null-Laenge', `${calc.engineeringMetrics.loadedUnstretchedLengthM.toFixed(2)} m`],
        ],
        this.margin + 6,
        y + 15,
        40
      );
      if (calc.engineeringMetrics.envelope) {
        this.drawKeyValueRows(
          doc,
          [
            ['Huelle min. Frei.', `${calc.engineeringMetrics.envelope.minClearanceM.toFixed(2)} m`],
            ['Huelle bei Stat.', `${calc.engineeringMetrics.envelope.minClearanceAtM.toFixed(1)} m`],
            ['Load Cases', `${calc.engineeringMetrics.envelope.sampledLoadCases}`]
          ],
          this.margin + 104,
          y + 15,
          34
        );
      }
      y += 44;
    }

    y = this.drawTable(doc, {
      project,
      sectionTitle: 'Berechnung',
      title: 'Spannfeld-Ergebnisse',
      headers: ['Feld', 'Laenge', 'Delta h', 'H', 'Tmax', 'Min. Frei.', 'bei Stat.'],
      rows: calc.spans.map((span) => [
        String(span.spanNumber),
        `${span.spanLength.toFixed(1)} m`,
        `${span.heightDifference.toFixed(1)} m`,
        `${span.horizontalForce.toFixed(2)} kN`,
        `${span.maxTension.toFixed(2)} kN`,
        `${span.minClearance.toFixed(2)} m`,
        `${span.minClearanceAt.toFixed(1)} m`,
      ]),
      columnWidths: [14, 25, 22, 24, 26, 28, 26],
      startY: y,
      fontSize: 8.3,
    });

    const criticalSpan = this.getCriticalSpan(calc);
    if (criticalSpan) {
      y += 6;
      y = this.ensurePageSpace(doc, project, 'Berechnung', y, 26);
      this.drawPanel(doc, this.margin, y, this.contentWidth, 24, this.getClearanceTone(project, criticalSpan.minClearance));
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Massgebender Freiraum');
      this.applyTextColor(doc, this.colors.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        `Feld ${criticalSpan.spanNumber}: minimale Bodenfreiheit ${criticalSpan.minClearance.toFixed(2)} m bei Station ${criticalSpan.minClearanceAt.toFixed(1)} m.`,
        this.margin + 6,
        y + 17
      );
    }
  }

  private addForcesPage(doc: jsPDF, project: Project): void {
    const calc = project.calculationResult;
    let y = this.addSectionHeader(
      doc,
      project,
      'Lastabtrag',
      'Anker- und Stuetzkraefte zur schnellen statischen Einordnung.'
    );

    if (!calc) {
      this.drawPanel(doc, this.margin, y, this.contentWidth, 26, 'warning');
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Hinweis');
      this.applyTextColor(doc, this.colors.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Ohne Berechnung stehen keine Kraefte zur Verfuegung.', this.margin + 6, y + 17);
      return;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    this.applyTextColor(doc, this.colors.primary);
    doc.text('Ankerkraefte', this.margin, y);
    y += 6;

    const anchorCards = this.getAnchorCards(calc.anchorForces);
    if (anchorCards.length === 0) {
      this.drawPanel(doc, this.margin, y, this.contentWidth, 26, 'warning');
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Hinweis');
      this.applyTextColor(doc, this.colors.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Es wurden keine Ankerkraefte berechnet.', this.margin + 6, y + 17);
      y += 34;
    } else {
      const cardWidth = (this.contentWidth - 6) / 2;
      for (let index = 0; index < anchorCards.length; index += 1) {
        this.drawForceCard(
          doc,
          this.margin + index * (cardWidth + 6),
          y,
          cardWidth,
          34,
          anchorCards[index]
        );
      }
      y += 42;
    }

    y = this.ensurePageSpace(doc, project, 'Lastabtrag', y, 20);
    this.drawTable(doc, {
      project,
      sectionTitle: 'Lastabtrag',
      title: 'Stuetzenauflagen',
      headers: ['Nr.', 'Station', 'H', 'V', 'Result.', 'Winkel'],
      rows: calc.supportForces.map((force) => [
        `${force.supportNumber}`,
        `${force.stationLength.toFixed(1)} m`,
        `${force.horizontal.toFixed(2)} kN`,
        `${force.vertical.toFixed(2)} kN`,
        `${force.resultant.toFixed(2)} kN`,
        `${force.angle.toFixed(1)} deg`,
      ]),
      columnWidths: [16, 26, 28, 28, 34, 28],
      startY: y,
      fontSize: 8.4,
    });
  }

  private addTerrainAppendixPage(doc: jsPDF, project: Project): void {
    let y = this.addSectionHeader(
      doc,
      project,
      'Anhang Terrain',
      'Rohdaten des Gelaendeprofils als tabellarische Dokumentation.'
    );

    if (project.terrainProfile.segments.length === 0) {
      this.drawPanel(doc, this.margin, y, this.contentWidth, 26, 'warning');
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Hinweis');
      this.applyTextColor(doc, this.colors.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Es sind keine Terrain-Daten vorhanden.', this.margin + 6, y + 17);
      return;
    }

    this.drawPanel(doc, this.margin, y, this.contentWidth, 24, 'neutral');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Profilzusammenfassung');
    this.drawKeyValueRows(
      doc,
      [
        ['Segmente', `${project.terrainProfile.segments.length}`],
        ['Gesamtlaenge', `${project.terrainProfile.totalLength.toFixed(1)} m`],
        ['Hoehendifferenz', `${project.terrainProfile.elevationChange.toFixed(1)} m`],
      ],
      this.margin + 6,
      y + 15,
      30
    );

    y += 32;
    this.drawTable(doc, {
      project,
      sectionTitle: 'Anhang Terrain',
      title: 'Terrain-Segmente',
      headers: ['Nr.', 'Laenge', 'Steigung', 'Station', 'Hoehe', 'Notiz'],
      rows: project.terrainProfile.segments.map((segment) => [
        `${segment.segmentNumber}`,
        `${segment.lengthMeters.toFixed(1)} m`,
        `${segment.slopePercent.toFixed(1)} %`,
        `${segment.stationLength.toFixed(1)} m`,
        `${segment.terrainHeight.toFixed(2)} m`,
        segment.notes || '-',
      ]),
      columnWidths: [12, 24, 24, 26, 26, 62],
      startY: y,
      fontSize: 8.2,
    });
  }

  private addSupportAppendixPage(doc: jsPDF, project: Project): void {
    let y = this.addSectionHeader(
      doc,
      project,
      'Anhang Stuetzen',
      'Dokumentation der gesetzten Stuetzen und ihrer Geometrie.'
    );

    const supports = [...project.supports].sort((a, b) => a.stationLength - b.stationLength);

    this.drawPanel(doc, this.margin, y, this.contentWidth, 24, 'neutral');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Stuetzenueberblick');
    this.drawKeyValueRows(
      doc,
      [
        ['Anzahl', `${supports.length}`],
        ['Erste Station', supports.length > 0 ? `${supports[0].stationLength.toFixed(1)} m` : '-'],
        ['Letzte Station', supports.length > 0 ? `${supports[supports.length - 1].stationLength.toFixed(1)} m` : '-'],
      ],
      this.margin + 6,
      y + 15,
      42
    );

    y += 32;
    this.drawTable(doc, {
      project,
      sectionTitle: 'Anhang Stuetzen',
      title: 'Stuetzendaten',
      headers: ['Nr.', 'Station', 'Terrain', 'Stuetzenh.', 'Oberkante', 'Freiraum'],
      rows: supports.map((support) => [
        `${support.supportNumber}`,
        `${support.stationLength.toFixed(1)} m`,
        `${support.terrainHeight.toFixed(2)} m`,
        `${support.supportHeight.toFixed(1)} m`,
        `${support.topElevation.toFixed(2)} m`,
        support.clearance !== undefined ? `${support.clearance.toFixed(2)} m` : '-',
      ]),
      columnWidths: [12, 26, 28, 26, 30, 24],
      startY: y,
      fontSize: 8.3,
    });
  }

  private addCableAppendixPage(doc: jsPDF, project: Project): void {
    const calc = project.calculationResult;
    let y = this.addSectionHeader(
      doc,
      project,
      'Anhang Systemdaten',
      'Seilparameter, Endstationen und relevante Nachweisparameter.'
    );

    this.drawPanel(doc, this.margin, y, 84, 58, 'neutral');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Seilkonfiguration');
    this.drawKeyValueRows(
      doc,
      [
        ['Seiltyp', this.getCableTypeText(project)],
        ['Durchmesser', `${project.cableConfig.cableDiameterMm} mm`],
        ['Seilgewicht', `${project.cableConfig.cableWeightPerMeter.toFixed(2)} kg/m`],
        ['Max. Nutzlast', `${project.cableConfig.maxLoad.toFixed(0)} kg`],
        ['Sicherheitsfaktor', `${project.cableConfig.safetyFactor.toFixed(2)}`],
        ['Min. Bodenfreiheit', `${project.cableConfig.minGroundClearance.toFixed(2)} m`],
      ],
      this.margin + 6,
      y + 15,
      34
    );

    this.drawPanel(doc, this.margin + 90, y, 84, 58, 'neutral');
    this.drawPanelTitle(doc, this.margin + 96, y + 8, 'Endstationen');
    this.drawKeyValueRows(
      doc,
      [
        ['Talstation', `${project.startStation.anchorPoint.heightAboveTerrain.toFixed(1)} m Ankerhoehe`],
        ['Talstation Freiraum', `${project.startStation.groundClearance.toFixed(1)} m`],
        ['Bergstation', `${project.endStation.anchorPoint.heightAboveTerrain.toFixed(1)} m Ankerhoehe`],
        ['Bergstation Freiraum', `${project.endStation.groundClearance.toFixed(1)} m`],
        ['Preset', project.cablePresetId || '-'],
      ],
      this.margin + 96,
      y + 15,
      36
    );

    y += 66;
    this.drawPanel(doc, this.margin, y, this.contentWidth, 104, calc ? this.getCapacityTone(calc) : 'warning');
    this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Tragfaehigkeit und Nachweis');
    this.drawKeyValueRows(
      doc,
      [
        ['Modus', calc ? this.getCalculationModeText(calc.calculationMode) : this.getCalculationModeText(project.calculationMode || 'planning')],
        ['Engineering-Fall', calc?.engineeringMetrics ? (calc.engineeringMetrics.designMode === 'worst-case' ? 'Worst-Case-Huelle' : 'Aktiver Lastfall') : '-'],
        ['Festigkeitsklasse', `${project.cableConfig.minBreakingStrengthNPerMm2} N/mm^2`],
        ['Material', this.getCableMaterialText(project)],
        ['E-Modul', `${project.cableConfig.elasticModulusKNPerMm2.toFixed(1)} kN/mm^2`],
        ['Fuellfaktor', `${project.cableConfig.fillFactor.toFixed(2)}`],
        ['Horizontale Vorspannung', `${(calc?.activeLoadCase?.horizontalTensionKN ?? project.cableConfig.horizontalTensionKN).toFixed(2)} kN`],
        ['Geloestes H', calc?.engineeringMetrics ? `${calc.engineeringMetrics.solvedHorizontalForceKN.toFixed(2)} kN` : '-'],
        ['Punktlast', `${(calc?.activeLoadCase?.maxLoadKg ?? project.cableConfig.maxLoad).toFixed(0)} kg`],
        ['Lastposition', `${(((calc?.activeLoadCase?.loadPositionRatio ?? project.cableConfig.loadPositionRatio) ?? 0.5) * 100).toFixed(0)} %`],
        ['Referenzlaenge', calc?.engineeringMetrics ? `${calc.engineeringMetrics.referenceUnstretchedLengthM.toFixed(2)} m` : '-'],
        ['Belastete Seillaenge', calc?.engineeringMetrics ? `${calc.engineeringMetrics.loadedStretchedLengthM.toFixed(2)} m` : '-'],
        ['Zulaessig', calc ? `${calc.cableCapacityCheck.maxAllowedTensionKN.toFixed(2)} kN` : '-'],
        ['Tatsaechlich', calc ? `${calc.cableCapacityCheck.actualMaxTensionKN.toFixed(2)} kN` : '-'],
      ],
      this.margin + 6,
      y + 15,
      44
    );

    if (project.notes) {
      y += 112;
      this.drawPanel(doc, this.margin, y, this.contentWidth, 34, 'neutral');
      this.drawPanelTitle(doc, this.margin + 6, y + 8, 'Projektanmerkungen');
      this.applyTextColor(doc, this.colors.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(doc.splitTextToSize(project.notes, this.contentWidth - 12).slice(0, 4), this.margin + 6, y + 17);
    }
  }

  private addFooters(doc: jsPDF, project: Project): void {
    const pageCount = doc.getNumberOfPages();

    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      this.applyDrawColor(doc, this.colors.border);
      doc.line(this.margin, this.pageHeight - 13, this.pageWidth - this.margin, this.pageHeight - 13);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      this.applyTextColor(doc, this.colors.muted);
      doc.text(project.projectNumber || project.name, this.margin, this.pageHeight - 8);
      doc.text(this.formatDate(new Date()), this.pageWidth / 2, this.pageHeight - 8, { align: 'center' });
      doc.text(`Seite ${page} / ${pageCount}`, this.pageWidth - this.margin, this.pageHeight - 8, {
        align: 'right',
      });
    }
  }

  private addSectionHeader(doc: jsPDF, project: Project, title: string, subtitle?: string): number {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    this.applyTextColor(doc, this.colors.muted);
    doc.text('MATERIALSEILBAHN / VORPLANUNGSBERICHT', this.margin, 13);
    doc.text(this.truncateText(project.name, 55), this.pageWidth - this.margin, 13, { align: 'right' });

    this.applyDrawColor(doc, this.colors.border);
    doc.line(this.margin, 17, this.pageWidth - this.margin, 17);

    this.applyTextColor(doc, this.colors.primary);
    doc.setFontSize(20);
    doc.text(title, this.margin, 29);

    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      this.applyTextColor(doc, this.colors.muted);
      doc.text(doc.splitTextToSize(subtitle, this.contentWidth), this.margin, 36);
      return 48;
    }

    return 38;
  }

  private drawMetricGrid(doc: jsPDF, metrics: MetricItem[], startY: number, columns: number): number {
    const gap = 6;
    const cardWidth = (this.contentWidth - gap * (columns - 1)) / columns;
    const cardHeight = 26;

    metrics.forEach((metric, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = this.margin + column * (cardWidth + gap);
      const y = startY + row * (cardHeight + gap);
      this.drawMetricCard(doc, x, y, cardWidth, cardHeight, metric);
    });

    return startY + Math.ceil(metrics.length / columns) * (cardHeight + gap) - gap;
  }

  private drawMetricCard(doc: jsPDF, x: number, y: number, width: number, height: number, metric: MetricItem): void {
    this.drawPanel(doc, x, y, width, height, metric.tone || 'neutral');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    this.applyTextColor(doc, this.colors.muted);
    doc.text(metric.label, x + 5, y + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    this.applyTextColor(doc, this.colors.primary);
    doc.text(metric.value, x + 5, y + 16);

    if (metric.detail) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      this.applyTextColor(doc, this.colors.muted);
      doc.text(doc.splitTextToSize(metric.detail, width - 10).slice(0, 2), x + 5, y + 22);
    }
  }

  private drawPanel(doc: jsPDF, x: number, y: number, width: number, height: number, tone: Tone): void {
    const { fill, border } = this.getTonePalette(tone);
    this.applyFillColor(doc, fill);
    this.applyDrawColor(doc, border);
    doc.roundedRect(x, y, width, height, 3, 3, 'FD');
  }

  private drawPanelTitle(doc: jsPDF, x: number, y: number, title: string): void {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    this.applyTextColor(doc, this.colors.primary);
    doc.text(title, x, y);
  }

  private drawKeyValueRows(
    doc: jsPDF,
    rows: Array<[string, string]>,
    x: number,
    startY: number,
    labelWidth: number
  ): void {
    let y = startY;
    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      this.applyTextColor(doc, this.colors.muted);
      doc.text(`${label}:`, x, y);

      doc.setFont('helvetica', 'normal');
      this.applyTextColor(doc, this.colors.text);
      doc.text(value, x + labelWidth, y);
      y += 6;
    }
  }

  private drawInlineAlert(
    doc: jsPDF,
    x: number,
    y: number,
    width: number,
    message: string,
    tone: Tone
  ): void {
    this.drawPanel(doc, x, y, width, 9, tone);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    this.applyTextColor(doc, this.colors.text);
    doc.text(this.truncateText(message, 96), x + 4, y + 5.8);
  }

  private drawForceCard(
    doc: jsPDF,
    x: number,
    y: number,
    width: number,
    height: number,
    force: { title: string; values: Array<[string, string]> }
  ): void {
    this.drawPanel(doc, x, y, width, height, 'neutral');
    this.drawPanelTitle(doc, x + 5, y + 8, force.title);
    this.drawKeyValueRows(doc, force.values, x + 5, y + 16, 18);
  }

  private drawTable(doc: jsPDF, config: TableConfig): number {
    let y = config.startY;
    const totalWidth = config.columnWidths.reduce((sum, width) => sum + width, 0);
    const lineHeight = 3.8;
    const fontSize = config.fontSize ?? 8.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    this.applyTextColor(doc, this.colors.primary);
    doc.text(config.title, this.margin, y);
    y += 6;

    y = this.drawTableHeader(doc, config.headers, config.columnWidths, y, totalWidth);

    config.rows.forEach((row, rowIndex) => {
      const linesPerCell = row.map((value, index) =>
        doc.splitTextToSize(value, Math.max(config.columnWidths[index] - 4, 10))
      );
      const lineCount = Math.max(...linesPerCell.map((lines) => lines.length), 1);
      const rowHeight = Math.max(7, lineCount * lineHeight + 3);

      if (y + rowHeight > this.pageHeight - this.bottomMargin) {
        doc.addPage();
        y = this.addSectionHeader(doc, config.project, config.sectionTitle);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        this.applyTextColor(doc, this.colors.primary);
        doc.text(`${config.title} (Fortsetzung)`, this.margin, y);
        y += 6;
        y = this.drawTableHeader(doc, config.headers, config.columnWidths, y, totalWidth);
      }

      if (rowIndex % 2 === 0) {
        this.applyFillColor(doc, this.colors.panel);
        doc.rect(this.margin, y, totalWidth, rowHeight, 'F');
      }

      this.applyDrawColor(doc, this.colors.border);
      doc.rect(this.margin, y, totalWidth, rowHeight);

      let x = this.margin;
      row.forEach((_, index) => {
        if (index > 0) {
          doc.line(x, y, x, y + rowHeight);
        }
        x += config.columnWidths[index];
      });

      x = this.margin;
      row.forEach((value, index) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        this.applyTextColor(doc, this.colors.text);
        doc.text(doc.splitTextToSize(value, Math.max(config.columnWidths[index] - 4, 10)), x + 2, y + 4.8);
        x += config.columnWidths[index];
      });

      y += rowHeight;
    });

    return y;
  }

  private drawTableHeader(
    doc: jsPDF,
    headers: string[],
    columnWidths: number[],
    y: number,
    totalWidth: number
  ): number {
    this.applyFillColor(doc, this.colors.panel);
    this.applyDrawColor(doc, this.colors.border);
    doc.rect(this.margin, y, totalWidth, 8, 'FD');

    let x = this.margin;
    headers.forEach((header, index) => {
      if (index > 0) {
        doc.line(x, y, x, y + 8);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      this.applyTextColor(doc, this.colors.primary);
      doc.text(header, x + 2, y + 5.1);
      x += columnWidths[index];
    });

    return y + 8;
  }

  private drawBadge(doc: jsPDF, x: number, y: number, text: string, tone: Tone): number {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const width = doc.getTextWidth(text) + 8;
    const { fill, border } = this.getTonePalette(tone);

    this.applyFillColor(doc, fill);
    this.applyDrawColor(doc, border);
    doc.roundedRect(x, y - 5.5, width, 7, 2, 2, 'FD');

    this.applyTextColor(doc, this.colors.text);
    doc.text(text, x + 4, y - 1);

    return width;
  }

  private ensurePageSpace(
    doc: jsPDF,
    project: Project,
    sectionTitle: string,
    y: number,
    requiredHeight: number
  ): number {
    if (y + requiredHeight <= this.pageHeight - this.bottomMargin) {
      return y;
    }

    doc.addPage();
    return this.addSectionHeader(doc, project, sectionTitle);
  }

  private buildSummaryMetrics(project: Project): MetricItem[] {
    const calc = project.calculationResult;
    const criticalSpan = calc ? this.getCriticalSpan(calc) : null;
    const minClearance = calc ? this.getMinimumClearance(calc) : null;

    return [
      {
        label: 'Berechnungsstatus',
        value: calc ? (calc.isValid ? 'Gueltig' : 'Pruefen') : 'Offen',
        detail: calc ? this.getMethodText(calc.method) : 'Noch nicht berechnet',
        tone: calc ? (calc.isValid ? 'success' : 'warning') : 'warning',
      },
      {
        label: 'Max. Seilzug',
        value: calc ? `${calc.maxTension.toFixed(1)} kN` : '-',
        detail: 'globaler Bemessungswert',
      },
      {
        label: 'Seilauslastung',
        value: calc ? `${calc.cableCapacityCheck.utilizationPercent.toFixed(0)} %` : '-',
        detail: calc ? this.getCapacityStatusText(calc) : 'Kein Nachweis',
        tone: calc ? this.getCapacityTone(calc) : 'warning',
      },
      {
        label: 'Min. Bodenfreiheit',
        value: minClearance !== null ? `${minClearance.toFixed(2)} m` : '-',
        detail: `Soll ${project.cableConfig.minGroundClearance.toFixed(2)} m`,
        tone: minClearance !== null ? this.getClearanceTone(project, minClearance) : 'warning',
      },
      {
        label: 'Gesamtlaenge',
        value: `${project.terrainProfile.totalLength.toFixed(0)} m`,
        detail: `${project.terrainProfile.segments.length} Segmente`,
      },
      {
        label: 'Massgebendes Feld',
        value: criticalSpan ? `Feld ${criticalSpan.spanNumber}` : '-',
        detail: criticalSpan ? `${criticalSpan.minClearance.toFixed(2)} m Bodenfreiheit` : 'Noch nicht ermittelt',
      },
    ];
  }

  private buildSummaryNarrative(project: Project): string {
    const calc = project.calculationResult;
    if (!calc) {
      return 'Das Projekt enthaelt Trassen-, Stuetzen- und Systemdaten, jedoch noch keine abgeschlossene Berechnung. Fuer einen freigabefaehigen Bericht sollten die Nachweise fuer Seilzug, Bodenfreiheit und Lastabtrag vor dem Export aktualisiert werden.';
    }

    const criticalSpan = this.getCriticalSpan(calc);
    const minClearance = this.getMinimumClearance(calc);
    const clearanceState =
      minClearance >= project.cableConfig.minGroundClearance ? 'eingehalten' : 'unterschritten';

    return `Die aktuelle Vorplanung wurde mit ${this.getMethodText(calc.method)} ausgewertet. Das globale Seilzugmaximum betraegt ${calc.maxTension.toFixed(2)} kN bei einer Seilauslastung von ${calc.cableCapacityCheck.utilizationPercent.toFixed(0)} %. Die minimale Bodenfreiheit wird im ${criticalSpan ? `Spannfeld ${criticalSpan.spanNumber}` : 'massgebenden Spannfeld'} mit ${minClearance.toFixed(2)} m ${clearanceState}.`;
  }

  private getAnchorCards(anchorForces: AnchorForceResult[]): Array<{ title: string; values: Array<[string, string]> }> {
    return anchorForces.map((force) => ({
      title: force.type === 'start' ? 'Talanker' : 'Berganker',
      values: [
        ['Fx', `${force.horizontalSigned >= 0 ? '+' : ''}${force.horizontalSigned.toFixed(2)} kN`],
        ['Fy', `${force.verticalSigned >= 0 ? '+' : ''}${force.verticalSigned.toFixed(2)} kN`],
        ['R', `${force.resultant.toFixed(2)} kN`],
        ['Neigung', `${force.angle.toFixed(1)} deg`],
      ],
    }));
  }

  private getCriticalSpan(calc: CalculationResult): SpanResult | null {
    if (calc.spans.length === 0) {
      return null;
    }

    return calc.spans.reduce((current, span) =>
      span.minClearance < current.minClearance ? span : current
    );
  }

  private getMinimumClearance(calc: CalculationResult): number {
    if (calc.spans.length === 0) {
      return 0;
    }

    return calc.spans.reduce(
      (minimum, span) => Math.min(minimum, span.minClearance),
      Number.POSITIVE_INFINITY
    );
  }

  private getCapacityTone(calc: CalculationResult): Tone {
    switch (calc.cableCapacityCheck.status) {
      case 'ok':
        return 'success';
      case 'warning':
        return 'warning';
      default:
        return 'danger';
    }
  }

  private getCapacityStatusText(calc: CalculationResult): string {
    switch (calc.cableCapacityCheck.status) {
      case 'ok':
        return 'ausreichende Reserve';
      case 'warning':
        return 'erhoehte Auslastung';
      default:
        return 'Nachweis nicht erfuellt';
    }
  }

  private getClearanceTone(project: Project, minimumClearance: number): Tone {
    if (minimumClearance >= project.cableConfig.minGroundClearance) {
      return 'success';
    }

    if (minimumClearance >= project.cableConfig.minGroundClearance * 0.9) {
      return 'warning';
    }

    return 'danger';
  }

  private getWarningTone(warning: CalculationWarning): Tone {
    switch (warning.severity) {
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  private getTonePalette(tone: Tone): { fill: Rgb; border: Rgb } {
    switch (tone) {
      case 'success':
        return { fill: this.colors.successLight, border: this.colors.success };
      case 'warning':
        return { fill: this.colors.warningLight, border: this.colors.warning };
      case 'danger':
        return { fill: this.colors.dangerLight, border: this.colors.danger };
      default:
        return { fill: this.colors.panel, border: this.colors.border };
    }
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'draft':
        return 'Entwurf';
      case 'calculated':
        return 'Berechnet';
      case 'exported':
        return 'Exportiert';
      default:
        return status;
    }
  }

  private getApprovalText(status?: Project['approvalStatus']): string {
    switch (status) {
      case 'approved':
        return 'Freigegeben';
      case 'for-review':
        return 'Zur Pruefung';
      default:
        return 'Entwurfsstand';
    }
  }

  private getMethodText(method: string): string {
    switch (method) {
      case 'parabolic':
        return 'Parabel-Naeherung';
      case 'catenary':
        return 'Kettenlinie';
      case 'catenary-piecewise':
        return 'Kettenlinie stueckweise';
      case 'global-elastic-catenary':
        return 'Global elastische Mehrfeld-Kettenlinie';
      default:
        return method;
    }
  }

  private getCalculationModeText(mode: Project['calculationMode'] | CalculationResult['calculationMode']): string {
    return mode === 'engineering' ? 'Engineering' : 'Planning';
  }

  private getCableTypeText(project: Project): string {
    return project.cableConfig.cableType === 'carrying' ? 'Tragseil' : 'Kombiseil';
  }

  private getCableMaterialText(project: Project): string {
    return project.cableConfig.cableMaterial === 'steel' ? 'Stahl' : 'Synthetik';
  }

  private hasStartPoint(project: Project): boolean {
    return project.startPoint.lat !== 0 || project.startPoint.lng !== 0;
  }

  private hasEndPoint(project: Project): boolean {
    return !!project.endPoint && (project.endPoint.lat !== 0 || project.endPoint.lng !== 0);
  }

  private getStartPointText(project: Project): string {
    if (!this.hasStartPoint(project)) {
      return '-';
    }

    return `${project.startPoint.lat.toFixed(5)}, ${project.startPoint.lng.toFixed(5)}`;
  }

  private getEndPointText(project: Project): string {
    if (!this.hasEndPoint(project)) {
      return '-';
    }

    return `${project.endPoint!.lat.toFixed(5)}, ${project.endPoint!.lng.toFixed(5)}`;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
  }

  private formatDate(date: Date | string): string {
    const parsed = new Date(date);
    return parsed.toLocaleDateString('de-AT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9\u00E4\u00F6\u00FC\u00C4\u00D6\u00DC\u00DF_-]/g, '_');
  }

  private applyTextColor(doc: jsPDF, color: Rgb): void {
    doc.setTextColor(color[0], color[1], color[2]);
  }

  private applyFillColor(doc: jsPDF, color: Rgb): void {
    doc.setFillColor(color[0], color[1], color[2]);
  }

  private applyDrawColor(doc: jsPDF, color: Rgb): void {
    doc.setDrawColor(color[0], color[1], color[2]);
  }
}
