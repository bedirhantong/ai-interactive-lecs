"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DatasetCell as Cell, Dataset, DatasetRow } from "@/lib/content/schema";
import type { DatasetState } from "@/lib/notebook/types";
import { cn } from "@/lib/cn";
import { CellFrame } from "../cell-frame";
import { useCellState, useNotebook, useNotebookStore } from "../context";
import { Markdown } from "../markdown";
import { classInfo } from "./knn2d-experiment";
import { trNum } from "./linreg-experiment";

export function SyntheticNotice({ dataset }: { dataset: Dataset }) {
  if (!dataset.synthetic) return null;
  return (
    <details className="group rounded-lg border border-accent/25 bg-accent-soft px-3 py-2 text-xs">
      <summary className="cursor-pointer font-semibold text-accent">Sentetik veri: bu veri seti eğitim amacıyla üretildi</summary>
      <p className="mt-1 text-text">{dataset.provenance}</p>
    </details>
  );
}

function columnLabel(dataset: Dataset, key: string) {
  if (key === dataset.nameColumn) return "Nesne";
  if (key === dataset.target && dataset.task === "classification") return "Malzeme (etiket)";
  const f = dataset.features.find((x) => x.key === key);
  return f ? `${f.label}${f.unit ? ` (${f.unit})` : ""}` : key;
}

function formatCell(dataset: Dataset, key: string, value: string | number) {
  if (key === dataset.target && dataset.classes) return classInfo(dataset).labels[String(value)] ?? value;
  return typeof value === "number" ? value.toLocaleString("tr-TR") : value;
}

export function DatasetCell({ cell }: { cell: Cell }) {
  const dataset = useNotebook((s) => s.datasets[cell.datasetId]);
  return (
    <CellFrame cell={cell} badges={<Badge tone="accent">{dataset.rows.length} satır</Badge>}>
      {cell.instructions && <Markdown className="mb-3 text-[15px]">{cell.instructions}</Markdown>}
      <div className="mb-3">
        <SyntheticNotice dataset={dataset} />
      </div>
      {cell.labeling ? <LabelingTable cell={cell} dataset={dataset} /> : <ExploreTable cell={cell} dataset={dataset} />}
    </CellFrame>
  );
}

function ExploreTable({ cell, dataset }: { cell: Cell; dataset: Dataset }) {
  const columns = cell.columns ?? [dataset.nameColumn, ...dataset.features.map((f) => f.key), dataset.target].filter(
    (c, i, a): c is string => !!c && a.indexOf(c) === i,
  );
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [limit, setLimit] = useState(12);
  const { labels, colors } = classInfo(dataset);

  const rows = useMemo(() => {
    let out = dataset.rows;
    if (filter) out = out.filter((r) => String(r[dataset.target]) === filter);
    if (sort) {
      out = [...out].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "tr")) * sort.dir;
      });
    }
    return out;
  }, [dataset, filter, sort]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dataset.rows) m.set(String(r[dataset.target]), (m.get(String(r[dataset.target])) ?? 0) + 1);
    return m;
  }, [dataset]);

  const numericStats = dataset.task === "regression"
    ? dataset.features.map((f) => {
        const vals = dataset.rows.map((r) => Number(r[f.key]));
        return { ...f, min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((a, b) => a + b, 0) / vals.length };
      })
    : [];

  return (
    <div className="space-y-4">
      {cell.showDistribution && dataset.classes && (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-muted">Sınıf dağılımı</div>
          <div className="space-y-1.5">
            {dataset.classes.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0">{c.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full" style={{ width: `${((counts.get(c.key) ?? 0) / dataset.rows.length) * 100}%`, background: c.color }} />
                </div>
                <span className="w-8 text-right font-mono text-xs">{counts.get(c.key) ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {numericStats.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {numericStats.map((s) => (
            <div key={s.key} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
              <div className="font-semibold">{s.label}</div>
              <div className="font-mono text-muted">
                en düşük {trNum(s.min)} · ort. {trNum(s.mean)} · en yüksek {trNum(s.max)}
              </div>
            </div>
          ))}
        </div>
      )}

      {dataset.classes && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Malzemeye göre filtrele">
          <span className="mr-1 text-xs font-semibold text-muted">Filtre:</span>
          <FilterChip active={filter === ""} onClick={() => setFilter("")}>
            Tümü
          </FilterChip>
          {dataset.classes.map((c) => (
            <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)} color={colors[c.key]}>
              {labels[c.key]}
            </FilterChip>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs">
            <tr>
              {columns.map((key) => {
                const active = sort?.key === key;
                const Icon = active ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
                const desc = dataset.features.find((f) => f.key === key)?.description;
                return (
                  <th key={key} scope="col" className="px-3 py-2 font-semibold" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      title={desc}
                      className="inline-flex items-center gap-1 whitespace-nowrap hover:text-brand"
                      onClick={() => setSort(active && sort.dir === 1 ? { key, dir: -1 } : { key, dir: 1 })}
                    >
                      {columnLabel(dataset, key)}
                      <Icon aria-hidden className="size-3" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((row) => (
              <tr key={row.id} className="border-t border-border">
                {columns.map((key) => (
                  <td key={key} className={cn("px-3 py-1.5", typeof row[key] === "number" && "text-right font-mono tabular-nums")}>
                    {key === dataset.target && dataset.classes ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: colors[String(row[key])] }} />
                        {formatCell(dataset, key, row[key])}
                      </span>
                    ) : (
                      formatCell(dataset, key, row[key])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {Math.min(limit, rows.length)} / {rows.length} satır gösteriliyor
        </span>
        {limit < rows.length && (
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 24)}>
            Daha fazla göster
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
        active ? "border-text bg-text text-surface" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function LabelingTable({ cell, dataset }: { cell: Cell; dataset: Dataset }) {
  const store = useNotebookStore();
  const state = useCellState<DatasetState>(cell.id);
  const [compare, setCompare] = useState(false);
  const { labels, colors } = classInfo(dataset);
  const rows = (cell.labeling?.rowIds ?? []).map((id) => dataset.rows.find((r) => r.id === id)).filter((r): r is DatasetRow => !!r);
  const columns = (cell.columns ?? [dataset.nameColumn, ...dataset.features.map((f) => f.key)]).filter((c): c is string => !!c && c !== dataset.target);
  const done = rows.every((r) => state.labels[r.id]);
  const agree = rows.filter((r) => state.labels[r.id] === String(r[dataset.target])).length;

  const setLabel = (rowId: number, label: string) => {
    store.getState().update<DatasetState>(cell.id, (s) => ({ ...s, labels: { ...s.labels, [rowId]: label } }));
    const after = store.getState().cells[cell.id] as DatasetState;
    if (rows.every((r) => after.labels[r.id])) store.getState().addEvidence(cell.id, "labels-completed", `${rows.length} örnek etiketlendi`);
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((row) => {
          const chosen = state.labels[row.id];
          const correct = chosen === String(row[dataset.target]);
          return (
            <li key={row.id} className="rounded-xl border border-border p-3" data-testid={`label-row-${row.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{String(row[dataset.nameColumn ?? "id"])}</span>
                <span className="font-mono text-xs text-muted">
                  {columns
                    .filter((c) => c !== dataset.nameColumn)
                    .map((c) => `${dataset.features.find((f) => f.key === c)?.label ?? c}: ${formatCell(dataset, c, row[c])}`)
                    .join(" · ")}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`${String(row[dataset.nameColumn ?? "id"])} için etiket`}>
                {(dataset.classes ?? []).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={chosen === c.key}
                    onClick={() => setLabel(row.id, c.key)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors",
                      chosen === c.key ? "border-transparent text-white" : "border-border bg-surface hover:border-border-strong",
                    )}
                    style={chosen === c.key ? { background: colors[c.key] } : undefined}
                  >
                    {c.label}
                  </button>
                ))}
                {compare && chosen && (
                  <span className={cn("ml-1 inline-flex items-center gap-1 text-xs font-semibold", correct ? "text-success" : "text-danger")}>
                    {correct ? <CheckCircle2 aria-hidden className="size-4" /> : <XCircle aria-hidden className="size-4" />}
                    {correct ? "Veri setiyle aynı" : `Veri setinde: ${labels[String(row[dataset.target])]}`}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {done && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3 text-sm">
          <span>
            Tüm örnekleri etiketledin. Bu etiketler bu defterdeki model eğitiminde kullanılacak.
          </span>
          {!compare ? (
            <Button variant="secondary" size="sm" onClick={() => setCompare(true)}>
              Etiketlerimi veri setiyle karşılaştır
            </Button>
          ) : (
            <Badge tone={agree === rows.length ? "success" : "warning"}>
              {agree}/{rows.length} etiket veri setiyle aynı
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
