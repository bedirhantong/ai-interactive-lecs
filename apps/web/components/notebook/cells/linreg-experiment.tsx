"use client";

import { FastForward, RotateCcw, StepForward, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LossCurve } from "@/components/charts/loss-curve";
import { ScatterRegression } from "@/components/charts/scatter-regression";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs } from "@/components/ui/tabs";
import type { Dataset, ExperimentCell, LinearRegressionExperiment } from "@/lib/content/schema";
import { linearRegressionPython, round } from "@/lib/ml/codegen";
import { fitLeastSquares, gradientDescent, meanSquaredError, predictLine } from "@/lib/ml/linreg";
import type { LinregState } from "@/lib/notebook/types";
import { cn } from "@/lib/cn";
import { useNotebookStore } from "../context";
import { GeneratedCode } from "../generated-code";

const LEARNING_RATES = [0.01, 0.1, 0.5, 0.9, 1.1];
const STEPS_PER_TRAIN = 50;

export const trNum = (n: number, digits = 1) =>
  Number.isFinite(n) ? n.toLocaleString("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "∞";

/** Counts a "change" only after the student pauses, so dragging a slider is one change, not fifty. */
function useCommit(onCommit: () => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onCommit);
  useEffect(() => {
    latest.current = onCommit;
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(), delay);
  };
}

export function LinregExperiment({ cell, exp, dataset, state }: { cell: ExperimentCell; exp: LinearRegressionExperiment; dataset: Dataset; state: LinregState }) {
  const store = useNotebookStore();
  const update = (fn: (s: LinregState) => LinregState) => store.getState().update<LinregState>(cell.id, fn);
  const xs = useMemo(() => dataset.rows.map((r) => Number(r[exp.x])), [dataset, exp.x]);
  const ys = useMemo(() => dataset.rows.map((r) => Number(r[exp.y])), [dataset, exp.y]);
  const points = useMemo(() => dataset.rows.map((r, i) => ({ id: r.id, x: xs[i], y: ys[i] })), [dataset, xs, ys]);
  const xFeature = dataset.features.find((f) => f.key === exp.x);
  const yFeature = dataset.features.find((f) => f.key === exp.y);
  const xDomain: [number, number] = [Math.floor(Math.min(...xs) / 5) * 5 - 2, Math.ceil(Math.max(...xs) / 5) * 5 + 2];
  const yDomain: [number, number] = [0, Math.ceil((Math.max(...ys) * 1.15) / 20) * 20];
  const fitMode = exp.modes.includes("fit");
  const manualMode = exp.modes.includes("manual");

  const mse = meanSquaredError(state.slope, state.intercept, xs, ys);
  const best = useMemo(() => fitLeastSquares(xs, ys), [xs, ys]);
  const prediction = exp.predictAt !== undefined ? predictLine(state.slope, state.intercept, exp.predictAt) : null;
  const goalMet = exp.goal ? mse <= exp.goal.maxMse && state.adjustedBy === "manual" : false;

  const commit = useCommit(() => {
    update((s) => ({ ...s, changes: s.changes + 1 }));
    const s = store.getState().cells[cell.id] as LinregState;
    store.getState().addEvidence(cell.id, "experiment-changed", `eğim ${s.slope}, sabit ${s.intercept}, MSE ${trNum(meanSquaredError(s.slope, s.intercept, xs, ys))}`);
  });

  // --- gradient descent animation (real computation, replayed step by step) ---
  const [animating, setAnimating] = useState(false);
  const anim = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (anim.current) clearInterval(anim.current);
  }, []);

  const train = (steps: number) => {
    if (animating) return;
    const start = { slope: state.slope, intercept: state.intercept };
    const history = gradientDescent(xs, ys, start, { learningRate: state.learningRate, steps });
    const finish = (h: typeof history) => {
      const last = h[h.length - 1];
      const ok = Number.isFinite(last.mse) && Math.abs(last.slope) < 1e6;
      update((s) => ({
        ...s,
        slope: ok ? round(last.slope, 2) : start.slope,
        intercept: ok ? round(last.intercept, 2) : start.intercept,
        adjustedBy: "fit",
        history: [...(s.trainingRuns > 0 && s.history.length ? s.history : []), ...h].slice(-400),
        trainingRuns: s.trainingRuns + 1,
        changes: s.changes + 1,
      }));
      store.getState().addEvidence(cell.id, "model-trained", `${steps} adım gradyan inişi, öğrenme oranı ${state.learningRate}, MSE ${trNum(last.mse)}`);
    };
    if (steps === 1) {
      finish(history);
      return;
    }
    setAnimating(true);
    let i = 1;
    anim.current = setInterval(() => {
      const h = history[i];
      if (!h || !Number.isFinite(h.mse) || Math.abs(h.slope) > 1e6) {
        if (anim.current) clearInterval(anim.current);
        setAnimating(false);
        finish(history.slice(0, Math.max(1, i)));
        return;
      }
      update((s) => ({ ...s, slope: h.slope, intercept: h.intercept }));
      i += 1;
      if (i >= history.length) {
        if (anim.current) clearInterval(anim.current);
        setAnimating(false);
        finish(history);
      }
    }, 45);
  };

  const diverged = state.history.length > 1 && state.history[state.history.length - 1].mse > state.history[0].mse * 1.5;

  const generated = linearRegressionPython({
    xs,
    ys,
    xName: exp.x,
    yName: exp.y,
    xLabel: xFeature?.label ?? exp.x,
    yLabel: yFeature?.label ?? exp.y,
    slope: state.slope,
    intercept: state.intercept,
    predictAt: exp.predictAt,
  });

  return (
    <div>
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
        <GeneratedCode cellId={cell.id} generated={generated} code={state.code} allowEditable={cell.allowEditableCode} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_15rem]">
          <div className="min-w-0">
            <ScatterRegression
              points={points}
              slope={state.slope}
              intercept={state.intercept}
              xDomain={xDomain}
              yDomain={yDomain}
              xLabel={`${xFeature?.label ?? exp.x} (${xFeature?.unit ?? ""})`}
              yLabel={`${yFeature?.label ?? exp.y}`}
              predictAt={exp.predictAt}
              ghostLine={fitMode && state.trainingRuns > 0 ? { slope: exp.slope.initial, intercept: exp.intercept.initial, label: "başlangıç" } : undefined}
              description={`Saçılım grafiği: ${points.length} gün. Doğru: eğim ${state.slope}, sabit ${state.intercept}. Ortalama kare hata ${trNum(mse)}.`}
            />
            <p className="mt-1 text-xs text-muted">
              Turuncu noktalar gerçek günler, yeşil doğru modelin tahmini, kırmızı çizgiler hatalar.
            </p>
          </div>

          <div className="space-y-4">
            <div className={cn("rounded-xl border p-3", goalMet ? "border-success/40 bg-success-soft" : "border-border bg-surface-2")}>
              <div className="text-xs font-semibold text-muted">Ortalama kare hata (MSE)</div>
              <div className="font-mono text-3xl font-bold tabular-nums" data-testid="mse-value">
                {trNum(mse)}
              </div>
              {exp.goal && (
                <div className={cn("mt-1 flex items-center gap-1 text-xs font-medium", goalMet ? "text-success" : "text-muted")}>
                  <Target aria-hidden className="size-3.5" />
                  Hedef: {trNum(exp.goal.maxMse, 0)} altı {goalMet && "✓"}
                </div>
              )}
            </div>
            {prediction !== null && exp.predictAt !== undefined && (
              <div className="rounded-xl border border-border p-3">
                <div className="text-xs font-semibold text-muted">
                  {trNum(exp.predictAt, 0)} {xFeature?.unit} için tahmin
                </div>
                <div className="font-mono text-xl font-bold tabular-nums">
                  {trNum(prediction, 0)} <span className="text-sm font-medium text-muted">{yFeature?.unit}</span>
                </div>
              </div>
            )}

            {manualMode && (
              <div className="space-y-3">
                <Slider
                  label="Eğim"
                  value={state.slope}
                  min={exp.slope.min}
                  max={exp.slope.max}
                  step={exp.slope.step}
                  format={(v) => trNum(v, 1)}
                  onChange={(slope) => {
                    update((s) => ({ ...s, slope, adjustedBy: "manual" }));
                    commit();
                  }}
                />
                <Slider
                  label="Sabit"
                  value={state.intercept}
                  min={exp.intercept.min}
                  max={exp.intercept.max}
                  step={exp.intercept.step}
                  format={(v) => trNum(v, 0)}
                  onChange={(intercept) => {
                    update((s) => ({ ...s, intercept, adjustedBy: "manual" }));
                    commit();
                  }}
                />
                <p className="text-xs text-muted">
                  Elle ayarlama bir <strong>eğitim değildir</strong>: doğruyu sen seçiyorsun, model veriden öğrenmiyor.
                </p>
              </div>
            )}

            {fitMode && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold" htmlFor={`${cell.id}-lr`}>
                    Öğrenme oranı
                  </label>
                  <select
                    id={`${cell.id}-lr`}
                    className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm"
                    value={state.learningRate}
                    disabled={animating}
                    onChange={(e) => {
                      update((s) => ({ ...s, learningRate: Number(e.target.value), changes: s.changes + 1 }));
                    }}
                  >
                    {LEARNING_RATES.map((lr) => (
                      <option key={lr} value={lr}>
                        {String(lr).replace(".", ",")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => train(STEPS_PER_TRAIN)} disabled={animating}>
                    <FastForward aria-hidden className="size-3.5" />
                    Eğit ({STEPS_PER_TRAIN} adım)
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => train(1)} disabled={animating}>
                    <StepForward aria-hidden className="size-3.5" />1 adım
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={animating}
                    onClick={() =>
                      update((s) => ({ ...s, slope: exp.slope.initial, intercept: exp.intercept.initial, history: [], adjustedBy: "manual" }))
                    }
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Başa dön
                  </Button>
                </div>
                <div className="font-mono text-xs text-muted">
                  eğim {trNum(state.slope, 2)} · sabit {trNum(state.intercept, 2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {fitMode && state.view === "visual" && state.history.length > 1 && (
        <div className="mt-4 grid gap-4 rounded-xl border border-border bg-surface-2 p-3 sm:grid-cols-[1fr_14rem]">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted">Eğitim sırasında hata (MSE)</div>
            <LossCurve values={state.history.map((h) => h.mse)} label="Gradyan inişi adımlarında ortalama kare hatanın değişimi" />
          </div>
          <div className="space-y-2 text-sm">
            {diverged ? (
              <Badge tone="danger">Hata büyüyor: öğrenme oranı çok büyük</Badge>
            ) : (
              <Badge tone="success">Hata azalıyor</Badge>
            )}
            <p className="text-muted">
              Matematiksel en iyi doğru (en küçük kareler): eğim <strong className="text-text">{trNum(best.slope, 2)}</strong>, sabit{" "}
              <strong className="text-text">{trNum(best.intercept, 2)}</strong>. Gradyan inişi buna ne kadar yaklaştı?
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
