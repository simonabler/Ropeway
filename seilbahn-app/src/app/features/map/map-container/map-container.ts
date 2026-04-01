import { Component, OnInit, OnDestroy, signal, effect, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeafletMapService } from '../../../services/geo/leaflet-map.service';
import { GeolocationService } from '../../../services/geo/geolocation.service';
import { GeoPoint } from '../../../models';

/**
 * Map Container Component
 * Leaflet-based map for start point and direction selection
 */
@Component({
  selector: 'app-map-container',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map-container.html',
  styleUrl: './map-container.scss'
})
export class MapContainer implements OnInit, OnDestroy {
  @Output() pointsChanged = new EventEmitter<{ start: GeoPoint | null; azimuth: number }>();
  @Input() profileLengthMeters = 0;
  @Input() initialStartPoint: GeoPoint | null = null;
  @Input() initialAzimuth = 0;

  // Signals from services
  readonly startPoint;
  readonly azimuth;
  readonly gpsPosition;
  readonly gpsAccuracy;
  readonly gpsError;
  readonly isGpsTracking;

  // Local state
  readonly isLoading = signal(false);
  readonly showInstructions = signal(true);
  private emitChangesEnabled = false;

  constructor(
    private mapService: LeafletMapService,
    private geoService: GeolocationService
  ) {
    this.startPoint = this.mapService.startPoint;
    this.azimuth = this.mapService.azimuth;
    this.gpsPosition = this.geoService.currentPosition;
    this.gpsAccuracy = this.geoService.accuracy;
    this.gpsError = this.geoService.error;
    this.isGpsTracking = this.geoService.isTracking;

    // Emit changes when points change
    effect(() => {
      const start = this.startPoint();
      const az = this.azimuth();
      if (!this.emitChangesEnabled) return;
      this.pointsChanged.emit({ start, azimuth: az });
    });
  }

  ngOnInit(): void {
    // Initialize map after view is ready
    setTimeout(() => {
      this.initializeMap();
    }, 100);
  }

  ngOnDestroy(): void {
    this.geoService.stopTracking();
    this.mapService.destroyMap();
  }

  private initializeMap(): void {
    try {
      this.mapService.initMap('map-container', {
        // Mobile-friendly options
        touchZoom: true,
        dragging: true
      });
      this.hydrateInitialMapState();
      this.emitChangesEnabled = true;
    } catch (error) {
      console.error('Failed to initialize map:', error);
    }
  }

  private hydrateInitialMapState(): void {
    if (this.initialStartPoint) {
      this.mapService.setMapState(this.initialStartPoint, this.initialAzimuth);
      this.showInstructions.set(false);
      return;
    }

    this.mapService.clearPoints();
    this.showInstructions.set(true);
  }

  /**
   * Get current GPS position and center map
   */
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

  /**
   * Use current GPS position as start point
   */
  async useGpsAsStart(): Promise<void> {
    this.isLoading.set(true);
    try {
      const position = await this.geoService.getCurrentPosition();
      this.mapService.setStartPoint(position);
      this.mapService.centerOn(position, 15);
      this.showInstructions.set(false);
    } catch (error) {
      console.error('GPS error:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Clear all points
   */
  clearPoints(): void {
    this.mapService.clearPoints();
    this.showInstructions.set(true);
  }

  /**
   * Get azimuth direction label
   */
  getAzimuthDirection(): string {
    const az = this.azimuth();
    if (az >= 337.5 || az < 22.5) return 'N';
    if (az >= 22.5 && az < 67.5) return 'NO';
    if (az >= 67.5 && az < 112.5) return 'O';
    if (az >= 112.5 && az < 157.5) return 'SO';
    if (az >= 157.5 && az < 202.5) return 'S';
    if (az >= 202.5 && az < 247.5) return 'SW';
    if (az >= 247.5 && az < 292.5) return 'W';
    if (az >= 292.5 && az < 337.5) return 'NW';
    return '';
  }

  /**
   * Format profile length
   */
  getProfileLengthFormatted(): string {
    const length = this.profileLengthMeters || 0;
    if (length >= 1000) {
      return `${(length / 1000).toFixed(2)} km`;
    }
    return `${Math.round(length)} m`;
  }

  /**
   * Format GPS accuracy
   */
  formatAccuracy(): string {
    return this.geoService.formatAccuracy();
  }

  /**
   * Check if GPS accuracy is good
   */
  isAccuracyGood(): boolean {
    return this.geoService.isAccuracyGood(20);
  }

  /**
   * Hide instructions
   */
  hideInstructions(): void {
    this.showInstructions.set(false);
  }
}
