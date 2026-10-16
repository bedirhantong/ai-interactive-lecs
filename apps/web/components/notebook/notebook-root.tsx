"use client";

import { useEffect, useState } from "react";
import type { Cell, ColabTemplate, Lesson } from "@/lib/content/schema";
import { lessonNeedsPythonRuntime } from "@/lib/labs";
import type { DatasetMap } from "@/lib/notebook/initial";
import { buildPortfolioEntry } from "@/lib/notebook/portfolio";
import { type NotebookStore, createNotebookStore } from "@/lib/notebook/store";
import type { Completion, EvidenceKind, SavedNotebook } from "@/lib/notebook/types";
import { useProgress } from "@/lib/progress/store";
import { PYODIDE_INDEX_URL, PYTHON_WORKER_URL } from "@/lib/runtime/config";
import { PythonRuntime } from "@/lib/runtime/python-runtime";
import { notebookKey, readJson, writeJson } from "@/lib/storage";
import { useIsClient } from "@/lib/use-is-client";
import { NotebookContext } from "./context";
import { NotebookLayout, type NotebookNav } from "./notebook-layout";

const FEED_KINDS = new Set<EvidenceKind>(["error-fixed", "challenge-passed", "model-trained", "lesson-completed"]);

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function onCellCompleted(lesson: Lesson, store: NotebookStore, cell: Cell, completion: Completion) {
  const progress = useProgress.getState();
  const requiredIds = lesson.cells.filter((c) => c.required).map((c) => c.id);
  const { lessonCompleted } = progress.recordCompletion({
    lessonId: lesson.id,
    cellId: cell.id,
    required: cell.required,
    evidence: completion.evidence,
    skills: cell.skills,
    at: completion.at,
    requiredIds,
  });
  if (lessonCompleted) store.getState().addEvidence(cell.id, "lesson-completed", lesson.title);
  const lessonProgress = useProgress.getState().lessons[lesson.id];
  if (lessonProgress?.completedAt) {
    const entry = buildPortfolioEntry(lesson, store.getState().cells, lessonProgress.completedAt);
    if (entry) progress.upsertPortfolio(entry);
  }
}

interface NotebookProps {
  lesson: Lesson;
  datasets: DatasetMap;
  colabTemplates: Record<string, ColabTemplate>;
  nav: NotebookNav;
}

function ClientNotebook({ lesson, datasets, colabTemplates, nav }: NotebookProps) {
  const [store] = useState(() => {
    const saved = readJson<SavedNotebook>(notebookKey(lesson.id));
    const usable = saved && saved.schema === 1 && saved.lessonId === lesson.id ? saved : null;
    const created: NotebookStore = createNotebookStore({
      lesson,
      datasets,
      colabTemplates,
      saved: usable,
      sessionId: newSessionId(),
      callbacks: {
        onCellCompleted: (cell, completion) => onCellCompleted(lesson, created, cell, completion),
        onEvidence: (event) => {
          if (FEED_KINDS.has(event.kind)) useProgress.getState().recordEvent(event);
        },
      },
    });
    return created;
  });

  const [runtime] = useState(
    () =>
      new PythonRuntime({
        indexURL: PYODIDE_INDEX_URL,
        workerURL: PYTHON_WORKER_URL,
        files: lesson.datasets.map((id) => ({ path: `/data/${datasets[id].file}`, content: datasets[id].csv })),
      }),
  );

  // Register the visit in the progress store (after it has loaded from storage).
  useEffect(() => {
    void Promise.resolve(useProgress.persist.rehydrate()).then(() => {
      useProgress.getState().openLesson(lesson.id, lesson.version, lesson.cells.filter((c) => c.required).length);
    });
  }, [lesson]);

  // Preload Python in the background so the first run feels instant.
  useEffect(() => {
    const timer = lessonNeedsPythonRuntime(lesson) ? setTimeout(() => runtime.start().catch(() => undefined), 600) : null;
    return () => {
      if (timer) clearTimeout(timer);
      runtime.dispose();
    };
  }, [lesson, runtime]);

  // Debounced autosave of meaningful changes (not every keystroke).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      timer = null;
      const ok = writeJson(notebookKey(lesson.id), store.getState().toSaved());
      store.getState().setSaveStatus(ok ? "saved" : "error", new Date().toISOString());
    };
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.cells === prev.cells && s.completions === prev.completions && s.hintLevels === prev.hintLevels && s.evidence === prev.evidence) {
        return;
      }
      if (s.saveStatus !== "saving") s.setSaveStatus("saving");
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 700);
    });
    const flush = () => {
      if (timer) {
        clearTimeout(timer);
        save();
      }
    };
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lesson.id, store]);

  return (
    <NotebookContext.Provider value={{ store, runtime }}>
      <NotebookLayout nav={nav} />
    </NotebookContext.Provider>
  );
}

export function NotebookRoot(props: NotebookProps) {
  const isClient = useIsClient();
  if (!isClient) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted" aria-busy="true">
        Defter hazırlanıyor…
      </div>
    );
  }
  return <ClientNotebook {...props} />;
}
