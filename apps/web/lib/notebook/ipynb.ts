/**
 * Export a student notebook as Jupyter nbformat 4.
 *
 * Standard markdown and code cells (with outputs) are portable. AI Atölye's
 * interactive cells (experiments, datasets, training, ...) cannot run in
 * Jupyter or Colab; they are exported as a readable markdown summary, and
 * their full state is kept in `metadata.aiatolye` (versioned) so a future
 * import can restore them.
 */
import { type Cell, LEVEL_LABELS, type Lesson } from "@/lib/content/schema";
import type { CellState, OutputChunk, SavedNotebook } from "./types";

export const IPYNB_EXTENSION_VERSION = 1;

type NbCell =
  | { cell_type: "markdown"; metadata: Record<string, unknown>; source: string[] }
  | {
      cell_type: "code";
      metadata: Record<string, unknown>;
      source: string[];
      execution_count: number | null;
      outputs: unknown[];
    };

const lines = (text: string) => text.split("\n").map((l, i, a) => (i < a.length - 1 ? l + "\n" : l));

function outputsToNb(outputs: OutputChunk[], count: number | null): unknown[] {
  return outputs
    .filter((o) => o.stream !== "info")
    .map((o) =>
      o.stream === "result"
        ? { output_type: "execute_result", execution_count: count, data: { "text/plain": lines(o.text) }, metadata: {} }
        : { output_type: "stream", name: o.stream, text: lines(o.text) },
    );
}

function summarize(cell: Cell, state: CellState | undefined): string {
  const title = cell.title ? `**${cell.title}**\n\n` : "";
  switch (state?.kind) {
    case "linreg":
      return `${title}_Etkileşimli deney (AI Atölye)._ Son doğru: eğim ${state.slope}, sabit ${state.intercept}. ${state.trainingRuns} eğitim çalıştırması.`;
    case "knn2d":
      return `${title}_Etkileşimli KNN deneyi (AI Atölye)._ K=${state.k}, gizemli nesne (${state.probe.x}, ${state.probe.y}).`;
    case "dataset":
      return `${title}_Veri hücresi (AI Atölye)._ ${Object.keys(state.labels).length} örnek etiketlendi.`;
    case "training":
      return `${title}_Model eğitimi (AI Atölye)._\n\n${state.runs
        .map((r, i) => `- Model ${String.fromCharCode(65 + i)}: ${r.config.algorithm}, özellikler ${r.config.features.join(", ")}, test doğruluğu ${(r.testAccuracy * 100).toFixed(1)}%`)
        .join("\n")}`;
    case "evaluation":
      return `${title}_Değerlendirme hücresi (AI Atölye)._ ${state.inspected.length} hatalı tahmin incelendi.`;
    case "challenge":
      return `${title}_Görev (AI Atölye)._ ${state.passed ? "Tamamlandı." : "Tamamlanmadı."}`;
    case "colab":
      return state.report
        ? `${title}_Colab Lab (AI Atölye)._ Seçilen model: ${state.report.selected_experiment}, test doğruluğu ${(state.report.test_metrics.accuracy * 100).toFixed(1)}% (${state.report.dataset.n_test} test örneği). Rapor öğrencinin Colab oturumunda üretildi; doğrulanmadı.`
        : `${title}_Colab Lab (AI Atölye)._ Rapor henüz içe aktarılmadı.`;
    case "reflection":
      return `${title}**Soru:** ${cell.type === "reflection" ? cell.prompt : ""}\n\n**Cevabım:** ${state.submittedText ?? state.text}`;
    default:
      return title || "_Etkileşimli hücre (AI Atölye)._";
  }
}

export function toIpynb(lesson: Lesson, saved: SavedNotebook | null) {
  const cells: NbCell[] = [
    {
      cell_type: "markdown",
      metadata: {},
      source: lines(
        [
          `# ${lesson.title}`,
          "",
          `${LEVEL_LABELS[lesson.level]} · AI Atölye defteri`,
          "",
          "> Bu dosya AI Atölye'den dışa aktarıldı. Python hücreleri Jupyter'de çalışabilir; ancak `/data/...` dosyalarını kendin eklemen gerekir.",
          "> Deney, veri ve model eğitimi hücreleri yalnızca AI Atölye'de etkileşimlidir; burada özet olarak görünürler.",
        ].join("\n"),
      ),
    },
  ];
  for (const cell of lesson.cells) {
    const state = saved?.cells[cell.id];
    const meta = { aiatolye: { version: IPYNB_EXTENSION_VERSION, cellId: cell.id, cellType: cell.type, state: state ?? null } };
    if (cell.type === "explanation") {
      cells.push({ cell_type: "markdown", metadata: { aiatolye: { version: IPYNB_EXTENSION_VERSION, cellId: cell.id, cellType: cell.type } }, source: lines(cell.markdown) });
    } else if (state?.kind === "code") {
      cells.push({
        cell_type: "code",
        metadata: meta,
        source: lines(state.source),
        execution_count: state.executionCount,
        outputs: outputsToNb(state.outputs, state.executionCount),
      });
    } else if (state?.kind === "challenge" && cell.type === "challenge" && cell.challenge.kind === "code") {
      cells.push({ cell_type: "markdown", metadata: {}, source: lines(`**${cell.title ?? "Görev"}**\n\n${cell.instructions}`) });
      cells.push({ cell_type: "code", metadata: meta, source: lines(state.code), execution_count: null, outputs: [] });
    } else {
      cells.push({ cell_type: "markdown", metadata: meta, source: lines(summarize(cell, state)) });
    }
  }
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
      language_info: { name: "python" },
      aiatolye: {
        format: "aiatolye-notebook",
        version: IPYNB_EXTENSION_VERSION,
        lessonId: lesson.id,
        lessonVersion: lesson.version,
        exportedAt: new Date().toISOString(),
      },
    },
    cells: cells.map((c, i) => ({ id: `cell-${i}`, ...c })),
  };
}
