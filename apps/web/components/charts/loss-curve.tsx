import { linearScale } from "./scale";

const W = 320;
const H = 120;
const M = { top: 10, right: 10, bottom: 22, left: 10 };

/** Training loss (MSE) per gradient-descent step. */
export function LossCurve({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const x = linearScale([0, values.length - 1], [M.left, W - M.right]);
  const y = linearScale([Math.min(0, min), max], [H - M.bottom, M.top]);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--border-strong)" />
      <path d={d} fill="none" stroke="var(--cell-training)" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={4} fill="var(--cell-training)" />
      <text x={M.left} y={H - 6} fontSize="10" fill="var(--muted)">
        adım 0
      </text>
      <text x={W - M.right} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor="end">
        adım {values.length - 1}
      </text>
    </svg>
  );
}
