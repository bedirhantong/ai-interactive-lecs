"use client";

import { CheckCircle2, Circle, EyeOff, FlaskConical, ListChecks, Play, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { ChallengeCell as Cell, CodeChallenge, Dataset } from "@/lib/content/schema";
import { checkChallenge, runChallengeCode } from "@/lib/notebook/actions";
import { linregMse } from "@/lib/notebook/completion";
import type { ChallengeState } from "@/lib/notebook/types";
import { cn } from "@/lib/cn";
import { CellFrame } from "../cell-frame";
import { CodeEditor } from "../code-editor";
import { useCellState, useNotebook, useNotebookStore, useRuntime } from "../context";
import { Markdown } from "../markdown";
import { OutputView } from "../output-view";
import { RunBar } from "../run-bar";
import { classInfo } from "./knn2d-experiment";
import { trNum } from "./linreg-experiment";
import { pct } from "./training-cell";

export function ChallengeCell({ cell }: { cell: Cell }) {
  const ch = cell.challenge;
  return (
    <CellFrame cell={cell}>
      <Markdown className="mb-4 text-[15px]">{cell.instructions}</Markdown>
      {ch.kind === "code" && <CodeChallengeBody cell={cell} challenge={ch} />}
      {ch.kind === "experiment-goal" && <GoalChallengeBody cell={cell} />}
      {ch.kind === "prediction" && <PredictionChallengeBody cell={cell} />}
    </CellFrame>
  );
}

/** Shown once a challenge is solved: a new, independent task (not a reward for clicking). */
function FollowUp({ text, solutionSeen }: { text?: string; solutionSeen: boolean }) {
  return (
    <Callout tone="success" title={solutionSeen ? "Tamam, şimdi kendin dene" : "Harika, şimdi kendi kodunu yaz"} className="mt-3">
      {text ? <Markdown>{text}</Markdown> : <p>Bu görevi tamamladın.</p>}
    </Callout>
  );
}

function CodeChallengeBody({ cell, challenge }: { cell: Cell; challenge: CodeChallenge }) {
  const store = useNotebookStore();
  const runtime = useRuntime();
  const state = useCellState<ChallengeState>(cell.id);
  const hintLevel = useNotebook((s) => s.hintLevels[cell.id] ?? 0);
  const allHintsSeen = hintLevel >= cell.hints.length;
  const update = (patch: Partial<ChallengeState>) => store.getState().update<ChallengeState>(cell.id, (s) => ({ ...s, ...patch }));
  const busy = state.status === "running";
  const check = () => !busy && void checkChallenge(store, runtime, cell.id, challenge);

  const results = new Map((state.tests ?? []).map((t) => [t.name, t]));
  let hiddenIndex = 0;

  return (
    <div>
      <CodeEditor
        value={state.code}
        onChange={(code) => update({ code })}
        onRun={check}
        label={`${cell.title ?? "Görev"} için Python kodu`}
        errorLine={state.error?.line ?? null}
      />
      <RunBar exec={state} onRun={check} runLabel="Kontrol et">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runChallengeCode(store, runtime, cell.id)} title="Testler olmadan çalıştırır">
          <Play aria-hidden className="size-3.5" />
          Sadece çalıştır
        </Button>
        <Button variant="ghost" size="sm" disabled={busy || state.code === challenge.starterCode} onClick={() => update({ code: challenge.starterCode })}>
          <RotateCcw aria-hidden className="size-3.5" />
          Kodu sıfırla
        </Button>
      </RunBar>

      <div className="mt-4 rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <ListChecks aria-hidden className="size-4" /> Testler
          </span>
          <span className="text-muted">{state.attempts > 0 ? `${state.attempts}. deneme` : "Testler tarayıcında çalışır"}</span>
        </div>
        <ul className="divide-y divide-border" data-testid="test-results">
          {challenge.tests.map((t) => {
            const r = results.get(t.name);
            const label = t.hidden ? `Gizli test ${++hiddenIndex}` : t.name;
            return (
              <li key={t.name} className="flex gap-2 px-3 py-2 text-sm">
                {!r ? (
                  <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" />
                ) : r.passed ? (
                  <CheckCircle2 aria-label="geçti" className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <XCircle aria-label="başarısız" className="mt-0.5 size-4 shrink-0 text-danger" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {t.hidden && <EyeOff aria-hidden className="size-3.5 text-muted" />}
                    {label}
                  </div>
                  {r && !r.passed && r.message && <div className="mt-0.5 font-mono text-xs text-danger">{r.message}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <OutputView exec={state} code={state.code} />

      {state.passed && <FollowUp text={challenge.followUp} solutionSeen={state.solutionRevealed} />}

      {!state.passed && challenge.solution && (
        <div className="mt-3">
          {state.solutionRevealed ? (
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Örnek çözüm (anlamaya çalış, sonra kendi sözlerinle yaz)</div>
              <pre className="overflow-auto rounded-lg border border-border bg-code-bg p-3 font-mono text-[13px]">{challenge.solution}</pre>
              {challenge.followUp && <p className="mt-2 text-sm">Çözümü gördükten sonra: {challenge.followUp}</p>}
            </div>
          ) : allHintsSeen && cell.hints.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update({ solutionRevealed: true });
                store.getState().addEvidence(cell.id, "solution-revealed", "Örnek çözüme baktı");
              }}
            >
              Örnek çözümü göster
            </Button>
          ) : (
            <p className="text-xs text-muted">Takıldın mı? Sağdaki <strong>İpuçları</strong> sekmesinden adım adım ipucu alabilirsin.</p>
          )}
        </div>
      )}
    </div>
  );
}

function GoalChallengeBody({ cell }: { cell: Cell }) {
  const ch = cell.challenge;
  const lesson = useNotebook((s) => s.lesson);
  const datasets = useNotebook((s) => s.datasets);
  const done = useNotebook((s) => !!s.completions[cell.id]);
  const targetId = ch.kind === "experiment-goal" ? ch.targetCellId : "";
  const target = useNotebook((s) => s.cells[targetId]);
  if (ch.kind !== "experiment-goal") return null;
  const targetCell = lesson.cells.find((c) => c.id === ch.targetCellId);

  let current = "—";
  let goal = "";
  let ok = false;
  if (ch.goal.metric === "mse" && targetCell && target) {
    const mse = linregMse(targetCell, target, datasets);
    current = mse === null ? "—" : trNum(mse);
    goal = `${trNum(ch.goal.max, 0)} veya altı`;
    ok = mse !== null && mse <= ch.goal.max && (ch.goal.mode === "any" || (target.kind === "linreg" && target.adjustedBy === "manual"));
  } else if (ch.goal.metric === "test-accuracy" && target?.kind === "training") {
    const best = Math.max(0, ...target.runs.map((r) => r.testAccuracy));
    current = target.runs.length ? pct(best) : "henüz model yok";
    goal = `${pct(ch.goal.min)} veya üstü`;
    ok = best >= ch.goal.min;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-xl border p-4", done || ok ? "border-success/40 bg-success-soft" : "border-border bg-surface-2")}>
      <div>
        <div className="text-xs font-semibold text-muted">{ch.goal.metric === "mse" ? "Şu anki MSE" : "En iyi test doğruluğu"}</div>
        <div className="font-mono text-2xl font-bold tabular-nums">{current}</div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted">Hedef</div>
        <div className="font-mono text-lg">{goal}</div>
      </div>
      {done ? (
        <Badge tone="success">
          <Sparkles aria-hidden className="size-3.5" /> Hedefe ulaştın
        </Badge>
      ) : (
        <a href={`#cell-${ch.targetCellId}`} className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
          <FlaskConical aria-hidden className="size-4" />
          Deneye git
        </a>
      )}
    </div>
  );
}

function PredictionChallengeBody({ cell }: { cell: Cell }) {
  const store = useNotebookStore();
  const state = useCellState<ChallengeState>(cell.id);
  const ch = cell.challenge;
  const dataset = useNotebook((s) => (ch.kind === "prediction" ? s.datasets[ch.datasetId] : undefined)) as Dataset | undefined;
  if (ch.kind !== "prediction" || !dataset) return null;
  const { labels, colors } = classInfo(dataset);
  const allChosen = ch.items.every((i) => state.predictions[i.rowId]);
  const correct = ch.items.filter((i) => state.predictions[i.rowId] === String(dataset.rows.find((r) => r.id === i.rowId)?.[dataset.target])).length;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ch.items.map((item, idx) => {
          const row = dataset.rows.find((r) => r.id === item.rowId)!;
          const truth = String(row[dataset.target]);
          const chosen = state.predictions[item.rowId];
          return (
            <div key={item.rowId} className="rounded-xl border border-border p-3" data-testid={`prediction-${item.rowId}`}>
              <div className="text-xs font-semibold text-muted">Gizemli nesne {idx + 1}</div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-xs">
                {dataset.features.map((f) => (
                  <div key={f.key} className="contents">
                    <dt className="text-muted">{f.label}</dt>
                    <dd className="text-right">{String(row[f.key]).replace(".", ",")}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={`Gizemli nesne ${idx + 1} için tahminin`}>
                {(dataset.classes ?? []).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={chosen === c.key}
                    disabled={state.checked}
                    onClick={() =>
                      store.getState().update<ChallengeState>(cell.id, (s) => ({ ...s, predictions: { ...s.predictions, [item.rowId]: c.key } }))
                    }
                    className={cn(
                      "h-7 rounded-md border px-2 text-xs font-semibold disabled:cursor-default",
                      chosen === c.key ? "border-transparent text-white" : "border-border bg-surface hover:border-border-strong",
                    )}
                    style={chosen === c.key ? { background: colors[c.key] } : undefined}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {state.checked && (
                <div className={cn("mt-2 rounded-lg p-2 text-xs", chosen === truth ? "bg-success-soft" : "bg-warning-soft")}>
                  <strong>{chosen === truth ? "Doğru!" : `Cevap: ${labels[truth]}.`}</strong> <Markdown className="inline [&_p]:inline">{item.explanation}</Markdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!state.checked ? (
          <Button
            disabled={!allChosen}
            onClick={() => {
              store.getState().update<ChallengeState>(cell.id, (s) => ({ ...s, checked: true, attempts: s.attempts + 1 }));
              store.getState().addEvidence(cell.id, "challenge-attempt", `Tahminler: ${correct}/${ch.items.length} doğru`);
            }}
          >
            Tahminlerimi kontrol et
          </Button>
        ) : (
          <Badge tone={correct === ch.items.length ? "success" : "info"}>
            {correct}/{ch.items.length} doğru tahmin
          </Badge>
        )}
        {!allChosen && !state.checked && <span className="text-xs text-muted">Her nesne için bir tahmin seç.</span>}
        {state.checked && <span className="text-sm text-muted">Modelin bu nesnelerde ne yapacağını birazdan göreceksin.</span>}
      </div>
    </div>
  );
}
