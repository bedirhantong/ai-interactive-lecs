import { type Example, type Scaler, fitScaler, scale } from "./data";

export interface KnnModel {
  kind: "knn";
  k: number;
  scaler: Scaler | null;
  /** Training examples in (possibly) scaled feature space. */
  points: Example[];
}

export interface Neighbor {
  id: number;
  label: string;
  distance: number;
}

export function trainKnn(train: Example[], k: number, standardize: boolean): KnnModel {
  const scaler = standardize && train.length > 0 ? fitScaler(train) : null;
  return {
    kind: "knn",
    k: Math.max(1, Math.min(k, train.length)),
    scaler,
    points: train.map((ex) => ({ ...ex, x: scale(ex.x, scaler) })),
  };
}

export function euclidean(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    total += d * d;
  }
  return Math.sqrt(total);
}

/**
 * Majority vote among the k nearest neighbours. Distance ties are broken by
 * example id; vote ties go to the class of the nearest tied neighbour.
 * The generated Python uses exactly the same rules.
 */
export function predictKnn(model: KnnModel, rawX: number[]): { label: string; neighbors: Neighbor[] } {
  const x = scale(rawX, model.scaler);
  const neighbors = model.points
    .map((p) => ({ id: p.id, label: p.y, distance: euclidean(p.x, x) }))
    .sort((a, b) => a.distance - b.distance || a.id - b.id)
    .slice(0, model.k);
  const votes = new Map<string, number>();
  for (const n of neighbors) votes.set(n.label, (votes.get(n.label) ?? 0) + 1);
  const best = Math.max(...votes.values());
  const label = neighbors.find((n) => votes.get(n.label) === best)?.label ?? "";
  return { label, neighbors };
}
