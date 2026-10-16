"use client";

import { Cloud, Download, ExternalLink, FileJson, ShieldAlert, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { ConfusionMatrix } from "@/components/charts/confusion-matrix";
import { LossCurve } from "@/components/charts/loss-curve";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { ColabCell as Cell, ColabTemplate } from "@/lib/content/schema";
import { colabOpenUrl, templateDownloadUrl } from "@/lib/labs/colab/launcher";
import { type TrainingReport, MAX_REPORT_BYTES, parseTrainingReport } from "@/lib/labs/colab/report";
import type { ColabState, TrainingState } from "@/lib/notebook/types";
import { cn } from "@/lib/cn";
import { CellFrame } from "../cell-frame";
import { useCellState, useNotebook, useNotebookStore } from "../context";
import { Markdown } from "../markdown";
import { pct } from "./training-cell";

const ALGORITHMS: Record<string, string> = {
  KNeighborsClassifier: "K-en yakın komşu",
  DecisionTreeClassifier: "Karar ağacı",
  RandomForestClassifier: "Rastgele orman",
  MLPClassifier: "Yapay sinir ağı",
};
const algoName = (a: string) => ALGORITHMS[a] ?? a;

export function ColabCell({ cell }: { cell: Cell }) {
  const store = useNotebookStore();
  const state = useCellState<ColabState>(cell.id);
  const template = useNotebook((s) => s.colabTemplates[cell.templateId]);
  const update = (patch: Partial<ColabState>) => store.getState().update<ColabState>(cell.id, (s) => ({ ...s, ...patch }));

  if (!template) return null;
  const openUrl = colabOpenUrl(template);
  const markOpened = (how: string) => {
    update({ openedAt: new Date().toISOString() });
    store.getState().addEvidence(cell.id, "colab-opened", how);
  };

  return (
    <CellFrame
      cell={cell}
      badges={
        <Badge tone="info">
          <Cloud aria-hidden className="size-3.5" /> Senin Colab oturumunda çalışır
        </Badge>
      }
    >
      <Markdown className="mb-4 text-[15px]">{cell.instructions}</Markdown>

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="font-semibold">{template.title}</div>
        <p className="mt-1 text-sm text-muted">{template.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>~{template.estimatedMinutes} dakika</Badge>
          <Badge tone="success">{template.accelerator === "none" ? "GPU gerekmez" : "GPU isteğe bağlı"}</Badge>
          <Badge>Defter sürümü {template.version}</Badge>
          <Badge tone="accent">Sentetik veri</Badge>
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          {template.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          {openUrl && (
            <a href={openUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md")} onClick={() => markOpened("Colab'da açtı")}>
              <ExternalLink aria-hidden className="size-4" />
              Google Colab&apos;da Aç
            </a>
          )}
          <a
            href={templateDownloadUrl(template)}
            download
            className={buttonClass(openUrl ? "secondary" : "primary", "md")}
            onClick={() => markOpened("Defteri indirdi")}
          >
            <Download aria-hidden className="size-4" />
            Defteri indir (.ipynb)
          </a>
        </div>
        {!openUrl && (
          <p className="mt-3 text-xs text-muted">
            Colab&apos;da açmak için: <strong>colab.research.google.com</strong> adresine git → <strong>Dosya → Not defteri yükle</strong> → indirdiğin
            dosyayı seç.
          </p>
        )}
        <p className="mt-2 text-xs text-subtle">{template.datasetNote}</p>
        {state.openedAt && !state.report && (
          <p className="mt-2 text-xs text-muted" role="status">
            Defteri açtın. Görev, defterin ürettiği rapor buraya yüklendiğinde tamamlanır.
          </p>
        )}
      </div>

      <ReportImport cell={cell} template={template} state={state} onImported={(report, warnings, fileName) => {
        update({ report, warnings, fileName, importedAt: new Date().toISOString() });
        const selected = report.experiments.find((e) => e.id === report.selected_experiment);
        store.getState().addEvidence(cell.id, "report-imported", `${algoName(selected?.algorithm ?? "")}: test ${pct(report.test_metrics.accuracy)}`);
      }} />

      {state.report && <ReportView cell={cell} report={state.report} warnings={state.warnings} />}
    </CellFrame>
  );
}

function ReportImport({
  cell,
  template,
  state,
  onImported,
}: {
  cell: Cell;
  template: ColabTemplate;
  state: ColabState;
  onImported: (report: TrainingReport, warnings: string[], fileName: string) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const projectId = useNotebook((s) => s.lesson.projectId);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setErrors([]);
    if (file.size > MAX_REPORT_BYTES) {
      setErrors([`Dosya çok büyük (${Math.round(file.size / 1024)} KB). Rapor en fazla ${MAX_REPORT_BYTES / 1024} KB olabilir.`]);
      return;
    }
    const result = parseTrainingReport(await file.text(), file.size, {
      projectId: projectId ?? template.projectId,
      templateId: template.id,
      notebookVersion: template.version,
    });
    if (result.ok) onImported(result.report, result.warnings, file.name);
    else setErrors(result.errors);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-semibold">{state.report ? "Rapor içe aktarıldı" : "Colab raporunu içe aktar"}</h4>
        {state.fileName && <span className="truncate font-mono text-xs text-muted">{state.fileName}</span>}
      </div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition-colors",
          dragging ? "border-brand bg-brand-soft" : "border-border-strong hover:border-brand",
        )}
      >
        {state.report ? <FileJson aria-hidden className="size-6 text-success" /> : <Upload aria-hidden className="size-6 text-muted" />}
        <span className="font-semibold">{state.report ? "Başka bir rapor yükle" : "ai-atolye-rapor.json dosyasını seç ya da buraya bırak"}</span>
        <span className="text-xs text-muted">Yalnızca .json · en fazla {MAX_REPORT_BYTES / 1024} KB · dosya bilgisayarından çıkmaz</span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        data-testid={`report-input-${cell.id}`}
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      {errors.length > 0 && (
        <div className="mt-3 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger" role="alert" data-testid="report-errors">
          <div className="font-semibold">Rapor içe aktarılamadı</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReportView({ cell, report, warnings }: { cell: Cell; report: TrainingReport; warnings: string[] }) {
  const datasets = useNotebook((s) => s.datasets);
  const compare = useNotebook((s) => (cell.compareWithCellId ? s.cells[cell.compareWithCellId] : undefined)) as TrainingState | undefined;
  const selected = report.experiments.find((e) => e.id === report.selected_experiment)!;
  const classLabels: Record<string, string> = {};
  for (const ds of Object.values(datasets)) for (const c of ds.classes ?? []) classLabels[c.key] = c.label;
  const bestBrowser = compare?.kind === "training" && compare.runs.length ? compare.runs.reduce((a, b) => (b.testAccuracy > a.testAccuracy ? b : a)) : null;
  const sorted = [...report.experiments].sort((a, b) => b.validation_accuracy - a.validation_accuracy);

  return (
    <div className="mt-5 space-y-6" data-testid="report-view">
      <Callout tone="warning" title="Öz bildirim: doğrulanmamış sonuç">
        Bu rapor senin Colab oturumunda üretildi ve dosya olarak yüklendi. AI Atölye eğitimi kendisi yeniden çalıştırmaz ya da doğrulamaz; öğretmenin
        inceleyebilir. Rapordaki hiçbir kod çalıştırılmadı.
      </Callout>
      {warnings.map((w) => (
        <p key={w} className="flex items-center gap-1.5 text-xs text-warning">
          <ShieldAlert aria-hidden className="size-3.5" /> {w}
        </p>
      ))}

      <section className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs font-semibold text-muted">Test doğruluğu</div>
          <div className="font-mono text-4xl font-bold tabular-nums" data-testid="colab-test-accuracy">
            {pct(report.test_metrics.accuracy)}
          </div>
          <div className="text-xs text-muted">{report.dataset.n_test} test örneği</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted">Seçilen model</div>
          <div className="text-lg font-bold">{algoName(selected.algorithm)}</div>
          <div className="font-mono text-xs text-muted">{report.selected_experiment}</div>
        </div>
        <div className="text-sm">
          <div className="text-xs font-semibold text-muted">Veri ve ortam</div>
          <div>
            {report.dataset.n_train} eğitim · {report.dataset.n_validation} doğrulama · {report.dataset.n_test} test
          </div>
          <div className="text-xs text-muted">
            {report.environment.colab ? "Google Colab" : "Colab dışı ortam"} · {report.environment.accelerator === "none" ? "CPU" : report.environment.accelerator.toUpperCase()} ·
            scikit-learn {report.environment.sklearn} · {report.environment.runtime_seconds} sn
          </div>
          {report.dataset.synthetic && <Badge tone="accent" className="mt-1">Sentetik veri</Badge>}
        </div>
      </section>

      <section>
        <h4 className="mb-2 font-semibold">Colab&apos;da eğitilen modeller</h4>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs">
              <tr>
                <th className="px-3 py-2">Deney</th>
                <th className="px-3 py-2">Algoritma</th>
                <th className="px-3 py-2 text-right">Eğitim</th>
                <th className="px-3 py-2 text-right">Doğrulama</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const gap = e.train_accuracy - e.validation_accuracy;
                return (
                  <tr key={e.id} className={cn("border-t border-border", e.id === report.selected_experiment && "bg-success-soft")}>
                    <td className="px-3 py-1.5 font-mono text-xs">{e.id}</td>
                    <td className="px-3 py-1.5">{algoName(e.algorithm)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted">{pct(e.train_accuracy)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{pct(e.validation_accuracy)}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {e.id === report.selected_experiment && <Badge tone="success">Seçildi</Badge>}{" "}
                      {gap > 0.08 && <Badge tone="warning">Ezber belirtisi</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Modeller doğrulama doğruluğuna göre sıralandı. &quot;Ezber belirtisi&quot;: eğitim doğruluğu doğrulamadan 8 puandan fazla yüksek.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 font-semibold">Test verisinde karışıklık matrisi</h4>
          <ConfusionMatrix matrix={report.test_metrics.confusion_matrix} classes={report.test_metrics.labels} labels={classLabels} />
        </div>
        {report.loss_curve && report.loss_curve.length > 1 && (
          <div>
            <h4 className="mb-2 font-semibold">Sinir ağının eğitimi</h4>
            <LossCurve values={report.loss_curve} label={`Sinir ağının ${report.loss_curve.length} epok boyunca kayıp değeri`} />
            <p className="text-xs text-muted">Her nokta Colab&apos;da bir epokta hesaplanan gerçek kayıp (loss) değeri ({report.loss_curve.length} epok).</p>
          </div>
        )}
      </section>

      {bestBrowser && (
        <section className="rounded-xl border border-border bg-surface-2 p-4" data-testid="lab-comparison">
          <h4 className="font-semibold">Tarayıcı ve Colab karşılaştırması</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-muted">Tarayıcıdaki en iyi modelin (Görsel Lab)</div>
              <div className="font-mono text-2xl font-bold">{pct(bestBrowser.testAccuracy)}</div>
              <div className="text-xs text-muted">{bestBrowser.testSize} test örneği · 160 örneklik temiz veri</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">Colab&apos;daki seçtiğin model</div>
              <div className="font-mono text-2xl font-bold">{pct(report.test_metrics.accuracy)}</div>
              <div className="text-xs text-muted">
                {report.dataset.n_test} test örneği · {report.dataset.n_train + report.dataset.n_validation + report.dataset.n_test} örneklik gürültülü veri
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm">
            Dikkat: iki model <strong>farklı test verileriyle</strong> ölçüldü. Colab&apos;daki veri daha büyük ama daha gürültülü ve hatalı etiketler içeriyor.
            Bu yüzden yüzdeleri doğrudan karşılaştırmak yanıltıcı olabilir.
          </p>
        </section>
      )}

      <section>
        <h4 className="font-semibold">Sonuçları düşün</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Hangi model doğrulamada en iyiydi? Test sonucu doğrulama sonucuna yakın mı?</li>
          <li>Eğitim doğruluğu %100 olan bir model neden en iyi model olmayabilir?</li>
          <li>Karışıklık matrisinde en çok hangi iki malzeme karışıyor? Hangi nesneler bunun sebebi olabilir?</li>
        </ul>
      </section>
    </div>
  );
}
