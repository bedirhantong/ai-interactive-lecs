"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ListTree,
  Loader2,
  MessageCircleQuestion,
  MoreHorizontal,
  Play,
  RotateCcw,
  Save,
  Square,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ProgressBar } from "@/components/ui/progress-bar";
import { type Cell, LEVEL_LABELS } from "@/lib/content/schema";
import { runAllCodeCells } from "@/lib/notebook/actions";
import { cn } from "@/lib/cn";
import { SyncStatus } from "../sync/sync-status";
import { AssistantPanel } from "./assistant-panel";
import { CELL_META } from "./cell-meta";
import { ChallengeCell } from "./cells/challenge-cell";
import { CodeCell } from "./cells/code-cell";
import { ColabCell } from "./cells/colab-cell";
import { DatasetCell } from "./cells/dataset-cell";
import { EvaluationCell } from "./cells/evaluation-cell";
import { ExperimentCell } from "./cells/experiment-cell";
import { ExplanationCell } from "./cells/explanation-cell";
import { ReflectionCell } from "./cells/reflection-cell";
import { TrainingCell } from "./cells/training-cell";
import { useNotebook, useNotebookStore, useRuntime, useRuntimeSnapshot } from "./context";
import { LabBadges } from "./lab-badges";

export interface NotebookNav {
  exitHref: string;
  exitLabel: string;
  context?: string;
  prev?: { href: string; title: string };
  next?: { href: string; title: string };
  portfolioHref?: string;
}

function CellRenderer({ cell }: { cell: Cell }) {
  switch (cell.type) {
    case "explanation":
      return <ExplanationCell cell={cell} />;
    case "code":
      return <CodeCell cell={cell} />;
    case "experiment":
      return <ExperimentCell cell={cell} />;
    case "dataset":
      return <DatasetCell cell={cell} />;
    case "training":
      return <TrainingCell cell={cell} />;
    case "evaluation":
      return <EvaluationCell cell={cell} />;
    case "challenge":
      return <ChallengeCell cell={cell} />;
    case "reflection":
      return <ReflectionCell cell={cell} />;
    case "colab":
      return <ColabCell cell={cell} />;
  }
}

export function NotebookLayout({ nav }: { nav: NotebookNav }) {
  const lesson = useNotebook((s) => s.lesson);
  const setActive = useNotebook((s) => s.setActive);
  const [drawer, setDrawer] = useState<"outline" | "assistant" | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Track the cell being read, so hints and the outline follow the student.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.getAttribute("data-cell-id");
        if (id) setActive(id);
      },
      { root, rootMargin: "-15% 0px -55% 0px" },
    );
    root.querySelectorAll("[data-cell-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lesson, setActive]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <Toolbar nav={nav} onOpen={setDrawer} />
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-surface lg:block" aria-label="Ders içeriği">
          <Outline nav={nav} />
        </aside>
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto" id="notebook-main">
          <div className="mx-auto max-w-3xl space-y-5 px-3 py-6 sm:px-6">
            <LessonHeader nav={nav} />
            {lesson.cells.map((cell) => (
              <CellRenderer key={cell.id} cell={cell} />
            ))}
            <LessonFooter nav={nav} />
          </div>
        </main>
        <aside className="hidden w-80 shrink-0 border-l border-border bg-surface xl:block" aria-label="Öğrenme yardımcısı">
          <AssistantPanel />
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label={drawer === "outline" ? "Ders içeriği" : "Öğrenme yardımcısı"}>
            <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
            <div
              className={cn(
                "relative z-10 flex h-full w-[min(22rem,90vw)] flex-col bg-surface shadow-xl",
                drawer === "assistant" && "ml-auto",
              )}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="font-semibold">{drawer === "outline" ? "Ders içeriği" : "Yardımcı"}</span>
                <Button variant="ghost" size="sm" onClick={() => setDrawer(null)} aria-label="Kapat">
                  <X aria-hidden className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto" onClick={(e) => (e.target as HTMLElement).closest("a[href^='#']") && setDrawer(null)}>
                {drawer === "outline" ? <Outline nav={nav} /> : <AssistantPanel />}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveIndicator() {
  const status = useNotebook((s) => s.saveStatus);
  const label = { idle: "Kaydedilecek", saving: "Kaydediliyor…", saved: "Kaydedildi", error: "Kaydedilemedi" }[status];
  return (
    <span
      className={cn("hidden items-center gap-1.5 text-xs sm:inline-flex", status === "error" ? "text-danger" : "text-muted")}
      aria-live="polite"
      data-testid="save-status"
      title="İlerlemen bu tarayıcıda otomatik kaydedilir"
    >
      {status === "saving" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Save aria-hidden className="size-3.5" />}
      {label}
    </span>
  );
}

function RuntimeChip() {
  const snap = useRuntimeSnapshot();
  const text = { idle: "Python beklemede", loading: "Python yükleniyor", ready: "Python hazır", busy: "Python çalışıyor", error: "Python hatası" }[snap.status];
  const color = { idle: "bg-subtle", loading: "bg-warning", ready: "bg-success", busy: "bg-info", error: "bg-danger" }[snap.status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={snap.message ?? text} data-testid="runtime-status">
      <span className={cn("size-2 rounded-full", color, (snap.status === "loading" || snap.status === "busy") && "animate-pulse")} />
      <span className="hidden md:inline">{text}</span>
    </span>
  );
}

function Toolbar({ nav, onOpen }: { nav: NotebookNav; onOpen: (d: "outline" | "assistant") => void }) {
  const lesson = useNotebook((s) => s.lesson);
  const completions = useNotebook((s) => s.completions);
  const required = lesson.cells.filter((c) => c.required);
  const done = required.filter((c) => completions[c.id]).length;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:gap-3 sm:px-4">
      <Link href={nav.exitHref} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text">
        <ChevronLeft aria-hidden className="size-4" />
        <span className="hidden sm:inline">{nav.exitLabel}</span>
        <span className="sm:hidden">Çık</span>
      </Link>
      <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => onOpen("outline")} aria-label="Ders içeriğini aç">
        <ListTree aria-hidden className="size-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-bold sm:text-[15px]">{lesson.title}</h1>
        <div className="flex items-center gap-2">
          <ProgressBar value={required.length ? done / required.length : 0} label="Ders ilerlemesi" className="h-1.5 max-w-36" />
          <span className="whitespace-nowrap text-[11px] text-muted" data-testid="lesson-progress">
            {done}/{required.length} görev
          </span>
        </div>
      </div>
      <span className="hidden md:block">
        <Badge tone="brand">{LEVEL_LABELS[lesson.level]}</Badge>
      </span>
      <SaveIndicator />
      <SyncStatus className="hidden lg:inline-flex" />
      <RuntimeChip />
      <NotebookMenu />
      <Button variant="ghost" size="sm" className="xl:hidden" onClick={() => onOpen("assistant")} aria-label="Yardımcıyı aç">
        <MessageCircleQuestion aria-hidden className="size-4" />
      </Button>
    </header>
  );
}

function NotebookMenu() {
  const store = useNotebookStore();
  const runtime = useRuntime();
  const snap = useRuntimeSnapshot();
  const lesson = useNotebook((s) => s.lesson);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasCode = lesson.cells.some((c) => c.type === "code");

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && (setOpen(false), setConfirm(false));
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50";

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label="Defter menüsü">
        <MoreHorizontal aria-hidden className="size-4" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-card">
          {hasCode && (
            <button
              role="menuitem"
              type="button"
              className={item}
              disabled={runningAll}
              onClick={async () => {
                setOpen(false);
                setRunningAll(true);
                await runAllCodeCells(store, runtime);
                setRunningAll(false);
              }}
            >
              <Play aria-hidden className="size-4" /> Tüm kod hücrelerini çalıştır
            </button>
          )}
          {snap.status === "busy" && (
            <button role="menuitem" type="button" className={item} onClick={() => (runtime.stop("user"), setOpen(false))}>
              <Square aria-hidden className="size-4" /> Çalışan kodu durdur
            </button>
          )}
          {hasCode && (
            <button role="menuitem" type="button" className={item} onClick={() => (void runtime.restart(), setOpen(false))}>
              <RotateCcw aria-hidden className="size-4" /> Python ortamını sıfırla
            </button>
          )}
          <div className="my-1 border-t border-border" />
          {!confirm ? (
            <button role="menuitem" type="button" className={cn(item, "text-danger")} onClick={() => setConfirm(true)}>
              <RotateCcw aria-hidden className="size-4" /> Defteri baştan başlat…
            </button>
          ) : (
            <div className="space-y-2 p-2 text-sm">
              <p>Kodların, deneylerin ve cevapların silinir. Kazandığın görev kayıtları kalır.</p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    store.getState().resetNotebook();
                    void runtime.restart();
                    setConfirm(false);
                    setOpen(false);
                  }}
                >
                  Sıfırla
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                  Vazgeç
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Outline({ nav }: { nav: NotebookNav }) {
  const lesson = useNotebook((s) => s.lesson);
  const completions = useNotebook((s) => s.completions);
  const activeId = useNotebook((s) => s.activeCellId);
  const sections: { title: string; cells: Cell[] }[] = [];
  for (const cell of lesson.cells) {
    const title = cell.section ?? "Ders";
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.cells.push(cell);
    else sections.push({ title, cells: [cell] });
  }

  return (
    <nav className="space-y-5 p-4 text-sm">
      <div>
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <Target aria-hidden className="size-3.5" /> Öğrenme hedefleri
        </div>
        <ul className="mt-2 space-y-1.5">
          {lesson.objectives.map((o) => (
            <li key={o} className="text-[13px] leading-5">
              {o}
            </li>
          ))}
        </ul>
      </div>
      {sections.map((section, si) => (
        <div key={`${section.title}-${si}`}>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{section.title}</div>
          <ul className="mt-1.5 space-y-0.5">
            {section.cells
              .filter((c) => c.type !== "explanation" || c.variant === "default")
              .map((c) => {
                const meta = CELL_META[c.type];
                const done = !!completions[c.id];
                return (
                  <li key={c.id}>
                    <a
                      href={`#cell-${c.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2",
                        activeId === c.id && "bg-surface-2 font-semibold",
                      )}
                    >
                      {c.required ? (
                        done ? (
                          <CheckCircle2 aria-label="tamamlandı" className="size-4 shrink-0 text-success" />
                        ) : (
                          <Circle aria-label="görev" className="size-4 shrink-0 text-subtle" />
                        )
                      ) : (
                        <meta.icon aria-hidden className="size-4 shrink-0" style={{ color: meta.color }} />
                      )}
                      <span className="truncate">{c.title ?? firstHeading(c) ?? meta.label}</span>
                    </a>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      <div className="space-y-1.5 border-t border-border pt-4">
        {nav.prev && <OutlineLink href={nav.prev.href} icon={<ArrowLeft aria-hidden className="size-3.5" />} label="Önceki" title={nav.prev.title} />}
        {nav.next && <OutlineLink href={nav.next.href} icon={<ArrowRight aria-hidden className="size-3.5" />} label="Sonraki" title={nav.next.title} />}
      </div>
    </nav>
  );
}

function firstHeading(cell: Cell): string | null {
  if (cell.type !== "explanation") return null;
  return cell.markdown.match(/^#{1,3}\s+(.+)$/m)?.[1] ?? null;
}

function OutlineLink({ href, icon, label, title }: { href: string; icon: ReactNode; label: string; title: string }) {
  return (
    <Link href={href} className="block rounded-md px-2 py-1.5 hover:bg-surface-2">
      <span className="flex items-center gap-1 text-xs text-muted">
        {icon} {label}
      </span>
      <span className="block truncate font-medium">{title}</span>
    </Link>
  );
}

function LessonHeader({ nav }: { nav: NotebookNav }) {
  const lesson = useNotebook((s) => s.lesson);
  const migrated = useNotebook((s) => s.migrated);
  return (
    <div className="px-1 pb-2">
      {nav.context && <div className="text-xs font-semibold uppercase tracking-wide text-brand">{nav.context}</div>}
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{lesson.title}</h2>
      <p className="mt-2 text-muted">{lesson.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="brand">{LEVEL_LABELS[lesson.level]}</Badge>
        <Badge>~{lesson.estimatedMinutes} dakika</Badge>
        <Badge>{lesson.cells.filter((c) => c.required).length} görev</Badge>
        <LabBadges labs={lesson.labs} />
      </div>
      {migrated && (
        <Callout tone="info" className="mt-4" title="Bu ders güncellendi">
          Kaydettiğin çalışmalar, hâlâ var olan hücrelere aktarıldı. Bazı hücreler yeni olabilir.
        </Callout>
      )}
    </div>
  );
}

function LessonFooter({ nav }: { nav: NotebookNav }) {
  const lesson = useNotebook((s) => s.lesson);
  const completions = useNotebook((s) => s.completions);
  const remaining = lesson.cells.filter((c) => c.required && !completions[c.id]);

  if (remaining.length > 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong p-5 text-sm">
        <div className="font-semibold">Dersi bitirmek için kalan görevler</div>
        <ul className="mt-2 space-y-1">
          {remaining.map((c) => (
            <li key={c.id}>
              <a href={`#cell-${c.id}`} className="text-brand hover:underline">
                {c.title ?? CELL_META[c.type].label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-success/40 bg-success-soft p-5" data-testid="lesson-complete">
      <div className="flex items-center gap-2 text-lg font-bold text-success">
        <CheckCircle2 aria-hidden className="size-5" /> Ders tamamlandı
      </div>
      <p className="mt-1 text-sm">Tüm görevleri, yaptığın işlerle tamamladın. Ne öğrendiğini Başarılarım sayfasında görebilirsin.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {nav.next && <ButtonLink href={nav.next.href}>Sonraki: {nav.next.title}</ButtonLink>}
        {nav.portfolioHref && (
          <ButtonLink href={nav.portfolioHref} variant="secondary">
            Projelerime git
          </ButtonLink>
        )}
        {!nav.next && !nav.portfolioHref && (
          <ButtonLink href={nav.exitHref} variant="secondary">
            {nav.exitLabel}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
