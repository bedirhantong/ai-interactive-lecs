"use client";

import { Grid3x3 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { KnnPlane } from "@/components/charts/knn-plane";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { Dataset, ExperimentCell, Knn2dExperiment as Exp } from "@/lib/content/schema";
import { knn2dPython } from "@/lib/ml/codegen";
import { toExamples } from "@/lib/ml/data";
import { predictKnn, trainKnn } from "@/lib/ml/knn";
import { type Knn2dState, emptyEditable } from "@/lib/notebook/types";
import { useNotebookStore } from "../context";
import { GeneratedCode } from "../generated-code";
import { trNum } from "./linreg-experiment";

const GRID_X = 50;
const GRID_Y = 40;

export function classInfo(dataset: Dataset) {
  const labels: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const c of dataset.classes ?? []) {
    labels[c.key] = c.label;
    colors[c.key] = c.color;
  }
  return { labels, colors, keys: (dataset.classes ?? []).map((c) => c.key) };
}

export function Knn2dExperiment({ cell, exp, dataset, state }: { cell: ExperimentCell; exp: Exp; dataset: Dataset; state: Knn2dState }) {
  const store = useNotebookStore();
  const update = (fn: (s: Knn2dState) => Knn2dState) => store.getState().update<Knn2dState>(cell.id, fn);
  const { labels, colors } = classInfo(dataset);
  const [fx, fy] = exp.features;
  const fLabel = (key: string) => dataset.features.find((f) => f.key === key)?.label ?? key;
  const names = useMemo(() => new Map(dataset.rows.map((r) => [r.id, String(r[dataset.nameColumn ?? "id"])])), [dataset]);

  const examples = useMemo(() => toExamples(dataset.rows, [fx, fy], dataset.target), [dataset, fx, fy]);
  const model = useMemo(() => trainKnn(examples, state.k, false), [examples, state.k]);
  const result = predictKnn(model, [state.probe.x, state.probe.y]);
  const votes = new Map<string, number>();
  for (const n of result.neighbors) votes.set(n.label, (votes.get(n.label) ?? 0) + 1);

  const boundary = useMemo(() => {
    if (!state.showBoundary) return null;
    const out: string[] = [];
    for (let j = 0; j < GRID_Y; j++) {
      for (let i = 0; i < GRID_X; i++) {
        out.push(predictKnn(model, [((i + 0.5) / GRID_X) * 100, ((j + 0.5) / GRID_Y) * 100]).label);
      }
    }
    return { nx: GRID_X, ny: GRID_Y, labels: out };
  }, [model, state.showBoundary]);

  // Count a change after the student stops moving the probe / slider.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const s = store.getState().cells[cell.id] as Knn2dState;
      const label = predictKnn(trainKnn(examples, s.k, false), [s.probe.x, s.probe.y]).label;
      update((cur) => ({
        ...cur,
        changes: cur.changes + 1,
        seenLabels: cur.seenLabels.includes(label) ? cur.seenLabels : [...cur.seenLabels, label],
      }));
      store.getState().addEvidence(cell.id, "experiment-changed", `K=${s.k}, nesne (${s.probe.x}, ${s.probe.y}) → ${labels[label] ?? label}`);
    }, 500);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_15rem]">
      <div className="min-w-0">
        <KnnPlane
          points={examples.map((e) => ({ id: e.id, x: e.x[0], y: e.x[1], label: e.y }))}
          colors={colors}
          probe={state.probe}
          onProbe={(probe) => {
            update((s) => ({ ...s, probe }));
            commit();
          }}
          neighborIds={result.neighbors.map((n) => n.id)}
          boundary={boundary}
          prediction={result.label}
          xDomain={[0, 100]}
          yDomain={[0, 100]}
          xLabel={fLabel(fx)}
          yLabel={fLabel(fy)}
        />
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {(dataset.classes ?? []).map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
          <span className="text-muted">· Grafiğe dokun ya da halkayı sürükle. Klavyede ok tuşları.</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-2 p-3" aria-live="polite">
          <div className="text-xs font-semibold text-muted">Modelin tahmini</div>
          <div className="flex items-center gap-2 text-2xl font-bold" data-testid="knn-prediction">
            <span className="size-3.5 rounded-full" style={{ background: colors[result.label] }} />
            {labels[result.label] ?? result.label}
          </div>
          <div className="mt-2 space-y-1">
            {[...votes.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([label, n]) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0">{labels[label]}</span>
                  <span className="h-2 rounded-full" style={{ width: `${(n / state.k) * 100}%`, background: colors[label] }} />
                  <span className="font-mono">{n}</span>
                </div>
              ))}
          </div>
        </div>
        <Slider
          label="K (komşu sayısı)"
          value={state.k}
          min={exp.k.min}
          max={exp.k.max}
          step={exp.k.step}
          onChange={(k) => {
            update((s) => ({ ...s, k }));
            commit();
          }}
        />
        <Button
          variant={state.showBoundary ? "soft" : "secondary"}
          size="sm"
          aria-pressed={state.showBoundary}
          onClick={() => update((s) => ({ ...s, showBoundary: !s.showBoundary }))}
        >
          <Grid3x3 aria-hidden className="size-3.5" />
          {state.showBoundary ? "Bölgeleri gizle" : "Bölgeleri göster"}
        </Button>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">En yakın {state.k} komşu</div>
          <ol className="space-y-1 text-xs">
            {result.neighbors.map((n) => (
              <li key={n.id} className="flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: colors[n.label] }} />
                <span className="min-w-0 flex-1 truncate">{names.get(n.id)}</span>
                <span className="font-mono text-muted">{trNum(n.distance)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {cell.showCode && (
        <div className="lg:col-span-2">
          <GeneratedCode
            cellId={cell.id}
            generated={knn2dPython({ dataFile: dataset.file, target: dataset.target, features: exp.features, k: state.k, probe: state.probe })}
            code={emptyEditable()}
            allowEditable={false}
          />
        </div>
      )}
    </div>
  );
}
