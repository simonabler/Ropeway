import { Support, EndStation } from '../../../../models';

/**
 * Span Geometry
 * Represents the geometric properties of a cable span between two supports
 */
export interface SpanGeometry {
  spanNumber: number;
  fromSupportId: string;
  toSupportId: string;
  fromHeight: number;           // Height of starting point (m)
  toHeight: number;             // Height of ending point (m)
  length: number;               // Horizontal span length (m)
  heightDiff: number;           // Height difference (positive = upward)
  angle: number;                // Span angle in degrees
}

/**
 * Calculate span geometries from supports
 */
export function calculateSpanGeometries(
  supports: Support[],
  startStation: EndStation,
  endStation: EndStation
): SpanGeometry[] {
  // Create array of all nodes (start + supports + end)
  const nodes: Array<{id: string; stationLength: number; height: number}> = [
    {
      id: 'start',
      stationLength: startStation.stationLength,
      height: startStation.terrainHeight + startStation.anchorPoint.heightAboveTerrain
    },
    ...[...supports]
      .sort((a, b) => a.stationLength - b.stationLength)
      .map(s => ({
        id: s.id,
        stationLength: s.stationLength,
        height: s.topElevation
      })),
    {
      id: 'end',
      stationLength: endStation.stationLength,
      height: endStation.terrainHeight + endStation.anchorPoint.heightAboveTerrain
    }
  ];

  // Calculate span geometries
  const spans: SpanGeometry[] = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];

    const length = to.stationLength - from.stationLength;
    const heightDiff = to.height - from.height;
    const angle = Math.atan2(heightDiff, length) * (180 / Math.PI);

    spans.push({
      spanNumber: i + 1,
      fromSupportId: from.id,
      toSupportId: to.id,
      fromHeight: from.height,
      toHeight: to.height,
      length,
      heightDiff,
      angle
    });
  }

  return spans;
}

/**
 * Calculate distance along inclined span
 */
export function calculateInclinedLength(horizontalLength: number, heightDiff: number): number {
  return Math.sqrt(horizontalLength * horizontalLength + heightDiff * heightDiff);
}

/**
 * Calculate span angle
 */
export function calculateSpanAngle(horizontalLength: number, heightDiff: number): number {
  return Math.atan2(heightDiff, horizontalLength) * (180 / Math.PI);
}
