"use client";

import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfusionMatrix } from "@/components/charts/confusion-matrix";
import { Callout } from "@/components/ui/callout";
import type { Dataset, EvaluationCell as Cell } from "@/lib/content/schema";
import { predictKnn } from "@/lib/ml/knn";
import { type Prediction, type RunResult, rebuildModel } from "@/lib/ml/train";
import { studentLabels } from "@/lib/notebook/initial";
import type { EvaluationState, TrainingState } from "@/lib/notebook/types";
import { cn } from "@/lib/cn";
import { CellFrame, ComputeBadge } from "../cell-frame";
import { useCellState, useNotebook, useNotebookStore } from "../context";
import { Markdown } from "../markdown";
import { classInfo } from "./knn2d-experiment";
import { ALGORITHM_LABELS, describeConfig, pct, runName } from "./training-cell";

export function EvaluationCell({ cell }: { cell: Cell }) {
  const store = useNotebookStore();
  const state = useCellState<EvaluationState>(cell.id);
  const source = useCellState<TrainingState>(cell.sourceCellId);
  const sourceCell = useNotebook((s) => s.lesson.cells.find((c) => c.id === cell.sourceCellId));
  const dataset = useNotebook((s) => (sourceCell?.type === "training" ? s.datasets[sourceCell.datasetId] : undefined));
  const [selected, setSelected] = useState<number | null>(null);

  if (!dataset || source?.kind !== "training") return null;
  const runs = source.runs;
  const runIndex = selected ?? runs.length - 1;
  const run = runs[runIndex];
  const { labels, keys } = classInfo(dataset);

  return (
    <CellFrame cell={cell} badges={<ComputeBadge kind="computation" />}>
      {cell.instructions && <Markdown className="mb-4 text-[15px]">{cell.instructions}</Markdown>}
      {!run ? (
        <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted">
          Henüz eğitilmiş bir model yok. Önce yukarıdaki model eğitimi hücresinde <strong>Modeli eğit</strong> düğmesine bas.
        </p>
      ) : (
        <div className="space-y-6">
          {runs.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="font-semibold">İncelenen model:</span>
              <select
                className="h-9 rounded-lg border border-border-strong bg-surface px-2"
                value={runIndex}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {runs.map((r, i) => (
                  <option key={r.id} value={i}>
                    {runName(i)} · test {pct(r.testAccuracy)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {cell.show.includes("accuracy") && <AccuracyBlock run={run} />}
          {cell.show.includes("compare") && runs.length > 1 && <CompareBlock runs={runs} dataset={dataset} />}
          {cell.show.includes("compare") && runs.length === 1 && (
            <p className="text-sm text-muted">Karşılaştırmak için ayarları değiştirip ikinci bir model eğit.</p>
          )}
          {cell.show.includes("confusion") && (
            <section>
              <h4 className="mb-2 font-semibold">Karışıklık matrisi</h4>
              <ConfusionMatrix matrix={run.confusion} classes={keys} labels={labels} />
            </section>
          )}
          {cell.show.includes("per-class") && <PerClassBlock run={run} labels={labels} />}
          {cell.show.includes("mistakes") && (
            <MistakesBlock
              run={run}
              dataset={dataset}
              inspected={state.inspected}
              sourceCellId={cell.sourceCellId}
              onInspect={(id) => {
                if (state.inspected.includes(id)) return;
                store.getState().update<EvaluationState>(cell.id, (s) => ({ ...s, inspected: [...s.inspected, id] }));
                store.getState().addEvidence(cell.id, "mistake-inspected", `Hatalı tahmin incelendi: örnek ${id}`);
              }}
            />
          )}
        </div>
      )}
    </CellFrame>
  );
}

function AccuracyBlock({ run }: { run: RunResult }) {
  const gap = run.trainAccuracy - run.testAccuracy;
  const correct = run.testPredictions.filter((p) => p.actual === p.predicted).length;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-xs font-semibold text-muted">Test doğruluğu</div>
          <div className="font-mono text-4xl font-bold tabular-nums">{pct(run.testAccuracy)}</div>
          <div className="text-xs text-muted">
            {run.testSize} test örneğinin {correct} tanesi doğru
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted">Eğitim doğruluğu</div>
          <div className="font-mono text-2xl font-semibold tabular-nums text-muted">{pct(run.trainAccuracy)}</div>
        </div>
      </div>
      {gap > 0.08 && (
        <Callout tone="warning" title="Ezber belirtisi">
          Model eğitim verisinde test verisinden belirgin şekilde daha başarılı. Eğitim örneklerini ezberliyor ve yeni örneklere iyi genellemiyor olabilir.
        </Callout>
      )}
    </section>
  );
}

function CompareBlock({ runs, dataset }: { runs: RunResult[]; dataset: Dataset }) {
  const best = Math.max(...runs.map((r) => r.testAccuracy));
  return (
    <section>
      <h4 className="mb-2 font-semibold">Sonuçları karşılaştır</h4>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs">
            <tr>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Algoritma</th>
              <th className="px-3 py-2">Özellikler</th>
              <th className="px-3 py-2">Ayar</th>
              <th className="px-3 py-2 text-right">Eğitim</th>
              <th className="px-3 py-2 text-right">Test</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => {
              const d = describeConfig(r.config, dataset);
              return (
                <tr key={r.id} className={cn("border-t border-border", r.testAccuracy === best && "bg-success-soft")}>
                  <td className="px-3 py-1.5 font-semibold">{runName(i)}</td>
                  <td className="px-3 py-1.5">{ALGORITHM_LABELS[r.config.algorithm]}</td>
                  <td className="px-3 py-1.5">{d.features}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{d.setting}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-muted">{pct(r.trainAccuracy)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold">{pct(r.testAccuracy)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-muted">Yeşil satır en yüksek test doğruluğu. Hangi değişiklik farkı yarattı?</p>
    </section>
  );
}

function PerClassBlock({ run, labels }: { run: RunResult; labels: Record<string, string> }) {
  const f = (v: number | null) => (v === null ? "—" : pct(v));
  return (
    <section>
      <h4 className="mb-1 font-semibold">Her malzeme için</h4>
      <p className="mb-2 text-xs text-muted">
        <strong>Kesinlik:</strong> Model “metal” dediğinde ne sıklıkla haklı? <strong>Duyarlılık:</strong> Gerçek metallerin ne kadarını buldu?
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-6">Malzeme</th>
              <th className="py-1 pr-6 text-right">Kesinlik</th>
              <th className="py-1 pr-6 text-right">Duyarlılık</th>
              <th className="py-1 text-right">Test örneği</th>
            </tr>
          </thead>
          <tbody>
            {run.perClass.map((c) => (
              <tr key={c.label} className="border-t border-border">
                <td className="py-1 pr-6 font-semibold">{labels[c.label] ?? c.label}</td>
                <td className="py-1 pr-6 text-right font-mono">{f(c.precision)}</td>
                <td className="py-1 pr-6 text-right font-mono">{f(c.recall)}</td>
                <td className="py-1 text-right font-mono">{c.support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MistakesBlock({
  run,
  dataset,
  inspected,
  sourceCellId,
  onInspect,
}: {
  run: RunResult;
  dataset: Dataset;
  inspected: number[];
  sourceCellId: string;
  onInspect: (id: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const mistakes = run.testPredictions.filter((p) => p.actual !== p.predicted);
  const { labels, colors } = classInfo(dataset);

  return (
    <section>
      <h4 className="mb-1 font-semibold">Hatalı tahminler ({mistakes.length})</h4>
      {mistakes.length === 0 ? (
        <p className="text-sm text-muted">Bu model test örneklerinin hepsini doğru tahmin etti. Bu, gerçek dünyada da hiç hata yapmayacağı anlamına gelir mi?</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">Bir örneğe tıkla ve modelin neden yanıldığını incele. Sence neden hata yaptı?</p>
          <ul className="space-y-1.5">
            {mistakes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-expanded={open === p.id}
                  onClick={() => {
                    setOpen(open === p.id ? null : p.id);
                    onInspect(p.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-border-strong"
                  data-testid="mistake-item"
                >
                  <Search aria-hidden className={cn("size-4 shrink-0", inspected.includes(p.id) ? "text-success" : "text-muted")} />
                  <span className="font-semibold">{String(dataset.rows.find((r) => r.id === p.id)?.[dataset.nameColumn ?? "id"] ?? p.id)}</span>
                  <span className="text-muted">
                    gerçek: <span style={{ color: colors[p.actual] }}>{labels[p.actual]}</span> · tahmin:{" "}
                    <span style={{ color: colors[p.predicted] }}>{labels[p.predicted]}</span>
                  </span>
                  <ChevronDown aria-hidden className={cn("ml-auto size-4 transition-transform", open === p.id && "rotate-180")} />
                </button>
                {open === p.id && <MistakeDetail prediction={p} run={run} dataset={dataset} sourceCellId={sourceCellId} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MistakeDetail({ prediction, run, dataset, sourceCellId }: { prediction: Prediction; run: RunResult; dataset: Dataset; sourceCellId: string }) {
  const lesson = useNotebook((s) => s.lesson);
  const cells = useNotebook((s) => s.cells);
  const sourceCell = lesson.cells.find((c) => c.id === sourceCellId);
  const useLabels = sourceCell?.type === "training" && sourceCell.useStudentLabels;
  const { labels, keys, colors } = classInfo(dataset);
  const row = dataset.rows.find((r) => r.id === prediction.id)!;
  const neighbors = useMemo(() => {
    if (run.config.algorithm !== "knn") return null;
    const overrides = useLabels ? studentLabels(lesson, cells, dataset.id) : {};
    const model = rebuildModel(dataset.rows, dataset.target, keys, run.config, overrides);
    if (model.kind !== "knn") return null;
    return predictKnn(model, run.config.features.map((f) => Number(row[f]))).neighbors;
  }, [run, dataset, keys, row, useLabels, lesson, cells]);

  return (
    <div className="mt-1 rounded-lg bg-surface-2 p-3 text-sm">
      <div className="font-mono text-xs">
        {run.config.features.map((f) => `${dataset.features.find((x) => x.key === f)?.label}: ${row[f]}`).join(" · ")}
      </div>
      {neighbors ? (
        <div className="mt-2">
          <div className="text-xs font-semibold text-muted">Modelin baktığı en yakın {neighbors.length} eğitim örneği:</div>
          <ul className="mt-1 space-y-0.5">
            {neighbors.map((n) => (
              <li key={n.id} className="flex items-center gap-2 text-xs">
                <span className="size-2 rounded-full" style={{ background: colors[n.label] }} />
                {String(dataset.rows.find((r) => r.id === n.id)?.[dataset.nameColumn ?? "id"])} ({labels[n.label]})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Karar ağacı bu örneği, öğrendiği kurallardan birine göre sınıflandırdı. Kurallara eğitim hücresinden bakabilirsin.</p>
      )}
    </div>
  );
}
