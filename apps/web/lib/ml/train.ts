/**
 * Train-and-evaluate pipeline used by training and evaluation cells.
 * Everything here is real computation on the notebook's dataset.
 */
import type { Algorithm, DatasetRow } from "@/lib/content/schema";
import { type Example, splitExamples, toExamples } from "./data";
import { type KnnModel, predictKnn, trainKnn } from "./knn";
import { type TreeModel, type TreeNode, predictTree, trainTree } from "./tree";

export interface TrainingConfig {
  algorithm: Algorithm;
  features: string[];
  k: number;
  maxDepth: number;
  testPercent: number;
  seed: number;
  standardize: boolean;
}

export interface Prediction {
  id: number;
  actual: string;
  predicted: string;
}

export interface ClassMetrics {
  label: string;
  precision: number | null;
  recall: number | null;
  support: number;
}

export interface RunResult {
  id: string;
  createdAt: string;
  config: TrainingConfig;
  target: string;
  classes: string[];
  trainSize: number;
  testSize: number;
  trainAccuracy: number;
  testAccuracy: number;
  /** confusion[actual][predicted] in `classes` order. */
  confusion: number[][];
  perClass: ClassMetrics[];
  testPredictions: Prediction[];
  /** Number of training labels that came from the student's own labeling. */
  studentLabelsUsed: number;
  /** How many of those student labels disagree with the dataset's reference label. */
  studentLabelsWrong: number;
  tree?: TreeNode;
}

export type Model = KnnModel | TreeModel;

export function applyLabelOverrides(rows: DatasetRow[], target: string, overrides: Record<number, string>) {
  if (Object.keys(overrides).length === 0) return rows;
  return rows.map((row) => (overrides[row.id] ? { ...row, [target]: overrides[row.id] } : row));
}

export function trainModel(train: Example[], config: TrainingConfig, classes: string[]): Model {
  return config.algorithm === "knn"
    ? trainKnn(train, config.k, config.standardize)
    : trainTree(train, config.maxDepth, classes);
}

export function predict(model: Model, x: number[]): string {
  return model.kind === "knn" ? predictKnn(model, x).label : predictTree(model, x);
}

export function accuracy(preds: Prediction[]): number {
  if (preds.length === 0) return 0;
  return preds.filter((p) => p.actual === p.predicted).length / preds.length;
}

export function confusionMatrix(preds: Prediction[], classes: string[]): number[][] {
  const index = new Map(classes.map((c, i) => [c, i]));
  const matrix = classes.map(() => classes.map(() => 0));
  for (const p of preds) {
    const a = index.get(p.actual);
    const b = index.get(p.predicted);
    if (a !== undefined && b !== undefined) matrix[a][b] += 1;
  }
  return matrix;
}

export function perClassMetrics(matrix: number[][], classes: string[]): ClassMetrics[] {
  return classes.map((label, i) => {
    const tp = matrix[i][i];
    const predicted = matrix.reduce((sum, row) => sum + row[i], 0);
    const actual = matrix[i].reduce((a, b) => a + b, 0);
    return {
      label,
      precision: predicted === 0 ? null : tp / predicted,
      recall: actual === 0 ? null : tp / actual,
      support: actual,
    };
  });
}

let runCounter = 0;

export function runTraining(
  rows: DatasetRow[],
  target: string,
  classes: string[],
  config: TrainingConfig,
  labelOverrides: Record<number, string> = {},
): RunResult {
  const referenceLabels = new Map(rows.map((r) => [r.id, String(r[target])]));
  const working = applyLabelOverrides(rows, target, labelOverrides);
  const { train, test: rawTest } = splitExamples(toExamples(working, config.features, target), config.seed, config.testPercent);
  // Evaluation always uses the reference labels: a test set must reflect reality,
  // not the student's labels.
  const test = rawTest.map((ex) => ({ ...ex, y: referenceLabels.get(ex.id) ?? ex.y }));
  const model = trainModel(train, config, classes);

  const toPred = (ex: Example): Prediction => ({ id: ex.id, actual: ex.y, predicted: predict(model, ex.x) });
  const trainPreds = train.map(toPred);
  const testPreds = test.map(toPred);
  const confusion = confusionMatrix(testPreds, classes);

  const overrideIds = Object.keys(labelOverrides).map(Number);
  const trainIds = new Set(train.map((e) => e.id));
  const usedOverrides = overrideIds.filter((id) => trainIds.has(id));

  runCounter += 1;
  return {
    id: `run-${Date.now().toString(36)}-${runCounter}`,
    createdAt: new Date().toISOString(),
    config,
    target,
    classes,
    trainSize: train.length,
    testSize: test.length,
    trainAccuracy: accuracy(trainPreds),
    testAccuracy: accuracy(testPreds),
    confusion,
    perClass: perClassMetrics(confusion, classes),
    testPredictions: testPreds,
    studentLabelsUsed: usedOverrides.length,
    studentLabelsWrong: usedOverrides.filter((id) => labelOverrides[id] !== referenceLabels.get(id)).length,
    tree: model.kind === "decision-tree" ? model.root : undefined,
  };
}

/** Rebuild the model of a stored run (training is deterministic). */
export function rebuildModel(
  rows: DatasetRow[],
  target: string,
  classes: string[],
  config: TrainingConfig,
  labelOverrides: Record<number, string> = {},
): Model {
  const working = applyLabelOverrides(rows, target, labelOverrides);
  const { train } = splitExamples(toExamples(working, config.features, target), config.seed, config.testPercent);
  return trainModel(train, config, classes);
}
