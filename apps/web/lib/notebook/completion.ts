/**
 * Evidence-based completion rules. A cell is complete only when the student
 * did something observable: ran code cleanly, changed an experiment several
 * times, trained and compared models, passed tests, submitted a reflection.
 * Opening or scrolling past a cell never counts.
 */
import type { Cell, Lesson } from "@/lib/content/schema";
import { meanSquaredError } from "@/lib/ml/linreg";
import { type DatasetMap } from "./initial";
import type { CellState, TrainingState } from "./types";

export interface CompletionCheck {
  done: boolean;
  /** Human-readable evidence, shown in the progress views. */
  evidence: string;
}

const pct = (v: number) => `%${Math.round(v * 1000) / 10}`;

export function stdoutText(state: { outputs: { stream: string; text: string }[] }): string {
  return state.outputs
    .filter((o) => o.stream === "stdout")
    .map((o) => o.text)
    .join("");
}

export function linregMse(cell: Cell, state: CellState, datasets: DatasetMap): number | null {
  if (cell.type !== "experiment" || cell.experiment.kind !== "linear-regression" || state.kind !== "linreg") return null;
  const ds = datasets[cell.experiment.datasetId];
  if (!ds) return null;
  const { x, y } = cell.experiment;
  return meanSquaredError(
    state.slope,
    state.intercept,
    ds.rows.map((r) => Number(r[x])),
    ds.rows.map((r) => Number(r[y])),
  );
}

function distinctConfigs(state: TrainingState): number {
  return new Set(state.runs.map((r) => JSON.stringify({ ...r.config, features: [...r.config.features].sort() }))).size;
}

export function checkCell(
  cell: Cell,
  cells: Record<string, CellState>,
  lesson: Lesson,
  datasets: DatasetMap,
): CompletionCheck | null {
  const state = cells[cell.id];
  switch (cell.type) {
    case "explanation":
      return null;

    case "code": {
      if (state?.kind !== "code") return null;
      const ran = state.status === "done" && state.error === null && state.executionCount !== null;
      if (cell.completion?.kind === "output-match") {
        const ok = ran && new RegExp(cell.completion.pattern).test(stdoutText(state));
        return { done: ok, evidence: `Kod çalıştı ve beklenen çıktıyı verdi (${cell.completion.description})` };
      }
      return { done: ran, evidence: state.recoveredFromError ? "Hatayı düzeltip kodu hatasız çalıştırdı" : "Kodu hatasız çalıştırdı" };
    }

    case "experiment": {
      if (state?.kind === "linreg") {
        const fitOnly = cell.experiment.kind === "linear-regression" && !cell.experiment.modes.includes("manual");
        const done = state.changes >= cell.minChanges && (!fitOnly || state.trainingRuns > 0);
        return {
          done,
          evidence: fitOnly
            ? `Modeli ${state.trainingRuns} kez gradyan inişiyle eğitti`
            : `Doğruyu ${state.changes} kez ayarlayarak denedi`,
        };
      }
      if (state?.kind === "knn2d") {
        return { done: state.changes >= cell.minChanges, evidence: `Gizemli nesneyle ${state.changes} deneme yaptı` };
      }
      return null;
    }

    case "dataset": {
      if (!cell.labeling || state?.kind !== "dataset") return null;
      const labeled = cell.labeling.rowIds.filter((id) => state.labels[id]).length;
      return { done: labeled === cell.labeling.rowIds.length, evidence: `${labeled} örneği etiketledi` };
    }

    case "training": {
      if (state?.kind !== "training") return null;
      const best = Math.max(0, ...state.runs.map((r) => r.testAccuracy));
      if (cell.completion.kind === "compared") {
        const n = distinctConfigs(state);
        return { done: n >= cell.completion.minRuns, evidence: `${n} farklı model eğitip karşılaştırdı (en iyi test doğruluğu ${pct(best)})` };
      }
      if (cell.completion.kind === "min-accuracy") {
        return { done: best >= cell.completion.minTestAccuracy, evidence: `Test doğruluğu ${pct(best)}` };
      }
      return { done: state.runs.length > 0, evidence: `Modeli eğitti (test doğruluğu ${pct(best)})` };
    }

    case "evaluation": {
      const source = cells[cell.sourceCellId];
      if (state?.kind !== "evaluation" || source?.kind !== "training" || source.runs.length === 0) {
        return { done: false, evidence: "" };
      }
      const latest = source.runs[source.runs.length - 1];
      const mistakes = latest.testPredictions.filter((p) => p.actual !== p.predicted).length;
      const needed = Math.min(cell.minInspectedMistakes, mistakes);
      return {
        done: state.inspected.length >= needed,
        evidence: `Sonuçları inceledi, ${state.inspected.length} hatalı tahmini açtı`,
      };
    }

    case "challenge": {
      const ch = cell.challenge;
      if (state?.kind !== "challenge") return null;
      if (ch.kind === "code") {
        return {
          done: state.passed,
          evidence: state.solutionRevealed
            ? `Testleri ${state.attempts}. denemede geçti (çözümü gördükten sonra)`
            : `Testleri ${state.attempts}. denemede geçti`,
        };
      }
      if (ch.kind === "prediction") {
        const correct = ch.items.filter((item) => {
          const row = datasets[ch.datasetId]?.rows.find((r) => r.id === item.rowId);
          return row && state.predictions[item.rowId] === String(row[datasets[ch.datasetId].target]);
        }).length;
        return { done: state.checked, evidence: `Tahminlerini yaptı: ${correct}/${ch.items.length} doğru` };
      }
      // experiment-goal
      const targetCell = lesson.cells.find((c) => c.id === ch.targetCellId);
      const target = cells[ch.targetCellId];
      if (!targetCell || !target) return { done: false, evidence: "" };
      if (ch.goal.metric === "mse" && target.kind === "linreg") {
        const mse = linregMse(targetCell, target, datasets);
        const manualOk = ch.goal.mode === "any" || target.adjustedBy === "manual";
        return {
          done: mse !== null && manualOk && mse <= ch.goal.max,
          evidence: `MSE ${mse?.toFixed(1)} ≤ ${ch.goal.max}${ch.goal.mode === "manual" ? " (elle ayarlayarak)" : ""}`,
        };
      }
      if (ch.goal.metric === "test-accuracy" && target.kind === "training") {
        const goal = ch.goal;
        const run = target.runs.find((r) => r.testAccuracy >= goal.min);
        return {
          done: !!run,
          evidence: run ? `Test doğruluğu ${pct(run.testAccuracy)} (özellikler: ${run.config.features.join(", ")})` : "",
        };
      }
      return { done: false, evidence: "" };
    }

    case "colab": {
      // Opening Colab is not evidence. A valid, completed report is (self-reported).
      if (state?.kind !== "colab") return null;
      const report = state.report;
      const selected = report?.experiments.find((e) => e.id === report.selected_experiment);
      return {
        done: !!report && report.completed,
        evidence: report
          ? `Colab raporu içe aktarıldı: ${selected?.algorithm ?? report.selected_experiment}, test doğruluğu ${pct(report.test_metrics.accuracy)} (öz bildirim, doğrulanmadı)`
          : "",
      };
    }

    case "reflection": {
      if (state?.kind !== "reflection") return null;
      return {
        done: !!state.submittedAt && (state.submittedText?.trim().length ?? 0) >= cell.minLength,
        evidence: "Yansıtma yazısı gönderdi (öğretmen değerlendirmesi bekliyor)",
      };
    }
  }
}

export function requiredCells(lesson: Lesson): Cell[] {
  return lesson.cells.filter((c) => c.required);
}
