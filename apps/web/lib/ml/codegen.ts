/**
 * Visual-to-code: deterministic Python generated from visual experiment state.
 *
 * The generated programs use only the standard library so they run quickly
 * in the browser runtime, and they reproduce the browser computation exactly
 * (same split rule, same tie-breaking). Tests verify that equivalence.
 */
import type { TrainingConfig } from "./train";
import type { TreeNode } from "./tree";

/** Python literal for a JS number (both use shortest round-trip formatting). */
export function pyNum(n: number): string {
  if (Number.isInteger(n)) return `${n}`;
  return String(n);
}

function pyStr(s: string): string {
  return JSON.stringify(s);
}

function pyList(values: (number | string)[]): string {
  return `[${values.map((v) => (typeof v === "number" ? pyNum(v) : pyStr(v))).join(", ")}]`;
}

/** Wrap a long list literal over several lines for readability. */
function pyListWrapped(values: number[], perLine = 10): string {
  if (values.length <= perLine) return pyList(values);
  const lines: string[] = [];
  for (let i = 0; i < values.length; i += perLine) {
    lines.push("    " + values.slice(i, i + perLine).map(pyNum).join(", ") + ",");
  }
  return `[\n${lines.join("\n")}\n]`;
}

export function linearRegressionPython(opts: {
  xs: number[];
  ys: number[];
  xName: string;
  yName: string;
  xLabel: string;
  yLabel: string;
  slope: number;
  intercept: number;
  predictAt?: number;
}): string {
  const { xName, yName } = opts;
  const lines = [
    `# ${opts.xLabel} ile ${opts.yLabel} arasındaki ilişki için doğrusal model`,
    `${xName} = ${pyListWrapped(opts.xs)}`,
    `${yName} = ${pyListWrapped(opts.ys)}`,
    "",
    `egim = ${pyNum(round(opts.slope, 2))}   # doğrunun eğimi`,
    `sabit = ${pyNum(round(opts.intercept, 2))}   # x = 0 iken tahmin`,
    "",
    "def tahmin(x):",
    "    return egim * x + sabit",
    "",
    "# Her örnek için hatanın karesini al, sonra ortalamasını bul",
    `hatalar = [(tahmin(x) - y) ** 2 for x, y in zip(${xName}, ${yName})]`,
    "ortalama_kare_hata = sum(hatalar) / len(hatalar)",
    'print(f"Ortalama kare hata (MSE): {ortalama_kare_hata:.2f}")',
  ];
  if (opts.predictAt !== undefined) {
    lines.push(`print(f"x = ${pyNum(opts.predictAt)} için tahmin: {tahmin(${pyNum(opts.predictAt)}):.1f}")`);
  }
  return lines.join("\n");
}

const KNN_HELPERS = [
  "def uzaklik(a, b):",
  "    toplam = 0.0",
  "    for ai, bi in zip(a, b):",
  "        fark = ai - bi",
  "        toplam += fark * fark",
  "    return math.sqrt(toplam)",
  "",
  "def tahmin_et(x):",
  "    # En yakın K komşuyu bul (eşit uzaklıkta küçük numaralı örnek önce gelir)",
  '    komsular = sorted(egitim, key=lambda o: (uzaklik(o["x"], x), o["no"]))[:K]',
  "    oylar = {}",
  "    for komsu in komsular:",
  '        oylar[komsu["y"]] = oylar.get(komsu["y"], 0) + 1',
  "    en_cok = max(oylar.values())",
  "    # Oylar eşitse en yakın komşunun sınıfı kazanır",
  "    for komsu in komsular:",
  '        if oylar[komsu["y"]] == en_cok:',
  '            return komsu["y"]',
];

function readCsvLines(dataFile: string): string[] {
  return [
    "import csv",
    "import math",
    "",
    "# Hazır veri seti (sentetik): her satır bir atık nesnesi",
    `with open("/data/${dataFile}", encoding="utf-8") as dosya:`,
    "    satirlar = list(csv.DictReader(dosya))",
  ];
}

export function knnTrainingPython(opts: { dataFile: string; target: string; config: TrainingConfig }): string {
  const { config } = opts;
  const lines = [
    ...readCsvLines(opts.dataFile),
    "",
    `OZELLIKLER = ${pyList(config.features)}`,
    `HEDEF = ${pyStr(opts.target)}`,
    `K = ${config.k}`,
    `TEST_YUZDESI = ${config.testPercent}`,
    `TOHUM = ${config.seed}`,
    "",
    "def test_mi(no):",
    "    # Her örnek, numarasına göre sabit bir kuralla eğitim ya da test grubuna girer",
    "    karisik = ((no + 1) * 2654435761 + TOHUM * 97) % 4294967296",
    "    return karisik % 100 < TEST_YUZDESI",
    "",
    "egitim, test = [], []",
    "for s in satirlar:",
    '    ornek = {"no": int(s["id"]), "x": [float(s[o]) for o in OZELLIKLER], "y": s[HEDEF]}',
    '    (test if test_mi(ornek["no"]) else egitim).append(ornek)',
  ];
  if (config.standardize) {
    lines.push(
      "",
      "# Özellikleri ölçekle: eğitim verisinin ortalaması 0, standart sapması 1 olsun",
      "ortalamalar, sapmalar = [], []",
      "for d in range(len(OZELLIKLER)):",
      '    degerler = [o["x"][d] for o in egitim]',
      "    toplam = 0.0",
      "    for v in degerler:",
      "        toplam += v",
      "    ort = toplam / len(degerler)",
      "    kare = 0.0",
      "    for v in degerler:",
      "        kare += (v - ort) * (v - ort)",
      "    sapma = math.sqrt(kare / len(degerler))",
      "    ortalamalar.append(ort)",
      "    sapmalar.append(sapma if sapma != 0 else 1)",
      "",
      "def olcekle(x):",
      "    return [(v - ortalamalar[d]) / sapmalar[d] for d, v in enumerate(x)]",
      "",
      "for o in egitim + test:",
      '    o["x"] = olcekle(o["x"])',
    );
  }
  lines.push(
    "",
    ...KNN_HELPERS,
    "",
    'dogru = sum(1 for o in test if tahmin_et(o["x"]) == o["y"])',
    'print(f"Eğitim örneği: {len(egitim)}, test örneği: {len(test)}")',
    'print(f"Test doğruluğu: {dogru}/{len(test)} = {dogru / len(test):.1%}")',
  );
  return lines.join("\n");
}

export function knn2dPython(opts: {
  dataFile: string;
  target: string;
  features: [string, string];
  k: number;
  probe: { x: number; y: number };
}): string {
  return [
    ...readCsvLines(opts.dataFile),
    "",
    `OZELLIKLER = ${pyList(opts.features)}`,
    `HEDEF = ${pyStr(opts.target)}`,
    `K = ${opts.k}`,
    "",
    "egitim = []",
    "for s in satirlar:",
    '    egitim.append({"no": int(s["id"]), "x": [float(s[o]) for o in OZELLIKLER], "y": s[HEDEF]})',
    "",
    ...KNN_HELPERS,
    "",
    `gizemli_nesne = [${pyNum(round(opts.probe.x, 1))}, ${pyNum(round(opts.probe.y, 1))}]`,
    'print("Tahmin:", tahmin_et(gizemli_nesne))',
  ].join("\n");
}

/** Export a trained decision tree as a readable Python function. */
export function treePython(root: TreeNode, features: string[], labels: Record<string, string>): string {
  const lines = [`def tahmin_et(${features.join(", ")}):`];
  const walk = (node: TreeNode, indent: string) => {
    if (node.kind === "leaf") {
      lines.push(`${indent}return ${pyStr(node.label)}   # ${labels[node.label] ?? node.label}, ${node.n} eğitim örneği`);
      return;
    }
    lines.push(`${indent}if ${features[node.feature]} <= ${pyNum(node.threshold)}:`);
    walk(node.left, indent + "    ");
    lines.push(`${indent}else:`);
    walk(node.right, indent + "    ");
  };
  walk(root, "    ");
  return lines.join("\n");
}

/** Plain-language rules of a decision tree, one per leaf. */
export function treeRules(
  root: TreeNode,
  featureLabels: string[],
  classLabels: Record<string, string>,
): { conditions: string[]; label: string; n: number }[] {
  const rules: { conditions: string[]; label: string; n: number }[] = [];
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/\.?0+$/, ""));
  const walk = (node: TreeNode, conditions: string[]) => {
    if (node.kind === "leaf") {
      rules.push({ conditions, label: classLabels[node.label] ?? node.label, n: node.n });
      return;
    }
    const f = featureLabels[node.feature];
    walk(node.left, [...conditions, `${f} ≤ ${fmt(node.threshold)}`]);
    walk(node.right, [...conditions, `${f} > ${fmt(node.threshold)}`]);
  };
  walk(root, []);
  return rules;
}

export function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
