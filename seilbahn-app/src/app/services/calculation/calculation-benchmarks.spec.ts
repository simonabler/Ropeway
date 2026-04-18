import { describe, expect, it } from 'vitest';
import { CableCalculatorService } from './cable-calculator.service';
import { buildBenchmarkFixtures } from './testing/benchmark-fixtures';

describe('Calculation benchmark fixtures', () => {
  const service = new CableCalculatorService();
  const fixtures = buildBenchmarkFixtures();

  it('runs five deterministic benchmark fixtures', () => {
    expect(fixtures).toHaveLength(5);
  });

  it.each(fixtures)('$id remains within the protected engineering/planning ranges', (fixture) => {
    const result = service.calculateCable(fixture.project);
    const minClearance = result.spans.reduce(
      (minimum, span) => Math.min(minimum, span.minClearance),
      Number.POSITIVE_INFINITY
    );

    expect(result.isValid).toBe(true);
    expect(result.method).toBe(fixture.expected.method);
    expect(result.calculationMode).toBe(fixture.expected.calculationMode);
    expect(result.spans).toHaveLength(fixture.expected.spanCount);
    expect(result.designCheck?.source).toBe(fixture.expected.designSource);
    expect(minClearance).toBeGreaterThanOrEqual(fixture.expected.minClearanceRange[0]);
    expect(minClearance).toBeLessThanOrEqual(fixture.expected.minClearanceRange[1]);
    expect(result.maxTension).toBeGreaterThanOrEqual(fixture.expected.maxTensionRange[0]);
    expect(result.maxTension).toBeLessThanOrEqual(fixture.expected.maxTensionRange[1]);
    expect(result.modelAssumptions.join(' ').toLowerCase()).toContain(
      fixture.expected.assumptionIncludes
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('keeps the offset planning piecewise fixture away from mid-span', () => {
    const piecewiseFixture = fixtures.find((fixture) => fixture.id === 'planning-piecewise-offset-load');
    const result = service.calculateCable(piecewiseFixture!.project);

    expect(result.designCheck?.governingSpanLoadRatio).toBeGreaterThan(0.2);
    expect(result.designCheck?.governingSpanLoadRatio).toBeLessThan(0.3);
  });

  it('keeps the engineering worst-case fixture at least as severe as the selected engineering case', () => {
    const selectedFixture = fixtures.find((fixture) => fixture.id === 'engineering-selected-multi-span');
    const worstCaseFixture = fixtures.find((fixture) => fixture.id === 'engineering-worst-case-envelope');
    const selectedResult = service.calculateCable(selectedFixture!.project);
    const worstCaseResult = service.calculateCable(worstCaseFixture!.project);

    expect(worstCaseResult.engineeringMetrics?.envelope?.sampledLoadCases).toBeGreaterThan(1);
    expect(worstCaseResult.maxTension).toBeGreaterThanOrEqual(selectedResult.maxTension);
    expect(worstCaseResult.designCheck?.source).toBe('worst-case-payload');
  });
});
