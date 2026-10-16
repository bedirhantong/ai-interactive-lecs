import { describe, expect, it } from "vitest";
import { loadContent } from "@/lib/content/loader";
import { type Lesson, lessonSchema } from "@/lib/content/schema";
import { initialCells } from "@/lib/notebook/initial";
import { createNotebookStore } from "@/lib/notebook/store";
import type { CodeCellState, ReflectionState, SavedNotebook } from "@/lib/notebook/types";

const content = loadContent();
const lesson = content.lessons.get("python-ilk-adimlar")!;

function store(saved: SavedNotebook | null = null, l: Lesson = lesson) {
  const completed: string[] = [];
  const s = createNotebookStore({
    lesson: l,
    datasets: {},
    saved,
    sessionId: "test",
    callbacks: { onCellCompleted: (cell) => completed.push(cell.id) },
  });
  return { s, completed };
}

describe("notebook completion rules", () => {
  it("does not complete a code cell just because it exists or was edited", () => {
    const { s } = store();
    s.getState().update<CodeCellState>("ilk-kod", (c) => ({ ...c, source: c.source + "\n# değişti" }));
    expect(s.getState().completions["ilk-kod"]).toBeUndefined();
  });

  it("completes a code cell after a clean run and keeps it completed (sticky)", () => {
    const { s, completed } = store();
    s.getState().update<CodeCellState>("ilk-kod", (c) => ({ ...c, status: "done", executionCount: 1, error: null }));
    expect(s.getState().completions["ilk-kod"]?.verification).toBe("client");
    expect(completed).toEqual(["ilk-kod"]);
    s.getState().update<CodeCellState>("ilk-kod", (c) => ({ ...c, status: "error", error: { type: "NameError", message: "x", line: 1, traceback: "" } }));
    expect(s.getState().completions["ilk-kod"]).toBeDefined();
    expect(completed).toEqual(["ilk-kod"]);
  });

  it("requires a submitted reflection of the minimum length", () => {
    const { s } = store();
    s.getState().update<ReflectionState>("dusun", (c) => ({ ...c, text: "kısa", submittedText: "kısa", submittedAt: new Date().toISOString() }));
    expect(s.getState().completions["dusun"]).toBeUndefined();
    const long = "Model kuralı veriden öğrenir, insan ise kendi tecrübesiyle yazar; ikisinin de hata yapabileceği durumlar var.";
    s.getState().update<ReflectionState>("dusun", (c) => ({ ...c, text: long, submittedText: long, submittedAt: new Date().toISOString() }));
    expect(s.getState().completions["dusun"]).toBeDefined();
  });

  it("reveals hints one at a time and records the evidence", () => {
    const { s } = store();
    s.getState().revealHint("ortalama-gorevi");
    s.getState().revealHint("ortalama-gorevi");
    expect(s.getState().hintLevels["ortalama-gorevi"]).toBe(2);
    expect(s.getState().evidence.filter((e) => e.kind === "hint-revealed")).toHaveLength(2);
  });
});

describe("saved notebooks across lesson versions", () => {
  it("restores state for unchanged cells and settles interrupted runs", () => {
    const cells = initialCells(lesson);
    const code = cells["ilk-kod"] as CodeCellState;
    const saved: SavedNotebook = {
      schema: 1,
      lessonId: lesson.id,
      lessonVersion: lesson.version,
      savedAt: new Date().toISOString(),
      cells: { ...cells, "ilk-kod": { ...code, source: "print('benim kodum')", status: "running" } },
      completions: { "ilk-kod": { at: "2026-01-01T00:00:00Z", evidence: "x", verification: "client" } },
      hintLevels: {},
      evidence: [],
    };
    const { s } = store(saved);
    const restored = s.getState().cells["ilk-kod"] as CodeCellState;
    expect(restored.source).toBe("print('benim kodum')");
    expect(restored.status).toBe("idle");
    expect(s.getState().completions["ilk-kod"]).toBeDefined();
    expect(s.getState().migrated).toBe(false);
  });

  it("migrates to a newer version: keeps matching cells, drops removed ones, flags the change", () => {
    const raw = JSON.parse(JSON.stringify(lesson));
    const v2 = lessonSchema.parse({
      ...raw,
      version: lesson.version + 1,
      cells: raw.cells.filter((c: { id: string }) => c.id !== "serbest-alan"),
    });
    const cells = initialCells(lesson);
    const saved: SavedNotebook = {
      schema: 1,
      lessonId: lesson.id,
      lessonVersion: lesson.version,
      savedAt: "",
      cells: { ...cells, "ilk-kod": { ...(cells["ilk-kod"] as CodeCellState), source: "x = 1" } },
      completions: { "serbest-alan": { at: "", evidence: "", verification: "client" } },
      hintLevels: {},
      evidence: [],
    };
    const { s } = store(saved, v2);
    expect(s.getState().migrated).toBe(true);
    expect((s.getState().cells["ilk-kod"] as CodeCellState).source).toBe("x = 1");
    expect(s.getState().cells["serbest-alan"]).toBeUndefined();
    expect(s.getState().completions["serbest-alan"]).toBeUndefined();
  });
});

describe("evidence callbacks", () => {
  it("reports completion events to onEvidence (they feed the teacher's view)", async () => {
    const lesson = loadContent().lessons.get("python-ilk-adimlar")!;
    const seen: string[] = [];
    const store = createNotebookStore({ lesson, datasets: {}, saved: null, sessionId: "s", callbacks: { onEvidence: (e) => seen.push(`${e.kind}:${e.cellId}`) } });
    store.getState().update("dusun", (s) => ({ ...s, submittedText: "x".repeat(80), submittedAt: "2026-10-16T10:00:00Z", text: "x".repeat(80) }));
    expect(seen).toContain("cell-completed:dusun");
  });
});
