"use client";

import { useRef } from "react";
import { Axes } from "./axes";
import { linearScale } from "./scale";

const W = 560;
const H = 420;
const M = { top: 12, right: 14, bottom: 40, left: 48 };

export interface PlanePoint {
  id: number;
  x: number;
  y: number;
  label: string;
}

export function KnnPlane({
  points,
  colors,
  probe,
  onProbe,
  neighborIds,
  boundary,
  prediction,
  xDomain,
  yDomain,
  xLabel,
  yLabel,
}: {
  points: PlanePoint[];
  colors: Record<string, string>;
  probe: { x: number; y: number };
  onProbe: (p: { x: number; y: number }) => void;
  neighborIds: number[];
  boundary: { nx: number; ny: number; labels: string[] } | null;
  prediction: string;
  xDomain: [number, number];
  yDomain: [number, number];
  xLabel: string;
  yLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const x = linearScale(xDomain, [M.left, W - M.right]);
  const y = linearScale(yDomain, [H - M.bottom, M.top]);
  const clamp = (v: number, [a, b]: [number, number]) => Math.max(a, Math.min(b, v));

  const toData = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return {
      x: Math.round(clamp(x.invert(pt.x), xDomain) * 10) / 10,
      y: Math.round(clamp(y.invert(pt.y), yDomain) * 10) / 10,
    };
  };

  const moveTo = (e: React.PointerEvent) => {
    const p = toData(e.clientX, e.clientY);
    if (p) onProbe(p);
  };

  const neighborSet = new Set(neighborIds);
  const cellW = (W - M.left - M.right) / (boundary?.nx ?? 1);
  const cellH = (H - M.top - M.bottom) / (boundary?.ny ?? 1);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-none select-none"
      role="group"
      aria-label={`${xLabel} ve ${yLabel} grafiği. Gizemli nesnenin tahmini: ${prediction}`}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => dragging.current && moveTo(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {boundary && (
        <g opacity={0.16}>
          {boundary.labels.map((label, i) => {
            const cx = i % boundary.nx;
            const cy = Math.floor(i / boundary.nx);
            return (
              <rect
                key={i}
                x={M.left + cx * cellW}
                y={H - M.bottom - (cy + 1) * cellH}
                width={cellW + 0.5}
                height={cellH + 0.5}
                fill={colors[label]}
              />
            );
          })}
        </g>
      )}
      <Axes x={x} y={y} xDomain={xDomain} yDomain={yDomain} width={W} height={H} margin={M} xLabel={xLabel} yLabel={yLabel} />
      {points
        .filter((p) => neighborSet.has(p.id))
        .map((p) => (
          <line
            key={`n${p.id}`}
            x1={x(probe.x)}
            y1={y(probe.y)}
            x2={x(p.x)}
            y2={y(p.y)}
            stroke={colors[p.label]}
            strokeWidth={2}
            strokeOpacity={0.8}
          />
        ))}
      {points.map((p) => (
        <circle
          key={p.id}
          cx={x(p.x)}
          cy={y(p.y)}
          r={neighborSet.has(p.id) ? 6.5 : 4.5}
          fill={colors[p.label]}
          fillOpacity={neighborSet.has(p.id) ? 1 : 0.7}
          stroke={neighborSet.has(p.id) ? "var(--text)" : "var(--surface)"}
          strokeWidth={neighborSet.has(p.id) ? 2 : 1}
        />
      ))}
      <g
        tabIndex={0}
        role="slider"
        aria-label={`Gizemli nesne. ${xLabel} ${probe.x}, ${yLabel} ${probe.y}. Ok tuşlarıyla taşı.`}
        aria-valuenow={probe.x}
        aria-valuetext={`${xLabel} ${probe.x}, ${yLabel} ${probe.y}`}
        className="cursor-grab outline-none"
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          const d: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          const delta = d[e.key];
          if (!delta) return;
          e.preventDefault();
          onProbe({ x: clamp(probe.x + delta[0], xDomain), y: clamp(probe.y + delta[1], yDomain) });
        }}
      >
        <circle cx={x(probe.x)} cy={y(probe.y)} r={13} fill="var(--surface)" fillOpacity={0.6} stroke="var(--text)" strokeWidth={3} />
        <circle cx={x(probe.x)} cy={y(probe.y)} r={5} fill={colors[prediction] ?? "var(--text)"} />
      </g>
    </svg>
  );
}
