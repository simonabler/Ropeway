import { Injectable } from '@angular/core';
import { Project, TerrainSegment, Support, CablePoint } from '../../models';

/**
 * DXF Export Service
 * Generates DXF files for CAD software
 * Uses DXF R12 format for maximum compatibility
 */
@Injectable({
  providedIn: 'root'
})
export class DxfExportService {
  // Layer colors (AutoCAD color index)
  private readonly LAYER_TERRAIN = { name: 'TERRAIN', color: 30 }; // Orange
  private readonly LAYER_CABLE = { name: 'CABLE', color: 5 };     // Blue
  private readonly LAYER_SUPPORTS = { name: 'SUPPORTS', color: 3 }; // Green
  private readonly LAYER_ANNOTATIONS = { name: 'ANNOTATIONS', color: 7 }; // White/Black

  /**
   * Generate DXF file for project
   */
  generateDxf(project: Project): string {
    const sections: string[] = [];

    // HEADER section
    sections.push(this.generateHeader(project));

    // TABLES section (layers)
    sections.push(this.generateTables());

    // ENTITIES section (geometry)
    sections.push(this.generateEntities(project));

    // EOF
    sections.push('0\nEOF\n');

    return sections.join('');
  }

  /**
   * Download DXF file
   */
  downloadDxf(project: Project): void {
    const dxfContent = this.generateDxf(project);
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.sanitizeFilename(project.name)}_Profil.dxf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Generate HEADER section
   */
  private generateHeader(project: Project): string {
    const terrain = project.terrainProfile;
    const maxX = terrain.totalLength || 100;
    const maxY = this.getMaxHeight(terrain.segments, project.supports);

    return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
9
$INSBASE
10
0.0
20
0.0
30
0.0
9
$EXTMIN
10
0.0
20
0.0
30
0.0
9
$EXTMAX
10
${maxX.toFixed(2)}
20
${maxY.toFixed(2)}
30
0.0
9
$LIMMIN
10
0.0
20
0.0
9
$LIMMAX
10
${maxX.toFixed(2)}
20
${maxY.toFixed(2)}
0
ENDSEC
`;
  }

  /**
   * Generate TABLES section with layers
   */
  private generateTables(): string {
    const layers = [
      this.LAYER_TERRAIN,
      this.LAYER_CABLE,
      this.LAYER_SUPPORTS,
      this.LAYER_ANNOTATIONS
    ];

    let tableContent = `0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
${layers.length}
`;

    for (const layer of layers) {
      tableContent += `0
LAYER
2
${layer.name}
70
0
62
${layer.color}
6
CONTINUOUS
`;
    }

    tableContent += `0
ENDTAB
0
ENDSEC
`;

    return tableContent;
  }

  /**
   * Generate ENTITIES section
   */
  private generateEntities(project: Project): string {
    let entities = `0
SECTION
2
ENTITIES
`;

    // Draw terrain polyline
    entities += this.drawTerrainPolyline(project.terrainProfile.segments);

    // Draw supports
    entities += this.drawSupports(project.supports, project.terrainProfile.segments);

    // Draw cable line (if calculation exists)
    if (project.calculationResult?.cableLine) {
      entities += this.drawCableLine(project.calculationResult.cableLine);
    }

    // Draw annotations
    entities += this.drawAnnotations(project);

    entities += `0
ENDSEC
`;

    return entities;
  }

  /**
   * Draw terrain as polyline
   */
  private drawTerrainPolyline(segments: TerrainSegment[]): string {
    if (segments.length === 0) return '';

    let polyline = `0
POLYLINE
8
${this.LAYER_TERRAIN.name}
66
1
70
0
`;

    // Add vertices
    // Start at origin
    polyline += this.vertex(0, 0, this.LAYER_TERRAIN.name);

    for (const seg of segments) {
      polyline += this.vertex(seg.stationLength, seg.terrainHeight, this.LAYER_TERRAIN.name);
    }

    // Close polyline
    polyline += `0
SEQEND
8
${this.LAYER_TERRAIN.name}
`;

    return polyline;
  }

  /**
   * Draw supports as vertical lines
   */
  private drawSupports(supports: Support[], terrain: TerrainSegment[]): string {
    let entities = '';

    for (const sup of supports) {
      // Vertical line from terrain to top
      entities += this.line(
        sup.stationLength, sup.terrainHeight,
        sup.stationLength, sup.topElevation,
        this.LAYER_SUPPORTS.name
      );

      // Small cross at top
      const crossSize = 0.5;
      entities += this.line(
        sup.stationLength - crossSize, sup.topElevation,
        sup.stationLength + crossSize, sup.topElevation,
        this.LAYER_SUPPORTS.name
      );

      // Support number text
      entities += this.text(
        sup.stationLength, sup.topElevation + 1,
        `S${sup.supportNumber}`,
        this.LAYER_ANNOTATIONS.name,
        1.5
      );
    }

    return entities;
  }

  /**
   * Draw cable line
   */
  private drawCableLine(cableLine: CablePoint[]): string {
    if (cableLine.length < 2) return '';

    let polyline = `0
POLYLINE
8
${this.LAYER_CABLE.name}
66
1
70
0
`;

    for (const point of cableLine) {
      polyline += this.vertex(point.stationLength, point.height, this.LAYER_CABLE.name);
    }

    polyline += `0
SEQEND
8
${this.LAYER_CABLE.name}
`;

    return polyline;
  }

  /**
   * Draw annotations (title, scale info)
   */
  private drawAnnotations(project: Project): string {
    let annotations = '';

    const terrain = project.terrainProfile;
    const maxX = terrain.totalLength || 100;

    // Title
    annotations += this.text(
      0, -10,
      `Projekt: ${project.name}`,
      this.LAYER_ANNOTATIONS.name,
      3
    );

    // Scale info
    annotations += this.text(
      0, -15,
      `Länge: ${terrain.totalLength.toFixed(1)}m, Höhe: ${terrain.elevationChange.toFixed(1)}m`,
      this.LAYER_ANNOTATIONS.name,
      2
    );

    // X-axis labels
    const xStep = Math.ceil(maxX / 10 / 10) * 10; // Round to nearest 10
    for (let x = 0; x <= maxX; x += xStep) {
      annotations += this.text(
        x, -3,
        `${x}`,
        this.LAYER_ANNOTATIONS.name,
        1.5
      );
    }

    return annotations;
  }

  /**
   * Generate LINE entity
   */
  private line(x1: number, y1: number, x2: number, y2: number, layer: string): string {
    return `0
LINE
8
${layer}
10
${x1.toFixed(4)}
20
${y1.toFixed(4)}
30
0.0
11
${x2.toFixed(4)}
21
${y2.toFixed(4)}
31
0.0
`;
  }

  /**
   * Generate VERTEX entity for polyline
   */
  private vertex(x: number, y: number, layer: string): string {
    return `0
VERTEX
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
`;
  }

  /**
   * Generate TEXT entity
   */
  private text(x: number, y: number, content: string, layer: string, height: number = 2): string {
    return `0
TEXT
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
40
${height.toFixed(2)}
1
${content}
`;
  }

  /**
   * Get maximum height from terrain and supports
   */
  private getMaxHeight(segments: TerrainSegment[], supports: Support[]): number {
    let maxHeight = 10;

    for (const seg of segments) {
      if (seg.terrainHeight > maxHeight) {
        maxHeight = seg.terrainHeight;
      }
    }

    for (const sup of supports) {
      if (sup.topElevation > maxHeight) {
        maxHeight = sup.topElevation;
      }
    }

    return maxHeight + 20; // Add margin
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_');
  }
}
