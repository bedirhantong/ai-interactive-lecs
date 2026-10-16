"use client";

import { BookOpen, CheckCircle2, Circle, Lightbulb, ListChecks, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { explainError } from "@/lib/tutor/error-explainer";
import { CELL_META } from "./cell-meta";
import { useNotebook } from "./context";
import { Markdown } from "./markdown";

type Tab = "helper" | "hints" | "concepts" | "tasks";

/**
 * Contextual learning assistant. Everything here is authored by the lesson
 * team (deterministic). No live AI provider is connected in this build, and
 * the panel says so instead of pretending.
 */
export function AssistantPanel() {
  const [tab, setTab] = useState<Tab>("hints");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-3">
        <Tabs
          label="Yardım paneli"
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { id: "helper", label: "Yardımcı" },
            { id: "hints", label: "İpuçları" },
            { id: "concepts", label: "Kavramlar" },
            { id: "tasks", label: "Görevler" },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        {tab === "helper" && <HelperTab />}
        {tab === "hints" && <HintsTab />}
        {tab === "concepts" && <ConceptsTab />}
        {tab === "tasks" && <TasksTab />}
      </div>
    </div>
  );
}

function SourceNote() {
  return (
    <p className="mt-4 rounded-lg bg-surface-2 p-2.5 text-[11px] leading-4 text-muted">
      Bu paneldeki ipuçları ve açıklamalar ders ekibi tarafından yazılmıştır. <strong>Canlı yapay zekâ asistanı bu sürümde bağlı değil.</strong>{" "}
      Bağlandığında ayrıca etiketlenecek.
    </p>
  );
}

function useActiveCell() {
  const lesson = useNotebook((s) => s.lesson);
  const activeId = useNotebook((s) => s.activeCellId);
  return lesson.cells.find((c) => c.id === activeId) ?? null;
}

function HelperTab() {
  const lastError = useNotebook((s) => s.lastError);
  const lesson = useNotebook((s) => s.lesson);
  const active = useActiveCell();
  const errorCell = lastError ? lesson.cells.find((c) => c.id === lastError.cellId) : null;

  return (
    <div className="space-y-4">
      {lastError && errorCell ? (
        <section>
          <h3 className="flex items-center gap-1.5 font-semibold">
            <MessageCircleQuestion aria-hidden className="size-4 text-accent" />
            Son hata: {errorCell.title ?? CELL_META[errorCell.type].label}
          </h3>
          {(() => {
            const e = explainError(lastError.error, lastError.code);
            return (
              <div className="mt-2 space-y-2">
                <p className="font-mono text-xs text-danger">
                  {lastError.error.type}
                  {lastError.error.line ? ` · satır ${lastError.error.line}` : ""}
                </p>
                <p className="font-semibold">{e.title}</p>
                <p className="text-muted">{e.explanation}</p>
                <p className="rounded-lg bg-accent-soft p-2.5 font-medium">{e.question}</p>
                <a href={`#cell-${errorCell.id}`} className="inline-block text-xs font-semibold text-brand hover:underline">
                  Hücreye git
                </a>
              </div>
            );
          })()}
        </section>
      ) : (
        <section>
          <h3 className="font-semibold">Nasıl yardımcı olabilirim?</h3>
          <p className="mt-1 text-muted">
            Kodun hata verirse burada hatanın ne anlama geldiğini ve sana yol gösterecek bir soru göreceksin. Takıldığın bir görev için{" "}
            <strong>İpuçları</strong> sekmesine bak.
          </p>
        </section>
      )}
      {active && active.type !== "explanation" && (
        <section className="rounded-lg border border-border p-3">
          <div className="text-xs font-semibold text-muted">Şu an üzerinde çalıştığın hücre</div>
          <div className="mt-0.5 font-semibold">{active.title ?? CELL_META[active.type].label}</div>
        </section>
      )}
      <SourceNote />
    </div>
  );
}

function HintsTab() {
  const active = useActiveCell();
  const level = useNotebook((s) => (active ? (s.hintLevels[active.id] ?? 0) : 0));
  const revealHint = useNotebook((s) => s.revealHint);
  const lesson = useNotebook((s) => s.lesson);

  if (!active || active.hints.length === 0) {
    const withHints = lesson.cells.filter((c) => c.hints.length > 0);
    return (
      <div>
        <p className="text-muted">
          {active ? "Bu hücre için hazırlanmış ipucu yok." : "Bir hücreye tıkladığında, o hücrenin ipuçları burada görünür."}
        </p>
        {withHints.length > 0 && (
          <>
            <div className="mt-4 text-xs font-semibold text-muted">İpucu olan hücreler</div>
            <ul className="mt-1 space-y-1">
              {withHints.map((c) => (
                <li key={c.id}>
                  <a href={`#cell-${c.id}`} className="text-brand hover:underline">
                    {c.title ?? CELL_META[c.type].label}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        <SourceNote />
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-semibold">{active.title ?? CELL_META[active.type].label}</h3>
      <p className="mt-1 text-xs text-muted">İpuçları adım adım açılır: önce kavram, sonra kod, en son benzer bir örnek.</p>
      <ol className="mt-3 space-y-2">
        {active.hints.slice(0, level).map((hint, i) => (
          <li key={i} className="flex gap-2 rounded-lg bg-brand-soft p-3" data-testid="hint">
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-strong" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-brand-strong">{i + 1}. ipucu</div>
              <Markdown className="[&_p]:my-0">{hint}</Markdown>
            </div>
          </li>
        ))}
      </ol>
      {level < active.hints.length ? (
        <Button className="mt-3" variant="soft" size="sm" onClick={() => revealHint(active.id)}>
          <Lightbulb aria-hidden className="size-3.5" />
          {level === 0 ? "İpucu al" : "Bir ipucu daha"} ({level}/{active.hints.length})
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Tüm ipuçlarını gördün.
          {active.type === "challenge" && active.challenge.kind === "code" && active.challenge.solution
            ? " Hâlâ takıldıysan görevin altında örnek çözümü açabilirsin; ardından yeni bir görev seni bekliyor olacak."
            : ""}
        </p>
      )}
      <SourceNote />
    </div>
  );
}

function ConceptsTab() {
  const concepts = useNotebook((s) => s.lesson.concepts);
  if (concepts.length === 0) return <p className="text-muted">Bu ders için kavram listesi yok.</p>;
  return (
    <dl className="space-y-3">
      {concepts.map((c) => (
        <div key={c.term}>
          <dt className="flex items-center gap-1.5 font-semibold">
            <BookOpen aria-hidden className="size-3.5 text-brand" />
            {c.term}
          </dt>
          <dd className="mt-0.5 text-muted">{c.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

function TasksTab() {
  const lesson = useNotebook((s) => s.lesson);
  const completions = useNotebook((s) => s.completions);
  const required = lesson.cells.filter((c) => c.required);
  const done = required.filter((c) => completions[c.id]).length;
  return (
    <div>
      <div className="flex items-center gap-2">
        <ListChecks aria-hidden className="size-4 text-brand" />
        <span className="font-semibold">
          {done}/{required.length} görev tamamlandı
        </span>
      </div>
      <ol className="mt-3 space-y-2">
        {required.map((c) => {
          const comp = completions[c.id];
          return (
            <li key={c.id}>
              <a href={`#cell-${c.id}`} className="flex gap-2 rounded-lg p-1.5 hover:bg-surface-2">
                {comp ? (
                  <CheckCircle2 aria-label="tamamlandı" className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <Circle aria-label="bekliyor" className="mt-0.5 size-4 shrink-0 text-subtle" />
                )}
                <span className="min-w-0">
                  <span className="block font-medium">{c.title ?? CELL_META[c.type].label}</span>
                  {comp && <span className="block text-xs text-muted">{comp.evidence}</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[11px] text-muted">
        Görevler yalnızca bir şey yaptığında tamamlanır: kod çalıştırmak, model eğitmek, test geçmek, cevap yazmak. Sayfayı açmak yetmez.
      </p>
      <Badge tone="neutral" className="mt-2">
        Kendi tarayıcında doğrulandı (öz bildirim)
      </Badge>
    </div>
  );
}
