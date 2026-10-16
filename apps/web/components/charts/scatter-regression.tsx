"use client";

import { useId } from "react";
import { Axes } from "./axes";
import { linearScale } from "./scale";

const W = 640;
const H = 340;
const M = { top: 14, right: 18, bottom: 40, left: 52 };

export function ScatterRegression({
  points,
  slope,
  intercept,
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  showResiduals = true,
  predictAt,
  ghostLine,
  description,
}: {
  points: { id: number; x: number; y: number }[];
  slope: number;
  intercept: number;
  xDomain: [number, number];
  yDomain: [number, number];
  xLabel: string;
  yLabel: string;
  showResiduals?: boolean;
  predictAt?: number;
  /** Optional comparison line (e.g. the student's manual line). */
  ghostLine?: { slope: number; intercept: number; label: string };
  description: string;
}) {
  const clipId = useId();
  const x = linearScale(xDomain, [M.left, W - M.right]);
  const y = linearScale(yDomain, [H - M.bottom, M.top]);
  const clampY = (v: number) => Math.max(M.top, Math.min(H - M.bottom, y(v)));
  const line = (s: number, b: number) => ({
    x1: x(xDomain[0]),
    y1: clampY(s * xDomain[0] + b),
    x2: x(xDomain[1]),
    y2: clampY(s * xDomain[1] + b),
  });
  const pred = predictAt !== undefined ? slope * predictAt + intercept : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label={description}>
      <defs>
        <clipPath id={clipId}>
          <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} />
        </clipPath>
      </defs>
      <Axes x={x} y={y} xDomain={xDomain} yDomain={yDomain} width={W} height={H} margin={M} xLabel={xLabel} yLabel={yLabel} />
      <g clipPath={`url(#${clipId})`}>
        {showResiduals &&
          points.map((p) => (
            <line
              key={`r${p.id}`}
              x1={x(p.x)}
              x2={x(p.x)}
              y1={y(p.y)}
              y2={y(slope * p.x + intercept)}
              stroke="var(--danger)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
            />
          ))}
        {ghostLine && (
          <line {...line(ghostLine.slope, ghostLine.intercept)} stroke="var(--subtle)" strokeWidth={2} strokeDasharray="6 5" />
        )}
        <line {...line(slope, intercept)} stroke="var(--brand)" strokeWidth={3} strokeLinecap="round" />
        {points.map((p) => (
          <circle key={p.id} cx={x(p.x)} cy={y(p.y)} r={5} fill="var(--accent)" fillOpacity={0.85} stroke="var(--surface)" strokeWidth={1.5} />
        ))}
        {pred !== null && predictAt !== undefined && (
          <g>
            <line x1={x(predictAt)} x2={x(predictAt)} y1={H - M.bottom} y2={clampY(pred)} stroke="var(--brand)" strokeDasharray="3 4" />
            <circle cx={x(predictAt)} cy={clampY(pred)} r={7} fill="var(--surface)" stroke="var(--brand)" strokeWidth={3} />
          </g>
        )}
      </g>
    </svg>
  );
}
