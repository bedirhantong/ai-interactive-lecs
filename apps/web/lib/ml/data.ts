/**
 * Dataset helpers shared by every model. All functions are pure and
 * deterministic so the same inputs always give the same model.
 */
import type { DatasetRow } from "@/lib/content/schema";

export interface Example {
  id: number;
  x: number[];
  y: string;
}

/**
 * Deterministic train/test assignment. The same formula is emitted in the
 * generated Python code, so the browser model and the student's Python
 * reproduce exactly the same split.
 */
export function isTestRow(id: number, seed: number, testPercent: number): boolean {
  const mixed = ((id + 1) * 2654435761 + seed * 97) % 4294967296;
  return mixed % 100 < testPercent;
}

export function toExamples(rows: DatasetRow[], features: string[], target: string): Example[] {
  return rows.map((row) => ({
    id: row.id,
    x: features.map((f) => Number(row[f])),
    y: String(row[target]),
  }));
}

export function splitExamples(examples: Example[], seed: number, testPercent: number) {
  const train: Example[] = [];
  const test: Example[] = [];
  for (const ex of examples) (isTestRow(ex.id, seed, testPercent) ? test : train).push(ex);
  return { train, test };
}

export interface Scaler {
  means: number[];
  stds: number[];
}

/** Z-score scaler fitted on training data only (population standard deviation). */
export function fitScaler(train: Example[]): Scaler {
  const dims = train[0]?.x.length ?? 0;
  const means: number[] = [];
  const stds: number[] = [];
  for (let d = 0; d < dims; d++) {
    let total = 0;
    for (const ex of train) total += ex.x[d];
    const mean = total / train.length;
    let sq = 0;
    for (const ex of train) {
      const diff = ex.x[d] - mean;
      sq += diff * diff;
    }
    const std = Math.sqrt(sq / train.length);
    means.push(mean);
    stds.push(std === 0 ? 1 : std);
  }
  return { means, stds };
}

export function scale(x: number[], scaler: Scaler | null): number[] {
  if (!scaler) return x;
  return x.map((v, d) => (v - scaler.means[d]) / scaler.stds[d]);
}
