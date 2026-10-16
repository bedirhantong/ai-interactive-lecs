/**
 * A small CART-style decision tree (Gini impurity) for classification.
 * Deterministic: features are tried in order, thresholds ascending, and the
 * first strictly-better split wins.
 */
import type { Example } from "./data";

export type TreeNode =
  | { kind: "leaf"; label: string; counts: Record<string, number>; n: number }
  | {
      kind: "split";
      feature: number;
      threshold: number;
      left: TreeNode;
      right: TreeNode;
      counts: Record<string, number>;
      n: number;
    };

export interface TreeModel {
  kind: "decision-tree";
  maxDepth: number;
  root: TreeNode;
}

function countLabels(examples: Example[], classes: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of classes) counts[c] = 0;
  for (const ex of examples) counts[ex.y] = (counts[ex.y] ?? 0) + 1;
  return counts;
}

function gini(counts: Record<string, number>, n: number): number {
  if (n === 0) return 0;
  let sum = 0;
  for (const c of Object.values(counts)) sum += (c / n) * (c / n);
  return 1 - sum;
}

function majority(counts: Record<string, number>, classes: string[]): string {
  let best = classes[0];
  for (const c of classes) if ((counts[c] ?? 0) > (counts[best] ?? 0)) best = c;
  return best;
}

function build(examples: Example[], depth: number, maxDepth: number, classes: string[]): TreeNode {
  const counts = countLabels(examples, classes);
  const n = examples.length;
  const leaf: TreeNode = { kind: "leaf", label: majority(counts, classes), counts, n };
  const parentGini = gini(counts, n);
  if (depth >= maxDepth || n < 2 || parentGini === 0) return leaf;

  let best: { feature: number; threshold: number; score: number } | null = null;
  const dims = examples[0].x.length;
  for (let f = 0; f < dims; f++) {
    const values = [...new Set(examples.map((e) => e.x[f]))].sort((a, b) => a - b);
    for (let i = 0; i < values.length - 1; i++) {
      const threshold = (values[i] + values[i + 1]) / 2;
      const left = examples.filter((e) => e.x[f] <= threshold);
      const right = examples.filter((e) => e.x[f] > threshold);
      const score =
        (left.length / n) * gini(countLabels(left, classes), left.length) +
        (right.length / n) * gini(countLabels(right, classes), right.length);
      if (!best || score < best.score - 1e-12) best = { feature: f, threshold, score };
    }
  }
  if (!best || parentGini - best.score <= 1e-12) return leaf;

  const { feature, threshold } = best;
  return {
    kind: "split",
    feature,
    threshold,
    counts,
    n,
    left: build(examples.filter((e) => e.x[feature] <= threshold), depth + 1, maxDepth, classes),
    right: build(examples.filter((e) => e.x[feature] > threshold), depth + 1, maxDepth, classes),
  };
}

export function trainTree(train: Example[], maxDepth: number, classes: string[]): TreeModel {
  return { kind: "decision-tree", maxDepth, root: build(train, 0, maxDepth, classes) };
}

export function predictTree(model: TreeModel, x: number[]): string {
  let node = model.root;
  while (node.kind === "split") node = x[node.feature] <= node.threshold ? node.left : node.right;
  return node.label;
}

export function treeDepth(node: TreeNode): number {
  return node.kind === "leaf" ? 0 : 1 + Math.max(treeDepth(node.left), treeDepth(node.right));
}

export function countLeaves(node: TreeNode): number {
  return node.kind === "leaf" ? 1 : countLeaves(node.left) + countLeaves(node.right);
}
