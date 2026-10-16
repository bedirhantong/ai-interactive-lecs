/**
 * Execution environments ("labs").
 *
 * - visual: TypeScript computation in the browser (experiments, datasets, training, evaluation)
 * - python: real Python in the browser (Pyodide in a Web Worker)
 * - colab:  a notebook the student runs in their own Google Colab session; AI Atölye
 *           only launches it and imports the resulting report
 *
 * Explanations and reflections are shared content and belong to no lab.
 * AI Atölye never runs student code on its servers.
 */
import type { Cell, Lesson } from "@/lib/content/schema";

export const LAB_TYPES = ["visual", "python", "colab"] as const;
export type LabType = (typeof LAB_TYPES)[number];

export const LAB_LABELS: Record<LabType, string> = {
  visual: "Görsel Lab",
  python: "Python Lab",
  colab: "Colab Lab",
};

export const LAB_DESCRIPTIONS: Record<LabType, string> = {
  visual: "Tarayıcında çalışan etkileşimli deneyler ve modeller.",
  python: "Tarayıcında çalışan gerçek Python kodu.",
  colab: "Kendi Google Colab oturumunda çalıştırdığın ileri seviye defter.",
};

/** The lab a cell belongs to, or null for shared content (explanations, reflections). */
export function cellLab(cell: Cell): LabType | null {
  switch (cell.type) {
    case "explanation":
    case "reflection":
      return null;
    case "code":
      return "python";
    case "challenge":
      return cell.challenge.kind === "code" ? "python" : "visual";
    case "colab":
      return "colab";
    case "experiment":
    case "dataset":
    case "training":
    case "evaluation":
      return "visual";
  }
}

/** Does this cell need the in-browser Python runtime? (Visual cells may offer an editable Python copy.) */
export function cellUsesPython(cell: Cell): boolean {
  if (cellLab(cell) === "python") return true;
  return (cell.type === "experiment" || cell.type === "training") && cell.allowEditableCode;
}

/** Labs used by a lesson's cells, in canonical order. */
export function labsOfCells(cells: Cell[]): LabType[] {
  const used = new Set<LabType>();
  for (const cell of cells) {
    const lab = cellLab(cell);
    if (lab) used.add(lab);
    if (cellUsesPython(cell)) used.add("python");
  }
  return LAB_TYPES.filter((l) => used.has(l));
}

export function lessonNeedsPythonRuntime(lesson: Lesson): boolean {
  return lesson.cells.some(cellUsesPython);
}
