import { Injectable, signal } from '@angular/core';
import * as L from 'leaflet';
import { GeoPoint } from '../../models';
import { calculateBearing, hasGeoPoint } from './route-geometry';

@Injectable({
  providedIn: 'root'
})
export class LeafletMapService {
  private map: L.Map | null = null;
  private startMarker: L.Marker | null = null;
  private endMarker: L.Marker | null = null;
  private routeLine: L.Polyline | null = null;

  readonly isInitialized = signal(false);
  readonly startPoint = signal<GeoPoint | null>(null);
  readonly endPoint = signal<GeoPoint | null>(null);
  readonly azimuth = signal<number>(0);
  readonly routeCommitVersion = signal(0);

  private readonly defaultCenter: L.LatLngExpression = [46.6, 8.0];
  private readonly defaultZoom = 10;

  private readonly startIcon = L.divIcon({
    className: 'custom-marker start-marker',
    html: '<div class="marker-inner">S</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  private readonly endIcon = L.divIcon({
    className: 'custom-marker direction-marker',
    html: '<div class="marker-inner">E</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  initMap(containerId: string, options?: L.MapOptions): L.Map {
    if (this.map) {
      this.destroyMap();
    }

    this.map = L.map(containerId, {
      center: this.defaultCenter,
      zoom: this.defaultZoom,
      zoomControl: true,
      attributionControl: true,
      ...options
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(this.map);

    this.map.scrollWheelZoom.disable();
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      this.handleMapClick(event.latlng);
    });

    this.isInitialized.set(true);
    return this.map;
  }

  destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    this.startMarker = null;
    this.endMarker = null;
    this.routeLine = null;
    this.startPoint.set(null);
    this.endPoint.set(null);
    this.azimuth.set(0);
    this.isInitialized.set(false);
  }

  private handleMapClick(latlng: L.LatLng): void {
    const point: GeoPoint = { lat: latlng.lat, lng: latlng.lng };

    if (!this.startPoint()) {
      this.setStartPoint(point, true);
      return;
    }

    this.setEndPoint(point, true);
  }

  setMapState(startPoint: GeoPoint | null, endPoint: GeoPoint | null, azimuth: number = 0): void {
    if (!hasGeoPoint(startPoint)) {
      this.clearPoints(false);
      return;
    }

    this.startPoint.set(startPoint);
    this.endPoint.set(hasGeoPoint(endPoint) ? endPoint : null);
    this.azimuth.set(this.endPoint() ? calculateBearing(startPoint, this.endPoint()!) : azimuth || 0);

    this.renderStartMarker();
    this.renderEndMarker();
    this.updateRouteLine();

    if (this.map) {
      if (this.endPoint()) {
        const bounds = L.latLngBounds(
          [startPoint.lat, startPoint.lng],
          [this.endPoint()!.lat, this.endPoint()!.lng]
        );
        this.map.fitBounds(bounds.pad(0.2));
      } else {
        this.map.setView([startPoint.lat, startPoint.lng], Math.max(this.map.getZoom(), 13));
      }
    }
  }

  setStartPoint(point: GeoPoint, commit: boolean = false): void {
    this.startPoint.set(point);

    if (!this.endPoint()) {
      this.azimuth.set(0);
    } else {
      this.azimuth.set(calculateBearing(point, this.endPoint()!));
    }

    this.renderStartMarker();
    this.updateRouteLine();

    if (commit) {
      this.commitRouteChange();
    }
  }

  setEndPoint(point: GeoPoint, commit: boolean = false): void {
    if (!this.startPoint()) return;

    this.endPoint.set(point);
    this.azimuth.set(calculateBearing(this.startPoint()!, point));
    this.renderEndMarker();
    this.updateRouteLine();

    if (commit) {
      this.commitRouteChange();
    }
  }

  clearPoints(commit: boolean = true): void {
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

    this.startPoint.set(null);
    this.endPoint.set(null);
    this.azimuth.set(0);

    if (commit) {
      this.commitRouteChange();
    }
  }

  centerOn(point: GeoPoint, zoom?: number): void {
    if (this.map) {
      this.map.setView([point.lat, point.lng], zoom ?? this.map.getZoom());
    }
  }

  addGpsMarker(point: GeoPoint, accuracy?: number): L.CircleMarker {
    if (!this.map) {
      throw new Error('Map not initialized');
    }

    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 8,
      fillColor: '#2196F3',
      fillOpacity: 1,
      color: '#ffffff',
      weight: 2
    }).addTo(this.map);

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

  getMap(): L.Map | null {
    return this.map;
  }

  private renderStartMarker(): void {
    if (!this.map || !this.startPoint()) return;

    if (this.startMarker) {
      this.startMarker.remove();
    }

    const startPoint = this.startPoint()!;
    this.startMarker = L.marker([startPoint.lat, startPoint.lng], {
      icon: this.startIcon,
      draggable: true,
      title: 'Startpunkt'
    }).addTo(this.map);

    this.startMarker.on('drag', () => {
      const position = this.startMarker?.getLatLng();
      if (!position) return;

      const updatedStart = { lat: position.lat, lng: position.lng };
      this.startPoint.set(updatedStart);
      if (this.endPoint()) {
        this.azimuth.set(calculateBearing(updatedStart, this.endPoint()!));
      } else {
        this.azimuth.set(0);
      }
      this.updateRouteLine();
    });

    this.startMarker.on('dragend', () => {
      const position = this.startMarker?.getLatLng();
      if (!position) return;
      this.setStartPoint({ lat: position.lat, lng: position.lng }, true);
    });

    this.startMarker.bindPopup('Startpunkt');
  }

  private renderEndMarker(): void {
    if (!this.map) return;

    if (!this.endPoint()) {
      if (this.endMarker) {
        this.endMarker.remove();
        this.endMarker = null;
      }
      return;
    }

    if (this.endMarker) {
      this.endMarker.remove();
    }

    const endPoint = this.endPoint()!;
    this.endMarker = L.marker([endPoint.lat, endPoint.lng], {
      icon: this.endIcon,
      draggable: true,
      title: 'Endpunkt'
    }).addTo(this.map);

    this.endMarker.on('drag', () => {
      const position = this.endMarker?.getLatLng();
      const startPoint = this.startPoint();
      if (!position || !startPoint) return;

      const updatedEnd = { lat: position.lat, lng: position.lng };
      this.endPoint.set(updatedEnd);
      this.azimuth.set(calculateBearing(startPoint, updatedEnd));
      this.updateRouteLine();
    });

    this.endMarker.on('dragend', () => {
      const position = this.endMarker?.getLatLng();
      if (!position) return;
      this.setEndPoint({ lat: position.lat, lng: position.lng }, true);
    });

    this.endMarker.bindPopup('Endpunkt');
  }

  private updateRouteLine(): void {
    if (!this.map) return;

    const startPoint = this.startPoint();
    const endPoint = this.endPoint();

    if (!startPoint || !endPoint) {
      if (this.routeLine) {
        this.routeLine.remove();
        this.routeLine = null;
      }
      return;
    }

    const points: L.LatLngExpression[] = [
      [startPoint.lat, startPoint.lng],
      [endPoint.lat, endPoint.lng]
    ];

    if (this.routeLine) {
      this.routeLine.setLatLngs(points);
      return;
    }

    this.routeLine = L.polyline(points, {
      color: '#FF9800',
      weight: 3,
      opacity: 0.8,
      dashArray: '8, 4'
    }).addTo(this.map);
  }

  private commitRouteChange(): void {
    this.routeCommitVersion.update((value) => value + 1);
  }
}
