import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { csvToRows } from "@/lib/content/csv";
import { knn2dPython, knnTrainingPython, linearRegressionPython, treePython } from "@/lib/ml/codegen";
import { isTestRow, splitExamples, toExamples } from "@/lib/ml/data";
import { predictKnn, trainKnn } from "@/lib/ml/knn";
import { fitLeastSquares, gradientDescent, meanSquaredError } from "@/lib/ml/linreg";
import { type TrainingConfig, runTraining } from "@/lib/ml/train";
import { predictTree, trainTree } from "@/lib/ml/tree";

const CONTENT = path.resolve(import.meta.dirname, "../../../../content/datasets");
const recyclingCsv = fs.readFileSync(path.join(CONTENT, "geri-donusum.csv"), "utf-8");
const recycling = csvToRows(recyclingCsv, "id");
const ayran = csvToRows(fs.readFileSync(path.join(CONTENT, "ayran-satislari.csv"), "utf-8"), "id");
const CLASSES = ["plastik", "cam", "metal", "kagit"];

/** Run generated code with the system Python, pointing /data at the repo datasets. */
function runPython(code: string): string {
  const file = path.join(os.tmpdir(), `atolye-${process.pid}-${Math.random().toString(36).slice(2)}.py`);
  fs.writeFileSync(file, code.replaceAll('"/data/', `"${CONTENT}/`));
  try {
    return execFileSync("python3", ["-I", file], { encoding: "utf-8" });
  } finally {
    fs.unlinkSync(file);
  }
}

const config = (patch: Partial<TrainingConfig>): TrainingConfig => ({
  algorithm: "knn",
  features: ["seffaflik", "esneklik"],
  k: 3,
  maxDepth: 2,
  testPercent: 25,
  seed: 1,
  standardize: false,
  ...patch,
});

describe("data split", () => {
  it("is deterministic and roughly matches the requested test share", () => {
    const { train, test } = splitExamples(toExamples(recycling, ["seffaflik"], "malzeme"), 1, 25);
    expect(train.length + test.length).toBe(160);
    expect(test.length).toBeGreaterThan(25);
    expect(test.length).toBeLessThan(55);
    expect(isTestRow(1, 1, 25)).toBe(isTestRow(1, 1, 25));
  });
});

describe("KNN", () => {
  it("predicts the majority label of the nearest neighbours", () => {
    const train = [
      { id: 0, x: [0, 0], y: "a" },
      { id: 1, x: [1, 0], y: "a" },
      { id: 2, x: [10, 10], y: "b" },
    ];
    expect(predictKnn(trainKnn(train, 3, false), [0.5, 0]).label).toBe("a");
    expect(predictKnn(trainKnn(train, 1, false), [9, 9]).label).toBe("b");
  });

  it("breaks vote ties by the nearest neighbour", () => {
    const train = [
      { id: 0, x: [0], y: "a" },
      { id: 1, x: [3], y: "b" },
    ];
    expect(predictKnn(trainKnn(train, 2, false), [1]).label).toBe("a");
  });

  it("shows the lesson's story: conductivity fixes metal/paper confusion", () => {
    const twoFeatures = runTraining(recycling, "malzeme", CLASSES, config({}));
    const withConductivity = runTraining(recycling, "malzeme", CLASSES, config({ features: ["seffaflik", "esneklik", "iletkenlik"] }));
    expect(twoFeatures.testAccuracy).toBeLessThan(0.9);
    expect(withConductivity.testAccuracy).toBeGreaterThanOrEqual(0.95);
  });

  it("evaluates on reference labels even when student labels are wrong", () => {
    const trainIds = recycling.filter((r) => !isTestRow(r.id, 1, 25)).map((r) => r.id).slice(0, 5);
    const overrides = Object.fromEntries(trainIds.map((id) => [id, "cam"]));
    const run = runTraining(recycling, "malzeme", CLASSES, config({}), overrides);
    expect(run.studentLabelsUsed).toBe(5);
    expect(run.studentLabelsWrong).toBeGreaterThan(0);
    const testIds = new Set(run.testPredictions.map((p) => p.id));
    for (const id of trainIds) expect(testIds.has(id)).toBe(false);
  });
});

describe("decision tree", () => {
  it("fits training data better as depth grows", () => {
    const { train } = splitExamples(toExamples(recycling, ["seffaflik", "esneklik"], "malzeme"), 1, 25);
    const acc = (depth: number) => {
      const model = trainTree(train, depth, CLASSES);
      return train.filter((e) => predictTree(model, e.x) === e.y).length / train.length;
    };
    expect(acc(1)).toBeLessThan(acc(3));
    expect(acc(3)).toBeLessThanOrEqual(acc(6));
  });
});

describe("linear regression", () => {
  const xs = ayran.map((r) => Number(r.sicaklik));
  const ys = ayran.map((r) => Number(r.ayran));

  it("gradient descent converges to the least-squares solution", () => {
    const ols = fitLeastSquares(xs, ys);
    const history = gradientDescent(xs, ys, { slope: 1, intercept: 50 }, { learningRate: 0.1, steps: 200 });
    const last = history[history.length - 1];
    expect(last.slope).toBeCloseTo(ols.slope, 2);
    expect(last.intercept).toBeCloseTo(ols.intercept, 1);
    expect(last.mse).toBeLessThan(history[0].mse);
  });

  it("diverges with a learning rate that is too large", () => {
    const history = gradientDescent(xs, ys, { slope: 1, intercept: 50 }, { learningRate: 1.1, steps: 30 });
    expect(history[history.length - 1].mse).toBeGreaterThan(history[0].mse);
  });

  it("the manual goal (MSE ≤ 180) is reachable with slider steps", () => {
    expect(meanSquaredError(4.1, 18, xs, ys)).toBeLessThan(180);
  });
});

describe("visual-to-code: generated Python reproduces the browser computation", () => {
  const configs: TrainingConfig[] = [
    config({}),
    config({ k: 5, features: ["seffaflik", "esneklik", "iletkenlik"] }),
    config({ k: 7, features: ["agirlik_g", "seffaflik", "esneklik", "iletkenlik"], standardize: true, seed: 4, testPercent: 30 }),
  ];
  for (const c of configs) {
    it(`KNN ${c.features.join("+")} k=${c.k}${c.standardize ? " scaled" : ""}`, () => {
      const run = runTraining(recycling, "malzeme", CLASSES, c);
      const out = runPython(knnTrainingPython({ dataFile: "geri-donusum.csv", target: "malzeme", config: c }));
      const correct = run.testPredictions.filter((p) => p.actual === p.predicted).length;
      expect(out).toContain(`Test doğruluğu: ${correct}/${run.testSize}`);
      expect(out).toContain(`Eğitim örneği: ${run.trainSize}, test örneği: ${run.testSize}`);
    });
  }

  it("linear regression MSE matches", () => {
    const xs = ayran.map((r) => Number(r.sicaklik));
    const ys = ayran.map((r) => Number(r.ayran));
    const out = runPython(
      linearRegressionPython({ xs, ys, xName: "sicaklik", yName: "ayran", xLabel: "Sıcaklık", yLabel: "Ayran", slope: 4.1, intercept: 18, predictAt: 30 }),
    );
    expect(out).toContain(`MSE): ${meanSquaredError(4.1, 18, xs, ys).toFixed(2)}`);
  });

  it("KNN mystery-object prediction matches", () => {
    const examples = toExamples(recycling, ["seffaflik", "esneklik"], "malzeme");
    const probe = { x: 5, y: 55 };
    const expected = predictKnn(trainKnn(examples, 3, false), [probe.x, probe.y]).label;
    const out = runPython(knn2dPython({ dataFile: "geri-donusum.csv", target: "malzeme", features: ["seffaflik", "esneklik"], k: 3, probe }));
    expect(out.trim()).toBe(`Tahmin: ${expected}`);
  });

  it("an exported decision tree predicts exactly like the browser tree", () => {
    const features = ["seffaflik", "esneklik", "iletkenlik"];
    const { train, test } = splitExamples(toExamples(recycling, features, "malzeme"), 1, 25);
    const model = trainTree(train, 3, CLASSES);
    const calls = test.map((e) => `print(tahmin_et(${e.x.join(", ")}))`).join("\n");
    const out = runPython(`${treePython(model.root, features, {})}\n${calls}`).trim().split("\n");
    expect(out).toEqual(test.map((e) => predictTree(model, e.x)));
  });
});
