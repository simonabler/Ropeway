import { Component, OnInit, OnDestroy, OnChanges, signal, effect, Output, EventEmitter, Input, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeafletMapService } from '../../../services/geo/leaflet-map.service';
import { GeolocationService } from '../../../services/geo/geolocation.service';
import { GeoPoint } from '../../../models';

@Component({
  selector: 'app-map-container',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map-container.html',
  styleUrl: './map-container.scss'
})
export class MapContainer implements OnInit, OnDestroy, OnChanges {
  @Output() pointsChanged = new EventEmitter<{ start: GeoPoint | null; end: GeoPoint | null; azimuth: number }>();
  @Input() profileLengthMeters = 0;
  @Input() initialStartPoint: GeoPoint | null = null;
  @Input() initialEndPoint: GeoPoint | null = null;
  @Input() initialAzimuth = 0;

  readonly startPoint;
  readonly endPoint;
  readonly azimuth;
  readonly routeCommitVersion;
  readonly gpsPosition;
  readonly gpsAccuracy;
  readonly gpsError;
  readonly isGpsTracking;

  readonly isLoading = signal(false);
  readonly showInstructions = signal(true);
  private emitChangesEnabled = false;

  constructor(
    private mapService: LeafletMapService,
    private geoService: GeolocationService
  ) {
    this.startPoint = this.mapService.startPoint;
    this.endPoint = this.mapService.endPoint;
    this.azimuth = this.mapService.azimuth;
    this.routeCommitVersion = this.mapService.routeCommitVersion;
    this.gpsPosition = this.geoService.currentPosition;
    this.gpsAccuracy = this.geoService.accuracy;
    this.gpsError = this.geoService.error;
    this.isGpsTracking = this.geoService.isTracking;

    effect(() => {
      const revision = this.routeCommitVersion();
      const start = this.startPoint();
      const end = this.endPoint();
      const azimuth = this.azimuth();

      if (!this.emitChangesEnabled || revision === 0) {
        return;
      }

      this.pointsChanged.emit({ start, end, azimuth });
    });
  }

  ngOnInit(): void {
    setTimeout(() => {
      this.initializeMap();
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.mapService.isInitialized()) return;

    if (changes['initialStartPoint'] || changes['initialEndPoint'] || changes['initialAzimuth']) {
      this.syncMapStateFromInputs();
    }
  }

  ngOnDestroy(): void {
    this.geoService.stopTracking();
    this.mapService.destroyMap();
  }

  private initializeMap(): void {
    try {
      this.mapService.initMap('map-container', {
        touchZoom: true,
        dragging: true
      });
      this.syncMapStateFromInputs();
      this.emitChangesEnabled = true;
    } catch (error) {
      console.error('Failed to initialize map:', error);
    }
  }

  private syncMapStateFromInputs(): void {
    const currentStart = this.startPoint();
    const currentEnd = this.endPoint();

    if (
      this.samePoint(currentStart, this.initialStartPoint) &&
      this.samePoint(currentEnd, this.initialEndPoint) &&
      this.azimuth() === this.initialAzimuth
    ) {
      this.showInstructions.set(!this.initialStartPoint);
      return;
    }

    if (this.initialStartPoint) {
      this.mapService.setMapState(this.initialStartPoint, this.initialEndPoint, this.initialAzimuth);
      this.showInstructions.set(false);
      return;
    }

    this.mapService.clearPoints(false);
    this.showInstructions.set(true);
  }

  async locateMe(): Promise<void> {
    this.isLoading.set(true);
    try {
      const position = await this.geoService.getCurrentPosition();
      this.mapService.centerOn(position, 15);
      this.mapService.addGpsMarker(position, position.accuracy);
    } catch (error) {
      console.error('GPS error:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async useGpsAsStart(): Promise<void> {
    this.isLoading.set(true);
    try {
      const position = await this.geoService.getCurrentPosition();
      this.mapService.setStartPoint(position, true);
      this.mapService.centerOn(position, 15);
      this.showInstructions.set(false);
    } catch (error) {
      console.error('GPS error:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  clearPoints(): void {
    this.mapService.clearPoints(true);
    this.showInstructions.set(true);
  }

  getAzimuthDirection(): string {
    const azimuth = this.azimuth();
    if (azimuth >= 337.5 || azimuth < 22.5) return 'N';
    if (azimuth >= 22.5 && azimuth < 67.5) return 'NO';
    if (azimuth >= 67.5 && azimuth < 112.5) return 'O';
    if (azimuth >= 112.5 && azimuth < 157.5) return 'SO';
    if (azimuth >= 157.5 && azimuth < 202.5) return 'S';
    if (azimuth >= 202.5 && azimuth < 247.5) return 'SW';
    if (azimuth >= 247.5 && azimuth < 292.5) return 'W';
    if (azimuth >= 292.5 && azimuth < 337.5) return 'NW';
    return '';
  }

  getProfileLengthFormatted(): string {
    const length = this.profileLengthMeters || 0;
    if (length >= 1000) {
      return `${(length / 1000).toFixed(2)} km`;
    }
    return `${Math.round(length)} m`;
  }

  formatAccuracy(): string {
    return this.geoService.formatAccuracy();
  }

  isAccuracyGood(): boolean {
    return this.geoService.isAccuracyGood(20);
  }

  hideInstructions(): void {
    this.showInstructions.set(false);
  }

  private samePoint(a: GeoPoint | null, b: GeoPoint | null): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.lat === b.lat && a.lng === b.lng;
  }
}
