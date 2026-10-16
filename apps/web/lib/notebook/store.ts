/**
 * Per-notebook state store. One store is created for each open lesson.
 * Pure state + completion logic lives here; runtime calls live in actions.ts.
 */
import { createStore } from "zustand/vanilla";
import type { Cell, ColabTemplate, Lesson } from "@/lib/content/schema";
import type { RunError } from "@/lib/runtime/protocol";
import { checkCell } from "./completion";
import { type DatasetMap, initialCellState, initialCells, restoreCells } from "./initial";
import type { CellState, Completion, EvidenceEvent, EvidenceKind, SavedNotebook } from "./types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface NotebookCallbacks {
  onCellCompleted?: (cell: Cell, completion: Completion) => void;
  onEvidence?: (event: EvidenceEvent) => void;
}

export interface NotebookState {
  lesson: Lesson;
  datasets: DatasetMap;
  colabTemplates: Record<string, ColabTemplate>;
  sessionId: string;
  cells: Record<string, CellState>;
  completions: Record<string, Completion>;
  hintLevels: Record<string, number>;
  evidence: EvidenceEvent[];
  migrated: boolean;
  activeCellId: string | null;
  lastError: { cellId: string; error: RunError; code: string } | null;
  executionCounter: number;
  saveStatus: SaveStatus;
  savedAt: string | null;

  setActive: (cellId: string) => void;
  update: <T extends CellState>(cellId: string, updater: (state: T) => T) => void;
  addEvidence: (cellId: string, kind: EvidenceKind, detail: string) => void;
  revealHint: (cellId: string) => void;
  setLastError: (value: NotebookState["lastError"]) => void;
  nextExecutionCount: () => number;
  resetCell: (cellId: string) => void;
  resetNotebook: () => void;
  setSaveStatus: (status: SaveStatus, savedAt?: string) => void;
  toSaved: () => SavedNotebook;
}

const MAX_EVIDENCE = 200;

export function createNotebookStore(opts: {
  lesson: Lesson;
  datasets: DatasetMap;
  colabTemplates?: Record<string, ColabTemplate>;
  saved: SavedNotebook | null;
  sessionId: string;
  callbacks?: NotebookCallbacks;
}) {
  const { lesson, datasets, saved, sessionId, callbacks = {}, colabTemplates = {} } = opts;
  const { cells, migrated } = restoreCells(lesson, saved);
  const cellIds = new Set(lesson.cells.map((c) => c.id));
  const keep = <V>(record: Record<string, V> | undefined) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => cellIds.has(id)));

  return createStore<NotebookState>()((set, get) => {
    const event = (cellId: string, kind: EvidenceKind, detail: string): EvidenceEvent => ({
      at: new Date().toISOString(),
      lessonId: lesson.id,
      cellId,
      kind,
      detail,
    });

    /** Award completions that are newly earned. Completions are sticky. */
    const syncCompletions = () => {
      const s = get();
      const added: [Cell, Completion][] = [];
      for (const cell of lesson.cells) {
        if (s.completions[cell.id]) continue;
        const check = checkCell(cell, s.cells, lesson, datasets);
        if (check?.done) {
          added.push([cell, { at: new Date().toISOString(), evidence: check.evidence, verification: "client" }]);
        }
      }
      if (added.length === 0) return;
      const events = added.map(([cell, c]) => event(cell.id, "cell-completed", c.evidence));
      set({
        completions: { ...s.completions, ...Object.fromEntries(added.map(([cell, c]) => [cell.id, c])) },
        evidence: [...s.evidence, ...events].slice(-MAX_EVIDENCE),
      });
      for (const e of events) callbacks.onEvidence?.(e); // e.g. queued for the teacher's view when signed in
      for (const [cell, c] of added) callbacks.onCellCompleted?.(cell, c);
    };

    return {
      lesson,
      datasets,
      colabTemplates,
      sessionId,
      cells,
      completions: keep(saved?.completions),
      hintLevels: keep(saved?.hintLevels),
      evidence: saved?.evidence ?? [],
      migrated,
      activeCellId: null,
      lastError: null,
      executionCounter: 0,
      saveStatus: saved ? "saved" : "idle",
      savedAt: saved?.savedAt ?? null,

      setActive: (cellId) => {
        if (get().activeCellId !== cellId) set({ activeCellId: cellId });
      },

      update: (cellId, updater) => {
        const current = get().cells[cellId];
        if (!current) return;
        const next = updater(current as never);
        if (next === current) return;
        set((s) => ({ cells: { ...s.cells, [cellId]: next } }));
        syncCompletions();
      },

      addEvidence: (cellId, kind, detail) => {
        const e = event(cellId, kind, detail);
        set((s) => ({ evidence: [...s.evidence, e].slice(-MAX_EVIDENCE) }));
        callbacks.onEvidence?.(e);
      },

      revealHint: (cellId) => {
        const cell = lesson.cells.find((c) => c.id === cellId);
        const level = get().hintLevels[cellId] ?? 0;
        if (!cell || level >= cell.hints.length) return;
        set((s) => ({ hintLevels: { ...s.hintLevels, [cellId]: level + 1 } }));
        get().addEvidence(cellId, "hint-revealed", `${level + 1}. ipucu`);
      },

      setLastError: (value) => set({ lastError: value }),

      nextExecutionCount: () => {
        const n = get().executionCounter + 1;
        set({ executionCounter: n });
        return n;
      },

      resetCell: (cellId) => {
        const cell = lesson.cells.find((c) => c.id === cellId);
        const fresh = cell ? initialCellState(cell) : null;
        if (!fresh) return;
        set((s) => ({ cells: { ...s.cells, [cellId]: fresh } }));
      },

      /** Clears the student's work in this notebook. Earned completions stay in the evidence log. */
      resetNotebook: () => set({ cells: initialCells(lesson), hintLevels: {}, lastError: null }),

      setSaveStatus: (status, savedAt) => set({ saveStatus: status, ...(savedAt ? { savedAt } : {}) }),

      toSaved: () => {
        const s = get();
        return {
          schema: 1,
          lessonId: lesson.id,
          lessonVersion: lesson.version,
          savedAt: new Date().toISOString(),
          cells: s.cells,
          completions: s.completions,
          hintLevels: s.hintLevels,
          evidence: s.evidence,
        };
      },
    };
  });
}

export type NotebookStore = ReturnType<typeof createNotebookStore>;
