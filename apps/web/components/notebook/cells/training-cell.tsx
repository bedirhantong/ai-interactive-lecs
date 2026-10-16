"use client";

import { BrainCircuit, Info } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs } from "@/components/ui/tabs";
import type { Algorithm, Dataset, TrainingCell as Cell } from "@/lib/content/schema";
import { knnTrainingPython, treePython, treeRules } from "@/lib/ml/codegen";
import { type RunResult, type TrainingConfig, runTraining } from "@/lib/ml/train";
import { studentLabels } from "@/lib/notebook/initial";
import type { TrainingState } from "@/lib/notebook/types";
import { cn } from "@/lib/cn";
import { CellFrame, ComputeBadge } from "../cell-frame";
import { useCellState, useNotebook, useNotebookStore } from "../context";
import { GeneratedCode } from "../generated-code";
import { Markdown } from "../markdown";
import { classInfo } from "./knn2d-experiment";
import { SyntheticNotice } from "./dataset-cell";

export const ALGORITHM_LABELS: Record<Algorithm, string> = { knn: "K-en yakın komşu", "decision-tree": "Karar ağacı" };
const MAX_RUNS = 8;

export const pct = (v: number) => `%${(Math.round(v * 1000) / 10).toLocaleString("tr-TR")}`;

export function runName(index: number) {
  return `Model ${String.fromCharCode(65 + index)}`;
}

export function describeConfig(config: TrainingConfig, dataset: Dataset) {
  const f = config.features.map((k) => dataset.features.find((x) => x.key === k)?.label ?? k).join(" + ");
  const setting = config.algorithm === "knn" ? `K=${config.k}${config.standardize ? ", ölçekli" : ""}` : `derinlik ${config.maxDepth}`;
  return { features: f, setting };
}

export function TrainingCell({ cell }: { cell: Cell }) {
  const store = useNotebookStore();
  const dataset = useNotebook((s) => s.datasets[cell.datasetId]);
  const state = useCellState<TrainingState>(cell.id);
  const lesson = useNotebook((s) => s.lesson);
  const cells = useNotebook((s) => s.cells);
  const overrides = useMemo(
    () => (cell.useStudentLabels ? studentLabels(lesson, cells, cell.datasetId) : null),
    [cell.useStudentLabels, cell.datasetId, lesson, cells],
  );
  const update = (fn: (s: TrainingState) => TrainingState) => store.getState().update<TrainingState>(cell.id, fn);
  const { labels, keys } = classInfo(dataset);
  const latest = state.runs[state.runs.length - 1];

  const config: TrainingConfig = {
    algorithm: state.algorithm,
    features: state.features,
    k: state.k,
    maxDepth: state.maxDepth,
    testPercent: state.testPercent,
    seed: state.seed,
    standardize: state.standardize,
  };

  const train = () => {
    if (state.features.length === 0) return;
    const run = runTraining(dataset.rows, dataset.target, keys, config, overrides ?? {});
    update((s) => ({ ...s, runs: [...s.runs, run].slice(-MAX_RUNS) }));
    const d = describeConfig(config, dataset);
    store.getState().addEvidence(cell.id, "model-trained", `${ALGORITHM_LABELS[config.algorithm]} (${d.features}; ${d.setting}) → test ${pct(run.testAccuracy)}`);
  };

  const featureLabels = (features: string[]) => features.map((k) => dataset.features.find((f) => f.key === k)?.label ?? k);

  const generated = useMemo(() => {
    if (state.algorithm === "knn") return knnTrainingPython({ dataFile: dataset.file, target: dataset.target, config });
    const treeRun = [...state.runs].reverse().find((r) => r.tree && r.config.algorithm === "decision-tree");
    if (!treeRun?.tree) return "# Önce bir karar ağacı eğit. Burada ağacın öğrendiği kurallar Python olarak görünecek.";
    return [
      `# ${runName(state.runs.indexOf(treeRun))} karar ağacının öğrendiği kurallar.`,
      "# Bu kodu model, eğitim verisinden kendisi çıkardı.",
      treePython(treeRun.tree, treeRun.config.features, labels),
      "",
      `print(tahmin_et(${treeRun.config.features.map((f) => `${f}=50`).join(", ")}))`,
    ].join("\n");
    // config is derived from state; listing state fields keeps this stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.algorithm, state.features, state.k, state.standardize, state.testPercent, state.seed, state.runs, dataset]);

  return (
    <CellFrame cell={cell} badges={<ComputeBadge kind="training" />}>
      {cell.instructions && <Markdown className="mb-4 text-[15px]">{cell.instructions}</Markdown>}
      {cell.showCode && (
        <Tabs
          className="mb-4 max-w-xs"
          label="Görünüm"
          value={state.view}
          onChange={(view) => update((s) => ({ ...s, view }))}
          items={[
            { id: "visual", label: "Görsel" },
            { id: "code", label: "Python" },
          ]}
        />
      )}

      {state.view === "code" && cell.showCode ? (
        <div className="space-y-3">
          {state.algorithm === "knn" ? (
            <p className="flex gap-1.5 text-xs text-muted">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Bu program görsel arayüzdeki ayarlarla aynı bölmeyi ve aynı KNN kurallarını kullanır. Çalıştırınca aynı test doğruluğunu bulmalısın.
            </p>
          ) : (
            <p className="flex gap-1.5 text-xs text-muted">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Karar ağacı, eğitim sırasında bu if/else kurallarını kendisi öğrenir.
            </p>
          )}
          <GeneratedCode
            cellId={cell.id}
            generated={generated}
            code={state.code}
            allowEditable={cell.allowEditableCode && state.algorithm === "knn"}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              {cell.algorithms.length > 1 && (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold">Algoritma</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {cell.algorithms.map((a) => (
                      <label
                        key={a}
                        className={cn(
                          "inline-flex h-9 cursor-pointer items-center rounded-lg border px-3 text-sm font-semibold",
                          state.algorithm === a ? "border-brand bg-brand-soft text-brand-strong" : "border-border hover:border-border-strong",
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`${cell.id}-algo`}
                          checked={state.algorithm === a}
                          onChange={() => update((s) => ({ ...s, algorithm: a }))}
                        />
                        {ALGORITHM_LABELS[a]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {cell.allowFeatureSelection && (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold">Özellikler (modelin baktığı ölçümler)</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {cell.featureOptions.map((key) => {
                      const f = dataset.features.find((x) => x.key === key);
                      const on = state.features.includes(key);
                      return (
                        <label
                          key={key}
                          title={f?.description}
                          className={cn(
                            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium",
                            on ? "bg-surface-2" : "border-border hover:border-border-strong",
                          )}
                          style={on ? { borderColor: "var(--cell-training)" } : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              update((s) => ({
                                ...s,
                                features: on ? s.features.filter((x) => x !== key) : cell.featureOptions.filter((x) => x === key || s.features.includes(x)),
                              }))
                            }
                          />
                          {f?.label ?? key}
                        </label>
                      );
                    })}
                  </div>
                  {state.features.length === 0 && <p className="mt-1 text-xs text-danger">En az bir özellik seç.</p>}
                </fieldset>
              )}
            </div>
            <div className="space-y-3">
              {state.algorithm === "knn" ? (
                <Slider label="K (komşu sayısı)" value={state.k} min={cell.k.min} max={cell.k.max} step={cell.k.step} onChange={(k) => update((s) => ({ ...s, k }))} />
              ) : (
                <Slider
                  label="En fazla derinlik"
                  value={state.maxDepth}
                  min={cell.maxDepth.min}
                  max={cell.maxDepth.max}
                  step={cell.maxDepth.step}
                  onChange={(maxDepth) => update((s) => ({ ...s, maxDepth }))}
                  hint="Ağaç en fazla kaç soru üst üste sorabilir?"
                />
              )}
              {cell.allowSplitControl && (
                <>
                  <Slider
                    label="Test için ayrılan"
                    value={state.testPercent}
                    min={10}
                    max={50}
                    step={5}
                    format={(v) => `%${v}`}
                    onChange={(testPercent) => update((s) => ({ ...s, testPercent }))}
                  />
                  <Slider
                    label="Bölme tohumu"
                    value={state.seed}
                    min={1}
                    max={9}
                    step={1}
                    onChange={(seed) => update((s) => ({ ...s, seed }))}
                    hint="Farklı bir tohum, örnekleri eğitim ve teste farklı dağıtır."
                  />
                  {state.algorithm === "knn" && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={state.standardize} onChange={(e) => update((s) => ({ ...s, standardize: e.target.checked }))} />
                      Ölçekle (her özelliği aynı büyüklüğe getir)
                    </label>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={train} disabled={state.features.length === 0} data-testid="train-button">
              <BrainCircuit aria-hidden className="size-4" />
              Modeli eğit
            </Button>
            {cell.useStudentLabels && overrides && Object.keys(overrides).length > 0 && (
              <span className="text-xs text-muted">Senin {Object.keys(overrides).length} etiketin eğitimde kullanılacak.</span>
            )}
          </div>

          {latest && <RunSummary run={latest} index={state.runs.length - 1} dataset={dataset} labels={labels} featureLabels={featureLabels} />}
          {state.runs.length > 1 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Deney geçmişi</div>
              <ol className="space-y-1 text-sm">
                {state.runs.map((run, i) => {
                  const d = describeConfig(run.config, dataset);
                  return (
                    <li key={run.id} className="flex flex-wrap items-center gap-x-2 rounded-lg px-2 py-1 odd:bg-surface-2">
                      <span className="font-semibold">{runName(i)}</span>
                      <span className="text-muted">
                        {ALGORITHM_LABELS[run.config.algorithm]} · {d.features} · {d.setting}
                      </span>
                      <span className="ml-auto font-mono font-semibold">test {pct(run.testAccuracy)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <SyntheticNotice dataset={dataset} />
        </div>
      )}
    </CellFrame>
  );
}

function RunSummary({
  run,
  index,
  dataset,
  labels,
  featureLabels,
}: {
  run: RunResult;
  index: number;
  dataset: Dataset;
  labels: Record<string, string>;
  featureLabels: (f: string[]) => string[];
}) {
  const rules = run.tree ? treeRules(run.tree, featureLabels(run.config.features), labels) : [];
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4" data-testid="run-summary">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{runName(index)} eğitildi</span>
        <Badge tone="neutral">
          {run.trainSize} eğitim · {run.testSize} test örneği
        </Badge>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Metric label="Test doğruluğu" value={run.testAccuracy} strong />
        <Metric label="Eğitim doğruluğu" value={run.trainAccuracy} />
      </div>
      {run.studentLabelsUsed > 0 && (
        <p className="mt-3 text-sm">
          Eğitimde senin {run.studentLabelsUsed} etiketin kullanıldı
          {run.studentLabelsWrong > 0 ? (
            <strong className="text-warning"> ({run.studentLabelsWrong} tanesi veri setindeki etiketten farklı).</strong>
          ) : (
            "."
          )}
        </p>
      )}
      {rules.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">Ağacın öğrendiği kurallar ({rules.length})</summary>
          <ul className="mt-2 space-y-1">
            {rules.map((r, i) => (
              <li key={i} className="font-mono text-xs">
                {r.conditions.length ? r.conditions.join(" ve ") : "Her zaman"} → <strong>{r.label}</strong>{" "}
                <span className="text-muted">({r.n} örnek)</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3 text-xs text-muted">
        Test örnekleri eğitimde hiç kullanılmadı. Değerlendirme her zaman veri setindeki gerçek etiketlerle yapılır.
        {dataset.synthetic && " Veri sentetiktir."}
      </p>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={cn(strong ? "font-semibold" : "text-muted")}>{label}</span>
        <span className={cn("font-mono tabular-nums", strong ? "text-xl font-bold" : "text-base")} data-testid={strong ? "test-accuracy" : undefined}>
          {pct(value)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: strong ? "var(--cell-training)" : "var(--subtle)" }} />
      </div>
    </div>
  );
}
