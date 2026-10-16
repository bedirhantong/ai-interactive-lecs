import type { Cell, Dataset, Lesson } from "@/lib/content/schema";
import { type CellState, type SavedNotebook, emptyEditable, emptyExec } from "./types";

export function initialCellState(cell: Cell): CellState | null {
  switch (cell.type) {
    case "explanation":
      return null;
    case "code":
      return { kind: "code", ...emptyExec(), source: cell.source, recoveredFromError: false };
    case "experiment": {
      const exp = cell.experiment;
      if (exp.kind === "linear-regression") {
        return {
          kind: "linreg",
          slope: exp.slope.initial,
          intercept: exp.intercept.initial,
          changes: 0,
          adjustedBy: "manual",
          learningRate: 0.1,
          history: [],
          trainingRuns: 0,
          view: "visual",
          code: emptyEditable(),
        };
      }
      return {
        kind: "knn2d",
        k: exp.k.initial,
        probe: exp.probe,
        showBoundary: exp.showBoundaryByDefault,
        changes: 0,
        seenLabels: [],
      };
    }
    case "dataset":
      return { kind: "dataset", labels: {} };
    case "training":
      return {
        kind: "training",
        algorithm: cell.algorithms[0],
        features: cell.defaultFeatures,
        k: cell.k.initial,
        maxDepth: cell.maxDepth.initial,
        testPercent: cell.defaultTestPercent,
        seed: 1,
        standardize: cell.standardize,
        runs: [],
        view: "visual",
        code: emptyEditable(),
      };
    case "evaluation":
      return { kind: "evaluation", inspected: [], compare: [null, null] };
    case "challenge":
      return {
        kind: "challenge",
        ...emptyExec(),
        code: cell.challenge.kind === "code" ? cell.challenge.starterCode : "",
        attempts: 0,
        tests: null,
        passed: false,
        passedAt: null,
        solutionRevealed: false,
        predictions: {},
        checked: false,
      };
    case "reflection":
      return { kind: "reflection", text: "", submittedText: null, submittedAt: null };
    case "colab":
      return { kind: "colab", openedAt: null, report: null, importedAt: null, fileName: null, warnings: [] };
  }
}

export function initialCells(lesson: Lesson): Record<string, CellState> {
  const cells: Record<string, CellState> = {};
  for (const cell of lesson.cells) {
    const state = initialCellState(cell);
    if (state) cells[cell.id] = state;
  }
  return cells;
}

/**
 * Merge saved state into a (possibly newer) lesson version. State is kept
 * for cells that still exist with the same kind; everything else starts
 * fresh. Nothing the student wrote is silently dropped for unchanged cells.
 */
export function restoreCells(lesson: Lesson, saved: SavedNotebook | null): {
  cells: Record<string, CellState>;
  migrated: boolean;
} {
  const fresh = initialCells(lesson);
  if (!saved) return { cells: fresh, migrated: false };
  const cells = { ...fresh };
  for (const [id, state] of Object.entries(saved.cells)) {
    if (fresh[id] && fresh[id].kind === state.kind) cells[id] = settle({ ...fresh[id], ...state } as CellState);
  }
  return { cells, migrated: saved.lessonVersion !== lesson.version };
}

/** Rows of a dataset with the student's labels applied (for labeling cells). */
export function studentLabels(lesson: Lesson, cells: Record<string, CellState>, datasetId: string): Record<number, string> {
  const labels: Record<number, string> = {};
  for (const cell of lesson.cells) {
    if (cell.type !== "dataset" || cell.datasetId !== datasetId || !cell.labeling) continue;
    const state = cells[cell.id];
    if (state?.kind !== "dataset") continue;
    for (const [id, label] of Object.entries(state.labels)) labels[Number(id)] = label;
  }
  return labels;
}

export type DatasetMap = Record<string, Dataset>;

/** A saved "running" status can only come from an interrupted session. */
function settle(state: CellState): CellState {
  const fix = <T extends { status?: string }>(e: T): T => (e.status === "running" ? { ...e, status: "idle" } : e);
  const next = fix(state as CellState & { status?: string }) as CellState;
  if ("code" in next && typeof next.code === "object" && next.code !== null) {
    return { ...next, code: fix(next.code) } as CellState;
  }
  return next;
}
