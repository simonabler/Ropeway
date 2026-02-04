import { Component, ElementRef, OnInit, OnDestroy, ViewChild, signal, effect, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import * as d3 from 'd3';
import { ProjectStateService } from '../../../services/state/project-state.service';
import { TerrainSegment, Support, CalculationResult, CablePoint } from '../../../models';

interface ChartPoint {
  x: number;
  y: number;
}

interface CriticalPoint {
  x: number;
  cableHeight: number;
  terrainHeight: number;
  clearance: number;
  spanIndex: number;
}

interface AnchorPointData {
  type: 'start' | 'end';
  x: number;
  terrainY: number;
  anchorY: number;
  forces: {
    horizontal: number;      // kN
    verticalEmpty: number;   // kN
    verticalLoaded: number;  // kN
    resultantEmpty: number;  // kN
    resultantLoaded: number; // kN
    angleEmpty: number;      // degrees
    angleLoaded: number;     // degrees
  };
}

interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  innerWidth: number;
  innerHeight: number;
}

/**
 * Profile Chart Component
 * D3.js visualization of terrain, cable line, and supports
 * With interactive cable simulation controls
 */
@Component({
  selector: 'app-profile-chart',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-chart.html',
  styleUrl: './profile-chart.scss',
  standalone: true
})
export class ProfileChart implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: false }) chartContainer!: ElementRef<HTMLDivElement>;

  // State from services
  private _terrain;
  private _supports;
  private _calculation;

  // Chart state
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private chartGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private xScale: d3.ScaleLinear<number, number> | null = null;
  private yScale: d3.ScaleLinear<number, number> | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private currentTransform: d3.ZoomTransform = d3.zoomIdentity;

  // Tooltip
  private tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined> | null = null;

  // Responsive
  private resizeObserver: ResizeObserver | null = null;
  private dimensions: ChartDimensions = {
    width: 0,
    height: 0,
    margin: { top: 20, right: 20, bottom: 50, left: 60 },
    innerWidth: 0,
    innerHeight: 0
  };

  // UI State
  hasData = signal(false);
  isZoomed = signal(false);
  isFullscreen = signal(false);
  private chartInitialized = false;

  // === Cable Simulation Controls ===
  // Horizontal tension (pre-tension in kN)
  horizontalTension = signal(10); // kN
  minTension = 5;
  maxTension = 50;

  // Load position (0-100% of total length)
  loadPositionPercent = signal(50);

  // Point load (N)
  pointLoad = signal(5000); // 5kN = 500kg
  minLoad = 0;
  maxLoad = 20000; // 20kN

  // Cable weight per meter (N/m)
  cableWeight = signal(15); // N/m (approx. 1.5 kg/m)
  private lastProjectId: string | null = null;
  private pointLoadDirty = false;

  // Display options
  showEmptyCable = signal(true);
  showLoadedCable = signal(true);
  showCriticalPoint = signal(true);

  // Calculated critical point
  criticalPoint = signal<CriticalPoint | null>(null);

  // Anchor points with forces
  startAnchor = signal<AnchorPointData | null>(null);
  endAnchor = signal<AnchorPointData | null>(null);
  showAnchorForces = signal(true);

  constructor(private projectStateService: ProjectStateService) {
    this._terrain = toSignal(this.projectStateService.terrain$, { initialValue: [] as TerrainSegment[] });
    this._supports = toSignal(this.projectStateService.supports$, { initialValue: [] as Support[] });
    this._calculation = toSignal(this.projectStateService.calculation$, { initialValue: null });

    // Effect to re-render chart when data changes
    effect(() => {
      const terrain = this._terrain();
      const supports = this._supports();
      const calculation = this._calculation();

      const hasTerrainData = terrain.length > 0;
      this.hasData.set(hasTerrainData);

      // Load cable config values
      const project = this.projectStateService.currentProject;
      if (project) {
        this.cableWeight.set(project.cableConfig.cableWeightPerMeter * 9.81); // kg/m to N/m
        const projectId = project.id;
        if (projectId !== this.lastProjectId) {
          this.lastProjectId = projectId;
          this.pointLoadDirty = false;
          this.pointLoad.set(project.cableConfig.maxLoad * 9.81); // kg to N
        } else if (!this.pointLoadDirty) {
          this.pointLoad.set(project.cableConfig.maxLoad * 9.81); // kg to N
        }
      }

      // Initialize chart when data becomes available and container exists
      if (hasTerrainData && !this.chartInitialized) {
        setTimeout(() => this.tryInitializeChart(), 0);
      } else if (this.svg && this.chartInitialized) {
        this.updateChart();
      }
    });
  }

  private tryInitializeChart(): void {
    if (this.chartContainer?.nativeElement && !this.chartInitialized) {
      this.initializeChart();
      this.setupResizeObserver();
      this.chartInitialized = true;
    }
  }

  get terrain(): TerrainSegment[] {
    return this._terrain();
  }

  get supports(): Support[] {
    return this._supports();
  }

  get calculation(): CalculationResult | null {
    return this._calculation();
  }

  // === Control Methods ===
  onTensionChange(value: number): void {
    this.horizontalTension.set(value);
    this.updateChart();
  }

  onLoadPositionChange(value: number): void {
    this.loadPositionPercent.set(value);
    this.updateChart();
  }

  onPointLoadChange(value: number): void {
    this.pointLoadDirty = true;
    this.pointLoad.set(value);
    this.updateChart();
  }

  toggleEmptyCable(): void {
    this.showEmptyCable.set(!this.showEmptyCable());
    this.updateChart();
  }

  toggleLoadedCable(): void {
    this.showLoadedCable.set(!this.showLoadedCable());
    this.updateChart();
  }

  toggleCriticalPoint(): void {
    this.showCriticalPoint.set(!this.showCriticalPoint());
    this.updateChart();
  }

  ngOnInit(): void {
    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
  }

  private onFullscreenChange(): void {
    this.isFullscreen.set(!!document.fullscreenElement);
    if (!document.fullscreenElement && this.chartContainer?.nativeElement) {
      // Resize after exiting fullscreen
      setTimeout(() => {
        const rect = this.chartContainer.nativeElement.getBoundingClientRect();
        this.handleResize(rect.width, rect.height);
      }, 100);
    }
  }

  ngAfterViewInit(): void {
    if (this.hasData() && !this.chartInitialized) {
      this.tryInitializeChart();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.tooltip) {
      this.tooltip.remove();
    }
    if (this.svg) {
      this.svg.remove();
    }
    this.chartInitialized = false;
  }

  private initializeChart(): void {
    if (!this.chartContainer?.nativeElement) {
      console.warn('ProfileChart: Container not available');
      return;
    }

    const container = this.chartContainer.nativeElement;
    const rect = container.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 300;

    this.updateDimensions(width, height);

    // Create SVG
    this.svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${this.dimensions.width} ${this.dimensions.height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Create clip path for chart area
    this.svg.append('defs')
      .append('clipPath')
      .attr('id', 'chart-clip')
      .append('rect')
      .attr('width', this.dimensions.innerWidth)
      .attr('height', this.dimensions.innerHeight);

    // Create main chart group
    this.chartGroup = this.svg.append('g')
      .attr('transform', `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);

    // Create groups for different layers (order matters for z-index)
    this.chartGroup.append('g').attr('class', 'grid-layer');
    this.chartGroup.append('g').attr('class', 'terrain-layer').attr('clip-path', 'url(#chart-clip)');
    this.chartGroup.append('g').attr('class', 'clearance-layer').attr('clip-path', 'url(#chart-clip)');
    this.chartGroup.append('g').attr('class', 'empty-cable-layer').attr('clip-path', 'url(#chart-clip)');
    this.chartGroup.append('g').attr('class', 'loaded-cable-layer').attr('clip-path', 'url(#chart-clip)');
    this.chartGroup.append('g').attr('class', 'cable-layer').attr('clip-path', 'url(#chart-clip)');
    this.chartGroup.append('g').attr('class', 'support-layer').attr('clip-path', 'url(#chart-clip)');
    this.chartGroup.append('g').attr('class', 'anchor-layer').attr('clip-path', 'url(#chart-clip)');
    this.chartGroup.append('g').attr('class', 'critical-layer').attr('clip-path', 'url(#chart-clip)');
    this.chartGroup.append('g').attr('class', 'x-axis');
    this.chartGroup.append('g').attr('class', 'y-axis');

    // Create tooltip
    this.tooltip = d3.select(container)
      .append('div')
      .attr('class', 'chart-tooltip')
      .style('opacity', 0);

    // Setup zoom behavior
    this.setupZoom();

    // Initial render
    this.updateChart();
  }

  private setupZoom(): void {
    if (!this.svg) return;

    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 10])
      .extent([[0, 0], [this.dimensions.innerWidth, this.dimensions.innerHeight]])
      .on('zoom', (event) => {
        this.currentTransform = event.transform;
        this.isZoomed.set(event.transform.k !== 1 || event.transform.x !== 0 || event.transform.y !== 0);
        this.applyZoom();
      });

    this.svg.call(this.zoom);
  }

  private applyZoom(): void {
    if (!this.xScale || !this.yScale || !this.chartGroup) return;

    const newXScale = this.currentTransform.rescaleX(this.xScale);
    const newYScale = this.currentTransform.rescaleY(this.yScale);

    this.chartGroup.select<SVGGElement>('.x-axis')
      .call(d3.axisBottom(newXScale).ticks(8));

    this.chartGroup.select<SVGGElement>('.y-axis')
      .call(d3.axisLeft(newYScale).ticks(6));

    this.renderAll(newXScale, newYScale);
  }

  resetZoom(): void {
    if (!this.svg || !this.zoom) return;

    this.svg.transition()
      .duration(300)
      .call(this.zoom.transform, d3.zoomIdentity);
  }

  /**
   * Toggle fullscreen mode for the chart
   */
  toggleFullscreen(): void {
    const container = this.chartContainer?.nativeElement?.parentElement;
    if (!container) return;

    if (!document.fullscreenElement) {
      // Enter fullscreen
      container.requestFullscreen?.()
        .then(() => {
          this.isFullscreen.set(true);
          // Trigger resize after entering fullscreen
          setTimeout(() => {
            const rect = container.getBoundingClientRect();
            this.handleResize(rect.width, rect.height);
          }, 100);
        })
        .catch(err => console.warn('Fullscreen not supported:', err));
    } else {
      // Exit fullscreen
      document.exitFullscreen?.()
        .then(() => {
          this.isFullscreen.set(false);
          // Trigger resize after exiting fullscreen
          setTimeout(() => {
            const rect = this.chartContainer.nativeElement.getBoundingClientRect();
            this.handleResize(rect.width, rect.height);
          }, 100);
        })
        .catch(err => console.warn('Exit fullscreen error:', err));
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.handleResize(width, height);
        }
      }
    });

    this.resizeObserver.observe(this.chartContainer.nativeElement);
  }

  private handleResize(width: number, height: number): void {
    this.updateDimensions(width, height);

    if (this.svg) {
      this.svg.attr('viewBox', `0 0 ${this.dimensions.width} ${this.dimensions.height}`);
      this.svg.select('#chart-clip rect')
        .attr('width', this.dimensions.innerWidth)
        .attr('height', this.dimensions.innerHeight);

      this.updateChart();
    }
  }

  private updateDimensions(width: number, height: number): void {
    this.dimensions.width = width;
    this.dimensions.height = Math.max(height, 250);
    this.dimensions.innerWidth = width - this.dimensions.margin.left - this.dimensions.margin.right;
    this.dimensions.innerHeight = this.dimensions.height - this.dimensions.margin.top - this.dimensions.margin.bottom;
  }

  private updateChart(): void {
    if (!this.chartGroup || this.terrain.length === 0) return;

    const terrainPoints = this.getTerrainPoints();
    const cablePoints = this.calculation?.cableLine || [];
    const emptyCablePoints = this.calculateEmptyCable();
    const loadedCablePoints = this.calculateLoadedCable();

    const xExtent = this.calculateXExtent(terrainPoints, cablePoints, emptyCablePoints, loadedCablePoints);
    const yExtent = this.calculateYExtent(terrainPoints, cablePoints, emptyCablePoints, loadedCablePoints);

    this.xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([0, this.dimensions.innerWidth])
      .nice();

    this.yScale = d3.scaleLinear()
      .domain(yExtent)
      .range([this.dimensions.innerHeight, 0])
      .nice();

    const xScaleZoomed = this.currentTransform.rescaleX(this.xScale);
    const yScaleZoomed = this.currentTransform.rescaleY(this.yScale);

    this.renderAxes(xScaleZoomed, yScaleZoomed);
    this.renderGrid(xScaleZoomed, yScaleZoomed);
    this.renderAll(xScaleZoomed, yScaleZoomed);
  }

  private renderAll(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    this.renderTerrain(xScale, yScale);
    this.renderClearanceZone(xScale, yScale);
    this.renderEmptyCable(xScale, yScale);
    this.renderLoadedCable(xScale, yScale);
    this.renderCable(xScale, yScale);
    this.renderSupports(xScale, yScale);
    this.calculateAnchorForces();
    this.renderAnchorPoints(xScale, yScale);
    this.renderCriticalPoint(xScale, yScale);
  }

  toggleAnchorForces(): void {
    this.showAnchorForces.set(!this.showAnchorForces());
    this.updateChart();
  }

  // === Cable Calculation Methods ===

  /**
   * Calculate empty cable (only cable weight, no load)
   * Uses parabolic approximation: y = 4f/L² * x * (L - x)
   */
  private calculateEmptyCable(): ChartPoint[] {
    const allPoints = this.getSupportPoints();

    if (allPoints.length < 2) return [];

    const points: ChartPoint[] = [];
    const H = this.horizontalTension() * 1000; // kN to N
    const w = this.cableWeight(); // N/m

    // For each span between supports
    for (let i = 0; i < allPoints.length - 1; i++) {
      const start = allPoints[i];
      const end = allPoints[i + 1];
      const L = end.x - start.x;

      if (L <= 0) continue;

      // Sag at midpoint: f = w * L^2 / (8 * H)
      const f = (w * L * L) / (8 * H);

      // Height difference
      const dh = end.y - start.y;

      // Generate points along span
      const numPoints = Math.max(20, Math.floor(L / 2));
      for (let j = 0; j <= numPoints; j++) {
        const t = j / numPoints;
        const x = start.x + t * L;
        const localX = t * L;

        // Parabolic sag + linear interpolation for height difference
        const sag = 4 * f * (localX / L) * (1 - localX / L);
        const y = start.y + t * dh - sag;

        points.push({ x, y });
      }
    }

    return points;
  }

  /**
   * Calculate loaded cable (cable weight + point load)
   * Point load creates V-shape deflection at load position
   */
  private calculateLoadedCable(): ChartPoint[] {
    const allPoints = this.getSupportPoints();

    if (allPoints.length < 2) {
      this.criticalPoint.set(null);
      return [];
    }

    const points: ChartPoint[] = [];
    const H = this.horizontalTension() * 1000; // kN to N
    const w = this.cableWeight(); // N/m
    const P = this.pointLoad(); // N
    const loadPercent = this.loadPositionPercent() / 100;

    const totalLength = allPoints[allPoints.length - 1].x - allPoints[0].x;
    if (totalLength <= 0) {
      this.criticalPoint.set(null);
      return [];
    }

    const loadX = allPoints[0].x + loadPercent * totalLength;
    let worstClearance = Infinity;
    let worstPoint: CriticalPoint | null = null;

    for (let spanIndex = 0; spanIndex < allPoints.length - 1; spanIndex++) {
      const start = allPoints[spanIndex];
      const end = allPoints[spanIndex + 1];
      const L = end.x - start.x;

      if (L <= 0) continue;

      const spanHasLoad = loadX >= start.x && loadX <= end.x;
      const a = spanHasLoad ? loadX - start.x : 0;
      const b = spanHasLoad ? end.x - loadX : 0;

      // Sag from distributed load
      const fDistributed = (w * L * L) / (8 * H);

      // Additional sag from point load at position a
      // Maximum deflection from point load: delta = P * a * b / (H * L)
      const fPointMax = spanHasLoad && a > 0 && b > 0 ? (P * a * b) / (H * L) : 0;

      // Height difference
      const dh = end.y - start.y;

      // Generate points along span
      const numPoints = Math.max(30, Math.floor(L / 2));
      for (let j = 0; j <= numPoints; j++) {
        const t = j / numPoints;
        const x = start.x + t * L;
        const localX = t * L;

        // Distributed load sag (parabolic)
        const sagDistributed = 4 * fDistributed * (localX / L) * (1 - localX / L);

        // Point load sag (triangular distribution, max at load position)
        let sagPoint = 0;
        if (spanHasLoad && fPointMax > 0) {
          if (localX <= a) {
            sagPoint = fPointMax * (localX / a);
          } else {
            sagPoint = fPointMax * ((L - localX) / b);
          }
        }

        const totalSag = sagDistributed + sagPoint;
        const y = start.y + t * dh - totalSag;

        points.push({ x, y });

        // Check clearance
        const terrainHeight = this.interpolateTerrainHeight(x);
        const clearance = y - terrainHeight;

        if (clearance < worstClearance) {
          worstClearance = clearance;
          worstPoint = {
            x,
            cableHeight: y,
            terrainHeight,
            clearance,
            spanIndex
          };
        }
      }
    }

    this.criticalPoint.set(worstPoint);
    return points;
  }

  /**
   * Get support points including start and end anchor points
   * Anchor points are at ground level (first and last terrain segment)
   */
  private getSupportPoints(): ChartPoint[] {
    const points: ChartPoint[] = [];

    // Start anchor - at ground level (terrain height = 0)
    points.push({ x: 0, y: 0 });

    // Supports
    for (const support of this.supports) {
      points.push({
        x: support.stationLength,
        y: support.topElevation
      });
    }

    // End anchor - at ground level (last terrain height)
    if (this.terrain.length > 0) {
      const lastTerrain = this.terrain[this.terrain.length - 1];
      points.push({
        x: lastTerrain.stationLength,
        y: lastTerrain.terrainHeight
      });
    }

    // Sort by x position
    return points.sort((a, b) => a.x - b.x);
  }

  /**
   * Calculate forces at anchor points (start and end)
   * Anchor points are at ground level (first and last terrain segment)
   * Forces include: horizontal (H), vertical (V), resultant (T), angle
   */
  private calculateAnchorForces(): void {
    if (this.terrain.length === 0) {
      this.startAnchor.set(null);
      this.endAnchor.set(null);
      return;
    }

    const H = this.horizontalTension() * 1000; // kN to N
    const w = this.cableWeight(); // N/m
    const P = this.pointLoad(); // N
    const loadPercent = this.loadPositionPercent() / 100;

    // Get total cable length
    const lastTerrain = this.terrain[this.terrain.length - 1];
    const totalLength = lastTerrain.stationLength;

    // Start anchor position - at ground level (first terrain point)
    const startX = 0;
    const startTerrainY = 0; // First terrain point is at 0
    const startAnchorY = 0;  // Anchor at ground level

    // End anchor position - at ground level (last terrain point)
    const endX = totalLength;
    const endTerrainY = lastTerrain.terrainHeight;
    const endAnchorY = lastTerrain.terrainHeight; // Anchor at ground level

    // Height difference and span
    const dh = endAnchorY - startAnchorY;
    const L = totalLength;

    // === Calculate vertical forces at anchors ===
    // For parabolic cable: V_start = w*L/2 - H*dh/L
    //                      V_end = w*L/2 + H*dh/L

    // Empty cable (only cable weight)
    const V_start_empty = (w * L / 2) - (H * dh / L);
    const V_end_empty = (w * L / 2) + (H * dh / L);

    // Loaded cable (cable weight + point load)
    // Point load at position a from start
    const a = loadPercent * L;
    const b = L - a;

    // Additional vertical forces from point load
    // V_start_load = P * b / L
    // V_end_load = P * a / L
    const V_start_load = P * b / L;
    const V_end_load = P * a / L;

    const V_start_loaded = V_start_empty + V_start_load;
    const V_end_loaded = V_end_empty + V_end_load;

    // Resultant forces
    const T_start_empty = Math.sqrt(H * H + V_start_empty * V_start_empty);
    const T_start_loaded = Math.sqrt(H * H + V_start_loaded * V_start_loaded);
    const T_end_empty = Math.sqrt(H * H + V_end_empty * V_end_empty);
    const T_end_loaded = Math.sqrt(H * H + V_end_loaded * V_end_loaded);

    // Angles (from horizontal)
    const angle_start_empty = Math.atan2(Math.abs(V_start_empty), H) * 180 / Math.PI;
    const angle_start_loaded = Math.atan2(Math.abs(V_start_loaded), H) * 180 / Math.PI;
    const angle_end_empty = Math.atan2(Math.abs(V_end_empty), H) * 180 / Math.PI;
    const angle_end_loaded = Math.atan2(Math.abs(V_end_loaded), H) * 180 / Math.PI;

    // Convert to kN
    const toKN = (n: number) => n / 1000;

    this.startAnchor.set({
      type: 'start',
      x: startX,
      terrainY: startTerrainY,
      anchorY: startAnchorY,
      forces: {
        horizontal: toKN(H),
        verticalEmpty: toKN(Math.abs(V_start_empty)),
        verticalLoaded: toKN(Math.abs(V_start_loaded)),
        resultantEmpty: toKN(T_start_empty),
        resultantLoaded: toKN(T_start_loaded),
        angleEmpty: angle_start_empty,
        angleLoaded: angle_start_loaded
      }
    });

    this.endAnchor.set({
      type: 'end',
      x: endX,
      terrainY: endTerrainY,
      anchorY: endAnchorY,
      forces: {
        horizontal: toKN(H),
        verticalEmpty: toKN(Math.abs(V_end_empty)),
        verticalLoaded: toKN(Math.abs(V_end_loaded)),
        resultantEmpty: toKN(T_end_empty),
        resultantLoaded: toKN(T_end_loaded),
        angleEmpty: angle_end_empty,
        angleLoaded: angle_end_loaded
      }
    });
  }

  /**
   * Render anchor points with visual distinction
   */
  private renderAnchorPoints(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const anchorLayer = this.chartGroup?.select('.anchor-layer');
    if (!anchorLayer) return;

    anchorLayer.selectAll('*').remove();

    const startAnchor = this.startAnchor();
    const endAnchor = this.endAnchor();

    if (!startAnchor && !endAnchor) return;

    const anchors = [startAnchor, endAnchor].filter(a => a !== null) as AnchorPointData[];

    // Anchor group
    const anchorGroups = anchorLayer.selectAll('.anchor-group')
      .data(anchors)
      .join('g')
      .attr('class', 'anchor-group');

    // Ground anchor base (triangle)
    anchorGroups.append('path')
      .attr('class', 'anchor-base')
      .attr('d', d => {
        const x = xScale(d.x);
        const y = yScale(d.terrainY);
        // Triangle pointing up
        return `M${x - 12},${y + 8} L${x + 12},${y + 8} L${x},${y - 4} Z`;
      })
      .attr('fill', '#795548')
      .attr('stroke', '#5D4037')
      .attr('stroke-width', 2);

    // Anchor pole (vertical line)
    anchorGroups.append('line')
      .attr('class', 'anchor-pole')
      .attr('x1', d => xScale(d.x))
      .attr('x2', d => xScale(d.x))
      .attr('y1', d => yScale(d.terrainY))
      .attr('y2', d => yScale(d.anchorY))
      .attr('stroke', '#795548')
      .attr('stroke-width', 4)
      .attr('stroke-linecap', 'round');

    // Anchor point (cable attachment)
    anchorGroups.append('circle')
      .attr('class', 'anchor-point')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.anchorY))
      .attr('r', 8)
      .attr('fill', '#FFC107')
      .attr('stroke', '#FF9800')
      .attr('stroke-width', 2);

    // Anchor symbol (inner circle)
    anchorGroups.append('circle')
      .attr('class', 'anchor-inner')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.anchorY))
      .attr('r', 4)
      .attr('fill', '#795548');

    // Label
    anchorGroups.append('text')
      .attr('class', 'anchor-label')
      .attr('x', d => xScale(d.x))
      .attr('y', d => yScale(d.anchorY) - 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#795548')
      .text(d => d.type === 'start' ? 'Tal-Anker' : 'Berg-Anker');

    // Force arrows and values (if enabled)
    if (this.showAnchorForces()) {
      this.renderAnchorForceArrows(anchorLayer, anchors, xScale, yScale);
    }

    // Add tooltips
    anchorGroups.select('.anchor-point')
      .on('mouseenter', (event, d) => {
        const forceInfo = this.showLoadedCable() ?
          `Max. Kraft: ${d.forces.resultantLoaded.toFixed(1)} kN\nWinkel: ${d.forces.angleLoaded.toFixed(1)}°` :
          `Kraft: ${d.forces.resultantEmpty.toFixed(1)} kN\nWinkel: ${d.forces.angleEmpty.toFixed(1)}°`;
        this.showTooltip(event,
          `${d.type === 'start' ? 'Tal' : 'Berg'}-Ankerpunkt\n` +
          `H: ${d.forces.horizontal.toFixed(1)} kN\n` +
          forceInfo);
      })
      .on('mouseleave', () => this.hideTooltip());
  }

  /**
   * Render force arrows at anchor points
   */
  private renderAnchorForceArrows(
    layer: d3.Selection<d3.BaseType, unknown, null, undefined>,
    anchors: AnchorPointData[],
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ): void {
    const arrowSize = 40;
    const showLoaded = this.showLoadedCable();

    for (const anchor of anchors) {
      const x = xScale(anchor.x);
      const y = yScale(anchor.anchorY);

      const angle = showLoaded ? anchor.forces.angleLoaded : anchor.forces.angleEmpty;
      const force = showLoaded ? anchor.forces.resultantLoaded : anchor.forces.resultantEmpty;

      // Direction: start anchor pulls outward (left), end anchor pulls outward (right)
      const direction = anchor.type === 'start' ? -1 : 1;
      const angleRad = (direction > 0 ? angle : 180 - angle) * Math.PI / 180;

      // Arrow end point
      const endX = x + direction * arrowSize * Math.cos(angleRad * direction);
      const endY = y - arrowSize * Math.sin(angleRad);

      // Force arrow line
      layer.append('line')
        .attr('class', 'force-arrow-line')
        .attr('x1', x)
        .attr('y1', y)
        .attr('x2', endX)
        .attr('y2', endY)
        .attr('stroke', '#F44336')
        .attr('stroke-width', 3)
        .attr('marker-end', 'url(#force-arrow)');

      // Force value label
      const labelX = x + direction * (arrowSize + 15);
      const labelY = y - 5;

      // Background for label
      layer.append('rect')
        .attr('x', labelX - (direction > 0 ? 0 : 55))
        .attr('y', labelY - 12)
        .attr('width', 55)
        .attr('height', 18)
        .attr('fill', '#F44336')
        .attr('rx', 3);

      layer.append('text')
        .attr('class', 'force-label')
        .attr('x', labelX + (direction > 0 ? 27.5 : -27.5))
        .attr('y', labelY + 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('fill', 'white')
        .text(`${force.toFixed(1)} kN`);
    }

    // Add arrow marker definition if not exists
    const defs = this.svg?.select('defs');
    if (defs && defs.select('#force-arrow').empty()) {
      defs.append('marker')
        .attr('id', 'force-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#F44336');
    }
  }

  /**
   * Interpolate terrain height at given x position
   */
  private interpolateTerrainHeight(x: number): number {
    const terrainPoints = this.getTerrainPoints();

    if (terrainPoints.length === 0) return 0;
    if (x <= terrainPoints[0].x) return terrainPoints[0].y;
    if (x >= terrainPoints[terrainPoints.length - 1].x) {
      return terrainPoints[terrainPoints.length - 1].y;
    }

    for (let i = 0; i < terrainPoints.length - 1; i++) {
      if (x >= terrainPoints[i].x && x <= terrainPoints[i + 1].x) {
        const t = (x - terrainPoints[i].x) / (terrainPoints[i + 1].x - terrainPoints[i].x);
        return terrainPoints[i].y + t * (terrainPoints[i + 1].y - terrainPoints[i].y);
      }
    }

    return 0;
  }

  private getTerrainPoints(): ChartPoint[] {
    const points: ChartPoint[] = [{ x: 0, y: 0 }];

    for (const segment of this.terrain) {
      points.push({
        x: segment.stationLength,
        y: segment.terrainHeight
      });
    }

    return points;
  }

  private calculateXExtent(
    terrainPoints: ChartPoint[],
    cablePoints: CablePoint[],
    emptyCable: ChartPoint[],
    loadedCable: ChartPoint[]
  ): [number, number] {
    let maxX = 0;

    for (const p of terrainPoints) {
      if (p.x > maxX) maxX = p.x;
    }
    for (const p of cablePoints) {
      if (p.stationLength > maxX) maxX = p.stationLength;
    }
    for (const p of emptyCable) {
      if (p.x > maxX) maxX = p.x;
    }
    for (const p of loadedCable) {
      if (p.x > maxX) maxX = p.x;
    }
    for (const s of this.supports) {
      if (s.stationLength > maxX) maxX = s.stationLength;
    }

    return [0, maxX * 1.05];
  }

  private calculateYExtent(
    terrainPoints: ChartPoint[],
    cablePoints: CablePoint[],
    emptyCable: ChartPoint[],
    loadedCable: ChartPoint[]
  ): [number, number] {
    let minY = 0;
    let maxY = 0;

    for (const p of terrainPoints) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    for (const p of cablePoints) {
      if (p.height < minY) minY = p.height;
      if (p.height > maxY) maxY = p.height;
    }
    for (const p of emptyCable) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    for (const p of loadedCable) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    for (const s of this.supports) {
      if (s.terrainHeight < minY) minY = s.terrainHeight;
      if (s.topElevation > maxY) maxY = s.topElevation;
    }

    const padding = (maxY - minY) * 0.1 || 10;
    return [minY - padding, maxY + padding];
  }

  // === Render Methods ===

  private renderAxes(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    if (!this.chartGroup) return;

    this.chartGroup.select<SVGGElement>('.x-axis')
      .attr('transform', `translate(0,${this.dimensions.innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .call(g => {
        g.selectAll('.tick text').attr('font-size', '12px');
        g.select('.domain').attr('stroke', '#666');
      });

    this.chartGroup.select('.x-axis-label').remove();
    this.chartGroup.append('text')
      .attr('class', 'x-axis-label')
      .attr('x', this.dimensions.innerWidth / 2)
      .attr('y', this.dimensions.innerHeight + 40)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('fill', '#333')
      .text('Station (m)');

    this.chartGroup.select<SVGGElement>('.y-axis')
      .call(d3.axisLeft(yScale).ticks(6))
      .call(g => {
        g.selectAll('.tick text').attr('font-size', '12px');
        g.select('.domain').attr('stroke', '#666');
      });

    this.chartGroup.select('.y-axis-label').remove();
    this.chartGroup.append('text')
      .attr('class', 'y-axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -this.dimensions.innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('fill', '#333')
      .text('Höhe (m)');
  }

  private renderGrid(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const gridLayer = this.chartGroup?.select('.grid-layer');
    if (!gridLayer) return;

    gridLayer.selectAll('*').remove();

    gridLayer.selectAll('.grid-line-h')
      .data(yScale.ticks(6))
      .join('line')
      .attr('class', 'grid-line-h')
      .attr('x1', 0)
      .attr('x2', this.dimensions.innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '3,3');

    gridLayer.selectAll('.grid-line-v')
      .data(xScale.ticks(8))
      .join('line')
      .attr('class', 'grid-line-v')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', this.dimensions.innerHeight)
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '3,3');
  }

  private renderTerrain(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const terrainLayer = this.chartGroup?.select('.terrain-layer');
    if (!terrainLayer) return;

    terrainLayer.selectAll('*').remove();

    const terrainPoints = this.getTerrainPoints();
    if (terrainPoints.length < 2) return;

    const areaGenerator = d3.area<ChartPoint>()
      .x(d => xScale(d.x))
      .y0(this.dimensions.innerHeight)
      .y1(d => yScale(d.y))
      .curve(d3.curveLinear);

    terrainLayer.append('path')
      .datum(terrainPoints)
      .attr('class', 'terrain-area')
      .attr('d', areaGenerator)
      .attr('fill', '#8B4513')
      .attr('fill-opacity', 0.3);

    const lineGenerator = d3.line<ChartPoint>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .curve(d3.curveLinear);

    terrainLayer.append('path')
      .datum(terrainPoints)
      .attr('class', 'terrain-line')
      .attr('d', lineGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#5D4037')
      .attr('stroke-width', 2.5);

    terrainLayer.selectAll('.terrain-point')
      .data(terrainPoints.slice(1))
      .join('circle')
      .attr('class', 'terrain-point')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 4)
      .attr('fill', '#5D4037')
      .on('mouseenter', (event, d) => this.showTooltip(event, `Station: ${d.x.toFixed(1)}m\nHöhe: ${d.y.toFixed(1)}m`))
      .on('mouseleave', () => this.hideTooltip());
  }

  private renderClearanceZone(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const clearanceLayer = this.chartGroup?.select('.clearance-layer');
    if (!clearanceLayer) return;

    clearanceLayer.selectAll('*').remove();

    const project = this.projectStateService.currentProject;
    if (!project) return;

    const minClearance = project.cableConfig.minGroundClearance;
    const terrainPoints = this.getTerrainPoints();

    if (terrainPoints.length < 2) return;

    const clearancePoints = terrainPoints.map(p => ({
      x: p.x,
      y: p.y + minClearance
    }));

    const lineGenerator = d3.line<ChartPoint>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .curve(d3.curveLinear);

    clearanceLayer.append('path')
      .datum(clearancePoints)
      .attr('class', 'clearance-line')
      .attr('d', lineGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#FF9800')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.7);
  }

  /**
   * Render empty cable (no load)
   */
  private renderEmptyCable(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const layer = this.chartGroup?.select('.empty-cable-layer');
    if (!layer) return;

    layer.selectAll('*').remove();

    if (!this.showEmptyCable()) return;

    const cablePoints = this.calculateEmptyCable();
    if (cablePoints.length < 2) return;

    const lineGenerator = d3.line<ChartPoint>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    layer.append('path')
      .datum(cablePoints)
      .attr('class', 'empty-cable-line')
      .attr('d', lineGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#4CAF50')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4')
      .attr('opacity', 0.8);
  }

  /**
   * Render loaded cable (with point load)
   */
  private renderLoadedCable(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const layer = this.chartGroup?.select('.loaded-cable-layer');
    if (!layer) return;

    layer.selectAll('*').remove();

    if (!this.showLoadedCable()) return;

    const cablePoints = this.calculateLoadedCable();
    if (cablePoints.length < 2) return;

    const lineGenerator = d3.line<ChartPoint>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    layer.append('path')
      .datum(cablePoints)
      .attr('class', 'loaded-cable-line')
      .attr('d', lineGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#E91E63')
      .attr('stroke-width', 2.5);

    // Draw load indicator
    const loadX = this.getLoadPosition();
    const loadY = this.getLoadedCableHeightAt(loadX);

    if (loadX > 0 && loadY !== null) {
      // Load point
      layer.append('circle')
        .attr('class', 'load-point')
        .attr('cx', xScale(loadX))
        .attr('cy', yScale(loadY))
        .attr('r', 8)
        .attr('fill', '#E91E63')
        .attr('stroke', 'white')
        .attr('stroke-width', 2);

      // Load arrow
      layer.append('line')
        .attr('class', 'load-arrow')
        .attr('x1', xScale(loadX))
        .attr('x2', xScale(loadX))
        .attr('y1', yScale(loadY) + 10)
        .attr('y2', yScale(loadY) + 30)
        .attr('stroke', '#E91E63')
        .attr('stroke-width', 3)
        .attr('marker-end', 'url(#arrow)');

      // Load label
      layer.append('text')
        .attr('x', xScale(loadX))
        .attr('y', yScale(loadY) + 45)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', '#E91E63')
        .text(`${(this.pointLoad() / 1000).toFixed(1)} kN`);
    }
  }

  public getLoadPosition(): number {
    const allPoints = this.getSupportPoints();
    if (allPoints.length < 2) return 0;

    const totalLength = allPoints[allPoints.length - 1].x - allPoints[0].x;
    return allPoints[0].x + (this.loadPositionPercent() / 100) * totalLength;
  }

  private getLoadedCableHeightAt(x: number): number | null {
    const cablePoints = this.calculateLoadedCable();

    for (let i = 0; i < cablePoints.length - 1; i++) {
      if (x >= cablePoints[i].x && x <= cablePoints[i + 1].x) {
        const t = (x - cablePoints[i].x) / (cablePoints[i + 1].x - cablePoints[i].x);
        return cablePoints[i].y + t * (cablePoints[i + 1].y - cablePoints[i].y);
      }
    }

    return null;
  }

  private renderCable(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const cableLayer = this.chartGroup?.select('.cable-layer');
    if (!cableLayer) return;

    cableLayer.selectAll('*').remove();

    const cablePoints = this.calculation?.cableLine;
    if (!cablePoints || cablePoints.length < 2) return;

    // Convert cable points and add anchor points at ground level
    const chartPoints: ChartPoint[] = [];

    // Start anchor at ground level (x=0, y=0)
    chartPoints.push({ x: 0, y: 0 });

    // Add all cable points from calculation
    for (const p of cablePoints) {
      chartPoints.push({
        x: p.stationLength,
        y: p.height
      });
    }

    // End anchor at ground level (last terrain height)
    if (this.terrain.length > 0) {
      const lastTerrain = this.terrain[this.terrain.length - 1];
      chartPoints.push({
        x: lastTerrain.stationLength,
        y: lastTerrain.terrainHeight
      });
    }

    const lineGenerator = d3.line<ChartPoint>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    cableLayer.append('path')
      .datum(chartPoints)
      .attr('class', 'cable-line')
      .attr('d', lineGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#1976D2')
      .attr('stroke-width', 3);
  }

  private renderSupports(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const supportLayer = this.chartGroup?.select('.support-layer');
    if (!supportLayer) return;

    supportLayer.selectAll('*').remove();

    if (this.supports.length === 0) return;

    const supportGroups = supportLayer.selectAll('.support-group')
      .data(this.supports)
      .join('g')
      .attr('class', 'support-group');

    supportGroups.append('line')
      .attr('class', 'support-line')
      .attr('x1', d => xScale(d.stationLength))
      .attr('x2', d => xScale(d.stationLength))
      .attr('y1', d => yScale(d.terrainHeight))
      .attr('y2', d => yScale(d.topElevation))
      .attr('stroke', '#D32F2F')
      .attr('stroke-width', 3)
      .attr('stroke-linecap', 'round');

    supportGroups.append('circle')
      .attr('class', 'support-top')
      .attr('cx', d => xScale(d.stationLength))
      .attr('cy', d => yScale(d.topElevation))
      .attr('r', 6)
      .attr('fill', '#D32F2F')
      .on('mouseenter', (event, d) => this.showTooltip(event,
        `Stütze #${d.supportNumber}\nStation: ${d.stationLength.toFixed(1)}m\nHöhe: ${d.supportHeight.toFixed(1)}m\nOberkante: ${d.topElevation.toFixed(1)}m`))
      .on('mouseleave', () => this.hideTooltip());

    supportGroups.append('text')
      .attr('class', 'support-label')
      .attr('x', d => xScale(d.stationLength))
      .attr('y', d => yScale(d.topElevation) - 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#D32F2F')
      .text(d => `#${d.supportNumber}`);
  }

  /**
   * Render critical point (worst clearance)
   */
  private renderCriticalPoint(xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): void {
    const layer = this.chartGroup?.select('.critical-layer');
    if (!layer) return;

    layer.selectAll('*').remove();

    const critical = this.criticalPoint();
    if (!this.showCriticalPoint() || !critical) return;

    // Vertical line from terrain to cable
    layer.append('line')
      .attr('class', 'critical-line')
      .attr('x1', xScale(critical.x))
      .attr('x2', xScale(critical.x))
      .attr('y1', yScale(critical.terrainHeight))
      .attr('y2', yScale(critical.cableHeight))
      .attr('stroke', '#FF5722')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,2');

    // Critical point marker on cable
    layer.append('circle')
      .attr('class', 'critical-marker-cable')
      .attr('cx', xScale(critical.x))
      .attr('cy', yScale(critical.cableHeight))
      .attr('r', 6)
      .attr('fill', '#FF5722')
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

    // Critical point marker on terrain
    layer.append('circle')
      .attr('class', 'critical-marker-terrain')
      .attr('cx', xScale(critical.x))
      .attr('cy', yScale(critical.terrainHeight))
      .attr('r', 5)
      .attr('fill', '#FF5722')
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

    // Clearance label
    const midY = (critical.cableHeight + critical.terrainHeight) / 2;
    layer.append('rect')
      .attr('x', xScale(critical.x) + 8)
      .attr('y', yScale(midY) - 12)
      .attr('width', 55)
      .attr('height', 24)
      .attr('fill', '#FF5722')
      .attr('rx', 4);

    layer.append('text')
      .attr('x', xScale(critical.x) + 35)
      .attr('y', yScale(midY) + 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', 'white')
      .text(`${critical.clearance.toFixed(2)}m`);
  }

  private showTooltip(event: MouseEvent, content: string): void {
    if (!this.tooltip) return;

    const lines = content.split('\n');
    this.tooltip.html(lines.join('<br>'))
      .style('left', `${event.offsetX + 15}px`)
      .style('top', `${event.offsetY - 10}px`)
      .transition()
      .duration(100)
      .style('opacity', 1);
  }

  private hideTooltip(): void {
    if (!this.tooltip) return;

    this.tooltip.transition()
      .duration(100)
      .style('opacity', 0);
  }
}
