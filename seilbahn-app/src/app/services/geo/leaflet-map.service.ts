import { Injectable, signal } from '@angular/core';
import * as L from 'leaflet';
import { GeoPoint } from '../../models';

/**
 * Leaflet Map Service
 * Wrapper for Leaflet map operations
 */
@Injectable({
  providedIn: 'root'
})
export class LeafletMapService {
  private map: L.Map | null = null;
  private startMarker: L.Marker | null = null;
  private directionMarker: L.Marker | null = null;
  private directionLine: L.Polyline | null = null;

  // Signals for state
  readonly isInitialized = signal(false);
  readonly startPoint = signal<GeoPoint | null>(null);
  readonly azimuth = signal<number>(0);

  // Default map center (Switzerland - Bernese Alps area)
  private readonly defaultCenter: L.LatLngExpression = [46.6, 8.0];
  private readonly defaultZoom = 10;

  private readonly directionHandleDistanceM = 200;

  // Marker icons
  private readonly startIcon = L.divIcon({
    className: 'custom-marker start-marker',
    html: '<div class="marker-inner">S</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  private readonly directionIcon = L.divIcon({
    className: 'custom-marker direction-marker',
    html: '<div class="marker-inner">R</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  /**
   * Initialize map in container element
   */
  initMap(containerId: string, options?: L.MapOptions): L.Map {
    // Clean up existing map
    if (this.map) {
      this.destroyMap();
    }

    // Create map
    this.map = L.map(containerId, {
      center: this.defaultCenter,
      zoom: this.defaultZoom,
      zoomControl: true,
      attributionControl: true,
      ...options
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(this.map);

    // Mobile-friendly: disable scroll zoom, use buttons only
    this.map.scrollWheelZoom.disable();

    // Handle map click for point selection
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.handleMapClick(e.latlng);
    });

    this.isInitialized.set(true);
    return this.map;
  }

  /**
   * Destroy map instance
   */
  destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.startMarker = null;
      this.directionMarker = null;
      this.directionLine = null;
      this.isInitialized.set(false);
    }
  }

  /**
   * Handle map click - set start or direction point
   */
  private handleMapClick(latlng: L.LatLng): void {
    const point: GeoPoint = {
      lat: latlng.lat,
      lng: latlng.lng
    };

    if (!this.startPoint()) {
      this.setStartPoint(point);
    } else {
      this.setDirectionPoint(point, true);
    }
  }

  /**
   * Set start point
   */
  setStartPoint(point: GeoPoint): void {
    this.startPoint.set(point);

    if (this.map) {
      // Remove existing marker
      if (this.startMarker) {
        this.startMarker.remove();
      }

      // Add new marker
      this.startMarker = L.marker([point.lat, point.lng], {
        icon: this.startIcon,
        draggable: true,
        title: 'Startpunkt'
      }).addTo(this.map);

      // Handle drag
      this.startMarker.on('drag', () => {
        const pos = this.startMarker?.getLatLng();
        if (pos) {
          this.startPoint.set({ lat: pos.lat, lng: pos.lng });
          this.updateDirectionHandleFromAzimuth();
        }
      });

      // Add popup
      this.startMarker.bindPopup('Startpunkt (Talstation)');
    }

    this.updateDirectionHandleFromAzimuth();
  }

  /**
   * Set complete map state from persisted project values
   */
  setMapState(startPoint: GeoPoint | null, azimuth: number = 0): void {
    if (!startPoint) {
      this.clearPoints();
      return;
    }

    this.azimuth.set(this.normalizeAzimuth(azimuth));
    this.setStartPoint(startPoint);
  }

  /**
   * Set azimuth and move direction handle accordingly
   */
  setAzimuth(azimuth: number): void {
    this.azimuth.set(this.normalizeAzimuth(azimuth));
    this.updateDirectionHandleFromAzimuth();
  }

  /**
   * Set direction point (handle)
   */
  private setDirectionPoint(point: GeoPoint, updateAzimuth: boolean): void {
    if (!this.map) return;

    const start = this.startPoint();
    if (start && updateAzimuth) {
      const azimuth = this.calculateBearing(start, point);
      this.azimuth.set(azimuth);
    }

    if (this.directionMarker) {
      this.directionMarker.setLatLng([point.lat, point.lng]);
    } else {
      this.directionMarker = L.marker([point.lat, point.lng], {
        icon: this.directionIcon,
        draggable: true,
        title: 'Richtung'
      }).addTo(this.map);

      this.directionMarker.on('drag', () => {
        const pos = this.directionMarker?.getLatLng();
        const startPoint = this.startPoint();
        if (pos && startPoint) {
          const azimuth = this.calculateBearing(startPoint, { lat: pos.lat, lng: pos.lng });
          this.azimuth.set(azimuth);
          this.updateDirectionLine();
        }
      });
    }

    this.updateDirectionLine();
  }

  /**
   * Update direction handle based on current azimuth
   */
  private updateDirectionHandleFromAzimuth(): void {
    const start = this.startPoint();
    if (!start) return;

    const az = this.azimuth();
    const handlePoint = this.calculateDestination(start, az, this.directionHandleDistanceM);
    this.setDirectionPoint(handlePoint, false);
  }

  /**
   * Update direction line between start and handle
   */
  private updateDirectionLine(): void {
    if (!this.map) return;

    const start = this.startPoint();
    const direction = this.getDirectionPoint();
    if (!start || !direction) return;

    const latlngs: L.LatLngExpression[] = [
      [start.lat, start.lng],
      [direction.lat, direction.lng]
    ];

    if (this.directionLine) {
      this.directionLine.setLatLngs(latlngs);
      return;
    }

    this.directionLine = L.polyline(latlngs, {
      color: '#FF9800',
      weight: 3,
      opacity: 0.8,
      dashArray: '8, 4'
    }).addTo(this.map);
  }

  private getDirectionPoint(): GeoPoint | null {
    if (!this.directionMarker) return null;
    const pos = this.directionMarker.getLatLng();
    return { lat: pos.lat, lng: pos.lng };
  }

  /**
   * Calculate bearing between two points (in degrees)
   */
  private calculateBearing(from: GeoPoint, to: GeoPoint): number {
    const lat1 = this.toRadians(from.lat);
    const lat2 = this.toRadians(to.lat);
    const dLng = this.toRadians(to.lng - from.lng);

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    let bearing = Math.atan2(y, x);
    bearing = this.toDegrees(bearing);
    bearing = (bearing + 360) % 360;

    return Math.round(bearing * 10) / 10;
  }

  private normalizeAzimuth(azimuth: number): number {
    const normalized = azimuth % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  /**
   * Calculate destination point from start, bearing and distance
   */
  private calculateDestination(from: GeoPoint, bearingDeg: number, distanceM: number): GeoPoint {
    const R = 6371000;
    const bearing = this.toRadians(bearingDeg);
    const lat1 = this.toRadians(from.lat);
    const lng1 = this.toRadians(from.lng);

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distanceM / R) +
      Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(bearing)
    );

    const lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(distanceM / R) * Math.cos(lat1),
      Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
      lat: this.toDegrees(lat2),
      lng: this.toDegrees(lng2)
    };
  }

  /**
   * Clear all points and lines
   */
  clearPoints(): void {
    if (this.startMarker) {
      this.startMarker.remove();
      this.startMarker = null;
    }
    if (this.directionMarker) {
      this.directionMarker.remove();
      this.directionMarker = null;
    }
    if (this.directionLine) {
      this.directionLine.remove();
      this.directionLine = null;
    }

    this.startPoint.set(null);
    this.azimuth.set(0);
  }

  /**
   * Center map on point
   */
  centerOn(point: GeoPoint, zoom?: number): void {
    if (this.map) {
      this.map.setView([point.lat, point.lng], zoom ?? this.map.getZoom());
    }
  }

  /**
   * Add current GPS position marker
   */
  addGpsMarker(point: GeoPoint, accuracy?: number): L.CircleMarker {
    if (!this.map) {
      throw new Error('Map not initialized');
    }

    // GPS position marker (blue dot)
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 8,
      fillColor: '#2196F3',
      fillOpacity: 1,
      color: '#ffffff',
      weight: 2
    }).addTo(this.map);

    // Accuracy circle
    if (accuracy) {
      L.circle([point.lat, point.lng], {
        radius: accuracy,
        fillColor: '#2196F3',
        fillOpacity: 0.1,
        color: '#2196F3',
        weight: 1
      }).addTo(this.map);
    }

    return marker;
  }

  /**
   * Get map instance
   */
  getMap(): L.Map | null {
    return this.map;
  }

  // Helper methods
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }
}
