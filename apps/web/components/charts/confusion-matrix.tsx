import { cn } from "@/lib/cn";

export function ConfusionMatrix({
  matrix,
  classes,
  labels,
}: {
  matrix: number[][];
  classes: string[];
  labels: Record<string, string>;
}) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-sm">
        <caption className="mb-1 text-left text-xs text-muted">
          Satırlar gerçek malzemeyi, sütunlar modelin tahminini gösterir. Köşegen dışındaki her sayı bir hatadır.
        </caption>
        <thead>
          <tr>
            <th className="p-1 text-left text-xs font-medium text-muted">Gerçek ↓ / Tahmin →</th>
            {classes.map((c) => (
              <th key={c} scope="col" className="px-2 py-1 text-xs font-semibold">
                {labels[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={classes[i]}>
              <th scope="row" className="pr-2 text-left text-xs font-semibold">
                {labels[classes[i]] ?? classes[i]}
              </th>
              {row.map((n, j) => {
                const diag = i === j;
                const alpha = n === 0 ? 0 : 0.15 + (0.7 * n) / max;
                return (
                  <td
                    key={j}
                    className={cn(
                      "h-10 min-w-12 rounded-md text-center font-mono tabular-nums",
                      n === 0 ? "text-subtle" : "font-semibold",
                    )}
                    style={{
                      background: n === 0 ? "var(--surface-2)" : `color-mix(in srgb, var(${diag ? "--success" : "--danger"}) ${Math.round(alpha * 100)}%, transparent)`,
                    }}
                  >
                    {n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
