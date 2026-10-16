/** Per-cell interaction state stored for each student notebook. */
import type { Algorithm } from "@/lib/content/schema";
import type { TrainingReport } from "@/lib/labs/colab/report";
import type { GdStep } from "@/lib/ml/linreg";
import type { RunResult as TrainingRun } from "@/lib/ml/train";
import type { RunError, TestCaseResult } from "@/lib/runtime/protocol";

export interface OutputChunk {
  stream: "stdout" | "stderr" | "result" | "info";
  text: string;
}

export interface ExecState {
  outputs: OutputChunk[];
  status: "idle" | "running" | "done" | "error";
  executionCount: number | null;
  durationMs: number | null;
  error: RunError | null;
  /** Page session that produced the outputs; other sessions' outputs are shown as stale. */
  sessionId: string | null;
}

export const emptyExec = (): ExecState => ({
  outputs: [],
  status: "idle",
  executionCount: null,
  durationMs: null,
  error: null,
  sessionId: null,
});

/**
 * Editable copy of generated code (visual-to-code). While `source === base`
 * the copy follows the visual controls. Once the student edits it, it is
 * detached and is never overwritten except by an explicit reset.
 */
export interface EditableCode extends ExecState {
  forked: boolean;
  source: string;
  base: string;
}

export const emptyEditable = (): EditableCode => ({ ...emptyExec(), forked: false, source: "", base: "" });

export interface CodeCellState extends ExecState {
  kind: "code";
  source: string;
  /** The cell previously failed and later ran cleanly (evidence of debugging). */
  recoveredFromError: boolean;
}

export interface LinregState {
  kind: "linreg";
  slope: number;
  intercept: number;
  /** Number of distinct parameter changes made by the student. */
  changes: number;
  /** Who set the current line: the student's sliders or a training run. */
  adjustedBy: "manual" | "fit";
  learningRate: number;
  history: GdStep[];
  trainingRuns: number;
  view: "visual" | "code";
  code: EditableCode;
}

export interface Knn2dState {
  kind: "knn2d";
  k: number;
  probe: { x: number; y: number };
  showBoundary: boolean;
  changes: number;
  seenLabels: string[];
}

export interface DatasetState {
  kind: "dataset";
  /** Student-assigned labels keyed by row id. */
  labels: Record<string, string>;
}

export interface TrainingState {
  kind: "training";
  algorithm: Algorithm;
  features: string[];
  k: number;
  maxDepth: number;
  testPercent: number;
  seed: number;
  standardize: boolean;
  runs: TrainingRun[];
  view: "visual" | "code";
  code: EditableCode;
}

export interface EvaluationState {
  kind: "evaluation";
  inspected: number[];
  compare: [string | null, string | null];
}

export interface ChallengeState extends ExecState {
  kind: "challenge";
  code: string;
  attempts: number;
  tests: TestCaseResult[] | null;
  passed: boolean;
  passedAt: string | null;
  solutionRevealed: boolean;
  /** Prediction challenges: row id -> predicted class. */
  predictions: Record<string, string>;
  checked: boolean;
}

export interface ReflectionState {
  kind: "reflection";
  text: string;
  submittedText: string | null;
  submittedAt: string | null;
}

export interface ColabState {
  kind: "colab";
  /** When the student last opened/downloaded the notebook. Never counts as completion. */
  openedAt: string | null;
  report: TrainingReport | null;
  importedAt: string | null;
  fileName: string | null;
  warnings: string[];
}

export type CellState =
  | CodeCellState
  | LinregState
  | Knn2dState
  | DatasetState
  | TrainingState
  | EvaluationState
  | ChallengeState
  | ReflectionState
  | ColabState;

export type EvidenceKind =
  | "code-run"
  | "error-fixed"
  | "experiment-changed"
  | "model-trained"
  | "challenge-attempt"
  | "challenge-passed"
  | "hint-revealed"
  | "solution-revealed"
  | "reflection-submitted"
  | "labels-completed"
  | "mistake-inspected"
  | "cell-completed"
  | "lesson-completed"
  | "colab-opened"
  | "report-imported";

export interface EvidenceEvent {
  at: string;
  lessonId: string;
  cellId: string;
  kind: EvidenceKind;
  detail: string;
}

export interface Completion {
  at: string;
  evidence: string;
  /**
   * Where the result was checked. Everything in the MVP is checked in the
   * student's browser, so it is self-reported and not proof for grading.
   */
  verification: "client";
}

export interface SavedNotebook {
  schema: 1;
  lessonId: string;
  lessonVersion: number;
  savedAt: string;
  cells: Record<string, CellState>;
  completions: Record<string, Completion>;
  hintLevels: Record<string, number>;
  evidence: EvidenceEvent[];
}
