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
  private endMarker: L.Marker | null = null;
  private routeLine: L.Polyline | null = null;
  private azimuthLine: L.Polyline | null = null;

  // Signals for state
  readonly isInitialized = signal(false);
  readonly startPoint = signal<GeoPoint | null>(null);
  readonly endPoint = signal<GeoPoint | null>(null);
  readonly azimuth = signal<number>(0);

  // Default map center (Switzerland - Bernese Alps area)
  private readonly defaultCenter: L.LatLngExpression = [46.6, 8.0];
  private readonly defaultZoom = 10;

  // Marker icons
  private readonly startIcon = L.divIcon({
    className: 'custom-marker start-marker',
    html: '<div class="marker-inner">S</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  private readonly endIcon = L.divIcon({
    className: 'custom-marker end-marker',
    html: '<div class="marker-inner">E</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
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

    // Add Swiss topo layer (swisstopo)
    // Commented out - requires API key for production
    // L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg', {
    //   attribution: '&copy; swisstopo',
    //   maxZoom: 18
    // }).addTo(this.map);

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
      this.endMarker = null;
      this.routeLine = null;
      this.azimuthLine = null;
      this.isInitialized.set(false);
    }
  }

  /**
   * Handle map click - set start or end point
   */
  private handleMapClick(latlng: L.LatLng): void {
    const point: GeoPoint = {
      lat: latlng.lat,
      lng: latlng.lng
    };

    // If no start point, set start
    // If start exists but no end, set end
    // If both exist, reset and set new start
    if (!this.startPoint()) {
      this.setStartPoint(point);
    } else if (!this.endPoint()) {
      this.setEndPoint(point);
      this.updateRouteLine();
      this.calculateAzimuth();
    } else {
      // Reset both
      this.clearPoints();
      this.setStartPoint(point);
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
      this.startMarker.on('dragend', () => {
        const pos = this.startMarker?.getLatLng();
        if (pos) {
          this.startPoint.set({ lat: pos.lat, lng: pos.lng });
          this.updateRouteLine();
          this.calculateAzimuth();
        }
      });

      // Add popup
      this.startMarker.bindPopup('Startpunkt (Talstation)');
    }
  }

  /**
   * Set end point
   */
  setEndPoint(point: GeoPoint): void {
    this.endPoint.set(point);

    if (this.map) {
      // Remove existing marker
      if (this.endMarker) {
        this.endMarker.remove();
      }

      // Add new marker
      this.endMarker = L.marker([point.lat, point.lng], {
        icon: this.endIcon,
        draggable: true,
        title: 'Endpunkt'
      }).addTo(this.map);

      // Handle drag
      this.endMarker.on('dragend', () => {
        const pos = this.endMarker?.getLatLng();
        if (pos) {
          this.endPoint.set({ lat: pos.lat, lng: pos.lng });
          this.updateRouteLine();
          this.calculateAzimuth();
        }
      });

      // Add popup
      this.endMarker.bindPopup('Endpunkt (Bergstation)');
    }
  }

  /**
   * Update route line between points
   */
  private updateRouteLine(): void {
    if (!this.map) return;

    // Remove existing line
    if (this.routeLine) {
      this.routeLine.remove();
    }

    const start = this.startPoint();
    const end = this.endPoint();

    if (start && end) {
      this.routeLine = L.polyline(
        [[start.lat, start.lng], [end.lat, end.lng]],
        {
          color: '#2196F3',
          weight: 3,
          opacity: 0.8,
          dashArray: '10, 5'
        }
      ).addTo(this.map);
    }
  }

  /**
   * Calculate azimuth (bearing) from start to end
   */
  private calculateAzimuth(): void {
    const start = this.startPoint();
    const end = this.endPoint();

    if (start && end) {
      const azimuth = this.calculateBearing(start, end);
      this.azimuth.set(azimuth);
      this.drawAzimuthIndicator(azimuth);
    }
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

  /**
   * Draw azimuth indicator arrow
   */
  private drawAzimuthIndicator(azimuth: number): void {
    // Azimuth is already shown by the route line
    // Additional indicator could be added here if needed
  }

  /**
   * Clear all points and lines
   */
  clearPoints(): void {
    if (this.startMarker) {
      this.startMarker.remove();
      this.startMarker = null;
    }
    if (this.endMarker) {
      this.endMarker.remove();
      this.endMarker = null;
    }
    if (this.routeLine) {
      this.routeLine.remove();
      this.routeLine = null;
    }
    if (this.azimuthLine) {
      this.azimuthLine.remove();
      this.azimuthLine = null;
    }

    this.startPoint.set(null);
    this.endPoint.set(null);
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
   * Fit map to show both points
   */
  fitBounds(): void {
    const start = this.startPoint();
    const end = this.endPoint();

    if (this.map && start && end) {
      const bounds = L.latLngBounds(
        [start.lat, start.lng],
        [end.lat, end.lng]
      );
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  /**
   * Calculate approximate distance between points (meters)
   */
  getDistance(): number {
    const start = this.startPoint();
    const end = this.endPoint();

    if (start && end) {
      const R = 6371000; // Earth radius in meters
      const lat1 = this.toRadians(start.lat);
      const lat2 = this.toRadians(end.lat);
      const dLat = this.toRadians(end.lat - start.lat);
      const dLng = this.toRadians(end.lng - start.lng);

      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return Math.round(R * c);
    }

    return 0;
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
