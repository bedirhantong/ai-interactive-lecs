export type Scale = ((v: number) => number) & { invert: (px: number) => number };

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = (r1 - r0) / (d1 - d0 || 1);
  const fn = ((v: number) => r0 + (v - d0) * k) as Scale;
  fn.invert = (px: number) => d0 + (px - r0) / k;
  return fn;
}

/** "Nice" tick values for an axis. */
export function ticks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace(".", ",");
