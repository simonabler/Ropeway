import { Injectable, signal } from '@angular/core';
import { GeoPoint } from '../../models';

/**
 * Geolocation Service
 * Provides GPS access and location tracking
 */
@Injectable({
  providedIn: 'root'
})
export class GeolocationService {
  // Signals for reactive state
  readonly currentPosition = signal<GeoPoint | null>(null);
  readonly accuracy = signal<number | null>(null);
  readonly isTracking = signal(false);
  readonly error = signal<string | null>(null);
  readonly isSupported = signal(false);

  private watchId: number | null = null;

  constructor() {
    this.isSupported.set('geolocation' in navigator);
  }

  /**
   * Get current position once
   */
  getCurrentPosition(): Promise<GeoPoint> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        const errorMsg = 'Geolocation wird nicht unterstützt';
        this.error.set(errorMsg);
        reject(new Error(errorMsg));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const geoPoint = this.positionToGeoPoint(position);
          this.currentPosition.set(geoPoint);
          this.accuracy.set(position.coords.accuracy);
          this.error.set(null);
          resolve(geoPoint);
        },
        (err) => {
          const errorMsg = this.getErrorMessage(err);
          this.error.set(errorMsg);
          reject(new Error(errorMsg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }

  /**
   * Start continuous tracking
   */
  startTracking(): void {
    if (!this.isSupported() || this.isTracking()) {
      return;
    }

    this.isTracking.set(true);
    this.error.set(null);

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const geoPoint = this.positionToGeoPoint(position);
        this.currentPosition.set(geoPoint);
        this.accuracy.set(position.coords.accuracy);
        this.error.set(null);
      },
      (err) => {
        this.error.set(this.getErrorMessage(err));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  }

  /**
   * Stop tracking
   */
  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking.set(false);
  }

  /**
   * Convert GeolocationPosition to GeoPoint
   */
  private positionToGeoPoint(position: GeolocationPosition): GeoPoint {
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      elevation: position.coords.altitude ?? undefined,
      accuracy: position.coords.accuracy
    };
  }

  /**
   * Get human-readable error message
   */
  private getErrorMessage(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'GPS-Zugriff verweigert. Bitte erlauben Sie den Standortzugriff.';
      case error.POSITION_UNAVAILABLE:
        return 'Standort nicht verfügbar. Bitte prüfen Sie GPS-Signal.';
      case error.TIMEOUT:
        return 'GPS-Timeout. Bitte versuchen Sie es erneut.';
      default:
        return 'Unbekannter GPS-Fehler.';
    }
  }

  /**
   * Check if accuracy is good enough for field work
   * Returns true if accuracy is within threshold (default 20m)
   */
  isAccuracyGood(threshold = 20): boolean {
    const acc = this.accuracy();
    return acc !== null && acc <= threshold;
  }

  /**
   * Format accuracy for display
   */
  formatAccuracy(): string {
    const acc = this.accuracy();
    if (acc === null) return 'N/A';
    return `±${Math.round(acc)}m`;
  }
}
