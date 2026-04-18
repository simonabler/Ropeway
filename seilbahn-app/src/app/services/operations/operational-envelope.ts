import { OperationalEnvelope, Support } from '../../models';

export function normalizeOperationalEnvelope(
  envelope: Partial<OperationalEnvelope> | undefined,
  startStationLength: number,
  endStationLength: number
): OperationalEnvelope {
  const minStation = Math.min(startStationLength, endStationLength);
  const maxStation = Math.max(startStationLength, endStationLength);

  const start = clampStation(
    envelope?.activeMonitoredRangeStartStation ?? minStation,
    minStation,
    maxStation
  );
  const end = clampStation(
    envelope?.activeMonitoredRangeEndStation ?? maxStation,
    minStation,
    maxStation
  );

  return start <= end
    ? {
        activeMonitoredRangeStartStation: start,
        activeMonitoredRangeEndStation: end
      }
    : {
        activeMonitoredRangeStartStation: end,
        activeMonitoredRangeEndStation: start
      };
}

export function isStationInsideActiveMonitoredRange(
  envelope: OperationalEnvelope | undefined,
  stationLength: number
): boolean {
  if (!envelope) return true;
  return (
    stationLength >= envelope.activeMonitoredRangeStartStation &&
    stationLength <= envelope.activeMonitoredRangeEndStation
  );
}

export function deriveEdgeSupportTraversability(
  envelope: OperationalEnvelope | undefined,
  supports: Support[],
  startStationLength: number,
  endStationLength: number
): { firstSupportTraversable: boolean; lastSupportTraversable: boolean } {
  if (!envelope || supports.length === 0) {
    return {
      firstSupportTraversable: false,
      lastSupportTraversable: false
    };
  }

  const sortedSupports = [...supports].sort((left, right) => left.stationLength - right.stationLength);
  const firstSupport = sortedSupports[0];
  const lastSupport = sortedSupports[sortedSupports.length - 1];

  return {
    firstSupportTraversable:
      envelope.activeMonitoredRangeStartStation >= firstSupport.stationLength &&
      firstSupport.stationLength > startStationLength,
    lastSupportTraversable:
      envelope.activeMonitoredRangeEndStation <= lastSupport.stationLength &&
      lastSupport.stationLength < endStationLength
  };
}

export function getTraversableBoundaryStation(
  supports: Support[],
  boundary: 'start' | 'end',
  fallbackStation: number
): number {
  if (supports.length === 0) {
    return fallbackStation;
  }

  const sortedSupports = [...supports].sort((left, right) => left.stationLength - right.stationLength);
  return boundary === 'start'
    ? sortedSupports[0].stationLength
    : sortedSupports[sortedSupports.length - 1].stationLength;
}

function clampStation(value: number, minStation: number, maxStation: number): number {
  if (Number.isNaN(value)) return minStation;
  return Math.min(Math.max(value, minStation), maxStation);
}
