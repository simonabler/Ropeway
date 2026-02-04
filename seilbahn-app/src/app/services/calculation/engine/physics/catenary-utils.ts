export function solveCatenaryA(spanLength: number, sagM: number): number {
  const L = Math.max(spanLength, 0.01);
  const f = Math.max(sagM, 0.001);

  let low = 0.01;
  let high = Math.max(10, L * 1000);

  const sagAt = (a: number) => a * (Math.cosh(L / (2 * a)) - 1);

  // Expand high until it brackets the sag
  let sagHigh = sagAt(high);
  while (sagHigh > f && high < 1e7) {
    high *= 2;
    sagHigh = sagAt(high);
  }

  let sagLow = sagAt(low);
  while (sagLow < f && low > 1e-6) {
    low /= 2;
    sagLow = sagAt(low);
  }

  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const sagMid = sagAt(mid);
    if (sagMid > f) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}
