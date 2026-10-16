import { type Scale, fmt, ticks } from "./scale";

export function Axes({
  x,
  y,
  xDomain,
  yDomain,
  width,
  height,
  margin,
  xLabel,
  yLabel,
}: {
  x: Scale;
  y: Scale;
  xDomain: [number, number];
  yDomain: [number, number];
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  xLabel: string;
  yLabel: string;
}) {
  const xt = ticks(xDomain[0], xDomain[1], 6);
  const yt = ticks(yDomain[0], yDomain[1], 5);
  return (
    <g fontSize="11" fill="var(--muted)">
      {yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={margin.left} x2={width - margin.right} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={margin.left - 8} y={y(v)} dy="0.32em" textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      {xt.map((v) => (
        <text key={`x${v}`} x={x(v)} y={height - margin.bottom + 16} textAnchor="middle">
          {fmt(v)}
        </text>
      ))}
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        stroke="var(--border-strong)"
      />
      <text x={(margin.left + width - margin.right) / 2} y={height - 4} textAnchor="middle" fill="var(--text)" fontWeight={600}>
        {xLabel}
      </text>
      <text
        transform={`translate(12 ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`}
        textAnchor="middle"
        fill="var(--text)"
        fontWeight={600}
      >
        {yLabel}
      </text>
    </g>
  );
}
