/** Simple linear regression: y = slope * x + intercept. */

export function predictLine(slope: number, intercept: number, x: number): number {
  return slope * x + intercept;
}

export function meanSquaredError(slope: number, intercept: number, xs: number[], ys: number[]): number {
  let total = 0;
  for (let i = 0; i < xs.length; i++) {
    const err = predictLine(slope, intercept, xs[i]) - ys[i];
    total += err * err;
  }
  return total / xs.length;
}

export function meanAbsoluteError(slope: number, intercept: number, xs: number[], ys: number[]): number {
  let total = 0;
  for (let i = 0; i < xs.length; i++) total += Math.abs(predictLine(slope, intercept, xs[i]) - ys[i]);
  return total / xs.length;
}

/** Closed-form ordinary least squares. */
export function fitLeastSquares(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

export interface GdStep {
  step: number;
  slope: number;
  intercept: number;
  mse: number;
}

/**
 * Real batch gradient descent on the MSE loss. x is standardized internally
 * (so one learning rate works for any unit) and the parameters are converted
 * back to the original units for display.
 */
export function gradientDescent(
  xs: number[],
  ys: number[],
  start: { slope: number; intercept: number },
  options: { learningRate: number; steps: number },
): GdStep[] {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n) || 1;
  const zs = xs.map((x) => (x - mean) / std);
  // Convert the starting line into standardized space.
  let w = start.slope * std;
  let b = start.intercept + start.slope * mean;
  const toOriginal = () => ({ slope: w / std, intercept: b - (w * mean) / std });
  const history: GdStep[] = [];
  const first = toOriginal();
  history.push({ step: 0, ...first, mse: meanSquaredError(first.slope, first.intercept, xs, ys) });
  for (let step = 1; step <= options.steps; step++) {
    let gw = 0;
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const err = w * zs[i] + b - ys[i];
      gw += (2 / n) * err * zs[i];
      gb += (2 / n) * err;
    }
    w -= options.learningRate * gw;
    b -= options.learningRate * gb;
    const p = toOriginal();
    history.push({ step, ...p, mse: meanSquaredError(p.slope, p.intercept, xs, ys) });
  }
  return history;
}
