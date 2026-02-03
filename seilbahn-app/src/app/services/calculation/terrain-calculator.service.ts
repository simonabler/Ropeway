import { Injectable } from '@angular/core';
import { TerrainSegment, TerrainProfile } from '../../models';

/**
 * Terrain Calculator Service
 * Calculates cumulative station lengths and terrain heights from segments
 */
@Injectable({
  providedIn: 'root'
})
export class TerrainCalculatorService {
  /**
   * Calculate cumulative values for all segments
   * @param segments Array of terrain segments with length and slope
   * @param startHeight Starting height/elevation in meters
   * @returns Updated segments with calculated station lengths and terrain heights
   */
  calculateCumulativeValues(segments: TerrainSegment[], startHeight: number = 0): TerrainSegment[] {
    let cumulativeLength = 0;
    let cumulativeHeight = startHeight;

    return segments.map((segment, index) => {
      // Calculate horizontal distance
      const horizontalLength = segment.lengthMeters;

      // Calculate height change from slope percentage
      // slope % = (height change / horizontal distance) * 100
      const heightChange = (segment.slopePercent / 100) * horizontalLength;

      // Update cumulative values
      cumulativeLength += horizontalLength;
      cumulativeHeight += heightChange;

      return {
        ...segment,
        segmentNumber: index + 1,
        stationLength: cumulativeLength,
        terrainHeight: cumulativeHeight
      };
    });
  }

  /**
   * Calculate terrain profile summary
   */
  calculateProfileSummary(segments: TerrainSegment[]): {
    totalLength: number;
    elevationChange: number;
    averageSlope: number;
    maxSlope: number;
    minSlope: number;
  } {
    if (segments.length === 0) {
      return {
        totalLength: 0,
        elevationChange: 0,
        averageSlope: 0,
        maxSlope: 0,
        minSlope: 0
      };
    }

    const totalLength = segments.reduce((sum, seg) => sum + seg.lengthMeters, 0);
    const firstHeight = segments[0].terrainHeight - this.calculateHeightChange(segments[0]);
    const lastHeight = segments[segments.length - 1].terrainHeight;
    const elevationChange = lastHeight - firstHeight;

    const slopes = segments.map(seg => seg.slopePercent);
    const maxSlope = Math.max(...slopes);
    const minSlope = Math.min(...slopes);

    // Calculate weighted average slope
    const totalHeightChange = segments.reduce(
      (sum, seg) => sum + this.calculateHeightChange(seg),
      0
    );
    const averageSlope = totalLength > 0 ? (totalHeightChange / totalLength) * 100 : 0;

    return {
      totalLength,
      elevationChange,
      averageSlope,
      maxSlope,
      minSlope
    };
  }

  /**
   * Get terrain height at specific station length (interpolated)
   * Alias: interpolateHeight
   */
  getTerrainHeightAt(segments: TerrainSegment[], stationLength: number): number {
    if (segments.length === 0) return 0;

    // If before first segment
    if (stationLength <= 0) {
      return segments[0].terrainHeight - this.calculateHeightChange(segments[0]);
    }

    // Find the segment containing this station length
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentStart = i === 0 ? 0 : segments[i - 1].stationLength;
      const segmentEnd = segment.stationLength;

      if (stationLength >= segmentStart && stationLength <= segmentEnd) {
        // Interpolate height within segment
        const segmentProgress = (stationLength - segmentStart) / (segmentEnd - segmentStart);
        const startHeight = i === 0
          ? segment.terrainHeight - this.calculateHeightChange(segment)
          : segments[i - 1].terrainHeight;
        const endHeight = segment.terrainHeight;

        return startHeight + (endHeight - startHeight) * segmentProgress;
      }
    }

    // If after last segment, return last height
    return segments[segments.length - 1].terrainHeight;
  }

  /**
   * Alias for getTerrainHeightAt (more intuitive name)
   */
  interpolateHeight(segments: TerrainSegment[], stationLength: number): number {
    return this.getTerrainHeightAt(segments, stationLength);
  }

  /**
   * Validate terrain segment
   */
  validateSegment(segment: TerrainSegment): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (segment.lengthMeters <= 0) {
      errors.push('Länge muss größer als 0 sein');
    }

    if (segment.lengthMeters > 1000) {
      errors.push('Länge sollte nicht größer als 1000m sein (Segment zu lang)');
    }

    if (Math.abs(segment.slopePercent) > 100) {
      errors.push('Steigung sollte zwischen -100% und +100% liegen');
    }

    if (Math.abs(segment.slopePercent) > 50) {
      errors.push('Warnung: Sehr steile Steigung (>50%)');
    }

    return {
      valid: errors.filter(e => !e.startsWith('Warnung:')).length === 0,
      errors
    };
  }

  /**
   * Create terrain profile from segments
   */
  createTerrainProfile(
    segments: TerrainSegment[],
    recordingMethod: 'manual' | 'gps' = 'manual'
  ): TerrainProfile {
    const summary = this.calculateProfileSummary(segments);

    return {
      segments,
      recordingMethod,
      totalLength: summary.totalLength,
      elevationChange: summary.elevationChange
    };
  }

  /**
   * Add a new segment to profile
   */
  addSegment(
    profile: TerrainProfile,
    lengthMeters: number,
    slopePercent: number,
    notes?: string
  ): TerrainProfile {
    const newSegment: TerrainSegment = {
      id: this.generateUUID(),
      segmentNumber: profile.segments.length + 1,
      lengthMeters,
      slopePercent,
      stationLength: 0, // Will be calculated
      terrainHeight: 0, // Will be calculated
      notes
    };

    const startHeight = profile.segments.length > 0
      ? profile.segments[profile.segments.length - 1].terrainHeight
      : 0;

    const updatedSegments = this.calculateCumulativeValues(
      [...profile.segments, newSegment],
      profile.segments.length > 0
        ? profile.segments[0].terrainHeight - this.calculateHeightChange(profile.segments[0])
        : 0
    );

    return this.createTerrainProfile(updatedSegments, profile.recordingMethod);
  }

  /**
   * Remove segment from profile
   */
  removeSegment(profile: TerrainProfile, segmentId: string): TerrainProfile {
    const filteredSegments = profile.segments.filter(seg => seg.id !== segmentId);

    const startHeight = filteredSegments.length > 0
      ? filteredSegments[0].terrainHeight - this.calculateHeightChange(filteredSegments[0])
      : 0;

    const updatedSegments = this.calculateCumulativeValues(filteredSegments, startHeight);

    return this.createTerrainProfile(updatedSegments, profile.recordingMethod);
  }

  /**
   * Update segment in profile
   */
  updateSegment(
    profile: TerrainProfile,
    segmentId: string,
    updates: Partial<Pick<TerrainSegment, 'lengthMeters' | 'slopePercent' | 'notes'>>
  ): TerrainProfile {
    const updatedSegments = profile.segments.map(seg =>
      seg.id === segmentId ? { ...seg, ...updates } : seg
    );

    const startHeight = updatedSegments.length > 0
      ? updatedSegments[0].terrainHeight - this.calculateHeightChange(updatedSegments[0])
      : 0;

    const recalculatedSegments = this.calculateCumulativeValues(updatedSegments, startHeight);

    return this.createTerrainProfile(recalculatedSegments, profile.recordingMethod);
  }

  /**
   * Calculate height change for a segment
   */
  private calculateHeightChange(segment: TerrainSegment): number {
    return (segment.slopePercent / 100) * segment.lengthMeters;
  }

  /**
   * Generate UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
