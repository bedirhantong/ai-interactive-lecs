/**
 * Training report contract between Colab notebooks and AI Atölye.
 *
 * Reports are produced by the student's own Colab session and uploaded as a
 * JSON file. They are UNTRUSTED input:
 * - size-capped and parsed as plain JSON (never executed, no pickles/models),
 * - validated against strict bounds; unknown keys are dropped,
 * - checked for internal consistency (an educational sanity check, not proof),
 * - always labelled as self-reported and unverified in the UI.
 */
import { z } from "zod";

export const REPORT_SCHEMA_MAJOR = 1;
export const MAX_REPORT_BYTES = 200 * 1024;

const unit = z.number().finite().min(0).max(1);
const count = z.number().int().min(0).max(1_000_000);
const shortText = (max: number) => z.string().max(max);

const experimentSchema = z.object({
  id: shortText(40).regex(/^[a-z0-9-]+$/),
  algorithm: shortText(60),
  params: z
    .record(shortText(40), z.union([z.number().finite(), shortText(60), z.boolean(), z.null()]))
    .refine((o) => Object.keys(o).length <= 20, "En fazla 20 parametre"),
  train_accuracy: unit,
  validation_accuracy: unit,
  training_seconds: z.number().finite().min(0).max(86_400),
});

export const trainingReportSchema = z
  .object({
    schema_version: z.string().regex(/^\d+\.\d+$/),
    project_id: shortText(60),
    template_id: shortText(60),
    notebook_version: z.string().regex(/^\d+\.\d+\.\d+$/),
    created_at: shortText(40),
    environment: z.object({
      python: shortText(20),
      sklearn: shortText(20),
      accelerator: z.enum(["none", "gpu", "tpu"]),
      colab: z.boolean(),
      runtime_seconds: z.number().finite().min(0).max(86_400),
    }),
    dataset: z.object({
      name: shortText(100),
      synthetic: z.boolean(),
      n_train: count.min(1),
      n_validation: count,
      n_test: count.min(1),
      features: z.array(shortText(40)).min(1).max(20),
      classes: z.array(shortText(40)).min(2).max(20),
    }),
    experiments: z.array(experimentSchema).min(1).max(20),
    selected_experiment: shortText(40),
    test_metrics: z.object({
      accuracy: unit,
      macro_f1: unit,
      labels: z.array(shortText(40)).min(2).max(20),
      confusion_matrix: z.array(z.array(count).max(20)).max(20),
      per_class: z
        .record(shortText(40), z.object({ precision: unit, recall: unit, f1: unit, support: count }))
        .refine((o) => Object.keys(o).length <= 20),
    }),
    loss_curve: z.array(z.number().finite().min(0).max(1_000_000)).max(1000).optional(),
    completed: z.boolean(),
  })
  .superRefine((r, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!r.experiments.some((e) => e.id === r.selected_experiment)) {
      issue("Seçilen deney (selected_experiment) deney listesinde yok.");
    }
    const m = r.test_metrics.confusion_matrix;
    const n = r.test_metrics.labels.length;
    if (m.length !== n || m.some((row) => row.length !== n)) {
      issue("Karışıklık matrisinin boyutu sınıf sayısıyla uyuşmuyor.");
      return;
    }
    const total = m.flat().reduce((a, b) => a + b, 0);
    if (total !== r.dataset.n_test) issue(`Karışıklık matrisindeki örnek sayısı (${total}) test örneği sayısıyla (${r.dataset.n_test}) uyuşmuyor.`);
    const trace = m.reduce((a, row, i) => a + row[i], 0);
    if (total > 0 && Math.abs(trace / total - r.test_metrics.accuracy) > 0.005) {
      issue("Test doğruluğu karışıklık matrisiyle tutarlı değil.");
    }
    if ([...r.test_metrics.labels].sort().join() !== [...r.dataset.classes].sort().join()) {
      issue("Karışıklık matrisinin sınıfları veri setinin sınıflarıyla aynı değil.");
    }
  });

export type TrainingReport = z.infer<typeof trainingReportSchema>;

export interface ReportExpectations {
  projectId: string;
  templateId: string;
  /** Notebook template version shipped by AI Atölye, e.g. "1.0.0". */
  notebookVersion: string;
}

export type ReportImportResult =
  | { ok: true; report: TrainingReport; warnings: string[] }
  | { ok: false; errors: string[] };

const major = (v: string) => Number(v.split(".")[0]);

function describeIssue(issue: z.core.$ZodIssue): string {
  const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue.message}`;
}

/** Validate an uploaded report. Pure function: no network, no code execution. */
export function parseTrainingReport(text: string, byteSize: number, expect: ReportExpectations): ReportImportResult {
  if (byteSize > MAX_REPORT_BYTES) {
    return { ok: false, errors: [`Dosya çok büyük (${Math.round(byteSize / 1024)} KB). Rapor en fazla ${MAX_REPORT_BYTES / 1024} KB olabilir.`] };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["Dosya geçerli bir JSON değil. Colab'daki son hücrenin indirdiği .json dosyasını seçtiğinden emin ol."] };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, errors: ["Rapor bir JSON nesnesi olmalı."] };
  }
  const version = (data as { schema_version?: unknown }).schema_version;
  if (typeof version === "string" && /^\d+\.\d+$/.test(version) && major(version) !== REPORT_SCHEMA_MAJOR) {
    return { ok: false, errors: [`Bu rapor sürümü (${version}) desteklenmiyor. Defterin güncel sürümünü AI Atölye'den yeniden aç.`] };
  }
  const parsed = trainingReportSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, errors: ["Rapor beklenen biçimde değil:", ...parsed.error.issues.slice(0, 8).map(describeIssue)] };
  }
  const report = parsed.data;
  const errors: string[] = [];
  if (report.project_id !== expect.projectId) errors.push(`Bu rapor başka bir projeye ait (${report.project_id}).`);
  if (report.template_id !== expect.templateId) errors.push(`Bu rapor başka bir defterden geliyor (${report.template_id}).`);
  if (major(report.notebook_version) !== major(expect.notebookVersion)) {
    errors.push(`Defter sürümü uyumsuz (rapor ${report.notebook_version}, beklenen ${expect.notebookVersion}).`);
  }
  if (errors.length) return { ok: false, errors };

  const warnings: string[] = [];
  if (report.notebook_version !== expect.notebookVersion) {
    warnings.push(`Rapor defterin farklı bir alt sürümünden (${report.notebook_version}) geliyor; sonuçlar küçük farklılıklar gösterebilir.`);
  }
  if (!report.completed) warnings.push("Rapor, defterin tamamlanmadığını söylüyor.");
  return { ok: true, report, warnings };
}

export function selectedExperiment(report: TrainingReport) {
  return report.experiments.find((e) => e.id === report.selected_experiment)!;
}
