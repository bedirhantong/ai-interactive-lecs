import type { Lesson } from "@/lib/content/schema";
import type { PortfolioEntry } from "@/lib/progress/store";
import type { CellState } from "./types";

/** Summarize a completed project notebook into a private portfolio entry. */
export function buildPortfolioEntry(lesson: Lesson, cells: Record<string, CellState>, completedAt: string): PortfolioEntry | null {
  if (!lesson.projectId) return null;
  let best: { acc: number; features: string[] } | null = null;
  let experiments = 0;
  for (const state of Object.values(cells)) {
    if (state.kind !== "training") continue;
    experiments += state.runs.length;
    for (const run of state.runs) {
      if (!best || run.testAccuracy > best.acc) best = { acc: run.testAccuracy, features: run.config.features };
    }
  }
  const colabState = Object.values(cells).find((c) => c.kind === "colab" && c.report);
  const report = colabState?.kind === "colab" ? colabState.report : null;
  const selected = report?.experiments.find((e) => e.id === report.selected_experiment);
  const reflectionCell = [...lesson.cells].reverse().find((c) => c.type === "reflection");
  const reflection = reflectionCell ? cells[reflectionCell.id] : undefined;
  return {
    projectId: lesson.projectId,
    lessonId: lesson.id,
    level: lesson.level,
    completedAt,
    bestTestAccuracy: best?.acc ?? null,
    bestFeatures: best?.features ?? [],
    experiments,
    reflection: reflection?.kind === "reflection" ? reflection.submittedText : null,
    skills: [...new Set(lesson.cells.flatMap((c) => c.skills))],
    colab: report
      ? { algorithm: selected?.algorithm ?? report.selected_experiment, testAccuracy: report.test_metrics.accuracy, nTest: report.dataset.n_test, nTrain: report.dataset.n_train }
      : undefined,
  };
}
