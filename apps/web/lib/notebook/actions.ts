/**
 * Notebook actions that talk to the Python runtime. Outputs are streamed into
 * the store as they arrive; nothing is ever faked.
 */
import type { CodeChallenge } from "@/lib/content/schema";
import type { PythonRuntime } from "@/lib/runtime/python-runtime";
import type { NotebookStore } from "./store";
import type { ChallengeState, CodeCellState, ExecState, LinregState, OutputChunk, TrainingState } from "./types";

const MAX_CHUNKS = 400;

function appendOutput(outputs: OutputChunk[], chunk: OutputChunk): OutputChunk[] {
  const last = outputs[outputs.length - 1];
  if (last && last.stream === chunk.stream) {
    return [...outputs.slice(0, -1), { ...last, text: last.text + chunk.text }];
  }
  return outputs.length >= MAX_CHUNKS ? outputs : [...outputs, chunk];
}

/** Lens into the ExecState of a cell (code cell, editable copy, or challenge). */
interface ExecLens {
  get: () => ExecState;
  patch: (fn: (exec: ExecState) => ExecState) => void;
}

async function execute(
  store: NotebookStore,
  runtime: PythonRuntime,
  cellId: string,
  code: string,
  lens: ExecLens,
  timeoutMs: number,
): Promise<boolean> {
  const s = store.getState();
  const count = s.nextExecutionCount();
  lens.patch((e) => ({ ...e, status: "running", outputs: [], error: null, durationMs: null, sessionId: s.sessionId }));
  const push = (chunk: OutputChunk) => lens.patch((e) => ({ ...e, outputs: appendOutput(e.outputs, chunk) }));

  const result = await runtime.run(code, {
    timeoutMs,
    onStream: (stream, text) => push({ stream, text }),
    onPackage: (message) => push({ stream: "info", text: message + "\n" }),
  });

  if (result.ok && result.value !== null) push({ stream: "result", text: result.value });
  lens.patch((e) => ({
    ...e,
    status: result.ok ? "done" : "error",
    error: result.error ?? null,
    executionCount: count,
    durationMs: result.durationMs,
  }));
  if (!result.ok && result.error) store.getState().setLastError({ cellId, error: result.error, code });
  else if (store.getState().lastError?.cellId === cellId) store.getState().setLastError(null);
  return result.ok;
}

export async function runCodeCell(store: NotebookStore, runtime: PythonRuntime, cellId: string, timeoutSeconds = 20) {
  const state = store.getState().cells[cellId] as CodeCellState | undefined;
  if (state?.kind !== "code") return false;
  const hadError = state.status === "error";
  const lens: ExecLens = {
    get: () => store.getState().cells[cellId] as CodeCellState,
    patch: (fn) => store.getState().update<CodeCellState>(cellId, (c) => ({ ...c, ...fn(c) })),
  };
  const ok = await execute(store, runtime, cellId, state.source, lens, timeoutSeconds * 1000);
  const { addEvidence, update } = store.getState();
  if (ok && hadError) {
    update<CodeCellState>(cellId, (c) => ({ ...c, recoveredFromError: true }));
    addEvidence(cellId, "error-fixed", "Hata veren kodu düzeltip çalıştırdı");
  } else {
    addEvidence(cellId, "code-run", ok ? "Kod hatasız çalıştı" : `Hata: ${lens.get().error?.type ?? "?"}`);
  }
  return ok;
}

/** Run the editable copy of generated code inside an experiment or training cell. */
export async function runEditableCode(store: NotebookStore, runtime: PythonRuntime, cellId: string) {
  const cell = store.getState().cells[cellId];
  if (cell?.kind !== "linreg" && cell?.kind !== "training") return false;
  const code = cell.code;
  const lens: ExecLens = {
    get: () => (store.getState().cells[cellId] as LinregState | TrainingState).code,
    patch: (fn) =>
      store.getState().update<LinregState | TrainingState>(cellId, (c) => ({ ...c, code: { ...c.code, ...fn(c.code) } })),
  };
  const ok = await execute(store, runtime, cellId, code.source, lens, 20000);
  store.getState().addEvidence(cellId, "code-run", code.source === code.base ? "Üretilen kodu çalıştırdı" : "Kendi düzenlediği kodu çalıştırdı");
  return ok;
}

const challengeLens = (store: NotebookStore, cellId: string): ExecLens => ({
  get: () => store.getState().cells[cellId] as ChallengeState,
  patch: (fn) => store.getState().update<ChallengeState>(cellId, (c) => ({ ...c, ...fn(c) })),
});

/** Run a challenge's code like a normal cell (shared namespace), without grading. */
export async function runChallengeCode(store: NotebookStore, runtime: PythonRuntime, cellId: string) {
  const state = store.getState().cells[cellId] as ChallengeState;
  return execute(store, runtime, cellId, state.code, challengeLens(store, cellId), 20000);
}

/**
 * Grade a code challenge: student code + tests run in a fresh, isolated
 * namespace inside the browser runtime. On success the student's code is
 * also run (silently) in the shared namespace so later cells can use it.
 */
export async function checkChallenge(
  store: NotebookStore,
  runtime: PythonRuntime,
  cellId: string,
  challenge: CodeChallenge,
) {
  const state = store.getState().cells[cellId] as ChallengeState;
  const code = state.code;
  const lens = challengeLens(store, cellId);
  lens.patch((e) => ({ ...e, status: "running", outputs: [], error: null }));
  const push = (chunk: OutputChunk) => lens.patch((e) => ({ ...e, outputs: appendOutput(e.outputs, chunk) }));

  const result = await runtime.runTests(
    code,
    challenge.tests.map((t) => ({ name: t.name, code: t.code })),
    { timeoutMs: 20000, onStream: (stream, text) => push({ stream, text }), onPackage: (m) => push({ stream: "info", text: m + "\n" }) },
  );
  const passed = result.ok && result.tests.length > 0 && result.tests.every((t) => t.passed);
  const { update, addEvidence, setLastError, sessionId } = store.getState();
  update<ChallengeState>(cellId, (c) => ({
    ...c,
    status: result.ok ? "done" : "error",
    error: result.error ?? null,
    durationMs: result.durationMs,
    sessionId,
    attempts: c.attempts + 1,
    tests: result.tests,
    passed: c.passed || passed,
    passedAt: c.passedAt ?? (passed ? new Date().toISOString() : null),
  }));
  const failed = result.tests.filter((t) => !t.passed).length;
  addEvidence(
    cellId,
    passed ? "challenge-passed" : "challenge-attempt",
    passed ? "Tüm testler geçti" : result.ok ? `${failed} test başarısız` : `Kod hata verdi: ${result.error?.type}`,
  );
  if (!result.ok && result.error) setLastError({ cellId, error: result.error, code });
  else if (store.getState().lastError?.cellId === cellId) setLastError(null);
  if (passed) await runtime.run(code, { silent: true, timeoutMs: 20000 });
  return passed;
}

/** Run every code cell from the top, stopping at the first error. */
export async function runAllCodeCells(store: NotebookStore, runtime: PythonRuntime) {
  const { lesson } = store.getState();
  for (const cell of lesson.cells) {
    if (cell.type !== "code") continue;
    const ok = await runCodeCell(store, runtime, cell.id, cell.timeoutSeconds);
    if (!ok) return { ok: false, failedCellId: cell.id };
  }
  return { ok: true, failedCellId: null };
}
